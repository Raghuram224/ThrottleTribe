import { formatDuration } from '../format';

describe('formatDuration', () => {
  it('under a minute is <1 min', () => {
    expect(formatDuration(0)).toBe('<1 min');
    expect(formatDuration(59_999)).toBe('<1 min');
  });

  it('NaN is <1 min', () => {
    expect(formatDuration(Number.NaN)).toBe('<1 min');
  });

  it('floors minutes', () => {
    expect(formatDuration(60_000)).toBe('1 min');
    expect(formatDuration(119_999)).toBe('1 min');
    expect(formatDuration(59 * 60_000 + 59_000)).toBe('59 min');
  });

  it('switches to hours', () => {
    expect(formatDuration(60 * 60_000)).toBe('1 h');
    expect(formatDuration(61 * 60_000)).toBe('1 h 1 min');
    expect(formatDuration(150 * 60_000)).toBe('2 h 30 min');
  });
});
