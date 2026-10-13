import { useCallback, useEffect, useRef, useState } from 'react';

import type { LatLng } from '@/lib/geo';
import { type Place, searchPlaces, SEARCH_CHIPS, SEARCH_MIN_CHARS, type SearchChip } from '@/lib/place-search';

export const SEARCH_DEBOUNCE_MS = 350;

export type PlaceSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'results'; places: Place[] }
  | { status: 'error' };

/**
 * Debounced place search. Typed text needs 3+ characters and waits 350 ms; a chip searches at once.
 * Every new input aborts the request in flight. `retry()` repeats the last search.
 */
export function usePlaceSearch(me: LatLng | null) {
  const [text, setText] = useState('');
  const [chip, setChip] = useState<SearchChip['key'] | null>(null);
  const [state, setState] = useState<PlaceSearchState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  // The position is read when a search starts; moving must not re-run the search.
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    const chipDef = chip ? SEARCH_CHIPS.find((c) => c.key === chip) : undefined;
    const query = chipDef ? chipDef.query : text.trim();
    if (!chipDef && Array.from(query).length < SEARCH_MIN_CHARS) {
      // Cancelling a search is "no search", not a state change the effect should avoid.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setState({ status: 'loading' });
        searchPlaces({ query, osmTag: chipDef?.osmTag, me: meRef.current }, controller.signal)
          .then((places) => {
            if (!controller.signal.aborted) setState({ status: 'results', places });
          })
          .catch(() => {
            if (!controller.signal.aborted) setState({ status: 'error' });
          });
      },
      chipDef ? 0 : SEARCH_DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, chip, attempt]);

  const changeText = useCallback((v: string) => {
    setChip(null); // typing replaces a chip search
    setText(v);
  }, []);
  const pickChip = useCallback((key: SearchChip['key'] | null) => {
    setText('');
    setChip(key);
  }, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { text, setText: changeText, chip, setChip: pickChip, state, retry };
}
