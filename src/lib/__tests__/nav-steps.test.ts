import { announcedSteps, isAnnounced, parseSteps, treatedAs, withAlong, type NavStep } from '../nav-steps';
import { parseOsrmResponse } from '../nav-route';
import { step } from '../__fixtures__/nav-fixtures';

const osrmStep = (type: string, modifier: string | undefined, distance: number, over: Record<string, unknown> = {}) => ({
  distance,
  name: 'MG Road',
  ref: 'NH44',
  driving_side: 'left',
  maneuver: { type, modifier, location: [77.5, 12.9] },
  ...over,
});

describe('parseSteps', () => {
  it('reads maneuver, names, side and exit', () => {
    const steps = parseSteps(
      [
        {
          steps: [
            osrmStep('roundabout', 'left', 120, { rotary_name: 'Hardinge Circle', destinations: 'NH48: Pune', exits: '12' }),
            { ...osrmStep('arrive', undefined, 0), maneuver: { type: 'arrive', location: [77.6, 12.95] } },
          ],
        },
      ],
      120,
    );
    expect(steps).toHaveLength(2);
    expect(steps?.[0]).toMatchObject({
      type: 'roundabout',
      modifier: 'left',
      name: 'MG Road',
      ref: 'NH44',
      rotaryName: 'Hardinge Circle',
      destinations: 'NH48: Pune',
      exits: '12',
      drivingSide: 'left',
      location: { lat: 12.9, lng: 77.5 },
      distanceM: 120,
      alongM: 0,
      exit: null,
    });
    expect(steps?.[1].modifier).toBeNull();
  });

  it('reads the roundabout exit number', () => {
    const steps = parseSteps([{ steps: [{ ...osrmStep('roundabout', 'right', 10), maneuver: { type: 'roundabout', modifier: 'right', exit: 3, location: [77, 12] } }] }], 10);
    expect(steps?.[0].exit).toBe(3);
  });

  it('turns an unknown type into unknown, an unknown modifier into null, and drops a step with no location', () => {
    const steps = parseSteps(
      [
        {
          steps: [
            osrmStep('teleport', 'sideways', 10),
            { ...osrmStep('turn', 'left', 10), maneuver: { type: 'turn', modifier: 'left' } },
            { ...osrmStep('turn', 'left', 10), maneuver: { type: 'turn', modifier: 'left', location: ['x', 1] } },
          ],
        },
      ],
      10,
    );
    expect(steps).toHaveLength(1);
    expect(steps?.[0].type).toBe('unknown');
    expect(steps?.[0].modifier).toBeNull();
  });

  it('is undefined when the leg holds no steps (a route fetched without steps=true)', () => {
    expect(parseSteps([{ steps: [] }], 100)).toBeUndefined();
    expect(parseSteps([{}], 100)).toBeUndefined();
    expect(parseSteps(undefined, 100)).toBeUndefined();
  });

  it('parseOsrmResponse carries the steps, scaled to the geometry', () => {
    const r = parseOsrmResponse({
      routes: [
        {
          distance: 400,
          duration: 60,
          geometry: { coordinates: [[77, 12], [77.0036, 12]] }, // about 390 m
          legs: [{ steps: [osrmStep('depart', undefined, 100), osrmStep('turn', 'left', 300), osrmStep('arrive', undefined, 0)] }],
        },
      ],
    });
    const along = r?.steps?.map((s) => s.alongM) ?? [];
    expect(along[0]).toBe(0);
    expect(along[1]).toBeCloseTo(97.5, 0); // 100 x (390 / 400)
    expect(along[2]).toBeCloseTo(390, -1);
    expect(parseOsrmResponse({ routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[1, 2], [3, 4]] } }] })?.steps).toBeUndefined();
  });
});

describe('alongM scaling (spec 3.2 test)', () => {
  const raw = (d: number): Omit<NavStep, 'alongM'> => {
    const { alongM, ...rest } = step('turn', 'left', 0, { distanceM: d });
    void alongM;
    return rest;
  };
  it('distances [100, 300, 0] on a 400 trail', () => {
    expect(withAlong([raw(100), raw(300), raw(0)], 400).map((s) => s.alongM)).toEqual([0, 100, 400]);
  });
  it('scales to an 800 trail', () => {
    expect(withAlong([raw(100), raw(300), raw(0)], 800).map((s) => s.alongM)).toEqual([0, 200, 800]);
  });
  it('is unscaled when the distances sum to 0', () => {
    expect(withAlong([raw(0), raw(0)], 500).map((s) => s.alongM)).toEqual([0, 0]);
  });
});

describe('isAnnounced (spec 3.3)', () => {
  const a = (type: NavStep['type'], modifier: NavStep['modifier']) => isAnnounced({ type, modifier });
  it('never announces depart, notification or roundabout exits', () => {
    for (const t of ['depart', 'notification', 'exit roundabout', 'exit rotary'] as const) expect(a(t, 'left')).toBe(false);
  });
  it('new name only for side turns and U-turns', () => {
    expect(a('new name', 'left')).toBe(true);
    expect(a('new name', 'sharp right')).toBe(true);
    expect(a('new name', 'uturn')).toBe(true);
    expect(a('new name', 'straight')).toBe(false);
    expect(a('new name', 'slight left')).toBe(false);
    expect(a('new name', null)).toBe(false);
  });
  it('continue and use lane only when the modifier is not straight or missing', () => {
    expect(a('continue', 'straight')).toBe(false);
    expect(a('continue', null)).toBe(false);
    expect(a('continue', 'slight right')).toBe(true);
    expect(a('use lane', 'left')).toBe(true);
    expect(a('use lane', 'straight')).toBe(false);
  });
  it('unknown only with a modifier; everything else is announced', () => {
    expect(a('unknown', null)).toBe(false);
    expect(a('unknown', 'right')).toBe(true);
    for (const t of ['turn', 'merge', 'on ramp', 'off ramp', 'fork', 'end of road', 'roundabout', 'rotary', 'roundabout turn', 'arrive', 'ramp'] as const) {
      expect(a(t, null)).toBe(true);
    }
  });
  it('treatedAs maps new name / unknown to turn, use lane to continue, ramp to on ramp', () => {
    expect(treatedAs({ type: 'new name' })).toBe('turn');
    expect(treatedAs({ type: 'unknown' })).toBe('turn');
    expect(treatedAs({ type: 'use lane' })).toBe('continue');
    expect(treatedAs({ type: 'ramp' })).toBe('on ramp');
    expect(treatedAs({ type: 'fork' })).toBe('fork');
  });
});

describe('announcedSteps', () => {
  const end = { lat: 12, lng: 77.1 };
  it('keeps only announced steps and ends with arrive', () => {
    const steps = [step('depart', null, 0), step('turn', 'left', 100), step('continue', 'straight', 200), step('arrive', null, 300)];
    expect(announcedSteps(steps, end, 300).map((s) => s.type)).toEqual(['turn', 'arrive']);
  });
  it('synthesises arrive at the end when OSRM omitted it', () => {
    const out = announcedSteps([step('turn', 'left', 100, { drivingSide: 'left' })], end, 900);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ type: 'arrive', alongM: 900, location: end, drivingSide: 'left' });
  });
  it('a route with no steps is just the arrive step', () => {
    expect(announcedSteps(undefined, end, 500).map((s) => s.type)).toEqual(['arrive']);
  });
});
