// expo-contacts wrapper for the invite flow (docs/design/10 §4.1, §6). Native: not unit-tested.
// API verified against node_modules/expo-contacts/build (Contact.presentPicker, getFullName,
// getPhones, getPermissionsAsync, requestPermissionsAsync). The system picker returns the chosen
// contact, but reading its phone numbers needs READ_CONTACTS on Android, so we ask just in time,
// after our own explain-first sheet.
import { Contact, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';

/** granted | askable (the OS dialog will still show) | blocked (only Settings can change it). */
export type ContactsAccess = 'granted' | 'askable' | 'blocked';

function toAccess(r: { granted: boolean; canAskAgain: boolean }): ContactsAccess {
  if (r.granted) return 'granted';
  return r.canAskAgain ? 'askable' : 'blocked';
}

export async function contactsAccess(): Promise<ContactsAccess> {
  try {
    return toAccess(await getPermissionsAsync());
  } catch {
    return 'askable';
  }
}

export async function requestContactsAccess(): Promise<ContactsAccess> {
  try {
    return toAccess(await requestPermissionsAsync());
  } catch {
    return 'blocked';
  }
}

export interface PickedNumber {
  label: string;
  number: string;
}

export interface PickedContact {
  name: string;
  numbers: PickedNumber[];
}

const LABELS: Record<string, string> = { mobile: 'Mobile', work: 'Work', home: 'Home', other: 'Other' };

function labelOf(raw: string | undefined): string {
  const key = (raw ?? '').trim().toLowerCase();
  return LABELS[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Mobile');
}

/**
 * Opens the system contact picker (one contact per call). Null on cancel. Throws
 * 'contacts_permission' when Android refuses to hand over the phone numbers.
 */
export async function pickContact(): Promise<PickedContact | null> {
  const contact = await Contact.presentPicker();
  if (!contact) return null;
  try {
    const [fullName, phones] = await Promise.all([contact.getFullName(), contact.getPhones()]);
    const seen = new Set<string>();
    const numbers: PickedNumber[] = [];
    for (const p of phones) {
      const number = p.number?.trim();
      const digits = number?.replace(/\D/g, '');
      if (!number || !digits || seen.has(digits)) continue;
      seen.add(digits);
      numbers.push({ label: labelOf(p.label), number });
    }
    return { name: fullName?.trim() ?? '', numbers };
  } catch (e) {
    if (/permission/i.test(String((e as { message?: unknown })?.message ?? e))) {
      throw new Error('contacts_permission');
    }
    throw e;
  }
}
