// A tiny signal: "the ride Home last read as open is no longer mine" (I left it). Home listens and drops its cached open ride,
// then re-reads it, so no resume card, Search-stops bar or group SOS is left pointing at a ride I am not in. No React.
const listeners = new Set<() => void>();

export function onOpenRideInvalidated(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function invalidateOpenRide(): void {
  listeners.forEach((fn) => fn());
}
