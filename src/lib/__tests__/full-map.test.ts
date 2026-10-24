import * as fullMap from '../full-map';
import { backAction, shownSpeedKmh } from '../full-map';

describe('shownSpeedKmh', () => {
  it('is null when unknown or under 3 km/h', () => {
    expect(shownSpeedKmh(null)).toBeNull();
    expect(shownSpeedKmh(undefined)).toBeNull();
    expect(shownSpeedKmh(0.5)).toBeNull();
  });
  it('rounds to whole km/h from 3 km/h up', () => {
    expect(shownSpeedKmh(3 / 3.6)).toBe(3);
    expect(shownSpeedKmh(11.7)).toBe(42);
  });
});

describe('backAction', () => {
  it('exits full map first', () => {
    expect(backAction(true)).toBe('exit-full-map');
  });
  it('otherwise leaves the default back behaviour alone', () => {
    expect(backAction(false)).toBe('default');
  });
});

describe('no ride opens in full map by itself (22 D6: a ride opens in the normal sheet view)', () => {
  it('the first-open default rule is gone: nothing decides to enter full map from a ride opening', () => {
    expect(Object.keys(fullMap)).not.toContain('shouldDefaultFullMap');
    expect(Object.keys(fullMap)).not.toContain('fullMapDefaultStep');
  });
});
