import { useEffect, useRef } from 'react';
import { Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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

interface SearchInputBarProps {
  top: number;
  value: string;
  onChangeText: (value: string) => void;
  /** The keyboard's search key. */
  onSubmit: () => void;
  /** The input took the keyboard: Home goes back to the suggestions list. */
  onFocus: () => void;
  /** Back arrow: the same step as Android Back. */
  onBack: () => void;
  /** Clear X: empties the text and puts the cursor back. */
  onClear: () => void;
  /** Moving (21 §2.2.2): the input stops taking text; chips and rows keep working. */
  locked: boolean;
  /** Take the keyboard now (the where-to focus rules decide, not this component). */
  autoFocus: boolean;
}

/**
 * The bar in search mode (28): back arrow at the left, the text input, a clear X at the right once there is text. The
 * same 56 dp pill as the browse bar, so the bar does not jump when search opens.
 */
export function SearchInputBar({ top, value, onChangeText, onSubmit, onFocus, onBack, onClear, locked, autoFocus }: SearchInputBarProps) {
  const { colors, scheme } = useTheme();
  const inputRef = useRef<TextInput>(null);
  // `autoFocus` only acts at mount; the typing lock decides later (after a live fix), so it also focuses when the prop turns true.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  // The keyboard goes away the moment the lock engages.
  useEffect(() => {
    if (locked) Keyboard.dismiss();
  }, [locked]);
  const placeholder = locked ? copy['whereTo.lockedPlaceholder'] : copy['search.placeholder'];
  return (
    <View style={[styles.bar, { top, backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy['homeSearch.a11yBack']}
        onPress={() => {
          haptic('select');
          onBack();
        }}
        style={styles.back}>
        <Icon name="back" color={colors.text} size={28} />
      </Pressable>
      <TextInput
        ref={inputRef}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onSubmitEditing={onSubmit}
        editable={!locked}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        selectionColor={colors.brand.primary}
        accessibilityLabel={placeholder}
        accessibilityState={{ disabled: locked }}
        maxFontSizeMultiplier={1.3}
        style={[styles.input, { color: colors.text }, locked && styles.locked]}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy['search.a11yClear']}
          onPress={() => {
            haptic('select');
            onClear();
            inputRef.current?.focus();
          }}
          style={styles.back}>
          <Icon name="close" color={colors.textMuted} size={22} />
        </Pressable>
      ) : null}
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
  /** Search mode (28): the chosen chip is marked (fill, border, a tick and `selected`); browse has none. */
  selected?: SearchChip['key'] | null;
  /** Solid chips on the suggestions surface need no shadow. */
  flat?: boolean;
}

/** Category chips under the bar (22 §3.1.1): 48 visual, 56 hit; a selected state only in search mode. */
export function HomeChips({ top, onChip, selected = null, flat = false }: HomeChipsProps) {
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
        const on = selected === c.key;
        return (
          <Pressable
            key={c.key}
            accessibilityRole="button"
            accessibilityLabel={t('homeMap.chipA11y', { label })}
            accessibilityHint={copy['homeMap.searchHint']}
            accessibilityState={{ selected: on }}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => {
              haptic('select');
              onChip(c.key);
            }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: on ? colors.brandTint : pressed ? colors.surfacePressed : flat ? colors.surface : colors.surfaceRaised,
                borderColor: on ? colors.brandOnBg : 'transparent',
              },
              flat ? null : elevate('e2', scheme),
            ]}>
            <Icon name={c.icon} color={on ? colors.brandOnBg : colors.text} size={22} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.chipLabel, { color: on ? colors.brandOnBg : colors.text }]}>
              {label}
            </Text>
            {on ? <Icon name="ready" color={colors.brandOnBg} size={16} /> : null}
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
  input: { flex: 1, height: size.searchBar, fontSize: font.md, fontFamily: family.regular, paddingVertical: 0 },
  locked: { opacity: 0.6 },
  chips: { position: 'absolute', left: 0, right: 0, flexGrow: 0 },
  chipsContent: { paddingHorizontal: space.md, gap: space.sm, paddingVertical: space.xs },
  chip: {
    minHeight: size.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    // Reserved and colour-swapped, so a chip does not change size when it is chosen.
    borderWidth: 2,
  },
  chipLabel: { fontSize: font.md, fontFamily: family.semibold },
});
