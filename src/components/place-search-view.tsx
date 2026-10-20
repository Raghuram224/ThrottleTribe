import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { BigButton } from '@/components/big-button';
import { ErrorText } from '@/components/error-text';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { CreditRow } from '@/components/credit-row';
import { useNetOffline } from '@/hooks/use-connection';
import { usePlaceSearch } from '@/hooks/use-place-search';
import { copy, t } from '@/lib/copy';
import { searchCreditLinks } from '@/lib/credits';
import { formatDistance } from '@/lib/format';
import type { LatLng } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { distinctAddress, placeRowA11y, SEARCH_CHIPS, type Place, type PlaceCategory, type SearchChip } from '@/lib/place-search';
import { categoryIcon } from '@/lib/stop-ui';
import { family, font, fontNumeric, radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface PlaceSearchViewProps {
  /** My position: search bias and the distance column. Null = unbiased, no distances. */
  me: LatLng | null;
  /** The in-ride search focuses the input; Where to? does not (recents and chips are the main path). */
  autoFocus: boolean;
  /** Moving: the input stops taking text (21 §2.2.2); chips, rows and results keep working. */
  typingLocked: boolean;
  onBack: () => void;
  backLabel: string;
  /** Above the input row (e.g. an offline banner). */
  top?: ReactNode;
  /** Under the chips, only while nothing is typed or chosen (e.g. the location explainer row). */
  header?: ReactNode;
  /** The body while nothing is typed or chosen (recent places, or an empty state). */
  emptyContent: ReactNode;
  /** `text` is what was typed (empty for a chip search). */
  onPick: (place: Place, text: string) => void;
  /** Opens with this text / chip already searched (the map home's "search again" and its chips, 22 §3.2). */
  initialText?: string;
  initialChip?: SearchChip['key'] | null;
  /** Pinned under the credit row, in the thumb zone. */
  footer?: ReactNode;
  /** Sheets and other overlays that belong to the screen. */
  children?: ReactNode;
}

/**
 * The place search shared by the in-ride stop search (19 A) and Where to? (21 §2.2): input row, category
 * chips, results (>= 3 characters, 400 ms debounce, loading, error / busy with retry, empty), and the pinned credit
 * row (Geoapify or Photon, and OpenStreetMap). What a pick does, and what shows before anything is typed, is up to the screen.
 */
export function PlaceSearchView({
  me,
  autoFocus,
  typingLocked,
  onBack,
  backLabel,
  top,
  header,
  emptyContent,
  onPick,
  initialText,
  initialChip,
  footer,
  children,
}: PlaceSearchViewProps) {
  const { colors } = useTheme();
  const offline = useNetOffline();
  const { text, setText, chip, setChip, state, retry, provider } = usePlaceSearch(me, { text: initialText, chip: initialChip }, offline);
  // Name a provider only once one has answered (24 §4): before that, or after a failure, the credit is OpenStreetMap alone.
  const shownProvider = state.status === 'results' ? state.provider : provider;

  // `autoFocus` only acts at mount; Where to? decides later (after the typing lock has seen a live fix), so the
  // input is also focused when the prop turns true.
  const inputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // The keyboard goes away the moment the lock engages.
  useEffect(() => {
    if (typingLocked) Keyboard.dismiss();
  }, [typingLocked]);

  const showClear = text.length > 0;
  const idle = state.status === 'idle' && text.trim().length === 0 && chip === null;
  const chipDef = chip ? SEARCH_CHIPS.find((c) => c.key === chip) : undefined;
  const chipLabel = chipDef ? copy[chipDef.labelKey] : null;
  const typedTooShort = state.status === 'idle' && text.trim().length > 0;

  return (
    <Screen
      padded={false}
      keyboardAvoiding
      top={top}
      footer={
        <View>
          {/* Credit links at rest; plain text while typing is locked (a gloved tap must not open a browser, 24 §4.3). */}
          <View style={[styles.creditRow, { borderTopColor: colors.border }]}>
            <CreditRow
              inert={typingLocked}
              links={searchCreditLinks(shownProvider).map((l) => ({ label: copy[l.labelKey] as string, url: l.url, site: l.site }))}
            />
          </View>
          {footer}
        </View>
      }>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={styles.back}>
          <Icon name="back" color={colors.text} size={28} />
        </Pressable>
        <View style={styles.inputWrap}>
          <AppTextInput
            ref={inputRef}
            autoFocus={autoFocus}
            autoCorrect={false}
            returnKeyType="search"
            value={text}
            onChangeText={setText}
            editable={!typingLocked}
            placeholder={typingLocked ? copy['whereTo.lockedPlaceholder'] : copy['search.placeholder']}
            accessibilityLabel={typingLocked ? copy['whereTo.lockedPlaceholder'] : copy['search.placeholder']}
            accessibilityState={{ disabled: typingLocked }}
            style={[styles.input, typingLocked && styles.locked]}
          />
          {showClear ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy['search.a11yClear']}
              onPress={() => setText('')}
              style={styles.clear}>
              <Icon name="close" color={colors.textMuted} size={22} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled">
        {SEARCH_CHIPS.map((c) => {
          const on = chip === c.key;
          return (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => {
                haptic('select');
                setChip(on ? null : c.key);
              }}
              style={[
                styles.chip,
                { backgroundColor: on ? colors.brandTint : colors.surface, borderColor: on ? colors.brandOnBg : 'transparent' },
              ]}>
              <Icon name={c.icon} color={on ? colors.brandOnBg : colors.text} size={22} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.chipLabel, { color: on ? colors.brandOnBg : colors.text }]}>
                {copy[c.labelKey]}
              </Text>
              {on ? <Icon name="ready" color={colors.brandOnBg} size={16} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {typingLocked ? (
        <AppText variant="caption" muted accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3} style={styles.lockNote}>
          {copy['whereTo.typingLocked']}
        </AppText>
      ) : null}

      <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
        {idle ? (
          <>
            {header}
            {emptyContent}
          </>
        ) : null}
        {typedTooShort ? (
          <AppText muted style={styles.note}>
            {copy['search.hintMin']}
          </AppText>
        ) : null}
        {state.status === 'loading' ? <ActivityIndicator color={colors.brandOnBg} style={styles.note} /> : null}
        {state.status === 'error' ? (
          <View style={styles.note} accessibilityLiveRegion="polite">
            <ErrorText>{state.kind === 'busy' ? copy['search.busy'] : state.kind === 'slow' ? copy['search.slow'] : copy['search.error']}</ErrorText>
            {state.kind === 'offline' ? null : <BigButton label={copy['search.retry']} variant="secondary" onPress={retry} />}
          </View>
        ) : null}
        {state.status === 'results' && state.radiusM !== null && state.places.length > 0 ? (
          <AppText variant="caption" muted accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3} style={[styles.caption, fontNumeric]}>
            {t('search.chipWithin', { km: `${state.radiusM / 1000} km` })}
          </AppText>
        ) : null}
        {state.status === 'results' && state.places.length === 0 ? (
          <AppText muted style={styles.note}>
            {chipLabel && state.radiusM !== null
              ? t('search.chipEmpty', { chip: chipLabel.toLowerCase(), km: `${state.radiusM / 1000} km` })
              : copy['search.empty']}
          </AppText>
        ) : null}
        {state.status === 'results'
          ? state.places.map((p, i) => (
              <PlaceRow
                key={p.id}
                divider={i < state.places.length - 1}
                name={p.name}
                address={p.address}
                distanceM={p.distanceM}
                category={p.category}
                onPress={() => {
                  haptic('select');
                  onPick(p, text.trim());
                }}
              />
            ))
          : null}
      </ScrollView>

      {children}
    </Screen>
  );
}

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
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingRight: space.lg },
  back: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, justifyContent: 'center' },
  input: { paddingRight: touchTarget },
  locked: { opacity: 0.6 },
  clear: { position: 'absolute', right: 0, width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  chip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  chipLabel: { fontSize: font.md, fontFamily: family.semibold },
  lockNote: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  results: { paddingBottom: space.lg },
  note: { padding: space.lg, gap: space.md },
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
  creditRow: { borderTopWidth: StyleSheet.hairlineWidth },
  caption: { height: 32, paddingHorizontal: space.lg, textAlignVertical: 'center', lineHeight: 32 },
});
