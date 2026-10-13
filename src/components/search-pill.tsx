import { Pressable, StyleSheet, Text } from 'react-native';

import { Icon } from '@/components/icon';
import { copy } from '@/lib/copy';
import { elevate, family, font, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const PILL_H = 48;

/** "Search stops along the way": 48 dp pill floating under the convoy strip (19 A). */
export function SearchPill({ onPress, hintNoStop = false }: { onPress: () => void; hintNoStop?: boolean }) {
  // Leader with no stop: nothing is ahead yet, so say how to get a route.
  const label = copy[hintNoStop ? 'search.pillNoStop' : 'search.pill'];
  const { colors, scheme } = useTheme();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
      <Icon name="search" color={colors.textMuted} size={22} />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.text, { color: colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: PILL_H,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  text: { flex: 1, fontSize: font.md, fontFamily: family.regular },
});
