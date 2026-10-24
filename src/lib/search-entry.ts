// How a search is entered on the map home (docs/design/28): from the top bar / the Search button (focus the input), from
// a chip (its results, no keyboard) or "search again" (the text that found a place). The old `/where-to` route params
// map onto the same thing. Pure, no React.
import { SEARCH_CHIPS, type SearchChip } from '@/lib/place-search';

export type SearchChipKey = SearchChip['key'];

export interface SearchEntry {
  /** Text to search for (empty with a chip, or when only the input is opened). */
  q: string;
  chip: SearchChipKey | null;
  /** The input should take the keyboard (still subject to the typing lock). */
  wantsFocus: boolean;
}

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

export const isChipKey = (v: unknown): v is SearchChipKey => SEARCH_CHIPS.some((c) => c.key === v);

/**
 * Route params (`q`, `chip`, `focus`) as an entry. A chip beats text (as `whereToHref` writes them); text wants
 * the keyboard (the where-to rule: `focus=1` or a non-empty `q`); an unknown chip is ignored.
 */
export function parseSearchEntry(params: { q?: string | string[]; chip?: string | string[]; focus?: string | string[] }): SearchEntry {
  const chipParam = one(params.chip);
  const chip = isChipKey(chipParam) ? chipParam : null;
  const q = chip ? '' : one(params.q);
  return { q, chip, wantsFocus: !chip && (one(params.focus) === '1' || q !== '') };
}
