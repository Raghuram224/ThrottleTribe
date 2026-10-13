import * as Location from 'expo-location';

import type { PermissionSnapshot, PermissionValue } from '@/lib/routing';
import { showToast } from '@/store/toast-store';

import type { FixTarget, PermissionInfo } from './permissions';

export type { FixTarget, PermissionInfo };

const asValue = (status: string): PermissionValue =>
  status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';

/**
 * Web: only the browser location permission matters. Background and notification permissions do
 * not exist here, so they read as granted and never raise a banner or a permission step.
 */
export async function readPermissions(): Promise<PermissionInfo> {
  const fg = await Location.getForegroundPermissionsAsync();
  const snapshot: PermissionSnapshot = {
    foreground: asValue(fg.status),
    background: 'granted',
    notifications: 'granted',
    foregroundCanAskAgain: fg.canAskAgain,
    backgroundCanAskAgain: false,
    notificationsCanAskAgain: false,
  };
  return {
    snapshot,
    foregroundCanAskAgain: fg.canAskAgain,
    backgroundCanAskAgain: false,
    notificationsCanAskAgain: false,
    servicesEnabled: true,
  };
}

/** The banner "Fix" action: ask again; a blocked site can only be changed in browser settings. */
export async function fixPermission(_target: FixTarget, _info: PermissionInfo): Promise<void> {
  const res = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!res?.granted) {
    showToast('Allow location for this site in your browser settings, then reload the page.', 6000);
  }
}
