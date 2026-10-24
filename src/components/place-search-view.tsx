import { useEffect, useRef, type ReactNode } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { CreditRow } from '@/components/credit-row';
import { Icon } from '@/components/icon';
import { PlaceResults } from '@/components/place-results';
import { Screen } from '@/components/screen';
import { useNetOffline } from '@/hooks/use-connection';
import { usePlaceSearch } from '@/hooks/use-place-search';
import { copy } from '@/lib/copy';
import { searchCreditLinks } from '@/lib/credits';
import type { LatLng } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { SEARCH_CHIPS, type Place, type SearchChip } from '@/lib/place-search';
import { family, font, radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface PlaceSearchViewProps {
  /** My position: search bias and the distance column. Null = unbiased, no distances. */
  me: LatLng | null;
  /** False when location cannot arrive by itself (denied, off): a chip then asks to allow it instead of waiting. Default true. */
  canLocate?: boolean;
  /** The phone's location switch is off (the needs-location line says turn it on, not allow). */
  servicesOff?: boolean;
  /** The in-ride search focuses the input; Where to? does not (recents and chips are the main path). */
  autoFocus: boolean;
  /** Moving: the input stops taking text (21 §2.2.2); chips, rows and results keep working. */
  typingLocked: boolean;
  onBack: () => void;
  backLabel: string;
  /** Above the input row (e.g. an offline banner). */
  top?: ReactNode;
  /** Under the chips, while nothing is typed or chosen and when a chip needs location (e.g. the location explainer row). */
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

// The row moved to its own file (Home's inline search uses it too); the old import path keeps working.
export { PlaceRow } from '@/components/place-row';

/**
 * The place search shared by the in-ride stop search (19 A) and Where to? (21 §2.2): input row, category
 * chips, results (>= 3 characters, 400 ms debounce, loading, error / busy with retry, empty), and the pinned credit
 * row (Geoapify or Photon, and OpenStreetMap). What a pick does, and what shows before anything is typed, is up to the screen.
 */
export function PlaceSearchView({
  me,
  canLocate = true,
  servicesOff = false,
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
  const { text, setText, chip, setChip, state, retry, provider, stillLocating } = usePlaceSearch(me, { text: initialText, chip: initialChip }, offline, canLocate);
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
        <PlaceResults
          state={state}
          text={text}
          chip={chip}
          stillLocating={stillLocating}
          servicesOff={servicesOff}
          retry={retry}
          header={header}
          emptyContent={emptyContent}
          onPick={onPick}
        />
      </ScrollView>

      {children}
    </Screen>
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
  creditRow: { borderTopWidth: StyleSheet.hairlineWidth },
});
