// Fix-time vs ingest-time latency (docs/design/21 §4.5.8 gate measurement): how long after a fix was taken does the
// engine get it? Locked-screen prompts are only on time if this stays small. Pure; only counts and milliseconds, no
// coordinates (the telemetry privacy rule).

/** One event per window, so the queue is not flooded at 1 Hz. */
export const LATENCY_WINDOW_MS = 60_000;

export interface LatencyWindow {
  since: number;
  n: number;
  sumMs: number;
  maxMs: number;
  /** The most fixes delivered in one call (a batch: the OS held fixes back). */
  maxBatch: number;
}

export const newLatencyWindow = (now: number): LatencyWindow => ({ since: now, n: 0, sumMs: 0, maxMs: 0, maxBatch: 0 });

/** Adds one task call: `fixTimes` are the fixes' timestamps, `now` is when the engine received them. */
export function addLatencies(w: LatencyWindow, fixTimes: readonly number[], now: number): LatencyWindow {
  const ages = fixTimes.map((t) => Math.max(0, now - t)).filter(Number.isFinite);
  if (ages.length === 0) return w;
  return {
    ...w,
    n: w.n + ages.length,
    sumMs: w.sumMs + ages.reduce((a, b) => a + b, 0),
    maxMs: Math.max(w.maxMs, ...ages),
    maxBatch: Math.max(w.maxBatch, fixTimes.length),
  };
}

export const latencyDue = (w: LatencyWindow, now: number): boolean => w.n > 0 && now - w.since >= LATENCY_WINDOW_MS;

export function latencySummary(w: LatencyWindow): { n: number; avg_ms: number; max_ms: number; max_batch: number } {
  return { n: w.n, avg_ms: w.n ? Math.round(w.sumMs / w.n) : 0, max_ms: Math.round(w.maxMs), max_batch: w.maxBatch };
}
