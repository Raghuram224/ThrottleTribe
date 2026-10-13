import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { listMyContacts } from '@/lib/emergency-contacts-api';
import type { ContactCount } from '@/lib/home';
import { useSessionStore } from '@/store/session-store';

/**
 * How many emergency contacts I have, re-read every time the screen gains focus (so coming back
 * from the contacts screen updates it). 'loading' until the first answer; after a failure the last
 * known number is kept, else 'error'.
 */
export function useContactCount(): ContactCount {
  const [count, setCount] = useState<ContactCount>('loading');
  // Reloaded too when a reconnect reload succeeded (the first read may have failed offline).
  const dataEpoch = useSessionStore((s) => s.dataEpoch);

  useFocusEffect(
    useCallback(() => {
      void dataEpoch;
      let alive = true;
      listMyContacts()
        .then((rows) => {
          if (alive) setCount(rows.length);
        })
        .catch(() => {
          if (alive) setCount((c) => (typeof c === 'number' ? c : 'error'));
        });
      return () => {
        alive = false;
      };
    }, [dataEpoch]),
  );

  return count;
}
