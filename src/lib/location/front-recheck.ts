// Android can report the app state as `unknown` at a cold start and send no `change` event once it is active, so a
// recovery that only ran "when the app is in front" never ran. Starting a foreground-service task from the
// background throws on Android 12+, so the state is NOT treated as in front when it is unknown (`isInFront` is for
// watches, not for this): it is read again a few times over about two seconds instead.

/** Offsets from the first read, in ms: a few retries inside ~2 s. */
export const FRONT_RECHECK_MS = [200, 500, 1000, 2000] as const;

/**
 * Re-reads the app state at each offset. `onFront` runs once, the first time it reads `active`. An explicit
 * `background` / `inactive` stops the checks (the later `change` event handles a return to the front); `unknown`
 * keeps waiting. Returns a cancel for the pending checks.
 */
export function recheckFront(opts: {
  state: () => string | null | undefined;
  onFront: () => void;
  offsets?: readonly number[];
}): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const cancel = () => {
    for (const t of timers.splice(0)) clearTimeout(t);
  };
  for (const at of opts.offsets ?? FRONT_RECHECK_MS) {
    timers.push(
      setTimeout(() => {
        // A read that throws (AppState gone, e.g. after a test teardown) is "unknown": keep waiting, never throw.
        let s: string | null | undefined;
        try {
          s = opts.state();
        } catch {
          s = undefined;
        }
        if (s === 'active') {
          cancel();
          opts.onFront();
        } else if (s === 'background' || s === 'inactive') {
          cancel();
        }
      }, at),
    );
  }
  return cancel;
}
