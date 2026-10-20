// Pure rules for the live screen's chrome (docs/design/20): which panel, which map controls, what the
// camera must keep clear. No React.
import type { ConnectionState } from '@/hooks/use-connection';
import { meSlotMinMapH, type PillLines } from '@/lib/credits';
import { size, space } from '@/theme/tokens';

/** Full-map stop chip height; it floats at the top of the map, so the camera counts it (20 C2). */
export const STOP_CHIP_H = 40;

/**
 * Right "view" column (2 circles) needs 2x56 + 12 gap + 12 bottom + 12 top + 28 attribution. Under this
 * much visible map the column hides.
 */
export const RIGHT_COLUMN_MIN_MAP_H = 2 * size.mapControl + 3 * space.md + 28;
// The bottom-left "me" slot (bubble or Re-centre) hides under `meSlotMinMapH(creditLines, fontScale)` of visible map:
// 104 / 124 / 144 for a one / two / three-line credit pill (25 §5.1).

/** Solo panel when I am the only active member (or everyone else left); the group sheet otherwise and while loading. */
export function panelVariant(loaded: boolean, activeCount: number): 'solo' | 'group' {
  return loaded && activeCount <= 1 ? 'solo' : 'group';
}

/** Visible map height: the area minus what floats over the top and the sheet at its current snap. */
export function mapVisibleHeight(areaH: number, topInset: number, sheetH: number): number {
  return Math.max(0, areaH - topInset - sheetH);
}

export interface MapControlVisibility {
  /** Full-map toggle (and fit-all when `fitAll`). */
  rightColumn: boolean;
  /** Fit-all circle: needs 2+ riders with a position (solo: "all riders" is just me). */
  fitAll: boolean;
  /**
   * Voice toggle, top of the right column (21 §4.4): while navigating, and only when fit-all is not there (the
   * column holds two circles at most, C1): in a ride of one. In a group the toggle lives in the ⋯ menu only.
   */
  voice: boolean;
  /** Bottom-left slot: speed bubble while following, Re-centre pill otherwise. */
  meSlot: boolean;
}

export function mapControlVisibility(args: {
  /** The expanded sheet leaves no map to control. */
  controlsHidden: boolean;
  mapVisH: number;
  positionedRiders: number;
  /** Navigation is on (the voice toggle has something to govern). */
  navActive?: boolean;
  /** Lines in the credit pill (a road route, Terrain): the me slot needs more room for each. */
  creditLines?: PillLines;
  /** The system font scale: the pill's lines grow with it (to 1.3), and so does the room the me slot needs. */
  fontScale?: number;
}): MapControlVisibility {
  const { controlsHidden, mapVisH, positionedRiders, navActive = false, creditLines = 1, fontScale = 1 } = args;
  const fitAll = positionedRiders >= 2;
  return {
    rightColumn: !controlsHidden && mapVisH >= RIGHT_COLUMN_MIN_MAP_H,
    fitAll,
    voice: navActive && !fitAll,
    meSlot: !controlsHidden && mapVisH >= meSlotMinMapH(creditLines, fontScale),
  };
}

/**
 * What the bottom-left slot shows: the bubble and Re-centre never appear together. Following with a
 * known speed = bubble, following while stopped = nothing, free or overview = Re-centre.
 */
export function meSlotKind(mode: 'follow' | 'free' | 'overview', speedKmh: number | null): 'speed' | 'recentre' | null {
  if (mode === 'follow') return speedKmh != null ? 'speed' : null;
  return 'recentre';
}

/**
 * Header search icon: live rides only, and not while the connection pill shows (the pill takes its
 * place; search needs a connection and both do not fit beside the title on 360 dp).
 */
export function headerSearchVisible(args: { child: string | null; rideLive: boolean; connection: ConnectionState }): boolean {
  return args.child === 'live' && args.rideLive && args.connection === 'live';
}

/**
 * Full-map camera inset: status bar / SOS banners (`fullTop`), plus the card floating under them (the nav banner,
 * else the stop chip) and its gap. `topCardH` is that card's height, 0 for none (21 §2.6).
 */
export function fullMapTopInset(fullTop: number, topCardH: number): number {
  return fullTop + (topCardH > 0 ? topCardH + space.sm : 0);
}

/**
 * Height of the card floating at the top of the full map: the nav banner (96, or 136 with its Then row) when it
 * is shown, else the stop chip (40) when that is, else 0. The banner replaces the chip while navigating.
 */
export function fullMapTopCardH(a: { navBannerH: number; stopChip: boolean }): number {
  if (a.navBannerH > 0) return a.navBannerH;
  return a.stopChip ? STOP_CHIP_H : 0;
}

/** Height the docked turn banner takes: 0 when there is none, else 96 plus the 40 Then row (21 §2.5). */
export function navBannerHeight(a: { bannerShown: boolean; thenRow: boolean }): number {
  if (!a.bannerShown) return 0;
  return size.navBanner + (a.thenRow ? size.navThenRow : 0);
}

/**
 * What the sheet-mode camera must keep clear at the top of the live area (20 C2): the docked banner (with its
 * Then row) and, under it, the convoy strip (`convoyH`, 0 when none). Both float over the map, so the camera counts both.
 */
export function navTopInset(a: { navBannerH: number; convoyH: number }): number {
  return a.navBannerH + a.convoyH;
}

/**
 * The header's connection pill (26 L2): what the phone has decides the wording. The ride channel being down while the
 * phone has network is "Connecting" (the banner says "Reconnecting"); "Offline" only when the phone itself has no network.
 * Null = no pill (healthy).
 */
export function connectionPill(
  connection: ConnectionState,
  netOffline: boolean,
): { icon: 'connecting' | 'offline'; labelKey: 'live.connConnecting' | 'live.connOffline' } | null {
  if (connection === 'live') return null;
  if (connection === 'offline' && netOffline) return { icon: 'offline', labelKey: 'live.connOffline' };
  return { icon: 'connecting', labelKey: 'live.connConnecting' };
}
