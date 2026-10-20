import { usePrefsStore } from '@/store/prefs-store';

/** True while the rider has Terrain on (25 T2): maps mount the hillshade and the credit pill adds its line exactly then. */
export function useTerrainOn(): boolean {
  return usePrefsStore((s) => s.mapLayer) === 'terrain';
}
