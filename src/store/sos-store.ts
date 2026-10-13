import { create } from 'zustand';

import { copy, errorText } from '@/lib/copy';
import { listMyContacts } from '@/lib/emergency-contacts-api';
import type { EmergencyContact } from '@/lib/emergency-contacts';
import { setSos, toRideError } from '@/lib/ride-api';
import { SOS_RETRY_MS, sosReduce, type SosEvent, type SosPhase } from '@/lib/sos';
import { showToast } from '@/store/toast-store';

const CANCELLED_NOTICE_MS = 3000;

interface SosState {
  /** My SOS (sender side, 07 §4). */
  phase: SosPhase;
  /** "SOS cancelled" green banner for 3 s. */
  cancelledNotice: boolean;

  /** Receiver side (07 §3): SOS the user dismissed on this device (key = userId:sosAt). */
  dismissed: Record<string, true>;
  /** "+N more SOS" cursor. */
  cursor: number;
  /** SOS keys for which "I'm on my way" was already sent. */
  onMyWaySent: Record<string, true>;

  trigger: (rideId: string) => void;
  cancel: (rideId: string) => Promise<void>;
  /** Mirrors my member row (`sos`) into the machine. */
  syncServer: (on: boolean) => void;
  dismiss: (key: string) => void;
  /** Re-opens the takeover (pinned banner "View"). */
  reopen: () => void;
  nextCursor: () => void;
  markOnMyWay: (key: string) => void;
  reset: () => void;

  // --- sos contacts (11 §5) ---
  /** My sender panel is showing (minimised = false). Opens with my SOS, closes when it clears. */
  panelOpen: boolean;
  /** My own contacts, cached in memory for the ride so the panel renders instantly and offline. */
  myContacts: EmergencyContact[];
  /** True once `myContacts` came from the server (or the contacts screen), so "0" can be trusted. */
  myContactsLoaded: boolean;
  openPanel: () => void;
  closePanel: () => void;
  /** Refreshes `myContacts`; keeps the cached list when offline. */
  loadMyContacts: () => Promise<void>;
  setMyContacts: (rows: EmergencyContact[]) => void;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

export const useSosStore = create<SosState>((set, get) => {
  // The sender panel opens when my SOS turns on (trigger, or the server says it is on after a
  // restart) and closes when it clears. Minimise is `closePanel`, which keeps the SOS on.
  const dispatch = (event: SosEvent) =>
    set((s) => {
      const phase = sosReduce(s.phase, event);
      const turnedOn = s.phase === 'idle' && phase !== 'idle';
      return { phase, panelOpen: phase === 'idle' ? false : turnedOn ? true : s.panelOpen };
    });

  // One attempt; on failure schedules the next one in SOS_RETRY_MS until success or cancel. An
  // SOS is never silently dropped (07 §4); only "not a member" stops it, since it can never work.
  const attempt = async (rideId: string) => {
    retryTimer = null;
    if (get().phase === 'idle') return;
    try {
      await setSos(rideId, true);
      if (get().phase === 'idle') {
        // Cancelled while this request was in flight: undo it, or the SOS would stay on.
        await setSos(rideId, false).catch(() => {});
        return;
      }
      dispatch('success');
    } catch (e) {
      if (get().phase === 'idle') return;
      if (toRideError(e).code === 'not_a_member') {
        dispatch('cancel');
        showToast(errorText('not_a_member'));
        return;
      }
      dispatch('failure');
      retryTimer = setTimeout(() => void attempt(rideId), SOS_RETRY_MS);
    }
  };

  return {
    phase: 'idle',
    cancelledNotice: false,
    dismissed: {},
    cursor: 0,
    onMyWaySent: {},

    // --- sos contacts ---
    panelOpen: false,
    myContacts: [],
    myContactsLoaded: false,
    openPanel: () => set((s) => (s.phase === 'idle' ? s : { panelOpen: true })),
    closePanel: () => set({ panelOpen: false }),
    setMyContacts: (rows) => set({ myContacts: rows, myContactsLoaded: true }),
    loadMyContacts: async () => {
      try {
        set({ myContacts: await listMyContacts(), myContactsLoaded: true });
      } catch {
        // Offline or failing: the cached list stays (calls and texts work without data).
      }
    },

    trigger: (rideId) => {
      if (get().phase !== 'idle') return;
      dispatch('trigger');
      clearRetry();
      void attempt(rideId);
    },

    cancel: async (rideId) => {
      const before = get().phase;
      if (before === 'idle') return;
      clearRetry();
      dispatch('cancel');
      // Never reached the server (still sending/retrying): nothing to clear. The in-flight
      // attempt, if any, undoes itself when it lands.
      if (before !== 'active') return;
      try {
        await setSos(rideId, false);
        if (noticeTimer) clearTimeout(noticeTimer);
        set({ cancelledNotice: true });
        noticeTimer = setTimeout(() => set({ cancelledNotice: false }), CANCELLED_NOTICE_MS);
      } catch (e) {
        // Still on at the server: put the UI back so the rider can try again.
        dispatch('server_on');
        showToast(errorText(toRideError(e).code));
      }
    },

    syncServer: (on) => dispatch(on ? 'server_on' : 'server_off'),

    dismiss: (key) => set((s) => ({ dismissed: { ...s.dismissed, [key]: true }, cursor: 0 })),
    reopen: () => set({ dismissed: {}, cursor: 0 }),
    nextCursor: () => set((s) => ({ cursor: s.cursor + 1 })),
    markOnMyWay: (key) => set((s) => ({ onMyWaySent: { ...s.onMyWaySent, [key]: true } })),

    reset: () => {
      clearRetry();
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = null;
      set({
        phase: 'idle',
        cancelledNotice: false,
        dismissed: {},
        cursor: 0,
        onMyWaySent: {},
        panelOpen: false,
        myContacts: [],
        myContactsLoaded: false,
      });
    },
  };
});

/** Cancelled-SOS banner text (kept next to the store that raises it). */
export const SOS_CANCELLED_TEXT = copy['sos.cancelled'];
