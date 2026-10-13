import { OFFLINE_AFTER_MS } from '@/lib/rider-status';

export type Readiness = 'ready' | 'connected' | 'away';

/**
 * Lobby readiness (05): a fresh position (<= 60 s) means ready; otherwise being on the channel
 * means connected; otherwise away.
 */
export function readiness(
  positionUpdatedAt: string | null,
  connected: boolean,
  now: number,
): Readiness {
  if (positionUpdatedAt) {
    const t = Date.parse(positionUpdatedAt);
    if (!Number.isNaN(t) && now - t <= OFFLINE_AFTER_MS) return 'ready';
  }
  return connected ? 'connected' : 'away';
}

interface Sortable {
  userId: string;
  role: 'leader' | 'rider';
  joinedAt: string;
  leftAt: string | null;
}

/** Members still in the ride: me first, then the leader, then by join time. */
export function sortLobbyMembers<T extends Sortable>(members: T[], myUserId: string | null): T[] {
  const rank = (m: T) => (m.userId === myUserId ? 0 : m.role === 'leader' ? 1 : 2);
  return members
    .filter((m) => !m.leftAt)
    .sort((a, b) => rank(a) - rank(b) || Date.parse(a.joinedAt) - Date.parse(b.joinedAt));
}
