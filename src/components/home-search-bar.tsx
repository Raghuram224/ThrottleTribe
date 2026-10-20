import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { RiderAvatar } from '@/components/rider-avatar';
import { copy, t } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { SEARCH_CHIPS, type SearchChip } from '@/lib/place-search';
import { elevate, family, font, radius, size, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Bar sides (22 §3.1.1): 12 dp from the screen edge, 336 wide at 360. */
const BAR_SIDE = space.md;
const TODO_DOT = 10;

interface HomeSearchBarProps {
  /** Distance from the top of the screen: insets.top + offline banner + 8. */
  top: number;
  /** The bar text: "Where to?", or "Search stops for {ride}". */
  label: string;
  a11yLabel: string;
  onPress: () => void;
  /** The avatar button at the right end (profile). */
  avatar: { name: string; todo: number; a11yLabel: string; onPress: () => void };
}

/**
 * Floating search bar (22 §3.1.1): brand mark at the left, the question in the middle, my avatar (with the
 * to-do dot) at the right. The bar minus the avatar is one 56 dp button. The mark is the static orange logo in
 * both styles (17 §0.3).
 */
export function HomeSearchBar({ top, label, a11yLabel, onPress, avatar }: HomeSearchBarProps) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.bar, { top, backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={copy['homeMap.searchHint']}
        onPress={() => {
          haptic('select');
          onPress();
        }}
        // A ripple, not a `pressed` fill: that fill could stay painted on the bar's main area (grey beside the white avatar
        // zone) when the press ended on another screen.
        android_ripple={{ color: colors.surfacePressed }}
        style={styles.main}>
        <Image
          source={
            scheme === 'dark'
              ? require('../../assets/brand/png/logo-mark-on-dark.png')
              : require('../../assets/brand/png/logo-mark.png')
          }
          style={styles.mark}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.3} style={[styles.label, { color: colors.textMuted }]}>
          {label}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={avatar.a11yLabel}
        onPress={() => {
          haptic('select');
          avatar.onPress();
        }}
        style={styles.avatar}>
        <View>
          <RiderAvatar name={avatar.name || '?'} colorIndex={0} size={size.avatar} me />
          {/* Amber dot + the words in the label: profile has things to set up. */}
          {avatar.todo > 0 ? (
            <View style={[styles.todoDot, { backgroundColor: colors.status.stopped, borderColor: colors.bg }]} />
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

interface PlaceBarProps {
  top: number;
  name: string;
  onBack: () => void;
  /** Tap on the name: search again with the text that found the place. */
  onSearchAgain: () => void;
}

/** The bar in place mode (22 §3.3): back at the left, the place name in the middle (a button: search again). */
export function PlaceBar({ top, name, onBack, onSearchAgain }: PlaceBarProps) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.bar, { top, backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy['homeMap.barBackA11y']}
        onPress={() => {
          haptic('select');
          onBack();
        }}
        style={styles.back}>
        <Icon name="back" color={colors.text} size={28} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('homeMap.barPlaceA11y', { name })}
        onPress={() => {
          haptic('select');
          onSearchAgain();
        }}
        android_ripple={{ color: colors.surfacePressed }}
        style={styles.placeMain}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.placeName, { color: colors.text }]}>
          {name}
        </Text>
      </Pressable>
    </View>
  );
}

interface HomeChipsProps {
  top: number;
  onChip: (key: SearchChip['key']) => void;
}

/** Category chips under the bar (22 §3.1.1): 48 visual, 56 hit; no selected state on Home. */
export function HomeChips({ top, onChip }: HomeChipsProps) {
  const { colors, scheme } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.chips, { top }]}
      contentContainerStyle={styles.chipsContent}
      keyboardShouldPersistTaps="handled">
      {SEARCH_CHIPS.map((c) => {
        const label = copy[c.labelKey];
        return (
          <Pressable
            key={c.key}
            accessibilityRole="button"
            accessibilityLabel={t('homeMap.chipA11y', { label })}
            accessibilityHint={copy['homeMap.searchHint']}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => {
              haptic('select');
              onChip(c.key);
            }}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceRaised },
              elevate('e2', scheme),
            ]}>
            <Icon name={c.icon} color={colors.text} size={22} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.chipLabel, { color: colors.text }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: BAR_SIDE,
    right: BAR_SIDE,
    height: size.searchBar,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'visible',
  },
  main: {
    flex: 1,
    height: size.searchBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.lg,
    borderTopLeftRadius: radius.pill,
    borderBottomLeftRadius: radius.pill,
  },
  mark: { width: 24, height: 24 },
  label: { flex: 1, fontSize: font.md, fontFamily: family.regular },
  // 40 avatar inside the 56 hit area.
  avatar: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  todoDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: TODO_DOT,
    height: TODO_DOT,
    borderRadius: TODO_DOT / 2,
    borderWidth: 1,
  },
  back: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  placeMain: {
    flex: 1,
    height: size.searchBar,
    justifyContent: 'center',
    paddingRight: space.lg,
    borderTopRightRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
  },
  placeName: { fontSize: font.md, fontFamily: family.semibold },
  chips: { position: 'absolute', left: 0, right: 0, flexGrow: 0 },
  chipsContent: { paddingHorizontal: space.md, gap: space.sm, paddingVertical: space.xs },
  chip: {
    minHeight: size.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  chipLabel: { fontSize: font.md, fontFamily: family.semibold },
});
