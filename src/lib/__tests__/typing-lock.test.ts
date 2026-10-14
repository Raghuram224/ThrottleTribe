import { typingLocked } from '../typing-lock';

describe('typingLocked', () => {
  it('never locks without evidence', () => {
    expect(typingLocked(false, null, 0)).toBe(false);
    expect(typingLocked(true, null, 0)).toBe(false);
    expect(typingLocked(true, 50, 10_001)).toBe(false); // stale fix
    expect(typingLocked(false, 50, Number.NaN)).toBe(false);
    expect(typingLocked(false, Number.NaN, 0)).toBe(false);
  });
  it('locks at 10 km/h and above', () => {
    expect(typingLocked(false, 10, 0)).toBe(true);
    expect(typingLocked(false, 80, 3000)).toBe(true);
    expect(typingLocked(false, 9.9, 0)).toBe(false);
  });
  it('a fix exactly 10 s old still counts, older does not', () => {
    expect(typingLocked(false, 30, 10_000)).toBe(true);
    expect(typingLocked(false, 30, 10_001)).toBe(false);
  });
  it('keeps the lock between 5 and 10 km/h, releases under 5 (hysteresis)', () => {
    expect(typingLocked(true, 7, 0)).toBe(true);
    expect(typingLocked(true, 5, 0)).toBe(true);
    expect(typingLocked(true, 4.9, 0)).toBe(false);
    expect(typingLocked(false, 7, 0)).toBe(false);
  });
  it('does not flicker on a speed hovering around the threshold', () => {
    let locked = false;
    const seen: boolean[] = [];
    for (const v of [4, 9, 10, 8, 11, 7, 6, 5.5, 4.5, 8]) {
      locked = typingLocked(locked, v, 0);
      seen.push(locked);
    }
    expect(seen).toEqual([false, false, true, true, true, true, true, true, false, false]);
  });
});
