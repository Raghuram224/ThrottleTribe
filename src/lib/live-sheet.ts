// Pure model for the live rider bottom sheet: snap heights, fling settling, the collapsed summary line
// and which riders stay pinned while it is collapsed. No React.
import { copy, plural, t } from '@/lib/copy';
import type { LiveItem, RiderItem } from '@/lib/live-list';

export type SheetSnap = 'collapsed' | 'half' | 'expanded';
export const SNAP_ORDER: readonly SheetSnap[] = ['collapsed', 'half', 'expanded'];

export function parseSnap(value: unknown): SheetSnap {
  return value === 'collapsed' || value === 'expanded' ? value : 'half';
}

/** Grabber zone (16) + summary row (56). */
export const SHEET_HEADER_H = 72;
/** Next-stop card (19 A): a 56 dp row above the summary line, in every snap, only while a stop is set. */
export const STOP_CARD_H = 56;
const PINNED_ROW_H = 72;
/** At most this many alert rows stay visible while collapsed; the summary line counts the rest. */
export const MAX_PINNED = 2;
const HALF_FRACTION = 0.45;
const EXPANDED_FRACTION = 0.85;

/** Header height: grabber + summary row, plus the next-stop card when there is one. */
export function headerHeight(hasStopCard: boolean): number {
  return SHEET_HEADER_H + (hasStopCard ? STOP_CARD_H : 0);
}

/** Collapsed height: header (with the stop card, if any) plus the pinned alert rows. */
export function peekHeight(pinnedCount: number, hasStopCard = false): number {
  return headerHeight(hasStopCard) + Math.min(MAX_PINNED, Math.max(0, pinnedCount)) * PINNED_ROW_H;
}

/** Visible sheet height at each snap, in dp. Strictly increasing so every snap is distinct. */
export function snapHeights(areaH: number, pinnedCount: number, hasStopCard = false): Record<SheetSnap, number> {
  const collapsed = peekHeight(pinnedCount, hasStopCard);
  const half = Math.max(Math.round(areaH * HALF_FRACTION), collapsed + PINNED_ROW_H);
  const expanded = Math.max(Math.round(areaH * EXPANDED_FRACTION), half + PINNED_ROW_H);
  return { collapsed, half, expanded };
}

/** Handle tap / chevron: collapsed -> half -> expanded -> collapsed. */
export function nextSnap(current: SheetSnap): SheetSnap {
  return SNAP_ORDER[(SNAP_ORDER.indexOf(current) + 1) % SNAP_ORDER.length];
}

/** Screen-reader step: -1 = smaller, +1 = larger. Stays put at the ends. */
export function stepSnap(current: SheetSnap, direction: 1 | -1): SheetSnap {
  const i = SNAP_ORDER.indexOf(current) + direction;
  return SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, Math.max(0, i))];
}

function nearestSnap(visibleH: number, heights: Record<SheetSnap, number>): SheetSnap {
  let best: SheetSnap = 'collapsed';
  for (const s of SNAP_ORDER) {
    if (Math.abs(heights[s] - visibleH) < Math.abs(heights[best] - visibleH)) best = s;
  }
  return best;
}

/** A release faster than this (dp/s) is a fling: it moves at least one snap in its direction. */
export const FLING_VELOCITY = 800;
/** How far ahead (s) the release velocity is projected before picking the nearest snap. */
const PROJECT_S = 0.2;

/**
 * Snap to settle on after a drag. `velocityY` is the finger velocity in dp/s, positive = downward
 * (sheet shrinking). The release point is projected forward, then the nearest snap wins; a fling
 * always moves one step even when the projection lands back on the start.
 */
export function settleSnap(args: {
  visibleH: number;
  velocityY: number;
  heights: Record<SheetSnap, number>;
  from: SheetSnap;
}): SheetSnap {
  const { visibleH, velocityY, heights, from } = args;
  const projected = visibleH - velocityY * PROJECT_S;
  let target = nearestSnap(projected, heights);
  if (Math.abs(velocityY) >= FLING_VELOCITY) {
    const dir = velocityY < 0 ? 1 : -1;
    const fromIdx = SNAP_ORDER.indexOf(from);
    const targetIdx = SNAP_ORDER.indexOf(target);
    // A fling must not end up further back than where the drag started.
    if ((dir === 1 && targetIdx <= fromIdx) || (dir === -1 && targetIdx >= fromIdx)) {
      target = stepSnap(from, dir);
    }
  }
  return target;
}

// ------------------------------------------------------------------ collapsed content

export interface SheetCounts {
  riders: number;
  sos: number;
  stopped: number;
  offline: number;
}

/** Counts for the summary line. Me counts as a rider; my own SOS is added by the caller (`mySos`). */
export function sheetCounts(items: LiveItem[], mySos: boolean): SheetCounts {
  const counts: SheetCounts = { riders: 0, sos: mySos ? 1 : 0, stopped: 0, offline: 0 };
  for (const item of items) {
    if (item.kind === 'me') counts.riders += 1;
    if (item.kind !== 'rider') continue;
    counts.riders += 1;
    if (item.status === 'sos') counts.sos += 1;
    else if (item.status === 'stopped') counts.stopped += 1;
    else if (item.status === 'offline') counts.offline += 1;
  }
  return counts;
}

/** "5 riders · 1 SOS · 1 stopped". Exceptions only appear when non-zero. */
export function summaryLine(c: SheetCounts): string {
  const parts = [plural(c.riders, 'rider', 'riders')];
  if (c.sos > 0) parts.push(t('live.sumSos', { n: c.sos }));
  if (c.stopped > 0) parts.push(t('live.sumStopped', { n: c.stopped }));
  if (c.offline > 0) parts.push(t('live.sumOffline', { n: c.offline }));
  return parts.join(copy['live.sumSep']);
}

const PIN_RANK: Record<string, number> = { sos: 0, stopped: 1, offline: 2 };

/** Alert rows kept visible while collapsed: SOS first, then stopped, then offline; at most MAX_PINNED. */
export function pinnedAlerts(items: LiveItem[]): RiderItem[] {
  const alerts = items.filter((i): i is RiderItem => i.kind === 'rider' && i.status in PIN_RANK);
  return alerts
    .map((item, index) => ({ item, index }))
    .sort((a, b) => PIN_RANK[a.item.status] - PIN_RANK[b.item.status] || a.index - b.index)
    .slice(0, MAX_PINNED)
    .map((x) => x.item);
}
