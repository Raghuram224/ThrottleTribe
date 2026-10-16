import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ArrivalPanel } from '@/components/arrival-panel';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { CONVOY_STRIP_H, ConvoyStrip } from '@/components/convoy-strip';
import { HoldButton } from '@/components/hold-button';
import { Icon, type IconName } from '@/components/icon';
import { LiveSheet } from '@/components/live-sheet';
import { LiveMeRow, LiveRiderRow, LoadErrorRow, NoFixRow, OffRouteLabel, SoloInviteRow } from '@/components/live-rows';
import { rowEnter, rowExit } from '@/components/motion-presets';
import { NavBanner } from '@/components/nav-banner';
import { PressableScale } from '@/components/pressable-scale';
import { RideMap, type MapRider } from '@/components/ride-map';
import { Sheet } from '@/components/sheet';
import { StopCard, StopChip } from '@/components/stop-card';
import { useNetOffline } from '@/hooks/use-connection';
import { useNavRide } from '@/hooks/use-nav-ride';
import { useNavRoute } from '@/hooks/use-nav-route';
import { useNow } from '@/hooks/use-now';
import { useRideActions } from '@/hooks/use-ride-actions';
import { copy, errorText, t } from '@/lib/copy';
import { buildConvoy } from '@/lib/convoy';
import { backAction, shownSpeedKmh } from '@/lib/full-map';
import { haptic } from '@/lib/haptics';
import { href } from '@/lib/nav';
import { announceArrival } from '@/lib/announce-arrival';
import { navSession } from '@/lib/nav-session';
import { toggleVoice } from '@/lib/voice-toggle';
import { arrivalState, destKey, isArrived, latchStep } from '@/lib/nav-arrival';
import { describeBanner, maneuverAnnouncement } from '@/lib/nav-banner-view';
import { EMPTY_ENGINE, isNavActive, maneuverKey, newestPosition, selectBanner } from '@/lib/nav-engine';
import {
  applyOrder,
  buildLiveList,
  floorToMinute,
  itemHeight,
  offsetOf,
  ROW_HEIGHTS,
  rowA11y,
  rowLine1,
  type LiveItem,
} from '@/lib/live-list';
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
} from '@/lib/live-sheet';
import { MESSAGE_KINDS, QUICK_MESSAGE_KINDS, type MessageKind } from '@/lib/message-kinds';
import { cooldownLeft } from '@/lib/quick-message';
import { engineRemaining } from '@/lib/nav-progress';
import { stopCardText } from '@/lib/nav-route';
import { sendMessage, toRideError } from '@/lib/ride-api';
import { sosIsOn } from '@/lib/sos';
import { navLineFor, rideStop, suggestedByName } from '@/lib/stop-ui';
import { useLiveUiStore } from '@/store/live-ui-store';
import { arrivalForRide, useNavStore } from '@/store/nav-store';
import { usePrefsStore } from '@/store/prefs-store';
import { selectStatuses, useRideStore } from '@/store/ride-store';
import { useSosStore } from '@/store/sos-store';
import { showToast } from '@/store/toast-store';
import { elevate, family, font, radius, space, timing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Action bar buttons (16 §2.4). */
const ACTION_H = 64;
/** Floating SOS in full map (19 B): 64 dp circle, bottom-left, clear of the attribution pill. */
const SOS_FLOAT = 64;
const SOS_FLOAT_BOTTOM = 36;
/** "Me" slot (speed bubble / Re-centre) bottom offset from the map overlay: 8 + 20 attribution + 8. */
const ATTRIBUTION_CLEAR = 36;
/** In full map the slot sits above the floating SOS instead. */
const ME_SLOT_BOTTOM_FULL = SOS_FLOAT_BOTTOM + SOS_FLOAT + space.md;


/** Whole km/h for a row; nothing under 3 km/h or when unknown (like the me row). */
function riderSpeedKmh(mps: number | null | undefined): number | null {
  return mps != null && mps * 3.6 >= 3 ? Math.round(mps * 3.6) : null;
}
/** Keep my row in view only if the list has been left alone this long (06 §4). */
const SCROLL_IDLE_MS = 10_000;

/**
 * Live ride (06, 18): full-screen map with a draggable rider sheet above the action bar. Collapsed it
 * shows a summary line plus any SOS / stopped / offline rows; expanded it is the full list.
 */
export default function Live() {
  const { colors, scheme } = useTheme();
  const { rideId, isLeader, connection, permissions, openInvite, fixPermission, requestEnd, requestLeave } = useRideActions();

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
  const setSosHolding = useLiveUiStore((s) => s.setSosHolding);
  const topStackH = useLiveUiStore((s) => s.topStackH);
  const focusStopNonce = useLiveUiStore((s) => s.focusStopNonce);
  const recentreNonce = useLiveUiStore((s) => s.recentreNonce);
  const mapBearing = useLiveUiStore((s) => s.mapBearing);
  const setMapBearing = useLiveUiStore((s) => s.setMapBearing);
  const insets = useSafeAreaInsets();
  const netOffline = useNetOffline();
  // Full map has no sheet: the map controls stay put instead of riding its top edge.
  const noShift = useSharedValue(0);

  const [areaH, setAreaH] = useState(0);
  const [listH, setListH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [msgOpen, setMsgOpen] = useState(false);
  const [sosConfirm, setSosConfirm] = useState<'send' | 'cancel' | null>(null);
  const [cooldowns, setCooldowns] = useState<Partial<Record<MessageKind, number>>>({});
  const [frozenKeys, setFrozenKeys] = useState<string[] | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const lastTouchAt = useRef(0);

  // ------------------------------------------------------------ derived model

  const statuses = useMemo(
    () => selectStatuses({ members, positions, ride }, now),
    [members, positions, ride, now],
  );
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
  // Turn-by-turn navigation (21 §2.5): the engine (nav-session, started by the ride layout) owns the route and the
  // rerouting; `useNavRoute` keeps its 60 s policy for everyone else (group stop cards). Arrived: no route line and
  // no reroute until the rider picks something (the latch never lets go by itself).
  const rideLive = ride?.status === 'active';
  // This phone navigated THIS stop as the ride's leader (22 D6): the same live read as the ride layout.
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
  const { heights, snaps } = useMemo(
    () =>
      variant === 'solo'
        ? soloSheet(!!stop, !!loadError, arrived)
        : snapHeights(areaH, pinned.length, !!stop, listContentH),
    [variant, areaH, pinned.length, stop, listContentH, loadError, arrived],
  );
  // A stored `expanded` that is not available shows as `half`; the pref is left alone.
  const snap = resolveSnap(storedSnap, snaps);
  const collapsed = snap === 'collapsed';
  const visibleListH = Math.max(0, heights[snap] - headerHeight(!!stop));
  const visibleListHRef = useRef(visibleListH);
  useEffect(() => {
    shownRef.current = shown;
    listHRef.current = listH;
    contentHRef.current = contentH;
    visibleListHRef.current = visibleListH;
  });
  const sheetVisible = useSharedValue(0);
  const overlayShift = useDerivedValue(() => -sheetVisible.value);

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
  }, []);

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

  // ------------------------------------------------------------ actions

  const send = async (kind: MessageKind) => {
    setMsgOpen(false);
    setCooldowns((c) => ({ ...c, [kind]: Date.now() }));
    try {
      await sendMessage(rideId, kind);
      haptic('success');
      const { icon, label } = MESSAGE_KINDS[kind];
      showToast(t('live.msgSent', { icon, label }));
    } catch (e) {
      // No offline queue: a stale "Regroup" is worse than none (06 §5).
      setCooldowns((c) => ({ ...c, [kind]: undefined }));
      showToast(errorText(toRideError(e).code));
    }
  };

  const openMsg = () => setMsgOpen(true);

  const confirmSos = () => {
    const which = sosConfirm;
    setSosConfirm(null);
    if (which === 'send') useSosStore.getState().trigger(rideId);
    else if (which === 'cancel') void useSosStore.getState().cancel(rideId);
  };

  // ------------------------------------------------------------ full map

  // Android back leaves full map before it leaves the screen.
  useFocusEffect(
    useCallback(() => {
      if (!fullMap) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (backAction(useLiveUiStore.getState().fullMap) !== 'exit-full-map') return false;
        useLiveUiStore.getState().setFullMap(false);
        return true;
      });
      return () => sub.remove();
    }, [fullMap]),
  );

  const focusStop = useCallback(() => {
    haptic('select');
    useLiveUiStore.getState().focusStop();
  }, []);

  const pickNext = useCallback(() => {
    haptic('select');
    router.push(href(`/ride/${rideId}/search`));
  }, [rideId]);

  const toggleFullMap = useCallback(() => {
    haptic('select');
    useLiveUiStore.getState().setFullMap(!useLiveUiStore.getState().fullMap);
  }, []);

  // ------------------------------------------------------------ render pieces

  const pinnedKeys = useMemo(() => new Set(pinned.map((p) => p.key)), [pinned]);
  const listItems = collapsed ? shown.filter((i) => !pinnedKeys.has(i.key)) : shown;
  const speedKmh = shownSpeedKmh(usingLocal ? localFix?.speedMps : myPos?.speedMps);
  const summary = loaded ? summaryLine(sheetCounts(shown, sosOn)) : '';
  const sharing =
    !permissions || (permissions.snapshot.foreground === 'granted' && permissions.servicesEnabled);
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
  // (20 C2): in sheet mode the docked banner (+ Then row) and the convoy strip under it; in full map the status bar /
  // SOS banners plus the banner (which replaces the stop chip) or, without navigation, the chip.
  const fullTop = Math.max(topStackH, insets.top);
  const topInset = fullMap
    ? fullMapTopInset(fullTop, fullMapTopCardH({ navBannerH: bannerH, stopChip: !!stopText }))
    : navTopInset({ navBannerH: bannerH, convoyH: convoy ? CONVOY_STRIP_H : 0 });
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

  // Same hold behaviour and a11y fallback in the bar and in the floating full-map circle.
  const sosButton = (round?: number) =>
    sosOn ? (
      <HoldButton
        tone="cancel"
        icon="close"
        label={copy['sos.cancelHold']}
        shortLabel={copy['live.sosCancelShort']}
        durationMs={timing.sosCancelHoldMs}
        round={round}
        flex={round ? undefined : 1}
        height={round ? undefined : ACTION_H}
        onComplete={() => void useSosStore.getState().cancel(rideId)}
        onEarlyRelease={() => showToast(copy['sos.holdHint'])}
        onHoldChange={setSosHolding}
        onA11yActivate={() => setSosConfirm('cancel')}
      />
    ) : (
      <HoldButton
        icon="sos"
        label={copy['live.sos']}
        shortLabel={copy['live.sosShort']}
        accessibilityLabel={copy['live.a11ySos']}
        round={round}
        flex={round ? undefined : 1}
        height={round ? undefined : ACTION_H}
        onComplete={() => useSosStore.getState().trigger(rideId)}
        onEarlyRelease={() => showToast(copy['sos.holdHint'])}
        onHoldChange={setSosHolding}
        onA11yActivate={() => setSosConfirm('send')}
      />
    );

  const renderItem = (item: LiveItem) => {
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

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.area} onLayout={(e: LayoutChangeEvent) => setAreaH(e.nativeEvent.layout.height)}>
        <View style={StyleSheet.absoluteFill}>
          {loaded ? (
            <RideMap
              riders={mapRiders}
              trail={trail}
              selectedUserId={selectedUserId}
              focusNonce={selectNonce}
              onSelect={onRowPress}
              onClearSelection={() => useLiveUiStore.getState().clear()}
              topInset={topInset}
              // Full map has no sheet; with the full-height area "me" lands in the lower third.
              bottomInset={fullMap ? 0 : areaH > 0 ? heights[snap] : 0}
              overlayShift={fullMap ? noShift : overlayShift}
              // Never hidden by snap: the mapVisH thresholds (20 C1) already hide them when a tall sheet leaves no room.
              controlsHidden={false}
              mapVisH={mapVisH}
              fullMap={fullMap}
              onToggleFullMap={toggleFullMap}
              overlayBottomInset={fullMap ? insets.bottom : 0}
              speedKmh={speedKmh}
              meSlotBottom={fullMap ? ME_SLOT_BOTTOM_FULL : ATTRIBUTION_CLEAR}
              stop={stop}
              navLine={navLine}
              focusStopNonce={focusStopNonce}
              recentreNonce={recentreNonce}
              onMapBearing={setMapBearing}
              voice={voice}
            />
          ) : (
            <View style={[styles.mapPlaceholder, { backgroundColor: colors.surface }]} />
          )}
        </View>

        {/* Docked turn banner (sheet mode): full-bleed at the top of the live area, convoy strip under it. */}
        {banner && bannerView && !fullMap ? (
          <View style={styles.banner} pointerEvents="box-none">
            <NavBanner view={bannerView} floating={false} onPress={onBannerPress} />
          </View>
        ) : null}

        {convoy && !fullMap ? (
          <View style={[styles.convoy, { top: bannerH }]} pointerEvents="none">
            <ConvoyStrip model={convoy} />
          </View>
        ) : null}

        {/* Full map: the banner replaces the stop chip, floating under the status bar / SOS banners. */}
        {fullMap && banner && bannerView ? (
          <View style={[styles.bannerFloat, { top: fullTop + space.sm }]} pointerEvents="box-none">
            <NavBanner view={bannerView} floating onPress={onBannerPress} />
          </View>
        ) : null}

        {fullMap && !banner && stopText ? (
          <View style={[styles.slot, { top: fullTop + space.sm }]} pointerEvents="box-none">
            {/* Arrived: tapping the chip leaves full map so the arrival panel shows (21 §2.8). */}
            <StopChip line={stopText.text} arrived={stopText.arrived} onPress={arrived ? toggleFullMap : focusStop} />
          </View>
        ) : null}

        {fullMap ? (
          <View style={[styles.floatSos, { bottom: insets.bottom + SOS_FLOAT_BOTTOM }]} pointerEvents="box-none">
            {sosButton(SOS_FLOAT)}
          </View>
        ) : null}

        {areaH > 0 && !fullMap ? (
          <LiveSheet
            snap={snap}
            onSnapChange={setSnap}
            heights={heights}
            snaps={snaps}
            variant={variant}
            visible={sheetVisible}
            summary={summary}
            stopCard={
              stopText && !arrived ? (
                <StopCard parts={stopText} suggestedBy={suggestedBy} onPress={focusStop} />
              ) : undefined
            }
            pinned={pinned.map((p) => renderItem(p))}>
            {variant === 'solo' ? (
              <>
                {loadError ? <LoadErrorRow onRetry={() => void useRideStore.getState().load(rideId)} /> : null}
                {arrived && stop ? (
                  <ArrivalPanel
                    name={stop.name}
                    onPickNext={pickNext}
                    onEnd={isLeader ? requestEnd : requestLeave}
                    leaveInstead={!isLeader}
                  />
                ) : (
                  <SoloInviteRow left={someoneLeft} onPress={openInvite} />
                )}
              </>
            ) : (
              <ScrollView
                ref={scrollRef}
                style={styles.list}
                // The sheet is `expanded` tall and slid down; this keeps the last row reachable at every
                // snap and leaves the 8 dp after it (`snapHeights` fit) at the largest one.
                contentContainerStyle={{ paddingBottom: heights.expanded - heights[snap] + space.sm }}
                onLayout={(e) => setListH(e.nativeEvent.layout.height)}
                onContentSizeChange={(_, h) => setContentH(h)}
                scrollEnabled={!collapsed}
                onTouchStart={() => {
                  lastTouchAt.current = Date.now();
                  // Rows never jump under a finger: hold the order until it lifts.
                  setFrozenKeys(items.map((i) => i.key));
                }}
                onTouchEnd={() => {
                  lastTouchAt.current = Date.now();
                  setFrozenKeys(null);
                }}
                onTouchCancel={() => setFrozenKeys(null)}>
                {loadError ? <LoadErrorRow onRetry={() => void useRideStore.getState().load(rideId)} /> : null}

                {loaded ? (
                  listItems.map(renderItem)
                ) : (
                  <>
                    {[0, 1, 2].map((n) => (
                      <View key={n} style={[styles.skeleton, { backgroundColor: colors.surface }]} />
                    ))}
                  </>
                )}
              </ScrollView>
            )}
          </LiveSheet>
        ) : null}
      </View>

      {fullMap ? null : (
        <View style={[styles.bar, { backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
          {/* Solo has nobody to message. SOS keeps its place in the tree, so a hold in progress survives the re-layout. */}
          {variant === 'solo' ? null : (
            <Animated.View entering={rowEnter} exiting={rowExit}>
              <ActionButton label={copy['live.msg']} icon="message" onPress={openMsg} />
            </Animated.View>
          )}
          {sosButton()}
        </View>
      )}

      <Sheet visible={msgOpen} onClose={() => setMsgOpen(false)}>
        <QuickMessages cooldowns={cooldowns} onPick={(k) => void send(k)} />
      </Sheet>

      <ConfirmSheet
        visible={sosConfirm !== null}
        title={sosConfirm === 'cancel' ? copy['sos.cancelHold'] : copy['sos.a11yConfirm']}
        confirmLabel={sosConfirm === 'cancel' ? copy['sos.cancelHold'] : copy['live.sos']}
        tone={sosConfirm === 'cancel' ? 'primary' : 'danger'}
        onConfirm={confirmSos}
        onCancel={() => setSosConfirm(null)}
      />
    </View>
  );
}

/** Secondary action (Message): tonal, icon over label, no border. Red is reserved for SOS. End ride lives in the menu (16 §2.4). */
const ActionButton = memo(function ActionButton({
  label,
  accessibilityLabel,
  icon,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  icon: IconName;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        // Act first: feedback must never be able to delay or swallow the action.
        onPress();
        haptic('select');
      }}
      style={(pressed) => [styles.action, { backgroundColor: pressed ? colors.surfacePressed : colors.surface }]}>
      <Icon name={icon} color={colors.text} size={24} />
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.actionText, { color: colors.text }]}>
        {label}
      </Text>
    </PressableScale>
  );
});

/** 2x3 grid of one-tap messages (06 §5). A kind is disabled for 10 s after sending. */
function QuickMessages({
  cooldowns,
  onPick,
}: {
  cooldowns: Partial<Record<MessageKind, number>>;
  onPick: (kind: MessageKind) => void;
}) {
  const { colors } = useTheme();
  const now = useNow(1000);
  return (
    <View style={styles.msgSheet}>
      <AppText variant="heading" style={styles.msgTitle}>
        {copy['live.msgTitle']}
      </AppText>
      <View style={styles.grid}>
        {QUICK_MESSAGE_KINDS.map((kind) => {
          const { icon, label } = MESSAGE_KINDS[kind];
          const cooling = cooldownLeft(cooldowns[kind], now) > 0;
          return (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ disabled: cooling }}
              disabled={cooling}
              onPressIn={() => haptic('select')}
              onPress={() => onPick(kind)}
              style={[
                styles.tile,
                { backgroundColor: colors.surface, opacity: cooling ? 0.5 : 1 },
              ]}>
              <Text allowFontScaling={false} style={styles.tileIcon}>
                {icon}
              </Text>
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.tileLabel, { color: colors.text }]}>
                {cooling ? copy['live.msgSentTile'] : label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  area: { flex: 1, overflow: 'hidden' },
  banner: { position: 'absolute', top: 0, left: 0, right: 0 },
  bannerFloat: { position: 'absolute', left: space.sm, right: space.sm },
  convoy: { position: 'absolute', top: 0, left: 0, right: 0 },
  slot: { position: 'absolute', left: space.lg, right: space.lg },
  floatSos: { position: 'absolute', left: space.lg },
  list: { flex: 1 },
  mapPlaceholder: { flex: 1 },
  skeleton: { height: ROW_HEIGHTS.rider, marginHorizontal: space.lg, marginTop: space.sm, borderRadius: radius.md },
  bar: {
    flexDirection: 'row',
    gap: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
    paddingHorizontal: space.lg,
  },
  action: {
    width: 96,
    height: ACTION_H,
    borderRadius: radius.lg,
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: font.xs, lineHeight: 16, fontFamily: family.semibold },
  msgSheet: { gap: space.md },
  msgTitle: { fontFamily: family.semibold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    height: 100,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  tileIcon: { fontSize: 36 },
  tileLabel: { fontSize: font.md, fontFamily: family.semibold },
});
