import { useCallback, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

import { motion } from '@/theme/tokens';

// One shared subscription to the OS "Reduce Motion" / "Remove animations" setting (13 §0.2).
let reduce = false;
let started = false;
const listeners = new Set<() => void>();

function set(value: boolean) {
  if (value === reduce) return;
  reduce = value;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then(set)
    .catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when the rider asked the OS to reduce motion. Decorative animation must then be off. */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => reduce,
    () => false,
  );
}

/**
 * Motion helper: `duration(ms)` is `ms` normally and 0 for decorative motion when reduced.
 * Functional motion (HoldButton ring, spinners) must not use it.
 */
export function useMotion() {
  const reduced = useReduceMotion();
  const duration = useCallback((ms: number) => (reduced ? 0 : ms), [reduced]);
  return { reduce: reduced, duration, durations: motion } as const;
}
