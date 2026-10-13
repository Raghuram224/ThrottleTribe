// Pure emergency-contact logic (docs/design/11): phone rules, labels, ordering, SMS text and error
// mapping. No React, no native modules, no network (the Supabase calls live in
// emergency-contacts-api.ts so this file stays Jest-friendly).
import { copy, fill } from '@/lib/copy';
import { firstName } from '@/lib/names';
import { normalisePhone as normalisePhoneBase } from '@/lib/phone';

export const MAX_CONTACTS = 5;
export const EMERGENCY_NUMBER = '112';
export const AMBULANCE_NUMBER = '108';
export const NAME_MAX = 40;
export const RELATION_MAX = 30;

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
  position: number;
}

// ---------------------------------------------------------------- phone numbers

/**
 * 11 §3. Returns the value to store, or null when the DB check would reject it. The rules live in
 * `phone.ts` (one implementation); this binds the emergency-contact mode: short codes (108, 112,
 * 1091) are kept, Indian mobiles become +91, anything else is `prefix` + digits.
 */
export function normalisePhone(input: string, prefix = '+91'): string | null {
  return normalisePhoneBase(input, prefix, { allowShortCodes: true });
}

/** 3-5 digits, no plus: 108, 112, 1091. Cannot be texted. */
export const isShortCode = (phone: string) => /^\d{3,5}$/.test(phone);

/** "+919845012210" -> "+91 98450 12210". Short codes and other countries are shown as stored. */
export function formatPhone(phone: string): string {
  const m = /^\+91([6-9]\d{4})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** Screen-reader text, digit by digit: "+919845" -> "plus 9 1 9 8 4 5". */
export function spokenPhone(phone: string): string {
  return phone
    .split('')
    .map((c) => (c === '+' ? 'plus' : c))
    .join(' ');
}

// ---------------------------------------------------------------- labels and ordering

/** Button label subject: the relation if set ("Call Mom"), else the contact's first name. */
export function whoLabel(c: Pick<EmergencyContact, 'name' | 'relation'>): string {
  return c.relation?.trim() || firstName(c.name) || c.name;
}

export const sortContacts = <T extends { position: number }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => a.position - b.position);

/** Contacts we can text: everything except short codes (you cannot text an ambulance). */
export const textableContacts = (rows: readonly EmergencyContact[]) =>
  sortContacts(rows).filter((c) => !isShortCode(c.phone));

export interface CallItem {
  key: string;
  /** Button text, e.g. "Call Mom" or "Call 112 · Emergency". */
  label: string;
  /** Second line: the number, so a rider can read it out. */
  sub: string | null;
  phone: string;
  /** Compact receiver rows (takeover): the name or relation and the formatted number, one line. */
  title?: string;
  number?: string;
  /** The first saved contact is the single strongest (filled) button; 112 is filled with 0 contacts. */
  strongest: boolean;
}

/**
 * Sender call list (11 §5): contacts by position, then 112. With no contacts 112 is the filled
 * button. 112 is always present, whatever state the contact list is in.
 */
export function senderCallList(rows: readonly EmergencyContact[]): CallItem[] {
  const items: CallItem[] = sortContacts(rows).map((c, i) => ({
    key: c.id,
    label: fill(copy['sosMe.call'], { who: whoLabel(c) }),
    sub: formatPhone(c.phone),
    phone: c.phone,
    strongest: i === 0,
  }));
  items.push({
    key: 'builtin-112',
    label: copy['sosMe.call112'],
    sub: null,
    phone: EMERGENCY_NUMBER,
    strongest: items.length === 0,
  });
  return items;
}

/** Receiver list (11 §6): same order, label by relation, meta line "Arun's Mom · +91 …", 112 last. */
export function receiverCallList(rows: readonly EmergencyContact[], sosName: string): CallItem[] {
  const owner = firstName(sosName) || sosName;
  const items: CallItem[] = sortContacts(rows).map((c) => {
    const rel = c.relation?.trim();
    const phone = formatPhone(c.phone);
    return {
      key: c.id,
      label: fill(copy['sos.callContact'], { who: whoLabel(c) }),
      sub: rel
        ? fill(copy['sos.contactMeta'], { name: owner, relation: rel, phone })
        : fill(copy['sos.contactMetaPlain'], { contactName: c.name, phone }),
      phone: c.phone,
      title: whoLabel(c),
      number: phone,
      strongest: false,
    };
  });
  items.push({
    key: 'builtin-112',
    label: copy['sosMe.call112'],
    sub: null,
    phone: EMERGENCY_NUMBER,
    title: copy['sos.emergencyTitle'],
    number: EMERGENCY_NUMBER,
    strongest: false,
  });
  return items;
}

/** First names of the people a text will go to, for the button's second line. */
export function textRecipientNames(rows: readonly EmergencyContact[]): string {
  return textableContacts(rows)
    .map((c) => firstName(c.name) || c.name)
    .join(', ');
}

/** 11 §4: the receiver-side loading state. 112 must stay visible in every one of these. */
export type ReceiverContactsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; contacts: EmergencyContact[] };

/** What the takeover renders for each fetch state; `list` always ends with the 112 row. */
export function receiverView(state: ReceiverContactsState, sosName: string) {
  const contacts = state.status === 'ready' ? state.contacts : [];
  return {
    list: receiverCallList(contacts, sosName),
    skeleton: state.status === 'loading',
    error: state.status === 'error',
    none: state.status === 'ready' && contacts.length === 0,
  };
}

// ---------------------------------------------------------------- reordering

/** Moves a contact one step; returns the list unchanged at either end. */
export function moveContact<T extends { id: string }>(rows: readonly T[], id: string, dir: -1 | 1): T[] {
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return [...rows];
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Position updates (0..n-1) for rows whose stored position differs from their index. */
export function positionUpdates(rows: readonly { id: string; position: number }[]) {
  return rows.flatMap((r, index) => (r.position === index ? [] : [{ id: r.id, position: index }]));
}

// ---------------------------------------------------------------- validation and errors

export interface ContactDraft {
  name: string;
  phone: string;
  relation: string | null;
}

export type DraftError = 'name' | 'phone' | 'duplicate';

/** Cleans a draft for saving, or says what is wrong. `others` = the other saved contacts. */
export function checkDraft(
  draft: { name: string; phone: string; relation: string },
  others: readonly EmergencyContact[],
  prefix = '+91',
): { ok: true; value: ContactDraft } | { ok: false; error: DraftError } {
  const name = draft.name.trim().slice(0, NAME_MAX);
  if (!name) return { ok: false, error: 'name' };
  const phone = normalisePhone(draft.phone, prefix);
  if (!phone) return { ok: false, error: 'phone' };
  if (others.some((c) => c.phone === phone)) return { ok: false, error: 'duplicate' };
  const relation = draft.relation.trim().slice(0, RELATION_MAX);
  return { ok: true, value: { name, phone, relation: relation || null } };
}

export const draftErrorText = (e: DraftError) =>
  e === 'name' ? copy['contacts.errName'] : e === 'phone' ? copy['contacts.errPhone'] : copy['contacts.errDuplicate'];

/** Postgrest/network error -> user-facing text (11 §2). */
export function contactErrorText(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  if (message.includes('contact_limit_reached')) return copy['contacts.errFull'];
  // 23514 = check_violation (phone / name / relation / position constraints).
  if (code === '23514' || /check constraint|violates check/i.test(message)) return copy['contacts.errPhone'];
  if (/network|fetch|timed? ?out|offline/i.test(message)) return copy['errors.network'];
  return copy['errors.unknown'];
}

// ---------------------------------------------------------------- SMS

const SMS_MAX = 160;

export interface SmsFix {
  lat: number;
  lng: number;
}

/** https://maps.google.com/?q=lat,lng with 5 decimals (about 1 m). */
export function mapsLink(fix: SmsFix): string {
  return `https://maps.google.com/?q=${fix.lat.toFixed(5)},${fix.lng.toFixed(5)}`;
}

/**
 * The "Text my location" body. One SMS (<= 160 chars) and ASCII for an ASCII name; the name is
 * shortened if it would not fit. No fix -> the "location unknown, please call me" wording.
 */
export function buildSosSms(name: string, fix: SmsFix | null): string {
  const clean = (name.trim() || 'a rider').replace(/\s+/g, ' ');
  const build = (n: string) =>
    fill(copy[fix ? 'sosMe.smsBody' : 'sosMe.smsBodyNoFix'], {
      name: n,
      mapsLink: fix ? mapsLink(fix) : '',
    });
  let chars = Array.from(clean);
  let body = build(chars.join(''));
  while (body.length > SMS_MAX && chars.length > 1) {
    chars = chars.slice(0, -1);
    body = build(chars.join(''));
  }
  return body;
}
