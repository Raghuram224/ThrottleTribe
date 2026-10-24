import { router, useFocusEffect, useIsFocused, useLocalSearchParams, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, BackHandler, Keyboard, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Reanimated, { FadeIn, ReduceMotion, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Banner } from '@/components/banner';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { NudgeCard } from '@/components/contacts-nudge-card';
import { EmptyState } from '@/components/empty-state';
import { SearchResultsPanel, SearchSuggestions } from '@/components/home-search-panels';
import { FirstRunSteps, StatsStrip } from '@/components/home-widgets';
import { HomeChips, HomeSearchBar, PlaceBar, SearchInputBar } from '@/components/home-search-bar';
import { HomeSheet } from '@/components/home-sheet';
import { Icon } from '@/components/icon';
import { LocationRow, locationRowVisible } from '@/components/location-row';
import { PlacePanel } from '@/components/place-panel';
import { PlaceResults } from '@/components/place-results';
import { HomeMap } from '@/components/home-map';
import type { MapHandle } from '@/components/map/types';
import type { MapPin, RouteLabelView } from '@/components/plan-map';
import { QuickTiles } from '@/components/quick-tiles';
import { MapCreditPill } from '@/components/map-credit-pill';
import { MapTypeButton } from '@/components/map-type-button';
import { MapTypeSheet } from '@/components/map-type-sheet';
import { RecentPlacesSection } from '@/components/recent-places-section';
import { RecentRidesSection, useRecentRides } from '@/components/recent-rides-section';
import { RideProgressCard } from '@/components/ride-progress-card';
import { RoutesLoadingPill } from '@/components/route-choices';
import { RideView } from '@/components/ride-view/ride-view';
import { StopPickSheet } from '@/components/ride-view/stop-pick-sheet';
import { RoutePanel } from '@/components/route-panel';
import { Sheet } from '@/components/sheet';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { useContactCount } from '@/hooks/use-contact-count';
import { useNetOffline } from '@/hooks/use-connection';
import { useHomeConvoy } from '@/hooks/use-home-convoy';
import { useHomeSearch } from '@/hooks/use-home-search';
import { useNow } from '@/hooks/use-now';
import { usePlanningPosition } from '@/hooks/use-planning-position';
import { usePreviewRoute } from '@/hooks/use-preview-route';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { copy, errorText, t } from '@/lib/copy';
import { DEM_PROVIDER, ROUTING_SUPPORTS_EXCLUDE } from '@/lib/flags';
import { formatElapsed } from '@/lib/format';
import { haversineM, type LatLng } from '@/lib/geo';
import { liveStartView } from '@/lib/live-camera';
import { followPitch } from '@/lib/nav-camera';
import { haptic } from '@/lib/haptics';
import { greetingCopyKey, isGuest, pickNudge, profilePill, profileTodoCount } from '@/lib/home';
import { href } from '@/lib/nav';
import { destKey } from '@/lib/nav-arrival';
import { defaultRideName, displayRideName, firstName } from '@/lib/names';
import { navRideEpoch, pruneNavRides, pruneNavRidesExcept } from '@/lib/nav-rides';
import {
  attributionFade,
  attributionInSheet,
  attributionClear,
  browsePadding,
  chipsTop,
  confirmedSwitch,
  firstRunSeenOnSnap,
  HOME_ME_ZOOM,
  HOME_PLACE_ZOOM,
  homeMapMounted,
  homeSheetBlocks,
  initialCamera,
  isFallbackCamera,
  type PlanCamera,
  initialSheetSnap,
  isFirstRun,
  launchPromptWanted,
  mapTypeTop,
  meSlotForHome,
  type OpenRideLite,
  openRideCard,
  placePadding,
  resultsPanelHeight,
  searchBarTarget,
  searchResultsPadding,
  shouldSaveCamera,
  startStep,
  type CameraIntent,
  type GoingKind,
  type HomeSnap,
  type SheetBlock,
  type StartStep,
} from '@/lib/plan-flow';
import { SEARCH_CHIPS, type Place, type SearchChip } from '@/lib/place-search';
import { fixFresh } from '@/lib/planning-speed';
import { previewFitPoints, previewPadding, resultsFitPoints } from '@/lib/preview-fit';
import { clampRouteIndex, mapRouteViews, routeChoices, routeLabelAnchors } from '@/lib/route-choices';
import { pillLineCount, pillLines } from '@/lib/credits';
import { shownRecents, type RecentPlace } from '@/lib/recent-places';
import { monthStats } from '@/lib/recent-rides';
import { readRideStats } from '@/lib/ride-stats';
import { openLiveRide, resetToRide } from '@/lib/reset-to-ride';
import { onOpenRideInvalidated } from '@/lib/open-ride-signal';
import { currentRideBackState, runRideBack } from '@/lib/ride-back';
import { RIDE_ON_HOME } from '@/lib/ride-on-home';
import { getMyOpenRide, toRideError, type OpenRide } from '@/lib/ride-api';
import { isRideStartBusy } from '@/lib/ride-start';
import { rideHref } from '@/lib/routing';
import { startInviteRide, startNavigationRide, stopKindFor } from '@/lib/solo-nav';
import { startSoloRide } from '@/lib/solo-ride';
import { receiverTakeoverShowing } from '@/lib/sos';
import { track } from '@/lib/telemetry';
import { useLiveUiStore } from '@/store/live-ui-store';
import { useRideViewStore } from '@/store/ride-view-store';
import { readFreshOrigin, useNavStore } from '@/store/nav-store';
import { useNudgeStore } from '@/store/nudge-store';
import type { NavRoute } from '@/lib/nav-route';
import { persistCamera, usePlanStore, type PlanPlace } from '@/store/plan-store';
import { usePrefsStore } from '@/store/prefs-store';
import { useRecentsStore } from '@/store/recents-store';
import { useRideStore } from '@/store/ride-store';
import { useSosStore } from '@/store/sos-store';
import { useSessionStore } from '@/store/session-store';
import { showToast } from '@/store/toast-store';
import { elevate, family, font, motion, radius, size, space, touchTarget } from '@/theme/tokens';
import { statusColors, useTheme } from '@/theme/use-theme';

type ConfirmKind = 'switch' | 'leaderBusy';

const toLite = (o: OpenRide | null): OpenRideLite | null =>
  o ? { id: o.ride.id, status: o.ride.status, role: o.member.role === 'leader' ? 'leader' : 'rider' } : null;

const NO_DEST: LatLng = { lat: 0, lng: 0 };
const NO_ROUTES: NavRoute[] = [];
const NO_VIEWS: ReturnType<typeof mapRouteViews> = [];
const NO_PINS: MapPin[] = [];
const NO_POINTS: LatLng[] = [];

/**
 * Home's map first frame: the saved camera, my fix or India; or, when the map is created with a ride view already asked for
 * (a cold start into the ride, a notification), the live start view (the planning position Home knew, tilted for follow), so
 * the ride never opens on a world frame (audit 27 #2).
 */
function firstFrame(fix: LatLng | null, tilt: boolean): { camera: PlanCamera; pitch: number } {
  const saved = usePlanStore.getState().camera;
  if (RIDE_ON_HOME && useLiveUiStore.getState().viewRideId) {
    const nav = useNavStore.getState();
    const start = liveStartView({ me: fix, bounds: null, planning: nav.origin, planningAt: nav.originAt, now: Date.now(), saved });
    if (start.kind !== 'bounds') {
      return {
        camera: { lat: start.center[1], lng: start.center[0], zoom: start.zoom },
        pitch: start.kind === 'saved' ? 0 : followPitch(tilt),
      };
    }
  }
  return { camera: initialCamera(saved, fix), pitch: 0 };
}

/** The launch location prompt was asked in this app run: one per process, not per Home mount (22 D6). */
let launchPromptAsked = false;

/**
 * Map home (22, 28): one full-screen map, a floating "Where to?" bar, category chips, a thin pull-up strip with the old
 * Home content behind it, and a Search / SOS stack at the bottom right. Four modes share the one map: `browse`, `search`
 * (typing over a solid list, then the results as pins and a bottom list; no screen is pushed), `place` (a searched
 * place's sheet) and `route` (the 21 preview: every route drawn, one primary, Start ride). There is one kind of ride
 * (22 D5): it becomes a group when its code is shared from the live screen. Nothing here creates a ride until Start ride
 * / Just ride is tapped.
 */
export default function Home() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowH, fontScale } = useWindowDimensions();
  const pathname = usePathname();
  const focused = useIsFocused();
  const reduceMotion = useReduceMotion();
  const profile = useSessionStore((s) => s.profile);
  const user = useSessionStore((s) => s.session?.user);
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const offline = useNetOffline();
  const thresholdS = usePrefsStore((s) => s.stopThresholdS);
  const allowExpressways = usePrefsStore((s) => s.allowExpressways);
  const mapLayer = usePrefsStore((s) => s.mapLayer);
  const setMapLayer = usePrefsStore((s) => s.setMapLayer);
  const [mapTypeOpen, setMapTypeOpen] = useState(false);
  // Kept across refetches so the resume card shows the last known ride while offline.
  const [open, setOpen] = useState<OpenRide | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  // Ticks so "Started N min ago" keeps counting and the greeting follows the clock.
  const now = useNow(30_000);

  const mode = usePlanStore((s) => s.mode);
  const place = usePlanStore((s) => s.place);
  const query = usePlanStore((s) => s.query);
  const searchStage = usePlanStore((s) => s.searchStage);
  const sheetSnap = usePlanStore((s) => s.sheetSnap);
  const firstRunSeen = usePlanStore((s) => s.firstRunSeen);
  const searchContext = usePlanStore((s) => s.searchContext);
  // The ride on Home's map (28 §8): the ride view while a ride is asked for here; its stop search is the inline search
  // (the planning scene shows the result pins), and the ride's overlays and layers come back when it closes.
  const viewRideId = useLiveUiStore((s) => s.viewRideId);
  const rideViewId = RIDE_ON_HOME ? viewRideId : null;
  const stopSearchOpen = !!rideViewId && mode === 'search' && searchContext === 'ride-stop';
  const rideViewOn = !!rideViewId && !stopSearchOpen;
  const mapRef = useRef<MapHandle>(null);
  const tilt = usePrefsStore((s) => s.mapTilt);
  // One GL map at a time (22 §4.3): it only exists on Home's own paths.
  const mapOn = homeMapMounted(pathname, RIDE_ON_HOME);

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

  // An active ride IS Home's map (28 §8), from every entry: when Home learns of one (a refetch, a return from another screen)
  // the ride view opens on it. Not for a ride the store already knows has ended or that I left.
  useEffect(() => {
    if (!RIDE_ON_HOME || !open || open.ride.status !== 'active') return;
    const live = useLiveUiStore.getState();
    const rs = useRideStore.getState();
    if (live.viewRideId) return;
    if (rs.rideId === open.ride.id && (rs.ride?.status === 'ended' || (!!rs.myUserId && !!rs.members[rs.myUserId]?.leftAt))) return;
    live.setViewRideId(open.ride.id);
  }, [open]);

  // I left the ride from the ride view: the cached open ride is dropped at once (no stale resume card, Search-stops bar or group
  // SOS), then read again.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useEffect(
    () =>
      onOpenRideInvalidated(() => {
        setOpen(null);
        void refreshRef.current();
      }),
    [],
  );

  const hasRide = !!open;
  const active = open?.ride.status === 'active';
  const openLite = useMemo(() => toLite(open), [open]);
  const card = openRideCard(openLite);
  // A stale place or route is never shown under "Back to ride" (22 §3.10).
  useEffect(() => {
    // Never wipes a stop search in progress (the ride's own inline search).
    if (active && usePlanStore.getState().searchContext !== 'ride-stop') usePlanStore.getState().reset();
  }, [active]);

  const startedMs = open?.ride.started_at ? Date.parse(open.ride.started_at) : NaN;
  // The ride view shows the convoy itself (live channel): Home's REST poll pauses while it is on.
  const convoy = useHomeConvoy(open?.ride.id ?? null, active && !rideViewOn, user?.id ?? null);
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
  // Paused while the ride view is on: background tracking already supplies the ride's fixes (28 §8).
  const { perm, fix, request, servicesEnabled } = usePlanningPosition(!rideViewOn);
  const seedLat = fix?.lat;
  const seedLng = fix?.lng;
  const seed = useMemo(() => (seedLat !== undefined && seedLng !== undefined ? { lat: seedLat, lng: seedLng } : null), [seedLat, seedLng]);
  // No fix for 2 minutes: the marker goes rather than showing a stale "me" (22 §4.4). `now` ticks every 30 s.
  const shownFix = fix && fixFresh(fix.at, now) ? fix : null;
  const me = useMemo(() => (shownFix ? { lat: shownFix.lat, lng: shownFix.lng, accuracyM: shownFix.accuracyM } : null), [shownFix]);
  const [showMeSheet, setShowMeSheet] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  // The inline search (28): the text, chip and results live here, so a place sheet and Back keep them.
  // The place picked in the ride's stop search: the propose-stop sheet (never a place sheet or a route) opens for it.
  const [pickedStop, setPickedStop] = useState<Place | null>(null);
  const hs = useHomeSearch({ mode, stage: searchStage, fix, perm, servicesEnabled, offline, pick: stopSearchOpen ? setPickedStop : null });
  const { search } = hs;

  // ---------------------------------------------------------------- camera
  const [free, setFree] = useState(false);
  const [cmd, setCmd] = useState<{ intent: CameraIntent; nonce: number }>({ intent: { kind: 'none' }, nonce: 0 });
  const [mapFailed, setMapFailed] = useState(false);
  const lastSavedAt = useRef<number | null>(null);
  // The first frame only: the saved camera, my fix, or India.
  const [frame, setFrame] = useState(() => firstFrame(fix, tilt));
  const initial = frame.camera;
  // The map unmounts on ride screens and mounts again on return (22 §4.3): the new one starts at the camera the
  // store holds now (not the first-launch frame), centred again, with no stale intent to replay.
  // The stand-in India view was the first frame (no saved camera, no fix): it is framed in the visible map until a fix or touch.
  // State: a touch ends it for good, and a return from ride screens sets it again only if that frame is the stand-in.
  const [fallbackFirst, setFallbackFirst] = useState(() => isFallbackCamera(frame.camera));
  // Read by `onIdle`, which must not save the framed stand-in as the rider's camera.
  const frameFallbackRef = useRef(false);
  const [mapWasOn, setMapWasOn] = useState(mapOn);
  if (mapOn !== mapWasOn) {
    setMapWasOn(mapOn);
    if (mapOn) {
      const next = firstFrame(fix, tilt);
      setFrame(next);
      setFallbackFirst(isFallbackCamera(next.camera));
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
        // Whatever leaves search (a pick, Back, a ride starting) leaves no keyboard over the next panel.
        if (prev.mode === 'search' && s.mode !== 'search') Keyboard.dismiss();
        if (s.mode === 'browse' && prev.mode !== 'browse') {
          setCmd((c) => ({
            intent: { kind: 'restore', camera: s.camera ?? initialCamera(null, null) },
            nonce: c.nonce + 1,
          }));
        }
      }),
    [],
  );
  // Leaving the ride view: the browse camera comes back, north-up and flat (28 §8). It was kept while the ride view had the
  // map (`HomeMap` never reports a ride camera as the browse one); `free` is left as it was.
  const fixRef = useRef(fix);
  useEffect(() => {
    fixRef.current = fix;
  });
  useEffect(
    () =>
      useLiveUiStore.subscribe((s, prev) => {
        if (prev.viewRideId && !s.viewRideId) {
          // The ride is gone (ended, left): a stop search of it goes with it, never back to Home in search.
          if (usePlanStore.getState().searchContext === 'ride-stop') usePlanStore.getState().reset();
          const camera = usePlanStore.getState().camera ?? initialCamera(null, fixRef.current);
          setCmd((c) => ({ intent: { kind: 'restore', camera }, nonce: c.nonce + 1 }));
        }
      }),
    [],
  );
  const onUserGesture = useCallback(() => {
    // Only a touch in browse mode: a pan in place or route mode leaves `s.camera` null, and Back would restore the unframed view.
    if (usePlanStore.getState().mode === 'browse') {
      setFallbackFirst(false);
      setFree(true);
    }
  }, []);
  const onIdle = useCallback((c: { lat: number; lng: number; zoom: number }) => {
    // Signed out (session expired): the camera is location history, never written again (22 §4.2).
    if (!useSessionStore.getState().session) return;
    // The framed stand-in is not where the rider is: saving it would bring the unframed view back next launch.
    if (frameFallbackRef.current) return;
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
  // The ride's own banners (SOS, approvals) stay over its stop search; otherwise Home's offline banner.
  const rideBannerH = useRideViewStore((s) => s.searchBannerH);
  const bannerH = stopSearchOpen ? rideBannerH : offline && !rideViewId ? bannerLayoutH : 0;
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
  // The chosen route is remembered by identity: new routes (the expressway switch) start on the router's pick again, a
  // rate-limit answer that keeps the old ones keeps the choice too. A new place clears it (below).
  const [chosenRoute, setChosenRoute] = useState<NavRoute | null>(null);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [originKey, setOriginKey] = useState('');
  if (routeKey !== originKey) {
    setOriginKey(routeKey);
    setChosenRoute(null);
    setOrigin(routeKey ? (readFreshOrigin() ?? (fix ? { lat: fix.lat, lng: fix.lng } : null)) : null);
  } else if (routeKey && origin === null && fix) {
    setOrigin({ lat: fix.lat, lng: fix.lng });
  }
  const { state: routeState, retry } = usePreviewRoute(origin, dest, avoidMotorways);
  const routeMe = fix ?? origin;
  const updating = routeState.status === 'updating';
  const routes = useMemo<NavRoute[]>(
    () => (routeState.status === 'ok' || routeState.status === 'updating' ? routeState.routes : NO_ROUTES),
    [routeState],
  );
  const chosenIndex = clampRouteIndex(chosenRoute ? routes.indexOf(chosenRoute) : 0, routes.length);
  const onSelectRoute = useCallback(
    (i: number) => {
      const next = routes[i];
      if (!next) return;
      haptic('select');
      setChosenRoute(next);
    },
    [routes],
  );
  // The preview never draws a straight line (28): while routes load or fail, the map shows the pins only.
  const routeViews = useMemo(() => (mode === 'route' ? mapRouteViews(routes, chosenIndex) : NO_VIEWS), [mode, routes, chosenIndex]);
  const routeLabels = useMemo<RouteLabelView[]>(() => {
    if (mode !== 'route' || routes.length === 0) return [];
    const anchors = routeLabelAnchors(routes);
    // Only the words are used here (the arrive time is the panel's): the clock is not read while rendering.
    const choices = routeChoices(routes, 0);
    return routes.flatMap((_, i) => {
      const at = anchors[i];
      return at ? [{ index: i, lat: at.lat, lng: at.lng, text: choices[i].duration, selected: i === chosenIndex }] : [];
    });
  }, [mode, routes, chosenIndex]);
  const routesLoading = mode === 'route' && (routeState.status === 'loading' || updating);
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
        // A receiver SOS takeover over Home owns Back (its handler is registered later, but this one runs first).
        const ride = useRideStore.getState();
        const sos = useSosStore.getState();
        if (receiverTakeoverShowing(Object.values(ride.members), ride.myUserId, sos.dismissed, sos.cursor)) return false;
        // The ride view steps out inside the map first (stop search, a selected rider, full map, the list, then the view).
        if (runRideBack()) return true;
        // While a ride is active Home's map is the ride view: nothing to step out to, the OS backgrounds the app.
        if (currentRideBackState().rideView) return false;
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

  // Search is inline (28): the plan store switches Home to `search`, no screen is pushed.
  const openSearch = (from: 'bar' | 'chip', chipKey?: SearchChip['key']) => {
    track('home.search_opened', { from });
    usePlanStore.getState().openSearch(chipKey ? { chip: chipKey } : { wantsFocus: true });
  };
  // A started ride opens ON this map (28 §8); a lobby is its own screen.
  const openRide = (r: { id: string; status: OpenRideLite['status'] }) => {
    if (RIDE_ON_HOME && r.status === 'active') openLiveRide(r.id);
    else router.push(href(rideHref(r.id, r.status)));
  };
  // The ride's stop search is the inline search too (28 §8): a pick runs the propose-stop flow instead of opening a place.
  const openStopSearch = useCallback(() => {
    track('home.search_opened', { from: 'ride' });
    usePlanStore.getState().openSearch({ wantsFocus: true }, 'ride-stop');
  }, []);
  // The bar: Where to? normally, the in-ride stop search with a ride in progress.
  const onBar = () => {
    const target = searchBarTarget(openLite);
    if (target.kind !== 'stops') openSearch('bar');
    else if (RIDE_ON_HOME && openLite) {
      openLiveRide(openLite.id);
      openStopSearch();
    } else router.push(href(target.href));
  };

  const openRecent = useCallback((p: Pick<RecentPlace, 'id' | 'name' | 'address' | 'lat' | 'lng' | 'category' | 'source'>) => {
    haptic('select');
    track('home.place_opened', { from: 'recent' });
    usePlanStore.getState().openRoute(p, 'recent');
  }, []);

  const goToOpenRide = () => {
    if (open) openRide({ id: open.ride.id, status: open.ride.status });
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
          // The route the rider chose (the router's pick unless they picked another one).
          kind === 'start' && routeState.status === 'ok' ? { key: destKey(dest), route: routes[chosenIndex] ?? routeState.route } : null,
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
    () => (place && mode !== 'browse' ? { lat: place.lat, lng: place.lng, kind: stopKindFor(place.category), category: place.category } : null),
    [place, mode],
  );
  // Terrain adds its credit as the pill's last line (25 §5.1): the pill is taller, the controls above it rise.
  const terrain = mapLayer === 'terrain';
  const browseKeys = pillLines({ kind: 'plain' }, terrain, DEM_PROVIDER);
  const browseCreditLines = pillLineCount(browseKeys);
  // Place mode names the search provider as well; route mode credits in the panel (24 §4.2), so only Terrain adds a line.
  const overlayKeys = pillLines(mode === 'place' && place ? { kind: 'place', source: place.source } : { kind: 'plain' }, terrain, DEM_PROVIDER);
  const overlayLines = pillLineCount(overlayKeys);
  const frameFallback = fallbackFirst && mode === 'browse' && !free && !fix;
  useEffect(() => {
    frameFallbackRef.current = frameFallback;
  }, [frameFallback]);
  // The results panel is a fixed share of the window, so the camera knows its height before it is laid out.
  const resultsH = resultsPanelHeight(windowH);
  const padding =
    mode === 'browse'
      ? browsePadding({ insetTop: insets.top, bannerH, chipsShown, sheetH, creditLines: browseCreditLines, fontScale })
      : mode === 'search'
        ? searchResultsPadding(insets.top + bannerH, resultsH, overlayLines, fontScale)
        : mode === 'place'
          ? placePadding(insets.top + bannerH, panelH, overlayLines, fontScale)
          : previewPadding(insets.top + bannerH, panelH, overlayLines, fontScale);
  const resultsShown = mode === 'search' && searchStage === 'results';
  const chipDef = search.chip ? SEARCH_CHIPS.find((c) => c.key === search.chip) : undefined;
  const typedText = search.text.trim();
  const searchResultsTitle = chipDef ? copy[chipDef.labelKey] : typedText ? t('homeSearch.resultsFor', { q: typedText }) : copy['homeSearch.noResultsYet'];
  const placeCount = hs.places.length;
  const searchResultsCount =
    search.state.status !== 'results' ? '' : placeCount === 1 ? copy['homeSearch.resultsOne'] : t('homeSearch.resultsCount', { n: placeCount });
  const intent: CameraIntent =
    mode === 'place'
      ? { kind: 'place', zoom: HOME_PLACE_ZOOM }
      : mode === 'route' || resultsShown
        ? { kind: 'fit' }
        : // Typing hides the map behind the list: the camera stays where it is.
          mode === 'search'
          ? { kind: 'none' }
          : cmd.intent;
  const following = mode === 'browse' && !free;
  const planMe = mode === 'route' ? routeMe && { lat: routeMe.lat, lng: routeMe.lng, accuracyM: fix?.accuracyM ?? null } : me;
  // Search results as pins (results stage only); a pick opens the place sheet.
  const searchPlaces = hs.places;
  const pins = useMemo<MapPin[]>(
    () => (resultsShown ? searchPlaces.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, category: p.category })) : NO_PINS),
    [resultsShown, searchPlaces],
  );
  // What a 'fit' frames: every route (the chosen and the grey ones), or every result. Never a straight line.
  const fitPoints = useMemo<LatLng[]>(
    () => (mode === 'route' && place ? previewFitPoints(routes, routeMe, dest) : resultsShown ? resultsFitPoints(pins, me) : NO_POINTS),
    [mode, place, routes, routeMe, dest, resultsShown, pins, me],
  );
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

  // Plain JS: worked out here, because the animated style below runs on the UI thread and can only read values.
  const meClear = attributionClear(browseCreditLines, fontScale);
  const meSlotStyle = useAnimatedStyle(() => ({ bottom: visible.get() + meClear }));
  // The stack rides the strip like the me pill, and fades as the sheet is pulled up (it is gone once expanded).
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
      case 'rideCard':
        if (!open) return null;
        return (
          <Reanimated.View
            key={b}
            entering={animated ? FadeIn.duration(motion.fast).reduceMotion(ReduceMotion.System) : undefined}
            style={styles.card}>
            <RideProgressCard
              variant="full"
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
          <HomeMap
            mapRef={mapRef}
            rideView={rideViewOn}
            initialPitch={frame.pitch}
            me={planMe}
            place={mapPlace}
            routes={routeViews}
            onSelectRoute={onSelectRoute}
            routeLabels={routeLabels}
            faded={updating}
            pins={pins}
            onPinPress={hs.onPinPress}
            fitPoints={fitPoints}
            padding={padding}
            intent={intent}
            intentNonce={cmd.nonce}
            initial={initial}
            frameFallback={frameFallback}
            follow={following && !!me}
            onUserGesture={onUserGesture}
            onIdle={onIdle}
            onMapError={onMapError}
            onMapPress={mode === 'browse' && sheetSnap === 'expanded' ? () => setSnap('peek') : undefined}
          />
        </Reanimated.View>
      ) : null}

      {/* The live ride (28 §8): its header, banners, list, controls and stack over this same map. */}
      {RIDE_ON_HOME && !!rideViewId && mapOn ? (
        <RideView mapRef={mapRef} seed={seed} onSearchStops={openStopSearch} searching={stopSearchOpen} />
      ) : null}

      {/* The ride view has its own top (the header covers the status bar) and its own connection banners. */}
      {mapOn && !offline && !rideViewOn ? <StatusBarScrim /> : null}

      {offline && !rideViewId ? (
        <View
          onLayout={(e) => setBannerLayoutH(e.nativeEvent.layout.height)}
          style={[styles.topBanner, { paddingTop: insets.top, backgroundColor: statusColors('offline').bg }]}>
          <Banner tone="offline" icon="offline" text={copy['homeMap.offline']} />
        </View>
      ) : null}

      {mode === 'browse' && !rideViewOn ? (
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

      {mode === 'search' ? (
        <>
          {/* Typing: a solid list over the map, under the bar and the chips (28). The results stage leaves the map showing. */}
          {searchStage === 'typing' ? (
            <SearchSuggestions top={bannerH} topOffset={chipsTop(insets.top, bannerH) + size.chip + space.md - bannerH} provider={search.provider} typingLocked={hs.locked}>
              <PlaceResults
                state={search.state}
                text={search.text}
                chip={search.chip}
                stillLocating={search.stillLocating}
                servicesOff={servicesEnabled === false}
                retry={search.retry}
                header={<LocationRow perm={perm} servicesEnabled={servicesEnabled} onAllow={() => void request()} />}
                emptyContent={
                  // Recent places would lead to a second ride (22 §3.10): the ride's stop search has none.
                  recentCount > 0 && !stopSearchOpen ? (
                    <RecentPlacesSection me={hs.me} onPick={hs.onPickRecent} onClear={() => setClearOpen(true)} />
                  ) : (
                    <View style={styles.searchEmpty}>
                      <EmptyState icon="mapSearch" title={copy['whereTo.emptyTitle']} body={copy['whereTo.emptyBody']} />
                    </View>
                  )
                }
                onPick={hs.onPick}
              />
            </SearchSuggestions>
          ) : (
            <SearchResultsPanel
              height={resultsH}
              title={searchResultsTitle}
              count={searchResultsCount}
              provider={search.state.status === 'results' ? search.state.provider : search.provider}
              typingLocked={hs.locked}>
              <PlaceResults
                state={search.state}
                text={search.text}
                chip={search.chip}
                stillLocating={search.stillLocating}
                servicesOff={servicesEnabled === false}
                retry={search.retry}
                header={<LocationRow perm={perm} servicesEnabled={servicesEnabled} onAllow={() => void request()} />}
                onPick={hs.onPick}
              />
            </SearchResultsPanel>
          )}
          <SearchInputBar
            top={barTop}
            value={search.text}
            onChangeText={hs.onChangeText}
            onFocus={hs.onFocus}
            onSubmit={hs.onSubmit}
            onClear={hs.onClear}
            onBack={() => {
              Keyboard.dismiss();
              usePlanStore.getState().back();
            }}
            locked={hs.locked}
            autoFocus={hs.autoFocus}
          />
          <HomeChips top={chipsTop(insets.top, bannerH)} onChip={hs.onChip} selected={search.chip} flat={searchStage === 'typing'} />
        </>
      ) : null}

      {mode === 'place' && place ? (
        <PlaceBar
          top={barTop}
          name={place.name}
          onBack={() => usePlanStore.getState().back()}
          // A new search with the text that found the place (the old results come back with Back, from the place sheet).
          onSearchAgain={() => usePlanStore.getState().openSearch({ q: query || place.name, wantsFocus: true })}
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
      {/* Finding routes: the pins only on the map, and this pill level with the back circle (28). */}
      {routesLoading ? <RoutesLoadingPill top={barTop + (touchTarget - 40) / 2} left={space.md + touchTarget + space.sm} /> : null}

      {/* Map type (25 §2.1): under the chips, the place bar, or level with the back circle. Not with the sheet expanded
          (no map to change) or a failed map. */}
      {mapOn && !rideViewOn && !mapFailed && !(mode === 'browse' && sheetSnap === 'expanded') && !(mode === 'search' && searchStage === 'typing') ? (
        <MapTypeButton
          layer={mapLayer}
          onPress={() => {
            haptic('select');
            setMapTypeOpen(true);
          }}
          style={{
            position: 'absolute',
            right: space.md,
            top: mapTypeTop({ mode, insetTop: insets.top, bannerH, chipsShown: mode === 'search' ? true : chipsShown }),
          }}
        />
      ) : null}

      {/* Bottom-left: the one me-slot element (browse), then the attribution, which is never hidden. */}
      {mode === 'browse' && !rideViewOn && meSlot !== 'none' ? (
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
      {mapOn && !rideViewOn ? (
        mode === 'browse' ? (
          attributionInSheet(sheetSnap) ? null : (
            <MapCreditPill animated lines={browseKeys.map((k) => copy[k])} style={attributionStyle} />
          )
        ) : (
          // Place mode names the search provider on a second line; route mode credits in the panel (24 §4.2).
          // The typing stage covers the map: no pill under the list (the credit row is the list's footer).
          mode === 'search' && searchStage === 'typing' ? null : (
            <MapCreditPill style={{ bottom: (mode === 'search' ? resultsH : panelH) + space.sm }} lines={overlayKeys.map((k) => copy[k])} />
          )
        )
      ) : null}

      {mode === 'browse' && !rideViewOn ? (
        <HomeSheet
          snap={sheetSnap}
          onSnapChange={setSnap}
          title={title}
          resume={
            // No "Back to ride" while a ride is active on this map (28 §8): the map is the ride. A lobby ride still has the row.
            blocks.strip === 'resume' && open && !(RIDE_ON_HOME && open.ride.status === 'active')
              ? {
                  label: t('homeMap.stripResume', { ride: displayRideName(open.ride.name) }),
                  a11yLabel: t('homeMap.stripResumeA11y', { ride: displayRideName(open.ride.name) }),
                  onPress: goToOpenRide,
                }
              : undefined
          }
          visible={visible}
          maxHeight={sheetMaxH}
          attribution={mapOn ? browseKeys.map((k) => copy[k]).join('\n') : null}
          onHeights={onHeights}
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
          selected={chosenIndex}
          onSelectRoute={onSelectRoute}
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

      {/* The ride's stop search pick (28 §8): the leader sets the stop, a rider proposes it, a ride of one just goes there. */}
      {rideViewId ? (
        <StopPickSheet
          rideId={rideViewId}
          picked={pickedStop}
          onClose={() => setPickedStop(null)}
          onDone={() => {
            // Back to the ride view; but never undo something else if the rider has moved on meanwhile.
            const st = usePlanStore.getState();
            if (st.mode === 'search' && st.searchContext === 'ride-stop') st.back();
          }}
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
      <MapTypeSheet
        visible={mapTypeOpen}
        onClose={() => setMapTypeOpen(false)}
        layer={mapLayer}
        onChange={(next) => setMapLayer(next, 'home')}
        offline={offline}
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
      // Always a solid surface: a 0.5 opacity let the map show through and dropped the text under 4.5:1. "Finding you" is
      // told apart by its plain text colour (not the accent) and the disabled state, not by fading.
      style={[styles.pill, { backgroundColor: colors.fabBg }, elevate('e2', scheme)]}>
      <Icon name={icon} color={disabled ? colors.text : colors.brandOnBg} size={24} />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.pillText, { color: disabled ? colors.text : colors.brandOnBg }]}>
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
  expanded: { gap: 0 },
  searchEmpty: { paddingHorizontal: space.lg, paddingTop: space.xl },
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
});
