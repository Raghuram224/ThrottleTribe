import type { Href } from 'expo-router';

/**
 * Typed routes only know the paths Expo generated at the last `expo start`. Routes built from ids
 * and params are plain strings; this is the single place that vouches for them.
 */
export function href(path: string): Href {
  return path as Href;
}
