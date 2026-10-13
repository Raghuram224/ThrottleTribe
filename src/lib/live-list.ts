// Pure list model for the live screen (docs/design/06 §4): sorting, pinning, line-1 text, a11y text.
// No React and no native modules, so it is unit-tested.
import {
  LEVEL_WITHIN_M,
  OFF_TRAIL_M,
  projectOntoTrail,
  relativePosition,
  type LatLng,
  type RelativePosition,
  type Trail,
} from '@/lib/geo';
import { distancePhrase } from '@/lib/format';
import { copy, spokenDistance, spokenDuration } from '@/lib/copy';
import type { RiderStatus, RiderStatusResult } from '@/lib/rider-status';

export interface LiveMember {
  userId: string;
  name: string;
  colorIndex: number;
  role: 'leader' | 'rider';
  sos: boolean;
  sosAt: string | null;
  leftAt: string | null;
}

export interface RiderItem {
  kind: 'rider';
  key: string;
  userId: string;
  /** null = this rider has no position yet. */
  rel: RelativePosition | null;
  status: RiderStatus;
  sinceMs: number | null;
}
export interface MeItem {
  kind: 'me';
  key: 'me';
}
export interface LabelItem {
  kind: 'label';
  key: 'label';
}
/** Info row at the list top: "Waiting for your GPS". */
export interface NoFixItem {
  kind: 'noFix';
  key: 'noFix';
}
export type LiveItem = RiderItem | MeItem | LabelItem | NoFixItem;

export interface BuildInput {
  members: LiveMember[];
  positions: Record<string, LatLng | undefined>;
  statuses: Record<string, RiderStatusResult | undefined>;
  trail: Trail;
  myUserId: string | null;
  /**
   * Riders currently shown as "With you". Read for the 100 m in / 150 m out hysteresis and updated
   * here, so a rider hovering around 100 m does not flicker between "With you" and "100 m behind".
   */
  levelMemory?: Set<string>;
}

/** 06 row/label heights, used to compute scroll offsets without measuring. */
export const ROW_HEIGHTS = { rider: 72, me: 56, label: 32, noFix: 56 } as const;

/**
 * Map height in split mode: whatever the list does not need, kept between 40 % and 55 % of the
 * content area. Few riders give the map ~50-60 % and no blank space under the list; many riders fall
 * back to 35 % and the list scrolls.
 */
export function mapHeightFor(areaH: number, listContentH: number): number {
  const min = 0.35 * areaH;
  const max = 0.6 * areaH;
  return Math.round(Math.min(max, Math.max(min, areaH - listContentH)));
}

export function itemHeight(item: LiveItem): number {
  return ROW_HEIGHTS[item.kind === 'rider' ? 'rider' : item.kind];
}

/** Top offset of the item at `index`. */
export function offsetOf(items: LiveItem[], index: number): number {
  let y = 0;
  for (let i = 0; i < index && i < items.length; i++) y += itemHeight(items[i]);
  return y;
}

interface Sortable {
  item: RiderItem | MeItem;
  along: number;
  name: string;
}

/**
 * Groups entries whose `along` lies within LEVEL_WITHIN_M of the group head, then orders each group
 * by name (me first). A plain comparator with a tolerance is not transitive; grouping is.
 */
function sortAlong(entries: Sortable[]): (RiderItem | MeItem)[] {
  const sorted = [...entries].sort((a, b) => b.along - a.along);
  const out: (RiderItem | MeItem)[] = [];
  let i = 0;
  while (i < sorted.length) {
    const head = sorted[i].along;
    const group: Sortable[] = [];
    while (i < sorted.length && head - sorted[i].along < LEVEL_WITHIN_M) group.push(sorted[i++]);
    group.sort((a, b) => {
      if (a.item.kind === 'me') return -1;
      if (b.item.kind === 'me') return 1;
      return a.name.localeCompare(b.name);
    });
    out.push(...group.map((g) => g.item));
  }
  return out;
}

/**
 * Order (06 §4): SOS riders pinned (newest first); on-trail riders and me by distance along the
 * leader's trail, furthest ahead first; `OFF ROUTE` label; away riders by straight distance;
 * riders never seen last. With fewer than 2 trail points everyone is `away` and the label is left out.
 */
export function buildLiveList(input: BuildInput): LiveItem[] {
  const { members, positions, statuses, trail, myUserId, levelMemory } = input;
  const myPos = myUserId ? positions[myUserId] : undefined;
  const hasTrail = trail.points.length >= 2;

  const me: MeItem = { kind: 'me', key: 'me' };
  const sos: { item: RiderItem; at: number }[] = [];
  const onTrail: Sortable[] = [];
  const away: { item: RiderItem; d: number; name: string }[] = [];
  const unseen: { item: RiderItem; name: string }[] = [];

  for (const m of members) {
    if (m.leftAt || m.userId === myUserId) continue;
    const st = statuses[m.userId];
    const pos = positions[m.userId];
    const rel =
      pos && myPos ? relativePosition(trail, myPos, pos, levelMemory?.has(m.userId) ?? false) : null;
    if (levelMemory) {
      if (rel?.kind === 'level') levelMemory.add(m.userId);
      else levelMemory.delete(m.userId);
    }
    const item: RiderItem = {
      kind: 'rider',
      key: m.userId,
      userId: m.userId,
      rel,
      status: st?.status ?? 'offline',
      sinceMs: st?.sinceMs ?? null,
    };
    if (m.sos) {
      sos.push({ item, at: m.sosAt ? Date.parse(m.sosAt) || 0 : 0 });
    } else if (!pos) {
      unseen.push({ item, name: m.name });
    } else if (!myPos) {
      // No fix of mine: no distances. Keep trail order when the trail exists, else by name.
      const along = hasTrail ? projectOntoTrail(trail, pos).alongM : 0;
      onTrail.push({ item, along, name: m.name });
    } else if (rel && rel.kind !== 'away') {
      onTrail.push({ item, along: projectOntoTrail(trail, pos).alongM, name: m.name });
    } else {
      away.push({ item, d: rel?.distanceM ?? 0, name: m.name });
    }
  }

  const items: LiveItem[] = [];
  if (!myPos) items.push({ kind: 'noFix', key: 'noFix' });

  sos.sort((a, b) => b.at - a.at);
  items.push(...sos.map((s) => s.item));

  // Me joins the along-trail order at my own projection, but only when I am on the trail;
  // otherwise (no fix, no trail, off route) I am the reference at the top of the list.
  if (myPos && hasTrail) {
    const mine = projectOntoTrail(trail, myPos);
    if (mine.offTrailM <= OFF_TRAIL_M) onTrail.push({ item: me, along: mine.alongM, name: '' });
  }
  const meInOrder = onTrail.some((s) => s.item.kind === 'me');
  if (!meInOrder) items.push(me);
  items.push(...sortAlong(onTrail));

  away.sort((a, b) => a.d - b.d || a.name.localeCompare(b.name));
  unseen.sort((a, b) => a.name.localeCompare(b.name));
  const offRoute = [...away.map((a) => a.item), ...unseen.map((u) => u.item)];
  if (offRoute.length > 0) {
    if (hasTrail) items.push({ kind: 'label', key: 'label' });
    items.push(...offRoute);
  }
  return items;
}

/** The 06 line-1 phrase for `them` as seen from `me`; null when either has no position. */
export function phraseFor(trail: Trail, me: LatLng | undefined, them: LatLng | undefined): string | null {
  if (!me || !them) return null;
  return distancePhrase(relativePosition(trail, me, them));
}

/** Re-applies a frozen key order to fresh items (rows must not jump under a finger). New keys go last. */
export function applyOrder(items: LiveItem[], keys: string[]): LiveItem[] {
  const rank = new Map(keys.map((k, i) => [k, i]));
  const known = items.filter((i) => rank.has(i.key) && i.key !== 'label');
  const fresh = items.filter((i) => !rank.has(i.key) && i.key !== 'label');
  known.sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
  const labelKept = keys.includes('label') ? items.filter((i) => i.key === 'label') : [];
  const merged = [...known, ...fresh];
  if (labelKept.length === 0) return merged;
  // Keep the label where it was: right before the first off-route row of the frozen order.
  const labelAt = keys.indexOf('label');
  const idx = merged.findIndex((i) => (rank.get(i.key) ?? Infinity) > labelAt);
  if (idx === -1) return [...merged, labelKept[0]];
  return [...merged.slice(0, idx), labelKept[0], ...merged.slice(idx)];
}

export interface Line1 {
  text: string;
  /** Rendered in textMuted (no position, offline or I am offline: old data must look old). */
  muted: boolean;
}

/** Line 1 of a rider row (06 §4 table). `approx` = rider offline or I am offline: prefix `≈`. */
export function rowLine1(rel: RelativePosition | null, hasPosition: boolean, approx: boolean): Line1 {
  if (!hasPosition) return { text: copy['live.noLocation'], muted: true };
  if (!rel) return { text: '—', muted: approx };
  const phrase = distancePhrase(rel);
  const prefix = approx && rel.kind !== 'level' ? '≈' : '';
  return { text: `${prefix}${phrase}`, muted: approx };
}

/** "4.2 km" -> "4.2 kilometres"; "350 m" -> "350 metres". For screen readers. */
export function spoken(text: string): string {
  return spokenDistance(text.replace('≈', 'about ')).replace('With you', 'with you');
}

/** Row accessibility label (06 §8): "Priya, 4.2 kilometres behind, stopped 6 minutes". */
export function rowA11y(args: {
  name: string;
  line1: string;
  hasPosition: boolean;
  status: RiderStatus;
  sinceMs: number | null;
  leader: boolean;
}): string {
  const { name, line1, hasPosition, status, sinceMs, leader } = args;
  const dur = sinceMs != null ? spokenDuration(sinceMs) : null;
  const parts: string[] = [name];
  if (status === 'offline') {
    parts.push(dur ? `no signal, last seen ${dur} ago` : 'no signal yet');
    if (hasPosition) parts.push(spoken(line1));
  } else {
    parts.push(spoken(line1));
    if (status === 'stopped') parts.push(dur ? `stopped ${dur}` : 'stopped');
    else if (status === 'sos') parts.push(dur ? `SOS ${dur}` : 'SOS');
    else parts.push('moving');
  }
  if (leader) parts.push('leader');
  return parts.join(', ');
}

/** Whole-minute floor, so memoised rows re-render at most once a minute (06 §7). */
export function floorToMinute(ms: number | null): number | null {
  return ms == null ? null : Math.floor(ms / 60_000) * 60_000;
}
