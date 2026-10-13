import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

import type { RiderStatus } from '@/lib/rider-status';
import { usePrefsStore } from '@/store/prefs-store';

import { palette, resolveTokens, resolveTraits, type Scheme, type ThemeStyle } from './tokens';

/** Forces a style for a subtree: welcome and onboarding are always Tribe (17 §0.3). */
const StyleOverride = createContext<ThemeStyle | null>(null);
export const ThemeStyleOverride = StyleOverride.Provider;

/**
 * Colours for the active (style, scheme), plus the scheme-independent palette.
 * The stored Auto/Light/Dark preference wins over the system scheme; `themeStyle` picks the palette.
 * `brand` and `me` are overridden from the style's accent so existing components follow the style.
 */
export function useTheme() {
  const pref = usePrefsStore((s) => s.themePref);
  const chosenStyle = usePrefsStore((s) => s.themeStyle);
  const style = useContext(StyleOverride) ?? chosenStyle;
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const scheme: Scheme = pref === 'auto' ? system : pref;
  const tokens = resolveTokens(style, scheme);
  return {
    colors: {
      ...palette,
      ...tokens,
      brand: { primary: tokens.accent, onPrimary: tokens.onAccent },
      me: tokens.meMarker,
    },
    scheme,
    style,
    traits: resolveTraits(style),
  } as const;
}

/** Fill and text colours for a rider status. SOS uses the strong red so white text passes contrast. */
export function statusColors(status: RiderStatus): { bg: string; fg: string } {
  if (status === 'sos') return { bg: palette.status.sosStrong, fg: palette.onStatus.sosStrong };
  return { bg: palette.status[status], fg: palette.onStatus[status] };
}
