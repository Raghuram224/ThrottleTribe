// Pure retry helper for "reload what the screens show once the network/token is usable again".
// Triggers (NetInfo online, auth TOKEN_REFRESHED / SIGNED_IN) can fire before the token refresh has
// finished, so a single attempt may fail; this retries with backoff until one succeeds.

export const REFRESH_BACKOFF_MS = [2000, 5000, 10000] as const;
/** A request hung on a dead socket must not block the next trigger forever. */
export const REFRESH_ATTEMPT_TIMEOUT_MS = 8000;

export interface RefreshRetrierOptions {
  /** Throws or rejects on failure. */
  run: () => Promise<void>;
  delaysMs?: readonly number[];
  attemptTimeoutMs?: number;
  /** Injectable for tests; default to the globals. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export interface RefreshRetrier {
  /** Something may be out of date (launch, went offline): the next `kick` will run. */
  markStale: () => void;
  /** Run now if stale and no attempt is in flight; failures retry on the backoff. */
  kick: () => void;
  cancel: () => void;
  isStale: () => boolean;
}

export function createRefreshRetrier(opts: RefreshRetrierOptions): RefreshRetrier {
  const delays = opts.delaysMs ?? REFRESH_BACKOFF_MS;
  const attemptTimeout = opts.attemptTimeoutMs ?? REFRESH_ATTEMPT_TIMEOUT_MS;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let stale = true;
  let inFlight = false;
  let timer: unknown = null;
  // Bumped by cancel() so an attempt that finishes afterwards is ignored.
  let generation = 0;

  const attempt = (n: number) => {
    if (!stale || inFlight) return;
    inFlight = true;
    const gen = generation;
    let settled = false;
    let guard: unknown = null;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (guard !== null) clearTimer(guard);
      if (gen !== generation) return;
      inFlight = false;
      if (ok) {
        stale = false;
        return;
      }
      if (n >= delays.length) return;
      timer = setTimer(() => {
        timer = null;
        attempt(n + 1);
      }, delays[n]);
    };
    guard = setTimer(() => settle(false), attemptTimeout);
    let p: Promise<void>;
    try {
      p = opts.run();
    } catch {
      settle(false);
      return;
    }
    p.then(
      () => settle(true),
      () => settle(false),
    );
  };

  return {
    markStale: () => {
      stale = true;
    },
    kick: () => {
      // A fresh trigger restarts the backoff from the beginning.
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      attempt(0);
    },
    cancel: () => {
      generation += 1;
      if (timer !== null) clearTimer(timer);
      timer = null;
      inFlight = false;
    },
    isStale: () => stale,
  };
}

/** Resolves with `fallback` if `promise` has not settled within `ms` (errors also fall back). */
export function withTimeout<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      () => {
        clearTimeout(id);
        resolve(fallback);
      },
    );
  });
}
