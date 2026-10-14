// The one place that imports expo-speech and expo-audio (like haptics.ts); docs/design/21 §4.1, §4.5.3.
// Thin and defensive: nothing here throws, and a prompt that cannot be spoken is reported, never queued for later.
//
// iOS: speech runs on the app's own audio session, which expo-audio configures (category .playback so the silent
// switch is ignored, duckOthers) and which is made active only while a prompt is spoken, so a rider's music is
// ducked for those seconds and not for the whole ride. Android: expo-speech hands the text to the system TTS
// engine; there is no audio focus and no ducking (known limit, 21 §4.5.4).
import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

/** spoken: it played (or was cut off by the next prompt); skipped: the audio session could not start; stale: no longer wanted. */
export type SayResult = 'spoken' | 'skipped' | 'stale';

/** The session stays active this long after a prompt, so back-to-back prompts do not flap it. */
export const RELEASE_DELAY_MS = 500;
/** If the engine never reports done/stopped/error (an interruption), give the session back after this long. */
export const MAX_UTTERANCE_MS = 20_000;
/** A voice lookup that has not answered by now is given up on for this prompt (Android TTS init can be slow or stuck). */
export const VOICE_LOOKUP_TIMEOUT_MS = 1500;
/**
 * No `onStart` this long after `speak` means the engine is not answering (a dead or stuck Android TTS): the prompt is
 * given up as skipped, so `speaking` cannot hold the non-urgent prompts back for the whole 20 s watchdog. The next
 * prompt calls `speak` again, which reaches a live engine once it is back (the expo-speech patch keeps it alive).
 */
export const START_TIMEOUT_MS = 6000;
/** `releaseIfIdle` leaves the session alone this long after a prompt ended. */
export const IDLE_RELEASE_AFTER_MS = 1000;
/** A deactivation that fails (audio still draining) is tried again this often, this many times in all. */
const DEACTIVATE_RETRY_MS = 250;
const DEACTIVATE_TRIES = 4;

const usesSession = () => Platform.OS === 'ios';

let prepared = false;
let preparing: Promise<void> | null = null;
let sessionActive = false;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let watchdog: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every `say` / `hush` / `teardown`: a late callback of an older utterance must not touch the newer one. */
let gen = 0;
/** The `gen` of the newest `say`: it owns the audio session; an older one that bails must not release it. */
let latestSay = 0;
/** The `gen` of the prompt that is in progress (activating or speaking), or null. */
let busyGen: number | null = null;
let lastEndAt = 0;
let idleRelease: Promise<void> | null = null;

interface VoicePick {
  /** iOS: a BCP 47 tag the system resolves to a voice. */
  language?: string;
  /** Android: a voice identifier (the Android `Locale("en-IN")` expo-speech builds from `language` is malformed). */
  voice?: string;
}
let voicePick: VoicePick | null = null;
let voiceLoad: Promise<void> | null = null;

/** `en-IN` when the device has such a voice (better local place names), else the device default. */
function pickVoice(voices: Speech.Voice[]): VoicePick {
  const match = voices.find((v) => v.language?.replace('_', '-').toLowerCase() === 'en-in');
  if (!match) return {};
  return Platform.OS === 'android' ? (match.identifier ? { voice: match.identifier } : {}) : { language: 'en-IN' };
}

function loadVoices(): Promise<void> {
  voiceLoad ??= Speech.getAvailableVoicesAsync().then(
    (voices) => {
      voicePick = pickVoice(voices);
    },
    () => {
      voicePick = {};
    },
  );
  return voiceLoad;
}

/** The voice to use; never waits longer than the timeout (the lookup keeps going and serves the next prompt). */
async function voiceOptions(): Promise<VoicePick> {
  if (voicePick) return voicePick;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, VOICE_LOOKUP_TIMEOUT_MS);
  });
  try {
    await Promise.race([loadVoices(), timeout]);
  } finally {
    clearTimeout(timer);
  }
  return voicePick ?? {};
}

const clearTimers = () => {
  if (releaseTimer) clearTimeout(releaseTimer);
  if (watchdog) clearTimeout(watchdog);
  releaseTimer = null;
  watchdog = null;
};

/**
 * Activation is skipped when the session is known to be active. Deactivation never is: the cached flag can be wrong
 * (activation still in flight, or expo-audio reactivating the session after a call or Siri), and a deactivate of an
 * inactive session is harmless.
 */
async function setActive(active: boolean): Promise<boolean> {
  if (!usesSession() || (active && sessionActive)) return true;
  try {
    await setIsAudioActiveAsync(active);
    sessionActive = active;
    return true;
  } catch {
    // Activation fails during a call or Siri, or when another app holds non-mixable audio. Deactivation can fail
    // while audio is still draining; `release` tries again.
    return false;
  }
}

/** Gives the session back, retrying a failed deactivation; gives up if something else took over (`gen` moved on). */
async function release(myGen: number): Promise<void> {
  for (let i = 0; i < DEACTIVATE_TRIES; i++) {
    if (myGen !== gen) return;
    if (await setActive(false)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, DEACTIVATE_RETRY_MS));
  }
}

function scheduleRelease(myGen: number): void {
  if (!usesSession()) return;
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    if (myGen === gen) void release(myGen);
  }, RELEASE_DELAY_MS);
}

/** Navigation session start (iOS): sets the audio mode once; it does not activate the session. */
export function prepare(): Promise<void> {
  if (!usesSession() || prepared) return Promise.resolve();
  preparing ??= setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'duckOthers',
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
  })
    .then(() => {
      prepared = true;
    })
    .catch(() => {})
    .finally(() => {
      preparing = null;
    });
  return preparing;
}

/**
 * Speaks `text`, cutting off whatever is being said (expo-speech queues otherwise). `valid` is asked again once
 * the session is ready, so a prompt that went out of date while it waited is dropped. Resolves when the
 * utterance ends, is stopped or fails. Never rejects.
 */
export async function say(text: string, valid: () => boolean = () => true): Promise<SayResult> {
  const myGen = ++gen;
  latestSay = myGen;
  busyGen = myGen;
  clearTimers();
  let activated = false;
  /**
   * Leaves without speaking. A session this prompt activated is given back unless a newer prompt owns it: soon when
   * nothing else has happened (no flapping), at once when a hush or teardown came in while it was activating.
   */
  const bail = (result: SayResult): SayResult => {
    if (busyGen === myGen) busyGen = null;
    if (activated && latestSay === myGen) {
      lastEndAt = Date.now();
      if (myGen === gen) scheduleRelease(myGen);
      else void release(gen);
    }
    return result;
  };
  try {
    await prepare();
    // The audio mode could not be set: speaking now would be in the default category (silent switch, no background).
    if (usesSession() && !prepared) return bail('skipped');
    if (usesSession() && !(await setActive(true))) return bail('skipped');
    activated = usesSession();
    if (myGen !== gen || !valid()) return bail('stale');
    await Speech.stop();
    if (myGen !== gen) return bail('stale');
    const pick = await voiceOptions();
    if (myGen !== gen) return bail('stale');
    // The native speak would reject for this (and expo-speech drops that promise): skip it here instead.
    if (text.length > Speech.maxSpeechInputLength) return bail('skipped');
    return await new Promise<SayResult>((resolve) => {
      let settled = false;
      let startWatch: ReturnType<typeof setTimeout> | null = null;
      const end = (result: SayResult = 'spoken') => {
        if (settled) return;
        settled = true;
        if (watchdog) clearTimeout(watchdog);
        watchdog = null;
        if (startWatch) clearTimeout(startWatch);
        if (busyGen === myGen) busyGen = null;
        lastEndAt = Date.now();
        if (myGen === gen) scheduleRelease(myGen);
        resolve(result);
      };
      watchdog = setTimeout(() => end(), MAX_UTTERANCE_MS);
      startWatch = setTimeout(() => end('skipped'), START_TIMEOUT_MS);
      try {
        const ret: unknown = Speech.speak(text, {
          ...pick,
          rate: 1.0,
          pitch: 1.0,
          volume: 1.0,
          // The session expo-audio manages (iOS): the one that is allowed to play in the background.
          useApplicationAudioSession: true,
          onStart: () => {
            if (startWatch) clearTimeout(startWatch);
            startWatch = null;
          },
          onDone: () => end(),
          onStopped: () => end(),
          onError: () => end(),
        });
        // expo-speech 57 drops the native promise (a rejection would be unhandled); if a version returns it, use it.
        if (ret && typeof (ret as Promise<unknown>).catch === 'function') (ret as Promise<unknown>).catch(() => end());
      } catch {
        end();
      }
    });
  } catch {
    return bail('skipped');
  }
}

/** Stops speaking now (mute, SOS, a replaced destination) and gives the session back. */
export function hush(): void {
  gen += 1;
  busyGen = null;
  clearTimers();
  void Speech.stop().catch(() => {});
  if (usesSession()) scheduleRelease(gen);
}

/** The navigation session is over: stop, deactivate, and set the audio mode again at the next start. */
export function teardown(): void {
  gen += 1;
  busyGen = null;
  clearTimers();
  void Speech.stop().catch(() => {});
  prepared = false;
  void release(gen);
}

/**
 * Called from the engine's 2 s beat while navigating (iOS). expo-audio reactivates the session when a call or Siri
 * ends (`handleInterruptionEnded`), which would keep the rider's music ducked with nothing speaking. If nothing is
 * being said and the last prompt ended over a second ago, deactivate whatever the cached flag says.
 */
export function releaseIfIdle(): void {
  if (!usesSession() || busyGen !== null || releaseTimer || preparing || idleRelease) return;
  if (Date.now() - lastEndAt < IDLE_RELEASE_AFTER_MS) return;
  idleRelease = release(gen).finally(() => {
    idleRelease = null;
  });
}

/** Speech works on every platform we ship; web is best effort (the browser's own voices). */
export function isAvailable(): boolean {
  return true;
}

/** Tests only: forget module state. */
export function resetSpeechForTests(): void {
  clearTimers();
  gen = 0;
  latestSay = 0;
  busyGen = null;
  lastEndAt = 0;
  idleRelease = null;
  prepared = false;
  preparing = null;
  sessionActive = false;
  voicePick = null;
  voiceLoad = null;
}
