import { backAction, shouldDefaultFullMap, shownSpeedKmh, soloSummaryLine } from '../full-map';

describe('soloSummaryLine', () => {
  it('shows the speed when moving', () => {
    expect(soloSummaryLine(42)).toBe('Solo ride · 42 km/h');
  });
  it('drops the speed when stopped or unknown', () => {
    expect(soloSummaryLine(null)).toBe('Solo ride');
  });
});

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
    expect(shouldDefaultFullMap({ activeMembers: 1, rideId: 'a', seenRideId: null })).toBe(true);
    expect(shouldDefaultFullMap({ activeMembers: 1, rideId: 'b', seenRideId: 'a' })).toBe(true);
  });
  it('not again for the same ride', () => {
    expect(shouldDefaultFullMap({ activeMembers: 1, rideId: 'a', seenRideId: 'a' })).toBe(false);
  });
  it('not for a group ride', () => {
    expect(shouldDefaultFullMap({ activeMembers: 3, rideId: 'a', seenRideId: null })).toBe(false);
  });
});
