import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { copy, t } from '@/lib/copy';
import { STOP_CARD_H } from '@/lib/live-sheet';
import { family, font, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface StopCardProps {
  /** stopCardText().text, e.g. "☕ Cafe · 3.4 km · 9 min". */
  line: string;
  arrived: boolean;
  /** Muted second line when the stop came from a proposal. */
  suggestedBy: string | null;
  /** Tap = frame me + the stop. */
  onPress: () => void;
  /** Leader only: the clear button. */
  onClear?: () => void;
}

/** Next-stop card (19 A): a 56 dp row at the top of the live sheet, shown in every snap. */
export function StopCard({ line, arrived, suggestedBy, onPress, onClear }: StopCardProps) {
  const { colors } = useTheme();
  const suggested = suggestedBy ? t('stop.suggestedBy', { name: suggestedBy }) : null;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('stop.a11yCard', { line: suggested ? `${line}. ${suggested}` : line })}
        onPress={onPress}
        style={styles.press}>
        {arrived ? <Icon name="checkCircle" color={colors.brandOnBg} size={20} /> : null}
        <View style={styles.texts}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.line, { color: colors.text }]}>
            {line}
          </Text>
          {suggested ? (
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.sub, { color: colors.textMuted }]}>
              {suggested}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {onClear ? (
        <Pressable accessibilityRole="button" accessibilityLabel={copy['stop.a11yClear']} onPress={onClear} style={styles.clear}>
          <Icon name="close" color={colors.textMuted} size={24} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Full-map variant (19 B): one compact line, centred under the status bar. */
export function StopChip({ line, arrived, onPress }: Pick<StopCardProps, 'line' | 'arrived' | 'onPress'>) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('stop.a11yCard', { line })}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      {arrived ? <Icon name="checkCircle" color={colors.brandOnBg} size={18} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: colors.text }]}>
        {line}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { height: STOP_CARD_H, flexDirection: 'row', alignItems: 'center' },
  press: { flex: 1, height: STOP_CARD_H, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.lg },
  texts: { flex: 1, justifyContent: 'center' },
  line: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  sub: { fontSize: font.sm, lineHeight: 18, fontFamily: family.regular },
  clear: { width: STOP_CARD_H, height: STOP_CARD_H, alignItems: 'center', justifyContent: 'center' },
  chip: {
    alignSelf: 'center',
    maxWidth: '100%',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { flexShrink: 1, fontSize: font.sm, fontFamily: family.semibold },
});
