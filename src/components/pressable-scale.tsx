import { useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { motion } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Static style, or a function of the pressed state (for the pressed colour). */
  style?: StyleProp<ViewStyle> | ((pressed: boolean) => StyleProp<ViewStyle>);
  children?: ReactNode | ((pressed: boolean) => ReactNode);
  /** Scale while pressed; default 0.97 (16 §5). */
  scaleTo?: number;
}

/**
 * The one press feedback (16 §5): scale to 0.97 in 90 ms, back in 160 ms, plus the caller's pressed
 * colour. With Reduce Motion on only the colour changes. Runs on the UI thread.
 */
export function PressableScale({ style, children, scaleTo = 0.97, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const reduce = useReduceMotion();
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        if (!reduce) {
          scale.set(
            withTiming(scaleTo, {
              duration: motion.press,
              easing: Easing.out(Easing.cubic),
              reduceMotion: ReduceMotion.System,
            }),
          );
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        scale.set(
          withTiming(1, {
            duration: motion.release,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          }),
        );
        onPressOut?.(e);
      }}
      style={[typeof style === 'function' ? style(pressed) : style, animated]}>
      {typeof children === 'function' ? children(pressed) : children}
    </AnimatedPressable>
  );
}
