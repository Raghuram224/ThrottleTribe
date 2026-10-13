// Pure mapping for Home -> Recent rides (docs/design/13 §3). No React, no native modules.
import { fill, copy, plural } from '@/lib/copy';
import { formatDistance, formatDuration } from '@/lib/format';

export interface RecentRide {
  id: string;
  name: string;
  /** ISO timestamps; ended rides only. */
  startedAt: string;
  endedAt: string;
  /** Null when unknown. */
  durationMs: number | null;
  /** Active members (null when the count was not returned). */
  riders: number | null;
}

/** The shape of a `rides` row joined with a member count, as the Supabase query returns it. */
export interface RecentRideRow {
  id: string;
  name: string;
  started_at: string | null;
  ended_at: string | null;
  rider_count?: { count: number }[] | null;
}

/** Ended, really started rides, newest first. Rows without a start or end are dropped. */
export function mapRecentRides(rows: RecentRideRow[]): RecentRide[] {
  const rides: RecentRide[] = [];
  for (const r of rows) {
    if (!r.started_at || !r.ended_at) continue;
    const ms = Date.parse(r.ended_at) - Date.parse(r.started_at);
    rides.push({
      id: r.id,
      name: r.name,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      durationMs: Number.isFinite(ms) && ms >= 0 ? ms : null,
      riders: r.rider_count?.[0]?.count ?? null,
    });
  }
  return rides.sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "Sat 10 Oct" in the phone's local time, built by hand so it reads the same on every device. */
export function formatRideDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "86 km · 2 h 14 min · 6 riders": each part optional (home.recentMeta). */
export function recentMeta(ride: RecentRide, distanceM: number | null): string {
  const parts: string[] = [];
  if (distanceM !== null && distanceM >= 100) parts.push(formatDistance(distanceM));
  if (ride.durationMs !== null) parts.push(formatDuration(ride.durationMs));
  if (ride.riders !== null && ride.riders > 0) parts.push(plural(ride.riders, 'rider', 'riders'));
  return parts.join(' · ');
}

export function recentRowLabel(ride: RecentRide, meta: string): string {
  return fill(copy['home.a11yRecentRow'], {
    ride: ride.name,
    date: formatRideDate(ride.endedAt),
    meta,
  });
}

// ---------------------------------------------------------------- cached distance (13 §3)

/** `{ [rideId]: meters }` as stored under the `rideStats` key. */
export function parseRideStats(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(value)) if (typeof v === 'number' && v >= 0) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- stats strip (16 §3 P1)

export interface StatPart {
  text: string;
  /** Big (24 bold) or small unit (14 semibold). */
  unit: boolean;
}

export interface MonthStats {
  km: StatPart[];
  rides: StatPart[];
  saddle: StatPart[];
  a11y: string;
}

/** "214 km": number big, unit small. */
function kmParts(meters: number): StatPart[] {
  const km = meters / 1000;
  return [
    { text: km < 10 ? km.toFixed(1) : String(Math.round(km)), unit: false },
    { text: ' km', unit: true },
  ];
}

/** "7 h 40" / "40 min": whole minutes, hour part only from 60 min. */
export function saddleParts(ms: number): StatPart[] {
  const total = Math.max(0, Math.floor(ms / 60_000));
  if (total < 60) return [{ text: String(total), unit: false }, { text: ' min', unit: true }];
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [
    { text: String(h), unit: false },
    { text: ' h ', unit: true },
    { text: String(m).padStart(2, '0'), unit: false },
  ];
}

const partsText = (parts: StatPart[]) => parts.map((p) => p.text).join('').replace(/\s+/g, ' ').trim();

/**
 * This calendar month's totals from the cached recent rides (no new query). Null unless at least one
 * ride this month has a cached distance, so the strip never shows a misleading 0 km.
 */
export function monthStats(
  rides: RecentRide[],
  stats: Record<string, number>,
  now: number,
): MonthStats | null {
  const ref = new Date(now);
  const thisMonth = rides.filter((r) => {
    const d = new Date(r.endedAt);
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
  });
  const withDistance = thisMonth.filter((r) => stats[r.id] !== undefined);
  if (withDistance.length === 0) return null;
  const meters = withDistance.reduce((s, r) => s + (stats[r.id] ?? 0), 0);
  const ms = thisMonth.reduce((s, r) => s + (r.durationMs ?? 0), 0);
  const km = kmParts(meters);
  const rideParts: StatPart[] = [{ text: String(thisMonth.length), unit: false }];
  const saddle = saddleParts(ms);
  return {
    km,
    rides: rideParts,
    saddle,
    a11y: fill(copy['home.a11yStats'], {
      km: partsText(km),
      rides: plural(thisMonth.length, 'ride', 'rides'),
      time: partsText(saddle),
    }),
  };
}
