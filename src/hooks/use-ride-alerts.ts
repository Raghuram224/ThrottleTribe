import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { detectAlerts, notifyAlert, type AlertSnapshot, type RideAlert } from '@/lib/alerts';
import { nextWakeAt, shouldNotify } from '@/lib/alert-queue';
import { phraseFor } from '@/lib/live-list';
import { selectStatuses, useRideStore } from '@/store/ride-store';
import { useAlertStore } from '@/store/alert-store';

/**
 * Raises alerts for the ride (07): derives every rider's status from `now`, diffs it against the
 * previous snapshot with detectAlerts, and for each result queues the in-app banner and fires the
 * OS notification + haptic. Runs from the ride layout so lobby and live share one queue.
 *
 * - Nothing fires for the first snapshot of a ride (loading never floods) or for events that were
 *   already in it.
 * - Status alerts only while the ride is active; message/ended events are always considered.
 * - Never about myself (detectAlerts), never twice within 30 s for the same rider+kind natively.
 */
export function useRideAlerts(rideId: string | undefined, now: number): void {
  const members = useRideStore((s) => s.members);
  const positions = useRideStore((s) => s.positions);
  const ride = useRideStore((s) => s.ride);
  const events = useRideStore((s) => s.events);
  const trail = useRideStore((s) => s.leaderTrail);
  const loaded = useRideStore((s) => s.loaded);
  const storeRideId = useRideStore((s) => s.rideId);
  const myUserId = useRideStore((s) => s.myUserId);
  const queue = useAlertStore((s) => s.queue);

  const status = ride?.status;
  const ready = loaded && !!rideId && storeRideId === rideId;
  const statuses = useMemo(
    () => selectStatuses({ members, positions, ride }, now),
    [members, positions, ride, now],
  );

  const previous = useRef<AlertSnapshot | null>(null);
  const seenEvents = useRef<Set<number> | null>(null);
  const lastNotified = useRef(new Map<string, number>());

  useEffect(() => {
    if (!ready) {
      previous.current = null;
      seenEvents.current = null;
      return;
    }
    const names: Record<string, string> = {};
    for (const m of Object.values(members)) names[m.userId] = m.name;
    const myPos = myUserId ? positions[myUserId] : undefined;
    const next: AlertSnapshot = {
      statuses: status === 'active' ? statuses : {},
      names,
      myUserId,
      rideName: ride?.name ?? null,
      distanceText: (userId) => phraseFor(trail, myPos, positions[userId]),
    };

    // First pass for this ride: remember what exists, raise nothing.
    if (!previous.current || !seenEvents.current) {
      previous.current = next;
      seenEvents.current = new Set(events.map((e) => e.id));
      return;
    }

    const fresh = events.filter((e) => !seenEvents.current?.has(e.id)).reverse(); // oldest first
    for (const e of fresh) seenEvents.current.add(e.id);

    const alerts = detectAlerts(previous.current, next, fresh);
    previous.current = next;
    if (alerts.length === 0) return;

    const at = Date.now();
    for (const alert of alerts) deliver(alert, rideId, at, lastNotified.current);
  }, [ready, rideId, members, positions, ride, events, trail, statuses, status, myUserId]);

  // Wake the queue when the current banner expires or a waiting one may be promoted.
  useEffect(() => {
    const at = nextWakeAt(queue, Date.now());
    if (at === null) return;
    const id = setTimeout(() => useAlertStore.getState().tick(), Math.max(50, at - Date.now()));
    return () => clearTimeout(id);
  }, [queue]);
}

function deliver(alert: RideAlert, rideId: string | undefined, now: number, last: Map<string, number>) {
  // Banner (sos has the takeover instead, ended navigates; the queue ignores both).
  useAlertStore.getState().push(alert);
  // "Ride ended" is a background-only notification: in the foreground the layout already navigates.
  if (alert.kind === 'ended' && AppState.currentState === 'active') return;
  // An SOS is never throttled; everything else is de-duplicated per rider+kind.
  if (alert.kind !== 'sos' && !shouldNotify(last, alert, now)) return;
  void notifyAlert(alert, rideId);
}
