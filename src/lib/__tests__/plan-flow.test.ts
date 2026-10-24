import {
  attributionFade,
  attributionInSheet,
  confirmedSwitch,
  browsePadding,
  categoryWord,
  chipsTop,
  firstRunSeenOnSnap,
  HOME_CAMERA_SAVE_MS,
  fallbackPadding,
  HOME_FALLBACK_CAMERA,
  homeMapMounted,
  homeSheetBlocks,
  stripJoinVisible,
  initialCamera,
  initialSheetSnap,
  isFallbackCamera,
  isFirstRun,
  meSlotForHome,
  openRideCard,
  parseCamera,
  placePadding,
  FAB_STACK,
  HOME_STRIP_H,
  homeStripHeight,
  resultsPanelHeight,
  searchResultsPadding,
  placeSubline,
  placeSummaryA11y,
  planBack,
  rideBack,
  roundCamera,
  searchBarTarget,
  settleHomeSnap,
  shouldSaveCamera,
  launchPromptWanted,
  mapTypeTop,
  routeActions,
  startStep,
  toggleHomeSnap,
  whereToHref,
  type PlanMode,
  type SheetBlocksInput,
} from '../plan-flow';
import { copy } from '../copy';

describe('planBack (22 §2.1, §5.1)', () => {
  it('route from a search result steps back to its place sheet', () => {
    expect(planBack({ mode: 'route', from: 'search', sheetSnap: 'peek' })).toEqual({ mode: 'place', sheetSnap: 'peek' });
  });
  it('route from a recent place goes back to browse', () => {
    expect(planBack({ mode: 'route', from: 'recent', sheetSnap: 'peek' })).toEqual({ mode: 'browse', sheetSnap: 'peek' });
    expect(planBack({ mode: 'route', from: null, sheetSnap: 'peek' })).toEqual({ mode: 'browse', sheetSnap: 'peek' });
  });
  it('place goes back to the search results it was picked from (28)', () => {
    expect(planBack({ mode: 'place', from: 'search', sheetSnap: 'peek' })).toEqual({ mode: 'search', sheetSnap: 'peek' });
  });
  it('search goes back to browse', () => {
    expect(planBack({ mode: 'search', from: null, sheetSnap: 'peek' })).toEqual({ mode: 'browse', sheetSnap: 'peek' });
  });
  it('browse: an expanded sheet collapses first, then the OS leaves the app', () => {
    expect(planBack({ mode: 'browse', from: null, sheetSnap: 'expanded' })).toEqual({ mode: 'browse', sheetSnap: 'peek' });
    expect(planBack({ mode: 'browse', from: null, sheetSnap: 'peek' })).toBeNull();
  });
  it('walks the whole stack: route(search) -> place -> search -> browse -> collapse -> leave', () => {
    type Cur = { mode: PlanMode; from: 'search' | 'recent' | null; sheetSnap: 'peek' | 'expanded' };
    let cur: Cur = { mode: 'route', from: 'search', sheetSnap: 'expanded' };
    const steps: string[] = [];
    for (let i = 0; i < 8; i++) {
      const next = planBack(cur);
      if (!next) {
        steps.push('leave');
        break;
      }
      steps.push(`${next.mode}/${next.sheetSnap}`);
      cur = { ...cur, ...next };
    }
    expect(steps).toEqual(['place/expanded', 'search/expanded', 'browse/expanded', 'browse/peek', 'leave']);
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
  it('first run: the strip is the title; sub, location row, steps and nudge are all expanded', () => {
    expect(homeSheetBlocks({ ...base, firstRun: true, locationGranted: false })).toEqual({
      strip: 'title',
      expanded: ['firstSub', 'locationRow', 'steps', 'nudge'],
    });
    expect(homeSheetBlocks({ ...base, firstRun: true, hasNudge: false })).toEqual({
      strip: 'title',
      expanded: ['firstSub', 'steps'],
    });
  });
  it('returning: every recent place, location, nudge, stats, rides (28: nothing is left in the strip)', () => {
    expect(homeSheetBlocks({ ...base, locationGranted: false })).toEqual({
      strip: 'title',
      expanded: ['recentPlaces', 'locationRow', 'nudge', 'stats', 'recentRides'],
    });
  });
  it('returning with no recent places has no recents block', () => {
    const b = homeSheetBlocks({ ...base, recentPlaces: 0 });
    expect(b.expanded).not.toContain('recentPlaces');
  });
  it('an open ride makes the strip a "Back to ride" row and hides recent places; the ride card leads the expanded sheet', () => {
    expect(homeSheetBlocks({ ...base, openRide: 'active' })).toEqual({ strip: 'resume', expanded: ['rideCard', 'nudge', 'recentRides'] });
    expect(homeSheetBlocks({ ...base, openRide: 'lobby' })).toEqual({
      strip: 'resume',
      expanded: ['rideCard', 'nudge', 'recentPlaces', 'recentRides'],
    });
  });
  it('the strip never carries recents: there are no peek blocks at all', () => {
    for (const openRide of ['none', 'active', 'lobby'] as const) {
      for (const firstRun of [false, true]) {
        expect(homeSheetBlocks({ ...base, openRide, firstRun })).not.toHaveProperty('peek');
      }
    }
  });
});

describe('the thin strip (28)', () => {
  it('is the 56 dp header (grab handle + one line) plus the gesture inset; no chevron, no body', () => {
    expect(HOME_STRIP_H).toBe(56);
    expect(homeStripHeight(0)).toBe(56);
    expect(homeStripHeight(24)).toBe(80);
  });
  it('the camera padding follows the strip height: a smaller sheet leaves more map', () => {
    const strip = browsePadding({ insetTop: 24, bannerH: 0, chipsShown: true, sheetH: homeStripHeight(24) });
    const old = browsePadding({ insetTop: 24, bannerH: 0, chipsShown: true, sheetH: homeStripHeight(24) + 200 });
    expect(strip.bottom).toBe(80 + 40);
    expect(old.bottom - strip.bottom).toBe(200);
  });
});

describe('floating buttons (28)', () => {
  it('the ride view\'s stack is 56 dp circles with a 12 dp gap', () => {
    expect(FAB_STACK.size).toBe(56);
    expect(FAB_STACK.gap).toBe(12);
  });
  it('browse has no floating stack: the camera keeps the usual 16 dp on the right', () => {
    expect(browsePadding({ insetTop: 24, bannerH: 0, chipsShown: true, sheetH: 80 }).right).toBe(16);
  });
});

describe('search results layout (28)', () => {
  it('the results panel is about 45% of the window', () => {
    expect(resultsPanelHeight(800)).toBe(360);
    expect(resultsPanelHeight(640)).toBe(288);
  });
  it('the pins fit under the bar and chips (clearing a pin\'s own height) and above the panel and attribution', () => {
    // 360 x 780: status bar 24, panel 351.
    expect(searchResultsPadding(24, 351)).toEqual({ top: 24 + 8 + 56 + 8 + 48 + 16 + 44, bottom: 351 + 24 + 24 + 4, left: 48, right: 48 });
    expect(searchResultsPadding(24 + 40, 351).top).toBe(searchResultsPadding(24, 351).top + 40);
    expect(searchResultsPadding(24, 351, 2).bottom).toBeGreaterThan(searchResultsPadding(24, 351, 1).bottom);
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

describe('homeMapMounted (22 §4.3, 28 §8)', () => {
  it('flag off: only Home, search and the preview redirect keep the map', () => {
    for (const p of ['/home', '/where-to', '/route-preview', '/home/', '/home?welcome=1']) {
      expect(homeMapMounted(p, false)).toBe(true);
    }
  });
  it('flag off: every ride screen and everything else unmounts it (one GL map at a time)', () => {
    for (const p of ['/ride/abc/live', '/ride/abc/lobby', '/ride/abc/search', '/permissions', '/profile', '/join', '/rides', '/new-ride', '/']) {
      expect(homeMapMounted(p, false)).toBe(false);
    }
  });
  it('ride on Home: a deny-list, only the ride summary (it draws its own map) unmounts it', () => {
    for (const p of ['/ride/abc/summary', '/ride/abc/summary/', '/ride/abc/summary?x=1']) {
      expect(homeMapMounted(p, true)).toBe(false);
    }
  });
  it('ride on Home: the lobby, invite, live hand-off and every other screen keep the map under them', () => {
    for (const p of ['/home', '/ride/abc/live', '/ride/abc/lobby', '/ride/abc/invite', '/ride/abc/search', '/profile', '/join', '/permissions', '/where-to']) {
      expect(homeMapMounted(p, true)).toBe(true);
    }
  });
});

describe('rideBack (28 §8): one step at a time inside the ride view', () => {
  const open = { rideView: true, stopSearch: false, riderSelected: false, fullMap: false, stripOpen: false };
  it('outside the ride view it is not its business: planBack and the OS decide', () => {
    expect(rideBack({ ...open, rideView: false })).toBeNull();
    expect(rideBack({ ...open, rideView: false, fullMap: true, riderSelected: true })).toBeNull();
  });
  it('closes the stop search first, whatever else is open', () => {
    expect(rideBack({ ...open, stopSearch: true, riderSelected: true, fullMap: true, stripOpen: true })).toBe('close-stop-search');
  });
  it('then clears a selected rider, leaves full map and collapses the list', () => {
    const state = { ...open, riderSelected: true, fullMap: true, stripOpen: true };
    expect(rideBack(state)).toBe('clear-selection');
    expect(rideBack({ ...state, riderSelected: false })).toBe('exit-full-map');
    expect(rideBack({ ...state, riderSelected: false, fullMap: false })).toBe('collapse-strip');
  });
  it('a bare ride view hands Back to the system: there is no browse to go to while a ride is active', () => {
    expect(rideBack(open)).toBe('system');
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

describe('Start branching (22 §3.4.2, D5): one kind of ride', () => {
  it('no ride open: go straight', () => {
    expect(startStep(null)).toEqual({ kind: 'go' });
  });
  it('a ride open as a rider: ask before leaving it; as the leader: the ride must be ended first', () => {
    expect(startStep({ role: 'rider' })).toEqual({ kind: 'confirm', sheet: 'switch' });
    expect(startStep({ role: 'leader' })).toEqual({ kind: 'confirm', sheet: 'leaderBusy' });
  });
});

describe('the route preview: Start is the primary, Invite riders the secondary under it (D5, D6)', () => {
  it('both enabled and idle', () => {
    expect(routeActions({ offline: false, going: null })).toEqual({
      start: { disabled: false, loading: false },
      invite: { disabled: false, loading: false },
    });
  });
  it('both disabled offline (they need the server)', () => {
    expect(routeActions({ offline: true, going: null })).toEqual({
      start: { disabled: true, loading: false },
      invite: { disabled: true, loading: false },
    });
  });
  it('while one is running it loads and the other is blocked: no second ride from a second tap', () => {
    expect(routeActions({ offline: false, going: 'start' })).toEqual({
      start: { disabled: false, loading: true },
      invite: { disabled: true, loading: false },
    });
    expect(routeActions({ offline: false, going: 'invite' })).toEqual({
      start: { disabled: true, loading: false },
      invite: { disabled: false, loading: true },
    });
  });
});

describe('Join with a code on the strip (D7)', () => {
  it('shows on the title strip (first run or not) and is hidden while a ride is open', () => {
    const base = { firstRun: false, openRide: 'none' as const, recentPlaces: 0, locationGranted: true, hasNudge: false, hasStats: false, showRecentRides: false };
    for (const firstRun of [false, true]) {
      expect(stripJoinVisible(homeSheetBlocks({ ...base, firstRun }).strip)).toBe(true);
    }
    for (const openRide of ['active', 'lobby'] as const) {
      expect(stripJoinVisible(homeSheetBlocks({ ...base, openRide }).strip)).toBe(false);
    }
  });
  it('the copy: a short label, a spoken label, no group or solo tile, no Just ride', () => {
    expect(copy['homeMap.stripJoin']).toBe('Join');
    expect(copy['homeMap.stripJoinA11y']).toBe('Join a ride with a code');
    expect(Object.keys(copy)).not.toContain('homeMap.tileRide');
    expect(Object.keys(copy)).not.toContain('homeMap.tileGroup');
    expect(Object.keys(copy)).not.toContain('homeMap.tileSolo');
  });
  it('the first-run steps say: pick a place, share the code to ride together, nobody gets lost', () => {
    expect(copy['homeMap.step1Title']).toMatch(/where you're riding/i);
    expect(copy['homeMap.step1Body']).not.toMatch(/solo|group/i);
    expect(copy['home.step2Title']).toMatch(/share the code/i);
    expect(copy['home.step2Title']).toMatch(/together/i);
    expect(copy['home.step3Title']).toMatch(/nobody gets lost/i);
    expect(copy['home.firstSub']).not.toMatch(/group/i);
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
    expect(p).toEqual({ top: 24 + 8 + 56 + 8 + 48 + 16, bottom: 240, left: 16, right: 16 });
    expect(browsePadding({ insetTop: 24, bannerH: 0, chipsShown: false, sheetH: 200 }).top).toBe(24 + 8 + 56 + 16);
    expect(browsePadding({ insetTop: 24, bannerH: 56, chipsShown: false, sheetH: 200 }).top).toBe(24 + 56 + 8 + 56 + 16);
  });
  it('Terrain makes the pill two lines, so browse clears 56 instead of 40 under the sheet (25 §5.1)', () => {
    expect(browsePadding({ insetTop: 24, bannerH: 0, chipsShown: true, sheetH: 200, creditLines: 2 }).bottom).toBe(256);
  });
  it('the map type circle: 152 in browse (under the chips), 96 under the place bar, 32 level with the back circle (25 §2.1)', () => {
    expect(mapTypeTop({ mode: 'browse', insetTop: 24, bannerH: 0, chipsShown: true })).toBe(152);
    expect(mapTypeTop({ mode: 'browse', insetTop: 24, bannerH: 0, chipsShown: false })).toBe(96);
    expect(mapTypeTop({ mode: 'place', insetTop: 24, bannerH: 0, chipsShown: false })).toBe(96);
    expect(mapTypeTop({ mode: 'route', insetTop: 24, bannerH: 0, chipsShown: false })).toBe(32);
    // The search results: under the chip row, like browse.
    expect(mapTypeTop({ mode: 'search', insetTop: 24, bannerH: 0, chipsShown: true })).toBe(152);
    // The offline banner pushes it down by its height, like the bar.
    expect(mapTypeTop({ mode: 'browse', insetTop: 24, bannerH: 40, chipsShown: true })).toBe(192);
    expect(mapTypeTop({ mode: 'route', insetTop: 24, bannerH: 40, chipsShown: false })).toBe(72);
  });
  it('place padding clears a taller pill (Terrain, the provider line, a big font)', () => {
    expect(placePadding(24, 204, 1).bottom).toBe(204 + 24 + 28);
    expect(placePadding(24, 204, 3).bottom).toBe(204 + 24 + 56 + 4);
    expect(placePadding(24, 204, 3, 1.3).bottom).toBe(204 + 24 + 71 + 4);
  });
  it('chips start under the bar; place padding clears bar and panel', () => {
    expect(chipsTop(24, 0)).toBe(24 + 8 + 56 + 8);
    expect(placePadding(24, 204)).toEqual({ top: 24 + 8 + 56 + 24, bottom: 204 + 24 + 28, left: 48, right: 48 });
  });
});

describe('confirmedSwitch: the open ride is re-read before it is left (L2)', () => {
  const lobby = (id: string, role: 'leader' | 'rider' = 'rider') => ({ id, status: 'lobby' as const, role });
  it('still the same lobby ride as a rider: leave it and continue', () => {
    expect(confirmedSwitch('r1', lobby('r1'))).toEqual({ kind: 'go', leaveRideId: 'r1' });
  });
  it('the ride ended meanwhile: nothing to leave, just go', () => {
    expect(confirmedSwitch('r1', null)).toEqual({ kind: 'go' });
    expect(confirmedSwitch('r1', { id: 'r1', status: 'ended', role: 'rider' })).toEqual({ kind: 'go' });
  });
  it('the ride started meanwhile: do not leave it on the old confirmation, show the ride', () => {
    expect(confirmedSwitch('r1', { id: 'r1', status: 'active', role: 'rider' })).toEqual({ kind: 'stale' });
  });
  it('a different ride, or I became its leader: ask again', () => {
    expect(confirmedSwitch('r1', lobby('r2'))).toEqual({ kind: 'stale' });
    expect(confirmedSwitch('r1', lobby('r1', 'leader'))).toEqual({ kind: 'stale' });
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

describe('the launch location prompt (D5, D6: once per app run, never on web)', () => {
  const base = { asked: false, platform: 'android', status: 'undetermined', canAskAgain: true, focused: true };
  it('asks while the permission is undecided and can still be asked', () => {
    expect(launchPromptWanted(base)).toBe(true);
    expect(launchPromptWanted({ ...base, platform: 'ios' })).toBe(true);
  });
  it('not again once asked in this app run (a second Home mount, after Back from a ride)', () => {
    expect(launchPromptWanted({ ...base, asked: true })).toBe(false);
  });
  it('not while Home is not focused (a ride is on top): it is asked on the next focus instead', () => {
    expect(launchPromptWanted({ ...base, focused: false })).toBe(false);
    expect(launchPromptWanted({ ...base, focused: true })).toBe(true);
  });
  it('not on web: the browser prompt only comes from the explainer button (22 §4.5)', () => {
    expect(launchPromptWanted({ ...base, platform: 'web' })).toBe(false);
  });
  it('not while the permission has not been read, once granted, or when the OS will not ask again', () => {
    expect(launchPromptWanted({ ...base, status: 'unknown' })).toBe(false);
    expect(launchPromptWanted({ ...base, status: 'granted' })).toBe(false);
    expect(launchPromptWanted({ ...base, status: 'denied' })).toBe(false);
    expect(launchPromptWanted({ ...base, canAskAgain: false })).toBe(false);
  });
});

describe('fallback frame (audit 4)', () => {
  it('recognises the stand-in by value, so a camera saved from it is still the stand-in', () => {
    expect(isFallbackCamera(initialCamera(null, null))).toBe(true);
    expect(isFallbackCamera({ ...HOME_FALLBACK_CAMERA })).toBe(true);
    expect(isFallbackCamera(parseCamera(JSON.stringify(HOME_FALLBACK_CAMERA))!)).toBe(true);
  });

  it("never mistakes a rider's own camera for it", () => {
    expect(isFallbackCamera(initialCamera(null, { lat: 1, lng: 2 }))).toBe(false);
    expect(isFallbackCamera({ ...HOME_FALLBACK_CAMERA, zoom: 4.1 })).toBe(false);
    expect(isFallbackCamera({ lat: 12.9, lng: 77.5, zoom: 15 })).toBe(false);
  });

  it('keeps the zoom at 4: central India, not the whole country at stamp size', () => {
    expect(HOME_FALLBACK_CAMERA.zoom).toBe(4);
  });

  it('passes the sheet as padding while a strip stays visible', () => {
    const pad = { top: 96, bottom: 500, left: 16, right: 16 };
    expect(fallbackPadding(pad, 800)).toEqual(pad);
  });

  it('shrinks the sheet share so at least 120 dp remain for the centre to land in', () => {
    const p = fallbackPadding({ top: 96, bottom: 700, left: 16, right: 16 }, 800);
    expect(p.bottom).toBe(800 - 96 - 120);
    expect(p).toMatchObject({ top: 96, left: 16, right: 16 });
  });

  it('never goes negative when the bar alone fills the screen', () => {
    expect(fallbackPadding({ top: 900, bottom: 300, left: 0, right: 0 }, 800).bottom).toBe(0);
  });
});
