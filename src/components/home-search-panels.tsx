import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CreditRow } from '@/components/credit-row';
import { copy } from '@/lib/copy';
import { searchCreditLinks } from '@/lib/credits';
import type { PlaceSource } from '@/lib/place-search';
import { elevate, family, font, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Credit links at rest; plain text while typing is locked (a gloved tap must not open a browser, 24 §4.3). */
function SearchCredit({ provider, inert }: { provider: PlaceSource | null; inert: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.creditRow, { borderTopColor: colors.border }]}>
      <CreditRow
        inert={inert}
        links={searchCreditLinks(provider).map((l) => ({ label: copy[l.labelKey] as string, url: l.url, site: l.site }))}
      />
    </View>
  );
}

interface SearchSuggestionsProps {
  /** The surface starts here (under the offline banner, which stays visible). */
  top: number;
  /** Where the list starts, from the surface's top: under the bar and the chip row (they float above this surface). */
  topOffset: number;
  provider: PlaceSource | null;
  typingLocked: boolean;
  children: ReactNode;
}

/**
 * The typing stage of the inline search (28): a solid surface over the whole screen with the list under the bar, like
 * Maps (recents when nothing is typed, then the matches). The bar and the chips are Home's own floating views above it.
 */
export function SearchSuggestions({ top, topOffset, provider, typingLocked, children }: SearchSuggestionsProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[StyleSheet.absoluteFill, { top, backgroundColor: colors.surfaceRaised }]}>
      <ScrollView style={{ marginTop: topOffset }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
        {typingLocked ? (
          <AppText variant="caption" muted accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3} style={styles.lockNote}>
            {copy['whereTo.typingLocked']}
          </AppText>
        ) : null}
        {children}
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom }}>
        <SearchCredit provider={provider} inert={typingLocked} />
      </View>
    </KeyboardAvoidingView>
  );
}

interface SearchResultsPanelProps {
  /** Fixed: about 45% of the window (`resultsPanelHeight`). */
  height: number;
  /** "Coffee" or "Results for "palace"". */
  title: string;
  /** "8 places"; empty while nothing has answered. */
  count: string;
  provider: PlaceSource | null;
  typingLocked: boolean;
  children: ReactNode;
}

/**
 * The results stage (28): the results as a list in a bottom panel, the same places as the pins on the map above it.
 * Scrolls on its own; the map above stays usable. The credit row sits at its foot, above the gesture inset.
 */
export function SearchResultsPanel({ height, title, count, provider, typingLocked, children }: SearchResultsPanelProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityLabel={copy['homeSearch.panelA11y']}
      style={[styles.panel, { height, backgroundColor: colors.surfaceRaised }, elevate('e3', scheme)]}>
      <View pointerEvents="none" style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
      <View style={styles.header} accessible accessibilityRole="header" accessibilityLabel={[title, count].filter(Boolean).join(', ')}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        {count ? (
          <Text maxFontSizeMultiplier={1.3} style={[styles.count, { color: colors.textMuted }]}>
            {count}
          </Text>
        ) : null}
      </View>
      <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelList}>
        {children}
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom }}>
        <SearchCredit provider={provider} inert={typingLocked} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: space.lg },
  lockNote: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  creditRow: { borderTopWidth: StyleSheet.hairlineWidth },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden' },
  grabber: { alignSelf: 'center', marginTop: 6, width: 40, height: 4, borderRadius: 2 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  title: { flex: 1, fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  count: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  panelList: { paddingBottom: space.sm },
});
