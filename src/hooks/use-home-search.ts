import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

import type { LocationPerm, PlanFix } from '@/hooks/use-planning-position';
import { usePlaceSearch } from '@/hooks/use-place-search';
import { useSettleTimeout, useTypingLockJudged } from '@/hooks/use-typing-lock';
import type { LatLng } from '@/lib/geo';
import type { PlanMode, SearchStage } from '@/lib/plan-flow';
import { canLocateAlone, SEARCH_MIN_CHARS, searchPosition, type Place, type SearchChip } from '@/lib/place-search';
import { track } from '@/lib/telemetry';
import { shouldFocusSearch } from '@/lib/typing-lock';
import { usePlanStore } from '@/store/plan-store';
import { readFreshOrigin } from '@/store/nav-store';

const NO_PLACES: Place[] = [];

interface UseHomeSearchInput {
  mode: PlanMode;
  stage: SearchStage;
  fix: PlanFix | null;
  perm: LocationPerm;
  servicesEnabled: boolean | null;
  offline: boolean;
  /**
   * The search is the live ride's stop search (28 §8): a picked place (a result, a pin, a recent) goes here, to the
   * propose-stop flow, instead of opening Home's place sheet. Left out = Home's own search.
   */
  pick?: ((place: Place) => void) | null;
}

/**
 * The state of Home's inline search (28), held by Home itself so it survives a place sheet and Back: the text, the chip
 * and the results are still there when Back returns from a place to the results. The place search hook, the
 * Where to? focus rules (typing lock, wait for a live fix, latched decision) and the stage changes (typing -> results on
 * a chip, the keyboard's search key, or the keyboard closing with results) live here so home.tsx only draws.
 *
 * Seeded from the plan store (`searchSeed`) in the render that sees a new one, and cleared once Home is back in browse:
 * both are "adjusting state while rendering", never an effect.
 */
export function useHomeSearch({ mode, stage, fix, perm, servicesEnabled, offline, pick = null }: UseHomeSearchInput) {
  // Home's position, if it is fresh (2 min, the route start's rule): a chip lists what is near, and the first fix may not be in.
  const [seed0] = useState(() => readFreshOrigin());
  const me: LatLng | null = useMemo(() => searchPosition(fix ? { lat: fix.lat, lng: fix.lng } : null, seed0), [fix, seed0]);
  // A chip can wait for the first fix only while one can still come without the rider doing something.
  const canLocate = canLocateAlone(perm.status, servicesEnabled);
  const search = usePlaceSearch(me, {}, offline, canLocate);
  const { setText, setChip, text, chip, state } = search;

  const seed = usePlanStore((s) => s.searchSeed);
  // Starts at 0, not at the store's nonce: a hand-off from the old /where-to route may have opened the search just before
  // Home mounted, and a Home that remounts in search mode must seed its (empty) hook again.
  const [appliedNonce, setAppliedNonce] = useState(0);
  // The keyboard decision is made once per open, when the answer is in (a later unlock at a light must not pop it up).
  const [focusLatched, setFocusLatched] = useState<boolean | null>(null);
  if (seed.nonce !== appliedNonce) {
    setAppliedNonce(seed.nonce);
    // A seed from an earlier search (Home mounting in browse) is not replayed.
    if (mode === 'search') {
      setFocusLatched(null);
      if (seed.chip) setChip(seed.chip);
      else setText(seed.q);
    }
  }
  if (mode === 'browse' && (text !== '' || chip !== null)) setChip(null);

  const { locked, judgedAt } = useTypingLockJudged(fix?.speedMps ?? null, fix?.t ?? null);
  // The keyboard waits until the lock has been judged against a live fix: the last-known answer has no speed, so focusing
  // on it would flash the keyboard up and down for a rider at speed (22 §3.2). Capped, so a still rider still gets it.
  const locationKnown = perm.status === 'granted' || perm.status === 'unknown';
  const timedOut = useSettleTimeout(perm.status === 'granted' && mode === 'search', seed.nonce);
  const settled = (!!fix?.live && judgedAt === fix.t) || timedOut;
  if (mode === 'search' && focusLatched === null && (!locationKnown || settled)) {
    setFocusLatched(shouldFocusSearch({ wantsFocus: seed.wantsFocus, locked, locationKnown, settled }));
  }
  // Back from a place shows results with the keyboard down, whatever was decided when search opened.
  const autoFocus = focusLatched === true && stage === 'typing';

  const places = useMemo<Place[]>(() => (state.status === 'results' ? state.places : NO_PLACES), [state]);
  const hasResults = places.length > 0;

  // The keyboard closing while typing with results on screen = "show me the results" (pins and the list).
  const hasResultsRef = useRef(false);
  useEffect(() => {
    hasResultsRef.current = hasResults;
  }, [hasResults]);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      const st = usePlanStore.getState();
      if (st.mode === 'search' && st.searchStage === 'typing' && hasResultsRef.current) st.setSearchStage('results');
    });
    return () => sub.remove();
  }, []);

  const setStage = useCallback((next: SearchStage) => usePlanStore.getState().setSearchStage(next), []);

  const onChangeText = useCallback(
    (v: string) => {
      setText(v);
      setStage('typing');
    },
    [setText, setStage],
  );
  const onFocus = useCallback(() => setStage('typing'), [setStage]);
  const onSubmit = useCallback(() => {
    Keyboard.dismiss();
    if (Array.from(text.trim()).length >= SEARCH_MIN_CHARS) setStage('results');
  }, [text, setStage]);
  const onClear = useCallback(() => {
    setText('');
    setStage('typing');
  }, [setText, setStage]);
  const onChip = useCallback(
    (key: SearchChip['key']) => {
      Keyboard.dismiss();
      if (key === chip) {
        // The chosen chip again: off, back to typing.
        setChip(null);
        setStage('typing');
      } else {
        setChip(key);
        setStage('results');
      }
    },
    [chip, setChip, setStage],
  );
  const onPick = useCallback(
    (place: Place, typed: string) => {
      // The place panel must not sit under the keyboard.
      Keyboard.dismiss();
      if (pick) return pick(place);
      track('home.place_opened', { from: 'search' });
      usePlanStore.getState().openPlace(place, typed);
    },
    [pick],
  );
  const onPickRecent = useCallback(
    (place: Place) => {
      Keyboard.dismiss();
      if (pick) return pick(place);
      track('home.place_opened', { from: 'recent' });
      usePlanStore.getState().openRoute(place, 'recent');
    },
    [pick],
  );
  const onPinPress = useCallback(
    (id: string) => {
      const place = places.find((p) => p.id === id);
      if (place) onPick(place, text.trim());
    },
    [places, onPick, text],
  );

  return {
    search,
    me,
    canLocate,
    locked,
    autoFocus,
    places,
    hasResults,
    onChangeText,
    onFocus,
    onSubmit,
    onClear,
    onChip,
    onPick,
    onPickRecent,
    onPinPress,
  };
}
