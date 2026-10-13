import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import { t } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { firstName } from '@/lib/names';
import { useInviteStore } from '@/store/invite-store';
import { useRideStore } from '@/store/ride-store';

/**
 * Runs the first-name invite match whenever the member list changes (10 §5). Mounted once by the
 * ride layout so the Invited list stays right in lobby, invite and live. Haptic + announcement only
 * while the invite screen or the lobby is visible. Arrival haptics (13 §7): `Success` when an
 * invitee matched, `selection` for anyone else joining (leader, lobby only).
 */
export function useInviteMatching(rideId: string | undefined, child: string | null): void {
  const members = useRideStore((s) => s.members);
  const myUserId = useRideStore((s) => s.myUserId);
  const leaderId = useRideStore((s) => s.ride?.leader_id ?? null);
  const loaded = useRideStore((s) => s.loaded);
  const storeRideId = useRideStore((s) => s.rideId);
  // Riders already seen in this ride, so only a new arrival buzzes (null until the first load).
  const seen = useRef<{ rideId: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    if (!rideId || !loaded || storeRideId !== rideId) return;
    const list = Object.values(members);
    const joined = useInviteStore.getState().applyMatches(
      rideId,
      list.map((m) => ({
        userId: m.userId,
        name: m.name,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
      })),
      myUserId,
    );

    const ids = new Set(list.filter((m) => !m.leftAt).map((m) => m.userId));
    const before = seen.current && seen.current.rideId === rideId ? seen.current.ids : null;
    seen.current = { rideId, ids };
    const arrivals = before ? [...ids].filter((id) => id !== myUserId && !before.has(id)) : [];

    if (child !== 'invite' && child !== 'lobby') return;
    if (joined.length > 0) {
      haptic('success');
      const first = joined[0];
      const rider = first.matchedUserId ? members[first.matchedUserId] : undefined;
      AccessibilityInfo.announceForAccessibility(
        t('invite.a11yJoined', { name: firstName(rider?.name ?? first.name) }),
      );
    } else if (arrivals.length > 0 && child === 'lobby' && !!myUserId && myUserId === leaderId) {
      haptic('select');
    }
  }, [rideId, loaded, storeRideId, members, myUserId, leaderId, child]);
}
