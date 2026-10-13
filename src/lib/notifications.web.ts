// Web shim for the slice of expo-notifications the app uses. No push on web: alerts are the in-app
// banners plus a short beep and a vibration (where the browser has them; iOS Safari has no vibrate).
export const AndroidImportance = { HIGH: 4, MAX: 5 } as const;

type Handler = unknown;
let audio: AudioContext | null = null;

function beep(urgent: boolean): void {
  try {
    const Ctor: typeof AudioContext | undefined =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return;
    audio = audio ?? new Ctor();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const beeps = urgent ? 3 : 1;
    for (let i = 0; i < beeps; i++) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + i * 0.28;
      osc.frequency.value = urgent ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(urgent ? 0.5 : 0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + 0.22);
    }
  } catch {
    // Sound is a bonus.
  }
}

function vibrate(urgent: boolean): void {
  try {
    navigator.vibrate?.(urgent ? [500, 250, 500, 250, 500] : [250, 250, 250]);
  } catch {
    // No vibration engine.
  }
}

export function setNotificationHandler(_handler: Handler): void {}
export async function setNotificationChannelAsync(): Promise<null> {
  return null;
}
export async function deleteNotificationChannelAsync(): Promise<void> {}
export async function getPermissionsAsync() {
  // Reported as granted so no "notifications off" banner or permission step appears on web.
  return { status: 'granted', granted: true, canAskAgain: false, expires: 'never' } as const;
}
export async function requestPermissionsAsync() {
  return getPermissionsAsync();
}
export async function scheduleNotificationAsync(request: {
  content?: { data?: { kind?: unknown } };
}): Promise<string> {
  const urgent = request.content?.data?.kind === 'sos';
  beep(urgent);
  vibrate(urgent);
  return 'web';
}
export function addNotificationResponseReceivedListener(_listener: unknown): { remove: () => void } {
  return { remove: () => {} };
}
