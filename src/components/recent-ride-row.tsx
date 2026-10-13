import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { PressableScale } from '@/components/pressable-scale';
import { RouteSketch } from '@/components/route-sketch';
import { haptic } from '@/lib/haptics';
import { displayRideName } from '@/lib/names';
import { formatRideDate, recentMeta, recentRowLabel, type RecentRide } from '@/lib/recent-rides';
import type { SketchPoint } from '@/lib/route-sketch';
import { fontNumeric, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface RecentRideRowProps {
  ride: RecentRide;
  /** My cached distance in metres (13 §3), if the summary was opened once. */
  distanceM: number | null;
  /** My cached route shape (16 §3); null shows the flag tile. */
  sketch: readonly SketchPoint[] | null;
  onPress: (rideId: string) => void;
  /** No divider under the last row. */
  last?: boolean;
}

/** Home -> Recent rides row (80): route sketch tile, name, meta "86 km · 2 h 14 min · 6 riders", date top-right. */
export const RecentRideRow = memo(function RecentRideRow({ ride, distanceM, sketch, onPress, last }: RecentRideRowProps) {
  const { colors } = useTheme();
  const meta = recentMeta(ride, distanceM);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={recentRowLabel(ride, meta)}
      scaleTo={0.98}
      onPress={() => {
        haptic('select');
        onPress(ride.id);
      }}
      style={(pressed) => [styles.row, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
      <RouteSketch points={sketch} />
      <View style={styles.texts}>
        <View style={styles.top}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.name} maxFontSizeMultiplier={1.3}>
            {displayRideName(ride.name)}
          </AppText>
          <AppText variant="caption" numeric maxFontSizeMultiplier={1.3} style={[styles.date, { color: colors.textSubtle }]}>
            {formatRideDate(ride.endedAt)}
          </AppText>
        </View>
        {meta ? (
          <AppText variant="caption" muted numberOfLines={1} style={fontNumeric} maxFontSizeMultiplier={1.3}>
            {meta}
          </AppText>
        ) : null}
      </View>
      {last ? null : <View style={[styles.divider, { backgroundColor: colors.border }]} />}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  texts: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  name: { flexShrink: 1 },
  date: { fontSize: 13 },
  // Hairline inset 86: starts after the 56 tile.
  divider: { position: 'absolute', left: 86, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
