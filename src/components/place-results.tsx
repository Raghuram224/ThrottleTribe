import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { ErrorText } from '@/components/error-text';
import { PlaceRow } from '@/components/place-row';
import type { PlaceSearchState } from '@/hooks/use-place-search';
import { copy, t } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { SEARCH_CHIPS, type Place, type SearchChip } from '@/lib/place-search';
import { fontNumeric, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface PlaceResultsProps {
  state: PlaceSearchState;
  /** What was typed (empty for a chip search). */
  text: string;
  chip: SearchChip['key'] | null;
  /** A chip has waited long for the first fix. */
  stillLocating: boolean;
  /** The phone's location switch is off (the needs-location line says turn it on, not allow). */
  servicesOff: boolean;
  retry: () => void;
  /** Under the chips while nothing is typed or chosen, and when a chip needs location (the location explainer row). */
  header?: ReactNode;
  /** The body while nothing is typed or chosen (recent places, or an empty state). */
  emptyContent?: ReactNode;
  /** `text` is what was typed (empty for a chip search). */
  onPick: (place: Place, text: string) => void;
}

/**
 * The list half of the place search (idle body, loading, locating, needs-location, error with retry, empty, rows) as
 * plain content: the in-ride search and Where to? put it in their own scroll view, Home's inline search in the
 * suggestions list and the results panel.
 */
export function PlaceResults({ state, text, chip, stillLocating, servicesOff, retry, header, emptyContent, onPick }: PlaceResultsProps) {
  const { colors } = useTheme();
  const idle = state.status === 'idle' && text.trim().length === 0 && chip === null;
  const chipDef = chip ? SEARCH_CHIPS.find((c) => c.key === chip) : undefined;
  const chipLabel = chipDef ? copy[chipDef.labelKey] : null;
  const typedTooShort = state.status === 'idle' && text.trim().length > 0;
  return (
    <>
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
      {state.status === 'locating' ? (
        <View style={styles.note} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.brandOnBg} />
          <AppText muted style={styles.locating}>
            {copy['homeMap.findingYou']}
          </AppText>
          {stillLocating ? (
            <AppText muted style={styles.locating}>
              {copy['search.chipStillLocating']}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {state.status === 'needsLocation' ? (
        <>
          <AppText muted style={styles.note} accessibilityLiveRegion="polite">
            {servicesOff ? copy['search.chipNeedsLocationOff'] : copy['search.chipNeedsLocation']}
          </AppText>
          {header}
        </>
      ) : null}
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
    </>
  );
}

const styles = StyleSheet.create({
  note: { padding: space.lg, gap: space.md },
  locating: { textAlign: 'center' },
  caption: { height: 32, paddingHorizontal: space.lg, textAlignVertical: 'center', lineHeight: 32 },
});
