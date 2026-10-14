// The navigation engine (docs/design/21 §3 intro, §4.5.2). A plain module with no React: it takes position
// fixes through `ingest(fix)`, runs progress, off-route, reroute and arrival, and publishes its state for the UI
// to read. It must not depend on a mounted component, because the background location task feeds it too (P3).
//
// Feeding it:
//   foreground  - hooks/use-nav-position.ts calls `navSession.ingest(fix)` for each 1 Hz watch fix;
//   background  - lib/location/background-task.ts calls the same `navSession.ingest(fix)` for each task fix.
// Voice (nav-voice.ts, speech.ts) runs inside `ingest`, after progress and arrival: prompts are driven by fixes.
// `ingest` ignores a fix whose timestamp is not newer than the last one, so both sources can run together,
// and it does nothing at all while no session is running (a headless relaunch has none).
//
// All decisions (step advance, off-route, reroute timing, arrival) live in pure functions
// (nav-progress.ts, nav-arrival.ts); this file only sequences them and owns the one request in flight.
import { t } from '@/lib/copy';
import { destKey, nextLatch, NO_ARRIVAL, type ArrivalLatch } from '@/lib/nav-arrival';
import { EMPTY_ENGINE, type NavEngineState } from '@/lib/nav-engine';
import {
  gpsLost,
  initProgress,
  isGoodFix,
  onFinalStep,
  prepareRoute,
  remainingAlongM,
  shouldFetchNavRoute,
  startBearing,
  stepProgress,
  type NavFix,
  type PreparedRoute,
  type Progress,
} from '@/lib/nav-progress';
import type { LatLng } from '@/lib/geo';
import { fetchNavRouteResult, type NavRoute, type NavRouteOptions, type NavRouteResult } from '@/lib/nav-route';
import { voiceText } from '@/lib/nav-instructions';
import { INITIAL_VOICE, planVoice, PROMPT_FIX_MAX_AGE_MS, type VoicePrompt, type VoiceState } from '@/lib/nav-voice';
import * as speech from '@/lib/speech';
import { readItem, STORAGE_KEYS } from '@/lib/storage';
import { arrivalForRide, useNavStore } from '@/store/nav-store';

/** The speech engine the session talks to (lib/speech.ts in the app; a fake in tests). */
export interface NavVoice {
  /** Navigation session start: set up the audio session once (iOS). */
  prepare(): void;
  /** Speaks, cutting off what is being said. `valid` is asked again just before it plays. Never rejects. */
  say(text: string, valid: () => boolean): Promise<speech.SayResult>;
  /** Stops speaking now. */
  hush(): void;
  /** The session is over: stop and release the audio session. */
  teardown(): void;
  /** Clock beat (2 s): gives the audio session back if nothing is being said (iOS; an interruption can reactivate it). */
  releaseIfIdle(): void;
}

export interface NavSessionDeps {
  /** Epoch ms. */
  now: () => number;
  fetchRoute: (from: LatLng, to: LatLng, opts: NavRouteOptions, signal: AbortSignal) => Promise<NavRouteResult>;
  /** Hands every new state to whoever renders it (nav-store). */
  publish: (state: NavEngineState) => void;
  /** Expressway avoidance, read at fetch time (the preview's choice, else the saved preference). */
  readAvoid: () => boolean;
  /** The arrival latch for the ride (nav-store keeps it, and persists an "arrived" one). */
  getLatch: (rideId: string) => ArrivalLatch;
  setLatch: (rideId: string, latch: ArrivalLatch) => void;
  voice: NavVoice;
}

/** Side effects the app wires in (telemetry, haptics), so this module stays free of app services. */
export interface NavSessionEffects {
  /** Told once per arrival; the app announces it (haptic + telemetry) through one shared claim (L3). */
  onArrived?: (info: { rideId: string; key: string }) => void;
  onRerouted?: () => void;
  onRouteFailed?: (code: 'no_route' | 'failed') => void;
  /** A prompt was dropped because the audio session could not start (a call, Siri, another app's audio). */
  onVoiceSkipped?: () => void;
}

export interface NavSessionStart {
  rideId: string;
  dest: LatLng;
  /** The destination's name, for the spoken prompts ("Route to …", "You've arrived at …"). */
  place?: string;
  /** The preview's route for this destination, used as just fetched (no request until I am off it). */
  seed?: NavRoute | null;
  /** A position to route from at once when there is no seed and no fix yet (the server echo, say). */
  origin?: LatLng | null;
  /** The phone has no network right now: no request goes out until `setOffline(false)`. Left out: unchanged. */
  offline?: boolean;
}

export interface NavSession {
  start(o: NavSessionStart): void;
  /**
   * Ends the session. Soft (default): an arrival prompt that is still being spoken is allowed to finish. `hard`
   * (End ride, `stopRideTracking`): all speech stops at once.
   */
  stop(o?: { hard?: boolean }): void;
  /** Returns true when the fix was used; false when ignored (no session, an old or duplicate timestamp, bad data). */
  ingest(fix: NavFix): boolean;
  /**
   * Network state: while offline no route is fetched. Coming back online allows one immediate attempt (after a
   * success, or the first reconnect since one); failures are kept, so a flapping network cannot beat the backoff.
   */
  setOffline(offline: boolean): void;
  /** The app is in front again after a pause (no fixes meanwhile): restarts the GPS-lost clock. */
  resume(): void;
  setEffects(effects: NavSessionEffects | null): void;
  /**
   * Voice must be silent (muted, or an SOS is on: `voiceBlocked`). Turning it on stops the current prompt; stages
   * keep advancing meanwhile, so nothing is replayed when it ends.
   */
  setVoiceBlocked(blocked: boolean): void;
  /** The rider tapped the banner: say the current instruction again (now-form). Silent while muted or in an SOS. */
  repeat(): void;
  /** A clock beat from the foreground (no fix needed): lets "GPS signal lost" be said when fixes stop. */
  tick(): void;
  getState(): NavEngineState;
}

const validFix = (f: NavFix): boolean =>
  Number.isFinite(f.lat) && Number.isFinite(f.lng) && Number.isFinite(f.t) && Math.abs(f.lat) <= 90 && Math.abs(f.lng) <= 180;

/** A fix dated further ahead than this is a bad clock or a bad source; it would freeze the dedupe key. */
export const FUTURE_FIX_MAX_MS = 30_000;

export function createNavSession(deps: NavSessionDeps): NavSession {
  let state: NavEngineState = EMPTY_ENGINE;
  let effects: NavSessionEffects | null = null;
  let routeSeq = 0;
  let lastFixT = -Infinity;
  let lastFetchAt = -Infinity;
  let lastRequestAt = -Infinity;
  let failures = 0;
  let offline = false;
  // The one immediate retry a reconnect grants; used up until a request succeeds (a flapping network must not beat the backoff).
  let reconnectUsed = false;
  let controller: AbortController | null = null;
  // A bad `bearings` value answers 400: after a failure that carried one, retries go without.
  let bearingOk = true;
  // Voice (21 §4.2): the schedule's state, whether a prompt is being spoken, and whether voice must be silent.
  let vs: VoiceState = INITIAL_VOICE;
  let blocked = false;
  let speaking = false;
  let speakSeq = 0;
  // The "arrived" prompt is still being spoken: a soft `stop` (the layout noticing arrival) lets it finish.
  let arrivalSpeaking = false;

  let place = '';
  const placeName = () => place || t('nav.say.placeFallback');

  function speak(text: string, valid: () => boolean, onEnd?: () => void): void {
    const seq = ++speakSeq;
    speaking = true;
    const done = () => {
      if (seq === speakSeq) speaking = false;
      onEnd?.();
    };
    deps.voice
      .say(text, valid)
      .then((r) => {
        done();
        if (r === 'skipped') effects?.onVoiceSkipped?.();
      })
      .catch(done);
  }

  /** Runs the prompt schedule for the moment; `fix` is null on a clock beat (only GPS-lost / reroute can speak then). */
  function runVoice(fix: NavFix | null): void {
    if (!state.active || !state.dest) return;
    const now = deps.now();
    const key = state.key;
    let result;
    try {
      result = planVoice(vs, {
        now,
        // A good fix that is also fresh: one delivered late (background batch) is not where the rider is now.
        goodFix: !!fix && isGoodFix(fix.accuracyM) && now - fix.t <= PROMPT_FIX_MAX_AGE_MS,
        speedMps: fix ? fix.speedMps : null,
        prepared: state.prepared,
        progress: state.progress,
        place: placeName(),
        offline,
        gpsLost: gpsLost(state.lastGoodFixAt, state.startedAt, now),
        blocked,
        speaking,
      });
    } catch {
      return;
    }
    vs = result.state;
    const p: VoicePrompt | null = result.prompt;
    if (!p) return;
    const routeId = state.progress?.routeId;
    const idx = state.progress?.idx;
    // A prompt is dropped if, by the time the audio session is ready, it is out of date (never spoken late).
    const stillWanted = () => {
      if (blocked || !state.active || state.key !== key) return false;
      if (p.kind === 'maneuver') return state.progress?.routeId === routeId && state.progress?.idx === idx;
      return true;
    };
    speak(p.text, stillWanted);
  }

  const set = (patch: Partial<NavEngineState>) => {
    state = { ...state, ...patch };
    deps.publish(state);
  };

  function applyRoute(route: NavRoute | null, fix: NavFix | null): void {
    if (!route) return;
    const prepared: PreparedRoute = prepareRoute(route, ++routeSeq);
    let progress: Progress = initProgress(prepared.id);
    // The new line starts where I was when it was asked for; the rider has moved on since.
    if (fix) progress = stepProgress(progress, fix, prepared, deps.now());
    state = { ...state, prepared, progress, routeStatus: 'ok' };
  }

  /**
   * A request failed. One that carried `bearings` may have failed because of them (NoSegment, a 400): the next try
   * goes without, after the 1 s gap and without counting a failure. Any other failure lengthens the backoff.
   */
  function failed(hadBearing: boolean): void {
    if (hadBearing) {
      bearingOk = false;
      lastFetchAt = -Infinity;
      return;
    }
    failures += 1;
  }

  function maybeFetch(fix: NavFix | null): void {
    if (!state.active || !state.dest || !fix) return;
    const from = fix;
    const now = deps.now();
    const hasRoute = state.prepared !== null;
    if (
      !shouldFetchNavRoute({
        hasRoute,
        offRoute: !!state.progress?.offRoute,
        lastFetchAt,
        lastRequestAt,
        failures,
        inFlight: controller !== null,
        now,
        offline,
      })
    ) {
      return;
    }
    const ctl = new AbortController();
    controller = ctl;
    lastFetchAt = now;
    lastRequestAt = now;
    const key = state.key;
    const bearing = bearingOk ? startBearing(fix) : null;
    const reroute = hasRoute;
    // A retry keeps showing "unavailable" instead of flicking back to "starting" on every attempt.
    set({ fetching: true, routeStatus: hasRoute || failures > 0 ? state.routeStatus : 'loading' });
    deps
      .fetchRoute(
        { lat: from.lat, lng: from.lng },
        state.dest,
        // noCache: a reroute is for where I am now; the 3 dp cache cell is ~100 m wide.
        { steps: true, avoidMotorways: deps.readAvoid(), bearingDeg: bearing, noCache: true },
        ctl.signal,
      )
      .then((result) => {
        // Stopped, or the destination changed, while it was out: the answer is for nobody.
        if (controller !== ctl || ctl.signal.aborted || !state.active || state.key !== key) return;
        controller = null;
        if (result.status === 'ok') {
          failures = 0;
          bearingOk = true;
          reconnectUsed = false;
          applyRoute(result.route, state.fix);
          set({ fetching: false });
          if (reroute) effects?.onRerouted?.();
          return;
        }
        failed(bearing !== null);
        // Keep the old line on a failed reroute: better than none.
        set({ fetching: false, routeStatus: state.prepared ? 'ok' : 'unavailable' });
        effects?.onRouteFailed?.(result.status === 'no_route' ? 'no_route' : 'failed');
      })
      .catch(() => {
        if (controller !== ctl) return;
        controller = null;
        failed(bearing !== null);
        set({ fetching: false, routeStatus: state.prepared ? 'ok' : 'unavailable' });
        effects?.onRouteFailed?.('failed');
      });
  }

  return {
    start({ rideId, dest, place: startPlace = '', seed = null, origin = null, offline: startOffline }) {
      controller?.abort();
      controller = null;
      // A destination replaced mid-speech: the old prompt is cut and the stages start over.
      deps.voice.hush();
      speaking = false;
      arrivalSpeaking = false;
      vs = INITIAL_VOICE;
      deps.voice.prepare();
      place = startPlace;
      const now = deps.now();
      routeSeq += 1;
      lastFixT = -Infinity;
      failures = 0;
      bearingOk = true;
      reconnectUsed = false;
      // Told up front: the network effect runs after this and must not see a request already on its way.
      if (startOffline !== undefined) offline = startOffline;
      // A seeded route counts as just fetched: no request until I am off it. Otherwise the first request is at once.
      lastFetchAt = seed ? now : -Infinity;
      lastRequestAt = -Infinity;
      state = {
        ...EMPTY_ENGINE,
        active: true,
        rideId,
        key: destKey(dest),
        dest,
        startedAt: now,
        routeStatus: seed ? 'ok' : 'loading',
      };
      if (seed) applyRoute(seed, null);
      deps.publish(state);
      if (!seed && origin) {
        maybeFetch({ lat: origin.lat, lng: origin.lng, accuracyM: null, speedMps: null, courseDeg: null, t: now });
      }
    },

    stop(o) {
      controller?.abort();
      controller = null;
      lastFixT = -Infinity;
      // Everything stops with the session, except an arrival prompt on its way out (unless the ride is ending).
      if (o?.hard || !arrivalSpeaking) {
        deps.voice.teardown();
        arrivalSpeaking = false;
      }
      speaking = false;
      vs = INITIAL_VOICE;
      if (state === EMPTY_ENGINE) return;
      state = EMPTY_ENGINE;
      deps.publish(state);
    },

    ingest(fix) {
      const rideId = state.rideId;
      if (!state.active || !state.dest || !rideId || !validFix(fix)) return false;
      // A fix from the future would make every real one look old (L5): refuse it without touching the dedupe key.
      if (fix.t > deps.now() + FUTURE_FIX_MAX_MS) return false;
      // Two sources (the foreground watch and the background task) may deliver the same fix.
      if (fix.t <= lastFixT) return false;
      lastFixT = fix.t;
      const now = deps.now();
      let progress = state.progress;
      if (state.prepared && progress) progress = stepProgress(progress, fix, state.prepared, now);
      state = { ...state, fix, progress, lastGoodFixAt: isGoodFix(fix.accuracyM) ? now : state.lastGoodFixAt };

      // Arrival (§3.9): latched per destination; nothing is acted on beyond telling the UI.
      const prev = deps.getLatch(rideId);
      const announced = state.prepared?.announced;
      const arriveAt = announced ? announced[announced.length - 1].location : null;
      const latch = nextLatch(prev.key === state.key ? prev : NO_ARRIVAL, state.dest, {
        me: fix,
        accuracyM: fix.accuracyM,
        arriveAt,
        remainingAlongM: state.prepared && progress ? remainingAlongM(progress, state.prepared) : null,
        onFinalStep: state.prepared && progress ? onFinalStep(progress, state.prepared) : false,
      });
      if (latch.state === 'arrived' && prev.state !== 'arrived') {
        deps.setLatch(rideId, latch);
        // Arrived: the engine goes idle (no more guidance, no reroute) until a new destination starts it.
        controller?.abort();
        controller = null;
        const arrivedText = t('nav.say.arrived', { place: placeName() });
        state = EMPTY_ENGINE;
        deps.publish(state);
        effects?.onArrived?.({ rideId, key: latch.key });
        // Said once, then the audio session is released. Muted or in an SOS: nothing is said (and nothing later).
        if (!blocked) {
          arrivalSpeaking = true;
          speak(arrivedText, () => !blocked, () => {
            arrivalSpeaking = false;
            // The layout stopped the session while this was being said: release it now.
            if (!state.active) deps.voice.teardown();
          });
        } else {
          deps.voice.teardown();
        }
        vs = INITIAL_VOICE;
        return true;
      }

      deps.publish(state);
      // Prompts come after progress and arrival, driven by this fix (no timers), before the network is touched.
      runVoice(fix);
      maybeFetch(fix);
      return true;
    },

    setOffline(next) {
      if (next === offline) return;
      offline = next;
      if (!next) {
        // Back online: one immediate attempt per run of failures (still 1 request/s at most); after that the backoff.
        if (!reconnectUsed) {
          lastFetchAt = -Infinity;
          reconnectUsed = true;
        }
        if (state.active) maybeFetch(state.fix);
      }
    },

    resume() {
      if (!state.active) return;
      set({ startedAt: deps.now() });
    },

    setEffects(next) {
      effects = next;
    },

    setVoiceBlocked(next) {
      if (next === blocked) return;
      blocked = next;
      if (next) {
        deps.voice.hush();
        speaking = false;
        speakSeq += 1;
      }
    },

    tick() {
      deps.voice.releaseIfIdle();
      runVoice(null);
    },

    repeat() {
      const { prepared, progress, active, key } = state;
      if (!active || blocked || !prepared || !progress?.joined || progress.offRoute) return;
      const step = prepared.announced[Math.min(progress.idx, prepared.announced.length - 1)];
      // Counts as a prompt: the schedule does not talk over it for 4 s (except `now`).
      vs = { ...vs, lastPromptAt: deps.now() };
      speak(voiceText(step, placeName()), () => !blocked && state.active && state.key === key);
    },

    getState: () => state,
  };
}

/**
 * The app's one engine. The foreground watch and the background location task both call `navSession.ingest(fix)`. State goes to nav-store (`engine`) for the screens.
 */
export const navSession: NavSession = createNavSession({
  now: () => Date.now(),
  fetchRoute: (from, to, opts, signal) => fetchNavRouteResult(from, to, opts, signal),
  publish: (engine) => useNavStore.setState({ engine }),
  // The preview's choice rides with the ride; with no preview (cold start, in-ride Go here) the saved preference decides.
  readAvoid: () => useNavStore.getState().avoidMotorways ?? readItem(STORAGE_KEYS.allowExpressways) !== '1',
  getLatch: (rideId) => arrivalForRide(useNavStore.getState(), rideId),
  setLatch: (rideId, latch) => useNavStore.getState().setArrival(rideId, latch),
  voice: {
    prepare: () => void speech.prepare(),
    say: (text, valid) => speech.say(text, valid),
    hush: speech.hush,
    teardown: speech.teardown,
    releaseIfIdle: speech.releaseIfIdle,
  },
});
