import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { motion, space } from '@/theme/tokens';

interface EnterProps {
  children: ReactNode;
  /** Delay before the entrance starts, in ms (`index * motion.stagger` for lists). */
  delay?: number;
  /** Duration in ms; default `motion.slow`. */
  duration?: number;
  /** Slide up from 8 dp while fading in (rows). Hero blocks only fade. */
  slide?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Decorative entrance (13 §0.2): fade, optionally slide up 8 dp, Easing.out(cubic). Off entirely
 * when Reduce Motion is on: content is simply there.
 */
export function Enter({ children, delay = 0, duration = motion.slow, slide, style }: EnterProps) {
  const reduce = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduce) return;
    progress.setValue(0);
    const run = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [reduce, progress, delay, duration]);

  if (reduce) return <Animated.View style={style}>{children}</Animated.View>;
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: slide
            ? [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [space.sm, 0] }) }]
            : undefined,
        },
      ]}>
      {children}
    </Animated.View>
  );
}
