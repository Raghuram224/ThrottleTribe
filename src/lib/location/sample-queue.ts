import * as Location from 'expo-location';

import { hasStoredSession } from '@/lib/auth-state';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';

import { clearRideId, getRideId, LOCATION_TASK_NAME, setTrackingFlag } from './ride-config';

const QUEUE_KEY = 'ride.queue.v1';
const SEQ_KEY = 'ride.queue.seq.v1';
const STATS_KEY = 'ride.stats.v1';
const BATCH_SIZE = 100;
const MAX_QUEUE = 5000;

export interface SampleRow {
  ride_id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading: number | null;
  app_state: 'active' | 'background' | 'inactive' | 'unknown';
  battery: number | null;
}

/** A queued row carries a local, monotonically increasing sequence number. */
interface QueuedSample extends SampleRow {
  seq: number;
}

interface Stats {
  captured: number;
  sent: number;
  dropped: number;
  lastError: string | null;
  lastFlushAt: number | null;
}

export interface QueueStats extends Stats {
  pending: number;
}

export interface FlushResult {
  /** Set when the server rejected uploads for a ride that is over (or that we left). */
  rejectedRideId: string | null;
}

const EMPTY_STATS: Stats = { captured: 0, sent: 0, dropped: 0, lastError: null, lastFlushAt: null };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readQueue(): QueuedSample[] {
  return readJson<QueuedSample[]>(QUEUE_KEY, []);
}

function writeQueue(rows: QueuedSample[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(rows));
}

/** Reserves `count` consecutive sequence numbers and returns the first. */
function reserveSeq(count: number): number {
  const last = Number(localStorage.getItem(SEQ_KEY)) || 0;
  localStorage.setItem(SEQ_KEY, String(last + count));
  return last + 1;
}

function readStats(): Stats {
  return { ...EMPTY_STATS, ...readJson<Partial<Stats>>(STATS_KEY, {}) };
}

function patchStats(patch: (s: Stats) => Partial<Stats>): void {
  const s = readStats();
  localStorage.setItem(STATS_KEY, JSON.stringify({ ...s, ...patch(s) }));
}

/** Records an error from outside the queue (e.g. the task executor). */
export function recordError(message: string): void {
  patchStats(() => ({ lastError: message }));
}

export function enqueue(rows: SampleRow[]): void {
  if (rows.length === 0) return;
  let seq = reserveSeq(rows.length);
  const tagged = rows.map((r) => ({ ...r, seq: seq++ }));
  let queue = [...readQueue(), ...tagged];
  let dropped = 0;
  if (queue.length > MAX_QUEUE) {
    dropped = queue.length - MAX_QUEUE;
    queue = queue.slice(dropped);
  }
  writeQueue(queue);
  patchStats((s) => ({ captured: s.captured + rows.length, dropped: s.dropped + dropped }));
}

export function getQueueStats(): QueueStats {
  return { ...readStats(), pending: readQueue().length };
}

export function clearStats(): void {
  localStorage.removeItem(STATS_KEY);
}

/** Drops queued rows for one ride (or all rides when omitted). */
export function clearQueue(rideId?: string): void {
  writeQueue(rideId ? readQueue().filter((r) => r.ride_id !== rideId) : []);
}

export async function ensureSession(): Promise<void> {
  // getSession() refreshes an expired token. Needed because auto-refresh is stopped
  // while the app is backgrounded, and we must not restart it from the headless task.
  const { data, error } = await supabase.auth.getSession();
  if (data.session) return;
  // Offline: the refresh failed retryably. Rows stay queued; the next flush retries.
  if (error) throw error;
  // Never create a NEW anonymous user while a session is stored: it would orphan the rider's
  // ride membership. Only a device with no stored session at all may sign in anonymously.
  if (hasStoredSession()) throw new Error('Stored session not usable yet; will retry');
  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw signInError;
}

/** RLS refusal: the ride ended or we are no longer an active member. Retrying can never succeed. */
function isPermissionError(error: { code?: string; message?: string }): boolean {
  return error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? '');
}

async function stopTrackingForRide(rideId: string): Promise<void> {
  clearQueue(rideId);
  track('tracking.rejected');
  if (getRideId() !== rideId) return;
  clearRideId();
  setTrackingFlag(false);
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {
    // Already stopped; nothing to do.
  }
}

let inFlight: Promise<FlushResult> | null = null;

/** Uploads queued rows in batches; a batch leaves the queue only after a successful upsert. */
export function flush(): Promise<FlushResult> {
  if (!inFlight) {
    inFlight = doFlush().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function doFlush(): Promise<FlushResult> {
  try {
    await ensureSession();
    for (;;) {
      const queue = readQueue();
      if (queue.length === 0) break;
      // One ride per request: take the leading run of rows that share the head's ride.
      const rideId = queue[0].ride_id;
      const batch: QueuedSample[] = [];
      for (const row of queue) {
        if (row.ride_id !== rideId || batch.length >= BATCH_SIZE) break;
        batch.push(row);
      }
      const rows: SampleRow[] = batch.map(({ seq: _seq, ...row }) => row);
      const { error } = await supabase
        .from('ride_samples')
        .upsert(rows, { onConflict: 'ride_id,user_id,recorded_at', ignoreDuplicates: true });
      if (error) {
        if (isPermissionError(error)) {
          await stopTrackingForRide(rideId);
          patchStats(() => ({ lastError: error.message, lastFlushAt: Date.now() }));
          return { rejectedRideId: rideId };
        }
        throw error;
      }
      // Remove by seq, not by count: while the request was in flight the cap may have dropped
      // the oldest rows (some of this batch) and the task may have appended new ones.
      const sent = new Set(batch.map((r) => r.seq));
      writeQueue(readQueue().filter((r) => !sent.has(r.seq)));
      patchStats((s) => ({ sent: s.sent + batch.length }));
    }
    patchStats(() => ({ lastError: null, lastFlushAt: Date.now() }));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    patchStats(() => ({ lastError: message, lastFlushAt: Date.now() }));
  }
  return { rejectedRideId: null };
}
