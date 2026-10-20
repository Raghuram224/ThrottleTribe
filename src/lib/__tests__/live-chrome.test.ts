import {
  fullMapTopCardH,
  fullMapTopInset,
  headerSearchVisible,
  mapControlVisibility,
  mapVisibleHeight,
  connectionPill,
  meSlotKind,
  navBannerHeight,
  navTopInset,
  panelVariant,
  RIGHT_COLUMN_MIN_MAP_H,
  STOP_CHIP_H,
} from '../live-chrome';

describe('panelVariant', () => {
  it('solo only once loaded and one or fewer active members', () => {
    expect(panelVariant(true, 1)).toBe('solo');
    expect(panelVariant(true, 0)).toBe('solo');
    expect(panelVariant(true, 2)).toBe('group');
    expect(panelVariant(false, 1)).toBe('group');
  });
});

describe('mapControlVisibility', () => {
  it('hides fit-all under 2 positioned riders', () => {
    expect(mapControlVisibility({ controlsHidden: false, mapVisH: 300, positionedRiders: 1 }).fitAll).toBe(false);
    expect(mapControlVisibility({ controlsHidden: false, mapVisH: 300, positionedRiders: 0 }).fitAll).toBe(false);
    expect(mapControlVisibility({ controlsHidden: false, mapVisH: 300, positionedRiders: 2 }).fitAll).toBe(true);
  });
  it('right column hides under 176 dp of map, the me slot under 104', () => {
    expect(RIGHT_COLUMN_MIN_MAP_H).toBe(176);
    const v = (mapVisH: number) => mapControlVisibility({ controlsHidden: false, mapVisH, positionedRiders: 3 });
    expect(v(176)).toMatchObject({ rightColumn: true, meSlot: true });
    expect(v(175)).toMatchObject({ rightColumn: false, meSlot: true });
    expect(v(104).meSlot).toBe(true);
    expect(v(103).meSlot).toBe(false);
  });
  it('the me slot needs 104 / 124 / 144 for a one / two / three-line credit pill (25 §5.1)', () => {
    const v = (mapVisH: number, creditLines: 1 | 2 | 3) => mapControlVisibility({ controlsHidden: false, mapVisH, positionedRiders: 1, creditLines }).meSlot;
    expect([v(104, 1), v(103, 1)]).toEqual([true, false]);
    expect([v(124, 2), v(123, 2)]).toEqual([true, false]);
    expect([v(144, 3), v(143, 3)]).toEqual([true, false]);
  });
  it('a bigger system font raises the me slot threshold with the taller pill', () => {
    const v = (mapVisH: number, fontScale: number) => mapControlVisibility({ controlsHidden: false, mapVisH, positionedRiders: 1, creditLines: 3, fontScale }).meSlot;
    expect(v(144, 1)).toBe(true);
    expect(v(144, 1.3)).toBe(false);
    expect(v(159, 1.3)).toBe(true);
  });
  it('voice toggle: only while navigating and only when fit-all is not in the column (at most two controls, C1)', () => {
    const v = (positionedRiders: number, navActive?: boolean) =>
      mapControlVisibility({ controlsHidden: false, mapVisH: 300, positionedRiders, navActive }).voice;
    expect(v(1, true)).toBe(true);
    expect(v(1, false)).toBe(false);
    expect(v(1)).toBe(false);
    expect(v(2, true)).toBe(false); // group: voice lives in the menu only
  });
  it('controlsHidden wins over space', () => {
    expect(mapControlVisibility({ controlsHidden: true, mapVisH: 500, positionedRiders: 3 })).toMatchObject({
      rightColumn: false,
      meSlot: false,
    });
  });
});

describe('mapVisibleHeight', () => {
  it('is the area minus the top inset and the sheet, never negative', () => {
    expect(mapVisibleHeight(588, 84, 265)).toBe(239);
    expect(mapVisibleHeight(300, 84, 500)).toBe(0);
  });
});

describe('meSlotKind', () => {
  it('bubble while following with a speed, nothing while following and stopped, Re-centre when panned', () => {
    expect(meSlotKind('follow', 60)).toBe('speed');
    expect(meSlotKind('follow', null)).toBeNull();
    expect(meSlotKind('free', 60)).toBe('recentre');
    expect(meSlotKind('overview', null)).toBe('recentre');
  });
});

describe('headerSearchVisible', () => {
  it('shows on a live ride that is connected', () => {
    expect(headerSearchVisible({ child: 'live', rideLive: true, connection: 'live' })).toBe(true);
  });
  it('is hidden offline or connecting (the pill takes its place)', () => {
    expect(headerSearchVisible({ child: 'live', rideLive: true, connection: 'offline' })).toBe(false);
    expect(headerSearchVisible({ child: 'live', rideLive: true, connection: 'connecting' })).toBe(false);
  });
  it('is absent in the lobby, elsewhere, and once the ride is over', () => {
    expect(headerSearchVisible({ child: 'lobby', rideLive: true, connection: 'live' })).toBe(false);
    expect(headerSearchVisible({ child: null, rideLive: true, connection: 'live' })).toBe(false);
    expect(headerSearchVisible({ child: 'live', rideLive: false, connection: 'live' })).toBe(false);
  });
});

describe('fullMapTopInset', () => {
  it('counts the top card and its gap', () => {
    expect(STOP_CHIP_H).toBe(40);
    expect(fullMapTopInset(48, 0)).toBe(48);
    expect(fullMapTopInset(48, STOP_CHIP_H)).toBe(48 + 40 + 8);
    expect(fullMapTopInset(48, 96)).toBe(48 + 96 + 8);
    expect(fullMapTopInset(48, 136)).toBe(48 + 136 + 8);
  });
});

describe('fullMapTopCardH', () => {
  it('is the banner when it is shown (it replaces the chip), else the chip, else nothing', () => {
    expect(fullMapTopCardH({ navBannerH: 96, stopChip: true })).toBe(96);
    expect(fullMapTopCardH({ navBannerH: 136, stopChip: true })).toBe(136);
    expect(fullMapTopCardH({ navBannerH: 0, stopChip: true })).toBe(STOP_CHIP_H);
    expect(fullMapTopCardH({ navBannerH: 0, stopChip: false })).toBe(0);
  });
});

describe('navBannerHeight and navTopInset', () => {
  it('is 0 without a banner, 96 with one, 136 with the Then row', () => {
    expect(navBannerHeight({ bannerShown: false, thenRow: true })).toBe(0);
    expect(navBannerHeight({ bannerShown: true, thenRow: false })).toBe(96);
    expect(navBannerHeight({ bannerShown: true, thenRow: true })).toBe(136);
  });
  it('sheet-mode inset is banner + Then row + convoy strip', () => {
    expect(navTopInset({ navBannerH: 136, convoyH: 0 })).toBe(136);
    expect(navTopInset({ navBannerH: 136, convoyH: 84 })).toBe(220);
    expect(navTopInset({ navBannerH: 96, convoyH: 84 })).toBe(180);
    expect(navTopInset({ navBannerH: 0, convoyH: 84 })).toBe(84);
    expect(navTopInset({ navBannerH: 0, convoyH: 0 })).toBe(0);
  });
  it('leaves the 360x780 reference map 316 dp tall with the Then row (spec 2.5)', () => {
    // area 588, banner + Then 136, solo panel 136
    expect(mapVisibleHeight(588, navTopInset({ navBannerH: 136, convoyH: 0 }), 136)).toBe(316);
  });
});

describe('connectionPill (26 L2): the pill and the banner say the same thing', () => {
  it('healthy: no pill', () => {
    expect(connectionPill('live', false)).toBeNull();
    expect(connectionPill('live', true)).toBeNull();
  });
  it('connecting is "Connecting"', () => {
    expect(connectionPill('connecting', false)).toEqual({ icon: 'connecting', labelKey: 'live.connConnecting' });
  });
  it('ride channel down with the phone online: "Connecting", never "Offline"', () => {
    expect(connectionPill('offline', false)).toEqual({ icon: 'connecting', labelKey: 'live.connConnecting' });
  });
  it('the phone has no network: "Offline"', () => {
    expect(connectionPill('offline', true)).toEqual({ icon: 'offline', labelKey: 'live.connOffline' });
  });
});
