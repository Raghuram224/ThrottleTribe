import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import type { RideLogEntry } from '@/lib/summary';
import { family, fontNumeric, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const DOT = 14;

/**
 * Ride log timeline (16 §4): time column, a dot on a 2 dp rail (start, stop, SOS, end), title and meta.
 * Replaces the separate SOS / Stops sections and the "Location sharing stopped" card.
 */
export function RideLog({ entries }: { entries: RideLogEntry[] }) {
  const { colors } = useTheme();
  const dotColor = (kind: RideLogEntry['kind']) =>
    kind === 'start'
      ? colors.pinStartBg
      : kind === 'stop'
        ? colors.status.stopped
        : kind === 'sos'
          ? colors.status.sosStrong
          : colors.pinEndBg;
  return (
    <Card padding={space.lg} gap={0}>
      {entries.map((e, i) => {
        const last = i === entries.length - 1;
        return (
          <View
            key={e.key}
            accessible
            accessibilityLabel={[e.time, e.title, e.meta].filter(Boolean).join(', ')}
            style={styles.row}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.time, fontNumeric, { color: colors.textSubtle }]}>
              {e.time}
            </Text>
            <View style={styles.railCol}>
              <View style={[styles.dot, { backgroundColor: dotColor(e.kind), borderColor: colors.surfaceRaised }]} />
              {last ? null : <View style={[styles.rail, { backgroundColor: colors.trackLine }]} />}
            </View>
            <View style={[styles.texts, !last && styles.gap]}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.text }]}>
                {e.title}
              </Text>
              {e.meta ? (
                <Text maxFontSizeMultiplier={1.3} style={[styles.meta, { color: colors.textMuted }]}>
                  {e.meta}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  time: { width: 44, textAlign: 'right', fontSize: 13, lineHeight: 20, fontFamily: family.regular },
  railCol: { width: DOT, alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginTop: 3, borderWidth: 0 },
  rail: { flex: 1, width: 2, marginVertical: 2 },
  texts: { flex: 1, gap: 1, marginLeft: space.xs },
  gap: { paddingBottom: space.md },
  title: { fontSize: 15, lineHeight: 22, fontFamily: family.semibold },
  meta: { fontSize: 13, lineHeight: 18, fontFamily: family.regular },
});
