import { useEffect, useState } from 'react';

/** Epoch ms that refreshes every `intervalMs`. Use instead of calling Date.now() during render. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
