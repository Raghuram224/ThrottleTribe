import {
  afterSwitch,
  attributionFade,
  attributionInSheet,
  confirmedSwitch,
  browsePadding,
  categoryWord,
  choiceStep,
  chipsTop,
  firstRunSeenOnSnap,
  HOME_CAMERA_SAVE_MS,
  HOME_FALLBACK_CAMERA,
  homeMapMounted,
  homeSheetBlocks,
  initialCamera,
  initialSheetSnap,
  isFirstRun,
  meSlotForHome,
  newRideHref,
  openRideCard,
  parseCamera,
  peekRecentCount,
  placePadding,
  placeSubline,
  placeSummaryA11y,
  planBack,
  roundCamera,
  searchBarTarget,
  settleHomeSnap,
  shouldSaveCamera,
  toggleHomeSnap,
  whereToHref,
  type SheetBlocksInput,
} from '../plan-flow';

describe('planBack (22 §2.1, §5.1)', () => {
  it('route from a search result steps back to its place sheet', () => {
    expect(planBack({ mode: 'route', from: 'search', sheetSnap: 'peek' })).toEqual({ mode: 'place', sheetSnap: 'peek' });
  });
  it('route from a recent place goes back to browse', () => {
    expect(planBack({ mode: 'route', from: 'recent', sheetSnap: 'peek' })).toEqual({ mode: 'browse', sheetSnap: 'peek' });
    expect(planBack({ mode: 'route', from: null, sheetSnap: 'peek' })).toEqual({ mode: 'browse', sheetSnap: 'peek' });
  });
  it('place goes back to browse', () => {
    expect(planBack({ mode: 'place', from: 'search', sheetSnap: 'peek' })).toEqual({ mode: 'browse', sheetSnap: 'peek' });
  });
  it('browse: an expanded sheet collapses first, then the OS leaves the app', () => {
    expect(planBack({ mode: 'browse', from: null, sheetSnap: 'expanded' })).toEqual({ mode: 'browse', sheetSnap: 'peek' });
    expect(planBack({ mode: 'browse', from: null, sheetSnap: 'peek' })).toBeNull();
  });
  it('walks the whole stack: route(search) -> place -> browse -> collapse -> leave', () => {
    type Cur = { mode: 'browse' | 'place' | 'route'; from: 'search' | 'recent' | null; sheetSnap: 'peek' | 'expanded' };
    let cur: Cur = { mode: 'route', from: 'search', sheetSnap: 'expanded' };
    const steps: string[] = [];
    for (let i = 0; i < 6; i++) {
      const next = planBack(cur);
      if (!next) {
        steps.push('leave');
        break;
      }
      steps.push(`${next.mode}/${next.sheetSnap}`);
      cur = { ...cur, ...next };
    }
    expect(steps).toEqual(['place/expanded', 'browse/expanded', 'browse/peek', 'leave']);
  });
});

describe('open ride (22 §3.10)', () => {
  it('openRideCard', () => {
    expect(openRideCard(null)).toBe('none');
    expect(openRideCard({ status: 'ended' })).toBe('none');
    expect(openRideCard({ status: 'lobby' })).toBe('lobby');
    expect(openRideCard({ status: 'active' })).toBe('active');
  });
  it('the search bar searches stops for an active ride, otherwise Where to?', () => {
    expect(searchBarTarget(null)).toEqual({ kind: 'where-to' });
    expect(searchBarTarget({ id: 'r1', status: 'lobby' })).toEqual({ kind: 'where-to' });
    expect(searchBarTarget({ id: 'r1', status: 'active' })).toEqual({ kind: 'stops', href: '/ride/r1/search?from=home' });
  });
  it('whereToHref', () => {
    expect(whereToHref({ focus: true })).toBe('/where-to?focus=1');
    expect(whereToHref({ chip: 'fuel' })).toBe('/where-to?chip=fuel');
    expect(whereToHref({ q: 'Mysuru Palace' })).toBe('/where-to?q=Mysuru+Palace');
    expect(whereToHref({})).toBe('/where-to');
  });
});

describe('homeSheetBlocks (22 §3.1.2)', () => {
  const base: SheetBlocksInput = {
    firstRun: false,
    openRide: 'none',
    recentPlaces: 3,
    locationGranted: true,
    hasNudge: true,
    hasStats: true,
    showRecentRides: true,
  };
  it('first run: sub + tiles in the peek; location row, steps, nudge expanded', () => {
    expect(homeSheetBlocks({ ...base, firstRun: true, locationGranted: false })).toEqual({
      peek: ['firstSub', 'tiles'],
      expanded: ['locationRow', 'steps', 'nudge'],
    });
    expect(homeSheetBlocks({ ...base, firstRun: true, hasNudge: false })).toEqual({
      peek: ['firstSub', 'tiles'],
      expanded: ['steps'],
    });
  });
  it('returning: tiles + recent peek; then recents, location, nudge, stats, rides', () => {
    expect(homeSheetBlocks({ ...base, locationGranted: false })).toEqual({
      peek: ['tiles', 'recentPeek'],
      expanded: ['recentPlaces', 'locationRow', 'nudge', 'stats', 'recentRides'],
    });
  });
  it('returning with no recent places has only the tiles in the peek', () => {
    const b = homeSheetBlocks({ ...base, recentPlaces: 0 });
    expect(b.peek).toEqual(['tiles']);
    expect(b.expanded).not.toContain('recentPlaces');
  });
  it('an open ride hides the tiles; the card is the only peek block', () => {
    expect(homeSheetBlocks({ ...base, openRide: 'active' })).toEqual({ peek: ['rideCard'], expanded: ['nudge', 'recentRides'] });
    expect(homeSheetBlocks({ ...base, openRide: 'lobby' })).toEqual({
      peek: ['rideCard'],
      expanded: ['nudge', 'recentPlaces', 'recentRides'],
    });
    for (const openRide of ['active', 'lobby'] as const) {
      const b = homeSheetBlocks({ ...base, openRide });
      expect([...b.peek, ...b.expanded]).not.toContain('tiles');
    }
  });
  it('never offers the tiles and "Back to ride" together (one primary)', () => {
    const b = homeSheetBlocks({ ...base, openRide: 'lobby' });
    expect(b.peek.includes('tiles') && b.peek.includes('rideCard')).toBe(false);
  });
});

describe('first run (22 §3.1.2)', () => {
  it('is known only once the rides have loaded, and not with a ride open', () => {
    expect(isFirstRun(null, false)).toBe(false);
    expect(isFirstRun([], false)).toBe(true);
    expect(isFirstRun([], true)).toBe(false);
    expect(isFirstRun([{}], false)).toBe(false);
  });
  it('the sheet opens expanded once on the first run', () => {
    expect(initialSheetSnap(true, false)).toBe('expanded');
    expect(initialSheetSnap(true, true)).toBe('peek');
    expect(initialSheetSnap(false, false)).toBe('peek');
  });
  it('the welcome counts as seen the first time the sheet is collapsed', () => {
    expect(firstRunSeenOnSnap(true, false, 'peek')).toBe(true);
    expect(firstRunSeenOnSnap(true, false, 'expanded')).toBe(false);
    expect(firstRunSeenOnSnap(true, true, 'peek')).toBe(false);
    expect(firstRunSeenOnSnap(false, false, 'peek')).toBe(false);
  });
});

describe('peekRecentCount', () => {
  it('2 rows on a tall phone, 1 on a short one, never more than there are', () => {
    expect(peekRecentCount(800, 5)).toBe(2);
    expect(peekRecentCount(760, 5)).toBe(2);
    expect(peekRecentCount(759, 5)).toBe(1);
    expect(peekRecentCount(800, 1)).toBe(1);
    expect(peekRecentCount(800, 0)).toBe(0);
  });
});

describe('homeMapMounted (22 §4.3)', () => {
  it('only Home, search, setup and the preview redirect keep the map', () => {
    for (const p of ['/home', '/where-to', '/new-ride', '/route-preview', '/home/', '/home?welcome=1']) {
      expect(homeMapMounted(p)).toBe(true);
    }
  });
  it('every ride screen and everything else unmounts it (one GL map at a time)', () => {
    for (const p of ['/ride/abc/live', '/ride/abc/lobby', '/ride/abc/search', '/permissions', '/profile', '/join', '/rides', '/']) {
      expect(homeMapMounted(p)).toBe(false);
    }
  });
});

describe('meSlotForHome (22 §3.1.1)', () => {
  const ok = { permission: 'granted' as const, servicesEnabled: true, hasFix: true, cameraFree: false, sheetExpanded: false };
  it('centred on a fix: nothing; panned: re-centre', () => {
    expect(meSlotForHome(ok)).toBe('none');
    expect(meSlotForHome({ ...ok, cameraFree: true })).toBe('recentre');
  });
  it('granted without a fix: finding you', () => {
    expect(meSlotForHome({ ...ok, hasFix: false })).toBe('finding');
  });
  it('not granted (undetermined, denied) or services off: show my location', () => {
    expect(meSlotForHome({ ...ok, permission: 'undetermined', hasFix: false })).toBe('show');
    expect(meSlotForHome({ ...ok, permission: 'denied', hasFix: false })).toBe('show');
    expect(meSlotForHome({ ...ok, servicesEnabled: false })).toBe('show');
  });
  it('unknown permission shows nothing (no flash before the first read); expanded sheet hides it', () => {
    expect(meSlotForHome({ ...ok, permission: 'unknown' })).toBe('none');
    expect(meSlotForHome({ ...ok, permission: 'denied', sheetExpanded: true })).toBe('none');
  });
});

describe('camera persistence (22 §4.2)', () => {
  it('saves at most once per 5 s', () => {
    expect(shouldSaveCamera(null, 1000)).toBe(true);
    expect(shouldSaveCamera(1000, 1000 + HOME_CAMERA_SAVE_MS - 1)).toBe(false);
    expect(shouldSaveCamera(1000, 1000 + HOME_CAMERA_SAVE_MS)).toBe(true);
  });
  it('rounds to about 100 m', () => {
    expect(roundCamera({ lat: 12.345678, lng: 76.987654, zoom: 14.76 })).toEqual({ lat: 12.346, lng: 76.988, zoom: 14.8 });
  });
  it('parses only valid cameras', () => {
    expect(parseCamera('{"lat":12.3,"lng":76.6,"zoom":14}')).toEqual({ lat: 12.3, lng: 76.6, zoom: 14 });
    for (const bad of [null, '', 'x', '{"lat":"a"}', '{"lat":99,"lng":0,"zoom":3}', '{"lat":1,"lng":1,"zoom":99}', '[]']) {
      expect(parseCamera(bad)).toBeNull();
    }
  });
  it('first frame: saved camera, else my fix at zoom 15, else India at zoom 4', () => {
    const saved = { lat: 1, lng: 2, zoom: 9 };
    expect(initialCamera(saved, { lat: 5, lng: 6 })).toBe(saved);
    expect(initialCamera(null, { lat: 5, lng: 6 })).toEqual({ lat: 5, lng: 6, zoom: 15 });
    expect(initialCamera(null, null)).toBe(HOME_FALLBACK_CAMERA);
    expect(HOME_FALLBACK_CAMERA.zoom).toBe(4);
  });
});

describe('sheet settling', () => {
  const heights = { peekH: 200, expandedH: 600 };
  it('a fling decides alone', () => {
    expect(settleHomeSnap({ visibleH: 250, velocityY: -900, ...heights })).toBe('expanded');
    expect(settleHomeSnap({ visibleH: 550, velocityY: 900, ...heights })).toBe('peek');
  });
  it('otherwise the nearer height wins, with the release projected ahead', () => {
    expect(settleHomeSnap({ visibleH: 300, velocityY: 0, ...heights })).toBe('peek');
    expect(settleHomeSnap({ visibleH: 500, velocityY: 0, ...heights })).toBe('expanded');
    expect(settleHomeSnap({ visibleH: 380, velocityY: -300, ...heights })).toBe('expanded');
  });
  it('toggle', () => {
    expect(toggleHomeSnap('peek')).toBe('expanded');
    expect(toggleHomeSnap('expanded')).toBe('peek');
  });
});

describe('solo / group branching (22 §3.4.2)', () => {
  it('no ride open: go straight', () => {
    expect(choiceStep('solo', null)).toEqual({ kind: 'go', choice: 'solo' });
    expect(choiceStep('group', null)).toEqual({ kind: 'go', choice: 'group' });
  });
  it('a ride open as a rider: ask before leaving it; as the leader: the ride must be ended first', () => {
    expect(choiceStep('solo', { role: 'rider' })).toEqual({ kind: 'confirm', sheet: 'switch' });
    expect(choiceStep('group', { role: 'rider' })).toEqual({ kind: 'confirm', sheet: 'switch' });
    expect(choiceStep('solo', { role: 'leader' })).toEqual({ kind: 'confirm', sheet: 'leaderBusy' });
    expect(choiceStep('group', { role: 'leader' })).toEqual({ kind: 'confirm', sheet: 'leaderBusy' });
  });
  it('after "Leave and continue" the same choice goes with the ride to leave', () => {
    expect(afterSwitch('solo', 'r9')).toEqual({ kind: 'go', choice: 'solo', leaveRideId: 'r9' });
    expect(afterSwitch('group', 'r9')).toEqual({ kind: 'go', choice: 'group', leaveRideId: 'r9' });
  });
  it('the group form href carries the destination flag and the ride to leave', () => {
    expect(newRideHref({ dest: false })).toBe('/new-ride');
    expect(newRideHref({ dest: true })).toBe('/new-ride?dest=1');
    expect(newRideHref({ dest: true, leaveRideId: 'r9' })).toBe('/new-ride?dest=1&leaveRideId=r9');
    expect(newRideHref({ dest: false, leaveRideId: 'r9' })).toBe('/new-ride?leaveRideId=r9');
  });
});

describe('place sheet text (22 §3.3)', () => {
  it('distance and category word; no word for other; the GPS note without a fix', () => {
    expect(placeSubline(118_000, 'cafe')).toBe('≈ 118 km away · Coffee');
    expect(placeSubline(118_000, 'other')).toBe('≈ 118 km away');
    expect(placeSubline(null, 'fuel')).toBe('Distance shows when GPS is ready · Fuel');
    expect(categoryWord('other')).toBeNull();
  });
  it('the screen-reader summary leaves out a missing distance', () => {
    expect(placeSummaryA11y('Mysuru Palace', 'Sayyaji Rao Rd', 118_000)).toBe('Mysuru Palace, 118 km away, Sayyaji Rao Rd');
    expect(placeSummaryA11y('Mysuru Palace', 'Sayyaji Rao Rd', null)).toBe('Mysuru Palace, Sayyaji Rao Rd');
    expect(placeSummaryA11y('Mysuru Palace', '', 118_000)).toBe('Mysuru Palace, 118 km away');
  });
});

describe('camera padding counts everything that floats (22 §4.2)', () => {
  it('browse at 360x780: bar, chips, sheet and attribution', () => {
    const p = browsePadding({ insetTop: 24, bannerH: 0, chipsShown: true, sheetH: 200 });
    expect(p).toEqual({ top: 24 + 8 + 56 + 8 + 48 + 16, bottom: 236, left: 16, right: 16 });
    expect(browsePadding({ insetTop: 24, bannerH: 0, chipsShown: false, sheetH: 200 }).top).toBe(24 + 8 + 56 + 16);
    expect(browsePadding({ insetTop: 24, bannerH: 56, chipsShown: false, sheetH: 200 }).top).toBe(24 + 56 + 8 + 56 + 16);
  });
  it('chips start under the bar; place padding clears bar and panel', () => {
    expect(chipsTop(24, 0)).toBe(24 + 8 + 56 + 8);
    expect(placePadding(24, 204)).toEqual({ top: 24 + 8 + 56 + 24, bottom: 204 + 24 + 28, left: 48, right: 48 });
  });
});

describe('confirmedSwitch: the open ride is re-read before it is left (L2)', () => {
  const lobby = (id: string, role: 'leader' | 'rider' = 'rider') => ({ id, status: 'lobby' as const, role });
  it('still the same lobby ride as a rider: leave it and continue', () => {
    expect(confirmedSwitch('solo', 'r1', lobby('r1'))).toEqual({ kind: 'go', choice: 'solo', leaveRideId: 'r1' });
    expect(confirmedSwitch('group', 'r1', lobby('r1'))).toEqual({ kind: 'go', choice: 'group', leaveRideId: 'r1' });
  });
  it('the ride ended meanwhile: nothing to leave, just go', () => {
    expect(confirmedSwitch('solo', 'r1', null)).toEqual({ kind: 'go', choice: 'solo' });
    expect(confirmedSwitch('solo', 'r1', { id: 'r1', status: 'ended', role: 'rider' })).toEqual({ kind: 'go', choice: 'solo' });
  });
  it('the ride started meanwhile: do not leave it on the old confirmation, show the ride', () => {
    expect(confirmedSwitch('solo', 'r1', { id: 'r1', status: 'active', role: 'rider' })).toEqual({ kind: 'stale' });
  });
  it('a different ride, or I became its leader: ask again', () => {
    expect(confirmedSwitch('solo', 'r1', lobby('r2'))).toEqual({ kind: 'stale' });
    expect(confirmedSwitch('solo', 'r1', lobby('r1', 'leader'))).toEqual({ kind: 'stale' });
  });
});

describe('attribution placement (never hidden while a map shows)', () => {
  it('on the map at peek, in the sheet footer when expanded (not floating under the search bar)', () => {
    expect(attributionInSheet('peek')).toBe(false);
    expect(attributionInSheet('expanded')).toBe(true);
  });
  it('the on-map pill fades out over the first quarter of a drag up', () => {
    expect(attributionFade(200, 200, 684)).toBe(1);
    expect(attributionFade(200 + 121, 200, 684)).toBe(0);
    expect(attributionFade(684, 200, 684)).toBe(0);
    expect(attributionFade(260, 200, 684)).toBeCloseTo(0.5, 1);
  });
  it('a sheet with nothing to expand never fades it', () => {
    expect(attributionFade(200, 200, 200)).toBe(1);
  });
});
