import { summaryHeroKind, summaryShareMessage, summaryShareVisible } from '../summary';

describe('summaryShareVisible', () => {
  it('shows for a finished ride without SOS', () => {
    expect(summaryShareVisible({ cancelled: false, ready: true, sosCount: 0 })).toBe(true);
  });
  it('is hidden after an SOS, for a cancelled ride, and until the events are known', () => {
    expect(summaryShareVisible({ cancelled: false, ready: true, sosCount: 1 })).toBe(false);
    expect(summaryShareVisible({ cancelled: true, ready: true, sosCount: 0 })).toBe(false);
    expect(summaryShareVisible({ cancelled: false, ready: false, sosCount: 0 })).toBe(false);
  });
});

describe('summaryShareMessage', () => {
  it('has distance, riders and duration and nothing personal', () => {
    const msg = summaryShareMessage({ distanceM: 86_000, riders: 6, durationMs: 134 * 60_000 });
    expect(msg).toBe('Rode 86 km with 6 riders in 2 h 14 min on Throttle Tribe.');
  });
  it('singular rider and no-distance wording', () => {
    expect(summaryShareMessage({ distanceM: 5_000, riders: 1, durationMs: 60 * 60_000 })).toContain('1 rider in');
    expect(summaryShareMessage({ distanceM: null, riders: 3, durationMs: 30 * 60_000 })).toBe(
      'Rode with 3 riders for 30 min on Throttle Tribe.',
    );
  });
});

describe('summaryHeroKind', () => {
  it('distance when known, else duration', () => {
    expect(summaryHeroKind(1200)).toBe('distance');
    expect(summaryHeroKind(null)).toBe('duration');
  });
});
