// The one place that talks to expo-haptics (docs/design/13 §0.3). Every haptic in the app goes
// through `haptic()`; the Vibration preference (Profile -> Appearance) switches the non-safety ones
// off. SOS haptics pass `safety: true` and always fire.
import * as Haptics from 'expo-haptics';

export type HapticKind =
  | 'select' // button, segmented change, chip select
  | 'success' // created, joined, saved, ride started / ended
  | 'warning' // alert banner (stopped / offline / message)
  | 'error' // error line appears, SOS complete
  | 'light' // SOS hold start, long-press on the code
  | 'medium'; // SOS hold 1 s, Call buttons on SOS panels

let enabled = true;

/** Called by the prefs store (initial value and every change). */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

/** `safety` haptics (SOS) ignore the preference. Never throws: devices without an engine are fine. */
export function haptic(kind: HapticKind, opts?: { safety?: boolean }): void {
  if (!enabled && !opts?.safety) return;
  try {
    let p: Promise<void>;
    switch (kind) {
      case 'select':
        p = Haptics.selectionAsync();
        break;
      case 'success':
        p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case 'light':
        p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
    }
    p.catch(() => {});
  } catch {
    // No haptic engine (or a test environment).
  }
}

/** Haptic for an alert banner (07): Error for SOS, Success for good news, Warning otherwise. */
export function alertHaptic(kind: string): void {
  if (kind === 'sos') haptic('error', { safety: true });
  else if (kind === 'sos_cleared' || kind === 'ended') haptic('success');
  else haptic('warning');
}
