import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { CONVOY_STRIP_H, ConvoyStrip } from '@/components/convoy-strip';
import { ErrorText } from '@/components/error-text';
import { HoldButton } from '@/components/hold-button';
import { Icon, type IconName } from '@/components/icon';
import { LiveSheet } from '@/components/live-sheet';
import { LiveMeRow, LiveRiderRow, NoFixRow, OffRouteLabel } from '@/components/live-rows';
import { PressableScale } from '@/components/pressable-scale';
import { RideMap, type MapRider } from '@/components/ride-map';
import { SearchPill } from '@/components/search-pill';
import { Sheet } from '@/components/sheet';
import { StopCard, StopChip } from '@/components/stop-card';
import { useNavRoute } from '@/hooks/use-nav-route';
import { useNow } from '@/hooks/use-now';
import { useRideActions } from '@/hooks/use-ride-actions';
import { copy, errorText, t } from '@/lib/copy';
import { buildConvoy } from '@/lib/convoy';
import { backAction, shouldDefaultFullMap, shownSpeedKmh, soloSummaryLine } from '@/lib/full-map';
import { haptic } from '@/lib/haptics';
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
import { headerHeight, pinnedAlerts, sheetCounts, snapHeights, summaryLine } from '@/lib/live-sheet';
import { MESSAGE_KINDS, QUICK_MESSAGE_KINDS, type MessageKind } from '@/lib/message-kinds';
import { cooldownLeft } from '@/lib/quick-message';
import { href } from '@/lib/nav';
import { stopCardText } from '@/lib/nav-route';
import { clearStop, sendMessage, toRideError } from '@/lib/ride-api';
import { sosIsOn } from '@/lib/sos';
import { navLineFor, rideStop, suggestedByName } from '@/lib/stop-ui';
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';
import { useLiveUiStore } from '@/store/live-ui-store';
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
/** Speed bubble bottom offset (from the map overlay): above the attribution, or above the floating SOS. */
const SPEED_BOTTOM = 36;
const SPEED_BOTTOM_FULL = SOS_FLOAT_BOTTOM + SOS_FLOAT + space.md;


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
  const { rideId, isLeader, connection, permissions, openInvite, fixPermission } = useRideActions();

  const ride = useRideStore((s) => s.ride);
  const members = useRideStore((s) => s.members);
  const positions = useRideStore((s) => s.positions);
  const trail = useRideStore((s) => s.leaderTrail);
  const myUserId = useRideStore((s) => s.myUserId);
  const loaded = useRideStore((s) => s.loaded);
  const loadError = useRideStore((s) => s.loadError);
  const snap = usePrefsStore((s) => s.liveSheetSnap);
  const setSnap = usePrefsStore((s) => s.setLiveSheetSnap);
  const selectedUserId = useLiveUiStore((s) => s.selectedUserId);
  const selectNonce = useLiveUiStore((s) => s.selectNonce);
  const phase = useSosStore((s) => s.phase);
  const sosOn = sosIsOn(phase);
  const now = useNow(1000);
  const fullMap = useLiveUiStore((s) => s.fullMap);
  const setFullMap = useLiveUiStore((s) => s.setFullMap);
  const topStackH = useLiveUiStore((s) => s.topStackH);
  const focusStopNonce = useLiveUiStore((s) => s.focusStopNonce);
  const insets = useSafeAreaInsets();
  // Full map has no sheet: the map controls stay put instead of riding its top edge.
  const noShift = useSharedValue(0);

  const [areaH, setAreaH] = useState(0);
  const [listH, setListH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [msgOpen, setMsgOpen] = useState(false);
  const [sosConfirm, setSosConfirm] = useState<'send' | 'cancel' | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
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
  const stopLL = useMemo(() => (stop ? { lat: stop.lat, lng: stop.lng } : null), [stop]);
  const myPos = myUserId ? positions[myUserId] : undefined;
  const myLat = myPos?.lat;
  const myLng = myPos?.lng;
  const meLL = useMemo(() => (myLat != null && myLng != null ? { lat: myLat, lng: myLng } : null), [myLat, myLng]);
  const navState = useNavRoute(meLL, stopLL);
  const navLine = useMemo(
    () => navLineFor({ route: navState.route, straightLine: navState.straightLine }),
    [navState.route, navState.straightLine],
  );
  const stopText = stop && stopLL ? stopCardText({ name: stop.name, kind: stop.kind, me: meLL, stop: stopLL, route: navState.route }) : null;
  const suggestedBy = suggestedByName(stop, ride?.leader_id, (id) => members[id]?.name);

  // Sheet model: collapsed keeps up to two alert rows in view; the list below skips them meanwhile.
  const pinned = useMemo(() => pinnedAlerts(shown), [shown]);
  const heights = useMemo(() => snapHeights(areaH, pinned.length, !!stop), [areaH, pinned.length, stop]);
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
      if (m.leftAt || !p) continue;
      const st = statuses[m.userId];
      out.push({
        userId: m.userId,
        name: m.name,
        colorIndex: m.colorIndex,
        leader: m.role === 'leader',
        status: st?.status ?? 'offline',
        stale: st?.status === 'offline',
        lat: p.lat,
        lng: p.lng,
        heading: p.heading,
        speedMps: p.speedMps,
        recordedAtMs: Date.parse(p.recordedAt) || null,
        accuracyM: p.accuracyM,
        isMe: m.userId === myUserId,
      });
    }
    return out;
  }, [memberList, positions, statuses, myUserId]);

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

  const activeCount = memberList.filter((m) => !m.leftAt).length;

  // A solo ride opens in full map the first time (per ride id, not global); after that the rider's choice stands.
  useEffect(() => {
    if (!loaded || !rideId) return;
    const seen = readItem(STORAGE_KEYS.soloFullMapSeen);
    if (seen === rideId) return;
    writeItem(STORAGE_KEYS.soloFullMapSeen, rideId);
    if (shouldDefaultFullMap({ activeMembers: activeCount, rideId, seenRideId: seen })) setFullMap(true);
  }, [loaded, rideId, activeCount, setFullMap]);

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
  const openSearch = useCallback(() => {
    router.push(href(`/ride/${rideId}/search`));
  }, [rideId]);
  const doClearStop = async () => {
    setClearing(true);
    try {
      await clearStop(rideId);
    } catch (e) {
      showToast(errorText(toRideError(e).code));
    } finally {
      setClearing(false);
      setClearConfirm(false);
    }
  };

  const toggleFullMap = useCallback(() => {
    haptic('select');
    useLiveUiStore.getState().setFullMap(!useLiveUiStore.getState().fullMap);
  }, []);

  // ------------------------------------------------------------ render pieces

  const pinnedKeys = useMemo(() => new Set(pinned.map((p) => p.key)), [pinned]);
  const listItems = collapsed ? shown.filter((i) => !pinnedKeys.has(i.key)) : shown;
  const speedKmh = shownSpeedKmh(myPos?.speedMps);
  const alone = loaded && activeCount <= 1;
  // Solo (19 C): "Solo ride · 42 km/h". My own SOS keeps the regular line so the SOS count stays visible.
  const summary = !loaded
    ? ''
    : alone && !sosOn
      ? soloSummaryLine(speedKmh)
      : summaryLine(sheetCounts(shown, sosOn));
  const topInset = convoy ? CONVOY_STRIP_H : 0;
  // Full map: the map runs under the status bar; overlays clear it and any floating SOS banners.
  const fullTop = Math.max(topStackH, insets.top);
  const sharing =
    !permissions || (permissions.snapshot.foreground === 'granted' && permissions.servicesEnabled);

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
              topInset={fullMap ? fullTop : topInset}
              // Full map has no sheet; with the full-height area "me" lands in the lower third.
              bottomInset={fullMap ? 0 : areaH > 0 ? heights[snap] : 0}
              overlayShift={fullMap ? noShift : overlayShift}
              controlsHidden={!fullMap && snap === 'expanded'}
              fullMap={fullMap}
              onToggleFullMap={toggleFullMap}
              overlayBottomInset={fullMap ? insets.bottom : 0}
              speedKmh={speedKmh}
              speedBubbleBottom={fullMap ? SPEED_BOTTOM_FULL : SPEED_BOTTOM}
              stop={stop}
              navLine={navLine}
              focusStopNonce={focusStopNonce}
            />
          ) : (
            <View style={[styles.mapPlaceholder, { backgroundColor: colors.surface }]} />
          )}
        </View>

        {convoy && !fullMap ? (
          <View style={styles.convoy} pointerEvents="none">
            <ConvoyStrip model={convoy} />
          </View>
        ) : null}

        {!fullMap && snap !== 'expanded' ? (
          <View style={[styles.slot, { top: topInset + space.sm }]} pointerEvents="box-none">
            <SearchPill onPress={openSearch} hintNoStop={isLeader && !stop} />
          </View>
        ) : null}

        {fullMap && stopText ? (
          <View style={[styles.slot, { top: fullTop + space.sm }]} pointerEvents="box-none">
            <StopChip line={stopText.text} arrived={stopText.arrived} onPress={focusStop} />
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
            visible={sheetVisible}
            summary={summary}
            stopCard={
              stopText ? (
                <StopCard
                  line={stopText.text}
                  arrived={stopText.arrived}
                  suggestedBy={suggestedBy}
                  onPress={focusStop}
                  onClear={isLeader ? () => setClearConfirm(true) : undefined}
                />
              ) : undefined
            }
            pinned={pinned.map((p) => renderItem(p))}>
            <ScrollView
              ref={scrollRef}
              style={styles.list}
              contentContainerStyle={{ paddingBottom: heights.expanded - heights[snap] + space.lg }}
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
              {loadError ? (
                <View style={[styles.error, { borderBottomColor: colors.border }]}>
                  <ErrorText>{copy['errors.loadRide']}</ErrorText>
                  <BigButton
                    label={copy['common.tryAgain']}
                    variant="secondary"
                    onPress={() => void useRideStore.getState().load(rideId)}
                  />
                </View>
              ) : null}

              {loaded ? (
                listItems.map(renderItem)
              ) : (
                <>
                  {[0, 1, 2].map((n) => (
                    <View key={n} style={[styles.skeleton, { backgroundColor: colors.surface }]} />
                  ))}
                </>
              )}

              {alone ? (
                <View style={styles.alone}>
                  <BigButton label={copy['invite.cta']} variant="secondary" icon="invite" onPress={openInvite} />
                </View>
              ) : null}
            </ScrollView>
          </LiveSheet>
        ) : null}
      </View>

      {fullMap ? null : (
        <View style={[styles.bar, { backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
          <ActionButton label={copy['live.msg']} icon="message" onPress={openMsg} />
          {sosButton()}
        </View>
      )}

      <Sheet visible={msgOpen} onClose={() => setMsgOpen(false)}>
        <QuickMessages cooldowns={cooldowns} onPick={(k) => void send(k)} />
      </Sheet>

      <ConfirmSheet
        visible={clearConfirm}
        title={copy['stop.clearTitle']}
        confirmLabel={copy['stop.clearConfirm']}
        cancelLabel={copy['stop.clearCancel']}
        loading={clearing}
        onCancel={() => !clearing && setClearConfirm(false)}
        onConfirm={() => void doClearStop()}
      />

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
  convoy: { position: 'absolute', top: 0, left: 0, right: 0 },
  slot: { position: 'absolute', left: space.lg, right: space.lg },
  floatSos: { position: 'absolute', left: space.lg },
  list: { flex: 1 },
  mapPlaceholder: { flex: 1 },
  error: { padding: space.lg, gap: space.md, borderBottomWidth: 1 },
  skeleton: { height: ROW_HEIGHTS.rider, marginHorizontal: space.lg, marginTop: space.sm, borderRadius: radius.md },
  alone: { padding: space.lg, gap: space.md },
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
