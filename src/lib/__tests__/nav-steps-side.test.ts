import { parseSteps } from '../nav-steps';

const step = (lng: number, extra: Record<string, unknown> = {}) => ({
  distance: 100,
  name: 'x',
  maneuver: { location: [77 + lng, 12], type: 'turn', modifier: 'left' },
  ...extra,
});
const sides = (legs: unknown) => parseSteps(legs, 1000)?.map((s) => s.drivingSide);

describe('driving side (India drives left)', () => {
  it('is read from each step when present', () => {
    expect(sides([{ steps: [step(0, { driving_side: 'right' }), step(1, { driving_side: 'left' })] }])).toEqual(['right', 'left']);
  });
  it('a missing side inherits the last known one on the route', () => {
    expect(sides([{ steps: [step(0, { driving_side: 'right' }), step(1), step(2)] }])).toEqual(['right', 'right', 'right']);
  });
  it('leading steps without a side take the first known one', () => {
    expect(sides([{ steps: [step(0), step(1, { driving_side: 'right' })] }])).toEqual(['right', 'right']);
  });
  it('with none known anywhere the default is left, not right', () => {
    expect(sides([{ steps: [step(0), step(1)] }])).toEqual(['left', 'left']);
  });
});
