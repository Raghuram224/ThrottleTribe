import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';

import { ArrivalPanel } from '@/components/arrival-panel';
import { ConvoyStrip } from '@/components/convoy-strip';
import { Icon, type IconName } from '@/components/icon';
import { LiveSheet } from '@/components/live-sheet';
import { LoadErrorRow, SoloInviteRow } from '@/components/live-rows';
import { rowEnter, rowExit } from '@/components/motion-presets';
import { NavBanner } from '@/components/nav-banner';
import { PressableScale } from '@/components/pressable-scale';
import { RideMap } from '@/components/ride-map';
import { useQuickMessages } from '@/components/ride-view/quick-messages';
import { ACTION_H, RideSosButton, useSosConfirm } from '@/components/ride-view/sos-button';
import { SOS_FLOAT, useRideViewModel } from '@/components/ride-view/use-ride-view';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { StopCard, StopChip } from '@/components/stop-card';
import { useRideActions } from '@/hooks/use-ride-actions';
import { copy } from '@/lib/copy';
import { backAction } from '@/lib/full-map';
import { haptic } from '@/lib/haptics';
import { ROW_HEIGHTS } from '@/lib/live-list';
import { href } from '@/lib/nav';
import { openLiveRide } from '@/lib/reset-to-ride';
import { RIDE_ON_HOME } from '@/lib/ride-on-home';
import { useLiveUiStore } from '@/store/live-ui-store';
import { useRideStore } from '@/store/ride-store';
import { elevate, family, font, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** In full map the slot sits above the floating SOS instead (the SOS itself lifts for a two-line credit pill). */
const meSlotBottomFull = (sosBottom: number) => sosBottom + SOS_FLOAT + space.md;

/**
 * Live ride route. With the ride on Home's map (28 §8, native) it is only a hand-off: deep entries (the launch gate, a
 * notification, the permissions explainer) land here and the ride opens on Home. Web, and native with
 * EXPO_PUBLIC_LIVE_ON_HOME=0, keep the full-screen live screen below.
 */
export default function Live() {
  return RIDE_ON_HOME ? <LiveHandOff /> : <LiveScreen />;
}

function LiveHandOff() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const handed = useRef(false);
  useEffect(() => {
    if (handed.current || !id) return;
    handed.current = true;
    openLiveRide(id);
  }, [id]);
  return <View style={[styles.root, { backgroundColor: colors.bg }]} />;
}

/**
 * Live ride (06, 18): full-screen map with a draggable rider sheet above the action bar. Collapsed it
 * shows a summary line plus any SOS / stopped / offline rows; expanded it is the full list.
 */
function LiveScreen() {
  const { colors, scheme } = useTheme();
  const actions = useRideActions();
  const { rideId, isLeader, openInvite, requestEnd, requestLeave } = actions;
  const [areaH, setAreaH] = useState(0);

  const pickNext = useCallback(() => {
    haptic('select');
    router.push(href(`/ride/${rideId}/search`));
  }, [rideId]);
  const scrollRef = useRef<ScrollView>(null);
  const m = useRideViewModel({ actions, areaH, topChromeH: 0, sheetInset: 0, onPickNext: pickNext, scrollRef });
  const { fullMap, insets, variant, arrived, heights, snap, collapsed, stop, stopText, banner, bannerView, bannerH, convoy, fullTop } = m;
  const quick = useQuickMessages(rideId);
  const sosConfirm = useSosConfirm(rideId);

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

  // Same hold behaviour and a11y fallback in the bar and in the floating full-map circle.
  const sosButton = (round?: number) => <RideSosButton rideId={rideId} sosOn={m.sosOn} round={round} onA11yActivate={sosConfirm.ask} />;

  const loaded = m.loaded;
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.area} onLayout={(e: LayoutChangeEvent) => setAreaH(e.nativeEvent.layout.height)}>
        <View style={StyleSheet.absoluteFill}>
          {loaded ? (
            <RideMap
              riders={m.mapRiders}
              trail={m.trail}
              selectedUserId={m.selectedUserId}
              focusNonce={m.selectNonce}
              onSelect={m.onRowPress}
              onClearSelection={() => useLiveUiStore.getState().clear()}
              topInset={m.topInset}
              // Full map has no sheet; with the full-height area "me" lands in the lower third.
              bottomInset={fullMap ? 0 : areaH > 0 ? heights[snap] : 0}
              // The shift follows the sheet only while one is mounted (it needs a measured area and no full map).
              overlayShift={fullMap || areaH <= 0 ? m.noShift : m.overlayShift}
              // Never hidden by snap: the mapVisH thresholds (20 C1) already hide them when a tall sheet leaves no room.
              controlsHidden={false}
              mapVisH={m.mapVisH}
              fullMap={fullMap}
              onToggleFullMap={m.toggleFullMap}
              overlayBottomInset={fullMap ? insets.bottom : 0}
              speedKmh={m.speedKmh}
              meSlotBottom={fullMap ? meSlotBottomFull(m.sosFloatBottom) : m.creditClear}
              stop={stop}
              navLine={m.navLine}
              focusStopNonce={m.focusStopNonce}
              recentreNonce={m.recentreNonce}
              onMapBearing={m.setMapBearing}
              voice={m.voice}
            />
          ) : (
            <View style={[styles.mapPlaceholder, { backgroundColor: colors.surface }]} />
          )}
        </View>

        {/* Full map: the map runs under the status bar. */}
        {fullMap ? <StatusBarScrim /> : null}

        {/* Docked turn banner (sheet mode): full-bleed at the top of the live area, convoy strip under it. */}
        {banner && bannerView && !fullMap ? (
          <View style={styles.banner} pointerEvents="box-none">
            <NavBanner view={bannerView} floating={false} onPress={m.onBannerPress} />
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
            <NavBanner view={bannerView} floating onPress={m.onBannerPress} />
          </View>
        ) : null}

        {fullMap && !banner && stopText ? (
          <View style={[styles.slot, { top: fullTop + space.sm }]} pointerEvents="box-none">
            {/* Arrived: tapping the chip leaves full map so the arrival panel shows (21 §2.8). */}
            <StopChip line={stopText.text} arrived={stopText.arrived} onPress={arrived ? m.toggleFullMap : m.focusStop} />
          </View>
        ) : null}

        {fullMap ? (
          <View style={[styles.floatSos, { bottom: insets.bottom + m.sosFloatBottom }]} pointerEvents="box-none">
            {sosButton(SOS_FLOAT)}
          </View>
        ) : null}

        {areaH > 0 && !fullMap ? (
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
                    onEnd={isLeader ? requestEnd : requestLeave}
                    leaveInstead={!isLeader}
                  />
                ) : (
                  <SoloInviteRow left={m.someoneLeft} onPress={openInvite} />
                )}
              </>
            ) : (
              <ScrollView
                ref={scrollRef}
                style={styles.list}
                // The sheet is `expanded` tall and slid down; this keeps the last row reachable at every
                // snap and leaves the 8 dp after it (`snapHeights` fit) at the largest one.
                contentContainerStyle={{ paddingBottom: m.listPaddingBottom }}
                onLayout={(e) => m.setListH(e.nativeEvent.layout.height)}
                onContentSizeChange={(_, h) => m.setContentH(h)}
                scrollEnabled={!collapsed}
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
      </View>

      {fullMap ? null : (
        <View style={[styles.bar, { backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
          {/* Solo has nobody to message. SOS keeps its place in the tree, so a hold in progress survives the re-layout. */}
          {variant === 'solo' ? null : (
            <Animated.View entering={rowEnter} exiting={rowExit}>
              <ActionButton label={copy['live.msg']} icon="message" onPress={quick.open} />
            </Animated.View>
          )}
          {sosButton()}
        </View>
      )}

      {quick.sheet}
      {sosConfirm.sheet}
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
});
