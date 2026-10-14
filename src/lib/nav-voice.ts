// Voice prompt schedule for solo navigation (docs/design/21 §4.2, §4.3). Pure, no React, no clock, no speech engine:
// the engine (nav-session) hands in the state of the moment and gets back what to say, if anything. There are no
// timers: prompts are driven by position fixes, which wake the runtime reliably with the screen off.
import { t } from '@/lib/copy';
import { spokenDistance, spokenRoad, voiceText } from '@/lib/nav-instructions';
import { maneuverDistanceM, remainingAlongM, type PreparedRoute, type Progress } from '@/lib/nav-progress';
import { treatedAs, type NavStep } from '@/lib/nav-steps';

export type Stage = 'far' | 'near' | 'now';

/** Most urgent last: speaking a stage marks it and every earlier one done. */
const STAGES: readonly Stage[] = ['far', 'near', 'now'];

/** No prompt starts within this long of the previous one, except `now`. */
export const PROMPT_GAP_MS = 4000;
/** "Rerouting" at most this often. */
export const REROUTING_MIN_GAP_MS = 30_000;
/** "GPS signal lost" at most this often. */
export const NO_GPS_MIN_GAP_MS = 120_000;
/** A "Continue on … for 24 kilometres" prompt follows a maneuver when the next one is at least this far. */
export const CONTINUE_MIN_M = 5000;
/** The "then" chain is added when the following maneuver is at most this far after the current one. */
export const THEN_CHAIN_MAX_M = 150;
/**
 * A fix older than this when it reaches the engine (a batch delivered late in the background, a slow wake-up) says
 * where the rider was, not where they are: it drives no maneuver or start prompt.
 */
export const PROMPT_FIX_MAX_AGE_MS = 3000;
/** EMA weight of the newest speed sample. */
export const SPEED_ALPHA = 0.3;
const MIN_SPEED_MPS = 30 / 3.6;

/** Where each stage is spoken, for a speed: far / near / now distances to the maneuver (m). */
export function thresholds(vMps: number): { far: number; near: number; now: number } {
  const v = Math.max(Number.isFinite(vMps) ? vMps : 0, MIN_SPEED_MPS);
  return {
    far: Math.min(2000, Math.max(500, v * 45)),
    near: Math.max(150, v * 12),
    now: Math.max(30, v * 4),
  };
}

const lowerFirst = (s: string): string => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export interface NextPromptInput {
  /** Distance to the maneuver (m). */
  d: number;
  /** Smoothed speed (m/s); null = unknown (50 km/h). */
  v: number | null;
  step: NavStep;
  next: NavStep | null;
  /** The stretch since the previous maneuver (from the route start for the first one). */
  legBeforeM: number;
  done: readonly Stage[];
  place: string;
  /** Time since the previous prompt started; `Infinity` when none, `0` while one is still being spoken. */
  sinceLastPromptMs: number;
}

/**
 * The one prompt due for this maneuver, or null. Only the most urgent eligible stage is considered; `arrive` never
 * gets `now` (the arrived prompt replaces it); `far` needs a leg long enough for an early warning; a prompt inside
 * the 4 s gap waits (not marked), except `now`, which does not.
 */
export function nextPrompt(a: NextPromptInput): { stage: Stage; text: string } | null {
  const th = thresholds(a.v ?? 50 / 3.6);
  const arrive = treatedAs(a.step) === 'arrive';
  let stage: Stage | null = null;
  if (!arrive && a.d <= th.now) stage = 'now';
  else if (a.d <= th.near) stage = 'near';
  else if (a.d <= th.far && a.legBeforeM >= th.far) stage = 'far';
  if (!stage || a.done.includes(stage)) return null;
  if (stage !== 'now' && a.sinceLastPromptMs < PROMPT_GAP_MS) return null;

  // `now` is the bare instruction ("Turn left onto MG Road"); the earlier stages say how far it is.
  const bare = voiceText(a.step, a.place);
  let instruction =
    stage === 'now' ? bare : t('nav.say.in', { distance: spokenDistance(a.d), instruction: lowerFirst(bare) });
  const next = a.next;
  if (stage !== 'far' && next && treatedAs(next) !== 'arrive' && next.alongM - a.step.alongM <= THEN_CHAIN_MAX_M) {
    instruction += t('nav.say.then', { instruction: lowerFirst(voiceText(next, a.place, { withRoad: false })) });
  }
  return { stage, text: instruction };
}

/** `stage` and every less urgent stage are done. */
export function markDone(done: readonly Stage[], stage: Stage): Stage[] {
  const upTo = STAGES.indexOf(stage);
  const out = new Set<Stage>(done);
  for (let i = 0; i <= upTo; i++) out.add(STAGES[i]);
  return STAGES.filter((s) => out.has(s));
}

/** Smoothed speed: EMA with weight 0.3 on the newest sample; unknown or negative samples are ignored. */
export function smoothSpeed(prev: number | null, speedMps: number | null): number | null {
  if (speedMps === null || !Number.isFinite(speedMps) || speedMps < 0) return prev;
  return prev === null ? speedMps : prev * (1 - SPEED_ALPHA) + speedMps * SPEED_ALPHA;
}

// ---------------------------------------------------------------- the session's voice state

export interface VoiceState {
  /** The route and maneuver the `done` stages belong to. */
  routeId: number;
  idx: number;
  done: Stage[];
  /** The "Route to …" prompt was given (or skipped) for this session. */
  started: boolean;
  /** `idx` for which the "Continue on …" prompt was given. */
  continuedIdx: number;
  /** Clock time (ms) the last prompt started. */
  lastPromptAt: number | null;
  speedEma: number | null;
  reroutingSpoken: boolean;
  lastReroutingAt: number | null;
  noGpsSpoken: boolean;
  lastNoGpsAt: number | null;
}

export const INITIAL_VOICE: VoiceState = {
  routeId: -1,
  idx: -1,
  done: [],
  started: false,
  continuedIdx: -1,
  lastPromptAt: null,
  speedEma: null,
  reroutingSpoken: false,
  lastReroutingAt: null,
  noGpsSpoken: false,
  lastNoGpsAt: null,
};

export type PromptKind = 'start' | 'maneuver' | 'continue' | 'rerouting' | 'noGps';

export interface VoicePrompt {
  kind: PromptKind;
  text: string;
  /** maneuver prompts: the stage; `now` is not held back by the 4 s gap. */
  stage?: Stage;
}

export interface VoiceInput {
  /** Clock time (ms). */
  now: number;
  /** This call comes from a good position fix (maneuver and start prompts need one). */
  goodFix: boolean;
  speedMps: number | null;
  prepared: PreparedRoute | null;
  progress: Progress | null;
  place: string;
  /** No network: a reroute cannot happen, so "Rerouting" is not said. */
  offline: boolean;
  /** No good fix for 10 s (`gpsLost`). */
  gpsLost: boolean;
  /** Muted, or an SOS is on: stages still advance (nothing is replayed later), but nothing is said. */
  blocked: boolean;
  /** A prompt is being spoken right now: the non-urgent ones wait for it. */
  speaking: boolean;
}

export interface VoiceResult {
  state: VoiceState;
  prompt: VoicePrompt | null;
}

/**
 * One step of the schedule: what to say now, and the new state. Order: GPS lost, off route ("Rerouting"), then
 * the route prompts (start, continue, the maneuver's far / near / now). While `blocked` every mark is made as if the
 * prompt had been said, so nothing missed is replayed when the block ends; the next stage that becomes due is spoken.
 */
export function planVoice(prev: VoiceState, i: VoiceInput): VoiceResult {
  const st: VoiceState = { ...prev, speedEma: smoothSpeed(prev.speedEma, i.speedMps) };
  let prompt: VoicePrompt | null = null;
  const emit = (p: VoicePrompt) => {
    if (i.blocked) return;
    prompt = p;
    st.lastPromptAt = i.now;
  };
  const sinceLast = i.speaking ? 0 : st.lastPromptAt === null ? Infinity : i.now - st.lastPromptAt;
  const mayStart = i.blocked || sinceLast >= PROMPT_GAP_MS;
  const result = (): VoiceResult => ({ state: st, prompt });

  // GPS lost: the position is stale, so there is nothing else worth saying.
  if (i.gpsLost) {
    if (!st.noGpsSpoken) {
      st.noGpsSpoken = true;
      if (st.lastNoGpsAt === null || i.now - st.lastNoGpsAt >= NO_GPS_MIN_GAP_MS) {
        st.lastNoGpsAt = i.now;
        emit({ kind: 'noGps', text: t('nav.say.noGps') });
      }
    }
    return result();
  }
  st.noGpsSpoken = false;

  const { prepared, progress } = i;
  // Off route: "Rerouting" once per episode and at most every 30 s; not while offline (no reroute is coming yet).
  if (progress?.offRoute) {
    if (!i.offline && !st.reroutingSpoken) {
      st.reroutingSpoken = true;
      if (st.lastReroutingAt === null || i.now - st.lastReroutingAt >= REROUTING_MIN_GAP_MS) {
        st.lastReroutingAt = i.now;
        emit({ kind: 'rerouting', text: t('nav.say.rerouting') });
      }
    }
    return result();
  }
  st.reroutingSpoken = false;

  if (!i.goodFix || !prepared || !progress) return result();

  // A new route (a reroute, a new destination) starts the stages over; so does a new maneuver.
  if (st.routeId !== progress.routeId) {
    st.routeId = progress.routeId;
    st.idx = -1;
    st.continuedIdx = -1;
  }
  const idx = Math.min(progress.idx, prepared.announced.length - 1);
  if (st.idx !== idx) {
    st.idx = idx;
    st.done = [];
  }
  const step = prepared.announced[idx];
  const prevStep = idx > 0 ? prepared.announced[idx - 1] : null;
  const d = maneuverDistanceM(progress, prepared, i.now);
  // `d` is clamped at 0, so a rider who is already past the turn (the step has not advanced yet, or dead reckoning
  // says so) looks like one standing on it: never "Turn left" after the turn. The stages are spent instead.
  const passed = progress.joined && (progress.displayAlongM >= step.alongM || d <= 0);
  if (passed) st.done = markDone(st.done, 'now');
  // Until I have been on the line the distance is from the route start, not from me: no maneuver prompts yet.
  const due =
    progress.joined && !passed
      ? nextPrompt({
          d,
          v: st.speedEma,
          step,
          next: prepared.announced[idx + 1] ?? null,
          legBeforeM: step.alongM - (prevStep?.alongM ?? 0),
          done: st.done,
          place: i.place,
          sinceLastPromptMs: i.blocked ? Infinity : sinceLast,
        })
      : null;

  // Start prompt: first good fix of the session, with the first maneuver's own prompt when it is already due.
  if (!st.started) {
    st.started = true;
    let text = t('nav.say.start', { place: i.place, distance: spokenDistance(remainingAlongM(progress, prepared)) });
    if (due) {
      text += ` ${due.text}`;
      st.done = markDone(st.done, due.stage);
    }
    emit({ kind: 'start', text, stage: due?.stage });
    return result();
  }

  // Continue prompt: right after a maneuver, when the next one is far. Not marked while the gap holds it back.
  if (prevStep && st.continuedIdx !== idx && d >= CONTINUE_MIN_M) {
    if (mayStart) {
      st.continuedIdx = idx;
      const road = spokenRoad(prevStep);
      const distance = spokenDistance(d);
      emit({
        kind: 'continue',
        text: road ? t('nav.say.continue', { road, distance }) : t('nav.say.continueNoRoad', { distance }),
      });
    }
    return result();
  }

  if (due) {
    st.done = markDone(st.done, due.stage);
    emit({ kind: 'maneuver', text: due.text, stage: due.stage });
  }
  return result();
}

// ---------------------------------------------------------------- suppression (§4.3)

export interface VoiceBlockInput {
  /** The mute preference: voice is wanted. */
  voiceOn: boolean;
  /** My SOS is on or being sent (`sosIsOn(phase)`). */
  mySosOn: boolean;
  /** The SOS hold is in progress. */
  sosHolding: boolean;
  /** Any received SOS is active in the ride (not "the takeover is visible": in the background none is). */
  receivedSos: boolean;
}

/** Whether voice must be silent: muted, or an emergency is in progress. */
export function voiceBlocked(a: VoiceBlockInput): boolean {
  return !a.voiceOn || a.mySosOn || a.sosHolding || a.receivedSos;
}

// ---------------------------------------------------------------- the mute preference (§4.4)

/** `pref.navVoice`: '0' = muted; missing or anything else = on (the default). */
export function parseVoicePref(raw: string | null | undefined): boolean {
  return raw !== '0';
}

export function encodeVoicePref(on: boolean): string {
  return on ? '1' : '0';
}
