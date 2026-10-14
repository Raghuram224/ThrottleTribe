import { useEffect, useState } from 'react';

import { typingLocked } from '@/lib/typing-lock';

/** How often the lock is re-evaluated, so it also releases when the fixes stop coming (21 §2.2.2). */
const RECHECK_MS = 2000;

/**
 * True while the rider is moving (>= 10 km/h; unlocks under 5). `speedMps` and `fixAtMs` (ms since epoch
 * of that fix) come from the screen's own position source. An old or missing fix never locks.
 */
export function useTypingLock(speedMps: number | null, fixAtMs: number | null): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const kmh = speedMps == null ? null : speedMps * 3.6;
    const tick = () => {
      const age = fixAtMs == null ? Number.POSITIVE_INFINITY : Date.now() - fixAtMs;
      setLocked((prev) => typingLocked(prev, kmh, age));
    };
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, RECHECK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [speedMps, fixAtMs]);
  return locked;
}
