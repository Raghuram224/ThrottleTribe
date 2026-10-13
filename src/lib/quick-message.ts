/** Same quick message is disabled for this long after sending (06 §5). */
export const MESSAGE_COOLDOWN_MS = 10_000;

/** Milliseconds left on the cooldown; 0 when the kind can be sent. */
export function cooldownLeft(sentAt: number | undefined, now: number, cooldownMs = MESSAGE_COOLDOWN_MS): number {
  if (sentAt === undefined) return 0;
  return Math.max(0, sentAt + cooldownMs - now);
}
