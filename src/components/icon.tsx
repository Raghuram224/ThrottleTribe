import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { ICON_GLYPHS, type IconName } from '@/lib/icon-names';

export type { IconName };

interface IconProps {
  name: IconName;
  /** Glyph colour: `onStatus.*` on a status fill, `text` on bg/surface. */
  color: string;
  /** Review sizes: chip 14, map badge 12, banner/button 20, tiles 28. Default 20. */
  size?: number;
}

/**
 * The only icon component. Always hidden from screen readers: the text next to it carries the
 * meaning, so labels never contain symbols.
 */
export function Icon({ name, color, size = 20 }: IconProps) {
  return (
    <MaterialCommunityIcons
      name={ICON_GLYPHS[name]}
      size={size}
      color={color}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
