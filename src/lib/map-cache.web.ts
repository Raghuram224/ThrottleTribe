// The browser's HTTP cache serves map tiles: there is no MapLibre native ambient cache to size.
export const AMBIENT_CACHE_BYTES = 0;

/** Same signature as the native one: called from the first map's loaded callback. */
export function raiseMapCache(): void {}
