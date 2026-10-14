import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { copy } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { family, font, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface QuickTilesProps {
  onGroup: () => void;
  onJoin: () => void;
  onSolo: () => void;
  /** "Just ride solo" is starting: its icon shows a spinner and further taps are ignored. */
  soloLoading: boolean;
}

/**
 * The three equal tiles of the home sheet (22 §3.1.3): Start a group ride, Join with a code, Just ride solo.
 * Tonal on purpose: the screen's primary is the search bar.
 */
export function QuickTiles({ onGroup, onJoin, onSolo, soloLoading }: QuickTilesProps) {
  const { width } = useWindowDimensions();
  // (window - 2 x 16 padding - 2 x 8 gaps) / 3 = 104 at 360.
  const tileW = Math.floor((width - 2 * space.lg - 2 * space.sm) / 3);
  return (
    <View style={styles.row}>
      <Tile
        width={tileW}
        icon="riders"
        label={copy['homeMap.tileGroup']}
        a11y={copy['homeMap.tileGroupA11y']}
        onPress={onGroup}
      />
      <Tile width={tileW} icon="dialpad" label={copy['homeMap.tileJoin']} a11y={copy['homeMap.tileJoinA11y']} onPress={onJoin} />
      <Tile
        width={tileW}
        icon="bike"
        label={copy['homeMap.tileSolo']}
        a11y={copy['homeMap.tileSoloA11y']}
        loading={soloLoading}
        onPress={onSolo}
      />
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
