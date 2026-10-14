import { useEffect, useState } from 'react';

import { typingLocked } from '@/lib/typing-lock';

/** How often the lock is re-evaluated, so it also releases when the fixes stop coming (21 §2.2.2). */
const RECHECK_MS = 2000;

/**
 * True while the rider is moving (>= 10 km/h; unlocks under 5). `speedMps` and `fixAtMs` (ms since epoch
 * of that fix) come from the screen's own position source. An old or missing fix never locks.
 */
export function useTypingLock(speedMps: number | null, fixAtMs: number | null): boolean {
  return useTypingLockJudged(speedMps, fixAtMs).locked;
}

/**
 * `useTypingLock`, plus `judgedAt`: the `fixAtMs` the lock was last evaluated for. It changes in the same render
 * as `locked`, so a screen can tell "this fix has been judged" from "the lock is still the one for the old fix".
 */
export function useTypingLockJudged(speedMps: number | null, fixAtMs: number | null): { locked: boolean; judgedAt: number | null } {
  const [state, setState] = useState<{ locked: boolean; judgedAt: number | null }>({ locked: false, judgedAt: null });
  useEffect(() => {
    const kmh = speedMps == null ? null : speedMps * 3.6;
    const tick = () => {
      const age = fixAtMs == null ? Number.POSITIVE_INFINITY : Date.now() - fixAtMs;
      setState((prev) => {
        const locked = typingLocked(prev.locked, kmh, age);
        return locked === prev.locked && prev.judgedAt === fixAtMs ? prev : { locked, judgedAt: fixAtMs };
      });
    };
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, RECHECK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [speedMps, fixAtMs]);
  return state;
}

/** Longest Where to? waits for a live fix before focusing anyway (a still rider, a slow first fix). */
const SETTLE_MS = 1500;

/** True once `live` or, with location on, after SETTLE_MS: whichever first. */
export function useSettleTimeout(waiting: boolean): boolean {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const id = setTimeout(() => setTimedOut(true), SETTLE_MS);
    return () => clearTimeout(id);
  }, [waiting]);
  return timedOut;
}
