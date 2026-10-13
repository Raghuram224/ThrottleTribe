import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { haptic } from '@/lib/haptics';
import { family, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface SettingsRowProps {
  icon: IconName;
  title: string;
  /** Right-aligned muted value, e.g. "2 of 5". */
  value?: string;
  /** Amber dot before the value: "needs attention". The value text still says what is wrong. */
  attention?: boolean;
  onPress: () => void;
  /** No divider under the last row of a group. */
  last?: boolean;
  accessibilityLabel?: string;
}

/** 64 tall: icon 24, title 16/600, value 14 muted, chevron. Divider inset 56 (13 §0.4). */
export const SettingsRow = memo(function SettingsRow({
  icon,
  title,
  value,
  attention,
  onPress,
  last,
  accessibilityLabel,
}: SettingsRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (value ? `${title}, ${value}` : title)}
      onPress={() => {
        haptic('select');
        onPress();
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
      <Icon name={icon} color={colors.text} size={24} />
      <AppText style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {title}
      </AppText>
      {attention ? <View style={[styles.dot, { backgroundColor: colors.status.stopped }]} /> : null}
      {value ? (
        <AppText variant="caption" muted numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {value}
        </AppText>
      ) : null}
      <Icon name="chevronRight" color={colors.textMuted} size={20} />
      {last ? null : <View style={[styles.divider, { backgroundColor: colors.border }]} />}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: size.settingsRow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  title: { flex: 1, fontFamily: family.semibold },
  dot: { width: 10, height: 10, borderRadius: 5 },
  // Inset 56 (13 §0.4): lines up with the title text.
  divider: { position: 'absolute', left: space.lg + 24 + space.lg, right: 0, bottom: 0, height: 1 },
});
