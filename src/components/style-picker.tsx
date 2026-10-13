import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { StyleThumbnail } from '@/components/style-thumbnail';
import { copy } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { usePrefsStore } from '@/store/prefs-store';
import { family, font, radius, space, THEME_STYLES, type ThemeStyle } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const NAMES: Record<ThemeStyle, { name: string; sub: string; a11y: string }> = {
  tribe: {
    name: copy['profile.styleTribe'],
    sub: copy['profile.styleTribeSub'],
    a11y: copy['profile.a11yStyleTribe'],
  },
  maps: {
    name: copy['profile.styleMaps'],
    sub: copy['profile.styleMapsSub'],
    a11y: copy['profile.a11yStyleMaps'],
  },
};
const GAP = space.md;

/**
 * Appearance > Style (17 §4): two radio cards, each with a live token thumbnail in the current scheme.
 * Tapping applies instantly: every themed view re-renders, maps re-key. Selected = ring + filled radio + check.
 */
export function StylePicker() {
  const { colors, scheme, style: current } = useTheme();
  const setStyle = usePrefsStore((s) => s.setThemeStyle);
  const [rowW, setRowW] = useState(0);
  const cardW = rowW > 0 ? (rowW - GAP) / THEME_STYLES.length : 0;
  const thumbW = Math.max(0, cardW - 16);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={copy['profile.styleLabel']}
      onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
      style={styles.row}>
      {cardW > 0
        ? THEME_STYLES.map((s) => {
            const selected = s === current;
            return (
              <PressableScale
                key={s}
                accessibilityRole="radio"
                accessibilityLabel={NAMES[s].a11y}
                accessibilityState={{ checked: selected, selected }}
                onPress={() => {
                  if (selected) return;
                  haptic('select');
                  setStyle(s);
                }}
                style={[
                  styles.card,
                  { width: cardW, backgroundColor: colors.surfaceRaised },
                  selected
                    ? { borderWidth: 2, borderColor: colors.accent, padding: 7, paddingBottom: 11 }
                    : { borderWidth: 1, borderColor: colors.borderStrong, padding: 8, paddingBottom: 12 },
                ]}>
                <StyleThumbnail style={s} scheme={scheme} width={thumbW} />
                <View style={styles.label}>
                  <View
                    style={[
                      styles.radio,
                      selected
                        ? { backgroundColor: colors.accent, borderColor: colors.accent }
                        : { borderColor: colors.borderStrong },
                    ]}>
                    {selected ? <Icon name="ready" color={colors.onAccent} size={14} /> : null}
                  </View>
                  <View style={styles.flex}>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.name, { color: colors.text }]}>
                      {NAMES[s].name}
                    </Text>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.sub, { color: colors.textMuted }]}>
                      {NAMES[s].sub}
                    </Text>
                  </View>
                </View>
              </PressableScale>
            );
          })
        : null}
    </View>
  );
}

/** Card section: title, hint and the picker. */
export function StyleSection() {
  return (
    <View style={styles.section}>
      <AppText style={styles.title}>{copy['profile.styleLabel']}</AppText>
      <AppText variant="caption" muted>
        {copy['profile.styleHint']}
      </AppText>
      <StylePicker />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.xs },
  title: { fontFamily: family.semibold },
  row: { flexDirection: 'row', gap: GAP, marginTop: space.sm },
  card: { borderRadius: radius.lg, gap: space.sm },
  label: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  name: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  sub: { fontSize: 13, lineHeight: 18, fontFamily: family.regular },
});
