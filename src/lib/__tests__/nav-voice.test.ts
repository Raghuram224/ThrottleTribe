import { initProgress, prepareRoute, type Progress } from '../nav-progress';
import {
  CONTINUE_MIN_M,
  INITIAL_VOICE,
  markDone,
  nextPrompt,
  parseVoicePref,
  encodeVoicePref,
  planVoice,
  smoothSpeed,
  thresholds,
  voiceBlocked,
  type VoiceInput,
  type VoiceState,
} from '../nav-voice';
import { step, straightRoute } from '../__fixtures__/nav-fixtures';

const PLACE = 'Mysuru Palace';
const kmh = (k: number) => k / 3.6;
const left = step('turn', 'left', 3000, { name: 'MG Road' });
const right = step('turn', 'right', 3100, { name: 'Hosur Rd' });

describe('thresholds (§4.2)', () => {
  it.each([
    [30, 500, 150, 33],
    [60, 750, 200, 67],
    [100, 1250, 333, 111],
  ])('%i km/h -> far %i, near %i, now %i m', (k, far, near, now) => {
    const th = thresholds(kmh(k));
    expect(Math.round(th.far)).toBe(far);
    expect(Math.round(th.near)).toBe(near);
    expect(Math.round(th.now)).toBe(now);
  });
  it('unknown or slow speed counts as 30 km/h at least', () => {
    expect(thresholds(0)).toEqual(thresholds(kmh(30)));
    expect(thresholds(NaN)).toEqual(thresholds(kmh(30)));
  });
  it('far is capped at 2 km', () => {
    expect(thresholds(kmh(200)).far).toBe(2000);
  });
});

const base = {
  v: kmh(60),
  step: left,
  next: null,
  legBeforeM: 3000,
  done: [] as const,
  place: PLACE,
  sinceLastPromptMs: Infinity,
};

describe('nextPrompt: the schedule by speed (§4.2 test examples)', () => {
  it('60 km/h, left turn on a 3 km leg: far at 750, near at 200, now at 67', () => {
    expect(nextPrompt({ ...base, d: 800 })).toBeNull();
    expect(nextPrompt({ ...base, d: 740 })).toEqual({ stage: 'far', text: 'In 700 metres, turn left onto MG Road' });
    expect(nextPrompt({ ...base, d: 200, done: ['far'] })).toEqual({ stage: 'near', text: 'In 200 metres, turn left onto MG Road' });
    expect(nextPrompt({ ...base, d: 60, done: ['far', 'near'] })).toEqual({ stage: 'now', text: 'Turn left onto MG Road' });
  });
  it('30 km/h: far only inside 500 m, now at 33 m', () => {
    const v = kmh(30);
    expect(nextPrompt({ ...base, v, d: 520 })).toBeNull();
    expect(nextPrompt({ ...base, v, d: 480 })?.stage).toBe('far');
    expect(nextPrompt({ ...base, v, d: 40, done: ['far', 'near'] })).toBeNull();
    expect(nextPrompt({ ...base, v, d: 30, done: ['far', 'near'] })?.stage).toBe('now');
  });
  it('100 km/h: far at 1250 m, near at 333 m, now at 111 m', () => {
    const v = kmh(100);
    expect(nextPrompt({ ...base, v, d: 1200 })?.stage).toBe('far');
    expect(nextPrompt({ ...base, v, d: 330, done: ['far'] })?.stage).toBe('near');
    expect(nextPrompt({ ...base, v, d: 110, done: ['far', 'near'] })?.stage).toBe('now');
  });
  it('unknown speed reads as 50 km/h (far at 625 m)', () => {
    expect(nextPrompt({ ...base, v: null, d: 600 })?.stage).toBe('far');
    expect(nextPrompt({ ...base, v: null, d: 650 })).toBeNull();
  });
});

describe('nextPrompt: only the most urgent stage, once', () => {
  it('a fix first seen at 120 m (after a reroute) gives near only, never far', () => {
    expect(nextPrompt({ ...base, d: 120 })?.stage).toBe('near');
  });
  it('a fix first seen inside now gives now only', () => {
    expect(nextPrompt({ ...base, d: 20 })?.stage).toBe('now');
  });
  it('a stage already done is not repeated', () => {
    expect(nextPrompt({ ...base, d: 700, done: ['far'] })).toBeNull();
    expect(nextPrompt({ ...base, d: 150, done: ['near'] })).toBeNull();
  });
  it('markDone marks the stage and every less urgent one', () => {
    expect(markDone([], 'far')).toEqual(['far']);
    expect(markDone([], 'near')).toEqual(['far', 'near']);
    expect(markDone(['far'], 'now')).toEqual(['far', 'near', 'now']);
  });
  it('a leg shorter than the far distance gets no far prompt', () => {
    expect(nextPrompt({ ...base, d: 300, legBeforeM: 300 })).toBeNull();
    expect(nextPrompt({ ...base, d: 700, legBeforeM: 749 })).toBeNull();
    expect(nextPrompt({ ...base, d: 700, legBeforeM: 750 })?.stage).toBe('far');
  });
  it('arrive never gets now (the arrived prompt replaces it) but does get far / near', () => {
    const arrive = step('arrive', 'left', 3000);
    expect(nextPrompt({ ...base, step: arrive, d: 20 })).toEqual({
      stage: 'near',
      text: 'In 50 metres, your destination, Mysuru Palace, is on the left',
    });
  });
});

describe('nextPrompt: gap and then-chaining', () => {
  it('near and far wait inside the 4 s gap (not marked), now does not', () => {
    expect(nextPrompt({ ...base, d: 700, sinceLastPromptMs: 3999 })).toBeNull();
    expect(nextPrompt({ ...base, d: 700, sinceLastPromptMs: 4000 })?.stage).toBe('far');
    expect(nextPrompt({ ...base, d: 150, sinceLastPromptMs: 0 })).toBeNull();
    expect(nextPrompt({ ...base, d: 50, sinceLastPromptMs: 0 })?.stage).toBe('now');
  });
  it('a right turn 100 m after the left chains: "Turn left onto MG Road, then turn right"', () => {
    expect(nextPrompt({ ...base, d: 50, next: right, done: ['far', 'near'] })?.text).toBe(
      'Turn left onto MG Road, then turn right',
    );
    expect(nextPrompt({ ...base, d: 190, next: right })?.text).toBe('In 200 metres, turn left onto MG Road, then turn right');
  });
  it('no chain beyond 150 m, when the next is the arrival, or for far', () => {
    expect(nextPrompt({ ...base, d: 50, next: step('turn', 'right', 3151) })?.text).toBe('Turn left onto MG Road');
    expect(nextPrompt({ ...base, d: 50, next: step('arrive', null, 3100) })?.text).toBe('Turn left onto MG Road');
    expect(nextPrompt({ ...base, d: 700, next: right })?.text).toBe('In 700 metres, turn left onto MG Road');
  });
});

describe('smoothSpeed', () => {
  it('starts at the first sample, then weights the newest 0.3', () => {
    expect(smoothSpeed(null, 10)).toBe(10);
    expect(smoothSpeed(10, 20)).toBeCloseTo(13);
  });
  it('ignores unknown and negative samples', () => {
    expect(smoothSpeed(10, null)).toBe(10);
    expect(smoothSpeed(10, -1)).toBe(10);
    expect(smoothSpeed(null, null)).toBeNull();
  });
});

// ---------------------------------------------------------------- planVoice

const route = () =>
  prepareRoute(
    {
      ...straightRoute(8000, [
        [3000, 'turn', 'left'],
        [8000 - 100, 'turn', 'right'],
      ]),
    },
    1,
  );
// Named roads on the steps (the fixture has none).
const named = () => {
  const p = route();
  p.announced[0] = { ...p.announced[0], name: 'MG Road' };
  p.announced[1] = { ...p.announced[1], name: 'Hosur Rd' };
  return p;
};

const prog = (o: Partial<Progress> = {}): Progress => ({ ...initProgress(1), joined: true, ...o });
const along = (m: number, o: Partial<Progress> = {}): Progress => prog({ alongM: m, displayAlongM: m, ...o });

function input(o: Partial<VoiceInput> = {}): VoiceInput {
  return {
    now: 100_000,
    goodFix: true,
    speedMps: kmh(60),
    prepared: named(),
    progress: along(0),
    place: PLACE,
    offline: false,
    gpsLost: false,
    blocked: false,
    speaking: false,
    ...o,
  };
}
/** Plays a list of (progress, overrides) in order; returns what was said. */
function play(steps: Partial<VoiceInput>[], start: VoiceState = INITIAL_VOICE) {
  let st = start;
  const said: string[] = [];
  for (const s of steps) {
    const r = planVoice(st, input(s));
    st = r.state;
    if (r.prompt) said.push(r.prompt.text);
  }
  return { said, state: st };
}

describe('planVoice: start prompt', () => {
  it('first good fix says the route and distance', () => {
    const { said } = play([{}]);
    expect(said).toEqual(['Route to Mysuru Palace, 8 kilometres.']);
  });
  it('appends the first maneuver when it is already inside its far band, and does not repeat it', () => {
    const { said } = play([{ progress: along(2400) }, { progress: along(2410), now: 101_000 }, { progress: along(2420), now: 110_000 }]);
    expect(said).toEqual(['Route to Mysuru Palace, 5.5 kilometres. In 600 metres, turn left onto MG Road']);
  });
  it('needs a good fix', () => {
    expect(play([{ goodFix: false }]).said).toEqual([]);
  });
  it('before I am on the road the route is announced but no maneuver is (its distance would be from the route start)', () => {
    const { said } = play([{ progress: prog({ joined: false, alongM: 0, displayAlongM: 0 }), prepared: prepareRoute(straightRoute(8000, [[100, 'turn', 'left']]), 1) }]);
    expect(said).toEqual(['Route to Mysuru Palace, 8 kilometres.']);
  });
  it('is said once', () => {
    expect(play([{}, { now: 110_000 }]).said).toHaveLength(1);
  });
});

describe('planVoice: a ride past two maneuvers', () => {
  it('speaks far, near, now once each, with the 4 s gap and never twice', () => {
    const { said } = play([
      { progress: along(0), now: 1_000_000 }, // start
      { progress: along(2200), now: 1_100_000 }, // 800 m out: nothing
      { progress: along(2260), now: 1_110_000 }, // 740: far
      { progress: along(2300), now: 1_113_000 }, // 700: done
      { progress: along(2810), now: 1_120_000 }, // 190: near
      { progress: along(2940), now: 1_125_000 }, // 60: now
      { progress: along(2960), now: 1_126_000 }, // 40: nothing more
    ]);
    expect(said).toEqual([
      'Route to Mysuru Palace, 8 kilometres.',
      'In 700 metres, turn left onto MG Road',
      'In 200 metres, turn left onto MG Road',
      'Turn left onto MG Road',
    ]);
  });
  it('a stage held back by the gap is spoken at the next fix, not lost', () => {
    const a = planVoice(INITIAL_VOICE, input({ progress: along(2260), now: 1_000_000 })); // start + far
    const b = planVoice(a.state, input({ progress: along(2810), now: 1_001_000 })); // near wanted, 1 s after start prompt
    expect(b.prompt).toBeNull();
    const c = planVoice(b.state, input({ progress: along(2815), now: 1_005_000 }));
    expect(c.prompt?.stage).toBe('near');
  });
  it('now interrupts inside the gap', () => {
    const a = planVoice(INITIAL_VOICE, input({ progress: along(2260), now: 1_000_000 }));
    const b = planVoice(a.state, input({ progress: along(2950), now: 1_001_000 }));
    expect(b.prompt).toMatchObject({ kind: 'maneuver', stage: 'now' });
  });
  it('a prompt being spoken holds back the non-urgent ones, even past 4 s', () => {
    const a = planVoice(INITIAL_VOICE, input({ progress: along(2260), now: 1_000_000 }));
    expect(planVoice(a.state, input({ progress: along(2810), now: 1_010_000, speaking: true })).prompt).toBeNull();
  });
  it('a new maneuver resets the stages (de-dupe is per maneuver)', () => {
    const p = prepareRoute(straightRoute(9000, [[3000, 'turn', 'left'], [6000, 'turn', 'right']]), 1);
    let r = planVoice(INITIAL_VOICE, input({ prepared: p, progress: along(2260), now: 1_000_000 }));
    expect(r.state).toMatchObject({ idx: 0, done: ['far'] });
    r = planVoice(r.state, input({ prepared: p, progress: along(5260, { idx: 1 }), now: 1_100_000 }));
    expect(r.prompt).toMatchObject({ stage: 'far', text: 'In 700 metres, turn right' });
    expect(r.state).toMatchObject({ idx: 1, done: ['far'] });
  });
});

describe('planVoice: no prompt after the maneuver was passed', () => {
  it('past the maneuver the idx advances and the old stages are not spoken', () => {
    const p = named();
    let r = planVoice(INITIAL_VOICE, input({ prepared: p, progress: along(0) }));
    // Passed the left turn without any fix inside its bands: idx is 1 now, 7.1 km from the right turn.
    r = planVoice(r.state, input({ prepared: p, progress: along(3070, { idx: 1 }), now: 200_000 }));
    expect(r.prompt).toBeNull();
    expect(r.state.idx).toBe(1);
    expect(r.state.done).toEqual([]);
  });
});

describe('planVoice: never "Turn" after the turn (P3 review H3)', () => {
  it('a good fix past the maneuver before the step has advanced speaks nothing and spends the stages', () => {
    const p = named();
    const a = planVoice(INITIAL_VOICE, input({ prepared: p, progress: along(0) }));
    const r = planVoice(a.state, input({ prepared: p, progress: along(3010), now: 200_000 })); // idx still 0
    expect(r.prompt).toBeNull();
    expect(r.state.done).toEqual(['far', 'near', 'now']);
  });
  it('standing exactly on the maneuver point is too late as well', () => {
    const a = planVoice(INITIAL_VOICE, input({ progress: along(0) }));
    expect(planVoice(a.state, input({ progress: along(3000), now: 200_000 })).prompt).toBeNull();
  });
  it('unmuting (or an SOS clearing) between the near band and the junction: the next fix past the turn is silent', () => {
    const a = planVoice(INITIAL_VOICE, input({ progress: along(0) }));
    const muted = planVoice(a.state, input({ progress: along(2810), now: 150_000, blocked: true }));
    const r = planVoice(muted.state, input({ progress: along(3015), now: 160_000, blocked: false }));
    expect(r.prompt).toBeNull();
  });
  it('but unmuting before the turn still speaks the now stage', () => {
    const a = planVoice(INITIAL_VOICE, input({ progress: along(0) }));
    const muted = planVoice(a.state, input({ progress: along(2810), now: 150_000, blocked: true }));
    expect(planVoice(muted.state, input({ progress: along(2950), now: 160_000 })).prompt).toMatchObject({ stage: 'now' });
  });
  it('the start prompt does not carry a maneuver prompt for a turn already behind', () => {
    const r = planVoice(INITIAL_VOICE, input({ progress: along(3010) }));
    expect(r.prompt?.kind).toBe('start');
    expect(r.prompt?.text).toBe('Route to Mysuru Palace, 5 kilometres.');
  });
});

describe('planVoice: continue prompt', () => {
  it('right after a maneuver, when the next is at least 5 km away, names the road just taken', () => {
    const p = prepareRoute(
      straightRoute(20_000, [
        [1000, 'turn', 'left'],
        [19_000, 'turn', 'right'],
      ]),
      1,
    );
    p.announced[0] = { ...p.announced[0], name: 'MG Road' };
    let r = planVoice(INITIAL_VOICE, input({ prepared: p, progress: along(0), now: 1_000_000 }));
    r = planVoice(r.state, input({ prepared: p, progress: along(1100, { idx: 1 }), now: 1_020_000 }));
    expect(r.prompt?.text).toBe('Continue on MG Road for 18 kilometres');
    // once per idx
    expect(planVoice(r.state, input({ prepared: p, progress: along(1200, { idx: 1 }), now: 1_040_000 })).prompt).toBeNull();
  });
  it('without a road name: "Continue for …"; not at all under 5 km', () => {
    const p = prepareRoute(straightRoute(20_000, [[1000, 'turn', 'left'], [19_000, 'turn', 'right']]), 1);
    let r = planVoice(INITIAL_VOICE, input({ prepared: p, progress: along(0), now: 1_000_000 }));
    r = planVoice(r.state, input({ prepared: p, progress: along(1100, { idx: 1 }), now: 1_020_000 }));
    expect(r.prompt?.text).toBe('Continue for 18 kilometres');
    const q = named();
    let s = planVoice(INITIAL_VOICE, input({ prepared: q, progress: along(0), now: 1_000_000 }));
    s = planVoice(s.state, input({ prepared: q, progress: along(3100, { idx: 1 }), now: 1_020_000 }));
    expect(7900 - 3100 >= CONTINUE_MIN_M).toBe(false);
    expect(s.prompt).toBeNull();
  });
  it('held back by the gap is retried, not dropped', () => {
    const p = prepareRoute(straightRoute(20_000, [[1000, 'turn', 'left'], [19_000, 'turn', 'right']]), 1);
    let r = planVoice(INITIAL_VOICE, input({ prepared: p, progress: along(0), now: 1_000_000 }));
    r = planVoice(r.state, input({ prepared: p, progress: along(1100, { idx: 1 }), now: 1_001_000 }));
    expect(r.prompt).toBeNull();
    r = planVoice(r.state, input({ prepared: p, progress: along(1300, { idx: 1 }), now: 1_006_000 }));
    expect(r.prompt?.kind).toBe('continue');
  });
});

describe('planVoice: a new route (reroute)', () => {
  it('starts the stages over; near-only when already inside near', () => {
    let r = planVoice(INITIAL_VOICE, input({ progress: along(2260), now: 1_000_000 }));
    expect(r.state.done).toEqual(['far']);
    // New route id: maneuver 0 is 150 m away.
    const p2 = named();
    r = planVoice(r.state, input({ prepared: p2, progress: { ...along(2850), routeId: 2 }, now: 1_030_000 }));
    expect(r.prompt).toMatchObject({ stage: 'near', text: 'In 150 metres, turn left onto MG Road' });
    expect(r.state.done).toEqual(['far', 'near']);
  });
});

describe('planVoice: rerouting and GPS lost', () => {
  const off = prog({ offRoute: true });
  it('says "Rerouting" once on entering off route, again only after 30 s and a new episode', () => {
    let r = planVoice(INITIAL_VOICE, input({ progress: along(100), now: 1_000_000 }));
    r = planVoice(r.state, input({ progress: off, now: 1_010_000 }));
    expect(r.prompt).toMatchObject({ kind: 'rerouting', text: 'Rerouting' });
    expect(planVoice(r.state, input({ progress: off, now: 1_012_000 })).prompt).toBeNull(); // same episode
    // back on route, off again 10 s later: inside 30 s -> silent
    let b = planVoice(r.state, input({ progress: along(200), now: 1_015_000 }));
    b = planVoice(b.state, input({ progress: off, now: 1_020_000 }));
    expect(b.prompt).toBeNull();
    // and again after 30 s
    b = planVoice(b.state, input({ progress: along(300), now: 1_030_000 }));
    b = planVoice(b.state, input({ progress: off, now: 1_045_000 }));
    expect(b.prompt?.kind).toBe('rerouting');
  });
  it('offline: no "Rerouting"; it is said once the network is back and still off route', () => {
    let r = planVoice(INITIAL_VOICE, input({ progress: along(100), now: 1_000_000 }));
    r = planVoice(r.state, input({ progress: off, offline: true, now: 1_010_000 }));
    expect(r.prompt).toBeNull();
    r = planVoice(r.state, input({ progress: off, offline: false, now: 1_020_000 }));
    expect(r.prompt?.kind).toBe('rerouting');
  });
  it('off route says nothing about maneuvers', () => {
    const r = planVoice(INITIAL_VOICE, input({ progress: { ...off, alongM: 2900, displayAlongM: 2900 }, now: 1_000_000 }));
    expect(r.prompt?.kind).toBe('rerouting');
    expect(r.state.started).toBe(false);
  });
  it('GPS lost: once per episode and at most every 2 min', () => {
    let r = planVoice(INITIAL_VOICE, input({ gpsLost: true, now: 1_000_000 }));
    expect(r.prompt).toMatchObject({ kind: 'noGps', text: 'GPS signal lost' });
    expect(planVoice(r.state, input({ gpsLost: true, now: 1_005_000 })).prompt).toBeNull();
    // signal back, lost again within 2 min -> silent; after 2 min -> spoken
    let b = planVoice(r.state, input({ gpsLost: false, now: 1_010_000, goodFix: false }));
    b = planVoice(b.state, input({ gpsLost: true, now: 1_060_000 }));
    expect(b.prompt).toBeNull();
    b = planVoice(b.state, input({ gpsLost: false, now: 1_070_000, goodFix: false }));
    b = planVoice(b.state, input({ gpsLost: true, now: 1_130_000 }));
    expect(b.prompt?.kind).toBe('noGps');
  });
});

describe('planVoice: blocked (muted or SOS) marks stages without speaking, nothing is replayed', () => {
  it('far crossed while muted is not spoken after unmute; the next stage is', () => {
    let r = planVoice(INITIAL_VOICE, input({ progress: along(0), now: 1_000_000, blocked: true }));
    expect(r.prompt).toBeNull();
    expect(r.state.started).toBe(true);
    r = planVoice(r.state, input({ progress: along(2260), now: 1_010_000, blocked: true }));
    expect(r.prompt).toBeNull();
    expect(r.state.done).toEqual(['far']);
    r = planVoice(r.state, input({ progress: along(2300), now: 1_020_000 }));
    expect(r.prompt).toBeNull();
    r = planVoice(r.state, input({ progress: along(2810), now: 1_030_000 }));
    expect(r.prompt?.stage).toBe('near');
  });
  it('a blocked prompt does not start the gap', () => {
    const r = planVoice(INITIAL_VOICE, input({ progress: along(2260), now: 1_000_000, blocked: true }));
    expect(r.state.lastPromptAt).toBeNull();
  });
  it('rerouting and GPS lost are silent too', () => {
    expect(planVoice(INITIAL_VOICE, input({ progress: prog({ offRoute: true }), blocked: true })).prompt).toBeNull();
    expect(planVoice(INITIAL_VOICE, input({ gpsLost: true, blocked: true })).prompt).toBeNull();
  });
});

describe('voiceBlocked (§4.3)', () => {
  const ok = { voiceOn: true, mySosOn: false, sosHolding: false, receivedSos: false };
  it('is silent only when nothing blocks', () => {
    expect(voiceBlocked(ok)).toBe(false);
  });
  it.each([
    ['muted', { voiceOn: false }],
    ['my SOS on or sending', { mySosOn: true }],
    ['the SOS hold in progress', { sosHolding: true }],
    ['a received SOS', { receivedSos: true }],
  ])('blocks for %s', (_n, o) => {
    expect(voiceBlocked({ ...ok, ...o })).toBe(true);
  });
});

describe('voice preference', () => {
  it('defaults to on; only "0" mutes', () => {
    expect(parseVoicePref(null)).toBe(true);
    expect(parseVoicePref(undefined)).toBe(true);
    expect(parseVoicePref('')).toBe(true);
    expect(parseVoicePref('1')).toBe(true);
    expect(parseVoicePref('0')).toBe(false);
  });
  it('round-trips', () => {
    expect(parseVoicePref(encodeVoicePref(false))).toBe(false);
    expect(parseVoicePref(encodeVoicePref(true))).toBe(true);
  });
});
