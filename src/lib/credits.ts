// Credits and attribution rules (docs/design/24 §4, 25 §5). Pure: which lines the pill shows, the link targets, how
// much room the pill takes. The components only draw.
import type { copy } from '@/lib/copy';
import type { DemProvider } from '@/lib/dem';
import type { PlaceSource } from '@/lib/place-search';

export const CREDIT_URLS = {
  osm: 'https://www.openstreetmap.org/copyright',
  omt: 'https://openmaptiles.org/',
  ofm: 'https://openfreemap.org/',
  geoapify: 'https://www.geoapify.com/',
  liq: 'https://locationiq.com/',
  photon: 'https://photon.komoot.io/',
  osrm: 'https://project-osrm.org/',
  dem: 'https://mapterhorn.com/attribution',
  demAws: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
} as const;

type CopyKey = keyof typeof copy;

export interface CreditEntry {
  id: keyof typeof CREDIT_URLS;
  titleKey: CopyKey;
  subKey: CopyKey;
  url: string;
  /** Spoken site name for the link label ("Opens geoapify.com in your browser"). */
  site: string;
}

/** The six rows of the Credits sheet that never change, in order (24 §4.4); `creditEntries` adds the terrain row. */
export const CREDIT_ENTRIES: readonly CreditEntry[] = [
  { id: 'osm', titleKey: 'credits.osm', subKey: 'credits.osmSub', url: CREDIT_URLS.osm, site: 'openstreetmap.org' },
  { id: 'omt', titleKey: 'credits.omt', subKey: 'credits.omtSub', url: CREDIT_URLS.omt, site: 'openmaptiles.org' },
  { id: 'ofm', titleKey: 'credits.ofm', subKey: 'credits.ofmSub', url: CREDIT_URLS.ofm, site: 'openfreemap.org' },
  { id: 'geoapify', titleKey: 'credits.geoapify', subKey: 'credits.geoapifySub', url: CREDIT_URLS.geoapify, site: 'geoapify.com' },
  { id: 'liq', titleKey: 'credits.liq', subKey: 'credits.liqSub', url: CREDIT_URLS.liq, site: 'locationiq.com' },
  { id: 'photon', titleKey: 'credits.photon', subKey: 'credits.photonSub', url: CREDIT_URLS.photon, site: 'photon.komoot.io' },
];

const DEM_ENTRIES: Record<DemProvider, CreditEntry> = {
  mapterhorn: { id: 'dem', titleKey: 'credits.dem', subKey: 'credits.demSub', url: CREDIT_URLS.dem, site: 'mapterhorn.com' },
  aws: { id: 'demAws', titleKey: 'credits.demAws', subKey: 'credits.demAwsSub', url: CREDIT_URLS.demAws, site: 'github.com' },
};

/** The seven rows (25 §5.2): the six above, then the elevation data of the provider in use. Shown whether or not Terrain is on. */
export function creditEntries(provider: DemProvider): readonly CreditEntry[] {
  return [...CREDIT_ENTRIES, DEM_ENTRIES[provider]];
}

/** Link targets of a search credit row (§4.3): the provider that answered, then OpenStreetMap (alone when none has answered). */
export function searchCreditLinks(source: PlaceSource | null): { id: 'geoapify' | 'photon' | 'osm'; labelKey: CopyKey; url: string; site: string }[] {
  // No provider has answered yet (or the search failed): only OpenStreetMap is credited, never one that did nothing.
  if (source === null) return [{ id: 'osm', labelKey: 'credit.osm', url: CREDIT_URLS.osm, site: 'openstreetmap.org' }];
  const provider =
    source === 'geoapify'
      ? ({ id: 'geoapify', labelKey: 'search.creditGeoapify', url: CREDIT_URLS.geoapify, site: 'geoapify.com' } as const)
      : ({ id: 'photon', labelKey: 'search.creditPhoton', url: CREDIT_URLS.photon, site: 'photon.komoot.io' } as const);
  return [provider, { id: 'osm', labelKey: 'credit.osm', url: CREDIT_URLS.osm, site: 'openstreetmap.org' }];
}

/** Who computed a route (mirrors nav-route's RouteProvider; kept here so this module has no imports of app services). */
export type RouteCreditProvider = 'locationiq' | 'osrm';

/** Pill line 2 for a drawn road route, by who computed it; null when unknown (nothing is claimed). */
export function routePillKey(provider: RouteCreditProvider | undefined): 'map.creditRoute' | 'map.creditRouteOsrm' | null {
  return provider === 'locationiq' ? 'map.creditRoute' : provider === 'osrm' ? 'map.creditRouteOsrm' : null;
}

/** The route panel's credit link by provider; null when unknown. */
export function routeCreditLink(
  provider: RouteCreditProvider | undefined,
): { labelKey: 'route.credit' | 'route.creditOsrm'; url: string; site: string } | null {
  if (provider === 'locationiq') return { labelKey: 'route.credit', url: CREDIT_URLS.liq, site: 'locationiq.com' };
  if (provider === 'osrm') return { labelKey: 'route.creditOsrm', url: CREDIT_URLS.osrm, site: 'project-osrm.org' };
  return null;
}

export type PillContext =
  /** Live map: a road route (not the dashed fallback) is drawn, computed by `provider`. */
  | { kind: 'live'; roadRoute: boolean; provider?: RouteCreditProvider }
  /** Home place mode: the place came from this provider. */
  | { kind: 'place'; source: PlaceSource }
  /** Home browse / route mode (the credit is in the panel), summary, welcome hero. */
  | { kind: 'plain' };

/** The pill's service line key (§4.2); null = none. */
export function pillLine2Key(
  ctx: PillContext,
): 'map.creditRoute' | 'map.creditRouteOsrm' | 'map.creditPlaceGeoapify' | 'map.creditPlacePhoton' | null {
  if (ctx.kind === 'live') return ctx.roadRoute ? routePillKey(ctx.provider) : null;
  if (ctx.kind === 'place') return ctx.source === 'geoapify' ? 'map.creditPlaceGeoapify' : 'map.creditPlacePhoton';
  return null;
}

export type PillLineKey = 'live.attribution' | NonNullable<ReturnType<typeof pillLine2Key>> | 'map.creditTerrain' | 'map.creditTerrainAws';
export type PillLines = 1 | 2 | 3;

/**
 * The pill's lines, top to bottom (25 §5.1): the licence line always, then the service line (route or place provider),
 * then, while the hillshade is on that map, the terrain credit of the DEM provider in use. One to three keys.
 */
export function pillLines(ctx: PillContext, terrain: boolean, provider: DemProvider = 'mapterhorn'): PillLineKey[] {
  const service = pillLine2Key(ctx);
  return [
    'live.attribution',
    ...(service ? [service] : []),
    ...(terrain ? [provider === 'aws' ? ('map.creditTerrainAws' as const) : ('map.creditTerrain' as const)] : []),
  ];
}

/** The pill's lines scale with the system font up to the 1.3 cap its Text sets (`maxFontSizeMultiplier`). */
export function pillFontScale(fontScale: number): number {
  return Number.isFinite(fontScale) ? Math.min(Math.max(fontScale, 1), 1.3) : 1;
}

/** Pill height: 8 of padding plus 16 a line (times the font scale, capped at 1.3), so 24 / 40 / 56 at scale 1 (§5.1). */
export function pillHeight(lines: PillLines, fontScale = 1): number {
  return Math.ceil(8 + 16 * pillFontScale(fontScale) * lines);
}

/** Bottom offset that keeps the me slot / floating SOS clear of the pill: 8 + pill height + 8 = 40 / 56 / 72 at scale 1 (§5.1). */
export function attributionClear(lines: PillLines, fontScale = 1): number {
  return 8 + pillHeight(lines, fontScale) + 8;
}

/** Visible map height under which the bottom-left me slot hides: 104 / 124 / 144 for one / two / three pill lines at scale 1. */
export function meSlotMinMapH(lines: PillLines, fontScale = 1): number {
  return 84 + 20 * lines + (pillHeight(lines, fontScale) - pillHeight(lines));
}

/** How many lines a list of pill keys is, as the 1 | 2 | 3 the sizing functions take. */
export function pillLineCount(keys: readonly unknown[]): PillLines {
  return Math.min(3, Math.max(1, keys.length)) as PillLines;
}

/** Max pill width: the map width minus 24 and, when the right control column shows, its 56 + 12 (§4.2). */
export function pillMaxWidth(mapW: number, rightColumn: boolean): number {
  return Math.max(0, mapW - 24 - (rightColumn ? 56 + 12 : 0));
}
