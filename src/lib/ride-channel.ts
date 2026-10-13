import NetInfo from '@react-native-community/netinfo';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { immediateRetry, nextChannelStep, type RealtimeStatus } from '@/lib/channel-backoff';
import type { EventRow, MemberRow, PositionRow, RideRow } from '@/lib/ride-api';
import { withTimeout } from '@/lib/refresh-retrier';
import { supabase } from '@/lib/supabase';
import { useRideStore } from '@/store/ride-store';

const SET_AUTH_TIMEOUT_MS = 8000;

/**
 * Subscribes the ride store to the private `ride:<id>` channel. Returns an unsubscribe function.
 * Every SUBSCRIBED (first join and every reconnect) refetches the snapshot, so broadcasts missed
 * while offline never matter. A channel that errors, times out or closes is removed and recreated
 * with backoff (channel-backoff.ts); connectivity or a refreshed token retries immediately.
 */
export function subscribeToRide(rideId: string): () => void {
  let cancelled = false;
  let channel: RealtimeChannel | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  // False after a failure/close until the next attempt is under way; the initial join is "healthy"
  // so the NetInfo callback fired on registration does not restart it.
  let healthy = true;
  // Bumped on every start() so a slow setAuth from a superseded start is ignored.
  let startId = 0;
  const store = () => useRideStore.getState();

  const dropChannel = () => {
    if (!channel) return;
    const old = channel;
    // Detach first: the CLOSED that removeChannel emits must not look like a failure.
    channel = null;
    void supabase.removeChannel(old);
  };

  const scheduleStart = (delayMs: number) => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void start();
    }, delayMs);
  };

  const retryNow = () => {
    if (cancelled) return;
    const step = immediateRetry(healthy);
    if (step.action === 'none') return;
    console.warn('[ride-channel] retry now');
    attempt = step.attempt;
    healthy = true; // optimistic: a second trigger while this one connects must not restart it
    dropChannel();
    scheduleStart(0);
  };

  const fail = (status: RealtimeStatus) => {
    healthy = false;
    const step = nextChannelStep(status, attempt, false);
    attempt = step.attempt;
    if (step.action === 'recreate') {
      console.warn(`[ride-channel] recreate in ${step.delayMs} ms (attempt ${attempt})`);
      dropChannel();
      scheduleStart(step.delayMs);
    }
  };

  const start = async () => {
    const id = ++startId;
    dropChannel();
    store().setChannelStatus('connecting');
    // Private channels authorize against the current JWT; it must be set before subscribing.
    const authed = await withTimeout(
      supabase.realtime.setAuth().then(() => true),
      SET_AUTH_TIMEOUT_MS,
      false,
    );
    if (cancelled || id !== startId) return;
    if (!authed) {
      // No network at launch: try again until it works rather than staying disconnected for good.
      store().setChannelStatus('error');
      console.warn('[ride-channel] setAuth failed');
      fail('CHANNEL_ERROR');
      return;
    }

    const ch = supabase.channel(`ride:${rideId}`, { config: { private: true } });
    channel = ch;

    ch.on('broadcast', { event: 'position' }, ({ payload }) => store().applyPosition(payload as PositionRow));
    ch.on('broadcast', { event: 'member' }, ({ payload }) => {
      const row = payload as MemberRow;
      const known = row.user_id in store().members;
      store().applyMember(row);
      // A new member has no profile name yet; the snapshot joins it in.
      if (!known) void store().load(rideId);
    });
    ch.on('broadcast', { event: 'ride' }, ({ payload }) => store().applyRide(payload as RideRow));
    ch.on('broadcast', { event: 'event' }, ({ payload }) => store().applyEvent(payload as EventRow));

    // Presence: every sync carries the full state, so replace rather than merge. The tracked payload
    // holds user_id (set in SUBSCRIBED below); the presence key itself is a random ref.
    ch.on('presence', { event: 'sync' }, () => {
      const ids: string[] = [];
      for (const entries of Object.values(ch.presenceState<{ user_id?: string }>())) {
        for (const entry of entries) if (entry.user_id) ids.push(entry.user_id);
      }
      store().setConnected(ids);
    });

    ch.subscribe((status) => {
      // Ignore callbacks from a channel we already replaced or removed.
      if (cancelled || ch !== channel) return;
      console.warn(`[ride-channel] ${status}`);
      switch (status) {
        case 'SUBSCRIBED': {
          healthy = true;
          attempt = nextChannelStep('SUBSCRIBED', attempt, false).attempt;
          store().setChannelStatus('subscribed');
          void store().load(rideId);
          void supabase.auth.getSession().then(({ data }) => {
            const userId = data.session?.user.id;
            if (userId && !cancelled && ch === channel) void ch.track({ user_id: userId });
          });
          break;
        }
        case 'CLOSED':
          store().setChannelStatus('closed');
          fail('CLOSED');
          break;
        case 'TIMED_OUT':
          store().setChannelStatus('error');
          fail('TIMED_OUT');
          break;
        default:
          store().setChannelStatus('error');
          fail('CHANNEL_ERROR');
      }
    });
  };

  void start();

  // Back online, or a fresh token: do not wait out the backoff.
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    if (state.isConnected !== false) retryNow();
  });
  const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session) {
      // supabase-js forwards this itself; repeating it is cheap and keeps a stale JWT from lingering.
      void supabase.realtime.setAuth(session.access_token);
      retryNow();
    }
  });

  return () => {
    cancelled = true;
    if (retryTimer) clearTimeout(retryTimer);
    unsubscribeNet();
    auth.subscription.unsubscribe();
    dropChannel();
    store().setChannelStatus('idle');
    store().setConnected([]);
  };
}
