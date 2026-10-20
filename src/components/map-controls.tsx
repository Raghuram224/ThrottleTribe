import { Platform, Pressable, StyleSheet, Text, View, type AccessibilityState, type AccessibilityValue, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import type { IconName } from '@/lib/icon-names';
import { SpeedBubble } from '@/components/speed-bubble';
import { copy } from '@/lib/copy';
import type { MapControlVisibility } from '@/lib/live-chrome';
import { elevate, family, font, motion, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface MapControlsProps {
  vis: MapControlVisibility;
  /** What the bottom-left slot shows (`meSlotKind`): bubble and Re-centre never together. */
  meSlot: 'speed' | 'recentre' | null;
  speedKmh: number | null;
  /** Bottom offset of the slot from the overlay bottom (above the attribution, or the floating SOS). */
  meSlotBottom: number;
  fullMap: boolean;
  overview: boolean;
  /** Re-centre needs my own fix. */
  canRecentre: boolean;
  onToggleFullMap: () => void;
  onRecentre: () => void;
  onFitAll: () => void;
  /** Voice directions on (null = no toggle: not navigating). Drawn only when `vis.voice`. */
  voiceOn: boolean | null;
  onToggleVoice?: () => void;
  reduceMotion: boolean;
}

interface MapCircleButtonProps {
  icon: IconName;
  /** Glyph colour; default `fabIcon`. */
  iconColor?: string;
  /** A 2 dp ring in this colour (`'transparent'` when idle, so the circle never changes size). Left out = no ring. */
  ring?: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  accessibilityValue?: AccessibilityValue;
  onPress?: () => void;
  /** Position (Home places its own circle; the live column lays its circles out itself). */
  style?: StyleProp<ViewStyle>;
}

/** The 56 dp round map button (20 C1): `fabBg`, a shadow in light and a hairline in dark; shared by the live column and Home. */
export function MapCircleButton({
  icon,
  iconColor,
  ring,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  accessibilityValue,
  onPress,
  style,
}: MapCircleButtonProps) {
  const { colors, scheme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      accessibilityValue={accessibilityValue}
      onPress={onPress}
      style={[
        styles.circle,
        { backgroundColor: colors.fabBg },
        // Before the ring: in dark `elevate` is a hairline border, which would otherwise replace the 2 dp ring.
        elevate('e2', scheme),
        ring !== undefined && styles.ring,
        ring !== undefined && { borderColor: ring },
        style,
      ]}>
      <Icon name={icon} color={iconColor ?? colors.fabIcon} size={24} />
    </Pressable>
  );
}

/**
 * Map controls (20 C1), shared by the native and web maps so they stay identical. Bottom-left is one
 * "me" slot: the speed bubble while following, the labelled Re-centre pill once the map is panned.
 * Bottom-right is the "view" column: full-map toggle and, with 2+ riders, fit-all. All 56 dp.
 */
export function MapControls({
  vis,
  meSlot,
  speedKmh,
  meSlotBottom,
  fullMap,
  overview,
  canRecentre,
  onToggleFullMap,
  onRecentre,
  onFitAll,
  voiceOn,
  onToggleVoice,
  reduceMotion,
}: MapControlsProps) {
  const { colors, scheme } = useTheme();
  // 150 ms crossfade between the bubble and the pill; none with reduce motion.
  // Not on web: motion-presets.ts disables layout animations there (unverified in a browser).
  const animated = !reduceMotion && Platform.OS !== 'web';
  const enter = !animated ? undefined : FadeIn.duration(motion.fast).reduceMotion(ReduceMotion.System);
  const exit = !animated ? undefined : FadeOut.duration(motion.fast).reduceMotion(ReduceMotion.System);
  return (
    <>
      {vis.meSlot && meSlot === 'speed' && speedKmh != null ? (
        <Reanimated.View key="speed" entering={enter} exiting={exit} style={[styles.meSlot, { bottom: meSlotBottom }]} pointerEvents="none">
          <SpeedBubble kmh={speedKmh} />
        </Reanimated.View>
      ) : null}
      {vis.meSlot && meSlot === 'recentre' ? (
        <Reanimated.View key="recentre" entering={enter} exiting={exit} style={[styles.meSlot, { bottom: meSlotBottom }]} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy['live.recentreA11y']}
            disabled={!canRecentre}
            onPress={onRecentre}
            style={[
              styles.pill,
              { backgroundColor: colors.fabBg, opacity: canRecentre ? 1 : 0.5 },
              elevate('e2', scheme),
            ]}>
            <Icon name="centerMe" color={colors.brandOnBg} size={24} />
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.pillText, { color: colors.brandOnBg }]}>
              {copy['live.recentre']}
            </Text>
          </Pressable>
        </Reanimated.View>
      ) : null}
      {vis.rightColumn ? (
        <View style={styles.column} pointerEvents="box-none">
          {vis.voice && voiceOn !== null ? (
            // Top of the column (21 §4.4). Muted = the 2 dp ring + `selected` + the muted icon (rule 1: never colour alone).
            <MapCircleButton
              icon={voiceOn ? 'voiceOn' : 'voiceOff'}
              iconColor={voiceOn ? colors.fabIcon : colors.brandOnBg}
              ring={voiceOn ? 'transparent' : colors.brandOnBg}
              accessibilityLabel={voiceOn ? copy['nav.a11yVoiceOn'] : copy['nav.a11yVoiceOff']}
              accessibilityHint={voiceOn ? copy['nav.a11yVoiceOnHint'] : copy['nav.a11yVoiceOffHint']}
              accessibilityState={{ selected: !voiceOn }}
              onPress={onToggleVoice}
            />
          ) : null}
          <MapCircleButton
            icon={fullMap ? 'collapse' : 'expand'}
            accessibilityLabel={fullMap ? copy['live.exitFullMapA11y'] : copy['live.fullMapA11y']}
            onPress={onToggleFullMap}
          />
          {vis.fitAll ? (
            // The ring is always 2 dp (transparent when idle) so the circle never changes size.
            <MapCircleButton
              icon="fitPage"
              iconColor={overview ? colors.brandOnBg : colors.fabIcon}
              ring={overview ? colors.brandOnBg : 'transparent'}
              accessibilityLabel={copy['live.fitAllA11y']}
              accessibilityState={{ selected: overview }}
              onPress={onFitAll}
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  meSlot: { position: 'absolute', left: space.md },
  pill: {
    height: size.mapControl,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  pillText: { fontSize: font.md, fontFamily: family.semibold },
  column: { position: 'absolute', right: space.md, bottom: space.md, gap: space.md, alignItems: 'flex-end' },
  circle: {
    width: size.mapControl,
    height: size.mapControl,
    borderRadius: size.mapControl / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { borderWidth: 2 },
});
