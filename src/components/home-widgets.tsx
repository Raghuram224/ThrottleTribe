import { StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { copy, t } from '@/lib/copy';
import type { MonthStats, StatPart } from '@/lib/recent-rides';
import { family, font, fontNumeric, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

function Value({ parts }: { parts: StatPart[] }) {
  const { colors } = useTheme();
  return (
    <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[fontNumeric, { color: colors.text }]}>
      {parts.map((p, i) => (
        <Text key={i} style={p.unit ? styles.unit : styles.number}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
}

/** "214 km · This month | 3 · Rides | 7 h 40 · In the saddle": one card, hairline dividers (16 §3 P1). */
export function StatsStrip({ stats }: { stats: MonthStats }) {
  const { colors } = useTheme();
  const cols = [
    { parts: stats.km, label: copy['home.statMonth'] },
    { parts: stats.rides, label: copy['home.statRides'] },
    { parts: stats.saddle, label: copy['home.statSaddle'] },
  ];
  return (
    <Card padding={space.lg} style={styles.strip}>
      <View accessible accessibilityLabel={stats.a11y} style={styles.row}>
        {cols.map((c, i) => (
          <View key={c.label} style={[styles.col, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
            <Value parts={c.parts} />
            <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.label, { color: colors.textSubtle }]}>
              {c.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const STEPS = [
  { title: 'home.step1Title', body: 'home.step1Body' },
  { title: 'home.step2Title', body: 'home.step2Body' },
  { title: 'home.step3Title', body: 'home.step3Body' },
] as const;

/** First run (no rides ever): "How it works", three numbered steps on a 2 dp rail (16 §3 P1). */
export function FirstRunSteps() {
  const { colors } = useTheme();
  return (
    <Card padding={space.lg} gap={0}>
      {STEPS.map((s, i) => (
        <View key={s.title} style={styles.step}>
          <View style={styles.railCol}>
            <View
              style={[
                styles.circle,
                i === 0
                  ? { backgroundColor: colors.accent }
                  : { backgroundColor: colors.surface },
              ]}>
              <Text allowFontScaling={false} style={[styles.circleText, { color: i === 0 ? colors.onAccent : colors.textMuted }]}>
                {i + 1}
              </Text>
            </View>
            {i < STEPS.length - 1 ? <View style={[styles.rail, { backgroundColor: colors.trackLine }]} /> : null}
          </View>
          <View style={[styles.stepText, i < STEPS.length - 1 && styles.stepGap]}>
            <AppText variant="bodyStrong" maxFontSizeMultiplier={1.3}>
              {t(s.title)}
            </AppText>
            <AppText variant="caption" muted maxFontSizeMultiplier={1.3}>
              {t(s.body)}
            </AppText>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  strip: { borderRadius: radius.lg },
  row: { flexDirection: 'row' },
  col: { flex: 1, paddingLeft: space.md, gap: 2 },
  number: { fontSize: 24, lineHeight: 28, fontFamily: family.bold },
  unit: { fontSize: font.sm, fontFamily: family.semibold },
  label: { fontSize: font.xs, lineHeight: 16, fontFamily: family.regular },
  step: { flexDirection: 'row', gap: space.md },
  railCol: { width: 28, alignItems: 'center' },
  circle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  circleText: { fontSize: font.sm, fontFamily: family.semibold },
  rail: { flex: 1, width: 2, marginVertical: 2 },
  stepText: { flex: 1, gap: 2, paddingTop: 2 },
  stepGap: { paddingBottom: space.lg },
});
