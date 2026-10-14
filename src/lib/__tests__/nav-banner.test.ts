import { copy } from '../copy';
import { describeBanner, maneuverAnnouncement, relativeBearing } from '../nav-banner-view';
import { EMPTY_ENGINE, isNavActive, maneuverKey, newestPosition, pickOrigin, selectBanner, type BannerInput, type NavEngineState } from '../nav-engine';
import { initProgress, prepareRoute, stepProgress } from '../nav-progress';
import { at, fix, straightRoute } from '../__fixtures__/nav-fixtures';
import type { NavStep } from '../nav-steps';

jest.mock('expo-sqlite/localStorage/install', () => ({}));

const route = straightRoute(3000, [[1000, 'turn', 'left'], [1300, 'turn', 'right'], [2500, 'turn', 'left']]);
const prepared = prepareRoute(route, 1);
const progressAt = (m: number) => stepProgress(initProgress(1), fix(m), prepared, 50_000);

const engine = (over: Partial<NavEngineState> = {}): NavEngineState => ({
  ...EMPTY_ENGINE,
  active: true,
  rideId: 'r',
  key: 'k',
  dest: at(3000),
  startedAt: 50_000,
  routeStatus: 'ok',
  prepared,
  progress: progressAt(500),
  fix: fix(500),
  ...over,
});

const input = (over: Partial<BannerInput> = {}): BannerInput => ({
  active: true,
  engine: engine(),
  locationOk: true,
  netOffline: false,
  now: 51_000,
  me: at(500),
  dest: at(3000),
  ...over,
});

describe('selectBanner', () => {
  it('is null when navigation is off', () => {
    expect(selectBanner(input({ active: false }))).toBeNull();
  });

  it('guide: the next maneuver, its distance, and the Then row when the next one is within 500 m', () => {
    const b = selectBanner(input());
    expect(b?.kind).toBe('guide');
    expect(b?.step?.type).toBe('turn');
    expect(b?.distanceM).toBeCloseTo(500, 0);
    expect(b?.then?.modifier).toBe('right'); // 300 m after
    expect(b?.height).toBe(136);
  });

  it('no Then row when the next maneuver is far: 96 dp', () => {
    const b = selectBanner(input({ engine: engine({ progress: { ...progressAt(1400), idx: 1 } }) }));
    expect(b?.kind).toBe('guide');
    expect(b?.then).toBeNull();
    expect(b?.height).toBe(96);
  });

  it('guide shortens the distance by dead reckoning, never advances the step', () => {
    const p = { ...progressAt(500), lastGoodAt: 50_000, lastSpeedMps: 20 };
    const b = selectBanner(input({ engine: engine({ progress: p }), now: 54_000 }));
    expect(b?.distanceM).toBeCloseTo(500 - 80, 0);
    expect(b?.step).toBe(prepared.announced[0]);
  });

  it('starting: the first fetch is in flight and no route is known', () => {
    const b = selectBanner(input({ engine: engine({ prepared: null, progress: null, routeStatus: 'loading', fetching: true }) }));
    expect(b?.kind).toBe('starting');
    expect(b?.height).toBe(96);
  });

  it('starting before the engine has started at all', () => {
    expect(selectBanner(input({ engine: EMPTY_ENGINE, me: null }))?.kind).toBe('starting');
  });

  it('noRoute: a settled failure with a position, with the straight-line distance and bearing', () => {
    const b = selectBanner(input({ engine: engine({ prepared: null, progress: null, routeStatus: 'unavailable' }) }));
    expect(b?.kind).toBe('noRoute');
    expect(b?.straightM).toBeCloseTo(2500, -1);
    expect(b?.bearingDeg).toBeCloseTo(90, 0);
  });

  it('a failed route with no position yet is still "starting"', () => {
    const b = selectBanner(
      input({ engine: engine({ prepared: null, progress: null, routeStatus: 'unavailable', fix: null }), me: null }),
    );
    expect(b?.kind).toBe('starting');
  });

  it('rerouting: off route and online; offlineOffRoute: off route and offline', () => {
    const off = engine({ progress: { ...progressAt(500), offRoute: true } });
    expect(selectBanner(input({ engine: off }))?.kind).toBe('rerouting');
    expect(selectBanner(input({ engine: off, netOffline: true }))?.kind).toBe('offlineOffRoute');
  });

  it('toRoad: a route but not on it yet; the banner says to head to the road', () => {
    const e = engine({ progress: { ...initProgress(1), joined: false }, lastGoodFixAt: 50_500 });
    const b = selectBanner(input({ engine: e }));
    expect(b?.kind).toBe('toRoad');
    expect(describeBanner(b!, { place: '', mapBearing: 0 })).toMatchObject({ line1: 'Head to the road', tone: 'blue' });
  });

  it('viewer offline but on route: stays in guide', () => {
    expect(selectBanner(input({ netOffline: true }))?.kind).toBe('guide');
  });

  it('noGps after 10 s without a good fix, and when location is off', () => {
    const e = engine({ lastGoodFixAt: 50_000 });
    expect(selectBanner(input({ engine: e, now: 59_999 }))?.kind).toBe('guide');
    expect(selectBanner(input({ engine: e, now: 60_000 }))?.kind).toBe('noGps');
    expect(selectBanner(input({ locationOk: false }))?.kind).toBe('noGps');
  });

  it('noGps counts from the start before any good fix', () => {
    const e = engine({ progress: { ...initProgress(1), joined: true }, fix: null, startedAt: 50_000 });
    expect(selectBanner(input({ engine: e, now: 59_000 }))?.kind).toBe('guide');
    expect(selectBanner(input({ engine: e, now: 60_000 }))?.kind).toBe('noGps');
  });

  it('priority: noGps > offlineOffRoute > rerouting > starting > noRoute > guide', () => {
    const lostOff = engine({ progress: { ...progressAt(500), offRoute: true }, lastGoodFixAt: 1_000 });
    expect(selectBanner(input({ engine: lostOff, now: 60_000, netOffline: true }))?.kind).toBe('noGps');
    expect(selectBanner(input({ engine: lostOff, now: 2_000, netOffline: true }))?.kind).toBe('offlineOffRoute');
    expect(selectBanner(input({ engine: lostOff, now: 2_000 }))?.kind).toBe('rerouting');
  });
});

describe('describeBanner', () => {
  const view = (b: ReturnType<typeof selectBanner>) => {
    if (!b) throw new Error('no banner');
    return describeBanner(b, { place: 'Mysuru Palace', mapBearing: 0 });
  };

  it('guide: arrow, distance, instruction (primary + road) and the Then row', () => {
    const e = engine({ prepared: prepareRoute({ ...route, steps: route.steps!.map((s): NavStep => (s.type === 'turn' && s.alongM === 1000 ? { ...s, ref: 'NH275' } : s)) }, 1) });
    const v = view(selectBanner(input({ engine: { ...e, progress: progressAt(500) } })));
    expect(v).toMatchObject({
      tone: 'blue',
      icon: 'turnLeft',
      line1: '500 m',
      line1Big: true,
      primary: 'Turn left',
      road: 'onto NH275',
      line2Sub: false,
      then: { icon: 'turnRight', text: 'Turn right' },
    });
    expect(v.a11y).toBe('In 500 metres, turn left onto N H 275. Then turn right.');
    expect(v.a11yHint).toBe('Repeats the instruction.'); // the gesture is the screen reader's job, not part of the label
  });

  it('guide under 15 m reads "Now"', () => {
    const v = view(selectBanner(input({ engine: engine({ progress: progressAt(995) }) })));
    expect(v.line1).toBe('Now');
    expect(v.a11y.startsWith('Now, turn left')).toBe(true);
  });

  it('starting, rerouting: blue with a status line and a sub line', () => {
    const starting = view(selectBanner(input({ engine: EMPTY_ENGINE })));
    expect(starting).toMatchObject({ tone: 'blue', icon: 'navigate', line1: 'Getting directions', primary: 'This takes a few seconds', line2Sub: true, then: null });
    const re = view(selectBanner(input({ engine: engine({ progress: { ...progressAt(500), offRoute: true } }) })));
    expect(re).toMatchObject({ tone: 'blue', icon: 'reroute', line1: 'Rerouting', primary: 'Finding a new route' });
  });

  it('offline-off-route and no-GPS are grey (offline colour), never amber', () => {
    const off = view(selectBanner(input({ engine: engine({ progress: { ...progressAt(500), offRoute: true } }), netOffline: true })));
    expect(off).toMatchObject({ tone: 'grey', icon: 'offline', line1: 'Off route', primary: "New route when you're back online" });
    const gps = view(selectBanner(input({ locationOk: false })));
    expect(gps).toMatchObject({ tone: 'grey', icon: 'noGps', line1: 'GPS signal lost', primary: 'Directions paused' });
  });

  it('noRoute: a compass arrow turned by bearing minus the map bearing, with the approximate distance', () => {
    const b = selectBanner(input({ engine: engine({ prepared: null, progress: null, routeStatus: 'unavailable' }) }));
    const v = describeBanner(b!, { place: '', mapBearing: 30 });
    expect(v).toMatchObject({ tone: 'blue', icon: 'navigation', line1Big: true, primary: 'Route unavailable · retrying' });
    expect(v.line1).toMatch(/^≈ 2\.\d km$/);
    expect(v.iconRotateDeg).toBeCloseTo(60, 0);
  });

  it('relativeBearing wraps to 0..360', () => {
    expect(relativeBearing(10, 350)).toBe(20);
    expect(relativeBearing(350, 10)).toBe(340);
    expect(relativeBearing(90, 90)).toBe(0);
  });
});

describe('maneuver announcements and keys', () => {
  it('the announcement is the now-form instruction only for a guide banner', () => {
    expect(maneuverAnnouncement(selectBanner(input()), 'Mysuru Palace')).toBe('Turn left');
    expect(maneuverAnnouncement(selectBanner(input({ locationOk: false })), 'X')).toBe('');
    expect(maneuverAnnouncement(null, 'X')).toBe('');
  });
  it('the key changes with the maneuver (and the route), not with the distance', () => {
    const k1 = maneuverKey(selectBanner(input({ engine: engine({ progress: progressAt(100) }) })), 1);
    const k2 = maneuverKey(selectBanner(input({ engine: engine({ progress: progressAt(400) }) })), 1);
    const k3 = maneuverKey(selectBanner(input({ engine: engine({ progress: progressAt(1100) }) })), 1);
    expect(k1).toBe(k2);
    expect(k3).not.toBe(k1);
    expect(maneuverKey(selectBanner(input({ engine: engine({ progress: progressAt(100) }) })), 2)).not.toBe(k1);
    expect(maneuverKey(null, 1)).toBe('');
  });
});

describe('isNavActive', () => {
  const base = { solo: true, rideLive: true, hasStop: true, arrived: false, engineRunning: false };
  it('solo, live, with a stop that is not arrived at', () => {
    expect(isNavActive(base)).toBe(true);
    expect(isNavActive({ ...base, hasStop: false })).toBe(false);
    expect(isNavActive({ ...base, arrived: true })).toBe(false);
    expect(isNavActive({ ...base, rideLive: false })).toBe(false);
  });
  it('a group does not start navigation, but a running session continues when someone joins', () => {
    expect(isNavActive({ ...base, solo: false })).toBe(false);
    expect(isNavActive({ ...base, solo: false, engineRunning: true })).toBe(true);
    expect(isNavActive({ ...base, solo: false, engineRunning: true, arrived: true })).toBe(false);
  });
});

describe('newestPosition', () => {
  const a = { lat: 1, lng: 1, t: 2000 };
  const b = { lat: 2, lng: 2, t: 1000 };
  it('picks the newer; the local fix wins a tie; either alone', () => {
    expect(newestPosition(a, b)).toBe(a);
    expect(newestPosition(b, a)).toBe(a);
    expect(newestPosition(a, { ...b, t: 2000 })).toBe(a);
    expect(newestPosition(a, null)).toBe(a);
    expect(newestPosition(null, b)).toBe(b);
    expect(newestPosition(null, null)).toBeNull();
  });
});

describe('L4: pickOrigin', () => {
  const o = (t: number, lat = 1) => ({ lat, lng: 2, t });
  it('takes the newest candidate that is at most 30 s old', () => {
    expect(pickOrigin([o(90_000, 1), o(99_000, 2), o(95_000, 3)], 100_000)).toEqual({ lat: 2, lng: 2 });
  });
  it('rejects a stale server echo: a cold start waits for the first local fix', () => {
    expect(pickOrigin([o(60_000)], 100_000)).toBeNull();
    expect(pickOrigin([null, null], 100_000)).toBeNull();
  });
  it('prefers a fresh local fix over a 5 s old echo', () => {
    expect(pickOrigin([o(95_000, 1), o(99_500, 9)], 100_000)).toEqual({ lat: 9, lng: 2 });
  });
});

describe('voice screen-reader text (L6)', () => {
  it('labels say what the control is; what a tap does lives in the hint, never "Double-tap" in the label', () => {
    for (const k of ['nav.a11yBanner', 'nav.a11yVoiceOn', 'nav.a11yVoiceOff'] as const) {
      expect(copy[k]).not.toMatch(/double-tap/i);
    }
    expect(copy['nav.a11yVoiceOnHint']).toBe('Mutes voice directions.');
    expect(copy['nav.a11yVoiceOffHint']).toBe('Turns voice directions on.');
  });
});
