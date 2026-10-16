// Pure rules for "Rename ride" (docs/design/22-map-home.md section 3.6). The DB enforces the same limit
// (rides.name: 1 to 60 characters after trim; rename_ride in 0010).
import { isValidRideName } from '@/lib/names';

export const RIDE_NAME_MAX = 60;
/** The live character count appears from this length on (12 left). */
export const RIDE_NAME_COUNT_FROM = 48;

/** Characters as the server counts them (code points), after trimming. */
export function rideNameLength(name: string): number {
  return Array.from(name.trim()).length;
}

export type RideNameCheck = 'ok' | 'empty' | 'too_long';

/** Trim, then 1 to 60 characters with at least one letter or digit (as a new ride's name). */
export function checkRideName(name: string): RideNameCheck {
  const n = rideNameLength(name);
  if (n > RIDE_NAME_MAX) return 'too_long';
  if (n === 0 || !isValidRideName(name)) return 'empty';
  return 'ok';
}

export function showNameCount(name: string): boolean {
  return Array.from(name).length >= RIDE_NAME_COUNT_FROM;
}

/** Save is on only for a changed, valid name while standing still and not already saving. */
export function canSaveRename(a: { draft: string; current: string; locked: boolean; saving: boolean }): boolean {
  if (a.locked || a.saving) return false;
  if (checkRideName(a.draft) !== 'ok') return false;
  return a.draft.trim() !== a.current.trim();
}

/** The menu row is for the leader of a ride that is in the lobby or live, and still a member. */
export function renameMenuVisible(a: {
  isLeader: boolean;
  status: 'lobby' | 'active' | 'ended' | undefined;
  left: boolean;
}): boolean {
  return a.isLeader && !a.left && (a.status === 'lobby' || a.status === 'active');
}
