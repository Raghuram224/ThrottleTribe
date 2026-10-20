// Pure decisions of the map home (docs/design/22): the mode machine, back stack, sheet content, me slot,
// when the map is mounted, how a route's two actions branch. No React, no router, no native modules.
import { attributionClear, pillHeight, type PillLines } from '@/lib/credits';
import { copy, t } from '@/lib/copy';
import { formatDistance } from '@/lib/format';
import type { LatLng } from '@/lib/geo';
import type { PlaceCategory } from '@/lib/place-search';

export type PlanMode = 'browse' | 'place' | 'route';
/** How the place came in: decides what Back does from the route (a search result steps back to its place sheet). */
export type PlanFrom = 'search' | 'recent' | null;
export type HomeSnap = 'peek' | 'expanded';

export interface PlanCamera {
  lat: number;
  lng: number;
  zoom: number;
}

/** What the map camera is asked to do (22 §2.2); re-run when `intentNonce` changes, or when what it frames changes. */
export type CameraIntent =
  /** Ease to my fix (zoom omitted = keep the current zoom). */
  | { kind: 'me'; zoom?: number }
  | { kind: 'place'; zoom: number }
  /** Fit the route (+ me + destination). */
  | { kind: 'fit' }
  /** Back to the browse camera I left. */
  | { kind: 'restore'; camera: PlanCamera }
  | { kind: 'none' };

// ---------------------------------------------------------------- constants (22 §9)

/** India at country zoom: what the map shows with no fix and no saved camera. */
export const HOME_FALLBACK_CAMERA: PlanCamera = { lat: 20.59, lng: 78.96, zoom: 4 };
export const HOME_ME_ZOOM = 15;
export const HOME_PLACE_ZOOM = 15;
export const HOME_CAMERA_SAVE_MS = 5000;
export const PEEK_TWO_ROWS_MIN_H = 760;
/** Bottom-left controls clear the credit pill (22 §3.1.1 item 5, 24 §4.2): 40 for one line, 56 for two. */
export { attributionClear };

// ---------------------------------------------------------------- back stack (22 §2.1, §5.1)

export interface PlanBackInput {
  mode: PlanMode;
  from: PlanFrom;
  sheetSnap: HomeSnap;
}

export interface PlanBackResult {
  mode: PlanMode;
  sheetSnap: HomeSnap;
}

/**
 * What Back does: route -> place (picked from a search) or browse (a recent), place -> browse, an expanded
 * sheet -> peek. Null = nothing left to undo (the OS leaves the app).
 */
export function planBack(s: PlanBackInput): PlanBackResult | null {
  if (s.mode === 'route') return { mode: s.from === 'search' ? 'place' : 'browse', sheetSnap: s.sheetSnap };
  if (s.mode === 'place') return { mode: 'browse', sheetSnap: s.sheetSnap };
  if (s.sheetSnap === 'expanded') return { mode: 'browse', sheetSnap: 'peek' };
  return null;
}

// ---------------------------------------------------------------- the open ride (22 §3.10)

export interface OpenRideLite {
  id: string;
  status: 'lobby' | 'active' | 'ended';
  role: 'leader' | 'rider';
}

export type OpenRideCard = 'none' | 'active' | 'lobby';

/** Which "ride in progress" card the sheet shows (and so whether the tiles and recents are hidden). */
export function openRideCard(open: Pick<OpenRideLite, 'status'> | null): OpenRideCard {
  if (!open || open.status === 'ended') return 'none';
  return open.status === 'active' ? 'active' : 'lobby';
}

export type SearchBarTarget = { kind: 'where-to' } | { kind: 'stops'; href: string };

/** The search bar: Where to? normally; with a ride in progress the in-ride stop search (19 A). */
export function searchBarTarget(open: Pick<OpenRideLite, 'id' | 'status'> | null): SearchBarTarget {
  if (open && open.status === 'active') return { kind: 'stops', href: `/ride/${open.id}/search?from=home` };
  return { kind: 'where-to' };
}

/** What a Where to? search opened from the bar / a chip / the place bar asks for (route params). */
export function whereToHref(o: { focus?: boolean; chip?: string; q?: string }): string {
  const q = new URLSearchParams();
  if (o.q) q.set('q', o.q);
  else if (o.chip) q.set('chip', o.chip);
  else if (o.focus) q.set('focus', '1');
  const s = q.toString();
  return s ? `/where-to?${s}` : '/where-to';
}

// ---------------------------------------------------------------- sheet content (22 §3.1.2)

export type SheetBlock =
  | 'firstSub'
  | 'tiles'
  | 'recentPeek'
  | 'rideCard'
  | 'recentPlaces'
  | 'locationRow'
  | 'steps'
  | 'nudge'
  | 'stats'
  | 'recentRides';

export interface SheetBlocksInput {
  firstRun: boolean;
  openRide: OpenRideCard;
  recentPlaces: number;
  locationGranted: boolean;
  hasNudge: boolean;
  hasStats: boolean;
  /** Recent rides are shown unless they failed to load. */
  showRecentRides: boolean;
}

export interface SheetBlocks {
  /** Always visible. */
  peek: SheetBlock[];
  /** Under the peek block, visible when the sheet is expanded. */
  expanded: SheetBlock[];
}

/** Which blocks the Home sheet holds, per state, in order. */
export function homeSheetBlocks(i: SheetBlocksInput): SheetBlocks {
  const nudge: SheetBlock[] = i.hasNudge ? ['nudge'] : [];
  const rides: SheetBlock[] = i.showRecentRides ? ['recentRides'] : [];
  const location: SheetBlock[] = i.locationGranted ? [] : ['locationRow'];
  if (i.openRide !== 'none') {
    // The tiles and the recent places would start a second ride: hidden. One primary: Back to ride.
    return {
      peek: ['rideCard'],
      expanded: [...nudge, ...(i.openRide === 'lobby' && i.recentPlaces > 0 ? (['recentPlaces'] as SheetBlock[]) : []), ...rides],
    };
  }
  if (i.firstRun) {
    return { peek: ['firstSub', 'tiles'], expanded: [...location, 'steps', ...nudge] };
  }
  return {
    peek: ['tiles', ...(i.recentPlaces > 0 ? (['recentPeek'] as SheetBlock[]) : [])],
    expanded: [
      ...(i.recentPlaces > 0 ? (['recentPlaces'] as SheetBlock[]) : []),
      ...location,
      ...nudge,
      ...(i.hasStats ? (['stats'] as SheetBlock[]) : []),
      ...rides,
    ],
  };
}

/** First run: no rides ever (known, not just not loaded yet) and no ride open. */
export function isFirstRun(rides: readonly unknown[] | null, hasOpenRide: boolean): boolean {
  return rides !== null && rides.length === 0 && !hasOpenRide;
}

/** The sheet opens expanded once, on the first run; every other open (and every return) is the peek. */
export function initialSheetSnap(firstRun: boolean, firstRunSeen: boolean): HomeSnap {
  return firstRun && !firstRunSeen ? 'expanded' : 'peek';
}

/** The welcome is "seen" the first time the rider collapses the sheet (or creates a ride). */
export function firstRunSeenOnSnap(firstRun: boolean, firstRunSeen: boolean, next: HomeSnap): boolean {
  return firstRun && !firstRunSeen && next === 'peek';
}

/** Recent place rows in the peek: 2 on a tall phone, 1 on a short one, never more than there are. */
export function peekRecentCount(windowH: number, available: number): number {
  const want = windowH >= PEEK_TWO_ROWS_MIN_H ? 2 : 1;
  return Math.max(0, Math.min(want, available));
}

/** A release faster than this (dp/s) is a fling: it goes the way it was thrown. Same as the live sheet. */
export const HOME_FLING_VELOCITY = 800;
const PROJECT_S = 0.2;

/**
 * Where the sheet settles after a drag. `velocityY` is the finger velocity in dp/s, positive = downward (the
 * sheet shrinking). A fling decides alone; otherwise the release point, projected 0.2 s ahead, picks the
 * nearer of the two heights.
 */
export function settleHomeSnap(a: { visibleH: number; velocityY: number; peekH: number; expandedH: number }): HomeSnap {
  if (Math.abs(a.velocityY) >= HOME_FLING_VELOCITY) return a.velocityY < 0 ? 'expanded' : 'peek';
  const projected = a.visibleH - a.velocityY * PROJECT_S;
  return Math.abs(projected - a.expandedH) < Math.abs(projected - a.peekH) ? 'expanded' : 'peek';
}

/** Header tap / chevron / screen-reader step: the other snap, or the one asked for. */
export function toggleHomeSnap(snap: HomeSnap): HomeSnap {
  return snap === 'peek' ? 'expanded' : 'peek';
}

// ---------------------------------------------------------------- the map (22 §4)

/** Paths where the home map stays mounted (instant return from search); elsewhere only one GL map runs. */
export function homeMapMounted(pathname: string): boolean {
  const p = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  return p === '/home' || p === '/where-to' || p === '/route-preview';
}

/**
 * Where the map attribution lives (never hidden while a map shows): on the map, just above the sheet, at peek;
 * in the sheet's own footer row when it is expanded, because an expanded sheet reaches up under the search bar
 * and a pill on the map would float against the bar. Decided by the snap, not by measured heights, so the
 * sheet's height does not depend on where the attribution is.
 */
export function attributionInSheet(snap: HomeSnap): boolean {
  return snap === 'expanded';
}

/** Opacity of the on-map attribution while the sheet is dragged up: gone well before it reaches the bar. */
export function attributionFade(visibleH: number, peekH: number, expandedH: number): number {
  'worklet';
  const range = expandedH - peekH;
  if (range <= 0) return 1;
  const t = Math.min(1, Math.max(0, (visibleH - peekH) / (range * 0.25)));
  return 1 - t;
}

export type MeSlot = 'none' | 'recentre' | 'finding' | 'show';

export interface MeSlotInput {
  /** Foreground location permission as `usePlanningPosition` reports it. */
  permission: 'unknown' | 'granted' | 'denied' | 'undetermined';
  /** Location services switched on in the phone (null = not read yet). */
  servicesEnabled: boolean | null;
  hasFix: boolean;
  /** The rider moved the camera. */
  cameraFree: boolean;
  sheetExpanded: boolean;
}

/** The one bottom-left element (22 §3.1.1 item 5). */
export function meSlotForHome(i: MeSlotInput): MeSlot {
  if (i.sheetExpanded) return 'none';
  if (i.permission === 'unknown') return 'none';
  if (i.permission !== 'granted' || i.servicesEnabled === false) return 'show';
  if (!i.hasFix) return 'finding';
  return i.cameraFree ? 'recentre' : 'none';
}

/** The saved browse camera is written at most once per 5 s. */
export function shouldSaveCamera(lastSavedAt: number | null, now: number): boolean {
  return lastSavedAt === null || now - lastSavedAt >= HOME_CAMERA_SAVE_MS;
}

/** About 100 m: no more precision than a camera needs (it is location history, 22 §4.2). */
export function roundCamera(c: PlanCamera): PlanCamera {
  const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
  return { lat: r(c.lat, 3), lng: r(c.lng, 3), zoom: r(c.zoom, 1) };
}

export function parseCamera(raw: string | null | undefined): PlanCamera | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const { lat, lng, zoom } = v;
    if (typeof lat !== 'number' || typeof lng !== 'number' || typeof zoom !== 'number') return null;
    if (![lat, lng, zoom].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || zoom < 0 || zoom > 24) return null;
    return { lat, lng, zoom };
  } catch {
    return null;
  }
}

/** The first frame: the saved camera, else my fix at street level, else India. */
export function initialCamera(saved: PlanCamera | null, me: LatLng | null): PlanCamera {
  if (saved) return saved;
  if (me) return { lat: me.lat, lng: me.lng, zoom: HOME_ME_ZOOM };
  return HOME_FALLBACK_CAMERA;
}

// ---------------------------------------------------------------- how Start branches (22 §3.4.2, D5)

export type StartStep =
  /** Nothing in the way: do it. `leaveRideId` = the ride I just confirmed leaving. */
  | { kind: 'go'; leaveRideId?: string }
  /** A ride is open: ask first (a rider leaves it, a leader must end it). */
  | { kind: 'confirm'; sheet: 'switch' | 'leaderBusy' };

/** Start (or Just ride) with a ride maybe open. */
export function startStep(open: Pick<OpenRideLite, 'role'> | null): StartStep {
  if (!open) return { kind: 'go' };
  return { kind: 'confirm', sheet: open.role === 'leader' ? 'leaderBusy' : 'switch' };
}

/**
 * "Leave and continue" was confirmed on what Home knew a moment ago; the open ride is read again first.
 * Same lobby ride as a rider -> leave it; it ended meanwhile -> nothing to leave; anything else (it started,
 * a different ride, I became its leader) -> `stale`: show the ride as it is now instead of leaving it blind.
 */
export function confirmedSwitch(
  confirmedRideId: string,
  fresh: OpenRideLite | null,
): Extract<StartStep, { kind: 'go' }> | { kind: 'stale' } {
  if (!fresh || fresh.status === 'ended') return { kind: 'go' };
  if (fresh.id === confirmedRideId && fresh.status === 'lobby' && fresh.role === 'rider') return { kind: 'go', leaveRideId: confirmedRideId };
  return { kind: 'stale' };
}

/** Which of the route preview's two actions is running (the ride is being made); null = neither. */
export type GoingKind = 'start' | 'invite' | null;

/**
 * The route preview's actions (D6): **Start ride** is the primary, **Invite riders** the secondary under it. Both
 * need the server, so both are disabled offline. While one runs it loads and the other is blocked, so a second tap
 * cannot make a second ride.
 */
export function routeActions(a: { offline: boolean; going: GoingKind }): {
  start: { disabled: boolean; loading: boolean };
  invite: { disabled: boolean; loading: boolean };
} {
  return {
    start: { disabled: a.offline || a.going === 'invite', loading: a.going === 'start' },
    invite: { disabled: a.offline || a.going === 'start', loading: a.going === 'invite' },
  };
}

/**
 * Whether Home asks for foreground location as it opens (22 D5, D6). Once per app run (`asked` is a module-level
 * flag, not per mount), only while the answer is still undecided and the OS will show its dialog, never on web (the
 * browser prompt belongs to the explainer button, where the rider can see why).
 */
export function launchPromptWanted(a: {
  asked: boolean;
  platform: string;
  status: string;
  canAskAgain: boolean;
  /** Home is the screen in front: a prompt over a ride (a cold start straight into it) would be out of context. */
  focused: boolean;
}): boolean {
  return a.focused && !a.asked && a.platform !== 'web' && a.status === 'undetermined' && a.canAskAgain;
}

export type HomeTile = 'join' | 'ride';

/**
 * The sheet tiles (D5): Join with a code and Just ride. There is no group tile: any ride becomes a group when its
 * code is shared from the ride itself.
 */
export function homeTiles(): readonly HomeTile[] {
  return ['join', 'ride'];
}

// ---------------------------------------------------------------- place sheet text (22 §3.3)

const CATEGORY_LABEL = {
  cafe: 'search.chipCoffee',
  fuel: 'search.chipFuel',
  restaurant: 'search.chipFood',
  parking: 'search.chipParking',
  toilets: 'search.chipToilets',
} as const;

/** The category word, for chip categories only; `other` has none. */
export function categoryWord(category: PlaceCategory): string | null {
  return category === 'other' ? null : copy[CATEGORY_LABEL[category]];
}

/** "≈ 118 km away · Coffee"; without a fix, the GPS note instead of a distance. */
export function placeSubline(distanceM: number | null, category: PlaceCategory): string {
  const word = categoryWord(category);
  const first = distanceM === null ? copy['stop.noFix'] : t('place.distance', { km: formatDistance(distanceM) });
  return word ? `${first} · ${word}` : first;
}

/** What a screen reader hears for the place sheet: name, distance (when known), address. */
export function placeSummaryA11y(name: string, address: string, distanceM: number | null): string {
  if (distanceM === null) return [name, address].filter(Boolean).join(', ');
  return t('place.a11ySummary', { name, distance: formatDistance(distanceM), address }).replace(/, $/, '');
}

// ---------------------------------------------------------------- camera padding (22 §4.2)

export interface PlanPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const BAR_H = 56;
const CHIPS_H = 48;

/** Where the chip row starts: under the bar. */
export function chipsTop(insetTop: number, bannerH: number): number {
  return insetTop + bannerH + 8 + BAR_H + 8;
}

/**
 * Top of Home's map type circle (25 §2.1): browse = under the chip row (or under the bar when the chips are hidden),
 * place = under the place bar, route = level with the floating back circle. Always the
 * offline banner lower.
 */
export function mapTypeTop(o: { mode: PlanMode; insetTop: number; bannerH: number; chipsShown: boolean }): number {
  const barTop = o.insetTop + o.bannerH + 8;
  if (o.mode === 'route') return barTop;
  // The bar's bottom + 8; browse with the chip row shown: the chips' bottom + 8 (152 at 360 x 780, status bar 24).
  return barTop + BAR_H + 8 + (o.mode === 'browse' && o.chipsShown ? CHIPS_H + 8 : 0);
}

/** Browse: everything floating counts: banner, bar, chips (when shown), then the visible sheet and the attribution. */
export function browsePadding(o: {
  insetTop: number;
  bannerH: number;
  chipsShown: boolean;
  sheetH: number;
  /** Lines in the credit pill (2 with Terrain on, 25 §5.1); default 1. */
  creditLines?: PillLines;
  fontScale?: number;
}): PlanPadding {
  return {
    top: o.insetTop + o.bannerH + 8 + BAR_H + (o.chipsShown ? 8 + CHIPS_H : 0) + 16,
    bottom: o.sheetH + attributionClear(o.creditLines ?? 1, o.fontScale),
    left: 16,
    right: 16,
  };
}

/** Place: the bar on top, the panel and the attribution below; sides 48. `insetTop` includes the banner. */
export function placePadding(insetTop: number, panelH: number, creditLines: PillLines = 1, fontScale = 1): PlanPadding {
  // 28 for the one-line pill (24 + 4); a taller pill (Terrain, the search provider line, a big font) grows it.
  return { top: insetTop + 8 + BAR_H + 24, bottom: panelH + 24 + pillHeight(creditLines, fontScale) + 4, left: 48, right: 48 };
}
