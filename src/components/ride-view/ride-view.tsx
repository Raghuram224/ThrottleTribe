import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArrivalPanel } from '@/components/arrival-panel';
import { ConvoyStrip } from '@/components/convoy-strip';
import { LiveSheet } from '@/components/live-sheet';
import { LoadErrorRow, SoloInviteRow } from '@/components/live-rows';
import { RideMapChrome } from '@/components/map/ride-map-chrome';
import type { MapHandle } from '@/components/map/types';
import { useRideMap } from '@/components/map/use-ride-map';
import { NavBanner } from '@/components/nav-banner';
import { RideHeader } from '@/components/ride-header';
import { useRideBanners } from '@/components/ride/use-ride-banners';
import type { RideSession } from '@/components/ride/use-ride-session';
import { RideFabStack } from '@/components/ride-view/ride-fab-stack';
import { useQuickMessages } from '@/components/ride-view/quick-messages';
import { useSosConfirm } from '@/components/ride-view/sos-button';
import { useRideViewModel } from '@/components/ride-view/use-ride-view';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { StopCard, StopChip } from '@/components/stop-card';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { type LatLng } from '@/lib/geo';
import { LIVE_ME_ZOOM } from '@/lib/live-camera';
import { ROW_HEIGHTS } from '@/lib/live-list';
import { headerSearchVisible } from '@/lib/live-chrome';
import { followPadding, followPitch } from '@/lib/nav-camera';
import { rideBack } from '@/lib/plan-flow';
import { runRideBack } from '@/lib/ride-back';
import { rideStackItems } from '@/lib/ride-view';
import { useLiveUiStore } from '@/store/live-ui-store';
import { readFreshOrigin } from '@/store/nav-store';
import { usePrefsStore } from '@/store/prefs-store';
import { useRideSessionStore } from '@/store/ride-session-store';
import { useRideStore } from '@/store/ride-store';
import { useRideViewStore } from '@/store/ride-view-store';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface RideViewProps {
  /** Home's one map's camera handle: the ride's navigation camera drives it. */
  mapRef: RefObject<MapHandle | null>;
  /** Where Home last knew me: the camera eases there while the ride has no fix of mine yet (never a world frame). */
  seed: LatLng | null;
  /** The Search circle, the header search icon and the arrival panel's "Pick next destination": the inline stop search. */
  onSearchStops: () => void;
  /**
   * The ride's stop search is open over the map (Home draws it): the ride view stays mounted, so its camera state, the
   * turn announcements and the arrival latch keep running, but it draws only the ride's banners (SOS, approvals) and moves
   * nothing on the map.
   */
  searching: boolean;
}

/** The first follow ease and the seed ease when the ride view opens on a map that was showing something else. */
const ENTRY_EASE_MS = 450;

/**
 * The live ride drawn over Home's one map (28 §8): the ride header and banner stack, the turn banner, the convoy strip, the
 * rider list in a pull-up sheet, the status-bar scrim of full map, the map's credit pill and controls, and the bottom-right
 * stack (Search, Speak while navigating, Message in a group, SOS). The ride's layers are drawn by `HomeMap` inside the
 * same map: this component publishes them (and the map's handlers) to the ride-view store, and runs the navigation camera.
 * Mounted only while the ride view is on: every entry starts a fresh camera, seeded from my fix.
 */
export function RideView(props: RideViewProps) {
  const viewRideId = useLiveUiStore((s) => s.viewRideId);
  const session = useRideSessionStore((s) => s.session);
  // The host publishes before paint; until it has this ride there is nothing to show.
  if (!session || !viewRideId || session.rideId !== viewRideId) return null;
  return <RideViewBody session={session} rideId={viewRideId} {...props} />;
}

function RideViewBody({ session, rideId, mapRef, seed, onSearchStops, searching }: RideViewProps & { session: RideSession; rideId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  // Only the Home in front writes the shared map scene (a second Home under it must never drive the one map).
  const focused = useIsFocused();
  const tilt = usePrefsStore((s) => s.mapTilt);
  const { connection, netOffline, rideName, rideLive, openMenu, actions } = session;
  const [areaH, setAreaH] = useState(0);
  const [topH, setTopH] = useState(0);

  const banners = useRideBanners(rideId, session);
  const scrollRef = useRef<ScrollView>(null);
  const m = useRideViewModel({ actions, areaH, topChromeH: topH, sheetInset: insets.bottom, onPickNext: onSearchStops, scrollRef });
  const { fullMap, heights, snap, variant, arrived, stop, stopText, banner, bannerView, bannerH, convoy, loaded } = m;
  const quick = useQuickMessages(rideId);
  const sosConfirm = useSosConfirm(rideId);

  const onClearSelection = useCallback(() => useLiveUiStore.getState().clear(), []);
  const bottomInset = fullMap ? 0 : areaH > 0 ? heights[snap] : 0;
  const ride = useRideMap({
    riders: m.mapRiders,
    trail: m.trail,
    selectedUserId: m.selectedUserId,
    focusNonce: m.selectNonce,
    onSelect: m.onRowPress,
    onClearSelection,
    topInset: m.topInset,
    bottomInset,
    controlsHidden: false,
    mapVisH: m.mapVisH,
    stop,
    navLine: m.navLine,
    focusStopNonce: m.focusStopNonce,
    recentreNonce: m.recentreNonce,
    onMapBearing: m.setMapBearing,
    voice: m.voice,
    mapRef,
    areaH,
    entryEaseMs: ENTRY_EASE_MS,
    enabled: !searching,
  });

  // ---- the ride's layers and the map's handlers go to Home's map (it draws them inside its one MapLibre map).
  const setScene = useRideViewStore((s) => s.setScene);
  const setShown = useRideViewStore((s) => s.setShown);
  const setStripOpen = useRideViewStore((s) => s.setStripOpen);
  useLayoutEffect(() => {
    if (focused) setScene({ loaded, layers: ride.layers, handlers: ride.handlers });
  });
  useLayoutEffect(() => {
    setShown(true);
    return () => {
      setScene(null);
      setShown(false);
      setStripOpen(false);
      useLiveUiStore.getState().setTopStackH(0);
    };
  }, [setScene, setShown, setStripOpen]);
  // Back collapses a pulled-up rider list first (after that Back is the OS's).
  const stripOpen = !fullMap && variant === 'group' && m.snaps.includes('collapsed') && snap !== 'collapsed';
  useEffect(() => {
    setStripOpen(stripOpen);
  }, [stripOpen, setStripOpen]);

  // ---- entry camera: the map shows Home's browse view. With my fix in the ride, the follow camera eases there
  // (`entryEaseMs`); without one, ease to where Home last knew me (or the start of my route), so the map is never left on a
  // world frame or the route-preview overview (audit 27 #2). Retried until a point is known or my fix arrives.
  const navStart = m.navLine?.coords[0];
  const navStartLat = navStart?.lat;
  const navStartLng = navStart?.lng;
  const hasMe = m.mapRiders.some((r) => r.isMe);
  const latest = useRef({ seed, tilt, reduceMotion, areaH, topInset: m.topInset, bottomInset, hasMe, navStartLat, navStartLng });
  useEffect(() => {
    latest.current = { seed, tilt, reduceMotion, areaH, topInset: m.topInset, bottomInset, hasMe, navStartLat, navStartLng };
  });
  const entered = useRef(false);
  useEffect(() => {
    if (entered.current || areaH <= 0) return;
    const l = latest.current;
    if (l.hasMe) {
      // The follow ease takes it from here.
      entered.current = true;
      return;
    }
    const at =
      l.seed ??
      readFreshOrigin() ??
      (l.navStartLat !== undefined && l.navStartLng !== undefined ? { lat: l.navStartLat, lng: l.navStartLng } : null);
    if (!at) return;
    entered.current = true;
    mapRef.current?.easeTo({
      center: [at.lng, at.lat],
      zoom: LIVE_ME_ZOOM,
      bearing: 0,
      pitch: followPitch(l.tilt),
      padding: followPadding({ areaH: l.areaH, topInset: l.topInset, bottomInset: l.bottomInset }),
      durationMs: l.reduceMotion ? 0 : ENTRY_EASE_MS,
    });
  }, [areaH, navStartLat, navStartLng, mapRef]);

  // ---- the header and banners (shared with the ride layout) and, in full map, the floating safety stack.
  const fullMapOn = fullMap && rideLive;
  const floatingStack = fullMapOn ? [...banners.kept.slice(0, 3), ...banners.approvalCards] : [];
  const floatingShown = floatingStack.length > 0;
  useEffect(() => {
    if (!floatingShown) useLiveUiStore.getState().setTopStackH(0);
  }, [floatingShown]);

  const stackItems = rideStackItems({
    mapVisH: m.mapVisH,
    group: variant === 'group',
    navActive: m.navActive,
    fitAll: ride.chrome.vis.fitAll,
  });
  const sheetShown = areaH > 0 && !fullMap;
  const searchBanners = banners.visible.length + banners.approvalCards.length > 0;
  const setSearchBannerH = useRideViewStore((s) => s.setSearchBannerH);
  const reportBannerH = searching && searchBanners;
  useEffect(() => {
    if (!reportBannerH) setSearchBannerH(0);
  }, [reportBannerH, setSearchBannerH]);
  const hasBackStep =
    rideBack({ rideView: true, stopSearch: false, riderSelected: !!m.selectedUserId, fullMap, stripOpen }) !== 'system';

  // The stop search is Home's: the ride keeps only its safety banners and approval cards over it (SOS never hides).
  if (searching) {
    return searchBanners ? (
      <View
        pointerEvents="box-none"
        onLayout={(e) => setSearchBannerH(Math.max(0, Math.round(e.nativeEvent.layout.height - insets.top)))}
        style={[styles.top, { paddingTop: insets.top, backgroundColor: colors.surfaceRaised }]}>
        {banners.visible}
        {banners.approvalCards}
      </View>
    ) : null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
      {/* Full map: the map runs under the status bar. */}
      {fullMap ? <StatusBarScrim /> : null}

      {fullMapOn ? null : (
        <View
          onLayout={(e) => setTopH(Math.round(e.nativeEvent.layout.height))}
          style={[styles.top, { paddingTop: insets.top, backgroundColor: colors.surfaceRaised }]}>
          <RideHeader
            name={rideName}
            meta={banners.meta}
            connection={connection}
            netOffline={netOffline}
            // Back steps out inside the map (a selected rider, the list); with nothing to step out of there is no arrow.
            onBack={hasBackStep ? () => void runRideBack() : undefined}
            onMenu={openMenu}
            onSearch={headerSearchVisible({ child: 'live', rideLive, connection }) ? onSearchStops : undefined}
          />
          {banners.visible}
          {banners.approvalCards}
        </View>
      )}

      {/* Docked turn banner (sheet mode): full-bleed under the header, convoy strip under it. */}
      {banner && bannerView && !fullMap ? (
        <View style={[styles.banner, { top: topH }]} pointerEvents="box-none">
          <NavBanner view={bannerView} floating={false} onPress={m.onBannerPress} />
        </View>
      ) : null}

      {convoy && !fullMap ? (
        <View style={[styles.convoy, { top: topH + bannerH }]} pointerEvents="none">
          <ConvoyStrip model={convoy} />
        </View>
      ) : null}

      {/* Full map: the banner replaces the stop chip, floating under the status bar / SOS banners. */}
      {fullMap && banner && bannerView ? (
        <View style={[styles.bannerFloat, { top: m.fullTop + space.sm }]} pointerEvents="box-none">
          <NavBanner view={bannerView} floating onPress={m.onBannerPress} />
        </View>
      ) : null}

      {fullMap && !banner && stopText ? (
        <View style={[styles.slot, { top: m.fullTop + space.sm }]} pointerEvents="box-none">
          {/* Arrived: tapping the chip leaves full map so the arrival panel shows (21 §2.8). */}
          <StopChip line={stopText.text} arrived={stopText.arrived} onPress={arrived ? m.toggleFullMap : m.focusStop} />
        </View>
      ) : null}

      {/* The map's credit pill and controls ride the list's top edge; the stack is part of that overlay. */}
      <RideMapChrome
        {...ride.chrome}
        speedKmh={m.speedKmh}
        meSlotBottom={m.creditClear}
        fullMap={fullMap}
        onToggleFullMap={m.toggleFullMap}
        overlayShift={fullMap || areaH <= 0 ? m.noShift : m.overlayShift}
        overlayBottomInset={fullMap ? insets.bottom : 0}
        externalColumn>
        <RideFabStack
          rideId={rideId}
          items={stackItems}
          sosOn={m.sosOn}
          onSosA11y={sosConfirm.ask}
          onSearch={onSearchStops}
          onMessage={quick.open}
          voice={m.voice}
          fullMap={fullMap}
          onToggleFullMap={m.toggleFullMap}
          overview={ride.chrome.mode === 'overview'}
          onFitAll={ride.chrome.showAll}
        />
      </RideMapChrome>

      {sheetShown ? (
        <LiveSheet
          snap={snap}
          onSnapChange={m.setSnap}
          heights={heights}
          snaps={m.snaps}
          variant={variant}
          visible={m.sheetVisible}
          summary={m.summary}
          stopCard={
            stopText && !arrived ? (
              <StopCard parts={stopText} suggestedBy={m.suggestedBy} category={stop?.category} onPress={m.focusStop} />
            ) : undefined
          }
          pinned={m.pinned.map((p) => m.renderItem(p))}>
          {variant === 'solo' ? (
            <>
              {m.loadError ? <LoadErrorRow onRetry={() => void useRideStore.getState().load(rideId)} /> : null}
              {arrived && stop ? (
                <ArrivalPanel
                  name={stop.name}
                  onPickNext={m.pickNext}
                  onEnd={m.isLeader ? m.requestEnd : m.requestLeave}
                  leaveInstead={!m.isLeader}
                />
              ) : (
                <SoloInviteRow left={m.someoneLeft} onPress={m.openInvite} />
              )}
            </>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={styles.list}
              // The sheet is `expanded` tall and slid down; this keeps the last row reachable at every
              // snap and leaves the 8 dp after it (`snapHeights` fit) and the navigation-bar inset at the largest one.
              contentContainerStyle={{ paddingBottom: m.listPaddingBottom }}
              onLayout={(e) => m.setListH(e.nativeEvent.layout.height)}
              onContentSizeChange={(_, h) => m.setContentH(h)}
              scrollEnabled={!m.collapsed}
              {...m.listTouch}>
              {m.loadError ? <LoadErrorRow onRetry={() => void useRideStore.getState().load(rideId)} /> : null}
              {loaded ? (
                m.listItems.map(m.renderItem)
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

      {/* Full map: SOS banners and approval cards float over the edge-to-edge map, below the status bar. */}
      {fullMapOn && floatingShown ? (
        <View
          pointerEvents="box-none"
          onLayout={(e) => useLiveUiStore.getState().setTopStackH(e.nativeEvent.layout.height)}
          style={[styles.floating, { paddingTop: insets.top }]}>
          {floatingStack}
        </View>
      ) : null}

      {quick.sheet}
      {sosConfirm.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  banner: { position: 'absolute', left: 0, right: 0 },
  bannerFloat: { position: 'absolute', left: space.sm, right: space.sm },
  convoy: { position: 'absolute', left: 0, right: 0 },
  slot: { position: 'absolute', left: space.lg, right: space.lg },
  floating: { position: 'absolute', top: 0, left: 0, right: 0 },
  list: { flex: 1 },
  skeleton: { height: ROW_HEIGHTS.rider, marginHorizontal: space.lg, marginTop: space.sm, borderRadius: radius.md },
});
