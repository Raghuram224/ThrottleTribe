// maplibre-gl: run a layer sync once the style can take layers. `isStyleLoaded()` is false while any tile is in flight, and a
// toggle that arrives then (Terrain on, a new route) used to be dropped for good: no `style.load` comes to retry it.
import type { Map as MlMap } from 'maplibre-gl';

const pending = new WeakMap<MlMap, () => void>();

/** Runs `fn` now if the style is loaded, else once on the next `idle`. One listener per map; the latest `fn` wins. */
export function runWhenStyleReady(m: MlMap, fn: () => void): void {
  if (m.isStyleLoaded()) {
    pending.delete(m);
    fn();
    return;
  }
  const queued = pending.has(m);
  pending.set(m, fn);
  if (queued) return;
  m.once('idle', () => {
    const next = pending.get(m);
    pending.delete(m);
    if (next) runWhenStyleReady(m, next);
  });
}
