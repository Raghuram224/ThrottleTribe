// Pure reconnect policy for the ride's Realtime channel. After an offline spell the socket can stay
// closed or hold a stale JWT, so a channel that fails or closes is removed and recreated with
// backoff instead of waiting forever. No React, no supabase import.

export const CHANNEL_BACKOFF_MS = [2000, 4000, 8000, 16000, 30000] as const;

export type RealtimeStatus = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT';

export interface ChannelStep {
  /** `recreate`: remove the channel and build a new one after `delayMs`. */
  action: 'none' | 'recreate';
  delayMs: number;
  /** Attempt counter to carry into the next call. */
  attempt: number;
}

/**
 * `attempt` = failures since the last SUBSCRIBED. `intentional` = we closed it ourselves (leaving the
 * ride, or replacing it), which must never recreate.
 */
export function nextChannelStep(status: RealtimeStatus, attempt: number, intentional: boolean): ChannelStep {
  if (status === 'SUBSCRIBED') return { action: 'none', delayMs: 0, attempt: 0 };
  if (intentional) return { action: 'none', delayMs: 0, attempt };
  const delayMs = CHANNEL_BACKOFF_MS[Math.min(attempt, CHANNEL_BACKOFF_MS.length - 1)];
  return { action: 'recreate', delayMs, attempt: attempt + 1 };
}

/** Connectivity came back (or the token was refreshed) while the channel is not up: retry now, restart backoff. */
export function immediateRetry(subscribed: boolean): ChannelStep {
  return subscribed ? { action: 'none', delayMs: 0, attempt: 0 } : { action: 'recreate', delayMs: 0, attempt: 0 };
}
