import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { EmptyState } from '@/components/empty-state';
import { LocationRow } from '@/components/location-row';
import { PlaceSearchView } from '@/components/place-search-view';
import { RecentPlacesSection } from '@/components/recent-places-section';
import { useNetOffline } from '@/hooks/use-connection';
import { usePlanningPosition } from '@/hooks/use-planning-position';
import { useSettleTimeout, useTypingLockJudged } from '@/hooks/use-typing-lock';
import { copy } from '@/lib/copy';
import { shouldFocusSearch } from '@/lib/typing-lock';
import { href } from '@/lib/nav';
import { SEARCH_CHIPS, type Place, type SearchChip } from '@/lib/place-search';
import { shownRecents } from '@/lib/recent-places';
import { track } from '@/lib/telemetry';
import { usePlanStore } from '@/store/plan-store';
import { useRecentsStore } from '@/store/recents-store';
import { space } from '@/theme/tokens';

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

/**
 * Where to? (21 §2.2, 22 §3.2): search a place, or pick a recent one. It never starts anything: a pick goes
 * back to the map home through the plan store (a new place opens the place sheet, a recent one the route), so
 * the home map never reloads. Opened from the bar it focuses the input (not while typing-locked); from a chip
 * it shows that chip's results and no keyboard. "Just ride" is a tile on the map home now.
 */
export default function WhereTo() {
  const params = useLocalSearchParams();
  const offline = useNetOffline();
  const { perm, fix, request, servicesEnabled } = usePlanningPosition();
  const me = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix]);
  const { locked, judgedAt } = useTypingLockJudged(fix?.speedMps ?? null, fix?.t ?? null);
  // The keyboard waits until the lock has been judged against a live fix: the last-known answer has no speed,
  // so focusing on it would flash the keyboard up and down for a rider at speed (22 §3.2). Capped, so a still
  // rider or a slow first fix still gets the keyboard.
  const locationKnown = perm.status === 'granted' || perm.status === 'unknown';
  const timedOut = useSettleTimeout(perm.status === 'granted');
  const settled = (!!fix?.live && judgedAt === fix.t) || timedOut;
  const recents = useRecentsStore((s) => s.recents);
  const [clearOpen, setClearOpen] = useState(false);

  const q = one(params.q);
  const chipParam = one(params.chip);
  const initialChip = SEARCH_CHIPS.some((c) => c.key === chipParam) ? (chipParam as SearchChip['key']) : null;
  const focusNow = shouldFocusSearch({
    wantsFocus: one(params.focus) === '1' || q !== '',
    locked,
    locationKnown,
    settled,
  });
  // Decided once, when the answer is in: a later unlock (the rider stops at a light) must not pop the keyboard up.
  const [focusLatched, setFocusLatched] = useState<boolean | null>(null);
  if (focusLatched === null && (!locationKnown || settled)) setFocusLatched(focusNow);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(href('/home'));
  }, []);

  const onPickResult = useCallback(
    (place: Place, text: string) => {
      track('home.place_opened', { from: 'search' });
      usePlanStore.getState().openPlace(place, text);
      goBack();
    },
    [goBack],
  );
  const onPickRecent = useCallback(
    (place: Place) => {
      track('home.place_opened', { from: 'recent' });
      usePlanStore.getState().openRoute(place, 'recent');
      goBack();
    },
    [goBack],
  );

  const shown = shownRecents(recents);

  return (
    <PlaceSearchView
      me={me}
      autoFocus={focusLatched === true}
      initialText={q}
      initialChip={initialChip}
      typingLocked={locked}
      onBack={goBack}
      backLabel={copy['whereTo.a11yBack']}
      top={offline ? <Banner tone="offline" icon="offline" text={copy['whereTo.offline']} /> : null}
      header={<LocationRow perm={perm} servicesEnabled={servicesEnabled} onAllow={() => void request()} />}
      emptyContent={
        shown.length > 0 ? (
          <RecentPlacesSection me={me} onPick={onPickRecent} onClear={() => setClearOpen(true)} />
        ) : (
          <View style={styles.empty}>
            <EmptyState icon="mapSearch" title={copy['whereTo.emptyTitle']} body={copy['whereTo.emptyBody']} />
          </View>
        )
      }
      onPick={onPickResult}>
      <ConfirmSheet
        visible={clearOpen}
        title={copy['whereTo.clearTitle']}
        body={copy['whereTo.clearBody']}
        confirmLabel={copy['whereTo.clearConfirm']}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          useRecentsStore.getState().clear();
          setClearOpen(false);
        }}
      />
    </PlaceSearchView>
  );
}

const styles = StyleSheet.create({
  empty: { paddingHorizontal: space.lg, paddingTop: space.xl },
});
