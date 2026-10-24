import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, ScrollView, useWindowDimensions } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONVOY_STRIP_H } from '@/components/convoy-strip';
import { LiveMeRow, LiveRiderRow, NoFixRow, OffRouteLabel } from '@/components/live-rows';
import type { MapRider } from '@/components/map/ride-layers';
import { useNetOffline } from '@/hooks/use-connection';
import { useNavRide } from '@/hooks/use-nav-ride';
import { useNavRoute } from '@/hooks/use-nav-route';
import { useNow } from '@/hooks/use-now';
import type { RideActions } from '@/hooks/use-ride-actions';
import { announceArrival } from '@/lib/announce-arrival';
import { buildConvoy } from '@/lib/convoy';
import { attributionClear, pillLineCount, pillLines } from '@/lib/credits';
import { DEM_PROVIDER } from '@/lib/flags';
import { shownSpeedKmh } from '@/lib/full-map';
import { haptic } from '@/lib/haptics';
import { applyOrder, buildLiveList, floorToMinute, itemHeight, offsetOf, rowA11y, rowLine1, type LiveItem } from '@/lib/live-list';
import {
  fullMapTopCardH,
  fullMapTopInset,
  mapVisibleHeight,
  navBannerHeight,
  navTopInset,
  panelVariant,
} from '@/lib/live-chrome';
import {
  headerHeight,
  listContentHeight,
  pinnedAlerts,
  resolveSnap,
  sheetCounts,
  snapHeights,
  soloSheet,
  summaryLine,
  withSheetInset,
} from '@/lib/live-sheet';
import { arrivalState, destKey, isArrived, latchStep } from '@/lib/nav-arrival';
import { describeBanner, maneuverAnnouncement } from '@/lib/nav-banner-view';
import { EMPTY_ENGINE, isNavActive, maneuverKey, newestPosition, selectBanner } from '@/lib/nav-engine';
import { engineRemaining } from '@/lib/nav-progress';
import { stopCardText } from '@/lib/nav-route';
import { navSession } from '@/lib/nav-session';
import { sosIsOn } from '@/lib/sos';
import { navLineFor, rideStop, suggestedByName } from '@/lib/stop-ui';
import { toggleVoice } from '@/lib/voice-toggle';
import { useLiveUiStore } from '@/store/live-ui-store';
import { arrivalForRide, useNavStore } from '@/store/nav-store';
import { usePrefsStore } from '@/store/prefs-store';
import { selectStatuses, useRideStore } from '@/store/ride-store';
import { useSosStore } from '@/store/sos-store';
import { space } from '@/theme/tokens';

/** Whole km/h for a row; nothing under 3 km/h or when unknown (like the me row). */
function riderSpeedKmh(mps: number | null | undefined): number | null {
  return mps != null && mps * 3.6 >= 3 ? Math.round(mps * 3.6) : null;
}
/** Keep my row in view only if the list has been left alone this long (06 §4). */
const SCROLL_IDLE_MS = 10_000;
/** Floating SOS in full map (19 B), live screen only: 64 dp circle, bottom-left, clear of the attribution pill. */
export const SOS_FLOAT = 64;
const SOS_FLOAT_BOTTOM = 36;

export interface RideViewParams {
  actions: RideActions;
  /** Height of the whole area the map fills (0 until laid out). */
  areaH: number;
  /**
   * Chrome over the top of that area which the sheet and the camera must clear and which is not part of the map's own
   * area: Home's header and banner stack. 0 on the live screen, whose map starts under its header.
   */
  topChromeH: number;
  /** Added under every sheet height: the navigation-bar inset where the sheet reaches the bottom of the screen (Home). */
  sheetInset: number;
  /** The arrival panel's "Pick next destination": the live screen pushes the stop search, Home opens its inline one. */
  onPickNext: () => void;
  /** The rider list's scroll view, made by the screen that draws it (the model scrolls it to a row). */
  scrollRef: RefObject<ScrollView | null>;
}

/**
 * The live ride's view model (06, 18, 20): the list, the sheet's snaps, the map's riders and next stop, the turn banner,
 * the convoy strip and the camera insets. One body for the live screen (web, and the flag-off native path) and for Home's
 * ride view, so a ride reads the same wherever it is drawn. It draws nothing except the list rows.
 */
export function useRideViewModel({ actions, areaH, topChromeH, sheetInset, onPickNext, scrollRef }: RideViewParams) {
  const { rideId, isLeader, connection, permissions, fixPermission } = actions;

  const ride = useRideStore((s) => s.ride);
  const members = useRideStore((s) => s.members);
  const positions = useRideStore((s) => s.positions);
  const trail = useRideStore((s) => s.leaderTrail);
  const myUserId = useRideStore((s) => s.myUserId);
  const loaded = useRideStore((s) => s.loaded);
  const loadError = useRideStore((s) => s.loadError);
  const storedSnap = usePrefsStore((s) => s.liveSheetSnap);
  const setSnap = usePrefsStore((s) => s.setLiveSheetSnap);
  const selectedUserId = useLiveUiStore((s) => s.selectedUserId);
  const selectNonce = useLiveUiStore((s) => s.selectNonce);
  const phase = useSosStore((s) => s.phase);
  const sosOn = sosIsOn(phase);
  const now = useNow(1000);
  const fullMap = useLiveUiStore((s) => s.fullMap);
  const topStackH = useLiveUiStore((s) => s.topStackH);
  const mapBearing = useLiveUiStore((s) => s.mapBearing);
  const setMapBearing = useLiveUiStore((s) => s.setMapBearing);
  const focusStopNonce = useLiveUiStore((s) => s.focusStopNonce);
  const recentreNonce = useLiveUiStore((s) => s.recentreNonce);
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const netOffline = useNetOffline();

  const [listH, setListH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [frozenKeys, setFrozenKeys] = useState<string[] | null>(null);
  const lastTouchAt = useRef(0);

  // ------------------------------------------------------------ derived model

  const statuses = useMemo(() => selectStatuses({ members, positions, ride }, now), [members, positions, ride, now]);
  const memberList = useMemo(() => Object.values(members), [members]);
  const [levelMemory] = useState(() => new Set<string>());
  const items = useMemo(
    () => buildLiveList({ members: memberList, positions, statuses, trail, myUserId, levelMemory }),
    [memberList, positions, statuses, trail, myUserId, levelMemory],
  );
  const shown = frozenKeys ? applyOrder(items, frozenKeys) : items;
  const orderSig = shown.map((i) => i.key).join('|');
  const shownRef = useRef(shown);
  const listHRef = useRef(listH);
  const contentHRef = useRef(contentH);

  // Next stop (19 A): the ride's shared stop and my own route to it (drawn on this phone only).
  const stop = useMemo(() => rideStop(ride), [ride]);
  const hasStop = !!stop;
  const stopLL = useMemo(() => (stop ? { lat: stop.lat, lng: stop.lng } : null), [stop]);
  const myPos = myUserId ? positions[myUserId] : undefined;
  // My position while navigating is the engine's local 1 Hz fix (21 §3.6); the server echo of my own 5 s sample is
  // the fallback, and whichever is newer wins. The local fix only counts for the stop it is navigating to.
  const engineAll = useNavStore((s) => s.engine);
  const engine = engineAll.key === destKey(stopLL) ? engineAll : EMPTY_ENGINE;
  const remoteT = myPos ? Date.parse(myPos.recordedAt) : NaN;
  const localFix = engine.active ? engine.fix : null;
  const newest = newestPosition(
    localFix,
    myPos ? { lat: myPos.lat, lng: myPos.lng, t: Number.isNaN(remoteT) ? 0 : remoteT } : null,
  );
  const usingLocal = !!localFix && newest === localFix;
  const myLat = newest?.lat;
  const myLng = newest?.lng;
  const meLL = useMemo(() => (myLat != null && myLng != null ? { lat: myLat, lng: myLng } : null), [myLat, myLng]);
  // Solo arrival (21 §2.8): the latch lives in nav-store (and local storage, per ride), so reopening this
  // ride does not arrive again. The stop always goes in, also in a group ride: riders joining or leaving
  // must not reset it. Only the solo variant announces it and shows the panel.
  const activeCount = useMemo(() => Object.values(members).filter((m) => !m.leftAt).length, [members]);
  const variant = panelVariant(loaded, activeCount);
  const arrivalLatch = useNavStore((s) => arrivalForRide(s, rideId));
  const latched = isArrived(arrivalLatch, stopLL);
  const arrived = variant === 'solo' && latched;
  const myAccuracyM = (usingLocal ? localFix?.accuracyM : myPos?.accuracyM) ?? null;
  useEffect(() => {
    if (!loaded) return;
    const prev = arrivalForRide(useNavStore.getState(), rideId);
    const { latch, announce } = latchStep(prev, stopLL, { me: meLL, accuracyM: myAccuracyM }, variant === 'solo');
    if (latch === prev) return;
    useNavStore.getState().setArrival(rideId, latch);
    // Shared claim with the engine: whichever detects the arrival first announces it, the other finds it claimed.
    if (announce && stopLL) announceArrival(rideId, destKey(stopLL));
  }, [loaded, rideId, variant, stopLL, meLL, myAccuracyM]);
  // The expressway choice made on the preview rides along, so reroutes honour it (no preview: the saved preference).
  const sessionAvoid = useNavStore((s) => s.avoidMotorways);
  const allowExpressways = usePrefsStore((s) => s.allowExpressways);
  // Turn-by-turn navigation (21 §2.5): the engine (nav-session, started by the ride session) owns the route and the
  // rerouting; `useNavRoute` keeps its 60 s policy for everyone else (group stop cards). Arrived: no route line and
  // no reroute until the rider picks something (the latch never lets go by itself).
  const rideLive = ride?.status === 'active';
  // This phone navigated THIS stop as the ride's leader (22 D6): the same live read as the ride session.
  const navRide = useNavRide(rideId, stopLL);
  const navActive = isNavActive({
    solo: variant === 'solo',
    leader: isLeader,
    navRide,
    rideLive,
    hasStop,
    arrived: latched,
    engineRunning: isLeader && engine.active,
  });
  const navState = useNavRoute(meLL, navActive || arrived ? null : stopLL, sessionAvoid ?? !allowExpressways);
  const route = navActive ? (engine.prepared?.route ?? null) : navState.route;
  const straightLine = useMemo(
    () => (route || !meLL || !stopLL || arrived ? [] : [meLL, stopLL]),
    [route, meLL, stopLL, arrived],
  );
  const navLine = useMemo(() => navLineFor({ route, straightLine }), [route, straightLine]);
  // A road route drawn adds the LocationIQ credit line to the map pill (24 §4.2), Terrain adds its own (25 §5.1): 40, 56 or
  // 72 of clearance for the me slot and SOS. Mirrors what the map chrome draws.
  const terrainOn = usePrefsStore((s) => s.mapLayer) === 'terrain';
  const creditLineCount = pillLineCount(
    pillLines({ kind: 'live', roadRoute: !!navLine && !navLine.dashed, provider: navLine?.provider }, terrainOn, DEM_PROVIDER),
  );
  const creditClear = attributionClear(creditLineCount, fontScale);
  const sosFloatBottom = creditLineCount > 1 ? creditClear : SOS_FLOAT_BOTTOM;
  // The card never decides arrival itself: solo follows the latch (it stays arrived after riding on), a group
  // ride uses the latch's own rule (within 150 m, fix no worse than 100 m), so card and panel cannot disagree.
  const cardArrived =
    variant === 'solo'
      ? latched
      : !!stopLL && arrivalState('navigating', { me: meLL, accuracyM: myAccuracyM, dest: stopLL }) === 'arrived';
  // While the engine runs, the card says what the banner says: route left and ETA from engine progress (M5).
  const engineLeft =
    navActive && engine.prepared && engine.progress?.joined ? engineRemaining(engine.progress, engine.prepared) : null;
  const stopText =
    stop && stopLL
      ? stopCardText({ name: stop.name, kind: stop.kind, me: meLL, stop: stopLL, route, arrived: cardArrived, remaining: engineLeft })
      : null;
  const suggestedBy = suggestedByName(stop, ride?.leader_id, (id) => members[id]?.name);

  // Sheet model: collapsed keeps up to two alert rows in view; the list below skips them meanwhile.
  const pinned = useMemo(() => pinnedAlerts(shown), [shown]);
  // Solo (20 C4) is decided on load (`variant`, above); until then the group sheet shows skeleton rows.
  // The ScrollView can unmount mid-touch (solo, full map) and never sees the touch end: drop the frozen order
  // (adjusting state during render, not in an effect).
  if (frozenKeys && (variant === 'solo' || fullMap)) setFrozenKeys(null);
  const someoneLeft = memberList.some((m) => m.leftAt);
  // Content-driven heights (20 C6): rows are fixed-height, so the content height is exact and does not
  // breathe with the clock or depend on the current snap.
  const listContentH = useMemo(
    () => listContentHeight({ items: shown, loaded, loadError: !!loadError }),
    [shown, loaded, loadError],
  );
  // The sheet's area: what the map fills below the chrome that is not its own (Home's header and banners).
  const sheetAreaH = Math.max(0, areaH - topChromeH);
  const { heights, snaps } = useMemo(() => {
    const model =
      variant === 'solo'
        ? soloSheet(!!stop, !!loadError, arrived)
        : snapHeights(sheetAreaH, pinned.length, !!stop, listContentH);
    return { heights: withSheetInset(model.heights, sheetInset), snaps: model.snaps };
  }, [variant, sheetAreaH, pinned.length, stop, listContentH, loadError, arrived, sheetInset]);
  // A stored `expanded` that is not available shows as `half`; the pref is left alone.
  const snap = resolveSnap(storedSnap, snaps);
  const collapsed = snap === 'collapsed';
  const visibleListH = Math.max(0, heights[snap] - sheetInset - headerHeight(!!stop));
  const visibleListHRef = useRef(visibleListH);
  useEffect(() => {
    shownRef.current = shown;
    listHRef.current = listH;
    contentHRef.current = contentH;
    visibleListHRef.current = visibleListH;
  });
  const sheetVisible = useSharedValue(0);
  const overlayShift = useDerivedValue(() => -sheetVisible.value);
  // Full map has no sheet: the map controls stay put instead of riding its top edge.
  const noShift = useSharedValue(0);

  const mapRiders = useMemo<MapRider[]>(() => {
    const out: MapRider[] = [];
    for (const m of memberList) {
      const p = positions[m.userId];
      const mine = m.userId === myUserId;
      const local = mine && usingLocal ? localFix : null;
      const src = local
        ? { lat: local.lat, lng: local.lng, heading: local.courseDeg, speedMps: local.speedMps, recordedAtMs: local.t, accuracyM: local.accuracyM }
        : p
          ? { lat: p.lat, lng: p.lng, heading: p.heading, speedMps: p.speedMps, recordedAtMs: Date.parse(p.recordedAt) || null, accuracyM: p.accuracyM }
          : null;
      if (m.leftAt || !src) continue;
      const st = statuses[m.userId];
      out.push({
        userId: m.userId,
        name: m.name,
        colorIndex: m.colorIndex,
        leader: m.role === 'leader',
        status: st?.status ?? 'offline',
        stale: st?.status === 'offline',
        ...src,
        isMe: mine,
      });
    }
    return out;
  }, [memberList, positions, statuses, myUserId, usingLocal, localFix]);

  // Convoy strip (16 §2.1): same relative positions as the list; hidden with < 2 positioned riders.
  const convoy = useMemo(() => {
    const riders = items.flatMap((i) => {
      if (i.kind !== 'rider') return [];
      const m = members[i.userId];
      return m ? [{ userId: i.userId, name: m.name, colorIndex: m.colorIndex, status: i.status, rel: i.rel }] : [];
    });
    const mine = myUserId ? members[myUserId] : undefined;
    return buildConvoy({
      riders,
      me: mine ? { name: mine.name, colorIndex: mine.colorIndex } : null,
      trail,
      positions,
      myUserId,
    });
  }, [items, members, myUserId, trail, positions]);

  // ------------------------------------------------------------ list behaviour

  const scrollToKey = useCallback((key: string) => {
    const list = shownRef.current;
    const idx = list.findIndex((i) => i.key === key);
    if (idx < 0) return;
    const max = Math.max(0, contentHRef.current - listHRef.current);
    // Centre in the part of the list the sheet shows, not in the full-height scroll view.
    const y = offsetOf(list, idx) - (visibleListHRef.current - itemHeight(list[idx])) / 2;
    scrollRef.current?.scrollTo({ y: Math.min(max, Math.max(0, y)), animated: true });
  }, [scrollRef]);

  // Keep my row visible after mount and after each re-sort, unless the rider is scrolling around.
  useEffect(() => {
    if (collapsed || listH === 0) return;
    if (Date.now() - lastTouchAt.current < SCROLL_IDLE_MS) return;
    scrollToKey('me');
  }, [orderSig, collapsed, snap, listH, scrollToKey]);

  // Selection from the map or the alert banner brings the row into view.
  useEffect(() => {
    const id = useLiveUiStore.getState().selectedUserId;
    if (id) scrollToKey(id);
  }, [selectNonce, scrollToKey]);

  const onRowPress = useCallback((userId: string) => {
    haptic('select');
    useLiveUiStore.getState().select(userId);
  }, []);

  const focusStop = useCallback(() => {
    haptic('select');
    useLiveUiStore.getState().focusStop();
  }, []);

  const toggleFullMap = useCallback(() => {
    haptic('select');
    useLiveUiStore.getState().setFullMap(!useLiveUiStore.getState().fullMap);
  }, []);

  // ------------------------------------------------------------ render pieces

  const pinnedKeys = useMemo(() => new Set(pinned.map((p) => p.key)), [pinned]);
  const listItems = collapsed ? shown.filter((i) => !pinnedKeys.has(i.key)) : shown;
  const speedKmh = shownSpeedKmh(usingLocal ? localFix?.speedMps : myPos?.speedMps);
  const summary = loaded ? summaryLine(sheetCounts(shown, sosOn)) : '';
  const sharing = !permissions || (permissions.snapshot.foreground === 'granted' && permissions.servicesEnabled);
  // The turn banner (21 §2.5-2.7): picked from the engine's state, re-evaluated every second (GPS-lost and dead
  // reckoning depend on the clock, which is why `now` is in here and not read inside the engine's render path).
  const banner = useMemo(
    () =>
      selectBanner({
        active: navActive && loaded,
        engine,
        locationOk: sharing,
        netOffline,
        now,
        me: meLL,
        dest: stopLL,
      }),
    [navActive, loaded, engine, sharing, netOffline, now, meLL, stopLL],
  );
  const bannerView = useMemo(
    () => (banner ? describeBanner(banner, { place: stop?.name ?? '', mapBearing }) : null),
    [banner, stop?.name, mapBearing],
  );
  const bannerH = navBannerHeight({ bannerShown: !!banner, thenRow: !!banner?.then });
  // Anything floating over the top of the map must be counted here, or the camera frames me under it
  // (20 C2): in sheet mode the chrome above the area (Home's header and banners), the docked banner (+ Then row) and the
  // convoy strip under it; in full map the status bar / SOS banners plus the banner (which replaces the stop chip) or,
  // without navigation, the chip.
  const fullTop = Math.max(topStackH, insets.top);
  const topInset = fullMap
    ? fullMapTopInset(fullTop, fullMapTopCardH({ navBannerH: bannerH, stopChip: !!stopText }))
    : topChromeH + navTopInset({ navBannerH: bannerH, convoyH: convoy ? CONVOY_STRIP_H : 0 });
  const mapVisH = mapVisibleHeight(areaH, topInset, fullMap ? 0 : heights[snap]);

  // Tap: back to following me, and the current instruction is said again (silent while muted, 21 §2.5).
  const onBannerPress = useCallback(() => {
    haptic('select');
    useLiveUiStore.getState().recentre();
    navSession.repeat();
  }, []);

  const voiceOn = useNavStore((s) => s.voiceOn);
  const onToggleVoice = useCallback(() => {
    haptic('select');
    toggleVoice();
  }, []);
  const voice = useMemo(() => (navActive ? { on: voiceOn, onToggle: onToggleVoice } : null), [navActive, voiceOn, onToggleVoice]);

  // Screen readers hear the new instruction when the maneuver changes (not on every distance tick), only while voice
  // is muted: with voice on the app speaks it itself and nothing is said twice.
  const announceKey = maneuverKey(banner, engine.prepared?.id ?? 0);
  const announceText = maneuverAnnouncement(banner, stop?.name ?? '');
  const announceRef = useRef({ key: announceKey, text: announceText });
  useEffect(() => {
    const prev = announceRef.current.key;
    announceRef.current = { key: announceKey, text: announceText };
    if (voiceOn || !announceKey || !prev || prev === announceKey || !announceText) return;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (on) AccessibilityInfo.announceForAccessibility(announceText);
      })
      .catch(() => {});
  }, [announceKey, announceText, voiceOn]);

  const renderItem = (item: LiveItem): ReactNode => {
    switch (item.kind) {
      case 'me':
        return (
          <LiveMeRow
            key="me"
            speedKmh={speedKmh}
            sharing={sharing}
            sosOn={sosOn}
            onFix={() => void fixPermission('location')}
          />
        );
      case 'label':
        return <OffRouteLabel key="label" />;
      case 'noFix':
        return <NoFixRow key="noFix" />;
      case 'rider': {
        const m = members[item.userId];
        if (!m) return null;
        const hasPosition = !!positions[item.userId];
        const approx = item.status === 'offline' || connection === 'offline';
        const line1 = rowLine1(item.rel, hasPosition, approx);
        const sinceMs = floorToMinute(item.sinceMs);
        return (
          <LiveRiderRow
            key={item.key}
            userId={item.userId}
            name={m.name}
            colorIndex={m.colorIndex}
            leader={m.role === 'leader'}
            status={item.status}
            sinceMs={sinceMs}
            line1={line1.text}
            muted={line1.muted}
            noPosition={!hasPosition}
            speedKmh={riderSpeedKmh(positions[item.userId]?.speedMps)}
            selected={selectedUserId === item.userId}
            a11yLabel={rowA11y({
              name: m.name,
              line1: line1.text,
              hasPosition,
              status: item.status,
              sinceMs,
              leader: m.role === 'leader',
            })}
            onPress={onRowPress}
          />
        );
      }
    }
  };

  /** The rider list's scroll view wiring: touch freezes the order so rows never jump under a finger. */
  const listTouch = {
    onTouchStart: () => {
      lastTouchAt.current = Date.now();
      setFrozenKeys(items.map((i) => i.key));
    },
    onTouchEnd: () => {
      lastTouchAt.current = Date.now();
      setFrozenKeys(null);
    },
    onTouchCancel: () => setFrozenKeys(null),
  };

  return {
    ...actions,
    ride,
    loaded,
    loadError,
    stop,
    hasStop,
    variant,
    arrived,
    navActive,
    navLine,
    stopText,
    suggestedBy,
    someoneLeft,
    pinned,
    heights,
    snaps,
    snap,
    collapsed,
    setSnap,
    sheetVisible,
    overlayShift,
    noShift,
    mapRiders,
    convoy,
    selectedUserId,
    selectNonce,
    setListH,
    setContentH,
    listTouch,
    listItems,
    renderItem,
    sosOn,
    fullMap,
    fullTop,
    insets,
    speedKmh,
    summary,
    banner,
    bannerView,
    bannerH,
    topInset,
    mapVisH,
    mapBearing,
    setMapBearing,
    focusStopNonce,
    recentreNonce,
    trail,
    onBannerPress,
    onRowPress,
    focusStop,
    toggleFullMap,
    pickNext: onPickNext,
    voice,
    voiceOn,
    onToggleVoice,
    creditClear,
    sosFloatBottom,
    /** Bottom padding under the last list row: the unreachable part of the tall sheet, the 8 dp after it, the sheet inset. */
    listPaddingBottom: heights.expanded - heights[snap] + space.sm + sheetInset,
  };
}

export type RideViewModel = ReturnType<typeof useRideViewModel>;
