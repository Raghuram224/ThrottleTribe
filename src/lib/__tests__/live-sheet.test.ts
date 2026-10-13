import type { LiveItem, RiderItem } from '../live-list';
import {
  MAX_PINNED,
  nextSnap,
  parseSnap,
  peekHeight,
  pinnedAlerts,
  settleSnap,
  SHEET_HEADER_H,
  STOP_CARD_H,
  headerHeight,
  sheetCounts,
  snapHeights,
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
  it('collapsed is the header plus pinned rows (max 2); half ~45 %, expanded ~85 %', () => {
    expect(peekHeight(0)).toBe(SHEET_HEADER_H);
    expect(peekHeight(1)).toBe(SHEET_HEADER_H + 72);
    expect(peekHeight(5)).toBe(SHEET_HEADER_H + 2 * 72);
    const h = snapHeights(700, 0);
    expect(h.collapsed).toBe(72);
    expect(h.half).toBe(315);
    expect(h.expanded).toBe(595);
  });
  it('the stop card adds 56 dp to every snap that depends on the header', () => {
    expect(STOP_CARD_H).toBe(56);
    expect(headerHeight(false)).toBe(SHEET_HEADER_H);
    expect(headerHeight(true)).toBe(SHEET_HEADER_H + 56);
    expect(peekHeight(0, true)).toBe(SHEET_HEADER_H + 56);
    expect(peekHeight(2, true)).toBe(SHEET_HEADER_H + 56 + 2 * 72);
    const h = snapHeights(700, 0, true);
    expect(h.collapsed).toBe(128);
    expect(h.half).toBe(315);
    expect(h.expanded).toBe(595);
  });
  it('stays strictly increasing with a stop card on a short screen', () => {
    const h = snapHeights(300, 2, true);
    expect(h.half).toBeGreaterThan(h.collapsed);
    expect(h.expanded).toBeGreaterThan(h.half);
  });
  it('stays strictly increasing on a short screen with two alerts', () => {
    const h = snapHeights(300, 2);
    expect(h.half).toBeGreaterThan(h.collapsed);
    expect(h.expanded).toBeGreaterThan(h.half);
  });
});

describe('snap stepping', () => {
  it('handle tap cycles collapsed -> half -> expanded -> collapsed', () => {
    expect(nextSnap('collapsed')).toBe('half');
    expect(nextSnap('half')).toBe('expanded');
    expect(nextSnap('expanded')).toBe('collapsed');
  });
  it('screen-reader steps stop at the ends', () => {
    expect(stepSnap('collapsed', -1)).toBe('collapsed');
    expect(stepSnap('expanded', 1)).toBe('expanded');
    expect(stepSnap('half', 1)).toBe('expanded');
    expect(stepSnap('half', -1)).toBe('collapsed');
  });
  it('parses anything else as half', () => {
    expect(parseSnap('expanded')).toBe('expanded');
    expect(parseSnap('collapsed')).toBe('collapsed');
    expect(parseSnap('x')).toBe('half');
    expect(parseSnap(undefined)).toBe('half');
  });
});

describe('settleSnap', () => {
  const heights = snapHeights(700, 0); // 72 / 315 / 595

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
