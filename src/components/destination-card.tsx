import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { stopKindFor } from '@/lib/solo-nav';
import type { PlaceCategory } from '@/lib/place-search';
import { family, font, fontNumeric, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface DestinationCardProps {
  name: string;
  /** "119 km · 1 h 34 min", "≈ 118 km", or the address: whichever is known. */
  detail: string;
  category: PlaceCategory;
  a11yLabel: string;
}

/** The ride's destination as an information row (64, not pressable): flag / coffee tile, name, one detail line. */
export function DestinationCard({ name, detail, category, a11yLabel }: DestinationCardProps) {
  const { colors } = useTheme();
  const kind = stopKindFor(category);
  return (
    <Card padding={space.md} gap={0}>
      <View accessible accessibilityLabel={a11yLabel} style={styles.row}>
        <View style={[styles.tile, { backgroundColor: colors.navRoute }]}>
          <Icon name={kind === 'break' ? 'coffee' : 'endRide'} color={colors.onNavRoute} size={20} />
        </View>
        <View style={styles.texts}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.name, { color: colors.text }]}>
            {name}
          </Text>
          {detail ? (
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.detail, fontNumeric, { color: colors.textMuted }]}>
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: size.sheetInfoRow - 2 * space.md, flexDirection: 'row', alignItems: 'center', gap: space.md },
  tile: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1 },
  name: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  detail: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
});
