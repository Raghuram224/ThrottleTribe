import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { readPermissions, type PermissionInfo } from '@/lib/permissions';

const POLL_MS = 10_000;

/**
 * Location and notification permission state. Re-read when the app returns to the foreground,
 * so granting in system settings is picked up. `info` is null until the first read.
 */
export function usePermissions(): { info: PermissionInfo | null; refresh: () => Promise<void> } {
  const [info, setInfo] = useState<PermissionInfo | null>(null);

  // Same values keep the same object, so effects and memos keyed on `info` do not re-run on polls.
  const apply = useCallback((next: PermissionInfo) => {
    setInfo((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await readPermissions());
    } catch {
      // Keep the last known state.
    }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      readPermissions()
        .then((next) => {
          if (!cancelled) apply(next);
        })
        .catch(() => {
          // Keep the last known state.
        });
    };
    load();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    // Slow poll: permissions can change without an AppState event (e.g. adb or a settings
    // overlay), and the "keep the app open" banner must clear once background is granted.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(timer);
    };
  }, [apply]);

  return { info, refresh };
}
