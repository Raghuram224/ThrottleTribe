import { Layer, RasterDEMSource } from '@maplibre/maplibre-react-native';

import { useTerrainOn } from '@/hooks/use-terrain-on';
import { DEM_SOURCE_ID, demSourceFor, HILLSHADE_LAYER, hillshadePaint } from '@/lib/dem';
import { DEM_PROVIDER } from '@/lib/flags';
import { useTheme } from '@/theme/use-theme';

/**
 * The hillshade (25 §3, §13.1): a raster-dem source and a hillshade layer, mounted as children of the map only while Terrain
 * is on. Standard has no DEM source at all (zero requests), and toggling adds or removes the two without reloading the
 * style, so the camera, markers and route layers stay put. Sits above land, below water, roads, labels, route and markers.
 */
export function TerrainLayer() {
  const on = useTerrainOn();
  const { colors, scheme, style } = useTheme();
  if (!on) return null;
  return (
    // Keyed by style and scheme like the route sources: a switch re-adds the layer under the new style's water.
    <RasterDEMSource key={`${DEM_SOURCE_ID}-${style}-${scheme}`} id={DEM_SOURCE_ID} {...demSourceFor(DEM_PROVIDER)}>
      <Layer
        id={HILLSHADE_LAYER.id}
        type="hillshade"
        beforeId={colors.hillshadeBeforeId}
        minzoom={HILLSHADE_LAYER.minzoom}
        maxzoom={HILLSHADE_LAYER.maxzoom}
        paint={hillshadePaint(scheme) as never}
      />
    </RasterDEMSource>
  );
}
