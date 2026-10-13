import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, BackHandler, Easing, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import ReanimatedView from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { ErrorText } from '@/components/error-text';
import { Icon, type IconName } from '@/components/icon';
import { mapEnter, sheetEnter } from '@/components/motion-presets';
import { PressableScale } from '@/components/pressable-scale';
import { RideLog } from '@/components/ride-log';
import { RiderAvatar } from '@/components/rider-avatar';
import { Skeleton } from '@/components/skeleton';
import { StatRow } from '@/components/stat-row';
import { SummaryRouteMap } from '@/components/summary-route-map';
import { useCountUp } from '@/hooks/use-count-up';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useRideActions } from '@/hooks/use-ride-actions';
import { countUpDistanceText } from '@/lib/count-up';
import { copy, fill, riderCount as riderCountText, t } from '@/lib/copy';
import { formatDistance, formatDuration } from '@/lib/format';
import type { LatLng } from '@/lib/geo';
import { href } from '@/lib/nav';
import { displayRideName, splitNameTag } from '@/lib/names';
import { saddleParts, type StatPart } from '@/lib/recent-rides';
import { fetchAllEvents, fetchMySamples } from '@/lib/ride-api';
import { cacheRideDistance, cacheRideSketch } from '@/lib/ride-stats';
import { buildSketch } from '@/lib/route-sketch';
import {
  averageKmh,
  buildRideLog,
  buildSos,
  buildStops,
  filterSamples,
  formatRideRange,
  leftEarly,
  rideDurationMs,
  summaryShareMessage,
  summaryShareVisible,
  sumDistanceM,
  type SummarySample,
} from '@/lib/summary';
import { useRideStore } from '@/store/ride-store';
import { elevate, elevation, family, font, motion, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const MAP_H = 300;
const SHEET_OVERLAP = 24;

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      log: ReturnType<typeof buildRideLog>;
      sosCount: number;
      distanceM: number | null;
      /** My cleaned samples as a route; null with fewer than two. */
      route: LatLng[] | null;
    };

/** Ride ended (08, 13 §9, 16 §4): route map hero, stats, ride log, riders. Calm, never gamified. */
export default function Summary() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { rideId } = useRideActions();
  const ride = useRideStore((s) => s.ride);
  const members = useRideStore((s) => s.members);
  const myUserId = useRideStore((s) => s.myUserId);
  const startedAt = ride?.started_at ?? null;
  const endedAt = ride?.ended_at ?? null;

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [fitNonce, setFitNonce] = useState(0);
  const [ridersOpen, setRidersOpen] = useState(false);
  const reduce = useReduceMotion();

  const cancelled = !!ride && !ride.started_at;
  const haveRide = !!ride;
  const memberNames = useMemo(
    () => Object.fromEntries(Object.values(members).map((m) => [m.userId, splitNameTag(m.name).base])),
    [members],
  );
  const riderTotal = Object.keys(members).length;

  // Events (all, not just the snapshot's 50) and my samples for the distance and the route.
  useEffect(() => {
    if (!haveRide || cancelled) return;
    let alive = true;
    (async () => {
      try {
        const [events, raw] = await Promise.all([
          fetchAllEvents(rideId),
          // The route and distance are optional: a failed samples query just drops the map.
          fetchMySamples(rideId).catch(() => null),
        ]);
        if (!alive) return;
        const samples: SummarySample[] | null = raw;
        // The route is the cleaned samples the distance is summed from, so map and number agree.
        const clean = samples ? filterSamples(samples) : [];
        const distanceM = samples && samples.length >= 2 ? sumDistanceM(samples) : null;
        // Home -> Recent rides shows this number and the route sketch; it never computes them itself (13 §3).
        if (distanceM !== null) cacheRideDistance(rideId, distanceM);
        if (clean.length >= 2) {
          const sketch = buildSketch(clean);
          if (sketch) cacheRideSketch(rideId, sketch);
        }
        const sos = buildSos(events);
        setLoad({
          status: 'ready',
          log: buildRideLog({
            startedAt,
            endedAt,
            riders: riderTotal,
            stops: buildStops(events, startedAt),
            sos,
            nameOf: (id) => memberNames[id] ?? 'Rider',
            samples,
          }),
          sosCount: sos.length,
          distanceM,
          route: clean.length >= 2 ? clean.map((p) => ({ lat: p.lat, lng: p.lng })) : null,
        });
      } catch {
        if (alive) setLoad({ status: 'error' });
      }
    })();
    return () => {
      alive = false;
    };
    // riderTotal / names only feed the log text; re-running the fetch for them would flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId, haveRide, cancelled, attempt, startedAt, endedAt]);

  // Clear the ride stack, go home, drop the ride's state (08).
  const goHome = useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    router.replace(href('/home'));
    useRideStore.getState().reset();
  }, []);

  // Android back = Back to home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goHome();
      return true;
    });
    return () => sub.remove();
  }, [goHome]);

  const riders = useMemo(
    () =>
      Object.values(members).sort(
        (a, b) =>
          Number(b.role === 'leader') - Number(a.role === 'leader') ||
          Date.parse(a.joinedAt) - Date.parse(b.joinedAt),
      ),
    [members],
  );

  const durationMs = rideDurationMs(startedAt, endedAt);
  const durationText = durationMs !== null ? formatDuration(durationMs) : '—';
  const ready = load.status === 'ready';
  const distanceM = load.status === 'ready' ? load.distanceM : null;
  const route = load.status === 'ready' ? load.route : null;
  const showMap = !cancelled && !!route;
  const early = riders.filter((m) => leftEarly(m.leftAt, endedAt)).length;
  const avg = averageKmh(distanceM, durationMs);

  // Share ride (P1): never after an SOS, never for a cancelled ride. No names, no location.
  const canShare = summaryShareVisible({ cancelled, ready, sosCount: load.status === 'ready' ? load.sosCount : 0 });
  const shareRide = () => {
    void Share.share({
      message: summaryShareMessage({ distanceM, riders: riders.length, durationMs }),
    }).catch(() => {});
  };

  const date = startedAt
    ? new Date(startedAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
    : '';
  const heroMeta = !ride
    ? ''
    : cancelled || !date
      ? displayRideName(ride.name)
      : t('summary.heroMeta', { ride: displayRideName(ride.name), riders: riderCountText(riders.length), date });

  // Location sharing stopped: success tint, check in the "moving" fill (icon + words, not colour alone).
  const stoppedCard = (
    <Card style={{ backgroundColor: colors.successTint }}>
      <View style={styles.stoppedRow}>
        <View style={[styles.check, { backgroundColor: colors.status.moving }]}>
          <Icon name="ready" color={colors.onStatus.moving} size={14} />
        </View>
        <Text maxFontSizeMultiplier={1.3} style={[styles.stopped, { color: colors.text }]}>
          {copy['summary.sharingStopped']}
        </Text>
      </View>
    </Card>
  );

  const retry = (
    <View style={styles.block}>
      <ErrorText>{copy['errors.loadRide']}</ErrorText>
      <BigButton
        label={copy['common.tryAgain']}
        variant="secondary"
        onPress={() => {
          setLoad({ status: 'loading' });
          setAttempt((a) => a + 1);
        }}
      />
    </View>
  );

  const title = ride ? displayRideName(ride.name) : '';
  const range = formatRideRange(startedAt, endedAt);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* The map bleeds under the status bar: the layout's safe-area padding is pulled back out. */}
      <ScrollView style={{ marginTop: -insets.top }} contentContainerStyle={styles.body}>
        {showMap && route ? (
          <ReanimatedView.View entering={mapEnter} style={styles.map}>
            <SummaryRouteMap points={route} fitNonce={fitNonce} />
            <ScrimTop />
            <View style={[styles.floatRow, { top: insets.top + space.sm }]} pointerEvents="box-none">
              <MapButton icon="close" label={copy['summary.a11yClose']} onPress={goHome} />
              <MapButton icon="fitPage" label={copy['summary.a11yFit']} onPress={() => setFitNonce((n) => n + 1)} />
            </View>
          </ReanimatedView.View>
        ) : (
          <View style={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.lg }}>
            <Hero
              cancelled={cancelled}
              meta={heroMeta}
              heroKind={distanceM !== null ? 'distance' : 'duration'}
              loading={!cancelled && load.status === 'loading'}
              distanceM={distanceM}
              durationText={durationText}
            />
          </View>
        )}

        <ReanimatedView.View
          entering={showMap ? sheetEnter : undefined}
          style={[
            styles.sheet,
            showMap && styles.sheetOverlap,
            { backgroundColor: colors.bg },
            showMap ? elevation.e3 : null,
            showMap && scheme === 'dark' ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.edge2 } : null,
          ]}>
          {showMap ? (
            <View style={styles.titles}>
              <View style={styles.labelRow}>
                <Icon name="flag" color={colors.brandOnBg} size={16} />
                <AppText variant="label" maxFontSizeMultiplier={1.3} style={{ color: colors.brandOnBg }}>
                  {copy['summary.titleDone']}
                </AppText>
              </View>
              <AppText variant="title" accessibilityRole="header" maxFontSizeMultiplier={1.3} numberOfLines={2}>
                {title}
              </AppText>
              {range ? (
                <AppText muted numeric maxFontSizeMultiplier={1.3}>
                  {range}
                </AppText>
              ) : null}
            </View>
          ) : null}

          {cancelled ? (
            stoppedCard
          ) : load.status === 'loading' ? (
            <View style={styles.block}>
              <Skeleton height={88} />
              <Skeleton height={160} />
            </View>
          ) : load.status === 'error' ? (
            retry
          ) : (
            <>
              {distanceM !== null ? (
                <Stats distanceM={distanceM} durationMs={durationMs} avg={avg} reduce={reduce} />
              ) : null}
              <RideLog entries={load.log} />
            </>
          )}

          <RidersCard
            riders={riders}
            myUserId={myUserId}
            endedAt={endedAt}
            early={early}
            open={ridersOpen}
            onToggle={() => setRidersOpen((o) => !o)}
          />
        </ReanimatedView.View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
        {canShare ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={copy['summary.share']}
            onPress={shareRide}
            style={(pressed) => [styles.shareBtn, { backgroundColor: pressed ? colors.surfacePressed : colors.surface }]}>
            <Icon name="share" color={colors.text} size={22} />
          </PressableScale>
        ) : null}
        <View style={styles.flex}>
          <BigButton label={copy['summary.home']} onPress={goHome} />
        </View>
      </View>
    </View>
  );
}

/** Stats card: distance (counts up 600 ms), time, average. */
function Stats({
  distanceM,
  durationMs,
  avg,
  reduce,
}: {
  distanceM: number;
  durationMs: number | null;
  avg: number | null;
  reduce: boolean;
}) {
  const progress = useCountUp(true, reduce);
  const [num, unit] = countUpDistanceText(distanceM, progress).split(' ');
  const distParts: StatPart[] = [
    { text: num, unit: false },
    { text: ` ${unit}`, unit: true },
  ];
  const timeParts = durationMs !== null ? saddleParts(durationMs) : [{ text: '—', unit: false }];
  const items = [
    { parts: distParts, label: copy['summary.youRode'], big: true },
    { parts: timeParts, label: copy['summary.time'] },
    ...(avg !== null
      ? [{ parts: [{ text: String(avg), unit: false }, { text: ' km/h', unit: true }], label: copy['summary.average'] }]
      : []),
  ];
  const spoken = t('summary.a11yStats', {
    distance: formatDistance(distanceM),
    duration: durationMs !== null ? formatDuration(durationMs) : 'unknown time',
    speed: avg ?? 0,
  });
  return <StatRow items={items} accessibilityLabel={avg !== null ? spoken : `${formatDistance(distanceM)} you rode`} />;
}

/** 80 dp scrim at the top of the map so the status bar stays legible: bg at 0.9 fading out. */
function ScrimTop() {
  const { colors } = useTheme();
  const bands = [0.9, 0.62, 0.34, 0.12];
  return (
    <View pointerEvents="none" style={styles.scrim}>
      {bands.map((o) => (
        <View key={o} style={{ height: 20, backgroundColor: colors.bg, opacity: o }} />
      ))}
    </View>
  );
}

function MapButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors, scheme } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.mapBtn, { backgroundColor: colors.fabBg }, elevate('e2', scheme)]}>
      <Icon name={icon} color={colors.fabIcon} size={22} />
    </PressableScale>
  );
}

/** Riders card: overlapping avatars, count, "All finished together" / "N left early", expands to the list. */
function RidersCard({
  riders,
  myUserId,
  endedAt,
  early,
  open,
  onToggle,
}: {
  riders: { userId: string; name: string; colorIndex: number; role: 'leader' | 'rider'; leftAt: string | null }[];
  myUserId: string | null;
  endedAt: string | null;
  early: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const shown = riders.slice(0, 5);
  return (
    <Card padding={0} gap={0}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${riderCountText(riders.length)}, ${early === 0 ? copy['summary.ridersAll'] : t('summary.ridersEarly', { n: early })}`}
        onPress={onToggle}
        style={styles.ridersHead}>
        <View style={styles.stack}>
          {shown.map((m, i) => (
            <View key={m.userId} style={{ marginLeft: i === 0 ? 0 : -8 }}>
              <RiderAvatar name={m.name} colorIndex={m.colorIndex} size={32} me={m.userId === myUserId} />
            </View>
          ))}
        </View>
        <View style={styles.flex}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.ridersTitle, { color: colors.text }]}>
            {riderCountText(riders.length)}
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.ridersSub, { color: colors.textMuted }]}>
            {early === 0 ? copy['summary.ridersAll'] : t('summary.ridersEarly', { n: early })}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <Icon name="chevronRight" color={colors.textMuted} size={22} />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.ridersList}>
          {riders.map((m) => (
            <RiderLine
              key={m.userId}
              name={m.name}
              colorIndex={m.colorIndex}
              me={m.userId === myUserId}
              leader={m.role === 'leader'}
              early={leftEarly(m.leftAt, endedAt)}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

interface HeroProps {
  cancelled: boolean;
  meta: string;
  heroKind: 'distance' | 'duration';
  loading: boolean;
  distanceM: number | null;
  durationText: string;
}

/** Brand hero card: icon, title, meta, the big number. Fades in (300 ms); static when Reduce Motion. */
function Hero({ cancelled, meta, heroKind, loading, distanceM, durationText }: HeroProps) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // Reduced: opacity only, short (13 §0.2).
    Animated.timing(fade, {
      toValue: 1,
      duration: reduce ? motion.fast : motion.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fade, reduce]);

  const icon: IconName = cancelled ? 'close' : 'endRide';
  return (
    <Animated.View style={{ opacity: fade }}>
      <Card variant="brand" padding={space.xl} gap={space.xs}>
        {/* 56 tile instead of a 64 glyph: big MDI glyphs read as clip-art (14 §0.5). */}
        <View style={[styles.heroTile, { backgroundColor: colors.brand.primary }]}>
          <Icon name={icon} color={colors.brand.onPrimary} size={28} />
        </View>
        <AppText variant="title" accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.heroTitle}>
          {cancelled ? copy['summary.cancelledTitle'] : copy['summary.titleDone']}
        </AppText>
        <AppText muted maxFontSizeMultiplier={1.3}>
          {meta}
        </AppText>
        {cancelled ? null : loading ? (
          <View style={styles.heroSkeleton}>
            <Skeleton height={font.xxl + space.sm} width={140} />
          </View>
        ) : heroKind === 'distance' && distanceM !== null ? (
          <HeroDistance meters={distanceM} reduce={reduce} />
        ) : (
          <View accessible accessibilityLabel={fill(copy['summary.a11yTile'], { label: copy['summary.duration'], value: durationText })}>
            <AppText numeric numberOfLines={1} adjustsFontSizeToFit style={styles.heroNumber} maxFontSizeMultiplier={1.3}>
              {durationText}
            </AppText>
            <AppText muted maxFontSizeMultiplier={1.3}>
              {copy['summary.duration']}
            </AppText>
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

/** The distance counts up over 600 ms (ease-out, tabular so the width does not jump). */
function HeroDistance({ meters, reduce }: { meters: number; reduce: boolean }) {
  const progress = useCountUp(true, reduce);
  return (
    <View accessible accessibilityLabel={fill(copy['summary.a11yHero'], { distance: formatDistance(meters) })}>
      <AppText numeric numberOfLines={1} adjustsFontSizeToFit style={styles.heroNumber} maxFontSizeMultiplier={1.3}>
        {countUpDistanceText(meters, progress)}
      </AppText>
      <AppText muted maxFontSizeMultiplier={1.3}>
        {copy['summary.heroUnit']}
      </AppText>
    </View>
  );
}

const RiderLine = memo(function RiderLine({
  name,
  colorIndex,
  me,
  leader,
  early,
}: {
  name: string;
  colorIndex: number;
  me: boolean;
  leader: boolean;
  early: boolean;
}) {
  const { colors } = useTheme();
  const { base, tag } = splitNameTag(name);
  return (
    <View style={styles.rider}>
      <RiderAvatar name={name} colorIndex={colorIndex} size={32} me={me} />
      <AppText numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.riderName}>
        {base}
        {tag ? <Text style={{ color: colors.textSubtle, fontFamily: family.regular, fontSize: font.sm }}> {tag}</Text> : null}
        {me ? <Text style={{ color: colors.textMuted, fontFamily: family.regular }}> {copy['lobby.you']}</Text> : null}
      </AppText>
      {leader ? (
        <View style={styles.leaderTag}>
          <Icon name="leader" color={colors.text} size={12} />
          <AppText variant="caption" style={styles.bold}>
            {copy['lobby.leaderTag']}
          </AppText>
        </View>
      ) : null}
      {early ? (
        <AppText variant="caption" style={{ color: colors.textSubtle }}>
          · {copy['summary.leftEarly']}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingBottom: space.lg },
  map: { height: MAP_H, overflow: 'hidden' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  floatRow: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between' },
  mapBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheet: { padding: space.lg, gap: space.lg },
  sheetOverlap: {
    marginTop: -SHEET_OVERLAP,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 20,
  },
  titles: { gap: space.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  heroTile: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { marginTop: space.sm },
  heroNumber: { fontSize: font.xxl, lineHeight: 40, letterSpacing: -0.8, fontFamily: family.bold, marginTop: space.md },
  heroSkeleton: { marginTop: space.md },
  stoppedRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stopped: { fontSize: font.md, fontFamily: family.semibold },
  leaderTag: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  block: { gap: space.sm },
  ridersHead: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  stack: { flexDirection: 'row', alignItems: 'center' },
  ridersTitle: { fontSize: 15, lineHeight: 22, fontFamily: family.semibold },
  ridersSub: { fontSize: 13, lineHeight: 18, fontFamily: family.regular },
  ridersList: { paddingHorizontal: space.md, paddingBottom: space.md },
  rider: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  riderName: { flexShrink: 1, fontFamily: family.semibold },
  bold: { fontFamily: family.bold },
  footer: { padding: space.md, flexDirection: 'row', gap: space.md },
  shareBtn: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
