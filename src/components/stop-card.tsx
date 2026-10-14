import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { copy, t } from '@/lib/copy';
import { STOP_CARD_H } from '@/lib/live-sheet';
import { stopCardA11y, type StopCardParts } from '@/lib/nav-route';
import { family, font, fontNumeric, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** 40 dp tile at x 16; the hairline divider starts after it (inset 68), like the rider rows. */
export const INFO_TILE = 40;
export const INFO_DIVIDER_INSET = space.lg + INFO_TILE + space.md;

interface StopCardProps {
  parts: StopCardParts;
  /** Muted second line when the stop came from a proposal. */
  suggestedBy: string | null;
  /** Tap = frame me + the stop. */
  onPress: () => void;
}

/**
 * Next-stop card (20 C5): a 64 dp info row at the top of the live sheet, in every snap. The number is
 * the fact: distance and ETA at 20 semibold, the place name below it. Removing the stop lives in the
 * leader's menu, not here.
 */
export function StopCard({ parts, suggestedBy, onPress }: StopCardProps) {
  const { colors } = useTheme();
  const { arrived, distance, eta, name } = parts;
  const noFix = !arrived && distance === null;
  const sub = noFix
    ? copy['stop.noFix']
    : suggestedBy
      ? t('stop.cardSubSuggested', { name, by: suggestedBy })
      : name;
  const glyph = arrived ? 'checkCircle' : parts.kind === 'destination' ? 'endRide' : 'coffee';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={stopCardA11y(parts, suggestedBy)}
      onPress={onPress}
      style={styles.row}>
      <View style={[styles.tile, { backgroundColor: colors.navRoute }]}>
        <Icon name={glyph} color={colors.onNavRoute} size={20} />
      </View>
      <View style={styles.texts}>
        {arrived ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.line, { color: colors.text }]}>
            {copy['stop.arrived']}
          </Text>
        ) : noFix ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.name, { color: colors.text }]}>
            {name}
          </Text>
        ) : (
          // Two spans: the ETA shrinks and truncates before the distance ever does.
          <View style={styles.lineRow}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.line, styles.keep, { color: colors.text }]}>
              {distance}
            </Text>
            {eta ? (
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.line, styles.shrink, { color: colors.text }]}>
                {` · ${eta}`}
              </Text>
            ) : null}
          </View>
        )}
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.sub, { color: colors.textMuted }]}>
          {sub}
        </Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
    </Pressable>
  );
}

/** Full-map variant (19 B): one compact line, centred under the status bar. Text has no glyph. */
export function StopChip({ line, arrived, onPress }: { line: string; arrived: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={line}
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
  row: {
    height: STOP_CARD_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  tile: { width: INFO_TILE, height: INFO_TILE, borderRadius: INFO_TILE / 2, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, justifyContent: 'center' },
  lineRow: { flexDirection: 'row', alignItems: 'center' },
  line: { ...fontNumeric, fontSize: font.lg, lineHeight: 26, fontFamily: family.semibold },
  keep: { flexShrink: 0 },
  shrink: { flexShrink: 1 },
  name: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  sub: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  divider: { position: 'absolute', left: INFO_DIVIDER_INSET, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
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
