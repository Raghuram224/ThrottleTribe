import {
  bannerText,
  destinationOf,
  formatManeuverDistance,
  maneuverIcon,
  roadLabel,
  spellRef,
  spokenDistance,
  spokenRoad,
  voiceText,
} from '../nav-instructions';
import { isAnnounced, type NavStep } from '../nav-steps';
import { step } from '../__fixtures__/nav-fixtures';

const PLACE = 'Mysuru Palace';

interface Row {
  n: number;
  input: Partial<NavStep> & Pick<NavStep, 'type' | 'modifier'>;
  /** Banner `primary` and `road` (null = no road part); undefined = not announced. */
  banner?: [string, string | null];
  voice?: string;
  icon?: string;
}

// The 25 rows of docs/design/21 §3.4, verbatim. Row 18 and 21 (not announced) are covered below.
const TABLE: Row[] = [
  { n: 1, input: { type: 'turn', modifier: 'left', name: 'MG Road' }, banner: ['Turn left', 'onto MG Road'], voice: 'Turn left onto MG Road', icon: 'turnLeft' },
  {
    n: 2,
    input: { type: 'turn', modifier: 'slight right', ref: 'NH275;NH948', name: 'Bengaluru–Mysuru Highway' },
    banner: ['Slight right', 'onto NH275'],
    voice: 'Turn slightly right onto Bengaluru–Mysuru Highway',
    icon: 'slightRight',
  },
  { n: 3, input: { type: 'turn', modifier: 'uturn', drivingSide: 'left' }, banner: ['Make a U-turn', null], voice: 'Make a U-turn', icon: 'uturnRight' },
  { n: 4, input: { type: 'turn', modifier: 'uturn', drivingSide: 'right' }, banner: ['Make a U-turn', null], voice: 'Make a U-turn', icon: 'uturnLeft' },
  {
    n: 5,
    input: { type: 'roundabout', modifier: null, exit: 3, name: 'Ring Road', drivingSide: 'left' },
    banner: ['Roundabout · 3rd exit', 'onto Ring Road'],
    voice: 'At the roundabout, take the third exit onto Ring Road',
    icon: 'roundaboutCw',
  },
  {
    n: 6,
    input: { type: 'rotary', modifier: null, exit: 2, rotaryName: 'Hardinge Circle', name: '', drivingSide: 'left' },
    banner: ['2nd exit', '· Hardinge Circle'],
    voice: 'At Hardinge Circle, take the second exit',
    icon: 'roundaboutCw',
  },
  {
    n: 7,
    input: { type: 'roundabout', modifier: null, exit: null, drivingSide: 'right' },
    banner: ['Enter the roundabout', null],
    voice: 'Enter the roundabout',
    icon: 'roundaboutCcw',
  },
  {
    n: 8,
    input: { type: 'roundabout', modifier: null, exit: 12, drivingSide: 'right' },
    banner: ['Roundabout · exit 12', null],
    voice: 'At the roundabout, take exit 12',
    icon: 'roundaboutCcw',
  },
  {
    n: 9,
    input: { type: 'roundabout turn', modifier: 'left', name: 'X' },
    banner: ['Turn left', 'onto X'],
    voice: 'At the roundabout, turn left onto X',
    icon: 'turnLeft',
  },
  {
    n: 10,
    input: { type: 'off ramp', modifier: 'slight left', exits: '12', destinations: 'NH48: Pune, Satara' },
    banner: ['Take exit 12', 'towards Pune'],
    voice: 'Take exit 12 towards Pune',
    icon: 'slightLeft',
  },
  {
    n: 11,
    input: { type: 'off ramp', modifier: 'right', name: 'Service Rd' },
    banner: ['Take the exit', 'onto Service Rd'],
    voice: 'Take the exit on the right onto Service Rd',
    icon: 'turnRight',
  },
  {
    n: 12,
    input: { type: 'on ramp', modifier: 'slight right', ref: 'NH44', name: '' },
    banner: ['Take the ramp', 'onto NH44'],
    voice: 'Take the ramp on the right onto N H 44',
    icon: 'slightRight',
  },
  {
    n: 13,
    input: { type: 'fork', modifier: 'slight left', name: 'Old Madras Rd' },
    banner: ['Keep left', 'onto Old Madras Rd'],
    voice: 'At the fork, keep left onto Old Madras Rd',
    icon: 'slightLeft',
  },
  { n: 14, input: { type: 'merge', modifier: 'slight right', ref: 'NH75' }, banner: ['Merge right', 'onto NH75'], voice: 'Merge right onto N H 75', icon: 'merge' },
  {
    n: 15,
    input: { type: 'end of road', modifier: 'right', name: 'Hosur Rd' },
    banner: ['Turn right', 'onto Hosur Rd'],
    voice: 'At the end of the road, turn right onto Hosur Rd',
    icon: 'turnRight',
  },
  {
    n: 16,
    input: { type: 'continue', modifier: 'left', name: 'MG Road' },
    banner: ['Turn left', 'to stay on MG Road'],
    voice: 'Turn left to stay on MG Road',
    icon: 'turnLeft',
  },
  {
    n: 17,
    input: { type: 'continue', modifier: 'slight right', name: 'X' },
    banner: ['Keep right', 'to stay on X'],
    voice: 'Keep right to stay on X',
    icon: 'slightRight',
  },
  { n: 19, input: { type: 'new name', modifier: 'left', name: 'Y' }, banner: ['Turn left', 'onto Y'], voice: 'Turn left onto Y', icon: 'turnLeft' },
  { n: 20, input: { type: 'unknown', modifier: 'right' }, banner: ['Turn right', null], voice: 'Turn right', icon: 'turnRight' },
  { n: 22, input: { type: 'turn', modifier: 'left', name: '', ref: '' }, banner: ['Turn left', null], voice: 'Turn left', icon: 'turnLeft' },
  {
    n: 23,
    input: { type: 'arrive', modifier: 'left' },
    banner: ['Destination on the left', null],
    voice: 'Your destination, Mysuru Palace, is on the left',
    icon: 'endRide',
  },
  {
    n: 24,
    input: { type: 'arrive', modifier: 'straight' },
    banner: ['Destination ahead', null],
    voice: 'Your destination, Mysuru Palace, is ahead',
    icon: 'endRide',
  },
  {
    n: 25,
    input: { type: 'roundabout', modifier: null, exit: 1, drivingSide: 'right' },
    banner: ['Roundabout · 1st exit', null],
    voice: 'At the roundabout, take the first exit',
    icon: 'roundaboutCcw',
  },
];

describe('instruction table (spec 3.4, rows 1-25)', () => {
  const mk = (input: Row['input']): NavStep => step(input.type, input.modifier, 0, input);

  it.each(TABLE.map((r) => [r.n, r] as const))('row %i', (_n, row) => {
    const s = mk(row.input);
    expect(isAnnounced(s)).toBe(true);
    const b = bannerText(s);
    expect([b.primary, b.road]).toEqual(row.banner);
    expect(voiceText(s, PLACE)).toBe(row.voice);
    expect(maneuverIcon(s)).toBe(row.icon);
  });

  it('arrive with no modifier is also "ahead" (row 24)', () => {
    expect(bannerText(mk({ type: 'arrive', modifier: null })).primary).toBe('Destination ahead');
    expect(voiceText(mk({ type: 'arrive', modifier: null }), PLACE)).toBe('Your destination, Mysuru Palace, is ahead');
  });

  it('row 18: continue straight / new name straight / depart / notification / exit roundabout are not announced', () => {
    for (const [type, modifier] of [
      ['continue', 'straight'],
      ['new name', 'straight'],
      ['depart', null],
      ['notification', null],
      ['exit roundabout', null],
    ] as const) {
      expect(isAnnounced({ type, modifier })).toBe(false);
    }
  });

  it('row 21: unknown type with no modifier is not announced', () => {
    expect(isAnnounced({ type: 'unknown', modifier: null })).toBe(false);
  });

  it('the Then row uses the primary only', () => {
    const s = mk({ type: 'turn', modifier: 'left', name: 'MG Road' });
    expect(bannerText(s, { short: true })).toEqual({ primary: 'Turn left', road: null });
  });

  it('voice can drop the road part (the "then" chain)', () => {
    const s = mk({ type: 'turn', modifier: 'left', name: 'MG Road' });
    expect(voiceText(s, PLACE, { withRoad: false })).toBe('Turn left');
    expect(voiceText(mk({ type: 'off ramp', modifier: 'right' }), PLACE, { withRoad: false })).toBe('Take the exit on the right');
  });

  it('other modifiers and edge cases', () => {
    const t = (type: NavStep['type'], modifier: NavStep['modifier'], extra: Partial<NavStep> = {}) => mk({ type, modifier, ...extra });
    expect(bannerText(t('turn', 'sharp left')).primary).toBe('Sharp left');
    expect(voiceText(t('turn', 'sharp right'), PLACE)).toBe('Turn sharp right');
    expect(bannerText(t('turn', 'straight')).primary).toBe('Go straight');
    expect(voiceText(t('turn', 'straight'), PLACE)).toBe('Go straight');
    expect(bannerText(t('merge', null)).primary).toBe('Merge');
    expect(bannerText(t('fork', 'right')).primary).toBe('Keep right');
    expect(bannerText(t('continue', 'sharp left')).primary).toBe('Sharp left');
    expect(bannerText(t('end of road', 'uturn', { name: 'X' }))).toEqual({ primary: 'Make a U-turn', road: null });
    expect(bannerText(t('arrive', 'right')).primary).toBe('Destination on the right');
    expect(bannerText(t('ramp', 'slight right', { name: 'X' })).primary).toBe('Take the ramp');
    expect(bannerText(t('off ramp', 'right', { exits: '4B' })).primary).toBe('Take exit 4B');
    expect(bannerText(t('rotary', null, { exit: 2, rotaryName: '', name: 'Z' }))).toEqual({ primary: 'Roundabout · 2nd exit', road: 'onto Z' });
    expect(maneuverIcon(t('turn', 'sharp left'))).toBe('sharpLeft');
    expect(maneuverIcon(t('turn', 'straight'))).toBe('straight');
  });
});

describe('M6: the critical part comes first, the name truncates', () => {
  it('a named rotary reads "2nd exit" in the primary and the circle name in the road slot', () => {
    const s = step('rotary', null, 0, { exit: 2, rotaryName: 'Hardinge Circle', name: 'Ring Rd' });
    expect(bannerText(s)).toEqual({ primary: '2nd exit', road: '· Hardinge Circle onto Ring Rd' });
    expect(bannerText(s, { short: true })).toEqual({ primary: '2nd exit', road: null });
  });
  it('the exit never ends up in the span that truncates', () => {
    const s = step('rotary', null, 0, { exit: 12, rotaryName: 'A Very Long Circle Name Indeed' });
    expect(bannerText(s).primary).toBe('exit 12');
  });
});

describe('road names', () => {
  it('roadLabel is the first ref token, else the name', () => {
    expect(roadLabel({ ref: 'NH275;NH948', name: 'Highway' })).toBe('NH275');
    expect(roadLabel({ ref: ' SH17 ', name: '' })).toBe('SH17');
    expect(roadLabel({ ref: '', name: 'MG Road' })).toBe('MG Road');
    expect(roadLabel({ ref: '', name: '' })).toBe('');
  });
  it('spokenRoad is the name, else the spelled ref', () => {
    expect(spokenRoad({ ref: 'NH275', name: 'Highway' })).toBe('Highway');
    expect(spokenRoad({ ref: 'NH275;NH948', name: '' })).toBe('N H 275');
    expect(spokenRoad({ ref: 'AH-1', name: '' })).toBe('A H 1');
    expect(spokenRoad({ ref: 'Ring', name: '' })).toBe('Ring');
    expect(spokenRoad({ ref: '', name: '' })).toBe('');
  });
  it('spellRef spells letters and keeps other tokens', () => {
    expect(spellRef('NH275')).toBe('N H 275');
    expect(spellRef('NH 44')).toBe('N H 44');
    expect(spellRef('SH17A')).toBe('S H 17A');
    expect(spellRef('Outer Ring')).toBe('Outer Ring');
  });
  it('destinationOf takes the text after the first colon, then the first item', () => {
    expect(destinationOf({ destinations: 'NH48: Pune, Satara' })).toBe('Pune');
    expect(destinationOf({ destinations: 'Pune, Satara' })).toBe('Pune');
    expect(destinationOf({ destinations: '' })).toBe('');
  });
});

describe('formatManeuverDistance (spec 3.5)', () => {
  it.each([
    [0, 'Now'],
    [14.9, 'Now'],
    [15, '20 m'],
    [94, '90 m'],
    [96, '100 m'],
    [99.9, '100 m'],
    [100, '100 m'],
    [949, '950 m'],
    [980, '1.0 km'],
    [1000, '1.0 km'],
    [9949, '9.9 km'],
    [9950, '10 km'],
    [24_300, '24 km'],
  ])('%p m -> %s', (m, text) => {
    expect(formatManeuverDistance(m)).toBe(text);
  });
  it('treats a non-finite distance as now', () => {
    expect(formatManeuverDistance(NaN)).toBe('Now');
  });
});

describe('spokenDistance (spec 3.5)', () => {
  it.each([
    [10, '50 metres'],
    [60, '50 metres'],
    [130, '150 metres'],
    [199, '200 metres'],
    [200, '200 metres'],
    [420, '400 metres'],
    [460, '500 metres'],
    [950, '1 kilometre'],
    [1000, '1 kilometre'],
    [1260, '1.5 kilometres'],
    [1740, '1.5 kilometres'],
    [1760, '2 kilometres'],
    [9700, '9.5 kilometres'],
    [9800, '10 kilometres'],
    [10_000, '10 kilometres'],
    [24_400, '24 kilometres'],
  ])('%p m -> %s', (m, text) => {
    expect(spokenDistance(m)).toBe(text);
  });
});
