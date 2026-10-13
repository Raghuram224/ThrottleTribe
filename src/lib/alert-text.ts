// Pure text builders for alerts (docs/design/07 and 09). Kept apart from alerts.ts so tests and the
// banner UI can use them without native modules.
import { copy, t } from '@/lib/copy';
import { firstName, truncateName } from '@/lib/names';

export type AlertTextKind = 'stopped' | 'offline' | 'sos' | 'sos_cleared' | 'message' | 'ended';

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const join = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/**
 * The 06 line-1 phrase ("4.2 km behind", "With you", "3.1 km away") as read inside a sentence:
 * "4.2 km behind you", "4.2 km ahead of you", "with you", "3.1 km away". Null stays null.
 */
export function distYou(phrase: string | null): string | null {
  if (!phrase) return null;
  if (/ ahead$/.test(phrase)) return `${phrase} of you`;
  if (/ behind$/.test(phrase)) return `${phrase} you`;
  return lowerFirst(phrase);
}

/** Takeover headline form of the phrase: "400 m behind you", "Right next to you". Null stays null. */
export function distHeadline(phrase: string | null): string | null {
  if (!phrase) return null;
  const m = phrase.match(/^(.*) (ahead|behind)$/);
  if (m) return t(m[2] === 'ahead' ? 'sos.distAhead' : 'sos.distBehind', { d: m[1] });
  if (phrase === copy['live.level']) return copy['sos.distWith'];
  return phrase;
}

/** Distance inside a banner: "With you" -> "with you"; others unchanged. Null stays null. */
export function distInline(phrase: string | null): string | null {
  return phrase ? lowerFirst(phrase) : null;
}

/**
 * Distance inside the in-app alert banner: the same phrase as the rider rows ("1.2 km behind",
 * "1.2 km ahead", "3.1 km away"), with "With you" lower-cased. Null stays null.
 */
export function alertDist(phrase: string | null): string | null {
  return distInline(phrase);
}

/**
 * Distance for a banner that is on screen, recomputed from the live phrase so it never disagrees with the
 * rider row. Offline riders get the same "≈" prefix the row uses. Falls back to the frozen alert-time text.
 */
export function liveBannerDistance(
  kind: string,
  livePhrase: string | null,
  frozen: string | null,
): string | null {
  if (!livePhrase) return frozen;
  if (kind === 'offline' && !livePhrase.startsWith('≈') && livePhrase !== copy['live.level']) return `≈${livePhrase}`;
  return livePhrase;
}

/** Whole minutes of a stop, floored; null under one minute or unknown. */
export function stoppedMinutes(sinceMs: number | null): number | null {
  if (sinceMs === null || Number.isNaN(sinceMs)) return null;
  const min = Math.floor(sinceMs / 60_000);
  return min >= 1 ? min : null;
}

export interface AlertTextInput {
  kind: AlertTextKind;
  /** Full display name; truncated here to 14 characters + ellipsis. */
  name: string;
  /** 06 phrase, or null when unknown. */
  distance: string | null;
  minutes: number | null;
  rideName: string | null;
  label?: string;
  icon?: string;
}

/** Notification title and body (07 §2). Titles stay under the OS limit thanks to name truncation. */
export function notificationText(input: AlertTextInput): { title: string; body: string } {
  const name = truncateName(input.name);
  const dy = distYou(input.distance);
  const ride = input.rideName;
  switch (input.kind) {
    case 'sos':
      return {
        title: t('notif.sos.title', { name }),
        body: capitalize(join([dy, 'tap to see where'])),
      };
    case 'stopped':
      return {
        title: t('notif.stopped.title', { name }),
        // Minutes come from the stop itself; marketing asked for them, 09 has no slot, so they sit
        // between the distance and the ride name.
        body: capitalize(
          join([dy, input.minutes ? `${input.minutes} min` : null, ride]) || 'Check the map.',
        ),
      };
    case 'offline':
      return {
        title: t('notif.offline.title', { name }),
        body: dy ? t('notif.offline.body', { distYou: dy }) : 'Check the map.',
      };
    case 'sos_cleared':
      return {
        title: t('notif.sosCleared.title', { name }),
        body: ride ? t('notif.sosCleared.body', { ride }) : 'SOS cleared',
      };
    case 'message':
      return {
        title: t('notif.message.title', { icon: input.icon ?? '', label: input.label ?? '' }).trim(),
        body: ride ? t('notif.message.body', { name, ride }) : `From ${name}`,
      };
    case 'ended':
      return {
        title: copy['notif.ended.title'],
        body: ride ? t('notif.ended.body', { ride }) : copy['notif.ended.bodyNoRide'],
      };
  }
}

/**
 * Banner text split around the rider's name so the UI can truncate only the name:
 * render `pre`, the name (flex-shrink), then `rest` (never cut). For "Priya stopped · 4.2 km behind"
 * pre is "" and rest is " stopped · 4.2 km behind".
 */
export function bannerParts(input: AlertTextInput): { pre: string; name: string; rest: string } {
  const marker = '\u0001';
  const dist = alertDist(input.distance);
  // Stopped/offline banners lead with the first name; the distance is the part that must survive.
  const name =
    input.kind === 'stopped' || input.kind === 'offline' ? firstName(input.name) : input.name;
  let template: string;
  switch (input.kind) {
    case 'stopped':
      template = dist ? copy['alert.stopped'] : copy['alert.stopped'].replace(/ · \{dist\}$/, '');
      break;
    case 'offline':
      template = dist ? copy['alert.offline'] : copy['alert.offline'].replace(/ · \{dist\}$/, '');
      break;
    case 'sos_cleared':
      template = copy['alert.sosCleared'];
      break;
    case 'message':
      template = copy['alert.message'];
      break;
    default:
      // sos and ended have no name-led banner of this shape.
      template = '{name}';
  }
  const filled = template
    .replace('{name}', marker)
    .replace('{dist}', dist ?? '')
    .replace('{label}', input.label ?? '');
  const [pre, rest] = filled.split(marker);
  return { pre: pre ?? '', name, rest: rest ?? '' };
}
