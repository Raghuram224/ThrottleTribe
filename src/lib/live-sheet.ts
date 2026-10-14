// Pure model for the live rider bottom sheet: content-driven snap heights, fling settling, the collapsed summary line
// and which riders stay pinned while it is collapsed. No React.
import { copy, plural, t } from '@/lib/copy';
import { itemHeight, ROW_HEIGHTS, type LiveItem, type RiderItem } from '@/lib/live-list';
import { size, space, touchTarget } from '@/theme/tokens';

export type SheetSnap = 'collapsed' | 'half' | 'expanded';
export const SNAP_ORDER: readonly SheetSnap[] = ['collapsed', 'half', 'expanded'];

export function parseSnap(value: unknown): SheetSnap {
  return value === 'collapsed' || value === 'expanded' ? value : 'half';
}

/** Grabber zone (16) + summary row (56). */
export const SHEET_HEADER_H = 72;
/** Next-stop card (20 C5): a 64 dp info row above the summary line, in every snap, only while a stop is set. */
export const STOP_CARD_H = size.sheetInfoRow;
/** Solo panel (20 C4): 8 dp under the radius-24 corners, then the optional stop card, then the 64 invite row. */
export const SOLO_TOP = space.sm;
const PINNED_ROW_H = 72;
const SUMMARY_ROW_H = 56;
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

export interface SheetModel {
  /** Visible height at each snap, in dp. `expanded` equals `half` when it is not an available snap. */
  heights: Record<SheetSnap, number>;
  /** The snaps the sheet can rest at, smallest first. */
  snaps: SheetSnap[];
}

/**
 * Content-driven snap heights (20 C6). `listContentH` is the height of every list row (pinned alerts
 * included) without any bottom spacer. Half is 45 % of the area but never taller than the content;
 * expanded is the content, capped at 85 %. When expanded is less than a rider row (72) above half there is no third snap.
 */
export function snapHeights(areaH: number, pinnedCount: number, hasStopCard: boolean, listContentH: number): SheetModel {
  const fit = headerHeight(hasStopCard) + Math.max(0, listContentH) + space.sm;
  const collapsed = peekHeight(pinnedCount, hasStopCard);
  const half = Math.max(collapsed + SUMMARY_ROW_H, Math.min(Math.round(HALF_FRACTION * areaH), fit));
  const expanded = Math.min(Math.round(EXPANDED_FRACTION * areaH), fit);
  // A third snap less than one rider row above half is a stop nobody can tell apart: two snaps, at the taller height.
  if (expanded - half >= ROW_HEIGHTS.rider) {
    return { heights: { collapsed, half, expanded }, snaps: ['collapsed', 'half', 'expanded'] };
  }
  const only = Math.max(half, expanded);
  return { heights: { collapsed, half: only, expanded: only }, snaps: ['collapsed', 'half'] };
}

/**
 * Arrival panel body under the arrived card (21 §2.8): 12 + Pick next destination 56 + 12 + End ride 56 + 8.
 * With the card (64) and the 8 dp top that is 216.
 */
export const ARRIVAL_ACTIONS_H = space.md + touchTarget + space.md + touchTarget + space.sm;
export const ARRIVAL_PANEL_H = SOLO_TOP + STOP_CARD_H + ARRIVAL_ACTIONS_H;

/**
 * Solo panel: one fixed height at every snap, so overlay shift and camera insets need no special case.
 * A failed reload adds the 64 dp load-error row above the invite row. `arrived` swaps the invite row for
 * the two arrival buttons (216 dp, the arrived card included).
 */
export function soloSheet(hasStopCard: boolean, hasError = false, arrived = false): SheetModel {
  const err = hasError ? size.sheetInfoRow : 0;
  const h = arrived
    ? ARRIVAL_PANEL_H + err
    : SOLO_TOP + (hasStopCard ? STOP_CARD_H : 0) + err + size.sheetInfoRow;
  return { heights: { collapsed: h, half: h, expanded: h }, snaps: ['half'] };
}

/** A stored snap that is not available (a persisted `expanded` on a short list) shows as `half`; the pref is left alone. */
export function resolveSnap(snap: SheetSnap, snaps: readonly SheetSnap[]): SheetSnap {
  return snaps.includes(snap) ? snap : snaps.includes('half') ? 'half' : snaps[snaps.length - 1];
}

/** True at the largest available snap (the chevron then points down and a tap collapses). */
export function isLastSnap(snap: SheetSnap, snaps: readonly SheetSnap[]): boolean {
  return snap === snaps[snaps.length - 1];
}

/** Height of the list rows (no spacer): rows, the load-error row, or three skeleton rows while loading. */
export const SKELETON_ROW_H = ROW_HEIGHTS.rider + space.sm;
export function listContentHeight(args: {
  items: LiveItem[];
  loaded: boolean;
  loadError: boolean;
}): number {
  const err = args.loadError ? size.sheetInfoRow : 0;
  if (!args.loaded) return err + 3 * SKELETON_ROW_H;
  return err + args.items.reduce((sum, i) => sum + itemHeight(i), 0);
}

/** Handle tap / chevron: walks the available snaps and wraps to the first. */
export function nextSnap(current: SheetSnap, snaps: readonly SheetSnap[] = SNAP_ORDER): SheetSnap {
  return snaps[(snaps.indexOf(current) + 1) % snaps.length];
}

/** Screen-reader step: -1 = smaller, +1 = larger. Stays put at the ends. */
export function stepSnap(current: SheetSnap, direction: 1 | -1, snaps: readonly SheetSnap[] = SNAP_ORDER): SheetSnap {
  const i = snaps.indexOf(current) + direction;
  return snaps[Math.min(snaps.length - 1, Math.max(0, i))];
}

function nearestSnap(visibleH: number, heights: Record<SheetSnap, number>, snaps: readonly SheetSnap[]): SheetSnap {
  let best: SheetSnap = snaps[0];
  for (const s of snaps) {
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
  /** Available snaps; defaults to all three. */
  snaps?: readonly SheetSnap[];
}): SheetSnap {
  const { visibleH, velocityY, heights, from, snaps = SNAP_ORDER } = args;
  const projected = visibleH - velocityY * PROJECT_S;
  let target = nearestSnap(projected, heights, snaps);
  if (Math.abs(velocityY) >= FLING_VELOCITY) {
    const dir = velocityY < 0 ? 1 : -1;
    const fromIdx = snaps.indexOf(from);
    const targetIdx = snaps.indexOf(target);
    // A fling must not end up further back than where the drag started.
    if ((dir === 1 && targetIdx <= fromIdx) || (dir === -1 && targetIdx >= fromIdx)) {
      target = stepSnap(from, dir, snaps);
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
