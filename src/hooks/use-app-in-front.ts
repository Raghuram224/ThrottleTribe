import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { isInFront } from '@/lib/app-state';

function subscribe(onChange: () => void): () => void {
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}

/**
 * The app counts as in front for starting foreground work (location watches). Built on `useSyncExternalStore`, which
 * reads `AppState.currentState` again right after it subscribes: a state that was `unknown` at the first render
 * and went to `background` before the listener existed is caught, with no setState in an effect.
 */
export function useAppInFront(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isInFront(AppState.currentState),
    () => true,
  );
}
