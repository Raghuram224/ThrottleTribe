// The two tuned OpenFreeMap styles bundled in the app (docs/design/24 §1.2), so the map style loads offline and we
// host what we modify. Tiles, sprite and glyphs inside still point at OpenFreeMap. Regenerate with
// `node scripts/build-map-styles.mjs`.
import type { MapStyleId, StyleJson } from '@/lib/map-style-tune';

export type { MapStyleId };

const STYLES: Record<MapStyleId, StyleJson> = {
  'tt-liberty': require('../../assets/map-styles/tt-liberty.json') as StyleJson,
  'tt-dark': require('../../assets/map-styles/tt-dark.json') as StyleJson,
};

// MapLibre RN stringifies an object `mapStyle` inside a useMemo keyed on props, so a ~100 KB style would be re-serialised on
// every render of the map. Native therefore gets the JSON string, made once here at module load (native reads a JSON
// string as an inline style).
const JSON_STYLES: Record<MapStyleId, string> = {
  'tt-liberty': JSON.stringify(STYLES['tt-liberty']),
  'tt-dark': JSON.stringify(STYLES['tt-dark']),
};

/** The style as a JSON string for the native `Map` (`mapStyle`); the same string every call. */
export function mapStyleJsonFor(id: MapStyleId): string {
  return JSON_STYLES[id];
}

/** The style object for a token's `mapStyle` id: web (maplibre-gl takes the object), and tests. */
export function mapStyleFor(id: MapStyleId): StyleJson {
  return STYLES[id];
}
