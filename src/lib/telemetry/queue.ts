import 'expo-sqlite/localStorage/install';

import type { TablesInsert } from '../database.types';
import { supabase } from '../supabase';

// Persistent, bounded telemetry buffers. Everything here swallows failures: telemetry must never
// affect the app. Rows are removed by their local seq, never by count, because the cap or new
// appends may change the queue while a request is in flight.

export type EventRow = Omit<TablesInsert<'app_events'>, 'user_id' | 'id'>;
export type ErrorRow = Omit<TablesInsert<'app_errors'>, 'user_id' | 'id'>;

export const MAX_QUEUE = 500;
export const BATCH_SIZE = 50;

const KEYS = {
  events: 'telemetry.events.v1',
  errors: 'telemetry.errors.v1',
} as const;
const SEQ_KEY = 'telemetry.seq.v1';

type Kind = keyof typeof KEYS;
type Queued<T> = T & { seq: number };

function read<T>(kind: Kind): Queued<T>[] {
  try {
    const raw = localStorage.getItem(KEYS[kind]);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Queued<T>[]) : [];
  } catch {
    return [];
  }
}

function write<T>(kind: Kind, rows: Queued<T>[]): void {
  localStorage.setItem(KEYS[kind], JSON.stringify(rows));
}

function nextSeq(): number {
  const next = (Number(localStorage.getItem(SEQ_KEY)) || 0) + 1;
  localStorage.setItem(SEQ_KEY, String(next));
  return next;
}

function push<T extends object>(kind: Kind, row: T): void {
  try {
    let queue = [...read<T>(kind), { ...row, seq: nextSeq() }];
    if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
    write(kind, queue);
  } catch {
    // Storage full or unavailable: drop the row.
  }
}

/** Synchronous on purpose: fatal errors must be persisted before the process dies. */
export function enqueueEvent(row: EventRow): void {
  push('events', row);
}

export function enqueueError(row: ErrorRow): void {
  push('errors', row);
}

export function pendingCounts(): { events: number; errors: number } {
  return { events: read('events').length, errors: read('errors').length };
}

/** Queued rows including their seq, oldest first. Exposed for tests. */
export function peekQueue(kind: Kind): Queued<EventRow | ErrorRow>[] {
  return read(kind);
}

async function hasSession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    return !error && !!data.session;
  } catch {
    return false;
  }
}

/** Integrity/check violations can never succeed on retry; drop them so they do not block the queue. */
function isPermanent(error: { code?: string }): boolean {
  return typeof error.code === 'string' && error.code.startsWith('23');
}

async function flushKind(kind: Kind): Promise<void> {
  for (;;) {
    const batch = read<EventRow | ErrorRow>(kind).slice(0, BATCH_SIZE);
    if (batch.length === 0) return;
    const rows = batch.map(({ seq: _seq, ...row }) => row);
    const res =
      kind === 'events'
        ? await supabase.from('app_events').insert(rows as EventRow[])
        : await supabase.from('app_errors').insert(rows as ErrorRow[]);
    if (res.error && !isPermanent(res.error)) return;
    const done = new Set(batch.map((r) => r.seq));
    write(
      kind,
      read<EventRow | ErrorRow>(kind).filter((r) => !done.has(r.seq)),
    );
  }
}

let inFlight: Promise<void> | null = null;

/** Sends buffered rows if a Supabase session exists. Never throws; concurrent calls share one run. */
export function flushTelemetry(): Promise<void> {
  if (!inFlight) {
    inFlight = (async () => {
      try {
        if (!(await hasSession())) return;
        // Errors first: they matter most.
        await flushKind('errors');
        await flushKind('events');
      } catch {
        // Offline or storage trouble: keep buffering.
      }
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
