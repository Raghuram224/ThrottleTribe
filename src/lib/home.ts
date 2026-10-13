// Pure Home / lobby decisions (docs/design/13 §3, §7; 11 §4; 12 §4). No React, no native modules.
import { accountState } from '@/lib/account';
import { copy, fill } from '@/lib/copy';

export type GreetingKey = 'home.greetMorning' | 'home.greetAfternoon' | 'home.greetEvening';

/** 5-11 morning, 12-16 afternoon, everything else evening. `hour` is the local hour 0-23. */
export function greetingKey(hour: number): GreetingKey {
  if (hour >= 5 && hour <= 11) return 'home.greetMorning';
  if (hour >= 12 && hour <= 16) return 'home.greetAfternoon';
  return 'home.greetEvening';
}

/** Greeting copy key; without a name (not loaded yet) the no-name variant, never "Good evening, ". */
export function greetingCopyKey(
  hour: number,
  hasName: boolean,
): GreetingKey | 'home.greetMorningNoName' | 'home.greetAfternoonNoName' | 'home.greetEveningNoName' {
  const k = greetingKey(hour);
  if (hasName) return k;
  return `${k}NoName` as 'home.greetMorningNoName' | 'home.greetAfternoonNoName' | 'home.greetEveningNoName';
}

/** Profile pill text and screen-reader label; both skip the name (and its comma) when unknown. */
export function profilePill(first: string, todoWords: string): { text: string; label: string } {
  const base = first ? fill(copy['home.a11yProfile'], { name: first }) : copy['home.a11yProfileNoName'];
  return { text: first || copy['home.profileNoName'], label: [base, todoWords].filter(Boolean).join('. ') };
}

/**
 * Guest (anonymous, not saved) is only known once a session user exists. Offline with an expired
 * token there is none yet: unknown must not count as "1 thing to set up".
 */
export function isGuest(user: { is_anonymous?: boolean; email?: string | null; phone?: string | null } | null | undefined): boolean {
  return !!user && !accountState(user).saved;
}

export type NudgeKind = 'contacts' | 'save';

/** How many emergency contacts the rider has: a number, still loading, or the lookup failed. */
export type ContactCount = number | 'loading' | 'error';

export interface NudgeInput {
  contacts: ContactCount;
  /** Anonymous (guest) account: not saved with an email or phone yet. */
  guest: boolean;
  /** Kinds the rider tapped "Later" on since the last ride ended. */
  dismissed: Readonly<Partial<Record<NudgeKind, boolean>>>;
}

/**
 * The single nudge card on Home. Priority: emergency contacts, then "Save your account". At most
 * one. While the contact count is loading nothing shows (no flash of the wrong card); when the
 * lookup failed the contacts card is skipped but saving the account can still be offered.
 */
export function pickNudge({ contacts, guest, dismissed }: NudgeInput): NudgeKind | null {
  // Unknown count (loading, or failed e.g. offline): show nothing until it loads, so "Save your
  // account" never jumps the queue ahead of a contacts nudge that is really due.
  if (contacts === 'loading' || contacts === 'error') return null;
  if (contacts === 0 && !dismissed.contacts) return 'contacts';
  if (guest && !dismissed.save) return 'save';
  return null;
}

/** "Things to set up" behind the amber dot on the Home avatar: 0 contacts, guest account. */
export function profileTodoCount(contacts: ContactCount, guest: boolean): number {
  return (contacts === 0 ? 1 : 0) + (guest ? 1 : 0);
}

/**
 * Lobby banner "Add an SOS contact before you ride" (11 §4): only when the rider has 0 contacts
 * (known, not loading) and has not dismissed it for this ride.
 */
export function showLobbyContactsBanner(
  contactsLoaded: boolean,
  contactCount: number,
  dismissedForRide: boolean,
): boolean {
  return contactsLoaded && contactCount === 0 && !dismissedForRide;
}

/** What the lobby setup row (P2) lists: each item and whether it is done. */
export interface SetupItem {
  key: 'location' | 'alerts' | 'contact';
  done: boolean;
}

export function setupItems(input: {
  locationGranted: boolean;
  alertsGranted: boolean;
  contactCount: number;
  contactsLoaded: boolean;
}): SetupItem[] {
  return [
    { key: 'location', done: input.locationGranted },
    { key: 'alerts', done: input.alertsGranted },
    // Unknown contact state counts as done: never nag about something we have not checked.
    { key: 'contact', done: !input.contactsLoaded || input.contactCount > 0 },
  ];
}

/** The setup row only shows when something is missing. */
export const setupIncomplete = (items: readonly SetupItem[]): boolean => items.some((i) => !i.done);
