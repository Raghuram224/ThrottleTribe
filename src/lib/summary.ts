// Pure summary maths (docs/design/08): my distance, stops, SOS pairs. No React, no native modules.
import { fill, riderCount as riderCountText, copy } from '@/lib/copy';
import { formatDistance, formatDuration } from '@/lib/format';
import { haversineM, type LatLng } from '@/lib/geo';

/**
 * Share ride (13 §9) is offered only for a finished ride with no SOS in it: never invite sharing an
 * emergency, and a cancelled ride has nothing to share. Unknown (events still loading or failed)
 * hides it too.
 */
export function summaryShareVisible(state: { cancelled: boolean; ready: boolean; sosCount: number }): boolean {
  return !state.cancelled && state.ready && state.sosCount === 0;
}

/** "Rode 86 km with 6 riders in 2 h 14 min on Throttle Tribe." No names, no location. */
export function summaryShareMessage(input: {
  distanceM: number | null;
  riders: number;
  durationMs: number | null;
}): string {
  const riders = riderCountText(input.riders);
  const duration = input.durationMs !== null ? formatDuration(input.durationMs) : '—';
  return input.distanceM !== null
    ? fill(copy['summary.shareMessage'], { km: formatDistance(input.distanceM), riders, duration })
    : fill(copy['summary.shareMessageNoKm'], { riders, duration });
}

/** The hero number: my distance, or the duration when no distance could be computed. */
export function summaryHeroKind(distanceM: number | null): 'distance' | 'duration' {
  return distanceM !== null ? 'distance' : 'duration';
}

export interface SummarySample extends LatLng {
  recorded_at: string;
  accuracy_m?: number | null;
}

/** Samples less accurate than this are GPS noise for a distance sum. */
export const MAX_ACCURACY_M = 50;
/** Faster than this between two samples is a GPS spike, not riding. */
export const MAX_SPEED_MPS = 200 / 3.6;
/** After this many consecutive rejected jumps the next sample becomes the new anchor (a real gap). */
const MAX_SKIPS = 3;

/** Sum of consecutive haversine hops, ignoring inaccurate samples and impossible jumps. */
export function sumDistanceM(samples: SummarySample[]): number {
  let total = 0;
  let anchor: SummarySample | null = null;
  let skips = 0;
  for (const s of samples) {
    if (s.accuracy_m != null && s.accuracy_m > MAX_ACCURACY_M) continue;
    if (!anchor) {
      anchor = s;
      continue;
    }
    const dt = (Date.parse(s.recorded_at) - Date.parse(anchor.recorded_at)) / 1000;
    const d = haversineM(anchor, s);
    if (!(dt > 0) || d / dt > MAX_SPEED_MPS) {
      // Keep the old anchor so a one-sample spike does not poison the next hop.
      if (++skips >= MAX_SKIPS) {
        anchor = s;
        skips = 0;
      }
      continue;
    }
    skips = 0;
    total += d;
    anchor = s;
  }
  return total;
}

/** Floored ride duration in ms; null when the ride never started or has no end. */
export function rideDurationMs(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isNaN(ms) ? null : Math.max(0, Math.floor(ms / 60_000) * 60_000);
}

/** "Left early" only when the rider left before the ride ended; leaving afterwards is not early. */
export function leftEarly(leftAt: string | null, endedAt: string | null): boolean {
  if (!leftAt) return false;
  if (!endedAt) return true;
  const left = Date.parse(leftAt);
  const ended = Date.parse(endedAt);
  if (Number.isNaN(left) || Number.isNaN(ended)) return false;
  return left < ended;
}

export interface SummaryEvent {
  type: string;
  user_id: string | null;
  created_at: string;
  payload: unknown;
}

export interface StopEntry {
  userId: string;
  /** Epoch ms when the stop began (payload.since, else the event time). */
  at: number;
}

const MERGE_WITHIN_MS = 2 * 60_000;

function sinceOf(e: SummaryEvent): number {
  const p = e.payload as { since?: unknown } | null;
  const since = typeof p?.since === 'string' ? Date.parse(p.since) : NaN;
  return Number.isNaN(since) ? Date.parse(e.created_at) : since;
}

/**
 * `stopped` events oldest first; consecutive stops by the same rider within 2 min merge. Stops that
 * began before `startedAt` happened in the lobby and are ignored (old rides have such events).
 */
export function buildStops(events: SummaryEvent[], startedAt?: string | null): StopEntry[] {
  const startMs = startedAt ? Date.parse(startedAt) : NaN;
  const stops = events
    .filter((e) => e.type === 'stopped' && e.user_id)
    .map((e) => ({ userId: e.user_id as string, at: sinceOf(e) }))
    .filter((s) => Number.isNaN(startMs) || s.at >= startMs)
    .sort((a, b) => a.at - b.at);
  const out: StopEntry[] = [];
  const lastByRider = new Map<string, StopEntry>();
  for (const s of stops) {
    const last = lastByRider.get(s.userId);
    if (last && s.at - last.at <= MERGE_WITHIN_MS) continue;
    out.push(s);
    lastByRider.set(s.userId, s);
  }
  return out;
}

export interface SosEntry {
  userId: string;
  at: number;
  /** null = never cleared. */
  clearedAt: number | null;
}

/** Each `sos` event paired with the next `sos_cleared` of the same rider. */
export function buildSos(events: SummaryEvent[]): SosEntry[] {
  const sorted = events
    .filter((e) => (e.type === 'sos' || e.type === 'sos_cleared') && e.user_id)
    .map((e) => ({ type: e.type, userId: e.user_id as string, at: Date.parse(e.created_at) }))
    .sort((a, b) => a.at - b.at);
  const out: SosEntry[] = [];
  const open = new Map<string, SosEntry>();
  for (const e of sorted) {
    if (e.type === 'sos') {
      const entry: SosEntry = { userId: e.userId, at: e.at, clearedAt: null };
      out.push(entry);
      open.set(e.userId, entry);
    } else {
      const entry = open.get(e.userId);
      if (entry) {
        entry.clearedAt = e.at;
        open.delete(e.userId);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- signature pass (16 §4)

/** Samples that count for the route and the distance: accurate enough and not a GPS spike. */
export function filterSamples(samples: SummarySample[]): SummarySample[] {
  const out: SummarySample[] = [];
  let anchor: SummarySample | null = null;
  let skips = 0;
  for (const s of samples) {
    if (s.accuracy_m != null && s.accuracy_m > MAX_ACCURACY_M) continue;
    if (!anchor) {
      anchor = s;
      out.push(s);
      continue;
    }
    const dt = (Date.parse(s.recorded_at) - Date.parse(anchor.recorded_at)) / 1000;
    const d = haversineM(anchor, s);
    if (!(dt > 0) || d / dt > MAX_SPEED_MPS) {
      if (++skips >= MAX_SKIPS) {
        anchor = s;
        skips = 0;
        out.push(s);
      }
      continue;
    }
    skips = 0;
    anchor = s;
    out.push(s);
  }
  return out;
}

/** Average speed in whole km/h; hidden (null) under 1 km or 5 minutes, where it would be noise. */
export function averageKmh(distanceM: number | null, durationMs: number | null): number | null {
  if (distanceM === null || durationMs === null) return null;
  if (distanceM < 1000 || durationMs < 5 * 60_000) return null;
  return Math.round(distanceM / 1000 / (durationMs / 3_600_000));
}

/**
 * My distance travelled at epoch `atMs`, summed along the cleaned samples; null when there are fewer
 * than two samples or `atMs` is before the first one.
 */
export function distanceAtTime(samples: SummarySample[], atMs: number): number | null {
  const clean = filterSamples(samples);
  if (clean.length < 2) return null;
  if (atMs < Date.parse(clean[0].recorded_at)) return null;
  let total = 0;
  for (let i = 1; i < clean.length; i++) {
    const t = Date.parse(clean[i].recorded_at);
    if (t > atMs) break;
    total += haversineM(clean[i - 1], clean[i]);
  }
  return total;
}

/** "6:04" (12-hour clock, local time) for the ride log's time column. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function meridiem(ms: number): string {
  return new Date(ms).getHours() < 12 ? 'AM' : 'PM';
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "Sun, Oct 12 · 6:04 – 8:18 AM"; both meridiems when they differ. Without an end: just the start. */
export function formatRideRange(startedAt: string | null, endedAt: string | null): string {
  const s = startedAt ? Date.parse(startedAt) : NaN;
  if (Number.isNaN(s)) return '';
  const d = new Date(s);
  const date = `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
  const e = endedAt ? Date.parse(endedAt) : NaN;
  if (Number.isNaN(e)) return `${date} · ${formatClock(s)} ${meridiem(s)}`;
  const same = meridiem(s) === meridiem(e);
  return `${date} · ${formatClock(s)}${same ? '' : ` ${meridiem(s)}`} – ${formatClock(e)} ${meridiem(e)}`;
}

export interface RideLogEntry {
  key: string;
  kind: 'start' | 'stop' | 'sos' | 'end';
  atMs: number;
  /** "6:04" */
  time: string;
  title: string;
  meta: string | null;
}

/**
 * Chronological ride log (16 §4): Started, each stop and SOS, Ride ended. "km N" is my distance at
 * that time and is left out when unknown. `nameOf` returns the rider's display name.
 */
export function buildRideLog(input: {
  startedAt: string | null;
  endedAt: string | null;
  riders: number;
  stops: StopEntry[];
  sos: SosEntry[];
  nameOf: (userId: string) => string;
  samples: SummarySample[] | null;
}): RideLogEntry[] {
  const { startedAt, endedAt, riders, stops, sos, nameOf, samples } = input;
  const km = (atMs: number): string | null => {
    const d = samples ? distanceAtTime(samples, atMs) : null;
    return d !== null && d >= 100 ? fill(copy['summary.logKm'], { n: Math.round(d / 1000) }) : null;
  };
  const entries: RideLogEntry[] = [];
  const s = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isNaN(s)) {
    entries.push({
      key: 'start',
      kind: 'start',
      atMs: s,
      time: formatClock(s),
      title: fill(copy['summary.logStarted'], { riders: riderCountText(riders) }),
      meta: null,
    });
  }
  for (const st of stops) {
    entries.push({
      key: `stop-${st.userId}-${st.at}`,
      kind: 'stop',
      atMs: st.at,
      time: formatClock(st.at),
      title: fill(copy['summary.logStopped'], { name: nameOf(st.userId) }),
      meta: km(st.at),
    });
  }
  for (const so of sos) {
    const cleared =
      so.clearedAt !== null
        ? fill(copy['summary.logSosCleared'], { time: formatClock(so.clearedAt) })
        : copy['summary.logSosNotCleared'];
    entries.push({
      key: `sos-${so.userId}-${so.at}`,
      kind: 'sos',
      atMs: so.at,
      time: formatClock(so.at),
      title: fill(copy['summary.logSos'], { name: nameOf(so.userId) }),
      meta: [cleared, km(so.at)].filter(Boolean).join(' · '),
    });
  }
  const e = endedAt ? Date.parse(endedAt) : NaN;
  if (!Number.isNaN(e)) {
    entries.push({
      key: 'end',
      kind: 'end',
      atMs: e,
      time: formatClock(e),
      title: copy['summary.logEnded'],
      meta: copy['summary.logEndedMeta'],
    });
  }
  // Stable chronological order; start first and end last on ties.
  const rank = { start: 0, stop: 1, sos: 1, end: 2 } as const;
  return entries.sort((a, b) => a.atMs - b.atMs || rank[a.kind] - rank[b.kind]);
}
