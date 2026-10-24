import type { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { MapControls } from '@/components/map-controls';
import { MapCreditPill } from '@/components/map-credit-pill';
import { copy } from '@/lib/copy';
import { pillMaxWidth, type PillLineKey } from '@/lib/credits';
import { meSlotKind, type MapControlVisibility } from '@/lib/live-chrome';
import { track } from '@/lib/telemetry';
import { elevate, family, font, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export interface RideMapChromeProps {
  /** At least one rider has a position: otherwise the "waiting" pill shows. */
  hasRiders: boolean;
  /** Dp of the map covered at the top: the waiting pill sits under it. */
  topInset: number;
  /** The credit pill's lines (`pillLines`, 24 §4.2 and 25 §5.1). */
  creditKeys: readonly PillLineKey[];
  vis: MapControlVisibility;
  /** Camera mode: decides the bottom-left slot (bubble or Re-centre). */
  mode: 'follow' | 'free' | 'overview';
  /** My speed in whole km/h (null when unknown or < 3): the bubble shows in follow mode only, in the "me" slot. */
  speedKmh: number | null;
  /** "Me" slot offset from the overlay bottom (above the attribution, or above the floating SOS). */
  meSlotBottom: number;
  fullMap: boolean;
  onToggleFullMap: () => void;
  /** Re-centre needs my own fix. */
  canRecentre: boolean;
  recentre: () => void;
  showAll: () => void;
  /** Voice toggle state while navigating (null = none); drawn only when `vis.voice` (solo, no fit-all). */
  voice: { on: boolean; onToggle: () => void } | null;
  reduceMotion: boolean;
  /** Animated (negative) shift that lifts the controls and attribution with the sheet's top edge. */
  overlayShift: SharedValue<number>;
  /** Dp of system navigation bar under the map in full map; attribution and controls clear it. */
  overlayBottomInset: number;
  /**
   * The ride view on Home draws its own right-hand stack (Search, Speak, SOS, full map, fit all) in `children`: this chrome
   * then leaves the right column out, and still keeps the credit pill clear of it.
   */
  externalColumn?: boolean;
  /** Drawn inside the shifted overlay, so it rides the sheet's top edge with the controls. */
  children?: ReactNode;
}

/**
 * The live map's chrome (20 C1): the "waiting for riders" pill, the credit pill, the me slot (speed bubble / Re-centre)
 * and the view column (full map, fit all, voice). The map itself lives elsewhere (RideMap, or Home's one map), so the
 * same controls serve both.
 */
export function RideMapChrome({
  hasRiders,
  topInset,
  creditKeys,
  vis,
  mode,
  speedKmh,
  meSlotBottom,
  fullMap,
  onToggleFullMap,
  canRecentre,
  recentre,
  showAll,
  voice,
  reduceMotion,
  overlayShift,
  overlayBottomInset,
  externalColumn = false,
  children,
}: RideMapChromeProps) {
  const { colors, scheme } = useTheme();
  const { width: windowW } = useWindowDimensions();
  const controlsStyle = useAnimatedStyle(() => ({ transform: [{ translateY: overlayShift.value }] }));
  const shownVis = externalColumn ? { ...vis, rightColumn: false } : vis;
  return (
    <>
      {!hasRiders ? (
        <View
          pointerEvents="none"
          style={[styles.waiting, { top: topInset + space.md, backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.waitingText, { color: colors.text }]}>
            {copy['live.mapWaiting']}
          </Text>
        </View>
      ) : null}

      {/* Attribution and controls ride on the sheet's top edge. */}
      <Reanimated.View pointerEvents="box-none" style={[styles.overlay, { bottom: overlayBottomInset }, controlsStyle]}>
        <MapCreditPill lines={creditKeys.map((k) => copy[k])} maxWidth={pillMaxWidth(windowW, externalColumn || vis.rightColumn)} />
        <MapControls
          vis={shownVis}
          meSlot={meSlotKind(mode, speedKmh)}
          speedKmh={speedKmh}
          meSlotBottom={meSlotBottom}
          fullMap={fullMap}
          overview={mode === 'overview'}
          canRecentre={canRecentre}
          onToggleFullMap={onToggleFullMap}
          onRecentre={() => {
            track('map.recentre');
            recentre();
          }}
          onFitAll={() => {
            track('map.fit_all');
            showAll();
          }}
          voiceOn={voice ? voice.on : null}
          onToggleVoice={voice?.onToggle}
          reduceMotion={reduceMotion}
        />
        {children}
      </Reanimated.View>
    </>
  );
}

const styles = StyleSheet.create({
  waiting: {
    position: 'absolute',
    top: space.md,
    alignSelf: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  waitingText: { fontSize: font.sm, fontFamily: family.semibold },
  // Anchored to the bottom of the map; `overlayShift` lifts it onto the sheet's top edge.
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 0 },
});
