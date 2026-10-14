import { StyleSheet, type TextStyle } from 'react-native';

import { getCurrentStyle } from './current-style';

/** Design tokens. The only place raw colours and sizes are allowed. */

export const palette = {
  status: {
    moving: '#22C55E',
    stopped: '#F59E0B',
    offline: '#9CA3AF',
    // Rings and map markers only. Surfaces that carry text use sosStrong.
    sos: '#EF4444',
    // SOS surfaces with text (takeover, chip, danger button). White on it = 6.5:1.
    sosStrong: '#B91C1C',
  },
  // Text drawn on top of a status colour.
  onStatus: {
    moving: '#111827',
    stopped: '#111827',
    offline: '#111827',
    sos: '#FFFFFF',
    sosStrong: '#FFFFFF',
  },
  // Default accent; components read the style-resolved `colors.brand` / `colors.me` from useTheme().
  brand: {
    primary: '#F97316',
    onPrimary: '#111827',
  },
  me: '#F97316',
  // Index = ride_members.color_index (0..15). No green/amber/grey/red/orange, so identity never
  // reads as status. All 700/800 shades: white initials >= 5.4:1.
  rider: [
    '#1D4ED8', '#6D28D9', '#BE185D', '#0E7490',
    '#4338CA', '#A21CAF', '#0369A1', '#7E22CE',
    '#0F766E', '#9D174D', '#1E3A8A', '#5B21B6',
    '#155E75', '#86198F', '#312E81', '#854D0E',
  ],
  onRider: '#FFFFFF',
  markerOutline: '#FFFFFF',
  // Dark fill/stroke on the map in both themes (cluster body, 1 px stroke round my dot).
  markerStroke: '#111827',
} as const;

export type ThemeStyle = 'tribe' | 'maps';
export type Scheme = 'light' | 'dark';
export const THEME_STYLES: readonly ThemeStyle[] = ['tribe', 'maps'];
export const DEFAULT_THEME_STYLE: ThemeStyle = 'tribe';

/** Stored style string -> ThemeStyle; anything unknown is the default ('tribe'). */
export function parseThemeStyle(value: string | null): ThemeStyle {
  return (THEME_STYLES as readonly string[]).includes(value ?? '') ? (value as ThemeStyle) : DEFAULT_THEME_STYLE;
}

/** Every colour a component may use. A palette for a new visual style must supply all of them. */
export interface Tokens {
  bg: string;
  surface: string; // tonal fills: secondary buttons, inputs track, skeleton
  surfacePressed: string;
  surfaceRaised: string; // cards, list block, header, action bar, sheets
  text: string;
  textMuted: string;
  textSubtle: string; // timestamps, version. Never glance text
  border: string; // hairline dividers only
  borderStrong: string; // input outline, outline buttons
  meRowBg: string;
  brandTint: string;
  brandOnBg: string; // accent TEXT/icons on bg
  brandPressed: string;
  /** The "Tribe" in the wordmark: static brand orange (readable per scheme), never restyled by a theme style. */
  wordmarkAccent: string;
  /** Primary action fill and the text drawn on it. */
  accent: string;
  onAccent: string;
  /** Me marker / me-row accent. */
  meMarker: string;
  successTint: string;
  movingTint: string;
  onMovingTint: string;
  stoppedTint: string;
  onStoppedTint: string;
  onOfflineTint: string;
  overlayScrim: string;
  sosOnBg: string;
  // Map
  mapStyle: string;
  /** Style layer the route is inserted below (native `beforeId`; the web computes it). */
  routeBeforeId: string;
  routeLine: string;
  routeCasing: string;
  /** Already-crossed part of the leader trail: a neutral, faded line (opacity PASSED_OPACITY). */
  trailPassed: string;
  /** Route to the shared next stop (drawn on my phone only) and the destination pin; casing like the trail. */
  navRoute: string;
  navRouteCasing: string;
  /** Glyph on `navRoute` (stop pin, stop-card tile): >= 4.5:1 in all four palettes. */
  onNavRoute: string;
  /** Turn banner (21 §8): dark blue in both schemes; blue is no status colour, so it never reads as moving, stopped, offline or SOS. */
  navBannerBg: string;
  navBannerThenBg: string;
  onNavBanner: string;
  onNavBannerMuted: string;
  // Controls
  segThumb: string;
  trackLine: string; // convoy track, step rail
  fabBg: string;
  hairlineOnDark: string;
  /** Edge drawn instead of shadows in dark (D3); transparent in light. */
  edge1: string;
  edge2: string;
  /** "Ink" surfaces used in both schemes (welcome, ride-in-progress card). */
  ink: string;
  inkRaised: string;
  paper: string;
  onInkMuted: string;
  onInkSubtle: string;
  inkTrack: string;
  toastBg: string;
  toastText: string;
  /** Soft glow behind the Start button (light only). */
  startGlow: string;
  /** Icon / label on `segThumb`. */
  segThumbIcon: string;
  /** Glyphs on the map circle buttons. */
  fabIcon: string;
  /** Maps: 4 dp band tail -> lead over the convoy track; 'transparent' = not drawn. */
  convoyBand: string;
  /** Maps: GPS accuracy halo and heading-cone colour; 'transparent' in Tribe. */
  meHalo: string;
  /** White ring round the me dot / arrow disc. */
  meRing: string;
  pinStartBg: string;
  pinStartFg: string;
  pinEndBg: string;
  pinEndFg: string;
  /** Style-picker thumbnails only. */
  mapPreviewLand: string;
  mapPreviewPark: string;
  mapPreviewWater: string;
  mapPreviewRoad: string;
  mapPreviewMajor: string;
}

const tribeLight: Tokens = {
  // Grouped: off-white page, white cards (14 §0.3). Depth from surface steps and elevation, not borders.
  bg: '#F5F6F8',
  surface: '#EEF0F3',
  surfacePressed: '#E4E7EB',
  surfaceRaised: '#FFFFFF',
  text: '#111827',
  textMuted: '#4B5563', // 7.6:1 on white
  textSubtle: '#5F6876', // >= 4.9:1 on white, bg and surface
  border: '#E3E6EA',
  borderStrong: '#C4C9D0',
  meRowBg: '#FFF7ED',
  brandTint: '#FFF7ED',
  brandOnBg: '#C2410C', // 5.2:1
  brandPressed: '#EA580C',
  wordmarkAccent: '#C2410C',
  accent: '#F97316',
  onAccent: '#111827',
  meMarker: '#F97316',
  successTint: '#ECFDF5',
  movingTint: '#DCFCE7',
  onMovingTint: '#166534', // 6.5:1
  stoppedTint: '#FEF3C7',
  onStoppedTint: '#92400E', // 7.0:1
  onOfflineTint: '#374151', // 9.2:1 on surface
  overlayScrim: 'rgba(17,24,39,0.6)',
  sosOnBg: '#B91C1C', // 6.5:1 on white
  mapStyle: 'https://tiles.openfreemap.org/styles/positron',
  routeBeforeId: 'waterway_line_label',
  routeLine: '#F97316',
  routeCasing: '#9A3412',
  trailPassed: '#6B7280',
  navRoute: '#2563EB',
  navRouteCasing: '#1E3A8A',
  onNavRoute: '#FFFFFF',
  navBannerBg: '#1E3A8A',
  navBannerThenBg: '#172554',
  onNavBanner: '#FFFFFF',
  onNavBannerMuted: '#DBEAFE',
  segThumb: '#FFFFFF',
  trackLine: '#D5D9DF',
  fabBg: '#FFFFFF',
  hairlineOnDark: 'rgba(255,255,255,0.08)',
  edge1: 'transparent',
  edge2: 'transparent',
  ink: '#0B0F14',
  inkRaised: '#161B22',
  paper: '#F9FAFB',
  onInkMuted: '#C2C8D0',
  onInkSubtle: '#8B95A1',
  inkTrack: '#3A424D',
  toastBg: '#111827',
  toastText: '#F9FAFB',
  startGlow: 'rgba(249,115,22,0.28)',
  segThumbIcon: '#111827',
  fabIcon: '#111827',
  convoyBand: 'transparent',
  meHalo: 'transparent',
  meRing: '#FFFFFF',
  pinStartBg: '#111827',
  pinStartFg: '#FFFFFF',
  pinEndBg: '#F97316',
  pinEndFg: '#111827',
  mapPreviewLand: '#F2F3F0',
  mapPreviewPark: '#E6E9E5',
  mapPreviewWater: '#C2C8CA',
  mapPreviewRoad: '#FFFFFF',
  mapPreviewMajor: '#FFFFFF',
};

const tribeDark: Tokens = {
  bg: '#0B0F14',
  surface: '#1F2630',
  surfacePressed: '#28303B',
  surfaceRaised: '#161B22',
  text: '#F9FAFB',
  textMuted: '#C2C8D0',
  textSubtle: '#8B95A1', // 5.7:1
  border: '#262D36',
  borderStrong: '#3D4652',
  meRowBg: '#24160B',
  brandTint: '#24160B',
  brandOnBg: '#FB923C', // 8.5:1
  brandPressed: '#EA580C',
  wordmarkAccent: '#FB923C',
  accent: '#F97316',
  onAccent: '#111827',
  meMarker: '#F97316',
  successTint: '#0C2A1B',
  movingTint: '#0F2E1D',
  onMovingTint: '#86EFAC', // 10:1
  stoppedTint: '#3A2A08',
  onStoppedTint: '#FCD34D', // 10:1
  onOfflineTint: '#C2C8D0',
  overlayScrim: 'rgba(0,0,0,0.7)',
  sosOnBg: '#FCA5A5', // 8.9:1
  mapStyle: 'https://tiles.openfreemap.org/styles/dark',
  routeBeforeId: 'highway_name_other',
  routeLine: '#FB923C',
  routeCasing: '#0B0F14',
  trailPassed: '#9CA3AF',
  navRoute: '#60A5FA',
  navRouteCasing: '#0B0F14',
  onNavRoute: '#0B0F14',
  navBannerBg: '#1E3A8A',
  navBannerThenBg: '#172554',
  onNavBanner: '#FFFFFF',
  onNavBannerMuted: '#DBEAFE',
  segThumb: '#343D49',
  trackLine: '#3A424D',
  fabBg: '#1F2630',
  hairlineOnDark: 'rgba(255,255,255,0.08)',
  edge1: 'rgba(255,255,255,0.06)',
  edge2: 'rgba(255,255,255,0.08)',
  ink: '#0B0F14',
  inkRaised: '#161B22',
  paper: '#F9FAFB',
  onInkMuted: '#C2C8D0',
  onInkSubtle: '#8B95A1',
  inkTrack: '#3A424D',
  toastBg: '#161B22',
  toastText: '#F9FAFB',
  startGlow: 'transparent',
  segThumbIcon: '#F9FAFB',
  fabIcon: '#F9FAFB',
  convoyBand: 'transparent',
  meHalo: 'transparent',
  meRing: '#FFFFFF',
  pinStartBg: '#F9FAFB',
  pinStartFg: '#111827',
  pinEndBg: '#F97316',
  pinEndFg: '#111827',
  mapPreviewLand: '#0C0C0C',
  mapPreviewPark: '#202020',
  mapPreviewWater: '#1B1B1D',
  mapPreviewRoad: '#2A2A2A',
  mapPreviewMajor: '#3C3C3C',
};

// Maps: the familiar road-map look (17). Status, SOS, rider and identity tokens are inherited unchanged
// from Tribe (17 §0): only chrome, accent, route, basemap and map-marker tokens differ.
const mapsLight: Tokens = {
  ...tribeLight,
  bg: '#F8F9FA',
  surface: '#F1F3F4',
  surfacePressed: '#E8EAED',
  surfaceRaised: '#FFFFFF',
  text: '#202124',
  textMuted: '#5F6368',
  textSubtle: '#686C71',
  border: '#E8EAED',
  borderStrong: '#80868B',
  meRowBg: '#E8F0FE',
  brandTint: '#E8F0FE',
  brandOnBg: '#1967D2',
  brandPressed: '#185ABC',
  accent: '#1A73E8',
  onAccent: '#FFFFFF',
  meMarker: '#1A73E8',
  overlayScrim: 'rgba(32,33,36,0.6)',
  mapStyle: 'https://tiles.openfreemap.org/styles/liberty',
  routeBeforeId: 'waterway_line_label',
  routeLine: '#1A73E8',
  routeCasing: '#185ABC',
  trailPassed: '#5F6368',
  navRoute: '#1A73E8',
  navRouteCasing: '#174EA6',
  onNavRoute: '#FFFFFF',
  navBannerBg: '#174EA6',
  navBannerThenBg: '#0D3A85',
  onNavBanner: '#FFFFFF',
  onNavBannerMuted: '#DBEAFE',
  segThumb: '#D2E3FC',
  trackLine: '#DADCE0',
  fabBg: '#FFFFFF',
  edge1: '#DADCE0',
  edge2: 'transparent',
  toastBg: '#303134',
  toastText: '#F1F3F4',
  startGlow: 'transparent',
  segThumbIcon: '#174EA6',
  fabIcon: '#1967D2',
  convoyBand: '#A8C7FA',
  meHalo: 'rgba(26,115,232,0.16)',
  pinStartBg: '#3C4043',
  pinStartFg: '#FFFFFF',
  pinEndBg: '#1A73E8',
  pinEndFg: '#FFFFFF',
  mapPreviewLand: '#F8F4F0',
  mapPreviewPark: '#D8E8C8',
  mapPreviewWater: '#9EBDFF',
  mapPreviewRoad: '#FFFFFF',
  mapPreviewMajor: '#FFEEAA',
};

const mapsDark: Tokens = {
  ...tribeDark,
  bg: '#1B1C1E',
  surface: '#2F3135',
  surfacePressed: '#3A3C40',
  surfaceRaised: '#232427',
  text: '#E8EAED',
  textMuted: '#BDC1C6',
  textSubtle: '#9AA0A6',
  border: '#34363A',
  borderStrong: '#5F6368',
  meRowBg: '#1C2B41',
  brandTint: '#1C2B41',
  brandOnBg: '#8AB4F8',
  brandPressed: '#A8C7FA',
  accent: '#8AB4F8',
  onAccent: '#202124',
  meMarker: '#8AB4F8',
  overlayScrim: 'rgba(0,0,0,0.7)',
  mapStyle: 'https://tiles.openfreemap.org/styles/fiord',
  routeBeforeId: 'water_name',
  routeLine: '#8AB4F8',
  routeCasing: '#1B3A6B',
  trailPassed: '#9AA0A6',
  navRoute: '#8AB4F8',
  navRouteCasing: '#1B3A6B',
  onNavRoute: '#0B0F14',
  navBannerBg: '#174EA6',
  navBannerThenBg: '#0D3A85',
  onNavBanner: '#FFFFFF',
  onNavBannerMuted: '#DBEAFE',
  segThumb: '#2D4A77',
  trackLine: '#44474C',
  fabBg: '#2F3135',
  edge1: '#3C4043',
  edge2: 'rgba(255,255,255,0.10)',
  toastBg: '#3C4043',
  toastText: '#E8EAED',
  startGlow: 'transparent',
  segThumbIcon: '#D2E3FC',
  fabIcon: '#8AB4F8',
  convoyBand: '#4A6FA8',
  meHalo: 'rgba(138,180,248,0.18)',
  pinStartBg: '#E8EAED',
  pinStartFg: '#202124',
  pinEndBg: '#8AB4F8',
  pinEndFg: '#062E6F',
  mapPreviewLand: '#45516E',
  mapPreviewPark: '#4A5D6B',
  mapPreviewWater: '#38435C',
  mapPreviewRoad: '#5A6A8C',
  mapPreviewMajor: '#3C4357',
};

/**
 * One entry per visual style. To add a style: extend `ThemeStyle`, add a `{ light, dark }` pair here
 * (TypeScript enforces every token), a `styleTraits` entry below, and list it in `THEME_STYLES` and the
 * Profile > Appearance picker.
 */
export const palettes: Record<ThemeStyle, { light: Tokens; dark: Tokens }> = {
  tribe: { light: tribeLight, dark: tribeDark },
  maps: { light: mapsLight, dark: mapsDark },
};

/** Non-colour shape decisions per style (17 §2). Heights and hit areas never change. */
export interface StyleTraits {
  buttonRadius: number;
  segRadius: number;
  segThumbRadius: number;
  segThumbShadow: boolean;
  cardElevation: 'shadow' | 'outline';
  meMarker: 'arrow' | 'dot';
  heroCard: 'ink' | 'surface';
  startIcon: 'mark' | 'navigation-variant';
  /** Selected text segment also shows a check (a non-colour cue). */
  segCheck: boolean;
}

export const styleTraits: Record<ThemeStyle, StyleTraits> = {
  tribe: {
    buttonRadius: 16,
    segRadius: 12,
    segThumbRadius: 9,
    segThumbShadow: true,
    cardElevation: 'shadow',
    meMarker: 'arrow',
    heroCard: 'ink',
    startIcon: 'mark',
    segCheck: true,
  },
  maps: {
    buttonRadius: 999,
    segRadius: 999,
    segThumbRadius: 999,
    segThumbShadow: false,
    cardElevation: 'outline',
    meMarker: 'dot',
    heroCard: 'surface',
    startIcon: 'navigation-variant',
    segCheck: true,
  },
};

/** Pure resolution of (style, scheme) to tokens; unknown styles fall back to the default. */
export function resolveTokens(style: ThemeStyle, scheme: Scheme): Tokens {
  return (palettes[style] ?? palettes[DEFAULT_THEME_STYLE])[scheme];
}

export function resolveTraits(style: ThemeStyle): StyleTraits {
  return styleTraits[style] ?? styleTraits[DEFAULT_THEME_STYLE];
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const font = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, xxl: 36 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Font families. Weight is chosen by family, never by fontWeight (Android fake-bolds a single-weight family). */
export const family = {
  regular: 'Inter_400Regular',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Type scale (14 §0.2): size, line height, tracking. */
export const type = {
  display: { size: 36, line: 40, track: -0.8 },
  title: { size: 28, line: 34, track: -0.5 },
  glance: { size: 28, line: 32, track: -0.5 },
  heading: { size: 20, line: 26, track: -0.2 },
  bodyStrong: { size: 16, line: 22, track: 0 },
  body: { size: 16, line: 24, track: 0 },
  caption: { size: 14, line: 20, track: 0 },
  label: { size: 12, line: 16, track: 0.6 },
} as const;

/** Elevation (14 §0.4). Light only: shadows are invisible on dark, which uses surface steps. */
export const elevation = {
  e0: {},
  e1: { shadowColor: '#0B0F14', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  e2: { shadowColor: '#0B0F14', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  e3: { shadowColor: '#0B0F14', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
} as const;

/** Glove-friendly minimum touch target. */
export const touchTarget = 56;

export const size = {
  avatar: 40, // rider avatar in rows, map marker
  avatarSos: 56, // SOS marker
  meDot: 24,
  statusRing: 4,
  rowLive: 72, // live rider row
  rowMe: 56, // me reference row
  mapControl: 56, // map circles and the Re-centre pill (20 C1)
  sheetInfoRow: 64, // stop card, solo invite row, load-error row (20 C6)
  actionCard: 72, // ActionCard (13 §0.1)
  settingsRow: 64,
  contactRow: 72,
  statTile: 96,
  heroIcon: 64, // icon glyph size in heroes
  chip: 48, // suggestion chips (13 §4)
  rowMember: 64, // lobby row
  actionBar: 72, // bottom ride controls
  header: 64, // ride header
  codeBox: { w: 48, h: 64 },
  navBanner: 96, // turn banner main row (21 §8)
  navThenRow: 40, // "Then" row under it
  maneuverIcon: 48, // banner arrow
  searchBar: 56, // map home floating search bar (= touchTarget; named for the camera padding maths, 22 §9)
  quickTile: 80, // map home sheet tile minimum height
  sheetHeader: 56, // map home sheet header (grabber + text + chevron)
} as const;

/** Animation durations in ms (13 §0.1). Easing: Easing.out(Easing.cubic); no spring or bounce on ride screens. */
export const motion = {
  fast: 150, // banners, row insert, crossfades
  base: 200, // sheet content, re-sort
  slow: 300, // screen-level hero entrance
  stagger: 60, // list/tile entrance step
  countUp: 600, // summary numbers
  press: 90, // press-in scale
  release: 160, // press-out scale
  layout: 220, // row re-sort, segmented thumb
  enter: 320, // entrances
  glide: 600, // convoy dots
  pulse: 1400, // halo loops
} as const;

export const timing = {
  sosHoldMs: 2000, // hold to send SOS
  sosCancelHoldMs: 2000, // hold to cancel my SOS
  offlineDebounceMs: 5000,
  bannerMessageMs: 8000, // message / sos_cleared (back online = 3000)
  bannerStatusMs: 15000, // stopped / offline
  fitIdleMs: 30000, // auto re-fit map after user stops panning
} as const;

/**
 * Elevation for the active style and scheme. Shadows in light; in dark a hairline edge instead (shadows
 * are invisible there). Maps draws cards (e1) as a flat 1 dp outline in both schemes (17 §2).
 */
export function elevate(level: keyof typeof elevation, scheme: Scheme) {
  const style = getCurrentStyle();
  const t = resolveTokens(style, scheme);
  if (level === 'e1' && resolveTraits(style).cardElevation === 'outline') {
    return { borderWidth: 1, borderColor: t.edge1 };
  }
  if (scheme === 'light') return elevation[level];
  if (level === 'e0') return elevation.e0;
  return { borderWidth: StyleSheet.hairlineWidth, borderColor: level === 'e1' ? t.edge1 : t.edge2 };
}

/** Every distance, time and code uses tabular digits so numbers do not jitter. */
export const fontNumeric: TextStyle = { fontVariant: ['tabular-nums'] };
