import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { haptic } from '@/lib/haptics';
import { elevate, family, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface ActionCardProps {
  icon: IconName;
  title: string;
  sub?: string;
  onPress: () => void;
  /** 2 px brand border: points the rider to this option (e.g. when the other one is unavailable). */
  highlight?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** 72 tall tappable card: icon tile, title, sub line, chevron (docs/design/13 §0.4). */
export function ActionCard({
  icon,
  title,
  sub,
  onPress,
  highlight,
  disabled,
  accessibilityLabel,
}: ActionCardProps) {
  const { colors, scheme } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (sub ? `${title}. ${sub}` : title)}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptic('select');
        onPress();
      }}
      style={(pressed) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.surfacePressed : colors.surfaceRaised,
          // No border: elevation e1 in light, colour step in dark. Only a highlight is outlined.
          borderColor: colors.brand.primary,
          borderWidth: highlight ? 2 : 0,
          opacity: disabled ? 0.5 : 1,
        },
        elevate('e1', scheme),
      ]}>
      <View style={[styles.tile, { backgroundColor: colors.brandTint }]}>
        <Icon name={icon} color={colors.brandOnBg} size={22} />
      </View>
      <View style={styles.texts}>
        <AppText variant="heading" style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {title}
        </AppText>
        {sub ? (
          <AppText variant="caption" muted numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {sub}
          </AppText>
        ) : null}
      </View>
      <Icon name="chevronRight" color={colors.textMuted} size={20} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: size.actionCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 2 },
  title: { fontFamily: family.semibold },
});
