import { arrivalState, decodeArrival, destKey, encodeArrival, isArrived, latchStep, nextLatch, NO_ARRIVAL } from '../nav-arrival';

const dest = { lat: 12.3052, lng: 76.6552 };
// 0.0009 deg of latitude is about 100 m.
const north = (m: number) => ({ lat: dest.lat + m / 111_320, lng: dest.lng });

describe('arrivalState rule (a)', () => {
  it('arrives within 150 m of the destination', () => {
    expect(arrivalState('navigating', { me: north(149), accuracyM: 10, dest })).toBe('arrived');
    expect(arrivalState('navigating', { me: north(10), accuracyM: null, dest })).toBe('arrived');
  });
  it('does not arrive further than 150 m', () => {
    expect(arrivalState('navigating', { me: north(160), accuracyM: 10, dest })).toBe('navigating');
  });
  it('keeps the previous state without a fix or with a fix worse than 100 m', () => {
    expect(arrivalState('navigating', { me: null, accuracyM: null, dest })).toBe('navigating');
    expect(arrivalState('navigating', { me: north(5), accuracyM: 101, dest })).toBe('navigating');
    expect(arrivalState('navigating', { me: north(5), accuracyM: 100, dest })).toBe('arrived');
  });
  it('is latched: riding away or losing the fix never un-arrives', () => {
    expect(arrivalState('arrived', { me: north(5000), accuracyM: 5, dest })).toBe('arrived');
    expect(arrivalState('arrived', { me: null, accuracyM: null, dest })).toBe('arrived');
  });
});

describe('arrivalState rules (b) and (c), used from P2', () => {
  const far = north(400);
  it('(b) arrives within 40 m of the arrive maneuver, even when the pin is 400 m away', () => {
    expect(arrivalState('navigating', { me: far, accuracyM: 10, dest, arriveAt: north(380) })).toBe('arrived');
    expect(arrivalState('navigating', { me: far, accuracyM: 10, dest, arriveAt: north(300) })).toBe('navigating');
  });
  it('(c) arrives on the final step with 30 m or less left', () => {
    expect(arrivalState('navigating', { me: far, accuracyM: 10, dest, onFinalStep: true, remainingAlongM: 30 })).toBe('arrived');
    expect(arrivalState('navigating', { me: far, accuracyM: 10, dest, onFinalStep: true, remainingAlongM: 31 })).toBe('navigating');
    expect(arrivalState('navigating', { me: far, accuracyM: 10, dest, onFinalStep: false, remainingAlongM: 5 })).toBe('navigating');
  });
});

describe('nextLatch', () => {
  it('latches for a destination and keeps it as the rider rides on', () => {
    let l = nextLatch(NO_ARRIVAL, dest, { me: north(2000), accuracyM: 5 });
    expect(isArrived(l, dest)).toBe(false);
    l = nextLatch(l, dest, { me: north(20), accuracyM: 5 });
    expect(isArrived(l, dest)).toBe(true);
    const away = nextLatch(l, dest, { me: north(3000), accuracyM: 5 });
    expect(away).toBe(l); // unchanged object: no store write needed
    expect(isArrived(away, dest)).toBe(true);
  });
  it('a new destination starts over, even from the same spot', () => {
    const l = nextLatch(NO_ARRIVAL, dest, { me: north(20), accuracyM: 5 });
    const next = { lat: dest.lat + 0.5, lng: dest.lng };
    const l2 = nextLatch(l, next, { me: north(20), accuracyM: 5 });
    expect(l2).toEqual({ key: destKey(next), state: 'navigating' });
    expect(isArrived(l2, next)).toBe(false);
    expect(isArrived(l2, dest)).toBe(false);
  });
  it('clearing the stop resets the latch', () => {
    const l = nextLatch(NO_ARRIVAL, dest, { me: north(20), accuracyM: 5 });
    expect(nextLatch(l, null, { me: null, accuracyM: null })).toBe(NO_ARRIVAL);
    expect(nextLatch(NO_ARRIVAL, null, { me: null, accuracyM: null })).toBe(NO_ARRIVAL);
  });
  it('returns the same object while still navigating (no churn)', () => {
    const l = nextLatch(NO_ARRIVAL, dest, { me: north(2000), accuracyM: 5 });
    expect(nextLatch(l, dest, { me: north(1900), accuracyM: 5 })).toBe(l);
  });
});

describe('latchStep (live screen update)', () => {
  const dest = { lat: 12, lng: 77 };
  const near = { lat: 12.0005, lng: 77 }; // ~55 m
  const far = { lat: 12.05, lng: 77 };

  it('latches in a group ride too, but only announces in the solo variant', () => {
    const g = latchStep(NO_ARRIVAL, dest, { me: near, accuracyM: 10 }, false);
    expect(g.latch.state).toBe('arrived');
    expect(g.announce).toBe(false);
    const s = latchStep(NO_ARRIVAL, dest, { me: near, accuracyM: 10 }, true);
    expect(s.announce).toBe(true);
  });

  it('keeps the latch when a rider joins or leaves (variant flips), never re-announcing', () => {
    const arrivedInGroup = latchStep(NO_ARRIVAL, dest, { me: near, accuracyM: 10 }, false).latch;
    const backToSolo = latchStep(arrivedInGroup, dest, { me: far, accuracyM: 10 }, true);
    expect(backToSolo.latch).toBe(arrivedInGroup);
    expect(backToSolo.announce).toBe(false);
    expect(isArrived(backToSolo.latch, dest)).toBe(true);
    const again = latchStep(backToSolo.latch, dest, { me: near, accuracyM: 10 }, false);
    expect(again.latch).toBe(arrivedInGroup);
  });

  it('starts over for a new destination only', () => {
    const arrived = latchStep(NO_ARRIVAL, dest, { me: near, accuracyM: 10 }, true).latch;
    const next = latchStep(arrived, { lat: 13, lng: 77 }, { me: near, accuracyM: 10 }, true);
    expect(next.latch).toEqual({ key: destKey({ lat: 13, lng: 77 }), state: 'navigating' });
    expect(next.announce).toBe(false);
  });
});

describe('arrival persistence', () => {
  const latch = { key: '12,77', state: 'arrived' as const };
  it('stores only an arrived latch, with its ride', () => {
    expect(JSON.parse(encodeArrival('r1', latch) ?? 'null')).toEqual({ rideId: 'r1', key: '12,77' });
    expect(encodeArrival('r1', { key: '12,77', state: 'navigating' })).toBeNull();
    expect(encodeArrival(null, latch)).toBeNull();
    expect(encodeArrival('r1', NO_ARRIVAL)).toBeNull();
  });
  it('round-trips and rejects anything else', () => {
    expect(decodeArrival(encodeArrival('r1', latch))).toEqual({ rideId: 'r1', key: '12,77' });
    expect(decodeArrival(null)).toBeNull();
    expect(decodeArrival('{bad')).toBeNull();
    expect(decodeArrival('{"rideId":"","key":"1"}')).toBeNull();
    expect(decodeArrival('{"rideId":"r1"}')).toBeNull();
  });
});
