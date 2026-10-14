import NetInfo from '@react-native-community/netinfo';
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { hasStoredSession, isDefinitiveAuthError } from '@/lib/auth-state';
import { clearOfflineCache, readCachedProfile } from '@/lib/offline-cache';
import { createRefreshRetrier } from '@/lib/refresh-retrier';
import { getMyProfile, toRideError, type ProfileRow } from '@/lib/ride-api';
import { endStrandedRides } from '@/lib/stranded-rides';
import { supabase } from '@/lib/supabase';
import { clearHomeDevicePrefs } from '@/store/plan-store';
import { useRecentsStore } from '@/store/recents-store';
import { useRideStore } from '@/store/ride-store';

interface SessionState {
  /** The live session, when one could be read/refreshed. Null while offline with an expired token. */
  session: Session | null;
  /**
   * A session is stored on the device. This, not `session`, decides "signed in": a refresh that
   * fails for lack of network leaves it true. Only a definitive auth failure clears it.
   */
  signedIn: boolean;
  /** The server definitively refused the stored refresh token on this launch. */
  authRejected: boolean;
  /**
   * True as soon as local state has been read (synchronously in `init`). Never waits for the
   * network: supabase-js getSession() retries a failing refresh for ~25 s without signal.
   */
  ready: boolean;
  /** My profile; null means "none yet" only once `profileLoaded` is true. */
  profile: ProfileRow | null;
  /** False = not loaded yet (distinct from "loaded, no name"): UI must not read that as "no name". */
  profileLoaded: boolean;
  /** Bumped whenever a reconnect refresh succeeded; screens re-fetch their own data on change. */
  dataEpoch: number;
  init: () => () => void;
  setProfile: (profile: ProfileRow | null) => void;
  /**
   * Loads the profile into the store. Returns it (null = none). Throws a RideError on failure;
   * on failure the cached profile (if any) is shown meanwhile.
   */
  refreshProfile: () => Promise<ProfileRow | null>;
  /** Forget the profile (after sign-out or account deletion). */
  clearProfile: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  signedIn: false,
  authRejected: false,
  ready: false,
  profile: null,
  profileLoaded: false,
  dataEpoch: 0,
  init: () => {
    // Local state only, synchronously: the gate and the layouts decide from this immediately.
    const stored = hasStoredSession();
    const cached = stored ? readCachedProfile<ProfileRow>() : null;
    set({
      signedIn: stored,
      ready: true,
      ...(cached ? { profile: cached, profileLoaded: true } : {}),
    });

    // Reload the profile (and open ride) and tell screens to re-fetch theirs. Throws on failure so
    // the retrier backs off; it runs again on the next trigger (online, TOKEN_REFRESHED, SIGNED_IN).
    const retrier = createRefreshRetrier({
      run: async () => {
        // Rides whose set-up failed while offline are ended now (never throws; see stranded-rides).
        await endStrandedRides();
        await get().refreshProfile();
        const rideId = useRideStore.getState().rideId;
        if (rideId) await useRideStore.getState().load(rideId);
        set((s) => ({ dataEpoch: s.dataEpoch + 1 }));
      },
    });
    const kick = () => {
      if (get().signedIn) retrier.kick();
    };

    // Background: may take ~25 s offline; nothing waits for it.
    supabase.auth.getSession().then(({ data, error }) => {
      const rejected = !!error && isDefinitiveAuthError(error);
      // Re-read storage: supabase-js removes the session itself on a definitive failure only.
      set({
        session: data.session,
        signedIn: !rejected && (!!data.session || hasStoredSession()),
        authRejected: rejected,
      });
      if (data.session) kick();
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) set({ session, signedIn: true, authRejected: false });
      // A null session without SIGNED_OUT is just a failed refresh: stay signed in.
      else if (event === 'SIGNED_OUT') {
        // Session expiry signs out without going through clearProfile: recent places are personal (21 §2.2).
        useRecentsStore.getState().clear();
        clearHomeDevicePrefs();
        set({ session: null, signedIn: false });
      }
      // The token is usable now: this is the moment a failed reload can succeed.
      if (session && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) kick();
    });

    let wasOffline = false;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false;
      const backOnline = wasOffline && !offline;
      if (offline) retrier.markStale();
      wasOffline = offline;
      if (backOnline) kick();
    });

    return () => {
      retrier.cancel();
      data.subscription.unsubscribe();
      unsubscribeNet();
    };
  },
  setProfile: (profile) => set({ profile, profileLoaded: true }),
  refreshProfile: async () => {
    try {
      const profile = await getMyProfile();
      set({ profile, profileLoaded: true });
      return profile;
    } catch (e) {
      // Network failure: show the last-known profile instead of an empty one.
      if (toRideError(e).code === 'network' && !get().profile) {
        const cached = readCachedProfile<ProfileRow>();
        if (cached) set({ profile: cached, profileLoaded: true });
      }
      throw e;
    }
  },
  clearProfile: () => {
    clearOfflineCache();
    // Recent places are personal to the signed-in rider and live on this phone only (21 §2.2).
    useRecentsStore.getState().clear();
    clearHomeDevicePrefs();
    set({ profile: null, profileLoaded: false });
  },
}));
