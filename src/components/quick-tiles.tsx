import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { copy, type CopyKey } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { homeTiles, type HomeTile } from '@/lib/plan-flow';
import { family, font, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface QuickTilesProps {
  onJoin: () => void;
  onRide: () => void;
  /** "Just ride" is starting: its icon shows a spinner and further taps are ignored. */
  rideLoading: boolean;
}

const TILE_CONTENT: Record<HomeTile, { icon: IconName; label: CopyKey; a11y: CopyKey }> = {
  join: { icon: 'dialpad', label: 'homeMap.tileJoin', a11y: 'homeMap.tileJoinA11y' },
  ride: { icon: 'bike', label: 'homeMap.tileRide', a11y: 'homeMap.tileRideA11y' },
};

/**
 * The tiles of the home sheet (22 §3.1.3, D5): Join with a code and Just ride, equal width. Tonal on purpose:
 * the screen's primary is the search bar. There is no group tile: a ride becomes a group from inside the ride.
 */
export function QuickTiles({ onJoin, onRide, rideLoading }: QuickTilesProps) {
  const { width } = useWindowDimensions();
  const tiles = homeTiles();
  // (window - 2 x 16 padding - gaps) / count.
  const tileW = Math.floor((width - 2 * space.lg - (tiles.length - 1) * space.sm) / tiles.length);
  return (
    <View style={styles.row}>
      {tiles.map((tile) => {
        const c = TILE_CONTENT[tile];
        return (
          <Tile
            key={tile}
            width={tileW}
            icon={c.icon}
            label={copy[c.label]}
            a11y={copy[c.a11y]}
            loading={tile === 'ride' && rideLoading}
            onPress={tile === 'join' ? onJoin : onRide}
          />
        );
      })}
    </View>
  );
}

interface TileProps {
  width: number;
  icon: IconName;
  label: string;
  a11y: string;
  loading?: boolean;
  onPress: () => void;
}

function Tile({ width, icon, label, a11y, loading = false, onPress }: TileProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ busy: loading }}
      onPress={() => {
        if (loading) return;
        haptic('select');
        onPress();
      }}
      style={(pressed) => [styles.tile, { width, backgroundColor: pressed ? colors.surfacePressed : colors.surface }]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.brandTint }]}>
        {loading ? <ActivityIndicator size="small" color={colors.brandOnBg} /> : <Icon name={icon} color={colors.brandOnBg} size={20} />}
      </View>
      <Text maxFontSizeMultiplier={1.3} style={[styles.label, { color: colors.text }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg },
  tile: {
    minHeight: size.quickTile,
    borderRadius: radius.lg,
    padding: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: font.sm, lineHeight: 18, fontFamily: family.semibold, textAlign: 'center' },
});
