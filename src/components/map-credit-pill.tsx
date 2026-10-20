import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated from 'react-native-reanimated';

import { copy } from '@/lib/copy';
import { family, font, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface MapCreditPillProps {
  /**
   * Every line, top to bottom (`pillLines` mapped through `copy`): the licence line, then the service whose data is drawn
   * (24 §4.2), then the terrain credit while it shows (25 §5.1). Text only. Left out = the licence line alone.
   */
  lines?: readonly string[];
  /** Positioning (and opacity) from the screen; the pill itself never takes touches. */
  style?: ComponentProps<typeof Reanimated.View>['style'];
  maxWidth?: number;
  /** Animated wrapper (Home lifts it with the sheet). */
  animated?: boolean;
}

/**
 * The licence credit every map must show: "© OpenMapTiles © OpenStreetMap" (24 §4.2), plus up to two lines naming the
 * service and the terrain data. Text, never a link (a gloved tap must not open a browser while riding); links live at rest, in the credit row
 * and the Credits sheet. One accessibility element. Lines shrink to 85% before they would be cut off.
 */
export function MapCreditPill({ lines = LICENCE_ONLY, style, maxWidth, animated }: MapCreditPillProps) {
  const { colors } = useTheme();
  // Plain View unless Home animates it; both take the same props here.
  const Wrapper = (animated ? Reanimated.View : View) as typeof Reanimated.View;
  // The spoken first line is the long form of the licence; each extra line follows as its own sentence.
  const label = [copy['map.creditA11y'], ...lines.slice(1).map((l) => `${l}.`)].join(' ');
  const line = (text: string) => (
    <Text
      key={text}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.85}
      maxFontSizeMultiplier={1.3}
      style={[styles.text, { color: colors.text }]}>
      {text}
    </Text>
  );
  return (
    <Wrapper
      pointerEvents="none"
      accessible
      accessibilityLabel={label}
      style={[styles.pill, { backgroundColor: colors.surfaceRaised, maxWidth }, style]}>
      {lines.map((text) => line(text))}
    </Wrapper>
  );
}

const LICENCE_ONLY: readonly string[] = [copy['live.attribution']];

const styles = StyleSheet.create({
  // Bottom-left like the old inline pill; `style` moves it (Home animates `bottom`).
  pill: {
    position: 'absolute',
    left: space.sm,
    bottom: space.sm,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    opacity: 0.85,
  },
  text: { fontSize: font.xs, lineHeight: 16, fontFamily: family.regular },
});
