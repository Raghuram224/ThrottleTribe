import { nextCodeValue, parseCode } from '../join-code';

describe('parseCode', () => {
  it('accepts exactly 6 digits after stripping', () => {
    expect(parseCode('123456')).toBe('123456');
    expect(parseCode('Code: 123-456')).toBe('123456');
    expect(parseCode(['123456'])).toBe('123456');
  });
  it('ignores anything else', () => {
    expect(parseCode('12345')).toBeNull();
    expect(parseCode('1234567')).toBeNull();
    expect(parseCode('')).toBeNull();
    expect(parseCode(undefined)).toBeNull();
  });
});

describe('nextCodeValue', () => {
  it('strips non-digits and caps at 6', () => {
    expect(nextCodeValue('Code: 123 456', '')).toBe('123456');
    expect(nextCodeValue('12345678', '')).toBe('123456');
    expect(nextCodeValue('12a', '1')).toBe('12');
  });
  it('after an error, one typed digit restarts', () => {
    expect(nextCodeValue('1234567', '123456', true)).toBe('7');
  });
  it('after an error, backspace just edits', () => {
    expect(nextCodeValue('12345', '123456', true)).toBe('12345');
  });
  it('after an error, an overflowing paste keeps the last 6 digits', () => {
    expect(nextCodeValue('123456654321', '123456', true)).toBe('654321');
  });
});
