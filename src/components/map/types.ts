// The map layer's shared shapes: the route lines and the camera handle that PlanMap, SummaryRouteMap and MapLibreMap use.
import type { ReactNode, Ref } from 'react';

import type { CameraAdapter } from '@/hooks/use-nav-camera';
import type { PaddingPx } from '@/lib/nav-camera';
import type { Bounds } from '@/lib/map-fit';
import type { ZoomWidth } from '@/lib/route-style';

export interface MapLineLayer {
  color: string;
  /** dp, or a MapLibre zoom expression. */
  width: number | ZoomWidth;
  opacity?: number;
}

/** A polyline as data. `layers` are bottom first (casing, line); every layer follows the same path. */
export interface MapLine {
  id: string;
  coords: readonly { lat: number; lng: number }[];
  layers: MapLineLayer[];
  /** The top layer is dashed (the straight-line fallback): butt caps. */
  dashed?: boolean;
  /** Draw below this label layer. */
  beforeId?: string;
  /** A tap on the line (the route preview's grey alternatives). The press does not reach the map's own `onPress`. */
  onPress?: () => void;
  /**
   * Part of the source's React key: change it to re-add the line's layers above the ones already on the map (a route that
   * becomes the chosen one must be drawn last, and layers keep the order they were added in).
   */
  stack?: string;
}

/** The camera handle: the live map's `CameraAdapter`, so one adapter shape serves every map. */
export type MapHandle = CameraAdapter;

export type MapInitialCamera =
  | { center: [lng: number, lat: number]; zoom: number; pitch?: number; bearing?: number }
  | { bounds: Bounds; padding: PaddingPx };

export interface MapIdle {
  center: [lng: number, lat: number];
  zoom: number;
}

export interface MapLibreMapProps {
  initialCamera: MapInitialCamera;
  /** False = a picture: no pan, zoom, rotate or pitch. Default true (pan and zoom only; never rotate or pitch). */
  interactive?: boolean;
  lines: MapLine[];
  /** A tap on the map itself. */
  onPress?: () => void;
  /** The rider's own touch moved the camera (programmatic moves do not report). */
  onGesture?: () => void;
  /** The camera came to rest. */
  onIdle?: (camera: MapIdle) => void;
  /** The style or tiles failed to load. */
  onError?: () => void;
  /** Screen-reader name of the map (default "Map"). */
  accessibilityLabel?: string;
  ref?: Ref<MapHandle>;
  /** MapLibre `Marker` elements. */
  children?: ReactNode;
}
