// Pure SOS logic (docs/design/07): the sender state machine, receiver selection and the
// navigation URL. No React and no native modules.
import { firstName } from '@/lib/names';

// ---------------------------------------------------------------- sender state machine

/**
 * idle: no SOS from me. sending: first attempt in flight. retrying: an attempt failed, trying every
 * SOS_RETRY_MS. active: the server has my SOS.
 */
export type SosPhase = 'idle' | 'sending' | 'retrying' | 'active';
export type SosEvent =
  | 'trigger' // hold completed
  | 'success' // setSos(true) resolved
  | 'failure' // setSos(true) failed (network)
  | 'cancel' // I cancelled (hold) or the SOS can no longer be sent (not a member)
  | 'server_on' // member row says sos = true (restart, other device)
  | 'server_off'; // member row says sos = false

export const SOS_RETRY_MS = 5000;

export function sosReduce(phase: SosPhase, event: SosEvent): SosPhase {
  switch (event) {
    case 'trigger':
      return phase === 'idle' ? 'sending' : phase;
    case 'success':
      return phase === 'sending' || phase === 'retrying' ? 'active' : phase;
    case 'failure':
      return phase === 'sending' || phase === 'retrying' ? 'retrying' : phase;
    case 'cancel':
      return 'idle';
    case 'server_on':
      return phase === 'idle' ? 'active' : phase;
    case 'server_off':
      // An in-flight attempt must not be forgotten just because the row has not caught up.
      return phase === 'active' ? 'idle' : phase;
  }
}

/** My SOS counts as on for the UI (MeRow chip, cancel button, pinned banner). */
export const sosIsOn = (phase: SosPhase) => phase !== 'idle';

// ---------------------------------------------------------------- receivers

export interface SosMember {
  userId: string;
  name: string;
  sos: boolean;
  sosAt: string | null;
  leftAt: string | null;
}

export interface ActiveSos {
  /** userId + sosAt: a rider who cancels and re-triggers is a new SOS. */
  key: string;
  userId: string;
  name: string;
  sosAt: string | null;
}

/** Other riders whose SOS is on, newest first. */
export function activeSos(members: SosMember[], myUserId: string | null): ActiveSos[] {
  return members
    .filter((m) => m.sos && !m.leftAt && m.userId !== myUserId)
    .map((m) => ({ key: `${m.userId}:${m.sosAt ?? ''}`, userId: m.userId, name: m.name, sosAt: m.sosAt }))
    .sort((a, b) => (Date.parse(b.sosAt ?? '') || 0) - (Date.parse(a.sosAt ?? '') || 0));
}

/**
 * Which SOS the takeover shows: the `cursor`-th of the SOS not yet dismissed, wrapping around.
 * null = takeover closed (all dismissed or none active).
 */
export function takeoverTarget(
  active: ActiveSos[],
  dismissed: Readonly<Record<string, true>>,
  cursor: number,
): { sos: ActiveSos; more: number } | null {
  const open = active.filter((a) => !dismissed[a.key]);
  if (open.length === 0) return null;
  return { sos: open[((cursor % open.length) + open.length) % open.length], more: open.length - 1 };
}

/** True while the receiver takeover is on screen for this member list (Home's Back must then leave Back to it). */
export function receiverTakeoverShowing(
  members: SosMember[],
  myUserId: string | null,
  dismissed: Readonly<Record<string, true>>,
  cursor: number,
): boolean {
  return takeoverTarget(activeSos(members, myUserId), dismissed, cursor) !== null;
}

// ---------------------------------------------------------------- navigation

export type NavPlatform = 'android' | 'ios' | string;

/** Opens a maps app at the SOS rider's last position (07 §3). */
export function navigationUrl(platform: NavPlatform, lat: number, lng: number, name: string): string {
  const label = encodeURIComponent(firstName(name) || name);
  if (platform === 'ios') return `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
  return `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
}

/** A position from a `sos` event payload ({lat, lng, recorded_at}), or null. */
export function positionFromPayload(payload: unknown): { lat: number; lng: number } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { lat, lng } = payload as { lat?: unknown; lng?: unknown };
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
}
