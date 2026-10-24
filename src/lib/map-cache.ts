import { OfflineManager } from '@maplibre/maplibre-react-native';

/**
 * MapLibre keeps every tile it fetches in an "ambient" disk cache (least recently used first out); its default is
 * small (about 50 MB), so on a long trip areas seen earlier are fetched again. On a weak network that is what shows
 * blank squares (audit 6): a bigger cache lets revisited areas load from disk. Request timeouts and retries are
 * native-only and cannot be changed from JS.
 */
export const AMBIENT_CACHE_BYTES = 200 * 1024 * 1024;

let raised = false;

/**
 * Once per run, from the first map's finished-loading callback, never at bundle load: on Android the offline manager
 * needs MapLibre's native instance, which is created on the UI thread when the first map mounts, and asking earlier
 * can throw MapLibreConfigurationException. A failure only means the default stays, so it is never surfaced.
 */
export function raiseMapCache(): void {
  if (raised) return;
  raised = true;
  OfflineManager.setMaximumAmbientCacheSize(AMBIENT_CACHE_BYTES).catch(() => {});
}
