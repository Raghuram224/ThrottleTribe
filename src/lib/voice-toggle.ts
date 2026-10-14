// The mute toggle (docs/design/21 §4.4): one action for the map control and the ⋯ menu. The engine hushes by itself
// when the preference changes (use-navigation subscribes to nav-store), in the background too.
import { copy } from '@/lib/copy';
import { track } from '@/lib/telemetry';
import { useNavStore } from '@/store/nav-store';
import { showToast } from '@/store/toast-store';

/** Flips voice directions on / off, persisted on this phone; the toast says the new mode in words. Returns it. */
export function toggleVoice(): boolean {
  const next = !useNavStore.getState().voiceOn;
  useNavStore.getState().setVoiceOn(next);
  showToast(next ? copy['nav.toastVoiceOn'] : copy['nav.toastVoiceOff']);
  track('nav.voice_muted', { muted: !next });
  return next;
}
