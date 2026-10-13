import { Appearance } from 'react-native';
import { create } from 'zustand';

import { setHapticsEnabled } from '@/lib/haptics';
import { setCurrentStyle } from '@/theme/current-style';
import { parseThemeStyle, type ThemeStyle } from '@/theme/tokens';
import type { SheetSnap } from '@/lib/live-sheet';
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

export type ThemePref = 'auto' | 'light' | 'dark';
export const STOP_THRESHOLDS_S = [60, 180, 300] as const;
export const DEFAULT_STOP_THRESHOLD_S = 180;

export function parseThemePref(value: string | null): ThemePref {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

export function parseThreshold(value: string | null): number {
  const n = Number(value);
  return (STOP_THRESHOLDS_S as readonly number[]).includes(n) ? n : DEFAULT_STOP_THRESHOLD_S;
}

/** Also tells the OS, so the status bar and system dialogs follow the chosen theme. */
function applyAppearance(pref: ThemePref): void {
  try {
    // 'unspecified' hands control back to the system.
    Appearance.setColorScheme(pref === 'auto' ? 'unspecified' : pref);
  } catch {
    // useTheme reads the preference directly, so this is only cosmetic.
  }
}

interface PrefsState {
  themePref: ThemePref;
  themeStyle: ThemeStyle;
  setThemeStyle: (style: ThemeStyle) => void;
  stopThresholdS: number;
  /** Live rider sheet position. Remembered for the session only: every launch starts half open. */
  liveSheetSnap: SheetSnap;
  setLiveSheetSnap: (snap: SheetSnap) => void;
  /** Follow camera tilt (45 degrees). Off = flat 2D map. Default on. */
  mapTilt: boolean;
  setMapTilt: (on: boolean) => void;
  /** Vibration feedback (13 §0.3), default on. SOS haptics ignore it. */
  haptics: boolean;
  setHaptics: (on: boolean) => void;
  setThemePref: (pref: ThemePref) => void;
  setStopThresholdS: (seconds: number) => void;
}

const initialTheme = parseThemePref(readItem(STORAGE_KEYS.themePref));
applyAppearance(initialTheme);
const initialStyle = parseThemeStyle(readItem(STORAGE_KEYS.themeStyle));
setCurrentStyle(initialStyle);
const initialHaptics = readItem(STORAGE_KEYS.haptics) !== '0';
setHapticsEnabled(initialHaptics);

export const usePrefsStore = create<PrefsState>((set) => ({
  haptics: initialHaptics,
  setHaptics: (on) => {
    writeItem(STORAGE_KEYS.haptics, on ? '1' : '0');
    setHapticsEnabled(on);
    set({ haptics: on });
  },
  themePref: initialTheme,
  themeStyle: initialStyle,
  setThemeStyle: (style) => {
    writeItem(STORAGE_KEYS.themeStyle, style);
    // Before set(): subscribers re-render inside set() and elevate() must already see the new style.
    setCurrentStyle(style);
    set({ themeStyle: style });
  },
  stopThresholdS: parseThreshold(readItem(STORAGE_KEYS.stopThresholdS)),
  liveSheetSnap: 'half',
  setLiveSheetSnap: (snap) => set({ liveSheetSnap: snap }),
  mapTilt: readItem(STORAGE_KEYS.mapTilt) !== '0',
  setMapTilt: (on) => {
    writeItem(STORAGE_KEYS.mapTilt, on ? '1' : '0');
    set({ mapTilt: on });
  },
  setThemePref: (pref) => {
    writeItem(STORAGE_KEYS.themePref, pref);
    applyAppearance(pref);
    set({ themePref: pref });
  },
  setStopThresholdS: (seconds) => {
    writeItem(STORAGE_KEYS.stopThresholdS, String(seconds));
    set({ stopThresholdS: seconds });
  },
}));

export function getPendingJoinCode(): string | null {
  const code = readItem(STORAGE_KEYS.pendingJoinCode);
  return code && /^\d{6}$/.test(code) ? code : null;
}

export function setPendingJoinCode(code: string | null): void {
  writeItem(STORAGE_KEYS.pendingJoinCode, code);
}
