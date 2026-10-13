import * as Location from 'expo-location';
import * as Notifications from '@/lib/notifications';
import { Linking } from 'react-native';

import type { PermissionSnapshot, PermissionValue } from '@/lib/routing';

export interface PermissionInfo {
  snapshot: PermissionSnapshot;
  foregroundCanAskAgain: boolean;
  backgroundCanAskAgain: boolean;
  notificationsCanAskAgain: boolean;
  /** Device location services (GPS) switched on. */
  servicesEnabled: boolean;
}

const asValue = (status: string): PermissionValue =>
  status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';

export async function readPermissions(): Promise<PermissionInfo> {
  const [fg, bg, notif, servicesEnabled] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
    Location.hasServicesEnabledAsync().catch(() => true),
  ]);
  return {
    snapshot: {
      foreground: asValue(fg.status),
      background: asValue(bg.status),
      notifications: asValue(notif.status),
      foregroundCanAskAgain: fg.canAskAgain,
      backgroundCanAskAgain: bg.canAskAgain,
      notificationsCanAskAgain: notif.canAskAgain,
    },
    foregroundCanAskAgain: fg.canAskAgain,
    backgroundCanAskAgain: bg.canAskAgain,
    notificationsCanAskAgain: notif.canAskAgain,
    servicesEnabled,
  };
}

export type FixTarget = 'location' | 'background' | 'notifications';

/**
 * The banner "Fix" action (04): re-ask when the OS still will, otherwise open system settings.
 * The caller refreshes permissions afterwards.
 */
export async function fixPermission(target: FixTarget, info: PermissionInfo): Promise<void> {
  if (target === 'location') {
    if (info.snapshot.foreground !== 'granted' && info.foregroundCanAskAgain && info.servicesEnabled) {
      await Location.requestForegroundPermissionsAsync();
      return;
    }
  } else if (target === 'background') {
    if (info.backgroundCanAskAgain && info.snapshot.foreground === 'granted') {
      await Location.requestBackgroundPermissionsAsync();
      return;
    }
  } else if (info.notificationsCanAskAgain) {
    await Notifications.requestPermissionsAsync();
    return;
  }
  await Linking.openSettings();
}
