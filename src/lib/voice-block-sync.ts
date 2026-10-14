// Keeps the engine's "voice must be silent" flag in step with the stores that decide it (docs/design/21 §4.3).
// It runs inside zustand `subscribe` listeners, i.e. synchronously inside the `set` of the SOS / ride / UI stores, so
// it must never throw: a voice bug must not break sending or receiving an SOS (P3 review M4).
import { voiceBlocked, type VoiceBlockInput } from '@/lib/nav-voice';

export function createVoiceBlockSync(
  read: () => VoiceBlockInput,
  apply: (blocked: boolean) => void,
  onError: (e: unknown) => void,
): () => void {
  return () => {
    try {
      apply(voiceBlocked(read()));
    } catch (e) {
      try {
        onError(e);
      } catch {
        // Reporting is best effort too.
      }
    }
  };
}
