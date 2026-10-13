import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';

import { Card } from '@/components/card';
import { RecentRideRow } from '@/components/recent-ride-row';
import { Skeleton } from '@/components/skeleton';
import { copy } from '@/lib/copy';
import { href } from '@/lib/nav';
import type { RecentRide } from '@/lib/recent-rides';
import { cacheRecentRides, readCachedRecentRides } from '@/lib/offline-cache';
import { getMyRecentRides } from '@/lib/ride-api';
import { useRideSketches } from '@/hooks/use-ride-sketches';
import { useInviteStore } from '@/store/invite-store';
import { useSessionStore } from '@/store/session-store';
import { family, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export const HOME_RECENT_COUNT = 5;

/** Opens an ended ride's read-only summary. */
export function openRideSummary(id: string): void {
  router.push(href(`/ride/${id}/summary`));
}

/** Compact empty state, two skeleton rows while loading, hidden on error (home must never look broken). */
export function RecentRidesList({
  rides,
  failed,
  showSeeAll,
}: {
  rides: RecentRide[] | null;
  failed: boolean;
  showSeeAll?: boolean;
}) {
  const { sketches, stats } = useRideSketches(rides);

  if (rides === null) {
    // `failed` still shows the skeleton: the section is retried on reconnect, never silently dropped.
    void failed;
    return (
      <View style={styles.skeletons}>
        <Skeleton height={72} />
        <Skeleton height={72} />
      </View>
    );
  }
  if (rides.length === 0) {
    // No clip-art icon (16 §8.6): plain text.
    return (
      <View style={styles.empty}>
        <AppText variant="heading" style={styles.center} maxFontSizeMultiplier={1.3}>
          {copy['home.recentEmptyTitle']}
        </AppText>
        <AppText muted style={styles.center} maxFontSizeMultiplier={1.3}>
          {copy['home.recentEmptyBody']}
        </AppText>
      </View>
    );
  }
  const shown = showSeeAll ? rides.slice(0, HOME_RECENT_COUNT) : rides;
  return (
    <View style={styles.list}>
      <Card padding={0} gap={0}>
        {shown.map((ride, i) => (
          <RecentRideRow
            key={ride.id}
            ride={ride}
            distanceM={stats[ride.id] ?? null}
            sketch={sketches[ride.id] ?? null}
            onPress={openRideSummary}
            last={i === shown.length - 1}
          />
        ))}
      </Card>
    </View>
  );
}

/** Last list the server gave us (cached for offline); refetched on every focus and after a reconnect reload. */
export function useRecentRides(): { rides: RecentRide[] | null; failed: boolean } {
  // Starts from the cached list, so an offline launch still shows the rides.
  const [rides, setRides] = useState<RecentRide[] | null>(() => readCachedRecentRides());
  const [failed, setFailed] = useState(false);
  // Bumped when a reconnect reload succeeded: refetch (the first load may have failed offline).
  const dataEpoch = useSessionStore((s) => s.dataEpoch);

  useFocusEffect(
    useCallback(() => {
      void dataEpoch;
      let cancelled = false;
      getMyRecentRides(HOME_RECENT_COUNT + 1)
        .then((list) => {
          if (cancelled) return;
          cacheRecentRides(list);
          setRides(list);
          setFailed(false);
          // The invited lists of rides that ended more than a day ago are not needed any more.
          useInviteStore.getState().purge(
            Object.fromEntries(list.map((r) => [r.id, Date.parse(r.endedAt)])),
          );
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
      return () => {
        cancelled = true;
      };
    }, [dataEpoch]),
  );
  return { rides, failed };
}

/** Home -> Recent rides (16 §3): heading + "See all", then the route-sketch rows. Hidden when there are none (first run shows the steps card). */
export function RecentRidesSection({ rides, failed }: { rides: RecentRide[] | null; failed: boolean }) {
  const { colors } = useTheme();
  if (rides !== null && rides.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <AppText variant="heading" accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
          {copy['home.recentTitle']}
        </AppText>
        {rides && rides.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy['home.seeAll']}
            hitSlop={12}
            onPress={() => router.push(href('/rides'))}
            style={styles.seeAll}>
            <AppText variant="caption" maxFontSizeMultiplier={1.3} style={[styles.seeAllText, { color: colors.brandOnBg }]}>
              {copy['home.seeAllShort']}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <RecentRidesList rides={rides} failed={failed} showSeeAll />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  skeletons: { gap: space.sm },
  section: { gap: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontFamily: family.semibold },
  seeAll: { minHeight: 44, justifyContent: 'center' },
  seeAllText: { fontFamily: family.semibold },
  empty: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  center: { textAlign: 'center' },
});
