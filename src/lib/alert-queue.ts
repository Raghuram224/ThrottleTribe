// Pure banner queue for in-app alerts (docs/design/07 §1). One alert banner is visible at a time.
// Priority: stopped/offline > message > sos_cleared. A same-or-higher priority newcomer replaces the
// current banner once it has been visible for MIN_SHOW_MS. Same rider+kind replaces in place.
import type { AlertKind, RideAlert } from '@/lib/alerts';
import { timing } from '@/theme/tokens';

export const MIN_SHOW_MS = 3000;
export const MAX_QUEUE = 5;
/** Native notification de-duplication window per rider+kind. */
export const NOTIFY_WINDOW_MS = 30_000;

export interface QueueItem {
  key: string;
  alert: RideAlert;
  priority: number;
  queuedAt: number;
  ttlMs: number;
}

export interface CurrentItem extends QueueItem {
  shownAt: number;
}

export interface QueueState {
  items: QueueItem[];
  current: CurrentItem | null;
}

export const EMPTY_QUEUE: QueueState = { items: [], current: null };

/** Lower number = more urgent. null = this kind never gets an alert banner (sos has the takeover). */
export function bannerPriority(kind: AlertKind): number | null {
  switch (kind) {
    case 'stopped':
    case 'offline':
      return 0;
    case 'message':
      return 1;
    case 'sos_cleared':
      return 2;
    default:
      return null;
  }
}

export function bannerTtl(kind: AlertKind): number {
  return kind === 'stopped' || kind === 'offline' ? timing.bannerStatusMs : timing.bannerMessageMs;
}

export const alertKey = (a: Pick<RideAlert, 'userId' | 'kind'>) => `${a.userId}:${a.kind}`;

function pickBest(items: QueueItem[]): QueueItem | null {
  let best: QueueItem | null = null;
  for (const it of items) {
    if (!best || it.priority < best.priority || (it.priority === best.priority && it.queuedAt > best.queuedAt)) {
      best = it;
    }
  }
  return best;
}

/** Drops what expired, retires the current banner when its time is up, and promotes the next. */
export function advance(state: QueueState, now: number): QueueState {
  let current = state.current;
  if (current && now >= current.shownAt + current.ttlMs) current = null;
  const items = state.items.filter((i) => now < i.queuedAt + i.ttlMs);

  const best = pickBest(items);
  if (best && (!current || (now - current.shownAt >= MIN_SHOW_MS && best.priority <= current.priority))) {
    return {
      items: items.filter((i) => i !== best),
      current: { ...best, shownAt: now },
    };
  }
  return { items, current };
}

/** Adds an alert. Returns the same state for kinds that never show a banner. */
export function enqueue(state: QueueState, alert: RideAlert, now: number): QueueState {
  const priority = bannerPriority(alert.kind);
  if (priority === null) return state;
  const key = alertKey(alert);
  const item: QueueItem = { key, alert, priority, queuedAt: now, ttlMs: bannerTtl(alert.kind) };

  if (state.current?.key === key) {
    // Replace in place: same slot, fresh text, timer restarts.
    return { ...state, current: { ...item, shownAt: now } };
  }
  const idx = state.items.findIndex((i) => i.key === key);
  let items: QueueItem[];
  if (idx >= 0) {
    items = state.items.map((i, n) => (n === idx ? item : i));
  } else {
    items = [...state.items, item];
    // Max 5 waiting: the oldest drops.
    while (items.length > MAX_QUEUE) items.shift();
  }
  return advance({ ...state, items }, now);
}

export function dismissCurrent(state: QueueState, now: number): QueueState {
  return advance({ ...state, current: null }, now);
}

/** Removes everything about one rider (e.g. they left). */
export function dropRider(state: QueueState, userId: string): QueueState {
  return {
    items: state.items.filter((i) => i.alert.userId !== userId),
    current: state.current?.alert.userId === userId ? null : state.current,
  };
}

/** When `advance` next needs to run (epoch ms), or null when the queue is idle. */
export function nextWakeAt(state: QueueState, now: number): number | null {
  const times: number[] = [];
  const { current } = state;
  if (current) {
    times.push(current.shownAt + current.ttlMs);
    if (state.items.length > 0 && now - current.shownAt < MIN_SHOW_MS) times.push(current.shownAt + MIN_SHOW_MS);
  }
  for (const i of state.items) times.push(i.queuedAt + i.ttlMs);
  return times.length ? Math.min(...times) : null;
}

/**
 * True when the same rider+kind has not already produced a native notification within the window.
 * Mutates `last` (the caller's map) on a yes.
 */
export function shouldNotify(
  last: Map<string, number>,
  alert: Pick<RideAlert, 'userId' | 'kind'>,
  now: number,
  windowMs = NOTIFY_WINDOW_MS,
): boolean {
  const key = alertKey(alert);
  const before = last.get(key);
  if (before !== undefined && now - before < windowMs) return false;
  last.set(key, now);
  return true;
}
