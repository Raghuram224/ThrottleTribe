import { useCallback, useEffect, useRef, useState } from 'react';

import type { LatLng } from '@/lib/geo';
import {
  searchErrorKind,
  searchGate,
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

/** How long a chip waits for the first fix before saying it is still looking. */
export const LOCATING_SLOW_MS = 15_000;

export type PlaceSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** A chip is chosen and the first fix is not in yet: it runs the moment it arrives (never worldwide). */
  | { status: 'locating' }
  /** A chip is chosen and location cannot be found without the rider (denied, off): the chip says so. */
  | { status: 'needsLocation' }
  /** `provider` credits who answered; `radiusM` is the chip caption's 5 or 25 km (null for typed search). */
  | { status: 'results'; places: Place[]; provider: PlaceSource; radiusM: number | null }
  /** `offline`: "Search needs a connection"; `busy`: a provider said 429 / quota; `slow`: online, but nothing answered in time. */
  | { status: 'error'; kind: SearchErrorKind };

/**
 * Debounced place search. Typed text needs 3+ characters and waits 400 ms; a chip searches at once, but only with
 * a position (it waits for the first fix: `locating`), and typed text may run without one.
 * Every new input aborts the request in flight. `retry()` repeats the last search.
 */
export function usePlaceSearch(
  me: LatLng | null,
  initial: { text?: string; chip?: SearchChip['key'] | null } = {},
  /** The phone has no network: no request at all, the error state says so (24 §2.5). */
  offline = false,
  /** Location can still arrive by itself (granted or not asked, services on); false = the rider has to act. */
  canLocate = true,
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
  // What the effect below depends on, not the position itself: moving, or the first fix arriving, must not re-run a
  // typed search, and a chip re-runs only when it goes from waiting to running.
  const gate = searchGate({ chip: !!chip, hasMe: me !== null, canLocate });

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
    if (gate !== 'run') {
      setState({ status: gate });
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
  }, [text, chip, attempt, offline, gate]);

  // A chip that has waited this long for a fix says so (it stays gated: no worldwide fallback).
  const [slowFor, setSlowFor] = useState<SearchChip['key'] | null>(null);
  const waiting = state.status === 'locating';
  useEffect(() => {
    if (!waiting || !chip) return;
    const timer = setTimeout(() => setSlowFor(chip), LOCATING_SLOW_MS);
    return () => {
      clearTimeout(timer);
      setSlowFor(null);
    };
  }, [waiting, chip]);
  const stillLocating = waiting && slowFor === chip;

  const changeText = useCallback((v: string) => {
    setChip(null); // typing replaces a chip search
    setText(v);
  }, []);
  const pickChip = useCallback((key: SearchChip['key'] | null) => {
    setText('');
    setChip(key);
  }, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { text, setText: changeText, chip, setChip: pickChip, state, retry, provider, stillLocating };
}
