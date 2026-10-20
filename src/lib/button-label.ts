// What a button says (docs/design/26 E1): a loading button keeps its words, so it never goes silent. Pure.

/** The visible text: the loading label while loading (default: the label itself). */
export function buttonText(o: { label: string; loading?: boolean; loadingLabel?: string }): string {
  return o.loading ? (o.loadingLabel ?? o.label) : o.label;
}

/** The screen-reader label: while loading it is the loading text; otherwise the explicit one, else the label. */
export function buttonA11yLabel(o: { label: string; loading?: boolean; loadingLabel?: string; accessibilityLabel?: string }): string {
  return o.loading ? buttonText(o) : (o.accessibilityLabel ?? o.label);
}
