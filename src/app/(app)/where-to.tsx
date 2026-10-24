import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';

import { href } from '@/lib/nav';
import { parseSearchEntry } from '@/lib/search-entry';
import { usePlanStore } from '@/store/plan-store';

/**
 * Where to? is not a screen any more (28): search happens over the map home's own map. This route only stays for deep
 * links and old callers: it opens the inline search in the plan store with the `q` / `chip` / `focus` it was given, then
 * goes to Home (back to the Home already under it when there is one, a replace otherwise), so there is never a second
 * Home and the map is not reloaded. Renders nothing.
 */
export default function WhereTo() {
  const params = useLocalSearchParams<{ q?: string; chip?: string; focus?: string }>();
  const handed = useRef(false);
  useEffect(() => {
    if (handed.current) return;
    handed.current = true;
    usePlanStore.getState().openSearch(parseSearchEntry(params));
    router.dismissTo(href('/home'));
  }, [params]);
  return null;
}
