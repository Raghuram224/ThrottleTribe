// Web: Home's map is the plan map only (the live screen keeps its own full-screen map on web, 28 §8).
import type { RefObject } from 'react';

import type { HomeMapProps } from '@/components/home-map';
import { PlanMap } from '@/components/plan-map';

export type { HomeMapProps };

export function HomeMap({
  me,
  place,
  routes,
  onSelectRoute,
  routeLabels,
  faded,
  pins,
  onPinPress,
  fitPoints,
  padding,
  intent,
  intentNonce,
  frameFallback,
  follow,
  onUserGesture,
  onIdle,
  onMapError,
  onMapPress,
  initial,
}: HomeMapProps & { mapRef?: RefObject<unknown> }) {
  return (
    <PlanMap
      me={me}
      place={place}
      routes={routes}
      onSelectRoute={onSelectRoute}
      routeLabels={routeLabels}
      faded={faded}
      pins={pins}
      onPinPress={onPinPress}
      fitPoints={fitPoints}
      padding={padding}
      intent={intent}
      intentNonce={intentNonce}
      initial={initial}
      frameFallback={frameFallback}
      follow={follow}
      onUserGesture={onUserGesture}
      onIdle={onIdle}
      onMapError={onMapError}
      onMapPress={onMapPress}
    />
  );
}
