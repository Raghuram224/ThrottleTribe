import { Platform } from 'react-native';

import { LIVE_ON_HOME } from '@/lib/flags';
import { rideOnHome } from '@/lib/routing';

/** True when the live ride runs on Home's map in this build (flag on, not web). Fixed for the life of the app. */
export const RIDE_ON_HOME: boolean = rideOnHome(LIVE_ON_HOME, Platform.OS);
