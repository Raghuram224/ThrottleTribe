import type { StyleProp, ViewStyle } from 'react-native';

import { MapCircleButton } from '@/components/map-controls';
import { copy } from '@/lib/copy';
import type { MapLayer } from '@/lib/dem';
import { useTheme } from '@/theme/use-theme';

interface MapTypeButtonProps {
  layer: MapLayer;
  onPress: () => void;
  /** Home positions it (top / right per mode, 25 §2.1). */
  style?: StyleProp<ViewStyle>;
}

/**
 * Home's map type circle (25 §2.1): the 56 dp map circle that opens the Map type sheet. Standard shows the layers glyph;
 * Terrain shows the terrain glyph and a 2 dp ring, so the state is never colour alone (the ring is always there, transparent
 * in Standard, so the circle never changes size). The value is read out as "Standard" / "Terrain".
 */
export function MapTypeButton({ layer, onPress, style }: MapTypeButtonProps) {
  const { colors } = useTheme();
  const terrain = layer === 'terrain';
  return (
    <MapCircleButton
      icon={terrain ? 'terrain' : 'layers'}
      iconColor={terrain ? colors.brandOnBg : colors.fabIcon}
      ring={terrain ? colors.brandOnBg : 'transparent'}
      accessibilityLabel={copy['mapType.buttonA11y']}
      accessibilityHint={copy['mapType.buttonHint']}
      accessibilityValue={{ text: terrain ? copy['mapType.terrain'] : copy['mapType.standard'] }}
      onPress={onPress}
      style={style}
    />
  );
}
