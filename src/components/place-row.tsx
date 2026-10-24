import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { t } from '@/lib/copy';
import { formatDistance } from '@/lib/format';
import { distinctAddress, placeRowA11y, type PlaceCategory } from '@/lib/place-search';
import { categoryIcon } from '@/lib/stop-ui';
import { family, font, fontNumeric, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface PlaceRowProps {
  name: string;
  address: string;
  distanceM: number | null;
  /** Category glyph tile; ignored when `leading` is given. */
  category?: PlaceCategory;
  /** Replaces the tile content (the Recent rows draw a history icon). */
  leading?: ReactNode;
  /** Reads "Recent place, ...": for recent rows that have no section label above them (the home sheet's peek). */
  recentLabel?: boolean;
  /** The hairline under the row; false for the last row of a list (26 H2). Default true. */
  divider?: boolean;
  onPress: () => void;
}

/** 64 dp row: 40 tile, name 16 semibold, address 14 muted, distance 14 semibold (tabular). */
export function PlaceRow({ name, address: rawAddress, distanceM, category = 'other', leading, recentLabel, divider = true, onPress }: PlaceRowProps) {
  const { colors } = useTheme();
  // A second line that only repeats the name (any spelling) is not shown (26 H1).
  const address = distinctAddress(name, rawAddress);
  const distance = distanceM != null ? formatDistance(distanceM) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recentLabel ? t('homeMap.recentA11y', { row: placeRowA11y(name, rawAddress, distanceM) }) : placeRowA11y(name, rawAddress, distanceM)}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfacePressed : 'transparent', borderBottomColor: colors.border, borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0 }]}>
      <View style={[styles.glyphBox, { backgroundColor: colors.surface }]}>
        {leading ?? <Icon name={categoryIcon(category)} color={colors.text} size={20} />}
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.name, { color: colors.text }]}>
          {name}
        </Text>
        {address ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.address, { color: colors.textMuted }]}>
            {address}
          </Text>
        ) : null}
      </View>
      {distance ? (
        <Text maxFontSizeMultiplier={1.3} style={[styles.distance, { color: colors.text }]}>
          {distance}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  glyphBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  name: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  address: { fontSize: font.sm, lineHeight: 18, fontFamily: family.regular },
  distance: { ...fontNumeric, fontSize: font.sm, fontFamily: family.semibold },
});
