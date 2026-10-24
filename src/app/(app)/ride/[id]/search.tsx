import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { PlaceSearchView } from '@/components/place-search-view';
import { RecentPlacesSection } from '@/components/recent-places-section';
import { StopPickSheet } from '@/components/ride-view/stop-pick-sheet';
import { usePlanningPosition } from '@/hooks/use-planning-position';
import { useTypingLock } from '@/hooks/use-typing-lock';
import { copy } from '@/lib/copy';
import { href } from '@/lib/nav';
import { canLocateAlone, searchPosition, type Place } from '@/lib/place-search';
import { useRideStore } from '@/store/ride-store';
import { readFreshOrigin } from '@/store/nav-store';

/**
 * Stop search (19 A, 21 §2.10): full-screen route pushed from the live header search icon or from the
 * arrival panel; web and old links only, native searches inline on Home's map (28 §8). Typed text or a category chip
 * searches Photon; picking a result opens the shared `StopPickSheet`. Either way it returns to the live screen.
 * No typing while moving.
 */
export default function StopSearch() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const rideId = id ?? '';

  const positions = useRideStore((s) => s.positions);
  const myUserId = useRideStore((s) => s.myUserId);

  const myPos = myUserId ? positions[myUserId] : undefined;
  const myLat = myPos?.lat;
  const myLng = myPos?.lng;
  // My server-side position exists only after an upload: this screen's own planning fix and Home's fresh one fill in,
  // or a chip would wait for ever.
  const { perm, fix, servicesEnabled } = usePlanningPosition();
  const [seed] = useState(() => readFreshOrigin());
  const me = useMemo(
    () => searchPosition(myLat != null && myLng != null ? { lat: myLat, lng: myLng } : fix ? { lat: fix.lat, lng: fix.lng } : null, seed),
    [myLat, myLng, fix, seed],
  );
  const fixAt = myPos ? Date.parse(myPos.recordedAt) : NaN;
  const locked = useTypingLock(myPos?.speedMps ?? null, Number.isNaN(fixAt) ? null : fixAt);

  const [picked, setPicked] = useState<Place | null>(null);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(href(`/ride/${rideId}/live`));
  }, [rideId]);
  // Opened from the map home's search bar (22 §3.10): Home is under this screen, so a successful pick goes
  // to the live screen instead of back to Home (Back without a pick still returns to Home).
  const fromHome = from === 'home';
  const afterPick = useCallback(() => {
    if (fromHome) router.replace(href(`/ride/${rideId}/live`));
    else goBack();
  }, [fromHome, rideId, goBack]);

  return (
    <PlaceSearchView
      me={me}
      canLocate={canLocateAlone(perm.status, servicesEnabled)}
      servicesOff={servicesEnabled === false}
      autoFocus
      typingLocked={locked}
      onBack={goBack}
      backLabel={copy['search.a11yBack']}
      // From the map home the recent places are hidden: they would lead to a second ride (22 §3.10).
      emptyContent={fromHome ? null : <RecentPlacesSection me={me} onPick={setPicked} />}
      onPick={setPicked}>
      <StopPickSheet rideId={rideId} picked={picked} onClose={() => setPicked(null)} onDone={afterPick} />
    </PlaceSearchView>
  );
}
