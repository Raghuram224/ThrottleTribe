import { t } from '@/lib/copy';
import type { RelativePosition } from '@/lib/geo';

/**
 * Short, glanceable duration for status chips and rider rows,
 * e.g. "Stopped · 6 min" or "No signal · 1 min".
 * Read in a one-second glance on a moving bike, so fewer characters win.
 */
export function formatDuration(ms: number): string {
  if (Number.isNaN(ms) || ms < 60_000) return '<1 min';
  // Floor, never round: we must not overstate how long someone has been stopped.
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min === 0 ? `${hours} h` : `${hours} h ${min} min`;
}

/**
 * Distance for rows and alerts (06): under 1 km to the nearest 50 m ("350 m"), 1 to 9.9 km with one
 * decimal ("4.2 km"), from 10 km whole ("12 km"). Never more than 4 characters of number.
 */
export function formatDistance(meters: number): string {
  const m = Math.max(0, meters);
  if (m < 1000) {
    const nearest50 = Math.round(m / 50) * 50;
    if (nearest50 < 1000) return `${nearest50} m`;
  }
  const km = m / 1000;
  if (km < 9.95) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** The 06 line-1 phrase: "4.2 km behind", "With you", "3.1 km away". */
export function distancePhrase(rel: RelativePosition): string {
  if (rel.kind === 'level') return t('live.level');
  const km = formatDistance(rel.distanceM);
  if (rel.kind === 'ahead') return t('live.ahead', { km });
  if (rel.kind === 'behind') return t('live.behind', { km });
  return t('live.away', { km });
}

/**
 * Ride clock for the header: "Just started" under a minute, "5 min" under an hour,
 * "1 h 24 min" after, "2 h" on the hour (units always shown so "6 h 53" never reads as a clock), "1 d 2 h" from 24 h.
 */
export function formatElapsed(ms: number): string {
  const totalMin = Math.max(0, Math.floor((Number.isNaN(ms) ? 0 : ms) / 60_000));
  if (totalMin < 1) return t('live.elapsedJustStarted');
  if (totalMin < 60) return t('live.elapsedMin', { n: totalMin });
  const totalH = Math.floor(totalMin / 60);
  if (totalH >= 24) return t('live.elapsedDh', { d: Math.floor(totalH / 24), h: totalH % 24 });
  const mm = totalMin % 60;
  return mm === 0 ? t('live.elapsedH', { h: totalH }) : t('live.elapsedHm', { h: totalH, mm });
}

/** Local clock time for "Arrive about 11:42": the device's own 12 / 24 hour style. */
export function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
