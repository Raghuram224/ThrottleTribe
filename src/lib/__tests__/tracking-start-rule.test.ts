import { shouldStartTracking } from '../location/start-rule';

const base = {
  loaded: true,
  storeRideId: 'r1',
  id: 'r1',
  status: 'active' as const,
  left: false,
  foreground: 'granted' as const,
  inRide: true,
};

describe('shouldStartTracking: background location only while the ride is active (22 M1, M2)', () => {
  it('starts for an active ride with foreground permission', () => {
    expect(shouldStartTracking(base)).toBe(true);
  });

  it('never starts in the lobby: no foreground service, uploads or background prompt while waiting for riders', () => {
    expect(shouldStartTracking({ ...base, status: 'lobby' })).toBe(false);
  });

  it('starts as soon as the status turns active (leader Start, or a joiner seeing the change)', () => {
    expect(shouldStartTracking({ ...base, status: 'lobby' })).toBe(false);
    expect(shouldStartTracking({ ...base, status: 'active' })).toBe(true);
  });

  it('waits while a screen outside the ride is up (the permissions explainer asks first)', () => {
    expect(shouldStartTracking({ ...base, inRide: false })).toBe(false);
  });

  it('does not start for an ended ride, one I left, another ride, or before the ride is loaded', () => {
    expect(shouldStartTracking({ ...base, status: 'ended' })).toBe(false);
    expect(shouldStartTracking({ ...base, left: true })).toBe(false);
    expect(shouldStartTracking({ ...base, storeRideId: 'other' })).toBe(false);
    expect(shouldStartTracking({ ...base, loaded: false })).toBe(false);
    expect(shouldStartTracking({ ...base, status: undefined })).toBe(false);
  });

  it('needs foreground permission', () => {
    expect(shouldStartTracking({ ...base, foreground: 'denied' })).toBe(false);
    expect(shouldStartTracking({ ...base, foreground: undefined })).toBe(false);
  });
});
