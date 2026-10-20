import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { copy, fill } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { family, font, radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export interface CreditLink {
  /** Visible text. */
  label: string;
  url: string;
  /** Site for the screen-reader label, e.g. "geoapify.com". */
  site: string;
}

interface CreditRowProps {
  links: CreditLink[];
  /** Typing is locked (moving): plain text, no link role, no icon, not focusable (24 §4.3). */
  inert?: boolean;
}

/**
 * Credit links at rest (24 §4.3): up to two, each at least 56 x 56, label 12 `brandOnBg` + an open-in-new icon.
 * Wraps at large text, never truncates. Pinned footers put a hairline above it.
 */
export function CreditRow({ links, inert }: CreditRowProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {links.map((l) =>
        inert ? (
          <Text key={l.url} maxFontSizeMultiplier={1.3} style={[styles.label, { color: colors.textMuted }]}>
            {l.label}
          </Text>
        ) : (
          <Pressable
            key={l.url}
            accessibilityRole="link"
            accessibilityLabel={fill(copy['credit.linkA11y'], { name: l.label, site: l.site })}
            onPress={() => {
              haptic('select');
              void Linking.openURL(l.url);
            }}
            style={({ pressed }) => [styles.link, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.label, { color: colors.brandOnBg }]}>
              {l.label}
            </Text>
            <Icon name="openInNew" color={colors.brandOnBg} size={14} />
          </Pressable>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: space.lg, minHeight: touchTarget },
  link: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.md,
  },
  label: { fontSize: font.xs, lineHeight: 16, fontFamily: family.regular },
});
