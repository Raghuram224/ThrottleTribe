import { useEffect, useState } from 'react';
import { Animated, Easing, type DimensionValue } from 'react-native';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const PULSE_MS = 1200;
const STATIC_OPACITY = 0.7;

/** `surface` block, opacity pulse 0.5 to 1 over 1.2 s; static at 0.7 when Reduce Motion is on (13 §0.4). */
export function Skeleton({ height, width = '100%' }: { height: number; width?: DimensionValue }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(STATIC_OPACITY));

  useEffect(() => {
    if (reduce) {
      opacity.setValue(STATIC_OPACITY);
      return;
    }
    opacity.setValue(0.5);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: PULSE_MS / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: PULSE_MS / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, opacity]);

  return (
    <Animated.View
      accessible={false}
      style={{ height, width, borderRadius: radius.md, backgroundColor: colors.surface, opacity }}
    />
  );
}
