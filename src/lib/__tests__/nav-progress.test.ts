import {
  backoffMs,
  deadReckonM,
  gpsLost,
  initProgress,
  isGoodFix,
  isOffFix,
  maneuverDistanceM,
  NAV_REROUTE_BACKOFF_S,
  offRouteNow,
  onFinalStep,
  remainingAlongM,
  shouldFetchNavRoute,
  shouldRerouteNav,
  startBearing,
  stepProgress,
  thenStep,
  type Progress,
} from '../nav-progress';
import { at, fix, prepared, straightRoute, step } from '../__fixtures__/nav-fixtures';
import type { NavRoute } from '../nav-route';
import { haversineM } from '../geo';

/** Runs a sequence of fixes through the engine's step function (1 s apart in receipt time). */
function run(route: ReturnType<typeof prepared>, fixes: ReturnType<typeof fix>[], from: Progress = initProgress(route.id)) {
  let p = from;
  const trace: Progress[] = [];
  // Receipt times follow the distance covered at 15 m/s (at least 1 s apart), so a test's big jump is a plausible one.
  let now = 10_000;
  fixes.forEach((f, i) => {
    if (i > 0) now += Math.max(1000, (haversineM(fixes[i - 1], f) / 15) * 1000);
    p = stepProgress(p, f, route, now);
    trace.push(p);
  });
  return { p, trace };
}

describe('prepareRoute', () => {
  it('builds announced steps ending with arrive at the route length', () => {
    const r = prepared(straightRoute(3000, [[1000, 'turn', 'left'], [2000, 'turn', 'right']]));
    expect(r.announced.map((s) => s.type)).toEqual(['turn', 'turn', 'arrive']);
    expect(r.trail.totalM).toBeGreaterThan(2990);
    expect(r.announced[2].alongM).toBe(3000);
  });
});

describe('step advance (spec 3.7)', () => {
  const route = () => prepared(straightRoute(3000, [[1000, 'turn', 'left'], [2000, 'turn', 'right']]));

  it('starts on the first maneuver with the distance measured from the route start', () => {
    const r = route();
    const p = initProgress(r.id);
    expect(p.idx).toBe(0);
    expect(maneuverDistanceM(p, r)).toBeCloseTo(1000, 0);
  });

  it('needs 2 good fixes 20 m past the maneuver', () => {
    const r = route();
    const { trace } = run(r, [fix(500), fix(990), fix(1021), fix(1030)]);
    expect(trace.map((p) => p.idx)).toEqual([0, 0, 0, 1]);
    expect(trace[2].passCount).toBe(1);
  });

  it('one fix 60 m past is enough', () => {
    const r = route();
    expect(run(r, [fix(500), fix(1061)]).p.idx).toBe(1);
  });

  it('a fix below the pass margin resets the count (jitter at the junction)', () => {
    const r = route();
    // Wobbling 5 m either side of the junction, then a lone +25 and back: never 2 in a row past +20.
    const { trace } = run(r, [fix(500), fix(995), fix(1005), fix(998), fix(1025), fix(1012), fix(1026), fix(1008)]);
    expect(trace.every((p) => p.idx === 0)).toBe(true);
    // ...and two in a row do advance it.
    expect(run(r, [fix(500), fix(1025), fix(1031)]).p.idx).toBe(1);
  });

  it('a poor-accuracy fix never advances, however far past', () => {
    const r = route();
    const { p, trace } = run(r, [fix(500), fix(1100, { accuracyM: 80 })]);
    expect(p.idx).toBe(0);
    // It still refreshes the displayed distance.
    expect(trace[1].displayAlongM).toBeGreaterThan(1090);
    expect(trace[1].alongM).toBeCloseTo(500, -1); // ...but never the distance step advance is built on (H2)
    expect(maneuverDistanceM(trace[1], r)).toBe(0);
    // Unknown accuracy counts as good.
    expect(isGoodFix(null)).toBe(true);
    expect(isGoodFix(50)).toBe(true);
    expect(isGoodFix(51)).toBe(false);
  });

  it('a poor fix does not count toward the pass count either', () => {
    const r = route();
    const { p } = run(r, [fix(500), fix(1025), fix(1040, { accuracyM: 90 })]);
    expect(p.idx).toBe(0);
    expect(p.passCount).toBe(1);
  });

  it('two steps 15 m apart are both passed by one fix 80 m past the second', () => {
    const r = prepared(straightRoute(3000, [[1000, 'turn', 'left'], [1015, 'turn', 'right'], [2000, 'turn', 'left']]));
    expect(run(r, [fix(500), fix(1095)]).p.idx).toBe(2);
  });

  it('closely spaced steps: the same fix counts as the first pass of each', () => {
    const r = prepared(straightRoute(3000, [[1000, 'turn', 'left'], [1015, 'turn', 'right']]));
    const { trace } = run(r, [fix(500), fix(1040), fix(1045), fix(1050)]);
    expect(trace.map((p) => p.idx)).toEqual([0, 0, 1, 2]);
  });

  it('idx is monotonic over a jittered sequence', () => {
    const r = route();
    const noise = [0, 12, -9, 25, -15, 8, -20, 3];
    const fixes = Array.from({ length: 80 }, (_, i) => fix(100 + i * 35 + noise[i % noise.length], { northM: noise[(i + 3) % noise.length] }));
    const { trace } = run(r, fixes);
    for (let i = 1; i < trace.length; i++) expect(trace[i].idx).toBeGreaterThanOrEqual(trace[i - 1].idx);
    expect(trace[trace.length - 1].idx).toBe(2); // reached arrive
  });

  it('alongM allows only small backward jitter', () => {
    const r = route();
    const { trace } = run(r, [fix(500), fix(490), fix(400)]);
    expect(trace.map((p) => Math.round(p.alongM))).toEqual([500, 490, 460]);
  });

  it('ignores a projection onto a parallel return carriageway outside the window', () => {
    // East 4000 m, 30 m north, then back west 4000 m: the return carriageway runs 30 m from the outbound one,
    // and its stretch beside the rider is more than 1500 m further along the route.
    const out = Array.from({ length: 81 }, (_, i) => at(i * 50, 0));
    const back = Array.from({ length: 81 }, (_, i) => at(4000 - i * 50, 30));
    const route: NavRoute = {
      coords: [...out, ...back],
      distanceM: 8030,
      durationS: 600,
      steps: [step('depart', null, 0), step('turn', 'left', 4000), step('arrive', null, 8030)],
    };
    const r = prepared(route);
    let p = initProgress(r.id);
    p = stepProgress(p, fix(1400), r, 1000); // first fix: whole route, on the outbound
    expect(p.alongM).toBeCloseTo(1400, -1);
    // 25 m north of the outbound line is only 5 m from the return carriageway (along ~ 6630): outside the window.
    const jitter = stepProgress(p, fix(1400, { northM: 25 }), r, 2000);
    expect(jitter.alongM).toBeLessThan(1500);
    expect(jitter.idx).toBe(0);
  });

  it('re-acquires the whole route after a gap when the fix is close to the line (a tunnel)', () => {
    const r = route();
    let p = run(r, [fix(500)]).p;
    p = stepProgress(p, fix(2400), r, 20_000); // far outside the 1500 m window
    expect(p.alongM).toBeCloseTo(2400, -1);
    expect(p.idx).toBe(2);
  });

  it('does not re-acquire a distant projection that is not on the line', () => {
    const r = route();
    let p = run(r, [fix(500)]).p;
    p = stepProgress(p, fix(2400, { northM: 120 }), r, 20_000);
    expect(p.alongM).toBeLessThan(600);
  });

  it('the first fix on a (seeded) route is matched against the whole route (cold start mid-route)', () => {
    const r = route();
    const p = stepProgress(initProgress(r.id), fix(2100), r, 5000);
    expect(p.idx).toBe(2);
    expect(p.alongM).toBeCloseTo(2100, -1);
  });

  it('never advances past the arrive step', () => {
    const r = route();
    const { p } = run(r, [fix(2000), fix(3100), fix(3200)]);
    expect(p.idx).toBe(2);
    expect(onFinalStep(p, r)).toBe(true);
  });
});

describe('then row, remaining distance', () => {
  it('shows the next maneuver only within 500 m and when it is not arrive', () => {
    const r = prepared(straightRoute(3000, [[1000, 'turn', 'left'], [1400, 'turn', 'right'], [2500, 'turn', 'left']]));
    const p0 = initProgress(r.id);
    expect(thenStep(p0, r)?.modifier).toBe('right'); // 400 m after
    expect(thenStep({ ...p0, idx: 1 }, r)).toBeNull(); // 1100 m after
    expect(thenStep({ ...p0, idx: 2 }, r)).toBeNull(); // next is arrive
    expect(thenStep({ ...p0, idx: 3 }, r)).toBeNull(); // on arrive
  });
  it('exactly 500 m still shows it', () => {
    const r = prepared(straightRoute(3000, [[1000, 'turn', 'left'], [1500, 'turn', 'right']]));
    expect(thenStep(initProgress(r.id), r)).not.toBeNull();
  });
  it('remainingAlongM is the line left', () => {
    const r = prepared(straightRoute(3000, []));
    expect(remainingAlongM({ ...initProgress(r.id), alongM: 2900 }, r)).toBeCloseTo(100, 0);
    expect(remainingAlongM({ ...initProgress(r.id), alongM: 3500 }, r)).toBe(0);
  });
});

describe('dead reckoning and GPS lost', () => {
  const r = prepared(straightRoute(3000, [[1000, 'turn', 'left']]));
  const base: Progress = { ...initProgress(r.id), alongM: 500, displayAlongM: 500, joined: true, lastGoodAt: 10_000, lastSpeedMps: 20 };
  it('does nothing in the first 2 s, then takes v x dt off the displayed distance', () => {
    expect(deadReckonM(base, 11_000)).toBe(0);
    expect(deadReckonM(base, 12_000)).toBeCloseTo(40);
    expect(maneuverDistanceM(base, r, 14_000)).toBeCloseTo(1000 - 500 - 80, 0);
  });
  it('is capped at 10 s, never goes below 0 and never moves idx', () => {
    expect(deadReckonM(base, 20_000)).toBeCloseTo(200); // 10 s
    expect(deadReckonM(base, 20_001)).toBe(0); // GPS lost, or an old fix after a resume: no extrapolation (L6)
    expect(deadReckonM(base, 60_000)).toBe(0);
    const near = { ...base, alongM: 990, displayAlongM: 990 };
    expect(maneuverDistanceM(near, r, 20_000)).toBe(0);
  });
  it('needs a speed of at least 15 km/h', () => {
    expect(deadReckonM({ ...base, lastSpeedMps: 3 }, 20_000)).toBe(0);
    expect(deadReckonM({ ...base, lastSpeedMps: null }, 20_000)).toBe(0);
    expect(deadReckonM({ ...base, lastGoodAt: null }, 20_000)).toBe(0);
  });
  it('GPS is lost after 10 s without a good fix (from the last one, else from the start)', () => {
    expect(gpsLost(10_000, 0, 19_999)).toBe(false);
    expect(gpsLost(10_000, 0, 20_000)).toBe(true);
    expect(gpsLost(null, 5000, 14_999)).toBe(false);
    expect(gpsLost(null, 5000, 15_000)).toBe(true);
    // A later start (resume) restarts the clock.
    expect(gpsLost(10_000, 19_000, 25_000)).toBe(false);
  });
});

describe('off route (spec 3.8)', () => {
  const r = prepared(straightRoute(3000, [[1000, 'turn', 'left']]));
  it('the off-route distance scales with accuracy, between 35 and 75 m', () => {
    expect(isOffFix(36, 5)).toBe(true); // 5 m accuracy -> limit 35
    expect(isOffFix(35, 5)).toBe(false);
    expect(isOffFix(45, 30)).toBe(false); // limit 1.5 x 30
    expect(isOffFix(46, 30)).toBe(true);
    expect(isOffFix(76, 200)).toBe(true); // capped at 75
    expect(isOffFix(74, 200)).toBe(false);
    expect(isOffFix(35, null)).toBe(false); // unknown accuracy counts as 20 m: limit 35
    expect(isOffFix(36, null)).toBe(true);
  });
  it('offRouteNow: 3 consecutive fixes, or one more than 250 m away', () => {
    expect(offRouteNow(2, 100)).toBe(false);
    expect(offRouteNow(3, 100)).toBe(true);
    expect(offRouteNow(1, 251)).toBe(true);
    expect(offRouteNow(1, 250)).toBe(false);
  });
  it('goes off route after 3 good off fixes and back after 2 on fixes', () => {
    const { trace } = run(r, [
      fix(500),
      fix(520, { northM: 60 }),
      fix(540, { northM: 80 }),
      fix(560, { northM: 100 }),
      fix(580, { northM: 3 }),
      fix(600, { northM: 2 }),
    ]);
    expect(trace.map((p) => p.offRoute)).toEqual([false, false, false, true, true, false]);
  });
  it('one on fix breaks a run of off fixes (they must be consecutive)', () => {
    const { p } = run(r, [fix(500), fix(520, { northM: 60 }), fix(540, { northM: 60 }), fix(560, { northM: 2 }), fix(580, { northM: 60 })]);
    expect(p.offRoute).toBe(false);
    expect(p.offCount).toBe(1);
  });
  it('one fix more than 250 m away is off route at once', () => {
    expect(run(r, [fix(500), fix(520, { northM: 300 })]).p.offRoute).toBe(true);
  });
  it('poor fixes never count toward off route', () => {
    const { p } = run(r, [fix(500), ...Array.from({ length: 6 }, (_, i) => fix(520 + i * 20, { northM: 200, accuracyM: 90 }))]);
    expect(p.offRoute).toBe(false);
    expect(p.offCount).toBe(0);
  });
  it('a larger accuracy tolerates more distance from the line', () => {
    // 50 m off with 40 m accuracy (limit 60) is still on route; with 5 m accuracy it is off.
    expect(run(r, [fix(500), ...[1, 2, 3].map((i) => fix(500 + i * 20, { northM: 50, accuracyM: 40 }))]).p.offRoute).toBe(false);
    expect(run(r, [fix(500), ...[1, 2, 3].map((i) => fix(500 + i * 20, { northM: 50, accuracyM: 5 }))]).p.offRoute).toBe(true);
  });
  it('does not advance a step while a fix is off the line', () => {
    expect(run(r, [fix(500), fix(1100, { northM: 200 })]).p.idx).toBe(0);
  });
});

describe('reroute timing (spec 3.8)', () => {
  const base = { offRoute: true, lastFetchAt: 0, failures: 0, inFlight: false, now: 10_000 };
  it('needs off route, nothing in flight and online', () => {
    expect(shouldRerouteNav(base)).toBe(true);
    expect(shouldRerouteNav({ ...base, offRoute: false })).toBe(false);
    expect(shouldRerouteNav({ ...base, inFlight: true })).toBe(false);
    expect(shouldRerouteNav({ ...base, offline: true })).toBe(false);
  });
  it('waits at least 10 s after the last fetch', () => {
    expect(shouldRerouteNav({ ...base, now: 9_999 })).toBe(false);
    expect(shouldRerouteNav({ ...base, now: 10_000 })).toBe(true);
  });
  it('backs off 10 / 20 / 40 / 60 s after failures, then stays at 60 s', () => {
    expect(NAV_REROUTE_BACKOFF_S).toEqual([10, 20, 40, 60]);
    expect([0, 1, 2, 3, 4, 9].map(backoffMs)).toEqual([10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
    expect(shouldRerouteNav({ ...base, failures: 1, now: 19_999 })).toBe(false);
    expect(shouldRerouteNav({ ...base, failures: 1, now: 20_000 })).toBe(true);
    expect(shouldRerouteNav({ ...base, failures: 3, now: 59_999 })).toBe(false);
    expect(shouldRerouteNav({ ...base, failures: 7, now: 60_000 })).toBe(true);
  });
});

describe('route requests and the 1 req/s ceiling', () => {
  const base = { hasRoute: false, offRoute: false, lastFetchAt: -Infinity, lastRequestAt: -Infinity, failures: 0, inFlight: false, now: 5_000 };
  it('the first request for a missing route goes at once', () => {
    expect(shouldFetchNavRoute(base)).toBe(true);
  });
  it('retries a missing route on the backoff (10, 20, 40, 60 s)', () => {
    const f = { ...base, lastFetchAt: 5_000 };
    expect(shouldFetchNavRoute({ ...f, failures: 1, now: 14_999 })).toBe(false);
    expect(shouldFetchNavRoute({ ...f, failures: 1, now: 15_000 })).toBe(true);
    expect(shouldFetchNavRoute({ ...f, failures: 2, now: 24_999 })).toBe(false);
    expect(shouldFetchNavRoute({ ...f, failures: 2, now: 25_000 })).toBe(true);
    expect(shouldFetchNavRoute({ ...f, failures: 6, now: 64_999 })).toBe(false);
    expect(shouldFetchNavRoute({ ...f, failures: 6, now: 65_000 })).toBe(true);
  });
  it('does not fetch while one is in flight or offline', () => {
    expect(shouldFetchNavRoute({ ...base, inFlight: true })).toBe(false);
    expect(shouldFetchNavRoute({ ...base, offline: true })).toBe(false);
  });
  it('with a route it only reroutes when off route', () => {
    expect(shouldFetchNavRoute({ ...base, hasRoute: true, lastFetchAt: 0, now: 60_000 })).toBe(false);
    expect(shouldFetchNavRoute({ ...base, hasRoute: true, offRoute: true, lastFetchAt: 0, now: 60_000 })).toBe(true);
  });
  it('never sends two requests within a second, whatever the reason', () => {
    expect(shouldFetchNavRoute({ ...base, lastRequestAt: 4_500 })).toBe(false);
    expect(shouldFetchNavRoute({ ...base, lastRequestAt: 4_000 })).toBe(true);
    expect(shouldFetchNavRoute({ ...base, hasRoute: true, offRoute: true, lastFetchAt: -Infinity, lastRequestAt: 4_900 })).toBe(false);
  });
});

describe('startBearing', () => {
  it('is the course while moving at least 15 km/h', () => {
    expect(startBearing({ courseDeg: 90, speedMps: 5 })).toBe(90);
    expect(startBearing({ courseDeg: 360, speedMps: 5 })).toBe(0);
  });
  it('is null when slow, unknown or invalid (a malformed bearing is a 400)', () => {
    expect(startBearing({ courseDeg: 90, speedMps: 3 })).toBeNull();
    expect(startBearing({ courseDeg: 90, speedMps: null })).toBeNull();
    expect(startBearing({ courseDeg: null, speedMps: 20 })).toBeNull();
    expect(startBearing({ courseDeg: NaN, speedMps: 20 })).toBeNull();
    expect(startBearing({ courseDeg: -1, speedMps: 20 })).toBeNull();
    expect(startBearing({ courseDeg: 400, speedMps: 20 })).toBeNull();
  });
});


// ---------------------------------------------------------------- review fixes (P2 review, H2 H3 M1)

/** A route out east `out` m, a `gap` m hop north, then back west `back` m: a divided road with a U-turn. */
function outAndBack(out = 1000, back = 1500, gap = 15) {
  const east = Array.from({ length: out / 50 + 1 }, (_, i) => at(i * 50, 0));
  const west = Array.from({ length: back / 50 + 1 }, (_, i) => at(out - i * 50, gap));
  const total = out + gap + back;
  const route: NavRoute = {
    coords: [...east, ...west],
    distanceM: total,
    durationS: total / 10,
    steps: [step('depart', null, 0), step('turn', 'uturn', out), step('arrive', null, total)],
  };
  return prepared(route);
}

describe('H2: a poor fix never moves the persistent distance', () => {
  it('poor fix 100 m ahead, then a good fix before the maneuver: no early advance', () => {
    const r = prepared(straightRoute(3000, [[1000, 'turn', 'left'], [2000, 'turn', 'right']]));
    const { p, trace } = run(r, [fix(900), fix(1100, { accuracyM: 80 }), fix(990)]);
    expect(trace[1].idx).toBe(0);
    expect(p.idx).toBe(0);
    expect(p.alongM).toBeCloseTo(990, -1);
  });
});

describe('H3: divided roads and U-turns', () => {
  const jitter = (r: ReturnType<typeof prepared>, course: number | null) => {
    // Riding east on the outbound carriageway but with the fix 11 m north: 4 m from the return carriageway.
    const fixes = Array.from({ length: 30 }, (_, i) => fix(400 + i * 20, { northM: 11, courseDeg: course }));
    return run(r, fixes);
  };

  it('jittery fixes on the outbound side never advance the U-turn (course known)', () => {
    const r = outAndBack();
    const { p, trace } = jitter(r, 90);
    expect(trace.every((t) => t.idx === 0)).toBe(true);
    expect(p.alongM).toBeLessThan(1000);
  });

  it('...nor without a course (stationary, slow, or none reported)', () => {
    const r = outAndBack();
    const { p, trace } = jitter(r, null);
    expect(trace.every((t) => t.idx === 0)).toBe(true);
    expect(p.alongM).toBeLessThan(1000);
  });

  it('a genuine U-turn advances once the rider is on the return carriageway', () => {
    for (const course of [270, null]) {
      const r = outAndBack();
      const fixes = [
        ...Array.from({ length: 61 }, (_, i) => fix(400 + i * 10, { speedMps: 10, courseDeg: 90 })),
        fix(1000, { northM: 7, speedMps: 5, courseDeg: course === null ? null : 0 }),
        ...Array.from({ length: 12 }, (_, i) => fix(990 - i * 10, { northM: 15, speedMps: 10, courseDeg: course })),
      ];
      const { p } = run(r, fixes);
      expect(p.idx).toBe(1);
      expect(p.alongM).toBeGreaterThan(1100);
    }
  });

  it('the first fix of an out-and-back route (stationary at the start) is the start, not the return pass', () => {
    const r = outAndBack();
    // 10 m north: 5 m from the return carriageway (which passes the start at ~2000 m), 10 m from the outbound one.
    const p = stepProgress(initProgress(r.id), fix(0, { northM: 10, speedMps: 0, courseDeg: null }), r, 5000);
    expect(p.alongM).toBeLessThan(60);
    expect(p.idx).toBe(0);
  });

  it('a lone implausible jump is held; two consistent ones are accepted', () => {
    const r = prepared(straightRoute(5000, [[4000, 'turn', 'left']]));
    // 900 m ahead of the last fix 1 s later, on the line (a GPS glitch).
    let p = stepProgress(initProgress(r.id), fix(500), r, 1000);
    p = stepProgress(p, fix(1400), r, 2000);
    expect(p.alongM).toBeCloseTo(500, -1);
    p = stepProgress(p, fix(1410), r, 3000);
    expect(p.alongM).toBeCloseTo(1410, -1);
  });
});

describe('M1: roundabout exits are passed at the exit, not at the entry', () => {
  const roundabout = () => {
    const base = straightRoute(3000, []);
    return prepared({
      ...base,
      steps: [
        step('depart', null, 0),
        step('roundabout', null, 1000, { exit: 2 }),
        step('exit roundabout', 'right', 1250),
        step('turn', 'left', 2000),
        step('arrive', null, 3000),
      ],
    });
  };
  it('still circling 80 m and 200 m past the entry: not advanced', () => {
    const { trace } = run(roundabout(), [fix(990), fix(1010), fix(1040), fix(1080), fix(1120), fix(1200)]);
    expect(trace.every((p) => p.idx === 0)).toBe(true);
  });
  it('advances once past the exit point', () => {
    const { trace } = run(roundabout(), [fix(990), fix(1200), fix(1260), fix(1275), fix(1290)]);
    expect(trace.map((p) => p.idx)).toEqual([0, 0, 0, 0, 1]);
  });
});

describe('notBefore: a server retryAfter on top of the backoff (24 §3.3)', () => {
  const base = { offRoute: true, lastFetchAt: 0, lastRequestAt: 0, failures: 0, inFlight: false, now: 100_000, hasRoute: true };
  it('holds a due reroute until notBefore', () => {
    expect(shouldRerouteNav({ ...base, notBefore: 130_000 })).toBe(false);
    expect(shouldRerouteNav({ ...base, notBefore: 100_000 })).toBe(true);
    expect(shouldFetchNavRoute({ ...base, notBefore: 130_000 })).toBe(false);
  });
  it('holds the first/retried fetch when there is no route', () => {
    expect(shouldFetchNavRoute({ ...base, hasRoute: false, lastFetchAt: -Infinity, notBefore: 100_001 })).toBe(false);
    expect(shouldFetchNavRoute({ ...base, hasRoute: false, lastFetchAt: -Infinity, notBefore: 100_000 })).toBe(true);
  });
  it('the backoff still applies when notBefore has passed', () => {
    expect(shouldRerouteNav({ ...base, failures: 1, lastFetchAt: 95_000, notBefore: 90_000 })).toBe(false); // 20 s gap needed
  });
});
