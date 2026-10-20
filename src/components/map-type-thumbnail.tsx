import { StyleSheet, View } from 'react-native';

import type { MapLayer } from '@/lib/dem';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const H = 72;

/**
 * A tiny map for the Map type cards (25 §2.2), drawn from the style-picker tokens (24 §1.7): land, a park, a water band,
 * two roads and the route. Terrain adds two soft diagonal ridge bands under the roads. Pure Views, hidden from screen readers.
 */
export function MapTypeThumbnail({ layer }: { layer: MapLayer }) {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.box, { backgroundColor: colors.mapPreviewLand }]}>
      <View style={[styles.park, { backgroundColor: colors.mapPreviewPark }]} />
      <View style={[styles.water, { backgroundColor: colors.mapPreviewWater }]} />
      {layer === 'terrain' ? (
        <>
          <View style={[styles.ridge, { top: 6, left: 18, backgroundColor: colors.mapPreviewRelief }]} />
          <View style={[styles.ridge, { top: 34, left: 78, backgroundColor: colors.mapPreviewRelief }]} />
        </>
      ) : null}
      {/* Each road is a 5 dp edge under a 3 dp fill (24 §1.7). */}
      {[
        { top: 20, rotate: '8deg' },
        { top: 50, rotate: '-6deg' },
      ].map((r) => (
        <View key={r.top}>
          <View style={[styles.road, { top: r.top - 1, height: 5, transform: [{ rotate: r.rotate }], backgroundColor: colors.mapPreviewRoadEdge }]} />
          <View style={[styles.road, { top: r.top, height: 3, transform: [{ rotate: r.rotate }], backgroundColor: colors.mapPreviewRoad }]} />
        </View>
      ))}
      <View style={[styles.route, { height: 7, top: 33, backgroundColor: colors.routeCasing }]} />
      <View style={[styles.route, { height: 4.6, top: 34.2, backgroundColor: colors.routeLine }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills the card's inner width (140 to 160 dp), so it never overflows the card or shifts when the border thickens.
  box: { alignSelf: 'stretch', height: H, borderRadius: radius.md, overflow: 'hidden' },
  park: { position: 'absolute', left: 6, top: 44, width: 36, height: 20, borderRadius: 5 },
  water: { position: 'absolute', right: -8, top: -6, width: 44, height: 28, borderRadius: 12 },
  ridge: { position: 'absolute', width: 70, height: 16, borderRadius: 8, transform: [{ rotate: '-28deg' }] },
  road: { position: 'absolute', left: -8, width: '120%' },
  route: { position: 'absolute', left: -4, width: '110%', borderRadius: 4, transform: [{ rotate: '-12deg' }] },
});
