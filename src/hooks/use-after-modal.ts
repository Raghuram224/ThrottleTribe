import { useCallback, useEffect, useRef } from 'react';

/**
 * Longer than the Modal's fade-out so the next Modal is not dropped (26 E2: the Modal fades instead of sliding, which is
 * faster than the old ~300 ms slide). 300 is the spec's floor-plus-margin; re-measure on the moto g64 (measured close + 100,
 * never below 250) and raise it if a Modal opened after another is ever dropped.
 */
export const MODAL_CLOSE_MS = 300;

/**
 * Android drops a Modal that is opened while another Modal is still closing. Close the first one,
 * then `schedule` the action: it runs once, either from the Modal's `onDismiss` (iOS, exact) or
 * after MODAL_CLOSE_MS (Android has no onDismiss). Wire `onDismiss` to the closing `<Sheet>`.
 */
export function useAfterModalClose() {
  const pending = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const run = pending.current;
    pending.current = null;
    run?.();
  }, []);

  const schedule = useCallback(
    (action: () => void) => {
      pending.current = action;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, MODAL_CLOSE_MS);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      pending.current = null;
    },
    [],
  );

  return { schedule, onDismiss: flush };
}
