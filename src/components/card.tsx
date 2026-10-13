import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { elevate, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface CardProps {
  children: ReactNode;
  /**
   * default: raised surface. brand: `brandTint` fill, no border (resume card, summary hero).
   * notice: a 4 px left bar in `barColor` (nudge cards).
   */
  variant?: 'default' | 'brand' | 'notice';
  /** Colour of the notice bar. */
  barColor?: string;
  /** Inner padding; default `space.lg`. 0 for cards whose rows pad themselves. */
  padding?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * 14 §0.4. `surfaceRaised` on bg. Light: elevation e1 and no border; dark: the colour step only.
 * Radius 16, padding 16, gap 8.
 */
export function Card({
  children,
  variant = 'default',
  barColor,
  padding = space.lg,
  gap = space.sm,
  style,
}: CardProps) {
  const { colors, scheme } = useTheme();
  const brand = variant === 'brand';
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: brand ? colors.brandTint : colors.surfaceRaised,
          padding,
          gap,
        },
        brand ? null : elevate('e1', scheme),
        variant === 'notice' && barColor ? { borderLeftWidth: 4, borderLeftColor: barColor } : null,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // No overflow:hidden here: it would clip the iOS shadow. Children sit inside the radius by padding.
  card: { borderRadius: radius.lg },
});
