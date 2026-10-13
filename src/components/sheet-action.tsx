import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { haptic } from '@/lib/haptics';
import { space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface SheetActionProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Destructive: label and icon in the SOS-on-bg red. */
  destructive?: boolean;
  /** No divider under the last row. */
  last?: boolean;
}

/** Sheet action row (14 §1): 56 tall, icon 24 + 16 semibold label, left aligned, inset divider. */
export function SheetAction({ icon, label, onPress, destructive, last }: SheetActionProps) {
  const { colors } = useTheme();
  const fg = destructive ? colors.sosOnBg : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic('select');
        onPress();
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
      <Icon name={icon} color={fg} size={24} />
      <AppText variant="bodyStrong" style={{ color: fg }} numberOfLines={1}>
        {label}
      </AppText>
      {last ? null : <View style={[styles.divider, { backgroundColor: colors.border }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.sm },
  // Inset to the label edge: 8 padding + 24 icon + 16 gap.
  divider: { position: 'absolute', left: space.sm + 24 + space.lg, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
