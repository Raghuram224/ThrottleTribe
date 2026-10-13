import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ErrorText } from '@/components/error-text';
import { RecentRidesList } from '@/components/recent-rides-section';
import { Screen } from '@/components/screen';
import { TopBar } from '@/components/top-bar';
import { copy } from '@/lib/copy';
import { href } from '@/lib/nav';
import type { RecentRide } from '@/lib/recent-rides';
import { getMyRecentRides } from '@/lib/ride-api';

const ALL_LIMIT = 30;

/** All recent rides (13 §3, P2): the same rows as Home, newest first. Tap opens the read-only summary. */
export default function Rides() {
  const [rides, setRides] = useState<RecentRide[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getMyRecentRides(ALL_LIMIT)
        .then((list) => {
          if (cancelled) return;
          setRides(list);
          setFailed(false);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <Screen
      scroll
      top={
        <TopBar
          title={copy['home.recentTitle']}
          onBack={() => (router.canGoBack() ? router.back() : router.replace(href('/home')))}
        />
      }>
      {failed && rides === null ? <ErrorText>{copy['errors.network']}</ErrorText> : null}
      <RecentRidesList rides={rides} failed={failed} />
    </Screen>
  );
}
