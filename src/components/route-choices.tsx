import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { copy, t } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import type { RouteChoice } from '@/lib/route-choices';
import { elevate, family, font, fontNumeric, radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface RouteChoiceRowProps {
  choices: readonly RouteChoice[];
  selected: number;
  onSelect: (index: number) => void;
  /** A ride is being made, or the routes are updating: the choice is not changed meanwhile. */
  disabled?: boolean;
}

/**
 * The route choices (28): a row of radio cards, "42 min" over "31 km · Arrive 6:42 pm", the router's pick tagged
 * "Fastest". The chosen card has a heavier outline and a tick as well as its tint. Screen readers get one radio group:
 * each card reads its duration, distance, arrival and tag. The map's lines and duration pills do the same job by touch.
 */
export function RouteChoiceRow({ choices, selected, onSelect, disabled = false }: RouteChoiceRowProps) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      accessibilityRole="radiogroup"
      accessibilityLabel={copy['route.choicesA11y']}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
      keyboardShouldPersistTaps="handled">
      {choices.map((c) => {
        const on = c.index === selected;
        return (
          <Pressable
            key={c.index}
            accessibilityRole="radio"
            accessibilityLabel={c.a11y}
            accessibilityHint={copy['route.choiceHint']}
            accessibilityState={{ checked: on, disabled }}
            disabled={disabled}
            onPress={() => {
              if (on) return;
              haptic('select');
              onSelect(c.index);
            }}
            style={[
              styles.card,
              { backgroundColor: on ? colors.brandTint : colors.surface, borderColor: on ? colors.navRoute : 'transparent' },
              disabled && styles.dim,
            ]}>
            <View style={styles.top}>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.duration, fontNumeric, { color: colors.text }]}>
                {c.duration}
              </Text>
              {c.fastest ? (
                <Text maxFontSizeMultiplier={1.3} style={[styles.tag, { color: colors.brandOnBg }]}>
                  {copy['route.fastest']}
                </Text>
              ) : null}
              {on ? <Icon name="ready" color={colors.brandOnBg} size={18} /> : null}
            </View>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.sub, fontNumeric, { color: colors.textMuted }]}>
              {`${c.distance} · ${t('route.choiceArrive', { time: c.arrive })}`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * "Finding routes…" on the map while the preview loads (28): pins only on the map meanwhile, never a straight line.
 * A live region, so it is announced once.
 */
export function RoutesLoadingPill({ top, left }: { top: number; left: number }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={copy['route.finding']}
      pointerEvents="none"
      style={[styles.pill, { top, left, backgroundColor: colors.fabBg }, elevate('e2', scheme)]}>
      <ActivityIndicator size="small" color={colors.brandOnBg} />
      <Text maxFontSizeMultiplier={1.3} style={[styles.pillText, { color: colors.text }]}>
        {copy['route.finding']}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginHorizontal: -space.lg },
  row: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
  card: { minHeight: touchTarget, justifyContent: 'center', gap: 2, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 2 },
  dim: { opacity: 0.5 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  duration: { fontSize: font.lg, lineHeight: 26, fontFamily: family.bold },
  tag: { fontSize: font.xs, lineHeight: 16, fontFamily: family.bold },
  sub: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  pill: { position: 'absolute', height: 40, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill },
  pillText: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold },
});
