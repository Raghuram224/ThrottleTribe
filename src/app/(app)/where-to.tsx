import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/banner';
import { BigButton } from '@/components/big-button';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { PlaceSearchView } from '@/components/place-search-view';
import { RecentPlacesSection } from '@/components/recent-places-section';
import { useNetOffline } from '@/hooks/use-connection';
import { usePlanningPosition, type LocationPerm } from '@/hooks/use-planning-position';
import { useTypingLock } from '@/hooks/use-typing-lock';
import { copy, errorText } from '@/lib/copy';
import { href } from '@/lib/nav';
import { previewHref } from '@/lib/preview-params';
import { shownRecents } from '@/lib/recent-places';
import { resetToRide } from '@/lib/reset-to-ride';
import { toRideError } from '@/lib/ride-api';
import { isRideStartBusy } from '@/lib/ride-start';
import { startSoloRide } from '@/lib/solo-ride';
import { usePrefsStore } from '@/store/prefs-store';
import { useRecentsStore } from '@/store/recents-store';
import { showToast } from '@/store/toast-store';
import { family, font, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Where to? (21 §2.2): pick a destination, or start a free solo ride. Not auto-focused: with gloves, the
 * chips and recent places are the main path, and an open keyboard would cover them and the footer. No ride
 * exists until Go on the preview.
 */
export default function WhereTo() {
  const offline = useNetOffline();
  const { perm, fix, request } = usePlanningPosition();
  const me = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix]);
  const locked = useTypingLock(fix?.speedMps ?? null, fix?.t ?? null);
  const recents = useRecentsStore((s) => s.recents);
  const thresholdS = usePrefsStore((s) => s.stopThresholdS);
  const [clearOpen, setClearOpen] = useState(false);
  const [riding, setRiding] = useState(false);
  const ridingRef = useRef(false);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(href('/home'));
  }, []);

  const onPick = useCallback((place: Parameters<typeof previewHref>[0]) => {
    router.push(href(previewHref(place)));
  }, []);

  // Today's free solo ride, unchanged: it opens in full map the first time.
  const justRide = async () => {
    if (ridingRef.current) return;
    ridingRef.current = true;
    setRiding(true);
    try {
      resetToRide(await startSoloRide(thresholdS));
    } catch (e) {
      // A start already in flight (the preview's Go) is not an error to show.
      if (!isRideStartBusy(e)) showToast(errorText(toRideError(e).code));
    } finally {
      ridingRef.current = false;
      setRiding(false);
    }
  };

  const shown = shownRecents(recents);

  return (
    <PlaceSearchView
      me={me}
      autoFocus={false}
      typingLocked={locked}
      onBack={goBack}
      backLabel={copy['whereTo.a11yBack']}
      top={offline ? <Banner tone="offline" icon="offline" text={copy['whereTo.offline']} /> : null}
      header={<LocationRow perm={perm} onAllow={() => void request()} />}
      emptyContent={
        shown.length > 0 ? (
          <RecentPlacesSection me={me} onPick={onPick} onClear={() => setClearOpen(true)} />
        ) : (
          <View style={styles.empty}>
            <EmptyState icon="mapSearch" title={copy['whereTo.emptyTitle']} body={copy['whereTo.emptyBody']} />
          </View>
        )
      }
      onPick={onPick}
      footer={
        <BigButton
          label={copy['whereTo.justRide']}
          variant="secondary"
          icon="bike"
          loading={riding}
          onPress={() => void justRide()}
        />
      }>
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

/**
 * Explain before asking (rule 8, 21 §2.2.1): why location, who receives what, then one button. Search and
 * picking work without it (no bias, no distances). When the OS will not ask again the button opens settings;
 * coming back re-reads the permission.
 */
function LocationRow({ perm, onAllow }: { perm: LocationPerm; onAllow: () => void }) {
  const { colors } = useTheme();
  if (perm.status === 'granted' || perm.status === 'unknown') return null;
  const blocked = perm.status === 'denied' && !perm.canAskAgain;
  return (
    <View style={[styles.locBlock, { borderBottomColor: colors.border }]}>
      <View style={styles.locRow}>
        <View style={[styles.locTile, { backgroundColor: colors.brandTint }]}>
          <Icon name="permLocation" color={colors.brandOnBg} size={20} />
        </View>
        <View style={styles.locTexts}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.locTitle, { color: colors.text }]}>
            {copy['whereTo.locTitle']}
          </Text>
          <Text numberOfLines={3} maxFontSizeMultiplier={1.3} style={[styles.locBody, { color: colors.textMuted }]}>
            {copy['whereTo.locBody']}
          </Text>
        </View>
      </View>
      <BigButton
        label={blocked ? copy['perm.openSettings'] : copy['whereTo.locAllow']}
        variant="secondary"
        onPress={blocked ? () => void Linking.openSettings().catch(() => {}) : onAllow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingHorizontal: space.lg, paddingTop: space.xl },
  locBlock: { padding: space.lg, gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  locRow: { flexDirection: 'row', gap: space.md },
  locTile: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  locTexts: { flex: 1, gap: 2 },
  locTitle: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  locBody: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
});
