import { destKey, NO_ARRIVAL, type ArrivalLatch } from '../nav-arrival';
import { createNavSession, type NavSessionDeps, type NavVoice } from '../nav-session';
import type { NavRoute, NavRouteResult } from '../nav-route';
import type { SayResult } from '../speech';
import { at, fix, straightRoute } from '../__fixtures__/nav-fixtures';

jest.mock('expo-sqlite/localStorage/install', () => ({}));
jest.mock('expo-speech', () => ({}));
jest.mock('expo-audio', () => ({}));

const DEST = at(8000);
const route = (): NavRoute => {
  const r = straightRoute(8000, [[3000, 'turn', 'left']]);
  r.steps = r.steps?.map((s) => (s.type === 'turn' ? { ...s, name: 'MG Road' } : s));
  return r;
};

interface Said {
  text: string;
  valid: () => boolean;
  resolve: (r: SayResult) => void;
}

function harness() {
  const clock = { now: 1_000_000 };
  const said: Said[] = [];
  const voice: NavVoice & { prepare: jest.Mock; hush: jest.Mock; teardown: jest.Mock; releaseIfIdle: jest.Mock } = {
    releaseIfIdle: jest.fn(),
    prepare: jest.fn(),
    hush: jest.fn(),
    teardown: jest.fn(),
    say: (text, valid) =>
      new Promise<SayResult>((resolve) => {
        said.push({ text, valid, resolve });
      }),
  };
  let latch: ArrivalLatch = NO_ARRIVAL;
  const deps: NavSessionDeps = {
    now: () => clock.now,
    fetchRoute: () => new Promise<NavRouteResult>(() => {}),
    publish: () => {},
    readAvoid: () => true,
    getLatch: () => latch,
    setLatch: (_id, l) => {
      latch = l;
    },
    voice,
  };
  const session = createNavSession(deps);
  const effects = { onArrived: jest.fn(), onRerouted: jest.fn(), onRouteFailed: jest.fn(), onVoiceSkipped: jest.fn() };
  session.setEffects(effects);
  const start = (place = 'Mysuru Palace') => session.start({ rideId: 'r', dest: DEST, place, seed: route() });
  /** A fix `m` metres along the road, `dtMs` after the last (the progress floor refuses jumps faster than the speed allows). */
  const at_ = (m: number, dtMs = 1000, over: Parameters<typeof fix>[1] = {}) => {
    clock.now += dtMs;
    return session.ingest(fix(m, { t: clock.now, speedMps: 16.67, ...over }));
  };
  return { session, clock, said, voice, effects, start, at_, latch: () => latch };
}
const flush = () => new Promise<void>((r) => setImmediate(r));
/** The engine finished speaking everything said so far. */
const finishAll = async (said: Said[]) => {
  said.forEach((s) => s.resolve('spoken'));
  await flush();
};

describe('voice in the session', () => {
  it('start prepares the audio session and the first good fix says the route', () => {
    const h = harness();
    h.start();
    expect(h.voice.prepare).toHaveBeenCalledTimes(1);
    h.at_(0);
    expect(h.said.map((s) => s.text)).toEqual(['Route to Mysuru Palace, 8 kilometres.']);
  });

  it('prompts follow the fixes: far, near, now once each, then arrival', async () => {
    const h = harness();
    h.start();
    h.at_(0);
    await finishAll(h.said);
    h.at_(2260, 150_000);
    await finishAll(h.said);
    h.at_(2300);
    h.at_(2810, 40_000);
    await finishAll(h.said);
    h.clock.now += 5000;
    h.at_(2950, 10_000);
    expect(h.said.map((s) => s.text)).toEqual([
      'Route to Mysuru Palace, 8 kilometres.',
      'In 700 metres, turn left onto MG Road',
      'In 200 metres, turn left onto MG Road',
      'Turn left onto MG Road',
    ]);
  });

  it('a prompt that went out of date while the audio session started is dropped (never spoken late)', async () => {
    const h = harness();
    h.start();
    h.at_(0);
    await finishAll(h.said);
    h.at_(2260, 150_000); // far prompt for maneuver 0
    const far = h.said[1];
    expect(far.valid()).toBe(true);
    // The rider passes the turn before the audio is ready.
    h.at_(3070, 10_000);
    h.at_(3090);
    expect(h.session.getState().progress?.idx).toBe(1);
    expect(far.valid()).toBe(false);
  });

  it('a stale prompt is not valid once the session stops or the destination changes', () => {
    const h = harness();
    h.start();
    h.at_(0);
    const first = h.said[0];
    h.session.stop();
    expect(first.valid()).toBe(false);
  });

  it('is silent while blocked (muted / SOS), hushes at once, and replays nothing after', async () => {
    const h = harness();
    h.start();
    h.at_(0);
    await finishAll(h.said);
    h.clock.now += 20_000;
    h.session.setVoiceBlocked(true);
    expect(h.voice.hush).toHaveBeenCalledTimes(2); // start() + the block
    h.at_(2260, 150_000); // far crossed while blocked
    expect(h.said).toHaveLength(1);
    h.session.setVoiceBlocked(false);
    h.at_(2300);
    expect(h.said).toHaveLength(1); // far is not replayed
    h.at_(2810, 40_000);
    expect(h.said[1].text).toBe('In 200 metres, turn left onto MG Road');
  });

  it('a prompt waiting for the audio session is invalid once voice is blocked', () => {
    const h = harness();
    h.start();
    h.at_(0);
    expect(h.said[0].valid()).toBe(true);
    h.session.setVoiceBlocked(true);
    expect(h.said[0].valid()).toBe(false);
  });

  it('reports a skipped prompt (audio session could not start) once, and the stage is not replayed', async () => {
    const h = harness();
    h.start();
    h.at_(0);
    h.said[0].resolve('skipped');
    await flush();
    expect(h.effects.onVoiceSkipped).toHaveBeenCalledTimes(1);
    h.at_(2260, 150_000);
    h.said[1].resolve('skipped');
    await flush();
    expect(h.effects.onVoiceSkipped).toHaveBeenCalledTimes(2);
    h.at_(2300);
    h.clock.now += 5000;
    h.at_(2320);
    expect(h.said).toHaveLength(2);
  });

  it('while a prompt is still being spoken, the non-urgent ones wait', async () => {
    const h = harness();
    h.start();
    h.at_(0); // start prompt, still speaking
    h.at_(2260, 150_000);
    expect(h.said).toHaveLength(1);
    h.said[0].resolve('spoken');
    await flush();
    h.at_(2270);
    expect(h.said[1].text).toBe('In 700 metres, turn left onto MG Road');
  });

  it('GPS lost is said from a clock beat when fixes stop altogether, once', () => {
    const h = harness();
    h.start();
    h.at_(0);
    h.clock.now += 11_000; // no good fix for > 10 s
    h.session.tick();
    expect(h.said.map((s) => s.text)).toEqual(['Route to Mysuru Palace, 8 kilometres.', 'GPS signal lost']);
    h.clock.now += 2000;
    h.session.tick();
    expect(h.said).toHaveLength(2);
  });

  it('every clock beat asks the speech layer to give the audio session back if idle (M2)', () => {
    const h = harness();
    h.start();
    h.session.tick();
    h.session.tick();
    expect(h.voice.releaseIfIdle).toHaveBeenCalledTimes(2);
  });

  it('a clock beat never speaks a maneuver prompt', async () => {
    const h = harness();
    h.start();
    h.at_(0);
    await finishAll(h.said);
    h.at_(2260, 150_000);
    await finishAll(h.said);
    const n = h.said.length;
    h.clock.now += 5000;
    h.session.tick();
    h.session.tick();
    expect(h.said).toHaveLength(n);
  });

  it('with no session (headless relaunch) nothing is spoken and nothing is fetched', () => {
    const h = harness();
    expect(h.at_(100)).toBe(false);
    h.session.tick();
    h.session.repeat();
    expect(h.said).toHaveLength(0);
    expect(h.voice.prepare).not.toHaveBeenCalled();
  });
});

describe('a prompt is never late (P3 review H3)', () => {
  it('a fix that reaches the engine more than 3 s after it was taken drives no maneuver prompt', async () => {
    const h = harness();
    h.start();
    h.at_(0);
    await finishAll(h.said);
    h.at_(2260, 150_000);
    await finishAll(h.said);
    h.at_(2810, 40_000);
    await finishAll(h.said);
    h.clock.now += 5000;
    const n = h.said.length;
    // A background batch delivered 6 s late: it is where the rider was, not where they are.
    h.at_(2950, 10_000, { t: h.clock.now + 4000 });
    expect(h.said).toHaveLength(n);
    // The next fix is fresh and still before the turn: now speaks.
    h.at_(2970, 1000);
    expect(h.said[h.said.length - 1].text).toBe('Turn left onto MG Road');
  });

  it('poor fixes in the now band speak nothing, and a good fix past the turn does not either', async () => {
    const h = harness();
    h.start();
    h.at_(0);
    await finishAll(h.said);
    h.at_(2260, 150_000);
    await finishAll(h.said);
    h.at_(2810, 40_000);
    await finishAll(h.said);
    h.clock.now += 5000;
    h.at_(2950, 10_000, { accuracyM: 90 });
    h.at_(2990, 2000, { accuracyM: 90 });
    h.at_(3010, 2000, { accuracyM: 90 });
    h.at_(3030, 2000);
    // ("GPS signal lost" after 10 s of poor fixes is right; a "Turn" is not.)
    expect(h.said.filter((s) => s.text.startsWith('Turn'))).toHaveLength(0);
  });

  it('unmuting between the near band and the junction does not speak "Turn" after it', async () => {
    const h = harness();
    h.start();
    h.at_(0);
    await finishAll(h.said);
    h.session.setVoiceBlocked(true);
    h.at_(2810, 190_000);
    h.session.setVoiceBlocked(false);
    h.clock.now += 5000;
    const n = h.said.length;
    h.at_(3020, 10_000);
    expect(h.said).toHaveLength(n);
  });
});

describe('arrival', () => {
  it('says "You\'ve arrived at X" once; the soft stop that follows lets it finish', async () => {
    const h = harness();
    h.start();
    h.at_(0);
    h.said[0].resolve('spoken');
    await flush();
    h.at_(7900, 500_000); // within 150 m of the end
    expect(h.effects.onArrived).toHaveBeenCalledTimes(1);
    expect(h.said.map((s) => s.text)).toEqual([
      'Route to Mysuru Palace, 8 kilometres.',
      "You've arrived at Mysuru Palace",
    ]);
    expect(h.session.getState().active).toBe(false);
    // The layout notices arrival and stops the session: the prompt is not cut off.
    h.voice.teardown.mockClear();
    h.session.stop();
    expect(h.voice.teardown).not.toHaveBeenCalled();
    h.said[1].resolve('spoken');
    await flush();
    expect(h.voice.teardown).toHaveBeenCalledTimes(1);
    expect(h.at_(7950)).toBe(false);
  });

  it('a hard stop (End ride) cuts it at once', () => {
    const h = harness();
    h.start();
    h.at_(0);
    h.at_(7900, 500_000);
    h.voice.teardown.mockClear();
    h.session.stop({ hard: true });
    expect(h.voice.teardown).toHaveBeenCalledTimes(1);
  });

  it('muted: arrival is silent and the session is released at once', () => {
    const h = harness();
    h.start();
    h.session.setVoiceBlocked(true);
    h.at_(0);
    h.voice.teardown.mockClear();
    h.at_(7900, 500_000);
    expect(h.said).toHaveLength(0);
    expect(h.voice.teardown).toHaveBeenCalledTimes(1);
  });
});

describe('stopping and replacing', () => {
  it('stop tears the speech down; a second stop is harmless', () => {
    const h = harness();
    h.start();
    h.at_(0);
    h.session.stop();
    expect(h.voice.teardown).toHaveBeenCalledTimes(1);
    h.session.stop();
    expect(h.said).toHaveLength(1);
  });
  it('a replaced destination hushes, resets the stages and says the new route', () => {
    const h = harness();
    h.start();
    h.at_(0);
    h.voice.hush.mockClear();
    h.session.start({ rideId: 'r', dest: at(5000), place: 'Nandi Hills', seed: straightRoute(5000, [[2500, 'turn', 'right']]) });
    expect(h.voice.hush).toHaveBeenCalledTimes(1);
    h.at_(0);
    expect(h.said[h.said.length - 1].text).toBe('Route to Nandi Hills, 5 kilometres.');
    expect(destKey(at(5000))).toBe(h.session.getState().key);
  });
});

describe('repeat (banner tap)', () => {
  it('says the current instruction in the now-form', () => {
    const h = harness();
    h.start();
    h.at_(0);
    h.said[0].resolve('spoken');
    h.session.repeat();
    expect(h.said[1].text).toBe('Turn left onto MG Road');
  });
  it('is silent while muted, off route-less, or before I am on the road', () => {
    const h = harness();
    h.start();
    h.session.repeat(); // no fix yet: not joined
    expect(h.said).toHaveLength(0);
    h.at_(0);
    h.session.setVoiceBlocked(true);
    h.session.repeat();
    expect(h.said).toHaveLength(1);
  });
});
