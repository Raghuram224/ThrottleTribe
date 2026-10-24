import { destKey, NO_ARRIVAL, type ArrivalLatch } from '../nav-arrival';
import { selectBanner, type NavEngineState } from '../nav-engine';
import { createNavSession, STARTING_MAX_MS, type NavSessionDeps } from '../nav-session';
import type { NavRoute, NavRouteResult } from '../nav-route';
import { at, fix, straightRoute } from '../__fixtures__/nav-fixtures';

jest.mock('expo-sqlite/localStorage/install', () => ({}));
jest.mock('expo-speech', () => ({}));
jest.mock('expo-audio', () => ({}));

const DEST = at(3000);
const KEY = destKey(DEST);
const route = (): NavRoute => straightRoute(3000, [[1000, 'turn', 'left'], [2000, 'turn', 'right']]);

interface Call {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  opts: Parameters<NavSessionDeps['fetchRoute']>[2];
  resolve: (r: NavRouteResult) => void;
  signal: AbortSignal;
}

function harness(over: Partial<NavSessionDeps> = {}) {
  const clock = { now: 100_000 };
  const calls: Call[] = [];
  const published: NavEngineState[] = [];
  let latch: ArrivalLatch = NO_ARRIVAL;
  let avoid = true;
  const deps: NavSessionDeps = {
    now: () => clock.now,
    fetchRoute: (from, to, opts, signal) =>
      new Promise<NavRouteResult>((resolve) => {
        calls.push({ from, to, opts, resolve, signal });
      }),
    publish: (s) => published.push(s),
    readAvoid: () => avoid,
    getLatch: () => latch,
    setLatch: (_id, l) => {
      latch = l;
    },
    voice: { prepare: jest.fn(), say: jest.fn(() => Promise.resolve('spoken' as const)), hush: jest.fn(), teardown: jest.fn(), releaseIfIdle: jest.fn() },
    ...over,
  };
  const effects = { onArrived: jest.fn(), onRerouted: jest.fn(), onRouteFailed: jest.fn() };
  const session = createNavSession(deps);
  session.setEffects(effects);
  return {
    session,
    clock,
    calls,
    published,
    effects,
    getLatch: () => latch,
    setAvoid: (v: boolean) => {
      avoid = v;
    },
  };
}
const flush = () => new Promise<void>((r) => setImmediate(r));
const ok = (r: NavRoute = route()): NavRouteResult => ({ status: 'ok', route: r, routes: [r] });

describe('"starting" cannot last forever (a restored ride with no origin)', () => {
  it('settles to unavailable (no route) when nothing is in flight after the limit', () => {
    const h = harness();
    // Offline (or backing off): the fix arrives, no request is made, and the status was left at 'loading'.
    h.session.start({ rideId: 'r', dest: DEST, offline: true });
    expect(h.session.getState().routeStatus).toBe('loading');
    expect(h.calls).toHaveLength(0);
    h.clock.now += STARTING_MAX_MS;
    h.session.tick();
    expect(h.session.getState().routeStatus).toBe('loading');
    h.clock.now += 1;
    h.session.tick();
    expect(h.session.getState().routeStatus).toBe('unavailable');
    // With a fix, the banner now says no route instead of "Getting directions".
    h.session.ingest(fix(100, { t: h.clock.now }));
    const banner = selectBanner({ active: true, engine: h.session.getState(), locationOk: true, netOffline: true, me: null, dest: DEST, now: h.clock.now });
    expect(banner?.kind).not.toBe('starting');
  });
  it('does not settle while a request is in flight', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, origin: at(0) });
    expect(h.calls).toHaveLength(1);
    h.clock.now += STARTING_MAX_MS + 5000;
    h.session.tick();
    expect(h.session.getState().routeStatus).toBe('loading');
  });
  it('leaves a seeded route alone', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += STARTING_MAX_MS + 5000;
    h.session.tick();
    expect(h.session.getState().routeStatus).toBe('ok');
  });
});

describe('headless guard', () => {
  it('ingest is a no-op with no session: no state, no request', () => {
    const h = harness();
    expect(h.session.ingest(fix(100))).toBe(false);
    expect(h.published).toHaveLength(0);
    expect(h.calls).toHaveLength(0);
  });
  it('is a no-op again after stop', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.session.stop();
    expect(h.session.ingest(fix(100))).toBe(false);
    expect(h.session.getState().active).toBe(false);
  });
});

describe('ingest dedupe and ordering', () => {
  const started = () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    return h;
  };
  it('uses a fix once: the same timestamp from a second source is ignored', () => {
    const h = started();
    expect(h.session.ingest(fix(100, { t: 5000 }))).toBe(true);
    const n = h.published.length;
    expect(h.session.ingest(fix(100, { t: 5000 }))).toBe(false);
    expect(h.published).toHaveLength(n);
  });
  it('ignores a fix older than the last, and keeps the newest as my position', () => {
    const h = started();
    h.session.ingest(fix(300, { t: 6000 }));
    expect(h.session.ingest(fix(200, { t: 5000 }))).toBe(false);
    expect(h.session.getState().fix?.t).toBe(6000);
    expect(h.session.ingest(fix(400, { t: 7000 }))).toBe(true);
    expect(h.session.getState().fix?.t).toBe(7000);
  });
  it('two sources interleaved (foreground watch and background task) count each fix once', () => {
    const h = started();
    const results = [
      h.session.ingest(fix(100, { t: 1000 })), // watch
      h.session.ingest(fix(100, { t: 1000 })), // task, same fix
      h.session.ingest(fix(120, { t: 2000 })), // task first this time
      h.session.ingest(fix(120, { t: 2000 })), // watch
      h.session.ingest(fix(110, { t: 1500 })), // late straggler
    ];
    expect(results).toEqual([true, false, true, false, false]);
  });
  it('rejects fixes that are not numbers', () => {
    const h = started();
    expect(h.session.ingest({ ...fix(100), lat: NaN })).toBe(false);
    expect(h.session.ingest({ ...fix(100), t: NaN })).toBe(false);
    expect(h.session.ingest({ ...fix(100), lat: 91 })).toBe(false);
  });
  it('a restarted session accepts timestamps from the start again', () => {
    const h = started();
    h.session.ingest(fix(100, { t: 9000 }));
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    expect(h.session.ingest(fix(100, { t: 1000 }))).toBe(true);
  });
  it('publishes the progress of each used fix', () => {
    const h = started();
    h.session.ingest(fix(1000, { t: 1000 }));
    h.session.ingest(fix(1061, { t: 2000 }));
    expect(h.session.getState().progress?.idx).toBe(1);
    expect(h.published[h.published.length - 1]).toBe(h.session.getState());
  });
});

describe('starting', () => {
  it('a seeded route is used as just fetched: no request', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route(), origin: at(0) });
    h.session.ingest(fix(100, { t: 1000 }));
    expect(h.calls).toHaveLength(0);
    expect(h.session.getState()).toMatchObject({ active: true, routeStatus: 'ok', key: KEY });
  });
  it('without a seed it asks once, from the origin, with steps and the stored avoidance', async () => {
    const h = harness();
    h.setAvoid(true);
    h.session.start({ rideId: 'r', dest: DEST, origin: at(0) });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].opts).toEqual({ steps: true, avoidMotorways: true, bearingDeg: null, noCache: true, context: 'nav' });
    expect(h.session.getState()).toMatchObject({ routeStatus: 'loading', fetching: true });
    // A fix arriving meanwhile does not start a second request.
    h.session.ingest(fix(10, { t: 1000 }));
    expect(h.calls).toHaveLength(1);
    h.calls[0].resolve(ok());
    await flush();
    expect(h.session.getState()).toMatchObject({ routeStatus: 'ok', fetching: false });
    expect(h.session.getState().prepared?.announced).toHaveLength(3);
    expect(h.effects.onRerouted).not.toHaveBeenCalled(); // the first route is not a reroute
  });
  it('without a seed or an origin it waits for the first fix', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST });
    expect(h.calls).toHaveLength(0);
    h.session.ingest(fix(10, { t: 1000 }));
    expect(h.calls).toHaveLength(1);
  });
  it('reads the avoidance at fetch time, not at start', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST });
    h.setAvoid(false);
    h.session.ingest(fix(10, { t: 1000 }));
    expect(h.calls[0].opts.avoidMotorways).toBe(false);
  });
  it('retries a missing route on the backoff after a failure and shows "unavailable" meanwhile', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST });
    h.session.ingest(fix(10, { t: 1000, speedMps: 2 }));
    h.calls[0].resolve({ status: 'failed' });
    await flush();
    expect(h.session.getState().routeStatus).toBe('unavailable');
    expect(h.effects.onRouteFailed).toHaveBeenCalledWith('failed');
    h.clock.now += 9_000;
    h.session.ingest(fix(20, { t: 2000, speedMps: 2 }));
    expect(h.calls).toHaveLength(1);
    h.clock.now += 1_000; // 10 s after the attempt
    h.session.ingest(fix(30, { t: 3000, speedMps: 2 }));
    expect(h.calls).toHaveLength(2);
    expect(h.session.getState().routeStatus).toBe('unavailable'); // no flicker back to "starting"
    h.calls[1].resolve({ status: 'no_route' });
    await flush();
    expect(h.effects.onRouteFailed).toHaveBeenLastCalledWith('no_route');
    h.clock.now += 19_000;
    h.session.ingest(fix(40, { t: 4000, speedMps: 2 }));
    expect(h.calls).toHaveLength(2);
    h.clock.now += 1_000; // 20 s after the second attempt
    h.session.ingest(fix(50, { t: 5000, speedMps: 2 }));
    expect(h.calls).toHaveLength(3);
  });
});

describe('off route and reroute', () => {
  // `speedMps` below 15 km/h sends no bearing, so a failure is a plain failure on the backoff (not the no-bearing retry).
  const offFixes = (h: ReturnType<typeof harness>, from: number, t0: number, speedMps = 15) => {
    h.session.ingest(fix(from, { t: t0, speedMps }));
    for (let i = 1; i <= 3; i++) h.session.ingest(fix(from + i * 20, { northM: 100, t: t0 + i * 1000, speedMps }));
  };

  it('asks for a new route after 3 off fixes, from the fix, with steps and the course as bearing', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += 20_000; // the seed is old enough
    offFixes(h, 500, 1000);
    expect(h.session.getState().progress?.offRoute).toBe(true);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].opts.steps).toBe(true);
    expect(h.calls[0].opts.bearingDeg).toBe(90);
    expect(h.calls[0].to).toEqual(DEST);
    expect(h.calls[0].from.lat).toBeCloseTo(at(560, 100).lat, 6);
    h.calls[0].resolve(ok(straightRoute(2000, [[800, 'turn', 'left']])));
    await flush();
    const s = h.session.getState();
    expect(s.progress?.offRoute).toBe(false);
    expect(s.progress?.routeId).toBe(s.prepared?.id);
    expect(h.effects.onRerouted).toHaveBeenCalledTimes(1);
  });

  it('waits 10 s after a seed or an earlier request before rerouting', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += 5_000;
    offFixes(h, 500, 1000);
    expect(h.session.getState().progress?.offRoute).toBe(true);
    expect(h.calls).toHaveLength(0);
    h.clock.now += 5_000;
    h.session.ingest(fix(600, { northM: 100, t: 9000 }));
    expect(h.calls).toHaveLength(1);
  });

  it('keeps the old route on failure and backs off 20 s, then 40 s, then 60 s', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += 10_000;
    offFixes(h, 500, 1000, 2);
    expect(h.calls).toHaveLength(1);
    const oldRoute = h.session.getState().prepared;
    h.calls[0].resolve({ status: 'failed' });
    await flush();
    expect(h.session.getState().prepared).toBe(oldRoute);
    expect(h.session.getState().routeStatus).toBe('ok');
    expect(h.effects.onRouteFailed).toHaveBeenCalledTimes(1);

    let t = 10_000;
    const tick = (ms: number) => {
      h.clock.now += ms;
      t += 1000;
      h.session.ingest(fix(700, { northM: 100, t, speedMps: 2 }));
    };
    tick(19_000);
    expect(h.calls).toHaveLength(1);
    tick(1_000); // 20 s after the failed attempt
    expect(h.calls).toHaveLength(2);
    h.calls[1].resolve({ status: 'failed' });
    await flush();
    tick(39_000);
    expect(h.calls).toHaveLength(2);
    tick(1_000); // 40 s
    expect(h.calls).toHaveLength(3);
    h.calls[2].resolve({ status: 'failed' });
    await flush();
    tick(59_000);
    expect(h.calls).toHaveLength(3);
    tick(1_000); // 60 s
    expect(h.calls).toHaveLength(4);
    h.calls[3].resolve({ status: 'failed' });
    await flush();
    tick(60_000); // stays at 60 s
    expect(h.calls).toHaveLength(5);
  });

  it('never has two requests in flight', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += 60_000;
    offFixes(h, 500, 1000);
    for (let i = 5; i < 12; i++) {
      h.clock.now += 2_000;
      h.session.ingest(fix(500 + i * 20, { northM: 100, t: 1000 + i * 1000 }));
    }
    expect(h.calls).toHaveLength(1);
  });

  it('keeps requests at least one second apart, even when reconnecting would allow one at once', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += 10_000;
    offFixes(h, 500, 1000);
    expect(h.calls).toHaveLength(1);
    h.calls[0].resolve({ status: 'failed' });
    await flush();
    h.session.setOffline(true);
    h.clock.now += 500;
    h.session.setOffline(false); // lastFetchAt is cleared, but the last request was 0.5 s ago
    expect(h.calls).toHaveLength(1);
    h.clock.now += 600;
    h.session.ingest(fix(700, { northM: 100, t: 30_000 }));
    expect(h.calls).toHaveLength(2);
  });

  it('retries without bearings after a failure that carried one (a malformed value answers 400)', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += 10_000;
    offFixes(h, 500, 1000);
    expect(h.calls[0].opts.bearingDeg).toBe(90);
    h.calls[0].resolve({ status: 'failed' });
    await flush();
    h.clock.now += 20_000;
    h.session.ingest(fix(700, { northM: 100, t: 20_000 }));
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].opts.bearingDeg).toBeNull();
  });

  it('sends no bearing when slow', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += 10_000;
    h.session.ingest(fix(500, { t: 1000, speedMps: 2 }));
    for (let i = 1; i <= 3; i++) h.session.ingest(fix(500 + i * 5, { northM: 100, t: 1000 + i * 1000, speedMps: 2 }));
    expect(h.calls[0].opts.bearingDeg).toBeNull();
  });

  it('does not fetch while offline, and fetches at once when the network returns', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.session.setOffline(true);
    h.clock.now += 120_000;
    offFixes(h, 500, 1000);
    expect(h.session.getState().progress?.offRoute).toBe(true);
    expect(h.calls).toHaveLength(0);
    h.clock.now += 5_000;
    h.session.setOffline(false);
    expect(h.calls).toHaveLength(1);
  });

  it('an answer that arrives after stop, or for another destination, is ignored', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, origin: at(0) });
    h.session.stop();
    h.calls[0].resolve(ok());
    await flush();
    expect(h.session.getState().active).toBe(false);
    expect(h.session.getState().prepared).toBeNull();

    h.session.start({ rideId: 'r', dest: DEST, origin: at(0) });
    h.clock.now += 5_000;
    const other = at(9000);
    h.session.start({ rideId: 'r', dest: other, origin: at(0) });
    expect(h.calls[2].signal.aborted).toBe(false);
    expect(h.calls[1].signal.aborted).toBe(true);
    h.calls[1].resolve(ok(straightRoute(500, []))); // the old destination's answer arrives late
    await flush();
    expect(h.session.getState().prepared).toBeNull();
    h.calls[2].resolve(ok());
    await flush();
    expect(h.session.getState().key).toBe(destKey(other));
    expect(h.session.getState().routeStatus).toBe('ok');
  });
});

describe('arrival', () => {
  it('latches within 150 m, tells the app once and goes idle (no more fixes, no reroute)', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.session.ingest(fix(1000, { t: 1000 }));
    expect(h.getLatch().state).toBe('navigating');
    h.session.ingest(fix(2900, { t: 2000 }));
    expect(h.getLatch()).toEqual({ key: KEY, state: 'arrived' });
    expect(h.effects.onArrived).toHaveBeenCalledTimes(1);
    expect(h.session.getState().active).toBe(false);
    expect(h.session.ingest(fix(2950, { t: 3000 }))).toBe(false);
    expect(h.effects.onArrived).toHaveBeenCalledTimes(1);
  });
  it('rule (b): within 40 m of the arrive maneuver, with a destination pinned far from the road', () => {
    const pinned = at(3000, 300); // 300 m off the road end
    const h = harness();
    h.session.start({ rideId: 'r', dest: pinned, seed: route() });
    h.session.ingest(fix(2500, { t: 1000 }));
    expect(h.effects.onArrived).not.toHaveBeenCalled();
    h.session.ingest(fix(2980, { t: 2000 }));
    expect(h.effects.onArrived).toHaveBeenCalledTimes(1);
  });
  it('a poor fix (over 100 m) does not arrive', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.session.ingest(fix(2990, { t: 1000, accuracyM: 150 }));
    expect(h.effects.onArrived).not.toHaveBeenCalled();
  });
  it('an already arrived latch for this destination is not announced again', () => {
    const h = harness({ getLatch: () => ({ key: KEY, state: 'arrived' }) });
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.session.ingest(fix(2990, { t: 1000 }));
    expect(h.effects.onArrived).not.toHaveBeenCalled();
  });
});

describe('resume', () => {
  it('restarts the GPS-lost clock', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += 60_000;
    h.session.resume();
    expect(h.session.getState().startedAt).toBe(h.clock.now);
  });
});

// ---------------------------------------------------------------- review fixes (P2 review)

const bannerKind = (h: ReturnType<typeof harness>, me = at(0)) =>
  selectBanner({ active: true, engine: h.session.getState(), locationOk: true, netOffline: false, now: h.clock.now, me, dest: DEST })?.kind;

describe('H1: no route, fixes arriving', () => {
  it('stays noRoute (never noGps) while fixes keep coming, and goes noGps 10 s after they stop', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, origin: at(0) });
    h.calls[0].resolve({ status: 'failed' });
    await flush();
    const t0 = h.clock.now;
    let t = 1000;
    const feed = (untilS: number) => {
      while (h.clock.now - t0 < untilS * 1000) {
        h.clock.now += 1000;
        h.session.ingest(fix(10, { t: (t += 1000) }));
      }
    };
    for (const s of [5, 15, 60]) {
      feed(s);
      expect(bannerKind(h)).toBe('noRoute');
    }
    h.clock.now += 9_000;
    expect(bannerKind(h)).toBe('noRoute');
    h.clock.now += 1_000;
    expect(bannerKind(h)).toBe('noGps');
  });
});

describe('M2: starting away from the road', () => {
  it('fixes 120 m from the route start for 60 s: no reroute request, and a "head to the road" banner', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    for (let i = 0; i < 60; i++) {
      h.clock.now += 1000;
      h.session.ingest(fix(i, { northM: 120, speedMps: 2, t: 1000 + i * 1000 }));
    }
    expect(h.calls).toHaveLength(0);
    expect(h.session.getState().progress?.offRoute).toBe(false);
    expect(bannerKind(h)).toBe('toRoad');
  });
  it('once on the road the normal off-route rules apply', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += 20_000;
    h.session.ingest(fix(0, { northM: 120, speedMps: 2, t: 1000 }));
    h.session.ingest(fix(20, { t: 2000 }));
    expect(bannerKind(h)).toBe('guide');
    for (let i = 1; i <= 3; i++) h.session.ingest(fix(40 + i * 20, { northM: 100, t: 2000 + i * 1000 }));
    expect(h.calls).toHaveLength(1);
  });
});

describe('M3: a flapping network does not defeat the backoff', () => {
  it('failing server and connectivity toggling every 2 s for 2 min: bounded by the backoff schedule', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += 20_000;
    let t = 1000;
    h.session.ingest(fix(500, { t }));
    let answered = 0;
    const answer = async () => {
      while (answered < h.calls.length) h.calls[answered++].resolve({ status: 'failed' });
      await flush();
    };
    for (let s = 0; s < 120; s += 2) {
      h.session.setOffline(true);
      h.clock.now += 1000;
      h.session.ingest(fix(600, { northM: 100, t: (t += 1000) }));
      h.session.setOffline(false);
      h.clock.now += 1000;
      h.session.ingest(fix(600, { northM: 100, t: (t += 1000) }));
      await answer();
    }
    // 1 first + 1 reconnect credit + the 40 s / 60 s steps of the schedule; never one per flap (that would be ~60).
    expect(h.calls.length).toBeGreaterThanOrEqual(3);
    expect(h.calls.length).toBeLessThanOrEqual(6);
  });
});

describe('L5: future-dated fixes', () => {
  it('a fix more than 30 s in the future is ignored and does not freeze the engine', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    expect(h.session.ingest(fix(100, { t: h.clock.now + 3_600_000 }))).toBe(false);
    expect(h.session.ingest(fix(110, { t: h.clock.now }))).toBe(true);
    expect(h.session.getState().fix?.t).toBe(h.clock.now);
  });
});

describe('L6: arrival rule (c) at session level', () => {
  it('on the final step with 30 m left, far from the pinned destination and the arrive point', () => {
    const base = route();
    const steps = base.steps!.map((s) => (s.type === 'arrive' ? { ...s, location: at(3000, 300) } : s));
    const h = harness();
    h.session.start({ rideId: 'r', dest: at(3000, 600), seed: { ...base, steps } });
    h.session.ingest(fix(2900, { t: 1000 }));
    expect(h.effects.onArrived).not.toHaveBeenCalled();
    h.clock.now += 5_000; // 75 m at 15 m/s
    h.session.ingest(fix(2975, { t: 2000 }));
    expect(h.effects.onArrived).toHaveBeenCalledTimes(1);
  });
});

describe('L1: a failed request with bearings retries without them after the 1 s gap', () => {
  it('does not wait for the backoff', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route() });
    h.clock.now += 20_000;
    h.session.ingest(fix(500, { t: 1000 }));
    for (let i = 1; i <= 3; i++) h.session.ingest(fix(500 + i * 20, { northM: 100, t: 1000 + i * 1000 }));
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].opts.bearingDeg).toBe(90);
    h.calls[0].resolve({ status: 'failed' });
    await flush();
    h.clock.now += 1_000;
    h.session.ingest(fix(600, { northM: 100, t: 10_000 }));
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].opts.bearingDeg).toBeNull();
  });
});

describe('L6: starting offline', () => {
  it('does not fire a doomed request when the session starts offline', () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, origin: at(0), offline: true });
    expect(h.calls).toHaveLength(0);
    h.session.setOffline(false);
    expect(h.calls).toHaveLength(0); // no fix yet: the origin is only used at start
    h.session.ingest(fix(10, { t: 1000 }));
    expect(h.calls).toHaveLength(1);
  });
});

describe('rate limits (24 §3.3, §3.4)', () => {
  const limited = (scope: 'second' | 'minute' | 'day' | 'user', retryAfterS: number): NavRouteResult => ({ status: 'rate_limited', scope, retryAfterS });
  const SLOW = { speedMps: 2 }; // below 15 km/h: no bearing, so a failure is a plain one

  it('first route limited (minute): "unavailable" (compass banner), "busy" flag, next request not before retryAfter', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST });
    h.session.ingest(fix(10, { t: 1000, ...SLOW }));
    h.calls[0].resolve(limited('minute', 45));
    await flush();
    expect(h.session.getState()).toMatchObject({ routeStatus: 'unavailable', routeBusy: true, fetching: false });
    expect(h.effects.onRouteFailed).toHaveBeenCalledWith('rate_limited');
    // The backoff after one failure is 10 s, but retryAfter says 45 s: it wins.
    h.clock.now += 44_000;
    h.session.ingest(fix(20, { t: 2000, ...SLOW }));
    expect(h.calls).toHaveLength(1);
    h.clock.now += 1_000;
    h.session.ingest(fix(30, { t: 3000, ...SLOW }));
    expect(h.calls).toHaveLength(2);
    h.calls[1].resolve(ok());
    await flush();
    expect(h.session.getState()).toMatchObject({ routeStatus: 'ok', routeBusy: false });
  });

  it('a per-second limit is retried once after 1 s without counting a failure (no backoff wait)', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST });
    h.session.ingest(fix(10, { t: 1000, ...SLOW }));
    h.calls[0].resolve(limited('second', 1));
    await flush();
    h.clock.now += 500;
    h.session.ingest(fix(20, { t: 2000, ...SLOW }));
    expect(h.calls).toHaveLength(1);
    h.clock.now += 600; // 1.1 s after the limit
    h.session.ingest(fix(30, { t: 3000, ...SLOW }));
    expect(h.calls).toHaveLength(2);
  });

  it('a daily limit pauses requests (30 min at most)', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST });
    h.session.ingest(fix(10, { t: 1000, ...SLOW }));
    h.calls[0].resolve(limited('day', 50_000));
    await flush();
    h.clock.now += 29 * 60_000;
    h.session.ingest(fix(20, { t: 2000, ...SLOW }));
    expect(h.calls).toHaveLength(1);
    h.clock.now += 61_000;
    h.session.ingest(fix(30, { t: 3000, ...SLOW }));
    expect(h.calls).toHaveLength(2); // the probe
  });

  it('a limited reroute keeps the old line and says "busy" on the rerouting banner', async () => {
    const h = harness();
    h.session.start({ rideId: 'r', dest: DEST, seed: route(), origin: at(0) });
    h.clock.now += 20_000;
    h.session.ingest(fix(100, { t: 1000, ...SLOW }));
    for (let i = 1; i <= 3; i++) h.session.ingest(fix(100 + i * 20, { northM: 100, t: 1000 + i * 1000, ...SLOW }));
    expect(h.calls).toHaveLength(1);
    h.calls[0].resolve(limited('minute', 30));
    await flush();
    const s = h.session.getState();
    expect(s).toMatchObject({ routeStatus: 'ok', routeBusy: true });
    expect(s.prepared).not.toBeNull();
    const banner = selectBanner({ active: true, engine: s, locationOk: true, netOffline: false, now: h.clock.now, me: null, dest: DEST });
    expect(banner).toMatchObject({ kind: 'rerouting', busy: true });
  });
});
