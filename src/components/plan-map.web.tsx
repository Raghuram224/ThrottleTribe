// Web map home map: maplibre-gl, same props as plan-map.tsx (MapLibre RN has no web build).
import 'maplibre-gl/dist/maplibre-gl.css';

import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MeMarker } from '@/components/me-marker';
import type { PlanMapProps } from '@/components/plan-map';
import { MapMarker } from '@/components/ride-map.web';
import { StopPin } from '@/components/stop-pin';
import { useTerrainOn } from '@/hooks/use-terrain-on';
import { DEM_PROVIDER } from '@/lib/flags';
import { runWhenStyleReady } from '@/lib/map-ready-web';
import { syncHillshade } from '@/lib/hillshade-web';
import { mapStyleFor } from '@/lib/map-styles';
import { fitBoundsFor } from '@/lib/map-fit';
import { HOME_ME_ZOOM } from '@/lib/plan-flow';
import { previewFitPoints } from '@/lib/preview-fit';
import { syncNavRouteLayers } from '@/lib/route-layers-web';
import { lineData } from '@/lib/route-style';
import { useTheme } from '@/theme/use-theme';

export type { PlanMapProps };

const FIT_MS = 400;
const PLACE_MS = 400;
const FOLLOW_MS = 450;
const PIN_ONLY_ZOOM = 14;
const FOLLOW_MIN_ZOOM = 10;

export function PlanMap({ me, place, line, padding, intent, intentNonce, initial, follow, onUserGesture, onIdle, onMapError, onMapPress }: PlanMapProps) {
  const { colors, scheme } = useTheme();
  const terrain = useTerrainOn();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const styleUrl = useRef(colors.mapStyle);
  const points = useMemo(() => (place ? previewFitPoints(line, me, place) : []), [line, me, place]);
  const bounds = useMemo(() => fitBoundsFor(points), [points]);
  const dashed = line?.dashed ?? false;
  const geo = useMemo(
    () => (line && line.coords.length >= 2 ? (lineData(line.coords) as GeoJSON.Feature<GeoJSON.LineString>) : null),
    [line],
  );
  const layerRef = useRef({ geo, dashed });
  // Callbacks and the first frame are read when the map is created / when its events fire.
  const cb = useRef({ onUserGesture, onIdle, onMapError, onMapPress });
  useEffect(() => {
    cb.current = { onUserGesture, onIdle, onMapError, onMapPress };
  });
  const firstFrame = useRef(initial);

  const sync = (m: MlMap) => {
    syncHillshade(m, { on: terrain, scheme, beforeId: colors.hillshadeBeforeId, provider: DEM_PROVIDER });
    syncNavRouteLayers(m, layerRef.current.geo, layerRef.current.dashed, {
      navRoute: colors.navRoute,
      navRouteCasing: colors.navRouteCasing,
    });
  };
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const f = firstFrame.current;
    const m = new maplibregl.Map({
      container,
      style: mapStyleFor(styleUrl.current) as unknown as maplibregl.StyleSpecification,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      center: [f.lng, f.lat],
      zoom: f.zoom,
    });
    m.touchZoomRotate.disableRotation();
    m.touchPitch.disable();
    m.on('style.load', () => syncRef.current(m));
    m.on('load', () => syncRef.current(m));
    // Single tile errors are normal at the edges; only a style that never loaded is "the map failed".
    m.on('error', () => {
      if (!m.isStyleLoaded()) cb.current.onMapError();
    });
    // `originalEvent` is set only for the rider's own touch or mouse: the user-gesture signal.
    m.on('dragstart', (e) => e.originalEvent && cb.current.onUserGesture());
    m.on('zoomstart', (e) => e.originalEvent && cb.current.onUserGesture());
    m.on('moveend', () => {
      const c = m.getCenter();
      cb.current.onIdle({ lat: c.lat, lng: c.lng, zoom: m.getZoom() });
    });
    m.on('click', () => cb.current.onMapPress?.());
    setMap(m);
    return () => {
      m.remove();
      setMap(null);
    };
  }, []);

  useEffect(() => {
    if (!map || styleUrl.current === colors.mapStyle) return;
    styleUrl.current = colors.mapStyle;
    // No diff: a diffed swap keeps the layers we added (route, hillshade) out of `style.load`, so they would never be re-added.
    map.setStyle(mapStyleFor(colors.mapStyle) as unknown as maplibregl.StyleSpecification, { diff: false });
  }, [map, colors.mapStyle]);

  useEffect(() => {
    layerRef.current = { geo, dashed };
    if (map) runWhenStyleReady(map, () => syncRef.current(map));
  }, [map, geo, dashed, terrain, scheme]);

  const pad = `${padding.top}|${padding.bottom}|${padding.left}`;
  const key =
    intent.kind === 'me' || intent.kind === 'none'
      ? `${intent.kind}#${intentNonce}`
      : intent.kind === 'fit'
        ? `fit#${intentNonce}|${bounds ? bounds.map((b) => b.toFixed(4)).join(',') : place ? `${place.lat},${place.lng}` : ''}|${pad}`
        : intent.kind === 'place'
          ? `place#${intentNonce}|${place?.lat},${place?.lng}|${pad}`
          : `restore#${intentNonce}`;
  useEffect(() => {
    if (!map) return;
    if (intent.kind === 'me') {
      if (me) map.easeTo({ center: [me.lng, me.lat], zoom: intent.zoom, padding, duration: FOLLOW_MS, bearing: 0, pitch: 0 });
    } else if (intent.kind === 'place') {
      if (place) map.easeTo({ center: [place.lng, place.lat], zoom: intent.zoom, padding, duration: PLACE_MS, bearing: 0, pitch: 0 });
    } else if (intent.kind === 'fit') {
      if (bounds) {
        map.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { padding, duration: FIT_MS, bearing: 0, pitch: 0 },
        );
      } else if (place) {
        map.easeTo({ center: [place.lng, place.lat], zoom: PIN_ONLY_ZOOM, padding, duration: FIT_MS, bearing: 0, pitch: 0 });
      }
    } else if (intent.kind === 'restore') {
      const c = intent.camera;
      map.easeTo({ center: [c.lng, c.lat], zoom: c.zoom, padding: { top: 0, right: 0, bottom: 0, left: 0 }, duration: PLACE_MS, bearing: 0, pitch: 0 });
    }
    // `key` stands for the intent, what it frames and the padding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  const meLat = me?.lat;
  const meLng = me?.lng;
  useEffect(() => {
    if (!map || !follow || meLat === undefined || meLng === undefined) return;
    map.easeTo({
      center: [meLng, meLat],
      zoom: map.getZoom() < FOLLOW_MIN_ZOOM ? HOME_ME_ZOOM : undefined,
      padding,
      duration: FOLLOW_MS,
      bearing: 0,
      pitch: 0,
    });
    // `pad` stands for the padding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, follow, meLat, meLng, pad]);

  return (
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <div ref={containerRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      {map ? (
        <>
          {place ? (
            <MapMarker map={map} lat={place.lat} lng={place.lng} zIndex={2} anchor="bottom">
              <StopPin kind={place.kind} />
            </MapMarker>
          ) : null}
          {me ? (
            <MapMarker map={map} lat={me.lat} lng={me.lng} zIndex={3}>
              <MeMarker variant="map" heading={null} accuracyM={me.accuracyM} lat={me.lat} zoom={15} />
            </MapMarker>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
