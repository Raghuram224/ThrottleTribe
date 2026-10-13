import { countUpDistanceText, countUpMeters, easeOutCubic } from '../count-up';
import { formatDistance } from '../format';

describe('count-up', () => {
  it('eases out: fast start, exact ends, clamped', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it('never overshoots the target', () => {
    for (let p = 0; p <= 1; p += 0.1) expect(countUpMeters(86_000, p)).toBeLessThanOrEqual(86_000);
  });

  it('ends on exactly the final text', () => {
    expect(countUpDistanceText(86_400, 1)).toBe(formatDistance(86_400));
    expect(countUpDistanceText(86_400, 0)).toBe('0 m');
    expect(countUpDistanceText(86_400, 0.5)).toMatch(/km$/);
  });
});
