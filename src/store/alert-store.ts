import { create } from 'zustand';

import type { RideAlert } from '@/lib/alerts';
import {
  advance,
  dismissCurrent,
  dropRider,
  EMPTY_QUEUE,
  enqueue,
  type QueueState,
} from '@/lib/alert-queue';

interface AlertState {
  queue: QueueState;
  /** Adds an alert banner (pure queue rules in lib/alert-queue). */
  push: (alert: RideAlert) => void;
  /** Re-evaluates expiry and promotion; called by a timer from the ride layout. */
  tick: () => void;
  dismiss: () => void;
  forgetRider: (userId: string) => void;
  reset: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  queue: EMPTY_QUEUE,
  push: (alert) => set((s) => ({ queue: enqueue(s.queue, alert, Date.now()) })),
  tick: () => set((s) => ({ queue: advance(s.queue, Date.now()) })),
  dismiss: () => set((s) => ({ queue: dismissCurrent(s.queue, Date.now()) })),
  forgetRider: (userId) => set((s) => ({ queue: dropRider(s.queue, userId) })),
  reset: () => set({ queue: EMPTY_QUEUE }),
}));
