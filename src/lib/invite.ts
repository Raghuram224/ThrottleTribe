// Pure invite logic (docs/design/10-invite.md): link and message builders, the on-device invited
// list and the honest "Joined" first-name match. No React, no native modules, unit-tested.
import { fill, copy } from '@/lib/copy';
import { normalisePhone } from '@/lib/phone';

export const SMS_MAX_CHARS = 160;
export const RIDE_NAME_IN_SMS_MAX = 24;
export const TRAY_MAX = 10;

// ---------------------------------------------------------------- link and messages

/** `<base>?c=<code>`; null when no base URL is configured (callers then send the code only). */
export function inviteLink(code: string, base: string | null | undefined): string | null {
  const b = base?.trim();
  if (!b || !/^\d{6}$/.test(code)) return null;
  return `${b}${b.includes('?') ? '&' : '?'}c=${code}`;
}

/** Plain-ASCII version of a ride name for SMS: straight quotes only, no emoji, collapsed spaces. */
export function asciiRideName(name: string): string {
  const cleaned = name
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟"]/g, "'")
    .replace(/[–—]/g, '-')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

/** At most 24 characters, then "..." (never the ellipsis character: it is not GSM-7). */
export function smsRideName(name: string, max = RIDE_NAME_IN_SMS_MAX): string {
  const plain = asciiRideName(name) || 'ride';
  return plain.length <= max ? plain : `${plain.slice(0, max).trimEnd()}...`;
}

function codeParts(code: string) {
  return { code3a: code.slice(0, 3), code3b: code.slice(3) };
}

/** The pre-filled invite text. One SMS segment: plain ASCII and at most 160 characters. */
export function inviteSmsBody(rideName: string, code: string, link: string | null): string {
  const template = link ? copy['invite.smsBody'] : copy['invite.smsBodyNoLink'];
  return fill(template, { ride: smsRideName(rideName), ...codeParts(code), link: link ?? '' });
}

/** Share-sheet text (no length limit that matters, still plain). */
export function inviteShareMessage(rideName: string, code: string, link: string | null): string {
  const template = link ? copy['invite.shareMessage'] : copy['invite.shareMessageNoLink'];
  const ride = rideName.trim().replace(/"/g, "'") || 'ride';
  return fill(template, { ride, ...codeParts(code), link: link ?? '' });
}

// ---------------------------------------------------------------- invited list

export interface Invitee {
  id: string;
  name: string;
  /** Normalised `+<digits>`. Stays on this phone. */
  phone: string;
  /** Epoch ms when the SMS app was opened for this number. */
  invitedAt: number;
  matchedUserId?: string;
}

export interface MatchMember {
  userId: string;
  name: string;
  joinedAt: string;
  leftAt: string | null;
}

export type InviteState = 'invited' | 'joined' | 'left';

/** Lowercase, accents stripped (Latin only: Indic vowel signs must survive), punctuation removed. */
function plainWord(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

/** "Priya K." -> "priya". First word that has any letters or digits; '' when none. */
export function firstNameKey(name: string): string {
  for (const word of name.trim().split(/\s+/)) {
    const key = plainWord(word);
    if (key) return key;
  }
  return '';
}

/**
 * Auto-match (10 §5). For each member in join order, skipping me and members already matched:
 * among unmatched invitees invited at or before the join whose first-name key equals the member's,
 * the earliest invite wins. Returns the same array when nothing changed.
 */
export function matchInvitees(
  invitees: Invitee[],
  members: MatchMember[],
  myUserId: string | null,
): Invitee[] {
  const taken = new Set(invitees.map((i) => i.matchedUserId).filter((id): id is string => !!id));
  const sorted = members
    .filter((m) => m.userId !== myUserId && !taken.has(m.userId))
    .sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt));

  let next = invitees;
  for (const member of sorted) {
    const key = firstNameKey(member.name);
    if (!key) continue;
    const joinedMs = Date.parse(member.joinedAt);
    const candidate = next
      .filter((i) => !i.matchedUserId && i.invitedAt <= joinedMs && firstNameKey(i.name) === key)
      .sort((a, b) => a.invitedAt - b.invitedAt)[0];
    if (!candidate) continue;
    next = next.map((i) => (i.id === candidate.id ? { ...i, matchedUserId: member.userId } : i));
  }
  return next;
}

/** Invited / Joined / Left for a row, plus the matched rider's name for "Joined as ...". */
export function inviteState(
  invitee: Invitee,
  members: MatchMember[],
): { state: InviteState; riderName: string | null } {
  const member = invitee.matchedUserId
    ? members.find((m) => m.userId === invitee.matchedUserId)
    : undefined;
  if (!member) return { state: 'invited', riderName: null };
  return { state: member.leftAt ? 'left' : 'joined', riderName: member.name };
}

export function inviteCounts(
  invitees: Invitee[],
  members: MatchMember[],
): { invited: number; joined: number } {
  const joined = invitees.filter((i) => inviteState(i, members).state === 'joined').length;
  return { invited: invitees.length, joined };
}

/** Adds an invitee unless that number is already on the list. Returns null for a duplicate. */
export function addInvitee(
  list: Invitee[],
  entry: { name: string; phone: string },
  now: number,
  id: string,
): Invitee[] | null {
  const phone = normalisePhone(entry.phone, '+91');
  if (!phone || list.some((i) => i.phone === phone)) return null;
  return [...list, { id, name: entry.name.trim() || phone, phone, invitedAt: now }];
}

// ---------------------------------------------------------------- persistence helpers

export function parseInvitees(raw: string | null): Invitee[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (v): v is Invitee =>
        !!v &&
        typeof v.id === 'string' &&
        typeof v.name === 'string' &&
        typeof v.phone === 'string' &&
        typeof v.invitedAt === 'number',
    );
  } catch {
    return [];
  }
}

/** Purge rule (10 §5): 24 h after the ride ended; safety net: nothing invited in the last 7 days. */
export const PURGE_AFTER_END_MS = 24 * 60 * 60 * 1000;
export const PURGE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldPurge(
  invitees: Invitee[],
  endedAtMs: number | null,
  now: number,
): boolean {
  if (endedAtMs !== null && now - endedAtMs > PURGE_AFTER_END_MS) return true;
  const newest = invitees.reduce((max, i) => Math.max(max, i.invitedAt), 0);
  return invitees.length === 0 || now - newest > PURGE_STALE_MS;
}
