import { router, useFocusEffect, useIsFocused, useLocalSearchParams, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Reanimated, { FadeIn, ReduceMotion, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Banner } from '@/components/banner';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { NudgeCard } from '@/components/contacts-nudge-card';
import { FirstRunSteps, StatsStrip } from '@/components/home-widgets';
import { HomeChips, HomeSearchBar, PlaceBar } from '@/components/home-search-bar';
import { HomeSheet } from '@/components/home-sheet';
import { Icon } from '@/components/icon';
import { LocationRow, locationRowVisible } from '@/components/location-row';
import { PlacePanel } from '@/components/place-panel';
import { PlanMap } from '@/components/plan-map';
import { QuickTiles } from '@/components/quick-tiles';
import { RecentPlacesSection } from '@/components/recent-places-section';
import { RecentRidesSection, useRecentRides } from '@/components/recent-rides-section';
import { RideProgressCard } from '@/components/ride-progress-card';
import { RoutePanel } from '@/components/route-panel';
import { Sheet } from '@/components/sheet';
import { useContactCount } from '@/hooks/use-contact-count';
import { useNetOffline } from '@/hooks/use-connection';
import { useHomeConvoy } from '@/hooks/use-home-convoy';
import { useNow } from '@/hooks/use-now';
import { usePlanningPosition } from '@/hooks/use-planning-position';
import { usePreviewRoute } from '@/hooks/use-preview-route';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { copy, errorText, t } from '@/lib/copy';
import { ROUTING_SUPPORTS_EXCLUDE } from '@/lib/flags';
import { formatElapsed } from '@/lib/format';
import { haversineM, type LatLng } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { greetingCopyKey, isGuest, pickNudge, profilePill, profileTodoCount } from '@/lib/home';
import { href } from '@/lib/nav';
import { destKey } from '@/lib/nav-arrival';
import { defaultRideName, displayRideName, firstName } from '@/lib/names';
import { navRideEpoch, pruneNavRides, pruneNavRidesExcept } from '@/lib/nav-rides';
import {
  attributionFade,
  attributionInSheet,
  ATTRIBUTION_CLEAR,
  browsePadding,
  chipsTop,
  confirmedSwitch,
  firstRunSeenOnSnap,
  HOME_ME_ZOOM,
  HOME_PLACE_ZOOM,
  homeMapMounted,
  homeSheetBlocks,
  initialCamera,
  initialSheetSnap,
  isFirstRun,
  launchPromptWanted,
  meSlotForHome,
  type OpenRideLite,
  openRideCard,
  peekRecentCount,
  placePadding,
  searchBarTarget,
  shouldSaveCamera,
  startStep,
  whereToHref,
  type CameraIntent,
  type GoingKind,
  type HomeSnap,
  type SheetBlock,
  type StartStep,
} from '@/lib/plan-flow';
import { fixFresh } from '@/lib/planning-speed';
import { previewPadding } from '@/lib/preview-fit';
import { shownRecents, type RecentPlace } from '@/lib/recent-places';
import { monthStats } from '@/lib/recent-rides';
import { readRideStats } from '@/lib/ride-stats';
import { resetToRide } from '@/lib/reset-to-ride';
import { getMyOpenRide, toRideError, type OpenRide } from '@/lib/ride-api';
import { isRideStartBusy } from '@/lib/ride-start';
import { rideHref } from '@/lib/routing';
import { startInviteRide, startNavigationRide, stopKindFor } from '@/lib/solo-nav';
import { startSoloRide } from '@/lib/solo-ride';
import { navLineFor } from '@/lib/stop-ui';
import { track } from '@/lib/telemetry';
import { readFreshOrigin, useNavStore } from '@/store/nav-store';
import { useNudgeStore } from '@/store/nudge-store';
import { persistCamera, usePlanStore, type PlanPlace } from '@/store/plan-store';
import { usePrefsStore } from '@/store/prefs-store';
import { useRecentsStore } from '@/store/recents-store';
import { useSessionStore } from '@/store/session-store';
import { showToast } from '@/store/toast-store';
import { elevate, family, font, motion, radius, size, space, touchTarget } from '@/theme/tokens';
import { statusColors, useTheme } from '@/theme/use-theme';

type ConfirmKind = 'switch' | 'leaderBusy';

const toLite = (o: OpenRide | null): OpenRideLite | null =>
  o ? { id: o.ride.id, status: o.ride.status, role: o.member.role === 'leader' ? 'leader' : 'rider' } : null;

const NO_DEST: LatLng = { lat: 0, lng: 0 };

/** The launch location prompt was asked in this app run: one per process, not per Home mount (22 D6). */
let launchPromptAsked = false;

/**
 * Map home (22): one full-screen map, a floating "Where to?" bar, category chips and a bottom sheet with the old
 * Home content. Three modes share the one map: `browse`, `place` (a searched place's sheet) and `route` (the
 * 21 preview with one primary, Start ride). There is one kind of ride (22 D5): it becomes a group when its code
 * is shared from the live screen. Nothing here creates a ride until Start ride / Just ride is tapped.
 */
export default function Home() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const pathname = usePathname();
  const focused = useIsFocused();
  const reduceMotion = useReduceMotion();
  const profile = useSessionStore((s) => s.profile);
  const user = useSessionStore((s) => s.session?.user);
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const offline = useNetOffline();
  const thresholdS = usePrefsStore((s) => s.stopThresholdS);
  const allowExpressways = usePrefsStore((s) => s.allowExpressways);
  // Kept across refetches so the resume card shows the last known ride while offline.
  const [open, setOpen] = useState<OpenRide | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  // Ticks so "Started N min ago" keeps counting and the greeting follows the clock.
  const now = useNow(30_000);

  const mode = usePlanStore((s) => s.mode);
  const place = usePlanStore((s) => s.place);
  const query = usePlanStore((s) => s.query);
  const sheetSnap = usePlanStore((s) => s.sheetSnap);
  const firstRunSeen = usePlanStore((s) => s.firstRunSeen);
  // One GL map at a time (22 §4.3): it only exists on Home's own paths.
  const mapOn = homeMapMounted(pathname);

  const name = profile?.display_name ?? '';
  const first = firstName(name);

  // One nudge at most: emergency contacts first, then saving the account (13 §3).
  const contactCount = useContactCount();
  const dismissed = useNudgeStore((s) => s.dismissed);
  const guest = isGuest(user);
  const nudge = pickNudge({ contacts: contactCount, guest, dismissed });
  const todo = profileTodoCount(contactCount, guest);
  const todoWords = todo === 0 ? '' : todo === 1 ? copy['home.a11yProfileTodoOne'] : t('home.a11yProfileTodo', { n: todo });
  const pill = profilePill(first, todoWords);

  // ---------------------------------------------------------------- the open ride (refetched like before)
  const dataEpoch = useSessionStore((s) => s.dataEpoch);
  const refresh = useCallback(async () => {
    try {
      const epoch = navRideEpoch();
      const fresh = await getMyOpenRide();
      setOpen(fresh);
      // A successful read only (never the offline cache): markers of rides that are not my open ride are of no use
      // (a lobby cancelled from this phone never reaches the recent-rides list below).
      pruneNavRidesExcept(fresh?.ride ?? null, epoch);
    } catch {
      // Offline or failing: keep showing what we have; the tiles explain their own errors.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataEpoch]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const hasRide = !!open;
  const active = open?.ride.status === 'active';
  const openLite = useMemo(() => toLite(open), [open]);
  const card = openRideCard(openLite);
  // A stale place or route is never shown under "Back to ride" (22 §3.10).
  useEffect(() => {
    if (active) usePlanStore.getState().reset();
  }, [active]);

  const startedMs = open?.ride.started_at ? Date.parse(open.ride.started_at) : NaN;
  const convoy = useHomeConvoy(open?.ride.id ?? null, active, user?.id ?? null);
  const { rides, failed } = useRecentRides();
  // Rides that ended while I was elsewhere: their device-local "I navigate this ride" markers are no longer needed.
  useEffect(() => {
    if (rides) pruneNavRides(rides.map((r) => r.id));
  }, [rides]);
  const stats = rides ? monthStats(rides, readRideStats(), now) : null;
  const firstRun = isFirstRun(rides, hasRide);

  // Onboarding hands over `?welcome=1`; greet once, then clear the param so it cannot repeat.
  useEffect(() => {
    if (welcome !== '1' || !name) return;
    showToast(t('home.toastWelcome', { name: first }));
    router.setParams({ welcome: undefined });
  }, [welcome, name, first]);

  // ---------------------------------------------------------------- position (the launch prompt is below; no 1 Hz watch)
  const { perm, fix, request, servicesEnabled } = usePlanningPosition();
  // No fix for 2 minutes: the marker goes rather than showing a stale "me" (22 §4.4). `now` ticks every 30 s.
  const shownFix = fix && fixFresh(fix.at, now) ? fix : null;
  const me = useMemo(() => (shownFix ? { lat: shownFix.lat, lng: shownFix.lng, accuracyM: shownFix.accuracyM } : null), [shownFix]);
  const [showMeSheet, setShowMeSheet] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  // ---------------------------------------------------------------- camera
  const [free, setFree] = useState(false);
  const [cmd, setCmd] = useState<{ intent: CameraIntent; nonce: number }>({ intent: { kind: 'none' }, nonce: 0 });
  const [mapFailed, setMapFailed] = useState(false);
  const lastSavedAt = useRef<number | null>(null);
  // The first frame only: the saved camera, my fix, or India.
  const [initial, setInitial] = useState(() => initialCamera(usePlanStore.getState().camera, fix));
  // The map unmounts on ride screens and mounts again on return (22 §4.3): the new one starts at the camera the
  // store holds now (not the first-launch frame), centred again, with no stale intent to replay.
  const [mapWasOn, setMapWasOn] = useState(mapOn);
  if (mapOn !== mapWasOn) {
    setMapWasOn(mapOn);
    if (mapOn) {
      setInitial(initialCamera(usePlanStore.getState().camera, fix));
      setFree(false);
      setCmd((c) => ({ intent: { kind: 'none' }, nonce: c.nonce + 1 }));
    }
  }

  const recentre = useCallback(() => {
    setFree(false);
    setCmd((c) => ({ intent: { kind: 'me', zoom: HOME_ME_ZOOM }, nonce: c.nonce + 1 }));
  }, []);
  // Back from place / route to browse: the browse camera comes back (22 §4.2).
  useEffect(
    () =>
      usePlanStore.subscribe((s, prev) => {
        if (s.mode === 'browse' && prev.mode !== 'browse') {
          setCmd((c) => ({
            intent: { kind: 'restore', camera: s.camera ?? initialCamera(null, null) },
            nonce: c.nonce + 1,
          }));
        }
      }),
    [],
  );
  const onUserGesture = useCallback(() => {
    if (usePlanStore.getState().mode === 'browse') setFree(true);
  }, []);
  const onIdle = useCallback((c: { lat: number; lng: number; zoom: number }) => {
    // Signed out (session expired): the camera is location history, never written again (22 §4.2).
    if (!useSessionStore.getState().session) return;
    const st = usePlanStore.getState();
    if (st.mode !== 'browse') return;
    st.setCamera(c);
    const t0 = Date.now();
    if (shouldSaveCamera(lastSavedAt.current, t0)) {
      lastSavedAt.current = t0;
      persistCamera();
    }
  }, []);
  const onMapError = useCallback(() => setMapFailed(true), []);

  // ---------------------------------------------------------------- sheet
  const visible = useSharedValue(0);
  const [heights, setHeights] = useState({ peek: 0, expanded: 0 });
  const onHeights = useCallback(
    (h: { peek: number; expanded: number }) => setHeights((p) => (p.peek === h.peek && p.expanded === h.expanded ? p : h)),
    [],
  );
  const setSnap = useCallback(
    (next: HomeSnap) => {
      const st = usePlanStore.getState();
      st.setSheetSnap(next);
      if (firstRunSeenOnSnap(firstRun, st.firstRunSeen, next)) st.markFirstRunSeen();
    },
    [firstRun],
  );
  // First run: the sheet opens expanded once (22 §3.1.2); every other open, and every return, is the peek.
  const firstRunRef = useRef(false);
  useEffect(() => {
    firstRunRef.current = firstRun;
    if (focused && initialSheetSnap(firstRun, firstRunSeen) === 'expanded') usePlanStore.getState().setSheetSnap('expanded');
  }, [focused, firstRun, firstRunSeen]);

  // ---------------------------------------------------------------- banner and floating chrome
  const [bannerLayoutH, setBannerLayoutH] = useState(0);
  const bannerH = offline ? bannerLayoutH : 0;
  const [panelH, setPanelH] = useState(0);
  const barTop = insets.top + bannerH + space.sm;
  const sheetH = sheetSnap === 'expanded' ? heights.expanded : heights.peek;
  const sheetMaxH = windowH - (insets.top + bannerH + 8 + size.searchBar + 8);
  const chipsShown = mode === 'browse' && sheetSnap === 'peek' && card !== 'active';

  // ---------------------------------------------------------------- route mode
  const dest = useMemo(() => (place ? { lat: place.lat, lng: place.lng } : NO_DEST), [place]);
  const avoidMotorways = ROUTING_SUPPORTS_EXCLUDE && !allowExpressways;
  // The route starts where I was when it was asked for: the line does not chase my GPS while I read the
  // screen. A new route takes a fresh start (adjusting state while rendering, as React documents).
  const routeKey = mode === 'route' && place ? place.id : '';
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [originKey, setOriginKey] = useState('');
  if (routeKey !== originKey) {
    setOriginKey(routeKey);
    setOrigin(routeKey ? (readFreshOrigin() ?? (fix ? { lat: fix.lat, lng: fix.lng } : null)) : null);
  } else if (routeKey && origin === null && fix) {
    setOrigin({ lat: fix.lat, lng: fix.lng });
  }
  const { state: routeState, retry } = usePreviewRoute(origin, dest, avoidMotorways);
  const routeMe = fix ?? origin;
  const updating = routeState.status === 'updating';
  const routeLine = useMemo(
    () =>
      mode !== 'route'
        ? null
        : navLineFor({
            route: routeState.status === 'ok' || routeState.status === 'updating' ? routeState.route : null,
            // Loading, no route and a failed fetch all show the dashed straight line (21 §2.3 states).
            straightLine:
              routeMe && routeState.status !== 'ok' && routeState.status !== 'updating' && routeState.status !== 'locating'
                ? [routeMe, dest]
                : [],
          }),
    [mode, routeState, routeMe, dest],
  );
  const roadDrawn = routeState.status === 'ok' || updating;
  const onRetry = () => {
    if (fix) setOrigin({ lat: fix.lat, lng: fix.lng });
    retry();
  };

  // Which action is making the ride (Start ride or Invite riders); the other is blocked meanwhile.
  const [going, setGoing] = useState<GoingKind>(null);
  // State lags a render: a double tap could otherwise get a second start through before `going` is set.
  const goingRef = useRef(false);
  // What the switch / leader-busy sheet was opened for, so the confirmed one runs.
  const pendingKind = useRef<'start' | 'invite'>('start');
  // Just ride is starting (tile). Declared here: the back handler below reads it.
  const soloRef = useRef(false);

  // ---------------------------------------------------------------- back (22 §5.1) and focus
  useFocusEffect(
    useCallback(() => {
      void refresh();
      setMapFailed(false);
      usePlanStore.getState().setSheetSnap(initialSheetSnap(firstRunRef.current, usePlanStore.getState().firstRunSeen));
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        // Android back must not leave while a ride is being started (it would still be created, with no screen waiting).
        if (goingRef.current || soloRef.current) return true;
        return usePlanStore.getState().back();
      });
      return () => {
        sub.remove();
        if (useSessionStore.getState().session) persistCamera();
      };
    }, [refresh]),
  );

  // ---------------------------------------------------------------- actions
  const [soloLoading, setSoloLoading] = useState(false);

  const openSearch = (from: 'bar' | 'chip', chipKey?: string) => {
    track('home.search_opened', { from });
    router.push(href(whereToHref(chipKey ? { chip: chipKey } : { focus: true })));
  };
  const onBar = () => {
    const target = searchBarTarget(openLite);
    if (target.kind === 'stops') router.push(href(target.href));
    else openSearch('bar');
  };

  const openRecent = useCallback((p: Pick<RecentPlace, 'id' | 'name' | 'address' | 'lat' | 'lng' | 'category'>) => {
    haptic('select');
    track('home.place_opened', { from: 'recent' });
    usePlanStore.getState().openRoute(p, 'recent');
  }, []);

  const goToOpenRide = () => {
    if (open) router.push(href(rideHref(open.ride.id, open.ride.status)));
  };

  // Every ride gets the normal default name ("Raghu's ride"): it may be shared, and the name is in the invite text.
  const rideName = defaultRideName(first);

  const justRide = async () => {
    if (soloRef.current) return;
    soloRef.current = true;
    setSoloLoading(true);
    try {
      // A ride with no destination: it opens in the normal view (22 D6), and a stop can be added from the header.
      resetToRide(await startSoloRide(thresholdS, rideName));
    } catch (e) {
      if (!isRideStartBusy(e)) showToast(errorText(toRideError(e).code));
    } finally {
      soloRef.current = false;
      setSoloLoading(false);
    }
  };

  /**
   * Start ride (21 §2.4): create, start and set the stop; Invite riders (22 D6): create in the lobby, set the stop,
   * open the invite screen. Optionally leaving the ride I confirmed leaving. One at a time, shared lock and guard.
   */
  const launch = async (kind: 'start' | 'invite', p: PlanPlace, leaveRideId?: string) => {
    if (goingRef.current || offline) return;
    goingRef.current = true;
    setGoing(kind);
    try {
      const create = kind === 'start' ? startNavigationRide : startInviteRide;
      const start = await create(p, thresholdS, { leaveRideId, rideName });
      if (!start.existing) {
        // Hand the route and the expressway choice to the ride: no second request, same avoidance on reroutes. Not for
        // an invited ride: its lobby may wait minutes and a seed counts as just fetched, so it is fetched at Start.
        useNavStore.getState().startSession(
          start.rideId,
          kind === 'start' && routeState.status === 'ok' ? { key: destKey(dest), route: routeState.route } : null,
          avoidMotorways,
        );
        useRecentsStore.getState().add(p);
        // Navigation starts now only for Start ride; an invited ride starts it when the leader taps Start in the lobby.
        if (kind === 'start') track('nav.started', { from: 'map_home' });
      }
      // A ride was already open: it is opened as it is (never a second one), so the chosen place was not set.
      if (start.existing) showToast(t('preview.existingRide', { name: p.name }));
      haptic('success');
      resetToRide(start.href);
    } catch (e) {
      // The ride was ended again by the start; stay here with the buttons enabled again.
      if (!isRideStartBusy(e)) showToast(errorText(toRideError(e).code));
    } finally {
      goingRef.current = false;
      setGoing(null);
    }
  };

  /** The switch was confirmed on what Home knew; read the open ride again before leaving it (22 §3.4.2). */
  const confirmSwitch = async (confirmedRideId: string) => {
    let fresh: OpenRide | null = open;
    try {
      fresh = await getMyOpenRide();
    } catch {
      // Offline or failing: go on what we know (the start itself will fail the same way if it must).
    }
    const step = confirmedSwitch(confirmedRideId, toLite(fresh));
    if (step.kind === 'go') return run(step);
    // It is not the ride that was confirmed any more: show it as it is. A started ride just shows "Back to ride".
    setOpen(fresh);
    const next = startStep(toLite(fresh));
    if (fresh && fresh.ride.status !== 'active' && next.kind === 'confirm') setConfirm(next.sheet);
  };

  const run = (step: Extract<StartStep, { kind: 'go' }>) => {
    if (place) void launch(pendingKind.current, place, step.leaveRideId);
  };
  const begin = (kind: 'start' | 'invite') => {
    if (goingRef.current) return;
    haptic('select');
    pendingKind.current = kind;
    const step = startStep(openLite);
    if (step.kind === 'confirm') setConfirm(step.sheet);
    else run(step);
  };
  const onStart = () => begin('start');
  const onInvite = () => begin('invite');

  const allowFromRoute = () => {
    if (perm.status === 'denied' && !perm.canAskAgain) void Linking.openSettings().catch(() => {});
    else void request();
  };
  const allowFromSheet = async () => {
    if (await request()) {
      setShowMeSheet(false);
      haptic('success');
      recentre();
    }
  };

  // Ask for location as soon as Home opens while it is still undecided (user decision, 2026-10-15; replaces the
  // spec 22 "no prompt on launch" rule). Once per app process (module flag): after "Don't allow" the OS will not show
  // it again anyway, and the "Show my location" control stays as the way back. Not on web (22 §4.5).
  useEffect(() => {
    // Only while Home is in front: if the permission read resolves under a ride, the prompt waits for the next focus.
    if (!launchPromptWanted({ asked: launchPromptAsked, platform: Platform.OS, status: perm.status, canAskAgain: perm.canAskAgain, focused })) return;
    launchPromptAsked = true;
    void request().then((granted) => {
      if (granted) recentre();
    });
  }, [perm.status, perm.canAskAgain, focused, request, recentre]);

  // ---------------------------------------------------------------- derived view data
  const recents = useRecentsStore((s) => s.recents);
  const recentCount = shownRecents(recents).length;
  const peekN = peekRecentCount(windowH, recentCount);
  const locVisible = locationRowVisible(perm, servicesEnabled);
  const blocks = homeSheetBlocks({
    firstRun,
    openRide: card,
    recentPlaces: recentCount,
    locationGranted: !locVisible,
    hasNudge: !!nudge,
    hasStats: !!stats && !hasRide,
    showRecentRides: !firstRun,
  });
  const meSlot = meSlotForHome({
    permission: perm.status,
    servicesEnabled,
    hasFix: !!shownFix,
    cameraFree: free,
    sheetExpanded: sheetSnap === 'expanded',
  });
  const mapPlace = useMemo(
    () => (place && mode !== 'browse' ? { lat: place.lat, lng: place.lng, kind: stopKindFor(place.category) } : null),
    [place, mode],
  );
  const padding =
    mode === 'browse'
      ? browsePadding({ insetTop: insets.top, bannerH, chipsShown, sheetH })
      : mode === 'place'
        ? placePadding(insets.top + bannerH, panelH)
        : previewPadding(insets.top + bannerH, panelH);
  const intent: CameraIntent =
    mode === 'place' ? { kind: 'place', zoom: HOME_PLACE_ZOOM } : mode === 'route' ? { kind: 'fit' } : cmd.intent;
  const following = mode === 'browse' && !free;
  const planMe = mode === 'route' ? routeMe && { lat: routeMe.lat, lng: routeMe.lng, accuracyM: fix?.accuracyM ?? null } : me;
  const placeDistanceM = place && me ? haversineM(me, place) : null;
  const straightM = place && routeMe ? haversineM(routeMe, place) : null;
  const animated = !reduceMotion && Platform.OS !== 'web';

  const title = firstRun
    ? first
      ? t('home.firstTitle', { name: first })
      : copy['home.firstTitleNoName']
    : t(greetingCopyKey(new Date(now).getHours(), !!first), { name: first });
  const barLabel =
    card === 'active' && open ? t('homeMap.searchStops', { ride: displayRideName(open.ride.name) }) : copy['homeMap.searchPlaceholder'];

  const meSlotStyle = useAnimatedStyle(() => ({ bottom: visible.get() + ATTRIBUTION_CLEAR }));
  // Gone before the sheet reaches the search bar; expanded, the attribution is the sheet's own footer row.
  const peekH = heights.peek;
  const expandedH = heights.expanded;
  const attributionStyle = useAnimatedStyle(() => ({
    bottom: visible.get() + space.sm,
    opacity: 0.85 * attributionFade(visible.get(), peekH, expandedH),
  }));

  const renderBlock = (b: SheetBlock): ReactNode => {
    switch (b) {
      case 'firstSub':
        return (
          <View key={b} style={styles.sub}>
            <AppText variant="caption" muted numberOfLines={2} maxFontSizeMultiplier={1.3}>
              {copy['home.firstSub']}
            </AppText>
          </View>
        );
      case 'tiles':
        return (
          <View key={b} style={styles.tiles}>
            <QuickTiles
              rideLoading={soloLoading}
              onJoin={() => router.push(href('/join'))}
              onRide={() => void justRide()}
            />
          </View>
        );
      case 'recentPeek':
        return <RecentPlacesSection key={b} me={me} header={false} limit={peekN} onPick={openRecent} />;
      case 'rideCard':
        if (!open) return null;
        return (
          <Reanimated.View
            key={b}
            entering={animated ? FadeIn.duration(motion.fast).reduceMotion(ReduceMotion.System) : undefined}
            style={styles.card}>
            <RideProgressCard
              variant={sheetSnap === 'expanded' ? 'full' : 'compact'}
              name={displayRideName(open.ride.name)}
              role={open.member.role === 'leader' ? copy['home.roleLeader'] : copy['home.roleRider']}
              active={active}
              elapsed={active && !Number.isNaN(startedMs) ? formatElapsed(now - startedMs) : ''}
              convoy={convoy}
              onResume={() => {
                haptic('select');
                goToOpenRide();
              }}
            />
          </Reanimated.View>
        );
      case 'recentPlaces':
        return (
          <RecentPlacesSection
            key={b}
            me={me}
            title={copy['homeMap.recentPlaces']}
            skip={blocks.peek.includes('recentPeek') ? peekN : 0}
            onPick={openRecent}
            onClear={() => setClearOpen(true)}
          />
        );
      case 'locationRow':
        return (
          <LocationRow
            key={b}
            perm={perm}
            servicesEnabled={servicesEnabled}
            divider={false}
            title={copy['homeMap.locTitle']}
            body={copy['homeMap.locBody']}
            onAllow={() => void request()}
          />
        );
      case 'steps':
        return (
          <View key={b} style={styles.block}>
            <FirstRunSteps />
          </View>
        );
      case 'nudge':
        return nudge ? (
          <View key={b} style={styles.block}>
            <NudgeCard kind={nudge} />
          </View>
        ) : null;
      case 'stats':
        return stats ? (
          <View key={b} style={styles.block}>
            <StatsStrip stats={stats} />
          </View>
        ) : null;
      case 'recentRides':
        return (
          <View key={b} style={styles.block}>
            <RecentRidesSection rides={rides} failed={failed} />
          </View>
        );
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {mapOn ? (
        <Reanimated.View
          style={StyleSheet.absoluteFill}
          entering={animated ? FadeIn.duration(motion.fast).reduceMotion(ReduceMotion.System) : undefined}>
          <PlanMap
            me={planMe}
            place={mapPlace}
            line={routeLine}
            faded={updating}
            padding={padding}
            intent={intent}
            intentNonce={cmd.nonce}
            initial={initial}
            follow={following && !!me}
            onUserGesture={onUserGesture}
            onIdle={onIdle}
            onMapError={onMapError}
            onMapPress={mode === 'browse' && sheetSnap === 'expanded' ? () => setSnap('peek') : undefined}
          />
        </Reanimated.View>
      ) : null}

      {offline ? (
        <View
          onLayout={(e) => setBannerLayoutH(e.nativeEvent.layout.height)}
          style={[styles.topBanner, { paddingTop: insets.top, backgroundColor: statusColors('offline').bg }]}>
          <Banner tone="offline" icon="offline" text={copy['homeMap.offline']} />
        </View>
      ) : null}

      {mode === 'browse' ? (
        <>
          <HomeSearchBar
            top={barTop}
            label={barLabel}
            a11yLabel={card === 'active' ? barLabel : copy['homeMap.searchA11y']}
            onPress={onBar}
            avatar={{ name, todo, a11yLabel: pill.label, onPress: () => router.push(href('/profile')) }}
          />
          {chipsShown ? <HomeChips top={chipsTop(insets.top, bannerH)} onChip={(key) => openSearch('chip', key)} /> : null}
          {mapFailed ? (
            <View
              pointerEvents="none"
              style={[styles.failed, { top: chipsTop(insets.top, bannerH) + (chipsShown ? size.chip + space.xl : space.sm) }]}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.failedText, { color: colors.textMuted }]}>
                {copy['homeMap.mapFailed']}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      {mode === 'place' && place ? (
        <PlaceBar
          top={barTop}
          name={place.name}
          onBack={() => usePlanStore.getState().back()}
          onSearchAgain={() => router.push(href(whereToHref({ q: query || place.name })))}
        />
      ) : null}

      {mode === 'route' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy['preview.a11yBack']}
          onPress={() => {
            if (goingRef.current) return;
            haptic('select');
            usePlanStore.getState().back();
          }}
          style={[styles.back, { top: barTop, backgroundColor: colors.fabBg }, elevate('e2', scheme)]}>
          <Icon name="back" color={colors.fabIcon} size={28} />
        </Pressable>
      ) : null}

      {/* Bottom-left: the one me-slot element (browse), then the attribution, which is never hidden. */}
      {mode === 'browse' && meSlot !== 'none' ? (
        <Reanimated.View style={[styles.meSlot, meSlotStyle]}>
          <MeSlotPill
            kind={meSlot}
            onPress={() => {
              haptic('select');
              if (meSlot === 'recentre') {
                track('map.recentre', { screen: 'home' });
                recentre();
              } else if (meSlot === 'show') setShowMeSheet(true);
            }}
          />
        </Reanimated.View>
      ) : null}
      {mapOn ? (
        mode === 'browse' ? (
          attributionInSheet(sheetSnap) ? null : (
            <Reanimated.View pointerEvents="none" style={[styles.attribution, { backgroundColor: colors.surfaceRaised }, attributionStyle]}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.attributionText, { color: colors.text }]}>
                {copy['live.attribution']}
              </Text>
            </Reanimated.View>
          )
        ) : (
          <View pointerEvents="none" style={[styles.attribution, { bottom: panelH + space.sm, backgroundColor: colors.surfaceRaised }]}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.attributionText, { color: colors.text }]}>
              {roadDrawn ? copy['live.attributionRoute'] : copy['live.attribution']}
            </Text>
          </View>
        )
      ) : null}

      {mode === 'browse' ? (
        <HomeSheet
          snap={sheetSnap}
          onSnapChange={setSnap}
          title={title}
          visible={visible}
          maxHeight={sheetMaxH}
          attribution={mapOn ? copy['live.attribution'] : null}
          onHeights={onHeights}
          peek={<View style={styles.peek}>{blocks.peek.map(renderBlock)}</View>}
          expanded={<View style={styles.expanded}>{blocks.expanded.map(renderBlock)}</View>}
        />
      ) : null}
      {mode === 'place' && place ? (
        <PlacePanel
          place={place}
          distanceM={placeDistanceM}
          onLayout={setPanelH}
          onClose={() => usePlanStore.getState().back()}
          onEscape={() => void usePlanStore.getState().back()}
          onDirections={() => {
            track('home.directions');
            usePlanStore.getState().openRoute(place, 'search');
          }}
        />
      ) : null}
      {mode === 'route' && place ? (
        <RoutePanel
          place={place}
          state={routeState}
          straightM={straightM}
          avoidMotorways={avoidMotorways}
          offline={offline}
          permission={perm}
          going={going}
          onRetry={onRetry}
          onStart={onStart}
          onInvite={onInvite}
          onAllowLocation={allowFromRoute}
          onEscape={() => {
            if (!goingRef.current) usePlanStore.getState().back();
          }}
          onLayout={setPanelH}
        />
      ) : null}

      <ConfirmSheet
        visible={confirm === 'switch'}
        title={t('home.confirmSwitchTitle', { ride: open ? displayRideName(open.ride.name) : '' })}
        body={t('home.confirmSwitchBody', { ride: open ? displayRideName(open.ride.name) : '' })}
        confirmLabel={copy['home.confirmSwitchConfirm']}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          // The old ride is left only when the new one is really being made.
          if (open) void confirmSwitch(open.ride.id);
        }}
      />
      <ConfirmSheet
        visible={confirm === 'leaderBusy'}
        title={t('home.leaderBusyTitle', { ride: open ? displayRideName(open.ride.name) : '' })}
        body={copy['home.leaderBusyBody']}
        confirmLabel={t('home.leaderBusyAction', { ride: open ? displayRideName(open.ride.name) : '' })}
        tone="primary"
        hideCancel
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          goToOpenRide();
        }}
      />
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
      {/* "Show my location": explains first. The OS prompt comes from the launch prompt above (once per app run) and,
          after a refusal that can be asked again, from this button (rule 8, 04). */}
      <Sheet visible={showMeSheet} onClose={() => setShowMeSheet(false)}>
        <LocationRow
          perm={perm}
          servicesEnabled={servicesEnabled}
          divider={false}
          title={copy['homeMap.locTitle']}
          body={copy['homeMap.locBody']}
          onAllow={() => void allowFromSheet()}
        />
      </Sheet>
    </View>
  );
}

/** The 20 C1 pill: icon + label, 56 tall, `fabBg`, e2. */
function MeSlotPill({ kind, onPress }: { kind: 'recentre' | 'finding' | 'show'; onPress: () => void }) {
  const { colors, scheme } = useTheme();
  const label = kind === 'recentre' ? copy['live.recentre'] : kind === 'finding' ? copy['homeMap.findingYou'] : copy['homeMap.showMe'];
  const icon = kind === 'recentre' ? 'centerMe' : 'permLocation';
  const disabled = kind === 'finding';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={kind === 'recentre' ? copy['live.recentreA11y'] : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: colors.fabBg, opacity: disabled ? 0.5 : 1 }, elevate('e2', scheme)]}>
      <Icon name={icon} color={colors.brandOnBg} size={24} />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.pillText, { color: colors.brandOnBg }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBanner: { position: 'absolute', top: 0, left: 0, right: 0 },
  sub: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  tiles: { paddingTop: space.xs },
  peek: {},
  expanded: { gap: 0 },
  card: { paddingHorizontal: space.lg },
  block: { paddingHorizontal: space.lg, paddingTop: space.lg },
  failed: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  failedText: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular, textAlign: 'center' },
  back: {
    position: 'absolute',
    left: space.md,
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meSlot: { position: 'absolute', left: space.md },
  pill: {
    height: size.mapControl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: font.md, fontFamily: family.semibold },
  attribution: {
    position: 'absolute',
    left: space.sm,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    opacity: 0.85,
  },
  attributionText: { fontSize: font.xs, fontFamily: family.regular },
});
