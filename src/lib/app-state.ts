import type { AppStateStatus } from 'react-native';

/**
 * Whether the app counts as in front for starting foreground work (location watches). `AppState.currentState`
 * can still be `unknown` (or null) at a cold start on Android, and the app turns active before a listener is
 * attached, so no `change` event ever follows: treating that as "not in front" left watches off for good.
 * Only an explicit `background` / `inactive` means behind.
 */
export function isInFront(state: AppStateStatus | null | undefined): boolean {
  return state !== 'background' && state !== 'inactive';
}
