import { t } from '../copy';
import {
  greetingCopyKey,
  greetingKey,
  isGuest,
  pickNudge,
  profilePill,
  profileTodoCount,
  setupIncomplete,
  setupItems,
  showLobbyContactsBanner,
} from '../home';

describe('greetingKey', () => {
  it('splits the day at 5, 12 and 17', () => {
    expect(greetingKey(5)).toBe('home.greetMorning');
    expect(greetingKey(11)).toBe('home.greetMorning');
    expect(greetingKey(12)).toBe('home.greetAfternoon');
    expect(greetingKey(16)).toBe('home.greetAfternoon');
    expect(greetingKey(17)).toBe('home.greetEvening');
    expect(greetingKey(23)).toBe('home.greetEvening');
    expect(greetingKey(0)).toBe('home.greetEvening');
    expect(greetingKey(4)).toBe('home.greetEvening');
  });
});

describe('pickNudge (one card at most)', () => {
  it('contacts come first, even for a guest', () => {
    expect(pickNudge({ contacts: 0, guest: true, dismissed: {} })).toBe('contacts');
  });
  it('falls to save account when contacts exist or were dismissed', () => {
    expect(pickNudge({ contacts: 2, guest: true, dismissed: {} })).toBe('save');
    expect(pickNudge({ contacts: 0, guest: true, dismissed: { contacts: true } })).toBe('save');
  });
  it('shows nothing when everything is done or dismissed', () => {
    expect(pickNudge({ contacts: 1, guest: false, dismissed: {} })).toBeNull();
    expect(pickNudge({ contacts: 0, guest: true, dismissed: { contacts: true, save: true } })).toBeNull();
  });
  it('treats an unknown contact count (loading or failed) as unknown: no nudge, save never jumps ahead', () => {
    expect(pickNudge({ contacts: 'loading', guest: true, dismissed: {} })).toBeNull();
    expect(pickNudge({ contacts: 'error', guest: true, dismissed: {} })).toBeNull();
    expect(pickNudge({ contacts: 'error', guest: false, dismissed: {} })).toBeNull();
    // Once the count loads, contacts come first.
    expect(pickNudge({ contacts: 0, guest: true, dismissed: {} })).toBe('contacts');
  });
});

describe('unknown name', () => {
  it('greets without a name or trailing comma', () => {
    expect(greetingCopyKey(20, false)).toBe('home.greetEveningNoName');
    expect(t(greetingCopyKey(20, false), { name: '' })).toBe('Good evening');
    expect(t(greetingCopyKey(8, false), { name: '' })).toBe('Good morning');
    expect(t(greetingCopyKey(13, true), { name: 'Arun' })).toBe('Good afternoon, Arun');
  });
  it('profile pill and a11y label skip the empty name', () => {
    expect(profilePill('', '')).toEqual({ text: 'Profile', label: 'Your profile. Edit name' });
    expect(profilePill('Arun', '1 thing to set up')).toEqual({
      text: 'Arun',
      label: 'Your profile, Arun. Edit name. 1 thing to set up',
    });
  });
  it('a missing session user is not a guest (no "1 thing to set up" while unloaded)', () => {
    expect(isGuest(null)).toBe(false);
    expect(isGuest({ is_anonymous: true })).toBe(true);
    expect(isGuest({ email: 'a@b.co', is_anonymous: false })).toBe(false);
    expect(profileTodoCount('error', isGuest(null))).toBe(0);
  });
});

describe('profileTodoCount', () => {
  it('counts no contacts and guest account', () => {
    expect(profileTodoCount(0, true)).toBe(2);
    expect(profileTodoCount(0, false)).toBe(1);
    expect(profileTodoCount(3, true)).toBe(1);
    expect(profileTodoCount(3, false)).toBe(0);
    expect(profileTodoCount('loading', false)).toBe(0);
  });
});

describe('showLobbyContactsBanner', () => {
  it('only for a known zero, once per ride', () => {
    expect(showLobbyContactsBanner(true, 0, false)).toBe(true);
    expect(showLobbyContactsBanner(false, 0, false)).toBe(false);
    expect(showLobbyContactsBanner(true, 2, false)).toBe(false);
    expect(showLobbyContactsBanner(true, 0, true)).toBe(false);
  });
});

describe('setup row', () => {
  it('lists what is missing and ignores an unchecked contact state', () => {
    const items = setupItems({ locationGranted: true, alertsGranted: false, contactCount: 0, contactsLoaded: false });
    expect(items.map((i) => i.done)).toEqual([true, false, true]);
    expect(setupIncomplete(items)).toBe(true);
    const done = setupItems({ locationGranted: true, alertsGranted: true, contactCount: 1, contactsLoaded: true });
    expect(setupIncomplete(done)).toBe(false);
  });
});
