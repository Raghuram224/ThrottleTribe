// Rate-limit rules for route requests (docs/design/24 §3.3). Pure: the navigation session, the preview and the Home
// route panel all turn a `rate_limited` answer into "when may I ask again, and does it count as a failure".

export type RateScope = 'second' | 'minute' | 'day' | 'user';

/** A daily (quota) limit pauses all route requests for this long, then one probe goes out. */
export const ROUTING_DAY_PAUSE_MS = 30 * 60_000;
/** `retryAfterS` is honoured up to this (minute and user limits). */
export const MAX_RETRY_AFTER_S = 60;
/** A per-second limit is retried once, after this. */
export const SECOND_RETRY_MS = 1000;

export interface RateLimitPlan {
  /** Epoch ms: no route request before this. */
  notBefore: number;
  /** Counts toward the 10 / 20 / 40 / 60 s backoff (`failures += 1`). */
  countsAsFailure: boolean;
  /** This was the one automatic retry a per-second limit gets; remember it so a second hit counts as a failure. */
  usedSecondRetry: boolean;
  /** Set for a daily limit: every caller reads it (nav-route memo) and sends nothing until then. */
  pauseUntil: number | null;
}

/**
 * - `second`: one automatic retry after 1 s, not a failure; a second `second` limit in a row is a failure.
 * - `minute` / `user`: wait `retryAfterS` (at most 60), counts as a failure.
 * - `day`: pause up to 30 minutes, counts as a failure.
 */
export function planRateLimit(scope: RateScope, retryAfterS: number, now: number, secondRetried: boolean): RateLimitPlan {
  if (scope === 'day') {
    // The server's day answer is hours long; the pause is capped at 30 min (then one probe). A shorter remainder
    // (nav-route answering from its own memo) is kept.
    const pauseMs = Number.isFinite(retryAfterS) && retryAfterS > 0 ? Math.min(ROUTING_DAY_PAUSE_MS, retryAfterS * 1000) : ROUTING_DAY_PAUSE_MS;
    const pauseUntil = now + pauseMs;
    return { notBefore: pauseUntil, countsAsFailure: true, usedSecondRetry: false, pauseUntil };
  }
  if (scope === 'second' && !secondRetried) {
    return { notBefore: now + SECOND_RETRY_MS, countsAsFailure: false, usedSecondRetry: true, pauseUntil: null };
  }
  const waitS = scope === 'second' ? 1 : clampRetryAfterS(retryAfterS);
  return { notBefore: now + waitS * 1000, countsAsFailure: true, usedSecondRetry: false, pauseUntil: null };
}

/** `retryAfterS` from the server, forced into 1..60 (a missing or silly value waits the full minute). */
export function clampRetryAfterS(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return MAX_RETRY_AFTER_S;
  return Math.min(MAX_RETRY_AFTER_S, Math.max(1, Math.ceil(v)));
}

/** Seconds left of a pause, for the `retryAfterS` of an answer made without a request; 0 when it is over. */
export function pauseRemainingS(pausedUntil: number | null, now: number): number {
  return pausedUntil !== null && now < pausedUntil ? Math.ceil((pausedUntil - now) / 1000) : 0;
}

/**
 * The earliest time the next route request may go, combining the 21 §3.8 backoff gap with a server `retryAfter`
 * (spec 24 §3.3: `notBefore = lastFetchAt + max(backoff, retryAfterS)`; here the retry is already an absolute time).
 */
export function nextRouteAt(lastFetchAt: number, backoffGapMs: number, retryNotBefore: number): number {
  return Math.max(lastFetchAt + backoffGapMs, retryNotBefore);
}
