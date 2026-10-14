import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Banner } from '@/components/banner';
import { BigButton } from '@/components/big-button';
import { Icon } from '@/components/icon';
import { RoutePreviewMap } from '@/components/route-preview-map';
import { Skeleton } from '@/components/skeleton';
import { useNetOffline } from '@/hooks/use-connection';
import { useNow } from '@/hooks/use-now';
import { usePlanningPosition } from '@/hooks/use-planning-position';
import { usePreviewRoute } from '@/hooks/use-preview-route';
import { copy, errorText, spokenDistance, spokenDuration, t } from '@/lib/copy';
import { formatClockTime, formatDistance, formatDuration } from '@/lib/format';
import { haversineM, type LatLng } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { href } from '@/lib/nav';
import { ROUTING_SUPPORTS_EXCLUDE } from '@/lib/flags';
import { destKey } from '@/lib/nav-arrival';
import { parsePreviewParams } from '@/lib/preview-params';
import { previewPadding } from '@/lib/preview-fit';
import { resetToRide } from '@/lib/reset-to-ride';
import { toRideError } from '@/lib/ride-api';
import { isRideStartBusy } from '@/lib/ride-start';
import { startNavigationRide, stopKindFor } from '@/lib/solo-nav';
import { navLineFor } from '@/lib/stop-ui';
import { track } from '@/lib/telemetry';
import { readFreshOrigin, useNavStore } from '@/store/nav-store';
import { usePrefsStore } from '@/store/prefs-store';
import { useRecentsStore } from '@/store/recents-store';
import { showToast } from '@/store/toast-store';
import { elevate, family, font, fontNumeric, radius, space, touchTarget, type } from '@/theme/tokens';
import { statusColors, useTheme } from '@/theme/use-theme';

/**
 * Route preview (21 §2.3): confirm the place and see the trip before committing. Nothing here touches Supabase:
 * the ride is created at Go, never earlier, so browsing and backing out leaves no trace.
 */
export default function RoutePreview() {
  const params = useLocalSearchParams();
  const place = useMemo(() => parsePreviewParams(params), [params]);
  if (!place) return <BadPlace />;
  return <Preview place={place} />;
}

type Place = NonNullable<ReturnType<typeof parsePreviewParams>>;

function BadPlace() {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, styles.center, { backgroundColor: colors.bg }]}>
      <AppText muted>{copy['errors.unknown']}</AppText>
      <BigButton label={copy['preview.a11yBack']} variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace(href('/where-to')))} />
    </View>
  );
}

function Preview({ place }: { place: Place }) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const offline = useNetOffline();
  const now = useNow(60_000);
  const { fix } = usePlanningPosition();
  const allowExpressways = usePrefsStore((s) => s.allowExpressways);
  const setAllowExpressways = usePrefsStore((s) => s.setAllowExpressways);
  const thresholdS = usePrefsStore((s) => s.stopThresholdS);
  // Only a router that honours `exclude` has anything to avoid or allow (flags); otherwise the switch is hidden.
  const avoidMotorways = ROUTING_SUPPORTS_EXCLUDE && !allowExpressways;

  const dest = useMemo(() => ({ lat: place.lat, lng: place.lng }), [place.lat, place.lng]);
  const kind = stopKindFor(place.category);

  // The route starts where I was when it was asked for (Where to? hands its fix over): the line does not
  // chase my GPS while I read the screen. Try again takes a fresh start.
  const [origin, setOrigin] = useState<LatLng | null>(() => readFreshOrigin());
  if (origin === null && fix) setOrigin({ lat: fix.lat, lng: fix.lng });
  const { state, retry } = usePreviewRoute(origin, dest, avoidMotorways);
  const me = fix ?? origin;

  const [going, setGoing] = useState(false);
  // State lags a render: a double tap could otherwise get a second start through before `going` is true.
  const goingRef = useRef(false);
  // Android back must not leave while Go runs (the ride would still be created, with no screen waiting for it).
  useEffect(() => {
    if (!going) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [going]);
  const [bannerLayoutH, setBannerLayoutH] = useState(0);
  // The offline banner pushes the back button and the fit padding down; gone with the banner.
  const bannerH = offline ? bannerLayoutH : 0;
  const [panelH, setPanelH] = useState(0);

  const line = useMemo(
    () =>
      navLineFor({
        route: state.status === 'ok' || state.status === 'updating' ? state.route : null,
        // Loading, no route and a failed fetch all show the dashed straight line (§2.3 states); updating keeps the old road.
        straightLine: me && state.status !== 'ok' && state.status !== 'updating' && state.status !== 'locating' ? [me, dest] : [],
      }),
    [state, me, dest],
  );
  const straightM = me ? haversineM(me, dest) : null;
  const roadDrawn = state.status === 'ok' || state.status === 'updating';
  const updating = state.status === 'updating';

  const goBack = useCallback(() => {
    if (goingRef.current) return;
    haptic('select');
    if (router.canGoBack()) router.back();
    else router.replace(href('/where-to'));
  }, []);

  const onRetry = () => {
    if (fix) setOrigin({ lat: fix.lat, lng: fix.lng });
    retry();
  };

  const go = async () => {
    if (goingRef.current || going || offline) return;
    goingRef.current = true;
    setGoing(true);
    try {
      const start = await startNavigationRide(place, thresholdS);
      if (!start.existing) {
        // Hand the route and the expressway choice to the live ride: no second request, same avoidance on reroutes.
        useNavStore.getState().startSession(
          start.rideId,
          state.status === 'ok' ? { key: destKey(dest), route: state.route } : null,
          avoidMotorways,
        );
        useRecentsStore.getState().add(place);
        track('nav.started', { from: 'where_to' });
      }
      // A ride was already open: it is opened as it is (never a second one), so the chosen place was not set.
      // Say so, or the rider rides on wondering why there are no directions to it.
      if (start.existing) showToast(t('preview.existingRide', { name: place.name }));
      haptic('success');
      resetToRide(start.href);
    } catch (e) {
      // The ride was ended by startNavigationRide; stay here with Go enabled again. A start already in
      // flight elsewhere is not an error to show.
      if (!isRideStartBusy(e)) showToast(errorText(toRideError(e).code));
    } finally {
      goingRef.current = false;
      setGoing(false);
    }
  };

  const padding = previewPadding(insets.top + bannerH, panelH);
  const backTop = insets.top + bannerH + space.sm;
  const route = state.status === 'ok' || updating ? state.route : null;
  const settledRoute = state.status === 'ok' ? state.route : null;
  const durationText = route ? formatDuration(route.durationS * 1000) : null;
  const distanceText = route ? formatDistance(route.distanceM) : straightM != null ? formatDistance(straightM) : null;
  const summaryA11y = route
    ? t('preview.a11ySummary', {
        duration: spokenDuration(route.durationS * 1000),
        distance: spokenDistance(formatDistance(route.distanceM)),
        name: place.name,
      })
    : place.name;

  // Which note under the trip: what the route did about expressways, or why there is no road route.
  const noteOk = !ROUTING_SUPPORTS_EXCLUDE
    ? copy['preview.carNoteMayUse']
    : allowExpressways || settledRoute?.avoidedMotorways === undefined
      ? copy['preview.carNoteAllowed']
      : settledRoute.avoidedMotorways
        ? copy['preview.carNote']
        : copy['preview.carNoteNoAvoid'];
  const note =
    state.status === 'ok'
      ? noteOk
      : updating
        ? copy['preview.updating']
        : state.status === 'no_route'
          ? // Only point at the switch when it was on "avoid".
            avoidMotorways
            ? copy['preview.noRouteAvoid']
            : copy['preview.noRoute']
          : state.status === 'failed'
            ? copy['preview.routeFailed']
            : state.status === 'locating'
              ? copy['preview.noFix']
              : copy['preview.loading'];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <RoutePreviewMap line={line} me={me} dest={{ ...dest, kind }} padding={padding} faded={updating} />

      {offline ? (
        <View
          onLayout={(e) => setBannerLayoutH(e.nativeEvent.layout.height)}
          style={[styles.topBanner, { paddingTop: insets.top, backgroundColor: statusColors('offline').bg }]}>
          <Banner tone="offline" icon="offline" text={copy['preview.offline']} />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy['preview.a11yBack']}
        onPress={goBack}
        style={[styles.back, { top: backTop, backgroundColor: colors.fabBg }, elevate('e2', scheme)]}>
        <Icon name="back" color={colors.fabIcon} size={28} />
      </Pressable>

      <View pointerEvents="none" style={[styles.attribution, { bottom: panelH + space.sm, backgroundColor: colors.surfaceRaised }]}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.attributionText, { color: colors.text }]}>
          {roadDrawn ? copy['live.attributionRoute'] : copy['live.attribution']}
        </Text>
      </View>

      <View
        onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
        style={[
          styles.panel,
          { backgroundColor: colors.surfaceRaised, paddingBottom: space.lg + insets.bottom },
          elevate('e3', scheme),
        ]}>
        {/* Line 1: the glance. */}
        {state.status === 'ok' || state.status === 'no_route' || state.status === 'failed' ? (
          <View accessible accessibilityLabel={summaryA11y} style={styles.line1}>
            {durationText ? (
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.duration, styles.keep, { color: colors.text }]}>
                {durationText}
              </Text>
            ) : null}
            {distanceText ? (
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[durationText ? styles.distance : styles.duration, styles.shrink, { color: colors.text }]}>
                {durationText
                  ? ` ${t('preview.distanceSpan', { km: distanceText })}`
                  : t('stop.cardDistanceApprox', { km: distanceText })}
              </Text>
            ) : null}
          </View>
        ) : state.status === 'loading' || updating ? (
          <View accessible accessibilityLabel={updating ? copy['preview.updating'] : copy['preview.loading']} style={styles.line1}>
            <Skeleton height={28} width={160} />
          </View>
        ) : (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.placeHeading, { color: colors.text }]}>
            {place.name}
          </Text>
        )}

        {state.status === 'locating' ? null : (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.name, { color: colors.text }]}>
            {place.name}
          </Text>
        )}
        {place.address ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.address, { color: colors.textMuted }]}>
            {place.address}
          </Text>
        ) : null}
        {route ? (
          <Text maxFontSizeMultiplier={1.3} style={[styles.address, fontNumeric, { color: colors.textMuted }]}>
            {t('preview.arrive', { time: formatClockTime(now + route.durationS * 1000) })}
          </Text>
        ) : null}

        <View style={styles.noteRow}>
          <Icon name="alertCircle" color={colors.textMuted} size={16} />
          <Text
            numberOfLines={2}
            accessibilityLiveRegion={updating ? 'polite' : 'none'}
            maxFontSizeMultiplier={1.3}
            style={[styles.note, { color: colors.textMuted }]}>
            {note}
          </Text>
        </View>
        {state.status === 'failed' ? <BigButton label={copy['common.tryAgain']} variant="ghost" onPress={onRetry} /> : null}

        {/* Expressways: off by default (two-wheeler bans), the choice is remembered on this phone. Only shown
            when the router can honour it (flags); the public demo cannot, so it would do nothing. */}
        {ROUTING_SUPPORTS_EXCLUDE ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={allowExpressways ? copy['preview.a11yExpresswaysOn'] : copy['preview.a11yExpresswaysOff']}
            accessibilityState={{ checked: allowExpressways, busy: updating, disabled: going }}
            disabled={going}
            onPress={() => {
              haptic('select');
              track('nav.expressways_toggled', { allowed: !allowExpressways });
              setAllowExpressways(!allowExpressways);
            }}
            style={[styles.switchRow, going && styles.dim]}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.switchLabel, { color: colors.text }]}>
              {copy['preview.allowExpressways']}
            </Text>
            {updating ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
            {/* The state is a word, not only the switch position or colour. */}
            <Text maxFontSizeMultiplier={1.3} style={[styles.stateWord, { color: colors.textMuted }]}>
              {allowExpressways ? copy['preview.expresswaysOn'] : copy['preview.expresswaysOff']}
            </Text>
            {/* The row takes the tap; the native switch only shows the state. */}
            <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Switch
                value={allowExpressways}
                trackColor={{ false: colors.borderStrong, true: colors.brand.primary }}
                thumbColor={colors.surfaceRaised}
              />
            </View>
          </Pressable>
        ) : null}

        <BigButton
          label={going ? copy['preview.starting'] : copy['preview.go']}
          accessibilityLabel={t('preview.goA11y', { name: place.name })}
          icon="navigate"
          prominent
          loading={going}
          disabled={offline}
          onPress={() => void go()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.lg },
  topBanner: { position: 'absolute', top: 0, left: 0, right: 0 },
  back: {
    position: 'absolute',
    left: space.md,
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attribution: {
    position: 'absolute',
    left: space.sm,
    borderRadius: 8,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    opacity: 0.85,
  },
  attributionText: { fontSize: font.xs, fontFamily: family.regular },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.lg,
    gap: space.xs,
  },
  line1: { flexDirection: 'row', alignItems: 'center', minHeight: type.glance.line },
  // 28 bold tabular for the duration; the distance (20 semibold) shrinks first.
  duration: { ...fontNumeric, fontSize: type.glance.size, lineHeight: type.glance.line, fontFamily: family.bold },
  distance: { ...fontNumeric, fontSize: font.lg, lineHeight: type.heading.line, fontFamily: family.semibold },
  keep: { flexShrink: 0 },
  shrink: { flexShrink: 1 },
  placeHeading: { fontSize: font.lg, lineHeight: type.heading.line, fontFamily: family.semibold },
  name: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  address: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingTop: space.xs },
  note: { flex: 1, fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  switchRow: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  dim: { opacity: 0.5 },
  stateWord: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold },
  switchLabel: { flex: 1, fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
});
