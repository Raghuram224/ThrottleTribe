# QA round 3 — signed release build after pro-polish (emulator, bot ride 004842)

Screens in this folder (01–19). Overall: big step up — Inter, grouped surfaces, tint chips, brand mark,
summary and lobby look professional. Remaining issues, in priority order:

## P0
1. **End ride: screen swaps under the sheet** (17/18). After confirming "End ride", the summary renders
   *behind* the still-open confirm sheet (spinner in the red button, summary skeleton showing "—" tiles).
   Close the sheet first (or navigate only after the sheet's close animation), and show a proper summary
   loading state rather than "—" tiles.
2. **Offline row truncates the distance** (12): "≈1.3 km be…" — the wide "No signal · 1 min" chip squeezes
   the distance column. Distance + direction must never truncate: shrink/wrap the chip (e.g. chip shows
   "No signal" and the age moves under the name, or chip goes icon+age only) — distance wins.
3. **Banner distance disagrees with the row** (12): banner "Priya · no signal · 1.1 km behind" while the row
   says "≈1.3 km". The banner text is frozen at alert time. Either compute it live from the same
   `phraseFor` as the row, or drop the distance from the banner.

## P1
4. **Map markers** (11, 12): cluster = black disc + green ring + white count badge, rider = avatar with
   ring, me = orange dot with arrow — three unrelated styles. Restyle per 14-pro-polish §map: rider markers
   = avatar circle with white 3 px stroke + e2 shadow, status ring only for stopped/offline/SOS (no green
   ring for moving); cluster = brand-ink circle with white count, same size family; "me" = brand
   leader-arrow (assets/brand) with heading rotation if available, else orange dot with white stroke.
5. **"(bot)" suffix still raw** in SOS takeover headline ("Karthik (bot) needs help") and summary event rows
   ("Arun (bot) · 6:45 PM"). Use the same display-name split as rider rows (name + muted suffix), and in
   the takeover headline use the name without the suffix.
6. **SOS takeover bottom half is empty** (13/14): content is top-heavy with ~40% empty red below. Keep
   Dismiss at the bottom, but vertically distribute: either larger contact rows (64 dp) or move the
   lock note + Dismiss block up with flexible spacing. Don't add decoration.

## Fine / no change
- Ahead/behind changes across SOS shots are real movement (viewer passes a stopped rider).
- Contacts skeleton row while loading is good; 112 row highlighted as fallback is good.
