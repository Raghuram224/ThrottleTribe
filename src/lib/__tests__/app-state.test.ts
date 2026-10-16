import { isInFront } from '@/lib/app-state';

describe('isInFront', () => {
  it('is true when active', () => expect(isInFront('active')).toBe(true));

  it('is true while the state is still unknown at a cold start', () => {
    expect(isInFront('unknown')).toBe(true);
    expect(isInFront(null)).toBe(true);
    expect(isInFront(undefined)).toBe(true);
  });

  it('is false only when explicitly behind', () => {
    expect(isInFront('background')).toBe(false);
    expect(isInFront('inactive')).toBe(false);
  });
});
