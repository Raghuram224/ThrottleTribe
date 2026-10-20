# 26 — UI polish: the map flow, end to end

Source: user request 2026-10-20, *"use those skills to improve the UI and UX"*. This is a **polish pass**, not a redesign:
the visual system of 00, 13, 14, 16, 17, 20–25 stays. It fixes defects, drift and rough edges on the path
**Home map → Where to → route preview → live ride (light / dark) → ⋯ menu → End ride → summary.**

Builds on 00 §2.3–2.8, 08, 16 §4, 20, 21, 22, 24 §4, 25. Respects 25 (map type button, terrain, map detail): nothing here
touches it.

## Method and limits (read first)
- **Skills used as the method:** `ui-taste` polish (triage order, drift classes, contrast on the real background, states,
  motion), craft (hierarchy, type scale, spacing, depth, loading states), distill (one fact one place), native audit
  (evidence, P1–P3). `ios-design` for safe areas, sheets and Dynamic Type; on Android, Material norms win (48 dp minimum,
  system Back, edge-to-edge), as the native audit says.
- **No image generation tool and no Uizze MCP were available.** No reference screens were consulted and no target image
  exists. The constraint is the incumbent: the screenshots below plus the established tokens. **No 1:1 claim** is made.
- **Evidence:** Android emulator screenshots, 1080×2400 px at 420 dpi = **411×914 dp**, default font scale, Tribe style:
  `a1` Home (spec 25 build), `s10` Home (before 25), `s11`/`s12` Where to, Fuel chip, error, `s13` route preview, `s14` live
  light, `s15` live dark, `s5` live ⋯ menu, `s7` End ride confirm loading + Reconnecting banner, `s16` summary, `s1`/`s2` an
  old restored ride. Measurements below are in dp (screenshot px ÷ 2.625). The grey gear circle is the Expo dev-client
  button: ignored.
- **Not seen in a screenshot** (source only, marked "source"): dark summary, dark search, dark route preview, group live
  rows, 1.3× font, 360 dp width. The acceptance checklist (§9) covers them.
- **Code read:** `src/theme/tokens.ts`, `theme/use-theme.ts`, `components/{screen, sheet, confirm-sheet, sheet-action,
  big-button, banner, ride-header, nav-banner, stop-card, live-rows, home-sheet, home-search-bar, quick-tiles,
  recent-places-section, place-search-view, route-panel, credit-row, motion-presets}.tsx`, `hooks/use-after-modal.ts`,
  `app/(app)/home.tsx`, `app/(app)/ride/[id]/{_layout, live, summary}.tsx`, `lib/copy.ts`, specs 00, 20 (§0–1), 24.

**Already being fixed by the engineer, not re-specified here:** search timeout vs offline copy; Home sheet a11y labels;
collapsed sheet hidden from a11y; Android Back on summary; "Finding you…" pill contrast and stuck state; stranded credit
pill; stale "Getting directions" banner; map a11y label; emoji chip icons → icon font; destination pin covering its label;
search credit naming the answering provider; status-bar scrim on map screens.

---

## Decisions in this spec (designer; the three marked ★ need the user, §11)

| # | Question | Decision |
|---|---|---|
| U1 | "Reconnecting to the ride…" is amber | **Grey** (`offline` tone). Amber means *stopped*; a connection problem is *no data* (rule 2, 00 §2.4) |
| U2 | Header pill says "Offline" while the banner says "Reconnecting" | Pill says **"Connecting"** whenever the phone itself has network; "Offline" only when it has none |
| U3 | End ride shows a bare spinner | **Every loading button keeps a label**: spinner + "Ending ride…". Fixed once in `BigButton` |
| U4 | Menu sheet feels slow | The Modal stops sliding the whole window (scrim included); **scrim fades, panel rises 24 dp in 200 ms** |
| U5 | Route preview ETA block | **Duration alone on line 1** (28 bold); distance and arrive time together on line 2 (16 regular) |
| U6 | "Kallakuruchi / Kallakkurichi" | A secondary line that only repeats the name (any spelling) is **not shown** |
| U7 | Summary "0 m" | Under 50 m the stat reads **"< 50 m"**, no count-up, no average |
| U8 | Summary empty band | The content sheet **reaches the footer**; the map grows to 40 % of the window (300–400 dp) |
| U9 | Status / navigation bar bands | Painted the colour of the bar they touch (header, action bar, footer) in both themes |
| U10 ★ | Orange credit links next to the orange Start ride | Links in **`textMuted`** with the ↗ icon (accent is for the primary only). Changes 24 §4.3 |
| U11 ★ | "Share code" and "Invite riders" both in the ⋯ menu | **Remove "Share code"** from the live menu; the invite screen's *Share link* does it |
| U12 | Header hierarchy while navigating | **Unchanged** (see §8): the banner is already the loudest element; the header is quiet by design (20 C2) |

---

## 0. Summary

**Purpose:** the same screens, with no misleading state, no silent waits and no visual drift, so a gloved rider gets the
right fact at a glance and a resting rider gets a calm, finished screen.

**One-second glance (unchanged, 20 / 21):** 1. anyone in trouble → 2. where each rider is → 3. next turn / distance to
the stop. Polish rule for this pass: **a status colour means one thing everywhere; a button never goes silent; a
repeated fact is shown once.**

Top changes by rider impact:

| # | Screen | Change | P |
|---|---|---|---|
| 1 | Live / ride layout | Reconnecting banner grey, not amber (§3 L1) | P1 |
| 2 | Live header | Pill and banner say the same thing (§3 L2) | P1 |
| 3 | All sheets / panels | Loading buttons show spinner + words (§4 E1) | P1 |
| 4 | Live, summary | Status-bar and nav-bar bands match their bars (§3 L3) | P2 |
| 5 | All sheets | Faster, calmer sheet motion (§4 E2) | P2 |
| 6 | ⋯ menu | Even row rhythm, 72 dp shorter sheet (§4 E3) | P2 |
| 7 | Route preview | ETA block hierarchy (§2 R1) | P2 |
| 8 | Home, search, preview | No name-repeating address line (§1 H1) | P2 |
| 9 | Summary | "< 50 m", sheet to the footer, bigger map, 56 dp map buttons (§5) | P2 |
| 10 | Preview, search | Quiet credit links (§2 R2) ★ | P3 |
| 11–18 | various | Tile shape, last-row divider, footer alignment, off-scale type, token and copy drift, menu distill | P3 |

---

## 1. Home map and sheet (`home.tsx`, `home-sheet.tsx`, `recent-places-section.tsx`, `place-search-view.tsx`)

The Home composition (bar, chips, sheet with greeting, tiles, recents) is right and stays. Two defects.

### H1 — A secondary line that repeats the name (P2) · local defect, shared fix
- **Evidence:** `a1`, `s10` recent row "Kallakuruchi / Kallakkurichi"; `s13` route panel "Kallakuruchi / Kallakkurichi".
  Source: `PlaceRow` prints `address` verbatim (`place-search-view.tsx:265–269`); `RoutePanel` too (`route-panel.tsx:163–167`).
  For a town, Photon / Geoapify return the town as both name and city, often spelled differently.
- **Why it matters:** the second line is where the rider tells two places apart ("which Indian Oil?"). A line that says the
  name again looks like a bug and costs a 14 dp line of glance space in the 64 dp row.
- **Change:** new pure helper in `src/lib/place-search.ts`:
  ```ts
  /** The address without parts that only repeat the place name (any spelling). '' = no second line. */
  export function distinctAddress(name: string, address: string): string
  ```
  Split `address` on `,`; trim each part; **drop a part** when `norm(part) === norm(name)` or
  `levenshtein(norm(part), norm(name)) <= max(1, floor(0.2 × min(len)))`; join the rest with `", "`.
  `norm` = lower-case, strip diacritics (NFKD), keep `a–z0–9`, collapse runs of the same character (`kk` → `k`).
  Tests: `('Kallakuruchi','Kallakkurichi') → ''` · `('Bengaluru','Bengaluru') → ''` ·
  `('Mysuru Palace','Sayyaji Rao Rd, Mysuru') → 'Sayyaji Rao Rd, Mysuru'` · `('HP Petrol Pump','Hosur Rd, Bengaluru') →
  unchanged` · `('Hosur','Hosur, Krishnagiri') → 'Krishnagiri'`.
- **Where it applies:** `PlaceRow` (search results, Where-to recents, Home peek recents, in-ride search), `PlacePanel`,
  `RoutePanel`. Also the row a11y label (`placeRowA11y`) uses the same result, so TalkBack never reads the town twice.
  Empty result: the row is name-only, still 64 dp tall, name vertically centred. Stored recents are not rewritten.

### H2 — Hairline under the last row of the peek (P3) · local defect
- **Evidence:** `a1` and `s10`: a full-width hairline under the single recent row, 24 dp above the gesture bar, reads as a
  stray edge. Source: `PlaceRow` always draws `borderBottomWidth` (`place-search-view.tsx:253, 310`).
- **Change:** `PlaceRow` gains `divider?: boolean` (default true). `RecentPlacesSection` passes `divider={false}` to the last
  shown row; search result lists pass it to their last row too.

Not changed on Home: greeting header, tiles, chip set, search bar. The "Finding you…" pill is being fixed (above).

---

## 2. Where to and route preview (`place-search-view.tsx`, `route-panel.tsx`, `credit-row.tsx`)

### R1 — ETA block hierarchy (P2) · conceptual mismatch within the panel
- **Evidence:** `s13`: line 1 "3 h 50 min · 261 km" mixes 28 bold and 20 semibold centre-aligned (`route-panel.tsx:137–147`,
  `line1: alignItems 'center'` at :272), so the two baselines sit about 4 dp apart and the "·" floats. Below it four lines of
  nearly equal weight: name 16 semibold, address 14 muted (H1 duplicate), "Arrive about 11:47 PM" 14 muted, the car note
  14 muted. The arrive time, a planning fact, is the faintest line in the block. At 1.3× and 360 dp the distance span is
  the one that shrinks and truncates (`styles.shrink`): "· 261 k…".
- **Why it matters:** at rest the rider decides "can I make it before dark?": duration and arrival are the two facts.
  Rule 6: the most important fact is the largest; numbers are tabular.
- **Change** (tokens only, nothing new):
  ```
  ├────────────────────────────────────────┤ RoutePanel (radius 24, padding 16, unchanged)
  │ 3 h 50 min                             │ L1  28/32 bold `text`, tabular, 1 line           ← the glance
  │ 261 km · Arrive about 11:47 PM         │ L2  16/24 regular `text`, tabular, up to 2 lines
  │                                        │     12 (space.md) between the trip group and the place group
  │ Kallakuruchi                           │ L3  16/22 semibold `text`, 1 line
  │ Hosur Rd, Bengaluru                    │ L4  14/20 regular `textMuted`, 1 line (H1: hidden when it repeats L3)
  │ (i) Route for cars — may use express-  │     note row unchanged (14/20 `textMuted`, icon 16)
  │     ways that ban two-wheelers.        │
  │────────────────────────────────────────│ hairline `border`
  │  Routes: OSRM ↗      © OpenStreetMap ↗ │ CreditRow 56 (R2)
  │ [ >            Start ride            ] │ 60 primary (prominent), unchanged
  │ [ +          Invite riders           ] │ 56 secondary, unchanged
  └────────────────────────────────────────┘
  ```
  - L2 copy `preview.tripLine` "{km} · Arrive about {time}". The time is `formatClockTime` as today.
  - States: **loading / updating** L1 skeleton 28 × 160, L2 skeleton 16 × 200 (radius `radius.sm`), L3–L4 shown.
    **No road route** (`no_route`, `failed`, `rate_limited`, distance known): L1 `stop.cardDistanceApprox` "≈ 202 km",
    no L2. **Locating:** L1 = place name 20 semibold (as today), no L2, L3 hidden (today's rule). **Offline:** unchanged
    (note `preview.offline`, actions disabled).
  - The group a11y label gains the arrive time: `preview.a11ySummaryArrive` "{duration}, {distance} to {name}. Arrive
    about {time}." (`preview.a11ySummary` stays for the no-route case).
- Remove the `distance` / `keep` / `shrink` spans in `line1`; L2 is one `Text` (no truncation: `numberOfLines={2}`).

### R2 ★ — Credit links compete with the primary (P3) · system drift (changes 24 §4.3)
- **Evidence:** `s13`: "Routes: OSRM ↗  © OpenStreetMap ↗" in `brandOnBg` orange sits 40 dp above the orange Start ride; on
  `s11`/`s12` the two orange links are the most saturated thing on the search screen. Source `credit-row.tsx:46, 49`.
- **Why it matters:** one primary per screen (rule 4); the accent should say "this is the action". Credits are tertiary.
- **Change:** label and ↗ icon in `textMuted` (12/16 regular, unchanged size). Contrast on `surfaceRaised` / `bg`:
  Tribe light 7.6 / 7.0:1, Tribe dark ≈ 10 / 11:1, Maps light ≈ 6.2 / 5.9:1, Maps dark ≈ 8.4 / 9.3:1 (all ≥ 4.5). The ↗ icon
  is the link cue; pressed fill (`surfacePressed`), 56 × 56 targets, role `link`, a11y label: unchanged. Inert (typing
  locked) stays plain `textMuted` text with no icon.
- **Needs the user** because LocationIQ asks for a "prominent" link (24 §13.3): grey with ↗ is still visible and tappable,
  but it is less prominent than orange. If the user says no, keep orange and skip R2.

Not changed on Where to: input row, chip row (selected = tint + 2 dp border + check, already colour + icon + text), the
error block (`s12`: icon + words + Try again is correct; copy is being fixed by the engineer).

---

## 3. Live ride, light and dark (`ride/[id]/_layout.tsx`, `ride-header.tsx`, `banner.tsx`, `screen.tsx`, `live.tsx`)

### L1 — "Reconnecting to the ride…" is amber (P1) · rule violation
- **Evidence:** `s7`: the banner under the header is amber (dimmed to brown by the sheet scrim), directly above the blue
  turn banner. Source: `_layout.tsx:540` `tone="warning"`; `banner.tsx:133–136` maps `warning` → `statusColors('stopped')`
  = `#F59E0B`.
- **Why it matters:** rule 2, "no data is not the same as stopped". Amber is the colour a rider has learned for *a rider
  stopped*. A connection problem is grey everywhere else (header pill, offline banner, offline rows, 00 §2.4, 21's grey
  banner). Amber next to the blue banner also reads as an alarm ladder that does not exist.
- **Change:** `<Banner key="reconnecting" tone="offline" icon="connecting" text={copy['banner.reconnecting']} />`.
  Grey `status.offline` `#9CA3AF`, text `onStatus.offline` `#111827` (7.0:1), both schemes. Not closable, polite live
  region (unchanged). `warning` (amber) stays for *my* location problems: not sharing, GPS off, sharing stops when locked.

### L2 — Header pill and banner disagree (P1) · misleading state
- **Evidence:** `s7`: header pill "Offline" + banner "Reconnecting to the ride…" at the same moment. Source: the banner
  checks `netOffline` (`_layout.tsx:531`); `ConnectionPill` does not (`ride-header.tsx:70`), so any `connection ===
  'offline'` says "Offline".
- **Why it matters:** "Offline" tells the rider *their phone* has no signal (check the SIM, move); "Reconnecting" tells them
  the app is working on it. Two answers to one question make both untrustworthy.
- **Change:** `RideHeader` gets `netOffline: boolean` (the layout already has it). Pill:
  | connection | netOffline | Pill icon | Pill text | Banner |
  |---|---|---|---|---|
  | `live` | — | none (search icon shows) | — | none |
  | `connecting` | — | `connecting` | `live.connConnecting` "Connecting" | none |
  | `offline` | false | `connecting` | "Connecting" | `banner.reconnecting` (grey, L1) |
  | `offline` | true | `offline` | `live.connOffline` "Offline" | `banner.offline` / `banner.offlineSolo` (grey) |
  Pill anatomy unchanged (32 visual, `status.offline` fill, 14 semibold). At 360 dp, 1.3×: pill ≈ 131 dp, title column
  ≈ 117 dp: the ride name truncates with an ellipsis (as today), the pill never does.
  ```
  │ ‹  Raghu's ride          ( ⟳ Connecting )  ⋯ │ RideHeader 60
  │    Just started                              │
  ├──────────────────────────────────────────────┤
  │ ⟳  Reconnecting to the ride…                 │ Banner 56, grey (was amber)
  ├──────────────────────────────────────────────┤
  │ ↰   50 m                                     │ turn banner 96, unchanged
  │     Turn left onto Kasturba Road             │
  ```

### L3 — Status-bar and navigation-bar bands do not match their bars (P2) · missing system rule
- **Evidence:** `s14` light: a `bg` `#F5F6F8` band (0–24 dp) above the white header and a `bg` band (890–914 dp) under the
  white action bar; `s15` dark: `#0B0F14` bands against `#161B22` header and bar; `s16`: the same band under the white
  footer. Source: `Screen` paints the whole safe area `colors.bg` (`screen.tsx:57–59`) while the header, the live action
  bar and the summary footer are `surfaceRaised` (`ride-header.tsx:26`, `live.tsx:708`, `summary.tsx:309`).
- **Why it matters:** the seam makes the header and the SOS bar look detached and a few dp shorter than they are; at night
  the brighter bar edge against the black band draws the eye to the bottom edge instead of the SOS label.
- **Change:** `Screen` gets `insetTopColor?: string` and `insetBottomColor?: string` (default `backgroundColor ?? bg`). When
  set, the top / bottom safe-area insets are painted that colour (e.g. `SafeAreaView edges={['left','right']}` plus inset
  views of `insets.top` / `insets.bottom`; engineer's choice). Ride layout passes:
  | Child / mode | Top inset | Bottom inset |
  |---|---|---|
  | lobby, live (header shown, not full map) | `surfaceRaised` | live: `surfaceRaised` (action bar); lobby: `bg` unless its footer is `surfaceRaised` (check) |
  | summary | `bg` (map bleeds under it with `ScrimTop`, unchanged) | `surfaceRaised` (footer) |
  | full map (edge-to-edge) | unchanged (none) | unchanged (none) |
  Android edge-to-edge: the gesture handle and status-bar icons must stay visible on `surfaceRaised` in both schemes
  (`StatusBar style="auto"` already follows the scheme; verify the nav-bar button style).

### L4 — Info tiles in the live sheet have two shapes (P3) · one-off implementation
- **Evidence:** `s14`/`s15`: the stop card tile is a 40 dp circle (`stop-card.tsx:102`), the Invite riders tile right under
  it a 40 dp rounded square (`live-rows.tsx:407`, `radius.md`). Same row anatomy (20 C6), two shapes, 64 dp apart.
- **Change:** `live-rows.tsx` `styles.tile.borderRadius` → `INFO_TILE / 2` (circle) for `SoloInviteRow` and
  `LoadErrorRow`. Colours unchanged.

### L5 — Token and copy drift in the header (P3) · missing token / local defect
- `tokens.ts:525` says `size.header: 64`; `ride-header.tsx:87` is 60 (20's wireframes say 60). Set the token to **60** and
  use it in `RideHeader` (`live-chrome` maths that read 60 must read the token).
- `ride-header.tsx:59` hard-codes `accessibilityLabel="Ride menu"`: move to `copy['live.menuA11y']` "Ride menu".

---

## 4. ⋯ menu and End ride (`sheet.tsx`, `sheet-action.tsx`, `confirm-sheet.tsx`, `big-button.tsx`)

### E1 — A loading button goes silent (P1) · missing state, fixed at the component
- **Evidence:** `s7`: the red End ride button shows only a spinner; "Keep riding" greys out; nothing says what is
  happening. Source: `BigButton` swaps its whole content for `ActivityIndicator` when `loading` (`big-button.tsx:91–92`). The
  same hides labels the code already supplies: Route preview passes "Starting…" / "Inviting…" (`route-panel.tsx:237, 247`)
  that can never be seen.
- **Why it matters:** End ride is irreversible and can take seconds on a weak signal. A bare spinner on a red button is the
  moment a stressed rider taps again or backs out. Craft: "loading explains progress".
- **Change (BigButton):** `loading` keeps the layout: spinner (`ActivityIndicator size="small"`, 20 dp) in the icon slot,
  then `loadingLabel ?? label`, in the variant's normal `fg`, on the variant's normal `bg` (primary stays orange, danger
  stays `sosStrong`; not dimmed). Width and height do not change. `accessibilityState={{ busy: true, disabled: true }}`,
  `accessibilityLabel` = the loading label. New prop `loadingLabel?: string`.
- **ConfirmSheet** gets `loadingLabel?: string`, passed to the confirm button. When `loading` turns true, announce it once
  (`AccessibilityInfo.announceForAccessibility(loadingLabel)`). The Cancel button stays disabled while loading (exists);
  scrim tap and Back stay blocked (exists, `!working`).
- Ride layout passes: End (live) `live.ending` "Ending ride…"; Cancel ride (lobby) `lobby.cancelling` "Cancelling ride…";
  Leave `live.leaving` "Leaving…"; Remove stop `stop.clearing` "Removing stop…"; Stop directions `nav.stopping` "Stopping
  directions…". Route preview keeps passing its own labels as `label` (works once BigButton shows text).
  ```
  │ End your ride?                                   │ heading 20
  │ Location sharing stops and you'll see your ride  │ body 16 muted
  │ summary.                                         │
  │ [  ◌  Ending ride…                             ] │ danger 56, spinner + words, still red
  │ [            Keep riding (disabled)            ] │ secondary 56, textSubtle
  ```

### E2 — The sheet animation feels slow (P2) · motion defect
- **Evidence:** `s5` (menu, ≈ 454 dp tall) and every `Sheet`. Source: `Modal animationType="slide"` (`sheet.tsx:31`): on
  Android the **whole Modal window slides up from the bottom of the screen, scrim included**, over about 300 ms
  (`use-after-modal.ts:3`). The first row only becomes visible after the window has travelled most of the 914 dp height, and
  the dark scrim arrives as a sliding block instead of dimming the map.
- **Change:**
  - `Modal animationType="fade"` (scrim and panel fade together; Android system fade).
  - The panel gets an entering preset `panelEnter` in `motion-presets.ts`: opacity 0 → 1, `translateY` 24 → 0,
    `motion.base` **200 ms**, `Easing.out(Easing.cubic)`, `ReduceMotion.System`. No spring, no bounce.
  - Close: the Modal's fade (no separate panel exit).
  - Reduce Motion on: `animationType="none"` and the preset resolves instantly (state still changes at once).
  - `MODAL_CLOSE_MS`: re-measure the Android fade-out on the moto g64 and set it to the measured close + 100 ms, never
    below 250 (today 400). This is also the wait between tapping End ride in the menu and the confirm opening.
  - iOS: the same fade + rise (a short rise still reads as a sheet).

### E3 — Uneven row rhythm in the menu (P2) · one-off implementation
- **Evidence:** `s5`: rows sit on a 68 dp pitch (56 row + 12 `gap`); each hairline is 27 dp under its label and 40 dp above
  the next one; the pressed fill covers 56 of the 68. Source: `Sheet` panel `gap: space.md` (`sheet.tsx:66`) applies between
  `SheetAction`s, which already draw their own divider (`sheet-action.tsx:36, 42`).
- **Change:** new `SheetActionList` (a `View` with `gap: 0`) wrapping the menu's
  `SheetAction`s, so rows are 56 back to back and each divider is the exact midpoint between labels. Six rows: the menu
  gets **72 dp shorter**. Same in every sheet that lists `SheetAction`s. Row anatomy (icon 24, label 16 semibold, inset
  divider at 48) unchanged.
  ```
  │              ────                │ grabber
  │  [+] Invite riders               │ 56
  │      ─────────────────────────   │ divider at the row edge
  │  [/] Rename ride                 │ 56
  │  [x] Mute voice directions       │ 56
  │  [x] Stop directions             │ 56
  │  [F] End ride                    │ 56, `sosOnBg` (leader)
  ```

### E4 ★ (distill) — Drop "Share code" from the live menu (P3)
- **Evidence:** `s5` solo: "Invite riders" (menu) + "Share code" (menu) + the solo sheet row "Invite riders" = three ways to
  one job on one screen. The invite screen has *Share link* (`invite.shareTitle`) as a first-class action.
- **Change:** remove the `live.menuShare` `SheetAction` from the ride layout menu when `child === 'live'`. The lobby keeps
  its own Share code control (05). Telemetry `invite.shared { via: 'menu' }` stops for live (the invite screen's share
  still fires its own `via`).

---

## 5. Ride summary (`summary.tsx`)

### S1 — "0 m You rode" (P2) · misleading state
- **Evidence:** `s16`: a 1-minute ride shows "0 m" as the hero stat. Source: `Stats` renders any `distanceM !== null`
  (`summary.tsx:291–292`); GPS jitter is filtered out, so a ride that barely moved sums to 0.
- **Why it matters:** "0 m" reads as "tracking failed". The honest statement is "less than we can measure".
- **Change:** `distanceM !== null && distanceM < 50` → the distance tile shows **"< 50 m"** (parts `< 50` + unit ` m`),
  label `summary.youRode` unchanged, **no count-up**, **no Average** tile, a11y `summary.a11yUnder50` "You rode less than
  50 metres". `summaryShareMessage` gets `distanceM: null` (uses `summary.shareMessageNoKm`). `cacheRideDistance` still
  stores the real value (Home's month stats are a separate question, §10).

### S2 — Dead band under the cards (P2) · layout defect
- **Evidence:** `s16`: the content sheet ends at 702 dp with its e3 shadow edge; 108 dp of `bg` sits between it and the
  footer (810 dp), so the sheet looks like a card floating over nothing. Source: `MAP_H = 300` fixed (`summary.tsx:50`); the
  `ScrollView` content does not grow (`:229`, `body: { paddingBottom: 16 }`); the sheet is a fixed-height block with
  `elevation.e3` (`:252–260`).
- **Change:**
  - `contentContainerStyle={{ flexGrow: 1 }}`; the sheet gets `flexGrow: 1` (its `bg` reaches the footer; its bottom edge
    and shadow go under the footer and are never seen). Keep `paddingBottom: space.lg` inside the sheet.
  - Map height `summaryMapHeight(windowH) = clamp(round(0.4 × windowH), 300, 400)`: 914 → 366 dp, 780 → 312 dp. Computed
    once from `useWindowDimensions` (no change when data loads, so the route fit never jumps). Long content still scrolls.
  ```
  ┌────────────────────────────────────────┐
  │ (x)56                          (fit)56 │ map: clamp(0.4 × window, 300, 400)
  │                route                   │
  ├─────╮ sheet radius 24, overlaps 24 ╭───┤
  │ ⚑ RIDE COMPLETE                        │ label 12 `brandOnBg`
  │ Raghu's ride                           │ title 28
  │ Tue, Oct 20 · 7:57 – 7:58 PM           │ 16 muted, tabular
  │ ┌──────────────────┬─────────────────┐ │
  │ │ < 50 m           │ 1 min           │ │ S1
  │ │ You rode         │ Time            │ │
  │ └──────────────────┴─────────────────┘ │
  │ [ ride log ]                           │
  │ [ (RA) 1 rider · All finished…   v  ] │
  │                                        │ sheet `bg` continues; no floating edge
  ├────────────────────────────────────────┤
  │ [share]  [        Back to home       ] │ footer 16 / 12, bottom inset `surfaceRaised` (L3)
  └────────────────────────────────────────┘
  ```

### S3 — Map buttons are 44 dp (P2) · touch target
- **Evidence:** `summary.tsx:572` `mapBtn: 44 × 44` (close ✕ and Fit route, `s16`). Below Android's 48 dp minimum and the
  project's 56; ✕ is a way out of the screen.
- **Change:** `size.mapControl` (56), radius 28, icon 24 `fabIcon`, e2: the same circle as the live and Home map controls.
  `floatRow` top stays `insets.top + space.sm`.

### S4 — Footer misaligned with the content (P3) · spacing drift
- **Evidence:** `s16`: share button and Back to home start 12 dp from the edge; the cards above start at 16. Source:
  `footer: { padding: space.md }` (`summary.tsx:599`). The share button radius is `radius.md` (`:600`) while the BigButton
  next to it uses `traits.buttonRadius` (16 in Tribe, pill in Maps): in Maps the pair has two shapes.
- **Change:** footer `paddingHorizontal: space.lg`, `paddingTop: space.md`, `paddingBottom: space.md` (+ the painted inset,
  L3), `gap: space.md`. Share button `borderRadius: traits.buttonRadius` (56 × 56 → a circle in Maps).

### S5 — Off-scale type in the riders card (P3) · token drift
- **Evidence:** `summary.tsx:593–594` `ridersTitle 15/22`, `ridersSub 13/18`: not on the 12/14/16/20/28/36 scale.
- **Change:** title 16/22 semibold (`type.bodyStrong`), sub 14/20 regular (`type.caption`).

Not changed on the summary: eyebrow "RIDE COMPLETE" (it states the ride's state, it does not repeat the title), stat card,
ride log, riders card behaviour, map entrance (`mapEnter` / `sheetEnter`), share rules.

---

## 6. Distill: what to remove or simplify
| Remove / simplify | Why | Where |
|---|---|---|
| The address line when it only repeats the name (H1) | one fact, one place | `PlaceRow`, `PlacePanel`, `RoutePanel` |
| "Share code" in the live ⋯ menu (E4 ★) | three controls for one job | ride layout menu |
| The separate distance span on preview line 1 (R1) | two sizes on one baseline; truncates first at 1.3× | `RoutePanel` |
| Contradictory "Offline" pill next to "Reconnecting" (L2) | one state, one wording | `RideHeader` |
| 12 dp gaps between menu rows (E3) | rows already draw dividers | `Sheet` + `SheetActionList` |
| Hairline under the last list row (H2) | an edge with nothing after it | `PlaceRow` |
| The summary's floating sheet edge and shadow (S2) | a container that clarifies nothing | `summary.tsx` |
Kept on purpose: the car note on every preview (24 §3.1, legal), the solo sheet's Invite riders row (20 C4, the one visible
way to make a ride a group), voice toggle both on the map and in the menu (21 §2.10: the map column can be hidden).

---

## 7. Light and dark
| Item | Light | Dark |
|---|---|---|
| Reconnecting banner (L1) | `#9CA3AF` / `#111827`, 7.0:1 | same fill (status colours are scheme-independent, 00 §5) |
| Inset bands (L3) | `surfaceRaised` `#FFFFFF` (Tribe) / `#FFFFFF` (Maps) | `#161B22` (Tribe) / `#232427` (Maps); status-bar icons light |
| Credit links (R2 ★) | `textMuted` `#4B5563` 7.6:1 / Maps `#5F6368` 6.2:1 on `surfaceRaised` | `#C2C8D0` ≈ 10:1 / Maps `#BDC1C6` ≈ 8.4:1 on `surfaceRaised` |
| Loading button (E1) | spinner + label in `onAccent` `#111827` on orange; white on `sosStrong` | identical (danger and primary fills do not change) |
| Sheet scrim (E2) | `overlayScrim` 0.6, now fades | 0.7, now fades; the 1 px top `edge2` hairline stays |
| Summary map buttons (S3) | `fabBg` white, e2 | `fabBg` `#1F2630`, hairline edge |
Dark summary, dark search and dark preview were not captured: check them in §9.

## 8. What this spec deliberately does not change
- **Live header while navigating** (U12). Judged against the glance order: the turn banner (blue, 36 bold distance, 20
  instruction) is the loudest element; the header is 16/14 on `surfaceRaised` and holds back, name, elapsed time, search
  and the menu, all rest-stop information (20 §0 "visually quiet"). Merging the header into the banner (Google-style) is a
  layout redesign of 20 C2 / 21 §2.5 and would move the menu, SOS-adjacent controls and search; not polish.
- **Order of numbers:** preview "3 h 50 min" first (planning), live stop card "261 km · 3 h 50 min" first (distance left,
  like the banner and the rider rows, rule 6). Different jobs; both kept.
- **Two map circles** (voice, full map) on live: 56 dp, right column, 20 C1 slots. Fine as is.
- **Start ride glow** (light, prominent): it has a 6 dp offset and soft blur, so it reads as elevation; an established
  Tribe choice (16).
- Search error layout, Home tiles, quick-message grid, SOS hold button, turn banner, map type button (25).

---

## 9. Accessibility
- **Font scale 1.3** (`maxFontSizeMultiplier` 1.3 in glance zones; BigButton allows more, so at 1.3 it renders 1.3):
  - Preview L2 wraps to 2 lines; L1 "3 h 50 min" (≈ 36 dp) fits 328 dp; nothing truncates in the trip group.
  - Header with the "Connecting" pill: the ride name truncates, the pill does not (L2).
  - Loading labels fit one line in a 328 dp button ("Stopping directions…" ≈ 230 dp at 1.3×).
  - Summary "< 50 m" and "Time" tiles: one line each at 1.3× in a 164 dp half tile.
- **TalkBack / VoiceOver:**
  - Loading confirm: label becomes the loading text, `busy` + `disabled`, announced once (E1).
  - Connection pill: label = its visible text; the banner below already announces politely (no double announcement).
  - Route summary group: `preview.a11ySummaryArrive` (R1). Recents and results never read the town twice (H1).
  - Menu rows: one button each, 56 dp; dividers are not focusable. Sheet keeps `accessibilityViewIsModal`; Android Back
    closes it (unchanged).
  - Summary map buttons keep `summary.a11yClose` / `summary.a11yFit`.
- **Targets:** after S3 every control on these screens is ≥ 56 dp (Android minimum 48; iOS 44 pt).
- **Contrast:** §7; every pair ≥ 4.5:1 text, ≥ 3:1 large text.
- **Reduce Motion / Remove animations:** E2 resolves instantly; everything else unchanged.

## 10. Copy (`src/lib/copy.ts`; ✎ = marketing may refine)
| Key | Text |
|---|---|
| `preview.tripLine` (new) | {km} · Arrive about {time} |
| `preview.a11ySummaryArrive` (new) | {duration}, {distance} to {name}. Arrive about {time}. |
| `live.ending` (new) | Ending ride… |
| `live.leaving` (new) | Leaving… |
| `lobby.cancelling` (new) | Cancelling ride… |
| `stop.clearing` (new) | Removing stop… |
| `nav.stopping` (new) | Stopping directions… |
| `summary.a11yUnder50` (new) ✎ | You rode less than 50 metres |
| `live.menuA11y` (new) | Ride menu |
| `live.connConnecting` (now also used when the ride channel is down but the phone has network) | Connecting |
| `banner.reconnecting` (unchanged text, grey tone) | Reconnecting to the ride… |
`preview.arrive` stays for any other caller; `live.menuShare` is no longer used on live (E4 ★), kept for the lobby if it
uses it. No string says "bike route" (24 §3.1).

## 11. Decisions that need the user
1. **R2:** grey credit links (with ↗) instead of orange. Trade-off: cleaner primary vs LocationIQ's "prominent link" ask.
2. **E4:** remove "Share code" from the live ⋯ menu (one tap more to share: menu → Invite riders → Share link).
3. **S1 threshold:** 50 m as "too short to measure" (GPS accuracy on a phone is about 5–20 m; 50 m leaves margin).

---

## 12. Acceptance checklist — Android emulator / moto g64, 360 dp wide, font 1.3×, Light and Dark, Tribe (spot-check Maps)
Setup: `adb shell wm density` so width px ÷ (density ÷ 160) = 360; Settings → Font size largest that gives 1.3×; switch
Profile → Light or dark for each pass.

Home and search
- [ ] A recent place whose city is its name (e.g. Kallakuruchi) shows one line, no "Kallakkurichi" under it; TalkBack reads it once. Mysuru Palace still shows "Sayyaji Rao Rd, Mysuru".
- [ ] No hairline under the last recent row in the peek or under the last search result.

Route preview
- [ ] Line 1 is the duration alone, 28 bold; line 2 "261 km · Arrive about 11:47 PM", 16 regular, wraps at 1.3×, never truncates.
- [ ] Loading shows two skeleton lines; no road route shows "≈ … km" and no line 2.
- [ ] Credit links grey with ↗ (if R2 approved); Start ride is the only orange element in the panel.
- [ ] Tapping Start ride shows a spinner **and** "Starting…" on the orange button; Invite riders shows "Inviting…".

Live ride
- [ ] Turn off the ride channel with network up (or simulate): pill "Connecting", banner "Reconnecting to the ride…" in **grey**; no amber anywhere.
- [ ] Airplane mode: pill "Offline", banner "You're offline — …" grey; the two never disagree.
- [ ] The status-bar band is the header's colour and the nav-bar band the action bar's colour, light and dark; gesture handle and status icons visible on both.
- [ ] Stop card tile and Invite riders tile are both 40 dp circles.
- [ ] Full map: insets unchanged (edge-to-edge), floating SOS and banner positions unchanged.

Menu and End ride
- [ ] Opening ⋯: the scrim fades, the panel rises a short distance; first row readable within about 200 ms; no full-screen slide. Same for every Sheet.
- [ ] Menu rows 56 back to back, each divider halfway between labels; no "Share code" on live (if E4 approved).
- [ ] End ride: the red button shows spinner + "Ending ride…", stays red; Keep riding disabled; TalkBack announces "Ending ride…"; scrim and Back do nothing until it finishes or fails.
- [ ] Menu → End ride → confirm opens on the first try (Android Modal hand-off) with the new `MODAL_CLOSE_MS`.
- [ ] Remove animations on: sheets appear and disappear instantly, End ride still shows its label.

Summary
- [ ] A ride that did not move shows "< 50 m", no count-up, no Average; share text has no km.
- [ ] No floating sheet edge or grey band above the footer; the map is 40 % of the window (300–400 dp).
- [ ] ✕ and Fit route are 56 dp circles; footer content lines up with the cards (16 dp); share button shape matches Back to home in Tribe and Maps.
- [ ] Riders card text 16 / 14. Dark summary checked (not in the screenshots).

Build
- [ ] `npx expo lint`, `npx tsc --noEmit`, Jest: `distinctAddress` cases (H1), `summaryMapHeight` clamp, pill label table (L2, as a pure helper), BigButton loading render (label present).

## 13. Implementation notes (engineer)
| File | Change |
|---|---|
| `src/lib/place-search.ts` (+ test) | `distinctAddress` (H1); `placeRowA11y` uses it |
| `src/components/place-search-view.tsx` | `PlaceRow` uses `distinctAddress`, `divider` prop (H1, H2) |
| `src/components/recent-places-section.tsx` | last row `divider={false}` (H2) |
| `src/components/place-panel.tsx` | address via `distinctAddress` (H1); not read for this spec, apply wherever it prints the address |
| `src/components/route-panel.tsx` | R1 layout, skeletons, a11y label; address via `distinctAddress` |
| `src/components/credit-row.tsx` | `textMuted` label + icon (R2 ★) |
| `src/app/(app)/ride/[id]/_layout.tsx` | reconnecting `tone="offline"` (L1); pass `netOffline` to `RideHeader` (L2); `insetTopColor` / `insetBottomColor` on `Screen` (L3); `loadingLabel`s (E1); `SheetActionList` (E3); drop Share code on live (E4 ★) |
| `src/components/ride-header.tsx` | pill table (L2); `size.header`; `live.menuA11y` (L5) |
| `src/lib/live-chrome.ts` (+ test) | pure `connectionPill(connection, netOffline)` → `{ icon, labelKey } \| null` (L2) |
| `src/components/screen.tsx` | inset colour props (L3) |
| `src/components/live-rows.tsx` | circular info tiles (L4) |
| `src/components/big-button.tsx` | loading = spinner + label, `loadingLabel` (E1) |
| `src/components/confirm-sheet.tsx` | `loadingLabel`, one announcement (E1) |
| `src/components/sheet.tsx`, `motion-presets.ts` | fade Modal + `panelEnter`; Reduce Motion `none` (E2) |
| `src/hooks/use-after-modal.ts` | re-measured `MODAL_CLOSE_MS` (E2) |
| `src/components/sheet-action.tsx` | export `SheetActionList` (E3) |
| `src/app/(app)/ride/[id]/summary.tsx` (+ `lib/summary.ts` test) | S1 under-50 rule, S2 flexGrow + `summaryMapHeight`, S3 56 dp buttons, S4 footer, S5 type |
| `src/theme/tokens.ts` | `size.header: 60` (L5). No new colour tokens |
| `src/lib/copy.ts` | §10 |
No new dependency. No data, auth or backend change.

## 14. Later (not in this batch)
1. Live rider rows use off-scale sizes (`unit` 18, `direction` 15 in `live-rows.tsx:353–354`): bring to 20 / 14 with a group-ride screenshot pass (not captured here).
2. Quick-message tiles still draw emoji (`live.tsx:798`, 36 sp): move to the icon font like the chips once that lands.
3. A restored ride days old shows "6 d 7 h" elapsed (`s1`, `s2`): rides active > 24 h could say "Started Tue" instead.
4. End ride while the viewer is offline: today it fails after the tap; consider saying "Ending needs a connection" up front.
5. Home month stats and Recent rides sum sub-50 m rides as 0: decide whether they count as rides.
6. Revisit the live header during navigation after a real-road QA ride (U12) if riders report the top 180 dp as heavy at 360 dp.
7. Where-to error block sits at the top, far from the thumb; fine at rest, revisit if search moves into the ride flow more.
