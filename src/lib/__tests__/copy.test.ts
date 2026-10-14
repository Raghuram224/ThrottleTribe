import { alertDist, bannerParts, distHeadline, distInline, distYou, stoppedMinutes } from '../alert-text';
import {
  copy,
  errorText,
  fill,
  groupCode,
  plural,
  riderCount,
  shareMessage,
  spokenCode,
  statusText,
  t,
} from '../copy';
import { distancePhrase, formatDistance, formatElapsed } from '../format';
import { firstName, initialsOf, truncateName } from '../names';

describe('copy helpers', () => {
  it('fill replaces known placeholders and leaves unknown visible', () => {
    expect(fill('Hi {name}, {x}', { name: 'Arun' })).toBe('Hi Arun, {x}');
    expect(t('home.toastWelcome', { name: 'Arun' })).toBe("You're all set, Arun");
  });

  it('every error key has a text and unknown codes fall back', () => {
    expect(errorText('ride_not_found')).toBe(copy['errors.ride_not_found']);
    expect(errorText('nope')).toBe(copy['errors.unknown']);
  });

  it('groups and speaks codes', () => {
    expect(groupCode('483259')).toBe('483 259');
    expect(groupCode('12')).toBe('12');
    expect(spokenCode('483259')).toBe('4 8 3 2 5 9');
  });

  it('share message has name, grouped code and deep link', () => {
    const msg = shareMessage('Sunday Run', '483259');
    expect(msg).toContain('"Sunday Run"');
    expect(msg).toContain('483 259');
    expect(msg).toContain('throttletribe://join?code=483259');
  });

  it('status text drops the duration tail when unknown and handles never-seen', () => {
    expect(statusText('stopped', '6 min')).toBe('Stopped · 6 min');
    expect(statusText('stopped', null)).toBe('Stopped');
    expect(statusText('offline', null, true)).toBe('No signal yet');
    expect(statusText('moving', '1 min')).toBe('Moving');
  });

  it('labels contain words, never symbols or emoji (icons are drawn by <Icon>)', () => {
    const symbols = /[⌀-➿⤀-⯿︎️\u{1F000}-\u{1FFFF}]/u;
    const spoken = Object.entries(copy).filter(
      ([key]) => !key.startsWith('notif.') && key !== 'live.msgSent',
    );
    for (const [key, text] of spoken) {
      expect({ key, hasSymbol: symbols.test(text) }).toEqual({ key, hasSymbol: false });
    }
  });

  it('pluralises riders', () => {
    expect(riderCount(0)).toBe('0 riders');
    expect(riderCount(1)).toBe('1 rider');
    expect(riderCount(5)).toBe('5 riders');
    expect(plural(1, 'stop', 'stops')).toBe('1 stop');
    expect(t('lobby.headerMeta', { riders: riderCount(1) })).toBe('Lobby · 1 rider');
  });

  it('designer max lengths hold for the glance strings with a 12-char name', () => {
    const name = 'Abcdefghijkl';
    expect(t('alert.sosCleared', { name }).length).toBeLessThanOrEqual(32);
    expect(t('lobby.waiting', { leader: name }).length).toBeLessThanOrEqual(36);
    expect(t('sos.needsHelp', { name }).length).toBeLessThanOrEqual(28);
  });
});

describe('names', () => {
  it('truncates to 14 chars plus an ellipsis', () => {
    expect(truncateName('Arun')).toBe('Arun');
    expect(truncateName('12345678901234')).toBe('12345678901234');
    expect(truncateName('123456789012345')).toBe('12345678901234…');
  });
  it('first name and initials', () => {
    expect(firstName('Priya K')).toBe('Priya');
    expect(initialsOf('Arun')).toBe('AR');
    expect(initialsOf('Priya K')).toBe('PK');
    expect(initialsOf('  anna  maria  lopez ')).toBe('AM');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('  ')).toBe('?');
    expect(initialsOf('Arun (bot)')).toBe('AR');
    expect(initialsOf('Priya Nair (bot)')).toBe('PN');
    expect(initialsOf('Kiran [test]')).toBe('KI');
    expect(initialsOf('(bot)')).toBe('BO'); // nothing but a tag: fall back to the raw text
    expect(initialsOf('Arun - ')).toBe('AR');
    expect(initialsOf('ரவி')).toBe('ரவி');
    expect(initialsOf('🏍️🔥')).toBe('?');
  });
});

describe('distance formatting', () => {
  it('rounds to 50 m under a kilometre', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(349)).toBe('350 m');
    expect(formatDistance(980)).toBe('1.0 km');
  });
  it('one decimal to 10 km, whole after', () => {
    expect(formatDistance(4200)).toBe('4.2 km');
    expect(formatDistance(9940)).toBe('9.9 km');
    expect(formatDistance(9960)).toBe('10 km');
    expect(formatDistance(12_400)).toBe('12 km');
  });
  it('phrases', () => {
    expect(distancePhrase({ kind: 'behind', distanceM: 4200 })).toBe('4.2 km behind');
    expect(distancePhrase({ kind: 'ahead', distanceM: 1800 })).toBe('1.8 km ahead');
    expect(distancePhrase({ kind: 'level', distanceM: 30 })).toBe('With you');
    expect(distancePhrase({ kind: 'away', distanceM: 3100 })).toBe('3.1 km away');
  });
  it('elapsed is unambiguous: "Just started", "5 min", "6 h 53 min", "1 d 2 h"', () => {
    expect(formatElapsed(84 * 60_000)).toBe('1 h 24 min');
    expect(formatElapsed((6 * 60 + 53) * 60_000)).toBe('6 h 53 min');
    expect(formatElapsed(60 * 60_000)).toBe('1 h');
    expect(formatElapsed(5 * 60_000)).toBe('5 min');
    expect(formatElapsed(59_000)).toBe('Just started');
    expect(formatElapsed(-5)).toBe('Just started');
    expect(formatElapsed(NaN)).toBe('Just started');
    expect(formatElapsed(26 * 3_600_000)).toBe('1 d 2 h');
  });
});

describe('alert text', () => {
  it('distYou reads naturally in a sentence', () => {
    expect(distYou('4.2 km behind')).toBe('4.2 km behind you');
    expect(distYou('1.8 km ahead')).toBe('1.8 km ahead of you');
    expect(distYou('With you')).toBe('with you');
    expect(distYou('3.1 km away')).toBe('3.1 km away');
    expect(distYou(null)).toBeNull();
    expect(distInline('With you')).toBe('with you');
    // Takeover headline: sentence case, never a lowercase fragment.
    expect(distHeadline('400 m behind')).toBe('400 m behind you');
    expect(distHeadline('1.8 km ahead')).toBe('1.8 km ahead of you');
    expect(distHeadline('With you')).toBe('Right next to you');
    expect(distHeadline('3.1 km away')).toBe('3.1 km away');
    expect(distHeadline(null)).toBeNull();
  });

  it('stopped minutes floor and hide under one minute', () => {
    expect(stoppedMinutes(59_000)).toBeNull();
    expect(stoppedMinutes(125_000)).toBe(2);
    expect(stoppedMinutes(null)).toBeNull();
  });

  it('banner parts split around the name so only the name truncates', () => {
    const base = { name: 'Priya', minutes: null, rideName: null };
    expect(bannerParts({ ...base, kind: 'stopped', distance: '4.2 km behind' })).toEqual({
      pre: '',
      name: 'Priya',
      rest: ' · stopped · 4.2 km behind',
    });
    expect(bannerParts({ ...base, kind: 'stopped', distance: null }).rest).toBe(' · stopped');
    expect(bannerParts({ ...base, kind: 'offline', distance: 'With you' }).rest).toBe(
      ' · no signal · with you',
    );
    expect(bannerParts({ ...base, kind: 'message', distance: null, label: 'Fuel stop' }).rest).toBe(': Fuel stop');
    expect(bannerParts({ ...base, kind: 'sos_cleared', distance: null }).rest).toBe(' is OK — SOS cleared');
  });

  it('banner truncation rule: first name is the shrinking span, distance and status never are', () => {
    const parts = bannerParts({
      kind: 'offline',
      name: 'Bartholomew Featherstonehaugh',
      distance: '1.2 km behind',
      minutes: null,
      rideName: null,
    });
    // Only `name` may be ellipsized by the layout; `rest` carries the status and the distance whole.
    expect(parts.name).toBe('Bartholomew');
    expect(parts.rest).toBe(' · no signal · 1.2 km behind');
    expect(parts.pre + parts.name + parts.rest).toBe('Bartholomew · no signal · 1.2 km behind');
    expect(alertDist('1.2 km ahead')).toBe('1.2 km ahead');
    expect(alertDist('3.1 km away')).toBe('3.1 km away');
    expect(alertDist(null)).toBeNull();
  });
});
