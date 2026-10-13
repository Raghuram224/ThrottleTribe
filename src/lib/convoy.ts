// Pure model for the convoy strip (docs/design/16 §2.1): signed offsets along the route and the
// dp layout of the dots. No React, no native modules.
import { copy, riderCount, spokenDistance, t } from '@/lib/copy';
import { formatDistance } from '@/lib/format';
import { projectOntoTrail, type LatLng, type RelativePosition, type Trail } from '@/lib/geo';
import type { RiderStatus } from '@/lib/rider-status';

export interface ConvoyRider {
  key: string;
  name: string;
  colorIndex: number;
  status: RiderStatus;
  /** Signed metres along the route relative to me: ahead +, behind -. Me is 0. */
  offsetM: number;
  isMe: boolean;
}

export interface ConvoyModel {
  riders: ConvoyRider[];
  /** Riders with a position that are off the route; shown as a trailing chip, not on the track. */
  offRoute: number;
}

export interface ConvoyInputRider {
  userId: string;
  name: string;
  colorIndex: number;
  status: RiderStatus;
  rel: RelativePosition | null;
}

export const CONVOY_MIN_SPAN_M = 500;
export const CONVOY_PAD_DP = 18;
export const CONVOY_TOGETHER_M = 200;
export const CONVOY_GAP_MIN_M = 1000;
export const CONVOY_GAP_SHARE = 0.4;
const ME_NEAR_DP = 24;
const ME_SPLIT_DP = 20;
const NEAR_DP = 18;
const STACK_DP = 14;
const BUBBLE_FROM = 4;

/**
 * Builds the strip model from the live-list's relative positions. Returns null (strip hidden) when
 * I have no fix or fewer than two riders have a position. The sign of a "level" rider comes from the
 * raw along-trail delta, which `rel` does not carry.
 */
export function buildConvoy(args: {
  riders: ConvoyInputRider[];
  me: { name: string; colorIndex: number } | null;
  trail: Trail;
  positions: Record<string, LatLng | undefined>;
  myUserId: string | null;
}): ConvoyModel | null {
  const { riders, me, trail, positions, myUserId } = args;
  const myPos = myUserId ? positions[myUserId] : undefined;
  if (!myUserId || !myPos) return null;
  const myAlong = trail.points.length >= 2 ? projectOntoTrail(trail, myPos).alongM : 0;
  const out: ConvoyRider[] = [
    {
      key: 'me',
      name: me?.name ?? '',
      colorIndex: me?.colorIndex ?? 0,
      status: 'moving',
      offsetM: 0,
      isMe: true,
    },
  ];
  let offRoute = 0;
  for (const r of riders) {
    const pos = positions[r.userId];
    if (!r.rel || !pos) continue;
    if (r.rel.kind === 'away') {
      offRoute += 1;
      continue;
    }
    const delta = projectOntoTrail(trail, pos).alongM - myAlong;
    out.push({
      key: r.userId,
      name: r.name,
      colorIndex: r.colorIndex,
      status: r.status,
      offsetM: (delta >= 0 ? 1 : -1) * r.rel.distanceM,
      isMe: false,
    });
  }
  if (out.length + offRoute < 2) return null;
  return { riders: out, offRoute };
}

export interface ConvoyDot {
  key: string;
  /** Centre x in dp. */
  x: number;
  isMe: boolean;
}

export interface ConvoyBubble {
  x: number;
  /** "+3" */
  count: number;
}

export interface ConvoyLayout {
  dots: ConvoyDot[];
  bubbles: ConvoyBubble[];
  minM: number;
  maxM: number;
  spreadM: number;
  /** Tick labels (tail, lead) or null when that end is me. */
  tailTick: string | null;
  leadTick: string | null;
  together: boolean;
  /** Dashed "someone is dropping back" segment, in dp. */
  gap: { x1: number; x2: number } | null;
  /** Tail-to-lead band in dp (drawn only by styles with a `convoyBand` colour). */
  band: { x1: number; x2: number };
}

/** "+500 m" / "−1.3 km" (U+2212 minus). */
export function formatOffset(m: number): string {
  const sign = m < 0 ? '−' : '+';
  return `${sign}${formatDistance(Math.abs(m))}`;
}

/** Linear x for an offset on a bar `width` wide; the span is at least CONVOY_MIN_SPAN_M, centred. */
export function scaleFor(minM: number, maxM: number, width: number): (offsetM: number) => number {
  let lo = minM;
  let hi = maxM;
  if (hi - lo < CONVOY_MIN_SPAN_M) {
    const mid = (lo + hi) / 2;
    lo = mid - CONVOY_MIN_SPAN_M / 2;
    hi = mid + CONVOY_MIN_SPAN_M / 2;
  }
  const inner = Math.max(1, width - CONVOY_PAD_DP * 2);
  return (o) => CONVOY_PAD_DP + ((o - lo) / (hi - lo)) * inner;
}

export function layoutConvoy(riders: ConvoyRider[], width: number): ConvoyLayout {
  const offsets = riders.map((r) => r.offsetM);
  const minM = Math.min(...offsets);
  const maxM = Math.max(...offsets);
  const spreadM = maxM - minM;
  const xOf = scaleFor(minM, maxM, width);
  const clampX = (x: number) => Math.min(width - CONVOY_PAD_DP, Math.max(CONVOY_PAD_DP, x));

  const meRider = riders.find((r) => r.isMe);
  const meX = meRider ? xOf(meRider.offsetM) : 0;
  const dots: ConvoyDot[] = [];
  const bubbles: ConvoyBubble[] = [];

  if (meRider) dots.push({ key: meRider.key, x: meX, isMe: true });

  // Riders hugging me are split to either side of the arrow so the arrow never hides them.
  const others = riders.filter((r) => !r.isMe).map((r) => ({ r, x: xOf(r.offsetM) }));
  const nearMe = others.filter((o) => meRider && Math.abs(o.x - meX) < ME_NEAR_DP);
  const far = others.filter((o) => !nearMe.includes(o)).sort((a, b) => a.x - b.x);
  const sides = { left: 0, right: 0 };
  for (const o of nearMe.sort((a, b) => a.r.offsetM - b.r.offsetM)) {
    const side = o.r.offsetM > 0 ? 'right' : 'left';
    const step = sides[side]++;
    const dir = side === 'right' ? 1 : -1;
    dots.push({ key: o.r.key, x: clampX(meX + dir * (ME_SPLIT_DP + step * STACK_DP)), isMe: false });
  }

  // Cluster the rest: neighbours closer than NEAR_DP share a spot.
  let i = 0;
  while (i < far.length) {
    let j = i + 1;
    while (j < far.length && far[j].x - far[j - 1].x < NEAR_DP) j++;
    const group = far.slice(i, j);
    const centre = group.reduce((s, g) => s + g.x, 0) / group.length;
    if (group.length >= BUBBLE_FROM) {
      dots.push({ key: group[0].r.key, x: clampX(centre), isMe: false });
      bubbles.push({ x: clampX(centre + STACK_DP + 8), count: group.length - 1 });
    } else {
      const span = (group.length - 1) * STACK_DP;
      // Shift the whole stack (not each dot) when it would poke out of the bar.
      const start = Math.min(width - CONVOY_PAD_DP - span, Math.max(CONVOY_PAD_DP, centre - span / 2));
      group.forEach((g, k) => dots.push({ key: g.r.key, x: clampX(start + k * STACK_DP), isMe: false }));
    }
    i = j;
  }

  // Largest gap between consecutive riders.
  let gap: ConvoyLayout['gap'] = null;
  const sorted = [...offsets].sort((a, b) => a - b);
  let best = 0;
  let bestAt = -1;
  for (let k = 1; k < sorted.length; k++) {
    const g = sorted[k] - sorted[k - 1];
    if (g > best) {
      best = g;
      bestAt = k;
    }
  }
  if (bestAt > 0 && best >= CONVOY_GAP_MIN_M && best >= CONVOY_GAP_SHARE * spreadM) {
    gap = { x1: xOf(sorted[bestAt - 1]), x2: xOf(sorted[bestAt]) };
  }

  const tail = riders.find((r) => r.offsetM === minM);
  const lead = riders.find((r) => r.offsetM === maxM);
  return {
    dots,
    bubbles,
    minM,
    maxM,
    spreadM,
    tailTick: tail && !tail.isMe && minM !== maxM ? formatOffset(minM) : null,
    leadTick: lead && !lead.isMe && minM !== maxM ? formatOffset(maxM) : null,
    together: spreadM < CONVOY_TOGETHER_M,
    gap,
    band: { x1: xOf(minM), x2: xOf(maxM) },
  };
}

/** Spread label: "Riding together" under 200 m, else "1.8 km spread". */
export function spreadLabel(spreadM: number): string {
  return spreadM < CONVOY_TOGETHER_M
    ? copy['convoy.together']
    : t('convoy.spread', { spread: formatDistance(spreadM) });
}

/** One label for the whole strip: "Group spread 1.8 kilometres. 2 riders ahead, 1 behind. Priya has no signal." */
export function convoyA11y(model: ConvoyModel): string {
  const layout = layoutConvoy(model.riders, 300);
  const others = model.riders.filter((r) => !r.isMe);
  const ahead = others.filter((r) => r.offsetM > 0).length;
  const behind = others.length - ahead;
  const parts = [
    layout.together
      ? copy['convoy.together']
      : `Group spread ${spokenDistance(formatDistance(layout.spreadM))}`,
    `${riderCount(ahead)} ahead, ${behind} behind`,
  ];
  for (const r of others) {
    if (r.status === 'offline') parts.push(`${r.name} has no signal`);
    else if (r.status === 'stopped') parts.push(`${r.name} is stopped`);
    else if (r.status === 'sos') parts.push(`${r.name} sent SOS`);
  }
  if (model.offRoute > 0) parts.push(`${model.offRoute} off route`);
  return parts.join('. ');
}
