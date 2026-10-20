import { useCallback, useEffect, useRef, useState } from 'react';

import type { LatLng } from '@/lib/geo';
import {
  searchErrorKind,
  searchPlacesDetailed,
  SEARCH_CHIPS,
  SEARCH_MIN_CHARS,
  type Place,
  type PlaceSource,
  type SearchChip,
  type SearchErrorKind,
} from '@/lib/place-search';

/** 400 ms (was 350): saves Geoapify credits (24 S6). */
export const SEARCH_DEBOUNCE_MS = 400;

export type PlaceSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** `provider` credits who answered; `radiusM` is the chip caption's 5 or 25 km (null for typed search). */
  | { status: 'results'; places: Place[]; provider: PlaceSource; radiusM: number | null }
  /** `offline`: "Search needs a connection"; `busy`: a provider said 429 / quota; `slow`: online, but nothing answered in time. */
  | { status: 'error'; kind: SearchErrorKind };

/**
 * Debounced place search. Typed text needs 3+ characters and waits 400 ms; a chip searches at once.
 * Every new input aborts the request in flight. `retry()` repeats the last search.
 */
export function usePlaceSearch(
  me: LatLng | null,
  initial: { text?: string; chip?: SearchChip['key'] | null } = {},
  /** The phone has no network: no request at all, the error state says so (24 §2.5). */
  offline = false,
) {
  // The map home opens search with a chip or the text of the place being searched again (22 §3.2).
  const [text, setText] = useState(initial.chip ? '' : (initial.text ?? ''));
  const [chip, setChip] = useState<SearchChip['key'] | null>(initial.chip ?? null);
  const [state, setState] = useState<PlaceSearchState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  // Who answered last: the credit row keeps naming it while nothing is on screen. Null until one has answered.
  const [provider, setProvider] = useState<PlaceSource | null>(null);
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
    if (offline) {
      setState({ status: 'error', kind: 'offline' });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setState({ status: 'loading' });
        searchPlacesDetailed(
          { query, osmTag: chipDef?.osmTag, categories: chipDef?.categories, me: meRef.current },
          controller.signal,
        )
          .then((out) => {
            if (controller.signal.aborted) return;
            setProvider(out.provider);
            setState({ status: 'results', places: out.places, provider: out.provider, radiusM: out.radiusM });
          })
          .catch((e) => {
            if (!controller.signal.aborted) setState({ status: 'error', kind: searchErrorKind(e, false) });
          });
      },
      chipDef ? 0 : SEARCH_DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, chip, attempt, offline]);

  const changeText = useCallback((v: string) => {
    setChip(null); // typing replaces a chip search
    setText(v);
  }, []);
  const pickChip = useCallback((key: SearchChip['key'] | null) => {
    setText('');
    setChip(key);
  }, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { text, setText: changeText, chip, setChip: pickChip, state, retry, provider };
}
