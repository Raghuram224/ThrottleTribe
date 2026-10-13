import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';

import { motion } from '@/theme/tokens';

/**
 * Linear time progress 0..1 of the summary count-up (13 §9). The ease-out is applied by
 * `countUpDistanceText`. `active` starts it (data ready); `reduce` jumps straight to 1.
 */
export function useCountUp(active: boolean, reduce: boolean, durationMs: number = motion.countUp): number {
  const [anim] = useState(() => new Animated.Value(0));
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active || reduce) return;
    const id = anim.addListener(({ value }) => setProgress(value));
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: durationMs, easing: Easing.linear, useNativeDriver: false }).start();
    return () => {
      anim.stopAnimation();
      anim.removeListener(id);
    };
  }, [active, reduce, durationMs, anim]);

  if (!active) return 0;
  return reduce ? 1 : progress;
}
