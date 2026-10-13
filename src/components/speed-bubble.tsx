import { StyleSheet, Text, View } from 'react-native';

import { copy, t } from '@/lib/copy';
import { elevate, family, font, fontNumeric } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export const SPEED_BUBBLE = 56;

/** 56 dp circle on the map: km/h big, unit small (19 §C). The caller hides it when the speed is unknown. */
export function SpeedBubble({ kmh }: { kmh: number }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('live.speedA11y', { kmh })}
      style={[styles.bubble, { backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
      <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[fontNumeric, styles.value, { color: colors.text }]}>
        {kmh}
      </Text>
      <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.unit, { color: colors.textMuted }]}>
        {copy['live.speedUnit']}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    width: SPEED_BUBBLE,
    height: SPEED_BUBBLE,
    borderRadius: SPEED_BUBBLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: font.lg, lineHeight: 22, fontFamily: family.bold },
  unit: { fontSize: 10, lineHeight: 12, fontFamily: family.semibold },
});
