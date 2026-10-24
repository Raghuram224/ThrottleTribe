import { Pressable, StyleSheet, Text, type AccessibilityState } from 'react-native';

import { Icon } from '@/components/icon';
import { haptic } from '@/lib/haptics';
import type { IconName } from '@/lib/icon-names';
import { FAB_STACK } from '@/lib/plan-flow';
import { elevate, family } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface FabCircleProps {
  icon: IconName;
  /** The word under the icon: colour is never the only cue. */
  word: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  /** Glyph and word colour (default `fabIcon`). */
  tint?: string;
  /** A 2 dp ring in this colour (transparent when idle, so the circle never changes size); left out = no ring. */
  ring?: string;
  onPress: () => void;
}

/** One 56 dp floating circle with an icon and a word (28): Home's Search, and the ride view's Search, Speak and Message. */
export function FabCircle({ icon, word, accessibilityLabel, accessibilityHint, accessibilityState, tint, ring, onPress }: FabCircleProps) {
  const { colors, scheme } = useTheme();
  const fg = tint ?? colors.fabIcon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      onPress={() => {
        haptic('select');
        onPress();
      }}
      style={({ pressed }) => [
        styles.circle,
        { backgroundColor: pressed ? colors.surfacePressed : colors.fabBg },
        // Before the ring: in dark `elevate` is a hairline border, which would otherwise replace the 2 dp ring.
        elevate('e2', scheme),
        ring !== undefined && styles.ring,
        ring !== undefined && { borderColor: ring },
      ]}>
      <Icon name={icon} color={fg} size={24} />
      <Text allowFontScaling={false} numberOfLines={1} style={[styles.word, { color: fg }]}>
        {word}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: { width: FAB_STACK.size, height: FAB_STACK.size, borderRadius: FAB_STACK.size / 2, alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 2 },
  // Same word style as the hold button's round label.
  word: { fontSize: 11, lineHeight: 13, fontFamily: family.bold },
});
