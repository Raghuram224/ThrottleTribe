import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Per-launch context stamped on every event and error row.

function randomSessionId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}${rand()}`.slice(0, 64);
}

let sessionId = randomSessionId();
let screen: string | null = null;
let rideId: string | null = null;

export interface TelemetryContext {
  session_id: string;
  platform: 'ios' | 'android';
  os_version: string;
  app_version: string | null;
  device_model: string | null;
  screen: string | null;
  ride_id: string | null;
}

export function getContext(): TelemetryContext {
  return {
    session_id: sessionId,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    os_version: String(Platform.Version).slice(0, 40),
    app_version: Constants.expoConfig?.version?.slice(0, 40) ?? null,
    device_model: Device.modelName?.slice(0, 80) ?? null,
    screen,
    ride_id: rideId,
  };
}

export function getScreen(): string | null {
  return screen;
}

export function setContextScreen(path: string | null): void {
  screen = path ? path.slice(0, 120) : null;
}

export function setContextRideId(id: string | null): void {
  rideId = id;
}

/** Test helper: start a fresh session. */
export function resetSession(): void {
  sessionId = randomSessionId();
  screen = null;
  rideId = null;
}
