import { copy, fill } from '@/lib/copy';

/** Names can be 40 characters; glance zones and OS titles cannot take that. */
export const NAME_MAX_IN_ALERTS = 14;

/** First 14 characters plus an ellipsis when longer (marketing rule 1). */
export function truncateName(name: string, max = NAME_MAX_IN_ALERTS): string {
  const chars = Array.from(name.trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max).join('')}…`;
}

/** Prefilled ride name; a neutral default when the rider's name is unknown (never "'s ride"). */
export function defaultRideName(first: string): string {
  const f = first.trim();
  return f ? fill(copy['newRide.defaultName'], { name: f }) : copy['newRide.defaultNameUnknown'];
}

/** A ride name must contain a letter or digit ("'s ride" passes the DB btrim check; "--" must not). */
export function isValidRideName(name: string): boolean {
  return /[\p{L}\p{N}]/u.test(name.trim()) && Array.from(name.trim()).length <= 60;
}

/** Name to render for a ride: the stored name, or "Group ride" when it is blank or punctuation only ("'s ride"). */
export function displayRideName(name: string | null | undefined): string {
  return name && isValidRideName(name) ? name.trim() : copy['newRide.defaultNameUnknown'];
}

/** Splits a trailing bracketed tag off a display name: "Arun (bot)" -> { base: "Arun", tag: "bot" }. */
export function splitNameTag(name: string): { base: string; tag: string | null } {
  const m = name.match(/^(.*?)\s*[([]([^)\]]*)[)\]]\s*$/);
  if (!m || !m[1].trim()) return { base: name, tag: null };
  return { base: m[1].trim(), tag: m[2].trim() || null };
}

/** Placeholder to pass as `{name}` when a sentence is rendered as pre + name + tag + post. */
export const NAME_MARK = '\u0001';

/** Splits a sentence filled with NAME_MARK at the name, so the "(bot)" tag can be styled apart from the name. */
export function splitAroundName(
  filled: string,
  name: string,
): { pre: string; base: string; tag: string | null; post: string } {
  const { base, tag } = splitNameTag(name);
  const i = filled.indexOf(NAME_MARK);
  if (i === -1) return { pre: filled, base: '', tag: null, post: '' };
  return { pre: filled.slice(0, i), base, tag, post: filled.slice(i + 1) };
}

/** First word of the name, for banners, rows and takeover titles. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** Two words or more: first letters of the first two. One word: its first two letters. Uppercase. */
export function initialsOf(name: string): string {
  // Bracketed suffixes ("Arun (bot)") are not part of the name. If nothing is left, fall back to the raw text.
  const stripped = name.replace(/\s*[([].*?[)\]]\s*/g, ' ').trim();
  // Only letters/digits count (Unicode-aware, combining marks stay with their base); words of pure punctuation or emoji are skipped.
  const words = (stripped || name)
    .split(/\s+/)
    .map((w) => Array.from(w.match(/[\p{L}\p{N}]\p{M}*/gu) ?? []))
    .filter((chars) => chars.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).join('').toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
