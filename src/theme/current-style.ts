import type { ThemeStyle } from './tokens';

// The active visual style, mirrored from the prefs store so pure helpers such as `elevate()` can read
// it without every call site threading it through. Components still subscribe via useTheme(), so they
// re-render on a switch and read the new value here.
let current: ThemeStyle = 'tribe';

export function getCurrentStyle(): ThemeStyle {
  return current;
}

export function setCurrentStyle(style: ThemeStyle): void {
  current = style;
}
