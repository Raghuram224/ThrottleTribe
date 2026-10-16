import { copy } from '../copy';
import {
  addInvitee,
  asciiRideName,
  firstNameKey,
  inviteCounts,
  inviteLink,
  inviteShareMessage,
  inviteSmsBody,
  inviteState,
  matchInvitees,
  parseInvitees,
  shouldPurge,
  smsRideName,
  type Invitee,
  type MatchMember,
} from '../invite';

const BASE = 'https://aqzpdxyckwbxlvqnsnye.supabase.co/functions/v1/join';
const ASCII = /^[\x20-\x7E]*$/;

describe('invite link', () => {
  it('appends ?c=<code>', () => {
    expect(inviteLink('482913', BASE)).toBe(`${BASE}?c=482913`);
    expect(inviteLink('482913', 'https://x.example/j?src=sms')).toBe('https://x.example/j?src=sms&c=482913');
  });
  it('is null without a base URL or with a bad code (never a broken link)', () => {
    expect(inviteLink('482913', undefined)).toBeNull();
    expect(inviteLink('482913', '')).toBeNull();
    expect(inviteLink('482913', '   ')).toBeNull();
    expect(inviteLink('48', BASE)).toBeNull();
  });
});

describe('invite SMS body', () => {
  const link = `${BASE}?c=482913`;

  it('is one SMS segment: plain ASCII and at most 160 chars, even for a 60-char ride name', () => {
    const longName = 'A'.repeat(60);
    const body = inviteSmsBody(longName, '482913', link);
    expect(body).toMatch(ASCII);
    expect(body.length).toBeLessThanOrEqual(160);
    expect(body).toContain('Code 482 913: ');
    expect(body).toContain(link);
  });

  it('truncates the ride name to 24 chars plus "..."', () => {
    expect(smsRideName('Sunday Run')).toBe('Sunday Run');
    expect(smsRideName('x'.repeat(24))).toBe('x'.repeat(24));
    expect(smsRideName('x'.repeat(25))).toBe(`${'x'.repeat(24)}...`);
  });

  it('turns curly quotes, dashes, accents and emoji into plain ASCII', () => {
    expect(asciiRideName('Arun’s “big” ride — day 1')).toBe("Arun's 'big' ride - day 1");
    expect(asciiRideName('Café run 🏍️')).toBe('Cafe run');
    const body = inviteSmsBody('ரவி 🏍️… ride “x”', '111222', link);
    expect(body).toMatch(ASCII);
    expect(body.length).toBeLessThanOrEqual(160);
  });

  it('falls back to a generic name when nothing printable is left', () => {
    expect(smsRideName('🏍️')).toBe('ride');
  });

  it('has a code-only variant without a link (no placeholder left behind)', () => {
    const body = inviteSmsBody('Sunday Run', '482913', null);
    expect(body).toBe('Join my ride "Sunday Run" on Throttle Tribe. Code 482 913');
    expect(body).not.toMatch(/[{}]|http/);
    expect(body).toMatch(ASCII);
  });

  it('the 160 budget holds for links up to 67 characters (the spec link is exactly 67)', () => {
    expect(link).toHaveLength(67);
    const longestLink = `https://example.com/${'p'.repeat(47)}`;
    expect(longestLink).toHaveLength(67);
    expect(inviteSmsBody('A'.repeat(60), '482913', longestLink).length).toBeLessThanOrEqual(160);
  });
});

describe('invite share message', () => {
  it('has name, grouped code and the https link', () => {
    const msg = inviteShareMessage('Sunday Run', '482913', `${BASE}?c=482913`);
    expect(msg).toBe(`Join my ride "Sunday Run" on Throttle Tribe.\nCode: 482 913\n${BASE}?c=482913`);
  });
  it('drops the link line without a base URL', () => {
    expect(inviteShareMessage('Sunday Run', '482913', null)).toBe(
      'Join my ride "Sunday Run" on Throttle Tribe.\nCode: 482 913',
    );
  });
  it('keeps the ride name from breaking the quotes', () => {
    expect(inviteShareMessage('The "Fast" ones', '482913', null)).toContain('"The \'Fast\' ones"');
  });
});

describe('first-name match key', () => {
  it('lowercases, strips accents and punctuation, takes the first word', () => {
    expect(firstNameKey('Priya K.')).toBe('priya');
    expect(firstNameKey('  PRIYA  ')).toBe('priya');
    expect(firstNameKey('José García')).toBe('jose');
    expect(firstNameKey('(Dad) Ravi')).toBe('dad');
    expect(firstNameKey("O'Neil")).toBe('oneil');
  });
  it('keeps Indic scripts intact', () => {
    expect(firstNameKey('ரவி K')).toBe('ரவி');
  });
  it('is empty when there is nothing to compare', () => {
    expect(firstNameKey('')).toBe('');
    expect(firstNameKey('...')).toBe('');
  });
});

describe('matchInvitees', () => {
  const t0 = Date.parse('2026-10-10T10:00:00Z');
  const inv = (id: string, name: string, minutes: number, extra: Partial<Invitee> = {}): Invitee => ({
    id,
    name,
    phone: `+9198450${id.padStart(5, '0')}`,
    invitedAt: t0 + minutes * 60_000,
    ...extra,
  });
  const member = (userId: string, name: string, minutes: number, leftAt: string | null = null): MatchMember => ({
    userId,
    name,
    joinedAt: new Date(t0 + minutes * 60_000).toISOString(),
    leftAt,
  });

  it('matches a member who joins after the invite by first name', () => {
    const out = matchInvitees([inv('1', 'Priya Sharma', 0)], [member('u1', 'Priya K.', 5)], 'me');
    expect(out[0].matchedUserId).toBe('u1');
  });

  it('does not match someone who joined before the invite, or a different first name', () => {
    const list = [inv('1', 'Priya', 10)];
    expect(matchInvitees(list, [member('u1', 'Priya', 5)], 'me')).toBe(list);
    expect(matchInvitees(list, [member('u1', 'Sam', 20)], 'me')).toBe(list);
  });

  it('never matches me', () => {
    const list = [inv('1', 'Arun', 0)];
    expect(matchInvitees(list, [member('me', 'Arun', 5)], 'me')).toBe(list);
  });

  it('two invitees with the same first name: the earliest invite is matched first', () => {
    const list = [inv('2', 'Priya R', 3), inv('1', 'Priya K', 1)];
    const out = matchInvitees(list, [member('u1', 'Priya', 10)], 'me');
    expect(out.find((i) => i.id === '1')?.matchedUserId).toBe('u1');
    expect(out.find((i) => i.id === '2')?.matchedUserId).toBeUndefined();
  });

  it('a second member with the same first name takes the next invitee, never the same one twice', () => {
    const list = [inv('1', 'Priya K', 1), inv('2', 'Priya R', 3)];
    const out = matchInvitees(list, [member('u1', 'Priya', 10), member('u2', 'Priya', 12)], 'me');
    expect(out.map((i) => i.matchedUserId)).toEqual(['u1', 'u2']);
  });

  it('keeps an existing match and returns the same array when nothing changed', () => {
    const list = [inv('1', 'Priya', 0, { matchedUserId: 'u1' })];
    expect(matchInvitees(list, [member('u1', 'Priya', 5), member('u9', 'Priya', 6)], 'me')).toBe(list);
  });
});

describe('inviteState and counts', () => {
  const invitee: Invitee = { id: '1', name: 'Priya', phone: '+919845012210', invitedAt: 1 };
  const members: MatchMember[] = [
    { userId: 'u1', name: 'Priya K', joinedAt: '2026-10-10T10:05:00Z', leftAt: null },
  ];

  it('invited until matched, joined as the rider name, left when they left', () => {
    expect(inviteState(invitee, members)).toEqual({ state: 'invited', riderName: null });
    const matched = { ...invitee, matchedUserId: 'u1' };
    expect(inviteState(matched, members)).toEqual({ state: 'joined', riderName: 'Priya K' });
    const left = [{ ...members[0], leftAt: '2026-10-10T11:00:00Z' }];
    expect(inviteState(matched, left).state).toBe('left');
  });

  it('counts invited and joined', () => {
    const list = [{ ...invitee, matchedUserId: 'u1' }, { ...invitee, id: '2' }];
    expect(inviteCounts(list, members)).toEqual({ invited: 2, joined: 1 });
  });
});

describe('addInvitee and storage helpers', () => {
  it('normalises the number and refuses duplicates', () => {
    const first = addInvitee([], { name: ' Sam ', phone: '098450 12210' }, 5, 'a');
    expect(first).toEqual([{ id: 'a', name: 'Sam', phone: '+919845012210', invitedAt: 5 }]);
    expect(addInvitee(first ?? [], { name: 'Sam again', phone: '+91 98450-12210' }, 6, 'b')).toBeNull();
    expect(addInvitee([], { name: 'x', phone: '12' }, 5, 'c')).toBeNull();
  });

  it('parses stored lists defensively', () => {
    expect(parseInvitees(null)).toEqual([]);
    expect(parseInvitees('not json')).toEqual([]);
    expect(parseInvitees('{"a":1}')).toEqual([]);
    const ok = { id: 'a', name: 'Sam', phone: '+919845012210', invitedAt: 1 };
    expect(parseInvitees(JSON.stringify([ok, { id: 3 }, null]))).toEqual([ok]);
  });

  it('purges 24 h after the ride ended, or when stale for a week', () => {
    const day = 24 * 60 * 60 * 1000;
    const list: Invitee[] = [{ id: 'a', name: 'Sam', phone: '+919845012210', invitedAt: 1_000_000 }];
    const now = 1_000_000 + 2 * day;
    expect(shouldPurge(list, now - day - 1, now)).toBe(true);
    expect(shouldPurge(list, now - day + 60_000, now)).toBe(false);
    expect(shouldPurge(list, null, now)).toBe(false);
    expect(shouldPurge(list, null, 1_000_000 + 8 * day)).toBe(true);
    expect(shouldPurge([], null, now)).toBe(true);
  });
});

describe('invite copy budgets (09-states-copy max lengths)', () => {
  const max: Record<string, number> = {
    'invite.title': 16,
    'invite.textSub': 28,
    'invite.shareSub': 32,
    'invite.stateInvited': 8,
    'invite.stateJoined': 8,
    'invite.stateLeft': 6,
    'invite.honestNote': 88,
    'invite.emptyHint': 64,
    'invite.permTitle': 32,
    'invite.permBody': 56,
    'invite.permCta': 12,
    'invite.permDenied': 48,
    'invite.smsUnavailable': 64,
    'invite.trayFull': 20,
    'lobby.invite': 16,
    'live.menuInvite': 16,
  };
  it.each(Object.entries(max))('%s fits %i characters', (key, limit) => {
    expect(copy[key as keyof typeof copy].length).toBeLessThanOrEqual(limit);
  });
});
