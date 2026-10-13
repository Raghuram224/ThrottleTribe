import { formatPhoneDisplay, groupTypedDigits, normalisePhone } from '../phone';

describe('normalisePhone (+91 default)', () => {
  it('keeps a typed country code', () => {
    expect(normalisePhone('+91 98450 12210')).toBe('+919845012210');
    expect(normalisePhone('+971 50 123 4567')).toBe('+971501234567');
    expect(normalisePhone('+1 (415) 555-0132')).toBe('+14155550132');
    expect(normalisePhone('0091 98450 12210')).toBe('+919845012210');
  });

  it('adds +91 to a 10-digit Indian mobile (6-9 first)', () => {
    expect(normalisePhone('98450 12210')).toBe('+919845012210');
    expect(normalisePhone('98450-12210')).toBe('+919845012210');
    expect(normalisePhone('6000000000')).toBe('+916000000000');
  });

  it('accepts 0 + 10 digits and 91 + 10 digits (how contacts store numbers)', () => {
    expect(normalisePhone('098450 12210')).toBe('+919845012210');
    expect(normalisePhone('919845012210')).toBe('+919845012210');
  });

  it('rejects what is not a mobile number', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('abc')).toBeNull();
    expect(normalisePhone('12345')).toBeNull();
    expect(normalisePhone('1234567890')).toBeNull(); // starts with 1: not an Indian mobile
    expect(normalisePhone('98450 1221')).toBeNull(); // 9 digits
    expect(normalisePhone('+1234567')).toBeNull(); // 7 digits after +
    expect(normalisePhone('+1234567890123456')).toBeNull(); // 16 digits
  });

  it('uses another prefix when asked, and "" means + is required', () => {
    expect(normalisePhone('050 123 4567', '+971')).toBe('+971501234567');
    expect(normalisePhone('9845012210', '')).toBeNull();
    expect(normalisePhone('+9845012210', '')).toBe('+9845012210');
  });
});

describe('normalisePhone with allowShortCodes (emergency contacts)', () => {
  const contact = (s: string, prefix?: string) => normalisePhone(s, prefix, { allowShortCodes: true });
  it('keeps short codes and Indian mobiles', () => {
    expect(contact('112')).toBe('112');
    expect(contact('1091')).toBe('1091');
    expect(contact('98450 12210')).toBe('+919845012210');
    expect(contact('919845012210')).toBe('+919845012210');
  });
  it('is more lenient than the strict mode only where intended', () => {
    expect(contact('5551234')).toBe('+915551234');
    expect(normalisePhone('5551234')).toBeNull();
    expect(contact('12')).toBeNull();
    expect(contact('+12')).toBeNull();
  });
});

describe('formatting', () => {
  it('shows Indian numbers as +91 98450 12210', () => {
    expect(formatPhoneDisplay('+919845012210')).toBe('+91 98450 12210');
  });
  it('groups other countries best effort and survives odd input', () => {
    expect(formatPhoneDisplay('+971501234567')).toBe('+971 5012 3456 7');
    expect(formatPhoneDisplay('+9999')).toBe('+9999');
  });
  it('groups typed digits for the +91 field only while no + is typed', () => {
    expect(groupTypedDigits('9845012210')).toBe('98450 12210');
    expect(groupTypedDigits('98450')).toBe('98450');
    expect(groupTypedDigits('+971 50')).toBe('+971 50');
  });
});
