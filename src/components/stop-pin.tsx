import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { markerLiftStyle } from '@/components/marker-lift';
import type { PlaceCategory } from '@/lib/place-search';
import type { StopKind } from '@/lib/ride-api';
import { breakIcon, categoryIcon } from '@/lib/stop-ui';
import { useTheme } from '@/theme/use-theme';

/** Teardrop is 36 dp wide; its tip sits 43.5 dp below the top (36 / 2 + 36 * sqrt(2) / 2). */
export const STOP_PIN_W = 36;
export const STOP_PIN_H = 44;

const lift = markerLiftStyle();

/**
 * Destination pin for the shared next stop (19 A): 36 dp teardrop in the route colour with an
 * `onNavRoute` glyph (`generic`: a search result, where no category is the plain place pin, not the cup; the place's icon for a break, cup without a category; flag for the destination). Anchor the marker at 'bottom': the tip is the place.
 */
export function StopPin({ kind, category, generic = false }: { kind: StopKind; category?: PlaceCategory | null; generic?: boolean }) {
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" style={styles.box}>
      <View style={[styles.drop, lift, { backgroundColor: colors.navRoute }]}>
        <View style={styles.glyph}>
          <Icon name={kind === 'destination' ? 'endRide' : generic ? (category ? categoryIcon(category) : 'permLocation') : breakIcon(category)} color={colors.onNavRoute} size={20} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: STOP_PIN_W, height: STOP_PIN_H },
  // A square with one sharp corner, turned 45 degrees so the corner points down.
  drop: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: STOP_PIN_W,
    height: STOP_PIN_W,
    borderRadius: STOP_PIN_W / 2,
    borderBottomRightRadius: 0,
    transform: [{ rotate: '45deg' }],
  },
  glyph: { flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-45deg' }] },
});
