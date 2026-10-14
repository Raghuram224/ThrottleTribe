import type { LiveItem, RiderItem } from '../live-list';
import {
  isLastSnap,
  listContentHeight,
  MAX_PINNED,
  nextSnap,
  parseSnap,
  resolveSnap,
  peekHeight,
  pinnedAlerts,
  settleSnap,
  SHEET_HEADER_H,
  STOP_CARD_H,
  headerHeight,
  sheetCounts,
  snapHeights,
  soloSheet,
  ARRIVAL_PANEL_H,
  type SheetSnap,
  stepSnap,
  summaryLine,
} from '../live-sheet';

const rider = (id: string, status: RiderItem['status']): RiderItem => ({
  kind: 'rider',
  key: id,
  userId: id,
  rel: null,
  status,
  sinceMs: null,
});

describe('snap heights', () => {
  it('collapsed is the header plus pinned rows (max 2)', () => {
    expect(peekHeight(0)).toBe(SHEET_HEADER_H);
    expect(peekHeight(1)).toBe(SHEET_HEADER_H + 72);
    expect(peekHeight(5)).toBe(SHEET_HEADER_H + 2 * 72);
  });
  it('the stop card is 64 dp and adds to every snap that depends on the header', () => {
    expect(STOP_CARD_H).toBe(64);
    expect(headerHeight(false)).toBe(SHEET_HEADER_H);
    expect(headerHeight(true)).toBe(SHEET_HEADER_H + 64);
    expect(peekHeight(0, true)).toBe(SHEET_HEADER_H + 64);
    expect(peekHeight(2, true)).toBe(SHEET_HEADER_H + 64 + 2 * 72);
  });
  it('content that fits at half gets two snaps and no empty sheet (2 riders)', () => {
    // me 56 + rider 72 = 128 of list; fit = 72 + 128 + 8 = 208 < 45 % of 588
    const m = snapHeights(588, 0, false, 128);
    expect(m.snaps).toEqual(['collapsed', 'half']);
    expect(m.heights).toEqual({ collapsed: 72, half: 208, expanded: 208 });
  });
  it('half is capped at 45 % and expanded takes the content when it is longer (6 riders)', () => {
    // me 56 + 5 x 72 = 416; fit = 72 + 416 + 8 = 496; 45 % of 588 = 265, 85 % = 500
    const m = snapHeights(588, 0, false, 416);
    expect(m.snaps).toEqual(['collapsed', 'half', 'expanded']);
    expect(m.heights).toEqual({ collapsed: 72, half: 265, expanded: 496 });
  });
  it('expanded is capped at 85 % of the area (10 riders)', () => {
    const m = snapHeights(588, 0, false, 56 + 9 * 72);
    expect(m.heights.expanded).toBe(500);
    expect(m.heights.half).toBe(265);
  });
  it('the stop card moves fit and collapsed by its 64 dp', () => {
    // fit = 72 + 64 + 56 + 8 = 200: a solo-like list fits at half, so two snaps
    const fits = snapHeights(588, 0, true, 56);
    expect(fits.heights).toEqual({ collapsed: 136, half: 200, expanded: 200 });
    expect(fits.snaps).toEqual(['collapsed', 'half']);
    // fit = 272 is only 7 dp over half (265): no third snap, both are the content height
    const over = snapHeights(588, 0, true, 128);
    expect(over.heights).toEqual({ collapsed: 136, half: 272, expanded: 272 });
    expect(over.snaps).toEqual(['collapsed', 'half']);
  });
  it('no third snap less than one rider row above half (588 dp area, me + 2 riders)', () => {
    // fit = 72 + 56 + 2 x 72 + 8 = 280; half would be 265 and expanded 280, 15 dp apart
    const m = snapHeights(588, 0, false, 56 + 2 * 72);
    expect(m.snaps).toEqual(['collapsed', 'half']);
    expect(m.heights).toEqual({ collapsed: 72, half: 280, expanded: 280 });
  });
  it('keeps the third snap at exactly one rider row above half', () => {
    // half 265; fit = 265 + 72 = 337 -> listContentH = 337 - 80 = 257
    const m = snapHeights(588, 0, false, 257);
    expect(m.snaps).toEqual(['collapsed', 'half', 'expanded']);
    expect(m.heights).toEqual({ collapsed: 72, half: 265, expanded: 337 });
  });
  it('half is at least one row above collapsed even when content is tiny', () => {
    const m = snapHeights(588, 2, false, 0);
    expect(m.heights.half).toBe(m.heights.collapsed + 56);
    expect(m.snaps).toEqual(['collapsed', 'half']);
  });
  it('stays strictly increasing between available snaps on a short screen', () => {
    const m = snapHeights(300, 2, true, 600);
    expect(m.heights.half).toBeGreaterThan(m.heights.collapsed);
    if (m.snaps.length === 3) expect(m.heights.expanded).toBeGreaterThan(m.heights.half);
  });
  it('a persisted expanded that is unavailable renders as half', () => {
    expect(resolveSnap('expanded', ['collapsed', 'half'])).toBe('half');
    expect(resolveSnap('expanded', ['collapsed', 'half', 'expanded'])).toBe('expanded');
    expect(resolveSnap('collapsed', ['collapsed', 'half'])).toBe('collapsed');
  });
});

describe('solo panel', () => {
  it('is 136 dp with a stop and 72 dp without, at every snap', () => {
    expect(soloSheet(true).heights).toEqual({ collapsed: 136, half: 136, expanded: 136 });
    expect(soloSheet(false).heights).toEqual({ collapsed: 72, half: 72, expanded: 72 });
    expect(soloSheet(true).snaps).toEqual(['half']);
  });
  it('the arrival panel is 216 dp at every snap, with or without a stop card flag', () => {
    expect(soloSheet(true, false, true).heights).toEqual({ collapsed: 216, half: 216, expanded: 216 });
    expect(soloSheet(false, false, true).heights.half).toBe(216);
    expect(soloSheet(true, true, true).heights.half).toBe(280);
    expect(ARRIVAL_PANEL_H).toBe(216);
  });
  it('a load error adds its 64 dp row', () => {
    expect(soloSheet(false, true).heights.half).toBe(136);
    expect(soloSheet(true, true).heights.half).toBe(200);
    expect(soloSheet(true, false).heights.half).toBe(136);
  });
});

describe('listContentHeight', () => {
  const me: LiveItem = { kind: 'me', key: 'me' };
  it('sums the row heights', () => {
    expect(listContentHeight({ items: [me, rider('a', 'moving'), { kind: 'label', key: 'label' }], loaded: true, loadError: false })).toBe(56 + 72 + 32);
  });
  it('adds the 64 dp error row and uses three skeleton rows while loading', () => {
    expect(listContentHeight({ items: [me], loaded: true, loadError: true })).toBe(64 + 56);
    expect(listContentHeight({ items: [], loaded: false, loadError: false })).toBe(3 * 80);
  });
});

describe('snap stepping', () => {
  it('handle tap cycles collapsed -> half -> expanded -> collapsed', () => {
    expect(nextSnap('collapsed')).toBe('half');
    expect(nextSnap('half')).toBe('expanded');
    expect(nextSnap('expanded')).toBe('collapsed');
  });
  it('with two snaps the tap toggles collapsed <-> half only', () => {
    const two: SheetSnap[] = ['collapsed', 'half'];
    expect(nextSnap('collapsed', two)).toBe('half');
    expect(nextSnap('half', two)).toBe('collapsed');
    expect(isLastSnap('half', two)).toBe(true);
    expect(isLastSnap('half', ['collapsed', 'half', 'expanded'])).toBe(false);
  });
  it('screen-reader steps stop at the ends', () => {
    expect(stepSnap('collapsed', -1)).toBe('collapsed');
    expect(stepSnap('expanded', 1)).toBe('expanded');
    expect(stepSnap('half', 1)).toBe('expanded');
    expect(stepSnap('half', -1)).toBe('collapsed');
    expect(stepSnap('half', 1, ['collapsed', 'half'])).toBe('half');
  });
  it('parses anything else as half', () => {
    expect(parseSnap('expanded')).toBe('expanded');
    expect(parseSnap('collapsed')).toBe('collapsed');
    expect(parseSnap('x')).toBe('half');
    expect(parseSnap(undefined)).toBe('half');
  });
});

describe('settleSnap', () => {
  const heights = snapHeights(700, 0, false, 2000).heights; // 72 / 315 / 595

  it('slow release goes to the nearest snap', () => {
    expect(settleSnap({ visibleH: 150, velocityY: 0, heights, from: 'collapsed' })).toBe('collapsed');
    expect(settleSnap({ visibleH: 200, velocityY: 0, heights, from: 'collapsed' })).toBe('half');
    expect(settleSnap({ visibleH: 480, velocityY: 0, heights, from: 'half' })).toBe('expanded');
  });
  it('a drag that returns near the start stays put', () => {
    expect(settleSnap({ visibleH: 300, velocityY: 50, heights, from: 'half' })).toBe('half');
  });
  it('a fling up or down moves at least one snap in its direction', () => {
    expect(settleSnap({ visibleH: 120, velocityY: -1500, heights, from: 'collapsed' })).not.toBe('collapsed');
    expect(settleSnap({ visibleH: 300, velocityY: -1200, heights, from: 'half' })).toBe('expanded');
    expect(settleSnap({ visibleH: 300, velocityY: 1200, heights, from: 'half' })).toBe('collapsed');
    expect(settleSnap({ visibleH: 590, velocityY: 1000, heights, from: 'expanded' })).not.toBe('expanded');
  });
  it('only settles on available snaps', () => {
    const two = snapHeights(700, 0, false, 128); // 72 / 208 / 208
    const snaps = two.snaps;
    expect(settleSnap({ visibleH: 400, velocityY: 0, heights: two.heights, from: 'half', snaps })).toBe('half');
    expect(settleSnap({ visibleH: 150, velocityY: -1500, heights: two.heights, from: 'half', snaps })).toBe('half');
    expect(settleSnap({ visibleH: 150, velocityY: -1500, heights: two.heights, from: 'collapsed', snaps })).toBe('half');
  });
  it('a hard fling can skip a snap, a soft one does not', () => {
    expect(settleSnap({ visibleH: 100, velocityY: -4000, heights, from: 'collapsed' })).toBe('expanded');
    expect(settleSnap({ visibleH: 100, velocityY: -900, heights, from: 'collapsed' })).toBe('half');
  });
});

describe('summary and pinned alerts', () => {
  const items: LiveItem[] = [
    { kind: 'me', key: 'me' },
    rider('a', 'moving'),
    rider('b', 'sos'),
    rider('c', 'stopped'),
    rider('d', 'offline'),
    rider('e', 'moving'),
  ];

  it('counts me as a rider and lists only non-zero exceptions', () => {
    const c = sheetCounts(items, false);
    expect(c).toEqual({ riders: 6, sos: 1, stopped: 1, offline: 1 });
    expect(summaryLine(c)).toBe('6 riders · 1 SOS · 1 stopped · 1 offline');
    expect(summaryLine({ riders: 5, sos: 1, stopped: 1, offline: 0 })).toBe('5 riders · 1 SOS · 1 stopped');
    expect(summaryLine({ riders: 1, sos: 0, stopped: 0, offline: 0 })).toBe('1 rider');
  });
  it('my own SOS is counted', () => {
    expect(sheetCounts([{ kind: 'me', key: 'me' }], true).sos).toBe(1);
  });
  it('pins SOS first, then stopped, then offline, max two', () => {
    const pinned = pinnedAlerts(items);
    expect(pinned).toHaveLength(MAX_PINNED);
    expect(pinned.map((p) => p.userId)).toEqual(['b', 'c']);
  });
  it('an SOS is never dropped for a lower-severity row', () => {
    const many: LiveItem[] = [rider('x', 'offline'), rider('y', 'stopped'), rider('z', 'offline'), rider('s', 'sos')];
    expect(pinnedAlerts(many)[0].userId).toBe('s');
  });
  it('pins nothing when everyone is moving', () => {
    expect(pinnedAlerts([rider('a', 'moving'), { kind: 'me', key: 'me' }])).toEqual([]);
  });
});
