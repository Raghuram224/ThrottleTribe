// maplibre-gl helper for the Terrain hillshade on the web maps (docs/design/25 §13.1): adds or removes the raster-dem
// source and the hillshade layer without touching the style, so toggling never reloads it. Like route-layers-web.ts,
// it is safe to call on every `style.load` (a theme switch replaces the style and drops both).
import type { Map as MlMap, RasterDEMSourceSpecification } from 'maplibre-gl';

import { DEM_SOURCE_ID, demSourceFor, HILLSHADE_LAYER, hillshadePaint, type DemProvider, type HillshadeScheme } from '@/lib/dem';

export function syncHillshade(
  m: MlMap,
  o: { on: boolean; scheme: HillshadeScheme; beforeId: string; provider: DemProvider },
): void {
  if (!m.isStyleLoaded()) return;
  const layerOn = !!m.getLayer(HILLSHADE_LAYER.id);
  if (!o.on) {
    if (layerOn) m.removeLayer(HILLSHADE_LAYER.id);
    if (m.getSource(DEM_SOURCE_ID)) m.removeSource(DEM_SOURCE_ID);
    return;
  }
  const paint = hillshadePaint(o.scheme);
  if (layerOn) {
    // Light / dark on the same style object: recolour in place.
    for (const [k, v] of Object.entries(paint)) m.setPaintProperty(HILLSHADE_LAYER.id, k, v);
    return;
  }
  if (!m.getSource(DEM_SOURCE_ID)) {
    m.addSource(DEM_SOURCE_ID, { type: 'raster-dem', ...demSourceFor(o.provider) } as RasterDEMSourceSpecification);
  }
  // Under water, roads and labels; a style without that layer puts it on top rather than throwing.
  m.addLayer({ ...HILLSHADE_LAYER, paint } as never, m.getLayer(o.beforeId) ? o.beforeId : undefined);
}
