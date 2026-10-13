import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { markerLiftStyle } from '@/components/marker-lift';
import { coneRotation, haloDiameterDp, MARKER_STYLE, meMarkerMode } from '@/lib/marker-style';
import { palette } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const lift = markerLiftStyle();

export type MeVariant = 'map' | 'strip' | 'row';

interface MeMarkerProps {
  variant: MeVariant;
  heading?: number | null;
  speedMps?: number | null;
  /** Map only: GPS accuracy in metres, latitude and zoom for the halo size. */
  accuracyM?: number | null;
  lat?: number;
  zoom?: number;
}

/** Box a map marker needs so the halo is not clipped (the halo can reach 160 dp). */
export function meMapBox(accuracyM: number | null, lat: number, zoom: number): number {
  return Math.max(44, haloDiameterDp(accuracyM, lat, zoom));
}

/**
 * "Me" in one place (17 §2.2): Tribe draws the brand arrow (white disc on the map and strip, bare arrow
 * in the row); Maps draws a plain dot with a white ring, plus an accuracy halo and heading cone on the map.
 */
export function MeMarker({ variant, heading = null, speedMps = null, accuracyM = null, lat = 0, zoom = 14 }: MeMarkerProps) {
  const { colors, traits } = useTheme();
  const dot = traits.meMarker === 'dot';

  if (variant === 'row') {
    return dot ? (
      <Dot size={18} ring={2.5} fill={colors.meMarker} ringColor={colors.meRing} />
    ) : (
      <Icon name="navigate" color={colors.meMarker} size={26} />
    );
  }

  if (variant === 'strip') {
    return dot ? (
      <Dot size={20} ring={2.5} fill={colors.meMarker} ringColor={colors.meRing} />
    ) : (
      <View style={[styles.disc, { width: 30, height: 30, borderRadius: 15 }]}>
        {/* navigation-variant points up-left; 90 deg turns it to "ahead" (right). */}
        <View style={styles.stripArrow}>
          <Icon name="navigate" color={colors.meMarker} size={20} />
        </View>
      </View>
    );
  }

  // Map.
  if (!dot) {
    const mode = meMarkerMode(heading, speedMps);
    return (
      <View style={styles.box44} pointerEvents="none">
        {mode.kind === 'arrow' ? (
          <View style={styles.meArrow}>
            <View style={{ transform: [{ rotate: `${mode.rotationDeg}deg` }] }}>
              <Icon name="navigate" color={colors.meMarker} size={22} />
            </View>
          </View>
        ) : (
          <View style={styles.meStroke}>
            <View style={[styles.meDot, { backgroundColor: colors.meMarker }]} />
          </View>
        )}
      </View>
    );
  }
  const halo = haloDiameterDp(accuracyM, lat, zoom);
  const box = Math.max(44, halo);
  const cone = coneRotation(heading, speedMps);
  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      <View
        style={{ position: 'absolute', width: halo, height: halo, borderRadius: halo / 2, backgroundColor: colors.meHalo }}
      />
      {/* 1 dp ring at 0.32 alpha, drawn separately so the fill keeps its own alpha. */}
      <View
        style={{
          position: 'absolute',
          width: halo,
          height: halo,
          borderRadius: halo / 2,
          borderWidth: 1,
          borderColor: colors.meMarker,
          opacity: 0.32,
        }}
      />
      {cone !== null ? (
        <View style={[styles.coneWrap, { transform: [{ rotate: `${cone}deg` }] }]}>
          <View style={[styles.cone, { borderTopColor: colors.meMarker }]} />
        </View>
      ) : null}
      <View style={[lift, { borderRadius: 14 }]}>
        <Dot size={22} ring={3} fill={colors.meMarker} ringColor={colors.meRing} />
      </View>
    </View>
  );
}

function Dot({ size, ring, fill, ringColor }: { size: number; ring: number; fill: string; ringColor: string }) {
  const d = size + ring * 2;
  return (
    <View
      style={{
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: fill,
        borderWidth: ring,
        borderColor: ringColor,
      }}
    />
  );
}

const CONE_H = 42;
const CONE_HALF = 38; // 84 deg spread over 42 dp: 42 * tan(42 deg)

const styles = StyleSheet.create({
  box44: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disc: { backgroundColor: palette.markerOutline, alignItems: 'center', justifyContent: 'center' },
  stripArrow: { transform: [{ rotate: '90deg' }] },
  meArrow: {
    ...lift,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.markerOutline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meDot: {
    width: MARKER_STYLE.meDotDp,
    height: MARKER_STYLE.meDotDp,
    borderRadius: MARKER_STYLE.meDotDp / 2,
    borderWidth: MARKER_STYLE.strokeDp,
    borderColor: MARKER_STYLE.strokeColor,
  },
  // 1 px ink outer stroke so my marker stays distinct from the amber stopped ring in sunlight.
  meStroke: {
    ...lift,
    width: MARKER_STYLE.meDotDp + 2,
    height: MARKER_STYLE.meDotDp + 2,
    borderRadius: (MARKER_STYLE.meDotDp + 2) / 2,
    borderWidth: 1,
    borderColor: MARKER_STYLE.inkColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Square centred on the dot, rotated about its centre; the triangle fills its top half (apex at the centre).
  coneWrap: { position: 'absolute', width: CONE_H * 2, height: CONE_H * 2, alignItems: 'center' },
  cone: {
    width: 0,
    height: 0,
    borderLeftWidth: CONE_HALF,
    borderRightWidth: CONE_HALF,
    borderTopWidth: CONE_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    opacity: 0.45,
  },
});
