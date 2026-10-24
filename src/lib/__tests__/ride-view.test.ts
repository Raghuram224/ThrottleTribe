import { FAB_STACK } from '../plan-flow';
import { rideStackItems, rideStackMinMapH } from '../ride-view';

const roomy = { mapVisH: 600, group: true, navActive: true, fitAll: true };

describe('rideStackItems (28 §8): the ride view stack', () => {
  it('shows everything, top to bottom, when there is room', () => {
    expect(rideStackItems(roomy)).toEqual(['fitAll', 'fullMap', 'message', 'search', 'speak', 'sos']);
  });
  it('Speak only while navigating, Message only in a group, fit-all only with two riders on the map', () => {
    expect(rideStackItems({ ...roomy, navActive: false })).not.toContain('speak');
    expect(rideStackItems({ ...roomy, group: false })).not.toContain('message');
    expect(rideStackItems({ ...roomy, fitAll: false })).not.toContain('fitAll');
    expect(rideStackItems({ mapVisH: 600, group: false, navActive: false, fitAll: false })).toEqual(['fullMap', 'search', 'sos']);
  });
  it('never drops SOS, even with almost no map left', () => {
    expect(rideStackItems({ ...roomy, mapVisH: 0 })).toEqual(['sos']);
    expect(rideStackItems({ ...roomy, mapVisH: 100 })).toEqual(['sos']);
  });
  it('a short map keeps SOS, then Search, then Speak, then Message; the view controls go first', () => {
    expect(rideStackItems({ ...roomy, mapVisH: rideStackMinMapH(2) })).toEqual(['search', 'sos']);
    expect(rideStackItems({ ...roomy, mapVisH: rideStackMinMapH(3) })).toEqual(['search', 'speak', 'sos']);
    expect(rideStackItems({ ...roomy, mapVisH: rideStackMinMapH(4) })).toEqual(['message', 'search', 'speak', 'sos']);
    expect(rideStackItems({ ...roomy, mapVisH: rideStackMinMapH(5) })).toEqual(['fullMap', 'message', 'search', 'speak', 'sos']);
  });
  it('one circle short of a count still drops the last one', () => {
    expect(rideStackItems({ ...roomy, mapVisH: rideStackMinMapH(3) - 1 })).toEqual(['search', 'sos']);
  });
});

describe('rideStackMinMapH', () => {
  it('matches the old two-circle column: 176 dp for two circles, 68 more for each', () => {
    expect(rideStackMinMapH(2)).toBe(176);
    expect(rideStackMinMapH(3)).toBe(244);
    expect(rideStackMinMapH(1)).toBe(FAB_STACK.size + 12 + 12 + 28);
  });
});
