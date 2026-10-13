export type RiderStatus = 'moving' | 'stopped' | 'offline' | 'sos';

export interface RiderStatusResult {
  status: RiderStatus;
  /** How long the rider has been in this state; null when unknown. */
  sinceMs: number | null;
}

/** Below this speed a sample counts as slow. */
export const STOP_SPEED_KMH = 3;
/** How long speed must stay low before a rider counts as stopped. */
export const STOP_MIN_DURATION_MS = 3 * 60_000;
/** No sample for this long means the rider is offline. */
export const OFFLINE_AFTER_MS = 60_000;

export interface RiderStatusInput {
  sos: boolean;
  sosAt: string | null;
  position: { updatedAt: string; slowSince: string | null } | null;
  stopThresholdS: number;
}

function since(now: number, iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, now - t);
}

/**
 * Pure status derivation, evaluated against `now` (ms epoch). Rule order matters:
 * SOS beats offline. No data is not the same as stopped: missing samples only ever mean offline.
 */
export function deriveRiderStatus(input: RiderStatusInput, now: number): RiderStatusResult {
  if (input.sos) return { status: 'sos', sinceMs: since(now, input.sosAt) };

  const { position } = input;
  if (!position) return { status: 'offline', sinceMs: null };
  const updatedAgo = since(now, position.updatedAt);
  if (updatedAgo === null) return { status: 'offline', sinceMs: null };
  if (updatedAgo > OFFLINE_AFTER_MS) return { status: 'offline', sinceMs: updatedAgo };

  const slowFor = since(now, position.slowSince);
  if (slowFor !== null && slowFor >= input.stopThresholdS * 1000) {
    return { status: 'stopped', sinceMs: slowFor };
  }
  return { status: 'moving', sinceMs: null };
}
