import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import type { StatPart } from '@/lib/recent-rides';
import { family, font, fontNumeric, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export interface StatItem {
  parts: StatPart[];
  label: string;
  /** The hero number of the row (28 bold); the others are 22. */
  big?: boolean;
}

/** One card, three columns divided by hairlines (16 §4). Read as one phrase via `accessibilityLabel`. */
export function StatRow({ items, accessibilityLabel }: { items: StatItem[]; accessibilityLabel: string }) {
  const { colors } = useTheme();
  return (
    <Card padding={space.lg}>
      <View accessible accessibilityLabel={accessibilityLabel} style={styles.row}>
        {items.map((item, i) => (
          <View
            key={item.label}
            style={[
              styles.col,
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
              item.big && styles.colBig,
            ]}>
            <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[fontNumeric, { color: colors.text }]}>
              {item.parts.map((p, k) => (
                <Text key={k} style={p.unit ? styles.unit : item.big ? styles.big : styles.num}>
                  {p.text}
                </Text>
              ))}
            </Text>
            <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.label, { color: colors.textSubtle }]}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  col: { flex: 1, paddingLeft: space.md, gap: 2, justifyContent: 'flex-end' },
  colBig: { flex: 1.15, paddingLeft: 0 },
  big: { fontSize: 28, lineHeight: 34, fontFamily: family.bold, letterSpacing: -0.5 },
  num: { fontSize: 22, lineHeight: 30, fontFamily: family.bold },
  unit: { fontSize: font.sm, fontFamily: family.semibold },
  label: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
});
