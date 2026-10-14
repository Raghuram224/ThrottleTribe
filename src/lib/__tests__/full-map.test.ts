import { backAction, fullMapDefaultStep, shouldDefaultFullMap, shownSpeedKmh } from '../full-map';

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

describe('shouldDefaultFullMap', () => {
  it('defaults on the first open of a solo ride', () => {
    expect(shouldDefaultFullMap({ activeMembers: 1, rideId: 'a', seenRideId: null, hasStop: false })).toBe(true);
    expect(shouldDefaultFullMap({ activeMembers: 1, rideId: 'b', seenRideId: 'a', hasStop: false })).toBe(true);
  });
  it('not again for the same ride', () => {
    expect(shouldDefaultFullMap({ activeMembers: 1, rideId: 'a', seenRideId: 'a', hasStop: false })).toBe(false);
  });
  it('not for a group ride', () => {
    expect(shouldDefaultFullMap({ activeMembers: 3, rideId: 'a', seenRideId: null, hasStop: false })).toBe(false);
  });
  it('not for a solo ride that opens with a stop (a navigation ride opens in sheet mode)', () => {
    expect(shouldDefaultFullMap({ activeMembers: 1, rideId: 'a', seenRideId: null, hasStop: true })).toBe(false);
  });
});

describe('fullMapDefaultStep', () => {
  const solo = { activeMembers: 1, rideId: 'a', seenRideId: null, hasStop: false, holding: false };
  it('enters full map on the first solo open', () => {
    expect(fullMapDefaultStep(solo)).toBe('enter');
  });
  it('waits while an SOS hold is in progress, without marking the ride seen', () => {
    expect(fullMapDefaultStep({ ...solo, holding: true })).toBe('wait');
  });
  it('applies once the hold ends', () => {
    expect(fullMapDefaultStep({ ...solo, holding: false })).toBe('enter');
  });
  it('is done for a ride already handled, hold or not', () => {
    expect(fullMapDefaultStep({ ...solo, seenRideId: 'a' })).toBe('seen');
    expect(fullMapDefaultStep({ ...solo, seenRideId: 'a', holding: true })).toBe('seen');
  });
  it('marks a navigation ride (solo with a stop) as seen without entering full map', () => {
    expect(fullMapDefaultStep({ ...solo, hasStop: true })).toBe('mark');
  });
  it('only marks a group ride as seen', () => {
    expect(fullMapDefaultStep({ ...solo, activeMembers: 3 })).toBe('mark');
  });
});
