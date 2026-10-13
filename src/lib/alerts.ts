import * as Notifications from '@/lib/notifications';
import { AppState, Platform } from 'react-native';

import { notificationText, stoppedMinutes, type AlertTextKind } from '@/lib/alert-text';
import { alertHaptic } from '@/lib/haptics';
import { isMessageKind, MESSAGE_KINDS, type MessageKind } from '@/lib/message-kinds';
import type { RiderStatusResult } from '@/lib/rider-status';
import { track } from '@/lib/telemetry';

// v2: Android channels are immutable once created, and the first versions were created with a
// broken `sound: 'default'` (no sound). New ids give existing installs working channels.
export const ALERT_CHANNEL = 'ride-alerts-v2';
export const SOS_CHANNEL = 'ride-sos-v2';
const LEGACY_CHANNELS = ['ride-alerts', 'ride-sos'];

export type AlertKind = AlertTextKind;

export interface RideAlert {
  kind: AlertKind;
  userId: string;
  /** OS notification text (name already truncated to 14 characters). */
  title: string;
  body: string;
  /** Raw pieces for the in-app banner, which builds its own text with bannerParts(). */
  name: string;
  /** 06 phrase ("4.2 km behind") or null when unknown. */
  distance: string | null;
  /** Whole minutes stopped, for `stopped`. */
  minutes: number | null;
  messageKind?: MessageKind;
}

/** What detectAlerts needs to know about the ride at one instant. */
export interface AlertSnapshot {
  statuses: Record<string, RiderStatusResult>;
  /** userId -> display name. */
  names: Record<string, string>;
  myUserId: string | null;
  /** 06 distance phrase for a rider ("4.2 km behind", "With you", "3.1 km away"), null if unknown. */
  distanceText?: (userId: string) => string | null;
  rideName?: string | null;
}

/** The slice of a ride_events row that alerts read. */
export interface AlertEvent {
  id: number;
  type: string;
  user_id: string | null;
  payload: unknown;
}

/**
 * Creates the notification handler and Android channels. Asks for permission only when
 * `prompt` is true (the permissions screen); on every other ride entry it stays silent.
 */
export async function setupNotifications(options: { prompt?: boolean } = {}): Promise<void> {
  const prompt = options.prompt ?? true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // In the foreground the in-app banner already shows the alert; only SOS also gets the OS
      // banner and sound.
      const inApp = AppState.currentState === 'active';
      const sos = notification.request.content.data?.kind === 'sos';
      const show = !inApp || sos;
      return {
        shouldShowBanner: show,
        shouldShowList: true,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
  if (Platform.OS === 'android') {
    for (const old of LEGACY_CHANNELS) {
      try {
        await Notifications.deleteNotificationChannelAsync(old);
      } catch {
        // Already gone.
      }
    }
    // No `sound`: that field is a custom sound FILE name; high/max channels use the system default.
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
      name: 'Ride alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync(SOS_CHANNEL, {
      name: 'SOS',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      bypassDnd: true,
    });
  }
  if (!prompt) return;
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
}

function messageKindOf(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'kind' in payload) {
    const kind = (payload as { kind: unknown }).kind;
    return typeof kind === 'string' ? kind : null;
  }
  return null;
}

/**
 * Pure: compares two derived status snapshots and the events that arrived in between.
 * Status alerts need a known previous status for that rider, so loading a ride never floods.
 * Offline alerts need a position to have been seen (sinceMs != null): never-seen is not "lost signal".
 * Alerts about myself are never raised.
 * Texts follow docs/design/09: names are cut to 14 characters, distance and ride name are added
 * when `next.distanceText` / `next.rideName` are given, stopped alerts carry the stopped minutes.
 */
export function detectAlerts(prev: AlertSnapshot, next: AlertSnapshot, newEvents: AlertEvent[]): RideAlert[] {
  const out: RideAlert[] = [];
  const me = next.myUserId;
  const rideName = next.rideName ?? null;
  const nameOf = (id: string) => next.names[id] ?? prev.names[id] ?? 'A rider';
  const distanceOf = (id: string) => next.distanceText?.(id) ?? null;

  const make = (
    kind: AlertKind,
    userId: string,
    extra: { minutes?: number | null; label?: string; icon?: string; messageKind?: MessageKind } = {},
  ): RideAlert => {
    const input = {
      kind,
      name: nameOf(userId),
      distance: userId ? distanceOf(userId) : null,
      minutes: extra.minutes ?? null,
      rideName,
      label: extra.label,
      icon: extra.icon,
    };
    const { title, body } = notificationText(input);
    return {
      kind,
      userId,
      title,
      body,
      name: input.name,
      distance: input.distance,
      minutes: input.minutes,
      messageKind: extra.messageKind,
    };
  };

  for (const [userId, status] of Object.entries(next.statuses)) {
    if (userId === me) continue;
    const before = prev.statuses[userId];
    if (!before || before.status === status.status) continue;

    if (status.status === 'sos') {
      out.push(make('sos', userId));
    } else if (before.status === 'sos') {
      out.push(make('sos_cleared', userId));
    } else if (status.status === 'stopped') {
      out.push(make('stopped', userId, { minutes: stoppedMinutes(status.sinceMs) }));
    } else if (status.status === 'offline' && status.sinceMs !== null) {
      out.push(make('offline', userId));
    }
  }

  for (const event of newEvents) {
    if (event.user_id && event.user_id === me) continue;
    const userId = event.user_id ?? '';
    if (event.type === 'message') {
      const kind = messageKindOf(event.payload);
      if (!isMessageKind(kind)) continue;
      const { label, icon } = MESSAGE_KINDS[kind];
      out.push(make('message', userId, { label, icon, messageKind: kind }));
    } else if (event.type === 'ended') {
      out.push(make('ended', userId));
    }
  }
  return out;
}

/**
 * Shows a local notification immediately and fires haptics. Never throws.
 * `rideId` goes into the notification data so a tap can open the ride.
 */
export async function notifyAlert(alert: RideAlert, rideId?: string): Promise<void> {
  const urgent = alert.kind === 'sos';
  track('alert.shown', { kind: alert.kind });
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: alert.title,
        body: alert.body,
        sound: urgent ? 'default' : undefined,
        data: { kind: alert.kind, rideId: rideId ?? null },
      },
      trigger: { channelId: urgent ? SOS_CHANNEL : ALERT_CHANNEL },
    });
  } catch {
    // Notifications are best effort (permission may be denied); haptics still run.
  }
  // 07 table: Error for SOS, Success for good news (SOS cleared, ride ended), Warning otherwise.
  alertHaptic(alert.kind);
}

/**
 * Local notification for a stop proposal waiting on the leader (19 A). Only meant for a backgrounded
 * app (the in-app approval card covers the foreground); best effort, like every notification here.
 */
export async function notifyStopProposal(title: string, body: string, rideId?: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { kind: 'stop_proposal', rideId: rideId ?? null } },
      trigger: { channelId: ALERT_CHANNEL },
    });
  } catch {
    // Permission may be denied; the card and haptic still work.
  }
}
