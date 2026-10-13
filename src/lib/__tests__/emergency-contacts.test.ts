import {
  buildSosSms,
  checkDraft,
  contactErrorText,
  formatPhone,
  isShortCode,
  mapsLink,
  moveContact,
  normalisePhone,
  positionUpdates,
  receiverView,
  senderCallList,
  spokenPhone,
  textableContacts,
  textRecipientNames,
  whoLabel,
  type EmergencyContact,
} from '../emergency-contacts';
import { copy } from '../copy';

const c = (id: string, name: string, phone: string, position: number, relation: string | null = null): EmergencyContact => ({
  id,
  name,
  phone,
  position,
  relation,
});

describe('normalisePhone (11 §3)', () => {
  it('prefixes +91 to 10-digit Indian mobiles, with or without spaces and dashes', () => {
    expect(normalisePhone('98450 12210')).toBe('+919845012210');
    expect(normalisePhone('98450-12210')).toBe('+919845012210');
    expect(normalisePhone('(984) 501 2210')).toBe('+919845012210');
  });

  it('accepts 0 + 10 digits and 91 + 10 digits', () => {
    expect(normalisePhone('098450 12210')).toBe('+919845012210');
    expect(normalisePhone('919845012210')).toBe('+919845012210');
  });

  it('keeps a leading + and strips formatting', () => {
    expect(normalisePhone('+971 50 123 4567')).toBe('+971501234567');
    expect(normalisePhone('+91 98450 12210')).toBe('+919845012210');
  });

  it('keeps short codes as they are', () => {
    expect(normalisePhone('108')).toBe('108');
    expect(normalisePhone(' 112 ')).toBe('112');
    expect(normalisePhone('1091')).toBe('1091');
  });

  it('uses the selected prefix for everything else', () => {
    expect(normalisePhone('501234567', '+971')).toBe('+971501234567');
    // 10 digits not starting 6-9 is not an Indian mobile.
    expect(normalisePhone('1234567890', '+1')).toBe('+11234567890');
  });

  it('rejects what the database check would reject', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('abc')).toBeNull();
    expect(normalisePhone('12')).toBeNull();
    expect(normalisePhone('+12')).toBeNull();
    expect(normalisePhone('+1234567890123456')).toBeNull();
  });

  it('every accepted value matches ^\\+?[0-9]{3,15}$', () => {
    for (const input of ['98450 12210', '108', '+44 20 7946 0958', '098450 12210', '5551234']) {
      const out = normalisePhone(input);
      expect(out).toMatch(/^\+?[0-9]{3,15}$/);
    }
  });
});

describe('phone display', () => {
  it('formats +91 mobiles and leaves the rest alone', () => {
    expect(formatPhone('+919845012210')).toBe('+91 98450 12210');
    expect(formatPhone('108')).toBe('108');
    expect(formatPhone('+971501234567')).toBe('+971501234567');
  });

  it('detects short codes and reads numbers digit by digit', () => {
    expect(isShortCode('108')).toBe(true);
    expect(isShortCode('1091')).toBe(true);
    expect(isShortCode('+919845012210')).toBe(false);
    expect(spokenPhone('+9198')).toBe('plus 9 1 9 8');
  });
});

describe('who label', () => {
  it('uses the relation, else the first name', () => {
    expect(whoLabel({ name: 'Lakshmi R', relation: 'Mom' })).toBe('Mom');
    expect(whoLabel({ name: 'Lakshmi R', relation: null })).toBe('Lakshmi');
    expect(whoLabel({ name: 'Lakshmi R', relation: '  ' })).toBe('Lakshmi');
  });
});

describe('checkDraft', () => {
  const saved = [c('1', 'Mom', '+919845012210', 0)];
  it('cleans and normalises a valid draft', () => {
    expect(checkDraft({ name: ' Dad ', phone: '98765 43210', relation: ' Dad ' }, saved)).toEqual({
      ok: true,
      value: { name: 'Dad', phone: '+919876543210', relation: 'Dad' },
    });
  });
  it('stores an empty relation as null', () => {
    const r = checkDraft({ name: 'Dad', phone: '108', relation: '' }, saved);
    expect(r.ok && r.value.relation).toBeNull();
  });
  it('flags name, phone and duplicates', () => {
    expect(checkDraft({ name: ' ', phone: '108', relation: '' }, saved)).toEqual({ ok: false, error: 'name' });
    expect(checkDraft({ name: 'A', phone: 'x', relation: '' }, saved)).toEqual({ ok: false, error: 'phone' });
    expect(checkDraft({ name: 'A', phone: '98450 12210', relation: '' }, saved)).toEqual({
      ok: false,
      error: 'duplicate',
    });
  });
});

describe('error mapping', () => {
  it('maps the limit trigger, check violations and network errors', () => {
    expect(contactErrorText({ message: 'contact_limit_reached' })).toBe(copy['contacts.errFull']);
    expect(contactErrorText({ code: '23514', message: 'x' })).toBe(copy['contacts.errPhone']);
    expect(
      contactErrorText({ message: 'new row violates check constraint "emergency_contacts_phone_check"' }),
    ).toBe(copy['contacts.errPhone']);
    expect(contactErrorText(new Error('Network request failed'))).toBe(copy['errors.network']);
    expect(contactErrorText('boom')).toBe(copy['errors.unknown']);
  });
});

describe('reordering', () => {
  const rows = [c('a', 'A', '111', 0), c('b', 'B', '222', 1), c('c', 'C', '333', 2)];
  it('moves one step and stops at the ends', () => {
    expect(moveContact(rows, 'b', -1).map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(moveContact(rows, 'b', 1).map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(moveContact(rows, 'a', -1).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(moveContact(rows, 'c', 1).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('rewrites only positions that changed', () => {
    expect(positionUpdates(moveContact(rows, 'b', -1))).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
    ]);
    expect(positionUpdates(rows)).toEqual([]);
    // A gap after a delete is closed.
    expect(positionUpdates([c('a', 'A', '1', 0), c('c', 'C', '3', 2)])).toEqual([{ id: 'c', position: 1 }]);
  });
});

describe('sender contact list (11 §5)', () => {
  const rows = [
    c('2', 'Ambulance', '108', 1),
    c('1', 'Lakshmi R', '+919845012210', 0, 'Mom'),
    c('3', 'Arun K', '+919876543210', 2),
  ];

  it('orders contacts by position, then 112 last', () => {
    const list = senderCallList(rows);
    expect(list.map((i) => i.label)).toEqual(['Call Mom', 'Call Ambulance', 'Call Arun', 'Call 112 · Emergency']);
    expect(list.map((i) => i.phone)).toEqual(['+919845012210', '108', '+919876543210', '112']);
  });

  it('only the first contact is the strongest button', () => {
    expect(senderCallList(rows).map((i) => i.strongest)).toEqual([true, false, false, false]);
  });

  it('with 0 contacts 112 is the only, filled, button', () => {
    const list = senderCallList([]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ phone: '112', strongest: true });
  });

  it('shows the formatted number as the second line', () => {
    expect(senderCallList(rows)[0].sub).toBe('+91 98450 12210');
  });

  it('texts everyone except short codes, in order', () => {
    expect(textableContacts(rows).map((r) => r.phone)).toEqual(['+919845012210', '+919876543210']);
    expect(textRecipientNames(rows)).toBe('Lakshmi, Arun');
    expect(textableContacts([c('x', 'Ambulance', '108', 0)])).toEqual([]);
  });
});

describe('SMS body (11 §5)', () => {
  const fix = { lat: 12.971599, lng: 77.594566 };

  it('puts a maps link with 5 decimals in the text', () => {
    expect(mapsLink(fix)).toBe('https://maps.google.com/?q=12.97160,77.59457');
    expect(buildSosSms('Arun', fix)).toBe(
      'SOS from Arun. I need help. My location: https://maps.google.com/?q=12.97160,77.59457',
    );
  });

  it('stays one ASCII SMS (<= 160) even for a 40-character name and extreme coordinates', () => {
    const name = 'A'.repeat(40);
    for (const f of [fix, { lat: -33.86882, lng: -151.20929 }, { lat: -89.99999, lng: -179.99999 }, null]) {
      const body = buildSosSms(name, f);
      expect(body.length).toBeLessThanOrEqual(160);
      expect(body).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  it('shortens a name that would not fit, keeping the link whole', () => {
    // Pathological: the template cannot fit this; the guard trims the name, never the link.
    const body = buildSosSms('N'.repeat(300), fix);
    expect(body.length).toBeLessThanOrEqual(160);
    expect(body).toContain('https://maps.google.com/?q=12.97160,77.59457');
  });

  it('says the location is unknown without a fix', () => {
    const body = buildSosSms('Arun', null);
    expect(body).toContain('SOS from Arun.');
    expect(body).toContain("isn't available");
    expect(body).not.toContain('maps.google.com');
  });

  it('falls back to a generic name when the profile name is empty', () => {
    expect(buildSosSms('  ', null)).toContain('SOS from a rider.');
  });

  it('uses only ASCII in both templates', () => {
    expect(copy['sosMe.smsBody']).toMatch(/^[\x20-\x7E]+$/);
    expect(copy['sosMe.smsBodyNoFix']).toMatch(/^[\x20-\x7E]+$/);
  });
});

describe('receiver view (11 §6): 112 is always there', () => {
  const rows = [c('1', 'Lakshmi R', '+919845012210', 0, 'Mom'), c('2', 'Ambulance', '108', 1)];
  const last = (v: ReturnType<typeof receiverView>) => v.list[v.list.length - 1];

  it('loading: skeleton, 112 already real', () => {
    const v = receiverView({ status: 'loading' }, 'Arun K');
    expect(v).toMatchObject({ skeleton: true, error: false, none: false });
    expect(v.list).toHaveLength(1);
    expect(last(v)).toMatchObject({ phone: '112', label: 'Call 112 · Emergency' });
  });

  it('error: shows the error and keeps 112', () => {
    const v = receiverView({ status: 'error' }, 'Arun K');
    expect(v).toMatchObject({ skeleton: false, error: true, none: false });
    expect(last(v).phone).toBe('112');
  });

  it('ready with none: says so and keeps 112', () => {
    const v = receiverView({ status: 'ready', contacts: [] }, 'Arun K');
    expect(v).toMatchObject({ none: true, error: false, skeleton: false });
    expect(v.list.map((i) => i.phone)).toEqual(['112']);
  });

  it('ready: relation labels, "Arun\'s Mom" meta, 112 last', () => {
    const v = receiverView({ status: 'ready', contacts: rows }, 'Arun K');
    expect(v.list.map((i) => i.label)).toEqual(['Call Mom', 'Call Ambulance', 'Call 112 · Emergency']);
    expect(v.list[0].sub).toBe("Arun's Mom · +91 98450 12210");
    expect(v.list[1].sub).toBe('Ambulance · 108');
    // Takeover rows: name + number only (the old line repeated "Karthik's Mom / Mom").
    expect(v.list.map((i) => [i.title, i.number])).toEqual([
      ['Mom', '+91 98450 12210'],
      ['Ambulance', '108'],
      ['Emergency', '112'],
    ]);
    expect(last(v).phone).toBe('112');
    expect(v).toMatchObject({ none: false, error: false, skeleton: false });
  });
});
