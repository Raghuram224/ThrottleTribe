import { Platform } from 'react-native';

import {
  hush,
  MAX_UTTERANCE_MS,
  START_TIMEOUT_MS,
  prepare,
  RELEASE_DELAY_MS,
  releaseIfIdle,
  resetSpeechForTests,
  say,
  teardown,
  VOICE_LOOKUP_TIMEOUT_MS,
} from '../speech';

const mockCalls: string[] = [];
interface SpeakOpts {
  language?: string;
  voice?: string;
  useApplicationAudioSession?: boolean;
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (e: Error) => void;
}
let mockLastSpeak: { text: string; opts: SpeakOpts } | null = null;
let mockActivateFails = false;
let mockVoices: { language: string; identifier?: string }[] = [];
let mockActivateGate: Promise<void> | null = null;
let mockDeactivateFails = 0;
let mockModeFails = false;
let mockVoicesHang = false;
let mockSpeakResult: unknown;
let mockMaxInput = Number.MAX_VALUE;

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async (mode: unknown) => {
    if (mockModeFails) throw new Error('mode');
    mockCalls.push(`mode:${JSON.stringify(mode)}`);
  }),
  setIsAudioActiveAsync: jest.fn(async (on: boolean) => {
    if (on && mockActivateFails) throw new Error('busy');
    if (on && mockActivateGate) await mockActivateGate;
    if (!on && mockDeactivateFails > 0) {
      mockDeactivateFails -= 1;
      mockCalls.push('active:false(failed)');
      throw new Error('draining');
    }
    mockCalls.push(`active:${on}`);
  }),
}));
jest.mock('expo-speech', () => ({
  stop: jest.fn(async () => {
    mockCalls.push('stop');
  }),
  speak: jest.fn((text: string, opts: SpeakOpts) => {
    mockCalls.push('speak');
    mockLastSpeak = { text, opts };
    return mockSpeakResult;
  }),
  getAvailableVoicesAsync: jest.fn(() => (mockVoicesHang ? new Promise(() => {}) : Promise.resolve(mockVoices))),
  get maxSpeechInputLength() {
    return mockMaxInput;
  },
}));

const tick = (ms = 0) => jest.advanceTimersByTimeAsync(ms);
const origOS = Platform.OS;

beforeEach(() => {
  jest.useFakeTimers();
  mockCalls.length = 0;
  mockLastSpeak = null;
  mockActivateFails = false;
  mockVoices = [];
  mockActivateGate = null;
  mockDeactivateFails = 0;
  mockModeFails = false;
  mockVoicesHang = false;
  mockSpeakResult = undefined;
  mockMaxInput = Number.MAX_VALUE;
  resetSpeechForTests();
  Platform.OS = 'ios';
});
afterEach(() => {
  jest.useRealTimers();
  Platform.OS = origOS;
});

describe('iOS audio session (§4.5.3)', () => {
  it('sets the audio mode once: playback in silent mode, duck others, background, no recording', async () => {
    await prepare();
    await prepare();
    const modes = mockCalls.filter((c) => c.startsWith('mode:'));
    expect(modes).toHaveLength(1);
    expect(JSON.parse(modes[0].slice(5))).toMatchObject({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
      allowsRecording: false,
    });
    expect(mockCalls).not.toContain('active:true');
  });

  it('activates the session, stops what is playing, speaks on the app session, then releases 500 ms after done', async () => {
    const done = say('Turn left');
    await tick();
    expect(mockCalls.filter((c) => !c.startsWith('mode:'))).toEqual(['active:true', 'stop', 'speak']);
    expect(mockLastSpeak?.text).toBe('Turn left');
    expect(mockLastSpeak?.opts.useApplicationAudioSession).toBe(true);
    mockLastSpeak?.opts.onDone?.();
    await expect(done).resolves.toBe('spoken');
    await tick(RELEASE_DELAY_MS - 1);
    expect(mockCalls).not.toContain('active:false');
    await tick(1);
    expect(mockCalls[mockCalls.length - 1]).toBe('active:false');
  });

  it('a prompt that starts within 500 ms keeps the session (no flapping)', async () => {
    const a = say('One');
    await tick();
    mockLastSpeak?.opts.onDone?.();
    await a;
    await tick(200);
    const b = say('Two');
    await tick();
    expect(mockCalls.filter((c) => c === 'active:true')).toHaveLength(1);
    await tick(RELEASE_DELAY_MS + 100);
    expect(mockCalls).not.toContain('active:false'); // still speaking "Two"
    mockLastSpeak?.opts.onDone?.();
    await b;
    await tick(RELEASE_DELAY_MS);
    expect(mockCalls.filter((c) => c === 'active:false')).toHaveLength(1);
  });

  it('a stopped older utterance does not release the newer one', async () => {
    const a = say('One');
    await tick();
    const first = mockLastSpeak;
    const b = say('Two');
    await tick();
    first?.opts.onStopped?.(); // expo-speech reports the cut-off of the first
    await expect(a).resolves.toBe('spoken');
    await tick(RELEASE_DELAY_MS * 2);
    expect(mockCalls).not.toContain('active:false');
    mockLastSpeak?.opts.onDone?.();
    await b;
  });

  it('activation fails (call, Siri, other app): the prompt is skipped, not spoken, not queued', async () => {
    mockActivateFails = true;
    await expect(say('Turn left')).resolves.toBe('skipped');
    expect(mockCalls).not.toContain('speak');
    mockActivateFails = false;
    const next = say('Turn right');
    await tick();
    expect(mockLastSpeak?.text).toBe('Turn right'); // the failed one is never replayed
    mockLastSpeak?.opts.onDone?.();
    await next;
  });

  it('a prompt that went out of date while the session started is not spoken, and the session is released', async () => {
    const r = say('Turn left', () => false);
    await tick();
    await expect(r).resolves.toBe('stale');
    expect(mockCalls).not.toContain('speak');
    await tick(RELEASE_DELAY_MS);
    expect(mockCalls[mockCalls.length - 1]).toBe('active:false');
  });

  it('an engine that never reports done does not hold the session forever', async () => {
    const r = say('Turn left');
    await tick();
    mockLastSpeak?.opts.onStart?.();
    await tick(MAX_UTTERANCE_MS);
    await expect(r).resolves.toBe('spoken');
    await tick(RELEASE_DELAY_MS);
    expect(mockCalls[mockCalls.length - 1]).toBe('active:false');
  });

  it('error ends the prompt like done', async () => {
    const r = say('Turn left');
    await tick();
    mockLastSpeak?.opts.onError?.(new Error('tts'));
    await expect(r).resolves.toBe('spoken');
  });

  it('hush stops now and gives the session back', async () => {
    const r = say('Turn left');
    await tick();
    mockCalls.length = 0;
    hush();
    await tick(RELEASE_DELAY_MS);
    expect(mockCalls).toEqual(['stop', 'active:false']);
    mockLastSpeak?.opts.onStopped?.();
    await r;
  });

  it('teardown stops, deactivates and sets the audio mode again at the next start', async () => {
    await prepare();
    const r = say('x');
    await tick();
    mockLastSpeak?.opts.onDone?.();
    await r;
    mockCalls.length = 0;
    teardown();
    await tick();
    expect(mockCalls).toEqual(['stop', 'active:false']);
    await prepare();
    expect(mockCalls.filter((c) => c.startsWith('mode:'))).toHaveLength(1);
  });
});

describe('language and defaults', () => {
  it('uses en-IN when the device has such a voice, else leaves it to the device', async () => {
    mockVoices = [{ language: 'en_IN' }];
    const a = say('One');
    await tick();
    expect(mockLastSpeak?.opts.language).toBe('en-IN');
    mockLastSpeak?.opts.onDone?.();
    await a;
    resetSpeechForTests();
    mockVoices = [{ language: 'en-US' }];
    const b = say('Two');
    await tick();
    expect(mockLastSpeak?.opts.language).toBeUndefined();
    mockLastSpeak?.opts.onDone?.();
    await b;
  });
});

describe('Android', () => {
  beforeEach(() => {
    Platform.OS = 'android';
  });
  it('does no audio-session work: stop, then speak', async () => {
    await prepare();
    const r = say('Turn left');
    await tick();
    expect(mockCalls).toEqual(['stop', 'speak']);
    mockLastSpeak?.opts.onDone?.();
    await r;
    await tick(RELEASE_DELAY_MS * 2);
    hush();
    teardown();
    expect(mockCalls.some((c) => c.startsWith('active:') || c.startsWith('mode:'))).toBe(false);
  });
});

describe('M1: the session is never left active by a prompt that bailed', () => {
  const lastActive = () => [...mockCalls].reverse().find((c) => c.startsWith('active:'));
  const gate = () => {
    let open!: () => void;
    mockActivateGate = new Promise<void>((r) => {
      open = r;
    });
    return open;
  };

  it('teardown while the session is still activating: it is released as soon as the activation lands', async () => {
    const open = gate();
    const r = say('Turn left');
    await tick();
    teardown(); // the cached flag still says "inactive"
    mockActivateGate = null;
    open();
    await expect(r).resolves.toBe('stale');
    await tick(RELEASE_DELAY_MS * 2);
    expect(lastActive()).toBe('active:false');
    expect(mockCalls).not.toContain('speak');
  });

  it('hush while the session is activating (slower than the release delay) still ends released', async () => {
    const open = gate();
    const r = say('Turn left');
    await tick();
    hush();
    await tick(RELEASE_DELAY_MS * 2); // the hush release fired while the activation was still pending
    mockActivateGate = null;
    open();
    await expect(r).resolves.toBe('stale');
    await tick(RELEASE_DELAY_MS * 2);
    expect(lastActive()).toBe('active:false');
  });

  it('a newer prompt owns the session: the older one that bails does not release it', async () => {
    const open = gate();
    const a = say('One');
    await tick();
    mockActivateGate = null;
    const b = say('Two');
    await tick();
    open();
    await expect(a).resolves.toBe('stale');
    await tick();
    mockLastSpeak?.opts.onDone?.();
    await b;
    expect(mockCalls.filter((c) => c === 'active:false')).toHaveLength(0);
  });

  it('teardown deactivates even when the cached flag says inactive (an interruption can have reactivated the session)', async () => {
    teardown();
    await tick();
    expect(mockCalls).toContain('active:false');
  });

  it('a deactivation that fails (audio still draining) is retried', async () => {
    mockDeactivateFails = 2;
    teardown();
    await tick(2000);
    expect(mockCalls.filter((c) => c === 'active:false(failed)')).toHaveLength(2);
    expect(mockCalls[mockCalls.length - 1]).toBe('active:false');
  });

  it('a retry gives up when a newer prompt took the session over', async () => {
    mockDeactivateFails = 5;
    teardown();
    await tick(10);
    const r = say('Next');
    await tick(5000);
    mockLastSpeak?.opts.onDone?.();
    await r;
    expect(mockCalls.filter((c) => c === 'active:false(failed)').length).toBeLessThan(5);
  });
});

describe('M2: expo-audio reactivates the session after a call or Siri', () => {
  it('releaseIfIdle deactivates regardless of the cached flag once nothing has spoken for over 1 s', async () => {
    const r = say('Turn left');
    await tick();
    mockLastSpeak?.opts.onDone?.();
    await r;
    await tick(RELEASE_DELAY_MS); // our own release ran: the cached flag is "inactive"
    mockCalls.length = 0;
    await tick(1000);
    releaseIfIdle();
    await tick();
    expect(mockCalls).toEqual(['active:false']);
  });

  it('does not touch the session while a prompt is being spoken, or within 1 s of the last one', async () => {
    const r = say('Turn left');
    await tick();
    mockCalls.length = 0;
    releaseIfIdle();
    await tick();
    expect(mockCalls).toEqual([]);
    mockLastSpeak?.opts.onDone?.();
    await r;
    await tick(RELEASE_DELAY_MS);
    mockCalls.length = 0;
    releaseIfIdle(); // 0.5 s after the end
    await tick();
    expect(mockCalls).toEqual([]);
  });

  it('is a no-op on Android', async () => {
    Platform.OS = 'android';
    await tick(5000);
    releaseIfIdle();
    await tick();
    expect(mockCalls).toEqual([]);
  });
});

describe('L3: no prompt on a session that has no audio mode', () => {
  it('iOS: when setAudioModeAsync failed the prompt is skipped, not spoken in the default category; the mode is retried', async () => {
    mockModeFails = true;
    await expect(say('Turn left')).resolves.toBe('skipped');
    expect(mockCalls).not.toContain('speak');
    expect(mockCalls).not.toContain('active:true');
    mockModeFails = false;
    const r = say('Turn right');
    await tick();
    expect(mockLastSpeak?.text).toBe('Turn right');
    mockLastSpeak?.opts.onDone?.();
    await r;
  });
});

describe('L2: a rejected speak cannot escape', () => {
  it('a speak whose promise rejects ends the prompt instead of an unhandled rejection', async () => {
    mockSpeakResult = Promise.reject(new Error('InvalidVoice'));
    const r = say('Turn left');
    await tick();
    await expect(r).resolves.toBe('spoken');
  });
  it('text longer than the engine accepts is skipped (the native call would reject)', async () => {
    mockMaxInput = 10;
    await expect(say('This is far too long')).resolves.toBe('skipped');
    expect(mockCalls).not.toContain('speak');
  });
});

describe('L5: a voice lookup that never answers cannot hold a prompt', () => {
  it('speaks with the device default after the timeout', async () => {
    mockVoicesHang = true;
    const r = say('Turn left');
    await tick(VOICE_LOOKUP_TIMEOUT_MS - 1);
    expect(mockCalls).not.toContain('speak');
    await tick(1);
    expect(mockLastSpeak?.text).toBe('Turn left');
    expect(mockLastSpeak?.opts.language).toBeUndefined();
    mockLastSpeak?.opts.onDone?.();
    await r;
  });
});

describe('L1: Android en-IN', () => {
  beforeEach(() => {
    Platform.OS = 'android';
  });
  it('picks the en-IN voice by identifier (Locale("en-IN") is malformed there), not by language', async () => {
    mockVoices = [
      { language: 'en-US', identifier: 'en-us-x-iom-local' },
      { language: 'en-IN', identifier: 'en-in-x-ene-local' },
    ];
    const r = say('Turn left');
    await tick();
    expect(mockLastSpeak?.opts.voice).toBe('en-in-x-ene-local');
    expect(mockLastSpeak?.opts.language).toBeUndefined();
    mockLastSpeak?.opts.onDone?.();
    await r;
  });
  it('falls back to the default when there is none', async () => {
    mockVoices = [{ language: 'en-US', identifier: 'en-us-x-iom-local' }];
    const r = say('Turn left');
    await tick();
    expect(mockLastSpeak?.opts.voice).toBeUndefined();
    expect(mockLastSpeak?.opts.language).toBeUndefined();
    mockLastSpeak?.opts.onDone?.();
    await r;
  });
});

describe('H2: a dead engine (no callbacks at all) cannot wedge a prompt', () => {
  it('no onStart within the start timeout: the prompt is skipped, not held for the 20 s watchdog, and the session released', async () => {
    const r = say('Turn left');
    await tick(START_TIMEOUT_MS - 1);
    expect(mockCalls).not.toContain('active:false');
    await tick(1);
    await expect(r).resolves.toBe('skipped');
    await tick(RELEASE_DELAY_MS);
    expect(mockCalls[mockCalls.length - 1]).toBe('active:false');
  });

  it('once the engine is back the next prompt is spoken and ends normally', async () => {
    const dead = say('One');
    await tick(START_TIMEOUT_MS);
    await expect(dead).resolves.toBe('skipped');
    const next = say('Two');
    await tick();
    expect(mockLastSpeak?.text).toBe('Two');
    mockLastSpeak?.opts.onStart?.();
    await tick(START_TIMEOUT_MS * 2); // started: the start watch is off
    mockLastSpeak?.opts.onDone?.();
    await expect(next).resolves.toBe('spoken');
  });

  it('a late callback from the dead prompt after a newer one began does nothing to it', async () => {
    const a = say('One');
    await tick();
    const first = mockLastSpeak;
    await tick(START_TIMEOUT_MS);
    await a;
    const b = say('Two');
    await tick();
    first?.opts.onDone?.();
    first?.opts.onStopped?.();
    mockLastSpeak?.opts.onStart?.();
    mockLastSpeak?.opts.onDone?.();
    await expect(b).resolves.toBe('spoken');
  });
});
