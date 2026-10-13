// Pure helpers for the web/PWA build. No browser globals at import time, so they are unit-tested.
import type { SampleRow } from '@/lib/location/sample-queue';

/** A page hidden for longer than this earns the "sharing paused" banner when it returns. */
export const RESUME_THRESHOLD_MS = 30_000;
/** Minimum gap between uploaded samples (native uses a 5 s time interval). */
export const WEB_SAMPLE_MIN_GAP_MS = 4000;

/** "Sharing paused for 4 min while this page was hidden" (14 §9). */
export function pausedText(hiddenMs: number): string {
  const secs = Math.max(1, Math.round(hiddenMs / 1000));
  const span = secs < 60 ? `${secs} sec` : `${Math.round(secs / 60)} min`;
  return `Sharing paused for ${span} while this page was hidden`;
}

export function shouldShowResume(hiddenMs: number | null): boolean {
  return hiddenMs !== null && hiddenMs > RESUME_THRESHOLD_MS;
}

/**
 * `sms:` link for the OS composer. `?&body=` is the form both iOS and Android accept; several
 * recipients are comma separated.
 */
export function smsUrl(numbers: readonly string[], body: string): string {
  const to = numbers.map((n) => n.replace(/[^\d+]/g, '')).filter(Boolean).join(',');
  return `sms:${to}?&body=${encodeURIComponent(body)}`;
}

export function isIosUserAgent(ua: string, maxTouchPoints = 0): boolean {
  // iPadOS 13+ reports as a Mac with touch points.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
}

/** Subset of GeolocationPosition used here (lets tests pass plain objects). */
export interface WebPosition {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
  };
}

function finiteOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Browser position -> upload row. Speed and heading are null when the browser does not know them. */
export function positionToRow(
  rideId: string,
  pos: WebPosition,
  appState: SampleRow['app_state'],
  battery: number | null,
): SampleRow {
  return {
    ride_id: rideId,
    recorded_at: new Date(pos.timestamp).toISOString(),
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy_m: finiteOrNull(pos.coords.accuracy),
    speed_mps: finiteOrNull(pos.coords.speed),
    heading: finiteOrNull(pos.coords.heading),
    app_state: appState,
    battery,
  };
}

/** True when enough time has passed since the last uploaded sample. */
export function sampleDue(lastAt: number, now: number, minGap = WEB_SAMPLE_MIN_GAP_MS): boolean {
  return now - lastAt >= minGap;
}
