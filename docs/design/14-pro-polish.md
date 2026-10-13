# 14 — Pro polish: from "works" to "feels premium" (round 3)

Source: `docs/qa/round2/01–23.png` (release build, light, 1080×2400 ≈ 411×914 dp). Builds on 13; everything
validated there stays (row order, distance-first hierarchy, 72 dp rows, alert escalation, clustering, End as
secondary, hold-to-SOS). Brand assets: 15-brand.md.

**Diagnosis in one line:** the information design is right. It looks cheap because of *surface treatment*.
The type is system Roboto at heavy weights everywhere. Every surface is grey `#F3F4F6` with a 1 px
`#D1D5DB` border (header, map toggle, buttons, inputs, cards, sheet rows). Saturated green chips sit on every
row. Big empty white areas. Default Expo icon. Premium apps (Strava, Google Maps, Linear) use **one
typeface with a tight scale, few borders, quiet defaults so exceptions pop, and depth from surface steps
instead of outlines.**

Priority: **P0** = ship with this round (biggest perceived-quality lift or a visible bug) · **P1** = clearly
better · **P2** = finish. Each item lists likely files.

---

## 0. Foundations

### 0.1 Typeface — Inter (P0)
- Package: **`@expo-google-fonts/inter`** (`npx expo install @expo-google-fonts/inter`). Three weights only:
  `Inter_400Regular`, `Inter_600SemiBold`, `Inter_700Bold`. Why Inter: it has true tabular figures (`tnum`),
  so distances don't jitter. It stays legible at 12 px in sunlight, and it has the neutral, engineered tone of
  Linear/Strava-class products. The geometric wordmark (15) is the brand's voice; the UI is quiet.
- **Android (native):** embed at build time with the `expo-font` config plugin (no runtime load, no flash):
  ```json
  ["expo-font", { "fonts": [
    "node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf",
    "node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf",
    "node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf" ] }]
  ```
  (Check the exact file paths inside the installed package.) On Android the file name becomes the family
  name, so the families are `Inter_400Regular` etc. These are the same names `useFonts` uses.
- **Web:** `useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold })` in the root layout, gated on
  `Platform.OS === 'web'`. Keep the splash/blank until loaded (max 1.5 s, then fall back to system).
- **Rule: weight is chosen by `fontFamily`, never by `fontWeight`.** Setting `fontWeight:'700'` on a
  single-weight family makes Android fake-bold it. Add to `tokens.ts`:
  ```ts
  export const family = { regular: 'Inter_400Regular', semibold: 'Inter_600SemiBold', bold: 'Inter_700Bold' } as const;
  ```
  Replace every `fontWeight: '600' | '700'` in `src/` with the matching `fontFamily` (grep `fontWeight`).
  Hold Inter's 500 back: three weights is the cap.
- Tabular digits: keep `fontNumeric` (`fontVariant: ['tabular-nums']`). Inter supports it. QA: the live
  distance "1.4 km" must not change width when it becomes "1.8 km".
- Files: `app.json`, `src/app/_layout.tsx`, `src/theme/tokens.ts`, `src/components/app-text.tsx`, then all
  components with inline `fontWeight` (big-button, status-chip, rider-avatar, live-rows, banner, alert-banner,
  top-bar, ride-header, stat-tile, segmented-control, sos-takeover, sos-sender-panel, hold-button, code-input).

### 0.2 Type scale (P0) — same sizes as today, now with line height, tracking and weight
Sizes stay 12/14/16/20/28/36 (role rule 5). What changes: line heights, negative tracking on big type
(that is most of the "pro" look), and lighter weights for anything that isn't a glance number.
| Variant | Size/line | Family | Tracking | Use |
|---|---|---|---|---|
| `display` | 36/40 | bold | −0.8 | summary hero number, ride code |
| `title` | 28/34 | bold | −0.5 | screen titles at rest (home greeting, summary title) |
| `glance` | 28/32 | bold, tabular | −0.5 | live row distance number (unchanged size) |
| `heading` | 20/26 | semibold | −0.2 | section headers, header ride name, sheet titles |
| `bodyStrong` | 16/22 | semibold | 0 | row titles, button labels, names |
| `body` | 16/24 | regular | 0 | paragraphs |
| `caption` | 14/20 | regular | 0 | meta lines, hints |
| `label` | 12/16 | semibold | +0.6, uppercase | section labels (was 700, +1.0: too loud) |
Add `lineHeight` + `letterSpacing` to `font` tokens:
```ts
export const type = {
  display:{size:36,line:40,track:-0.8}, title:{size:28,line:34,track:-0.5}, glance:{size:28,line:32,track:-0.5},
  heading:{size:20,line:26,track:-0.2}, bodyStrong:{size:16,line:22,track:0}, body:{size:16,line:24,track:0},
  caption:{size:14,line:20,track:0}, label:{size:12,line:16,track:0.6},
} as const;
```
- **Buttons:** label 20/700 → **16/22 semibold** (`BigButton`). 20/700 on every button is the single most
  "cheap" signal in the screenshots (07, 08, 09, 21). Ride action bar keeps its size: SOS label 20 bold.
- Dynamic type: `maxFontSizeMultiplier` 1.3 on glance/chip/action-bar text (exists), 1.6 elsewhere.

### 0.3 Colour refinements (P0)
Brand basis unchanged: `#F97316` with `#111827` text (6.3:1), dark bg `#0B0F14`. Status hues unchanged.
**Light theme goes "grouped":** an off-white page and white cards. Depth comes from surface contrast, not borders.
```ts
light: {
  bg: '#F5F6F8',            // was #FFFFFF. Page background. text #111827 on it = 16.4:1
  surfaceRaised: '#FFFFFF', // cards, list, header, action bar, sheets. No border in light any more (shadow e1)
  surface: '#EEF0F3',       // was #F3F4F6. Tonal fills: secondary buttons, inputs, segmented track, skeleton
  surfacePressed: '#E4E7EB',// NEW pressed state for rows/cards/tonal buttons
  border: '#E3E6EA',        // was #D1D5DB. Hairline dividers only
  borderStrong: '#C4C9D0',  // was #9CA3AF. Input outline, outline buttons on red
  textMuted: '#4B5563',     // was #374151. 7.6:1 on white, 7.0:1 on bg. Clearer hierarchy, still AA+
  textSubtle: '#5F6876',    // NEW ≥ 4.9:1 on white, bg and surface: timestamps, version, "Built in". Never for glance text
  brandOnBg: '#C2410C',     // NEW orange TEXT/icons on light (5.2:1). Links, "View", "Later", selected tab text
  brandPressed: '#EA580C',  // NEW pressed orange fill
  movingTint: '#DCFCE7', onMovingTint: '#166534', // NEW quiet "Moving"/"Ready" chip (6.5:1)
}
dark: {
  bg: '#0B0F14', surfaceRaised: '#161B22', surface: '#1F2630', surfacePressed: '#28303B',
  border: '#262D36', borderStrong: '#3D4652', textMuted: '#C2C8D0', textSubtle: '#8B95A1' /* 5.7:1 */,
  brandOnBg: '#FB923C' /* 8.5:1 */, brandPressed: '#EA580C',
  movingTint: '#0F2E1D', onMovingTint: '#86EFAC' /* 10:1 */,
}
```
- `meRowBg` light `#FFF7ED` stays (it is the "me" signal). Dark `#2A1709` stays.
- Rider identity palette (`palette.rider`) unchanged. All white initials ≥ 5.4:1.
- **Red is for SOS and destructive actions only.** Remove the red left bar from the home contacts nudge
  (07) and the contacts info card (21). Those become `notice` cards with a `brand.primary` bar (P1, below).
- Files: `src/theme/tokens.ts`, `src/theme/use-theme.ts`, then grep for `colors.surface` used as card bg →
  `surfaceRaised`.

### 0.4 Elevation and surfaces (P0)
Borders are out as the way to separate things; elevation comes in. New token:
```ts
export const elevation = {
  e0: {},
  e1: { shadowColor:'#0B0F14', shadowOpacity:0.06, shadowRadius:8,  shadowOffset:{width:0,height:2},  elevation:1 }, // cards, list block
  e2: { shadowColor:'#0B0F14', shadowOpacity:0.12, shadowRadius:16, shadowOffset:{width:0,height:4},  elevation:4 }, // map FABs, action bar, sticky header when scrolled
  e3: { shadowColor:'#0B0F14', shadowOpacity:0.18, shadowRadius:24, shadowOffset:{width:0,height:-4}, elevation:12 }, // bottom sheets
} as const;
```
- Light: cards = `surfaceRaised` + `e1`, **no border**. Dark: no shadows (invisible). Cards = `surfaceRaised`
  on `bg`, plus a 1 px `border` only where two raised surfaces touch.
- Radius tokens: `sm: 8` (chips, small tiles), `md: 12` (buttons, inputs), `lg: 16` (cards), `xl: 24`
  (sheet top corners), `pill: 999`. Chips become pills.
- Button variants (`BigButton`): `primary` orange fill · `secondary` → **tonal**: `surface` fill, **no
  border**, text `text` · `outline` (only on red SOS surfaces) · `danger` `sosStrong` fill · `ghost` (text
  only, `brandOnBg`, 56 tall). Pressed: primary → `brandPressed`; tonal → `surfacePressed`; plus scale 0.98
  (0.1 s). Remove the opacity-0.8 press effect.
- Disabled primary (22 "Send code" is washed-out peach with brown text, looks broken): bg `surface`, text
  `textSubtle`, no orange. Same rule for every disabled button.
- Inputs (`AppTextInput`, 08, 22): bg `surfaceRaised`, 1 px `borderStrong`, radius 12, height 56, text 16
  regular. Focus: 2 px `brand.primary` border (no layout shift: reserve 2 px, colour-swap). Error: 2 px
  `sosOnBg` + error text below. Label above: 14/20 semibold `text`, 8 gap.
- Files: `tokens.ts`, `big-button.tsx`, `card.tsx`, `action-card.tsx`, `settings-row.tsx`,
  `app-text-input.tsx`, `phone-input.tsx`, `code-input.tsx`, `segmented-control.tsx`, `sheet.tsx`, `screen.tsx`.

### 0.5 Iconography (P1)
- One family: MaterialCommunityIcons (already). Rule: **outline glyphs for navigation and settings**
  (`account-outline`, `shield-account-outline`, `lock-outline`, `message-outline`, `cog-outline`), **filled
  glyphs for status and urgent actions** (`play`, `pause`, `signal-off`, `alert`, `phone`).
  Today the two styles are mixed on the same screen (20, 21).
- Sizes: 16 (inline meta), 20 (buttons, chips), 24 (rows, action bar), 32 (empty states, hero tiles). Remove
  48/64 glyphs. Big MDI glyphs look clip-art (the 64 checkered flag in 05, the 48 shield in 21).
  Big moments use a **56 tile** (radius 16, `brandTint` bg) with a 28 glyph in `text`.
- Icon tiles (ActionCard, 07/09) are already right: 40 tile, `brandTint`. Keep.
- Files: `icon-names.ts`, `empty-state.tsx`, summary screen, `contacts-nudge-card.tsx`.

### 0.6 Motion (P1) — subtle, purposeful, reduce-motion aware (13 §0.2 still applies)
| Moment | Motion | Reduced |
|---|---|---|
| Press on any button/card/row | scale 0.98 + pressed colour, 100 ms | colour only |
| Status chip changes (moving → stopped) | crossfade 150 ms + width animates 150 ms | instant |
| Row re-sort | existing 200 ms LayoutAnimation | instant |
| Sheet open/close | slide 250 ms `Easing.out(cubic)`, scrim fade 200 | fade 150 |
| SOS takeover in | slide up 200 ms, then the warning icon's halo pulses (scale 1→1.15, 1.2 s loop, 3 loops) | static halo |
| SOS map marker | halo ring pulse 1.6 s loop while SOS is active | static 2-ring halo |
| Banner in/out | slide down 150 ms from under the header | fade |
| Summary | hero fade 300, count-up 600 (exists) | final values |
Never bounce. Never animate the glance number itself.

### 0.7 Names, numbers and copy hygiene (P0) — the visible "cheap" bugs
1. **Bot initials "AB/PB/KB/MB"** (06, 11, 12, 18). `initialsOf` must ignore any bracketed segment:
   strip `/\s*[\(\[].*?[\)\]]\s*/g` before splitting. "Arun (bot)" → "AR". Also `firstName` already drops it
   for banners. Display name keeps "(bot)" only in muted text: render it as a separate 14 regular
   `textSubtle` span "bot" after the name (live-rows, member-row, summary riders). The tests in
   `src/lib/__tests__` need a case. Files: `src/lib/names.ts`, `live-rows.tsx`, `member-row.tsx`.
2. **Elapsed "6 h 53"** (01, header). `live.elapsedHm` → `"{h} h {mm} min"` ("6 h 53 min"). Under 1 min →
   `live.elapsedJustStarted` "Just started" (replaces "0 min", 12). ≥ 24 h → "1 d 2 h". Stat tile and recent
   rows already say "6 h 53 min". Files: `src/lib/format.ts`, `src/lib/copy.ts`.
3. **"'s ride"** (07). Old rides in the DB have it. Render-time guard: if `!isValidRideName(name)` show
   `copy['newRide.defaultNameUnknown']` ("Group ride"). Apply in `recent-ride-row.tsx`, `ride-header.tsx`,
   summary, invite, lobby. Optional backend cleanup migration (engineer's call).
4. ~~Takeover "500 m ahead" vs list "400 m behind"~~ **Not a bug (verified by lead).** Shots 15→16→17 are
   ~25 s apart; Karthik was stopped (SOS) while the viewer rode past at 60 km/h (~420 m per 25 s):
   ahead → with you → behind. Both use the same `relativePosition(trail, me, them)`. No change needed.
5. **Takeover distance "with you"** is lowercase as a headline (16). Sentence-case headline variants:
   `sos.distWith` "Right next to you", `sos.distAhead` "{d} ahead of you", `sos.distBehind` "{d} behind you".
6. Lobby banner "Add an SOS contact before you …" is truncated (10, 11). → `banner.noContacts` "No SOS
   contact yet" + action "Add".

---

## 1. Live ride (01, 02, 12–14, 17, 18) — the one-second glance

**What a rider must get in 1 s on a handlebar mount**, in this order:
1. **Is anyone in trouble?** (SOS / stopped / no signal) → red/amber/grey blocks, the only saturated colour on screen.
2. **Where is each rider relative to me?** → the big distance numbers.
3. **Am I sharing and connected?** → the me row ("✓ Sharing") and, only when bad, the offline banner.
Everything else (ride name, elapsed, menu) is for rest stops and must be visually quiet.

### P0
- **Quiet the "all good" state.** `StatusChip` for `moving` (and lobby `Ready`) becomes a **tint chip**: bg
  `movingTint`, text/icon `onMovingTint`, 14/20 semibold, pill, height 32, icon 16. `stopped`, `offline`,
  `sos` stay **filled**, 16 semibold, height 36, icon 18. Now an amber or red chip is the only loud thing on a
  screen of five riders (18 today: four green blobs compete with one amber). Still colour + icon + text.
  Files: `status-chip.tsx`, `member-row.tsx`.
- **Header** (`ride-header.tsx`): bg `surfaceRaised` (was grey band), 64 tall, bottom hairline `border`
  only. Title 20/26 semibold, 1 line. Sub 14/20 regular `textMuted`, tabular: `6 h 53 min · 5 riders`.
  Connection: **when online, show nothing in the header.** "● Online" is noise; the me row says
  "✓ Sharing". When offline/reconnecting: a grey `signal-off` pill "Offline" 14 semibold on `status.offline`
  fill, plus the existing viewer-offline banner. ⋯ button 56×56, icon 24.
- **Map/List switch** replaces the full-width grey "Show map" bar (02, 12) and the "List" FAB (01): a
  **segmented control in the header row under the title**, `[ Map | List ]`. Height 40 inside a 56 hit
  area, track `surface`, selected thumb `surfaceRaised` + e1, labels 14 semibold, icons 16. Default =
  split view (P1 below). Saves 64 dp of chrome and one grey band.
- **Rider row** (`live-rows.tsx`, row stays 72+, order and sizes unchanged):
  ```
  │ (AR)  1.4 km  behind            [⏸ Stopped · 2 min] │  distance 28 glance bold · direction 16 semibold textMuted
  │  40   Arun  bot                                     │  name 16 semibold text · "bot" 14 textSubtle
  ```
  - The distance number and direction word sit on one baseline. Direction 16 semibold `textMuted` (was 20
    bold `text`, which competes with the number).
  - **"With you" rows**: the whole phrase in the glance slot is too heavy (12: two giant "With you").
    Render `With you` at 20/26 semibold `text` in the distance slot, so real distances stay the biggest thing.
  - Chip right-aligned and **vertically centred on the row** (today it sits on the name line, which makes the
    row look bottom-heavy).
  - Dividers: inset 72 (start after the avatar), `border` hairline. Row bg `surfaceRaised`. Pressed `surfacePressed`.
  - Exception rows: **stopped** → 4 px left bar `status.stopped` + avatar ring (exists). **Offline** →
    4 px left bar `status.offline`, avatar 0.6, dashed ring (exists). **SOS** → keep the full red row (17,
    18). It works. Only change: the chip on red becomes a white pill with `sosStrong` text (exists) at 14 semibold.
- **Me row**: keep (orange left bar 4, `meRowBg`). Text "You" 16 semibold (was 28 bold, which is bigger than
  most distances in 12). Speed 16 regular tabular `textMuted`. "✓ Sharing" 14 semibold `onMovingTint`
  with a `check-circle` 16 (moves from black to green-ink so it reads as healthy, not as plain text).
- **Action bar** (`live` screen bottom): bg `surfaceRaised` + e2, no top border. Gap 12, padding 12/16,
  height 72. Side buttons become **tonal, icon-over-label**: `surface` fill, no border, radius 16, icon 24,
  label 12/16 semibold ("Message", "End"). They look like controls, not form buttons. Width 25 % each, SOS 50 %.
  SOS: `sosStrong` fill, radius 16, `alert` 24 + "Hold for SOS" 20 bold white. **Remove the white outline
  ring around the SOS button** (01: it reads as a focus bug); the hold-progress ring draws *inside* the
  button edge (3 px white arc, inset 4).
- Files: `ride-header.tsx`, `live-rows.tsx`, `status-chip.tsx`, `hold-button.tsx`, `src/app/(app)/ride/[id]/*`.

### P1
- **Split view by default, no dead white space** (02, 12, 14, 17 all show 40–50 % empty white under the list).
  Map takes the remaining height: `mapH = clamp(contentH − listH, 0.35·contentH, 0.6·contentH)` (refines
  review-round1 P1-4). List mode = list full height. Map mode = map full height, me row pinned at the bottom.
- **Map FABs** (01, 18): "List" FAB goes away (segmented control). "All" becomes a **56 circle**,
  `surfaceRaised` + e2, icon `fit-to-page-outline` 24, a11y "Show all riders". Bottom-right, 16 from the edges.
  Add a second 56 circle above it: `crosshairs-gps` "Centre on me". Attribution stays bottom-left, 12 regular,
  `surfaceRaised` at 0.85.
- **Ride menu sheet** (03): stacked grey full-width buttons look like a form. → `Sheet` with radius 24 top
  corners, e3, handle 36×4. **Action rows** 56: icon 24 + label 16 semibold, left aligned, inset
  dividers: `account-plus-outline` Invite riders · `share-variant-outline` Share code · `flag-checkered` **End ride**
  in `sosOnBg` (leader) / `exit-run` Leave ride (rider). No "Close" button (scrim tap, back, drag down).
  Bottom padding = safe area + 8.
- **End confirm** (04): title 20/26 semibold, body 16/24 `textMuted`, buttons stacked: `danger` "End ride for
  everyone", `secondary` (tonal) "Keep riding" (was "Cancel": say what happens).
- **Message banner** (14): icon per kind (⛽ `gas-station`, 🛞 `tire`, 🐢 `speedometer-slow`, 🧭 `compass-outline`,
  ☕ `coffee-outline`, 👍 `thumb-up-outline`) in a 32 tile `brandTint`. Text "Arun · Fuel stop" 16 semibold
  (firstName, no "(bot)"), time "now" 14 `textSubtle`, "View" 16 semibold `brandOnBg`. Bg `surfaceRaised` + e2.
  It floats 8 dp below the header with radius 12, margin 12 (not a full-bleed grey band).
- **Solo state** (01, 02: "Share the code so others can join." + grey button + white void): `EmptyState`
  card under the me row: mark tile 56, title "You're the only one here" 20 semibold, body "Riders show up
  the moment they join." 16 `textMuted`, the **code in `display` 36 tabular** ("563 184", so a friend can
  read it off your handlebar), button `secondary` "Invite riders" (icon `account-plus-outline`).
- **Me marker = brand arrow** (01, 18: today an orange dot with a detached triangle). Draw the leader piece
  of the brand mark (15 §2) as the me marker: 28 dp, `palette.me` fill, 3 px white outline, 1 px `markerStroke`
  outer stroke, rotated to heading. No heading → 24 dp dot (as now). Always on top, never clustered.
- **Rider markers** (18): 40 avatar, 2 px white outline, ring 4 in status colour for non-moving only (moving =
  no ring: the map gets as quiet as the list). Status badge 20 at top-right (exists). Leader star badge
  bottom-right 16. Add a 1 dp `rgba(11,15,20,0.25)` drop shadow ring so markers lift off busy tiles.
  SOS marker: 56 + double red halo (exists) + pulse (0.6). Trail line: 4 dp `mapTrail` at 0.5 → use rider
  colour at 0.7 for the selected rider only, others `textSubtle` at 0.4 (P2).

### P2
- **Formation rail**: a 2 dp vertical line in `border` behind the avatars, joining the rows top to bottom, with
  the me row's dot in orange on the rail. It turns the list into a picture of the column, ahead → behind.
  Decorative; hidden for screen readers.
- Header sub adds spread when ≥ 3 riders: `6 h 53 min · 5 riders · 2.2 km spread`.

## 2. SOS (15, 16, 17, 18, sender panel) — urgency first, polish second
Keep: full-bleed `sosStrong` red, white text, the full-red row, the red pinned banner. Don't add gradients,
illustrations or soft tints here. Changes are about **hierarchy and empty space**, not decoration.
### P0
- Fix the lowercase headline (0.7 #5). (Direction "mismatch" #4 was verified as correct behaviour.)
- **Takeover layout** (16), top → bottom, padding 24, everything left-aligned:
  ```
  [⚠ 32]  SOS                         12/16 label, white 0.9, uppercase, +0.6        (was 36 "SOS" + 48 icon)
  Karthik needs help                  28/34 bold white
  400 m behind you                    36/40 display bold white, tabular   ← the one big fact
  Last position <1 min ago · sent 6:03 PM   16/24 regular white 0.9 (one line, was two)
  ──────────────── 24
  [ ➤ Navigate to Karthik ]            primary-on-red: white fill, sosStrong text, 64 tall, radius 16
  [ 🏍 I'm on my way ]                  outline-on-red: 2 px white, white text, 56
  CALL KARTHIK'S CONTACTS              12/16 label white 0.9
  [ 📞 Mother          +91 00000 00001 ]  56 rows, outline 2 px white 0.6, name 16 semibold, number 14 tabular right-aligned
  [ 📞 Ambulance       108            ]
  [ 📞 Emergency       112            ]  112 row: white 0.15 fill so it reads as the always-there one
  🔒 Visible only while Karthik's SOS is on.   14 regular white 0.85
  (spacer)
  [ Dismiss ]                          ghost white, 56, bottom (safe area)
  ```
  The ~200 dp red void between "Sent" and the buttons (15, 16) goes away. Buttons move up into thumb reach
  on smaller phones without scrolling. On 914 dp tall screens the spacer goes above Dismiss.
- Contact rows: "Call Mother / Karthik's Mother · +910000000001" repeats itself. → name "Mother" + number,
  with the phone formatted in groups (`+91 00000 00001`). The a11y label keeps "Call Karthik's Mother".
- Status bar over red: light content. The heads-up notification (15) covers the title. Push the title down
  by the safe area only; don't fight the OS.
### P1
- Halo pulse on the ⚠ (0.6, 3 loops, then static). Haptics unchanged (13 §0.3).
- Sender panel (my SOS): same type ladder; "Hold to cancel SOS" stays a hold. Copy unchanged.
- Files: `sos-takeover.tsx`, `sos-sender-panel.tsx`, `sos-call-button.tsx`, `alert-banner.tsx`.

## 3. Home (07, 19)
### P0
- Top bar: replace the plain "Throttle Tribe" text with the **brand lockup**: 24 dp `logo-mark` PNG + "Throttle
  Tribe" 20/26 bold, gap 8. (No `react-native-svg` in the project: use the PNG.) The profile chip with a
  pencil (pencil = "edit", but it opens Profile) → **40 avatar only**, with the amber completeness dot,
  56 hit area, a11y "Profile, 2 things to set up".
- Page bg `bg` (#F5F6F8); cards white + e1, no borders.
### P1
- **Contacts nudge** (07: 480 dp tall, red bar, button + "Later" on separate lines): compact `Card notice`
  with a 4 px `brand.primary` left bar (red is SOS only). Row 1: shield tile 40 + title 16 semibold "Add an
  emergency contact" + body 14 `textMuted` "One tap to call them if you send SOS." Row 2: buttons side by side,
  `secondary` "Add contact" (flex 1, 48 → keep 56) and `ghost` "Later" (`brandOnBg`). About 176 dp total.
- Greeting 28/34 bold, −0.5. Sub "Ready to ride?" 16 `textMuted`. 24 above the first card.
- Recent rides: row title 16 semibold, meta 14 regular `textMuted` tabular, date 14 `textSubtle`. Inset
  dividers. Card has no border. Name guard (0.7 #3).
- Resume card (19): good. Use the `brand` variant: `brandTint` bg, **no 2 px orange border** (bg + the
  green live dot + the orange button are enough), "RIDE IN PROGRESS" label with a pulsing 8 dp green dot
  (static when reduced). When a ride is active, hide the "Have a ride code?" card (you can't join two).
- Footer: primary "Start a ride" on `bg` with a 16 dp top fade from transparent to `bg` (not a hard cut-off
  of the list, as in 07).

## 4. New ride (08)
### P1
- Input per 0.4. Suggestion chips: pills, height 40 inside a 48 hit area, `surface` fill, no border, 14
  semibold. Selected/applied chip: `brandTint` + `brandOnBg` text.
- Threshold segmented control: track `surface`, radius 12, selected thumb **`surfaceRaised` + e1 with
  `text` label** (not the full orange fill). Orange fills are reserved for the one primary button per screen.
  Sub-labels "city/default/highway" 12/16 `textMuted`. Apply the same control style to Profile → Theme (20).
- Empty middle: add a short preview line under the control (14 `textMuted`): "We'll alert the group if
  someone stays still for 1 min." That explains the choice and fills the space honestly.

## 5. Invite (09) and Lobby (10, 11)
### P1
- Code card: white + e1 (was grey with no edge). Label "RIDE CODE" 12 label, code `display` 36/40 bold,
  tabular, tracking +2 (codes read better spaced), split into 3+3 with a 12 dp gap (as now). Copy icon button
  48 at the right: `content-copy` → toast "Code copied".
- Lobby "YOUR SETUP" chips: done = `movingTint` pill + `check` 16 + `onMovingTint` text; missing = `surface`
  pill + `circle-outline` 16 + `text`, tappable, with `chevron-right` 16. No green outlines.
- Lobby rider rows: "Ready" → tint chip (0.3/§1). Leader badge: pill `surface`, `star` 14 + "Leader" 12
  semibold. "Riders (5) · 5 ready" → heading 20 semibold "Riders" + caption "5 of 5 ready" 14 `textMuted`.
- Lobby footer hint "Start any time — late riders can still join." 14 `textSubtle`, 8 above the button.
- Lobby solo `EmptyState` (10) is good. Swap the 48 MDI group icon for the 56 tile (0.5).

## 6. Summary (05, 06)
### P1
- Hero: replace the 64 checkered flag (pixel-y) with a 56 tile (`brand.primary` fill, `flag-checkered` 28
  in `brand.onPrimary`). Card `brandTint`, no border, radius 16, padding 24. Title 28/34 bold. Meta 14/20
  `textMuted`. Hero number `display` 36 + unit "km" 20 semibold `textMuted` on the same baseline, "you rode" 14.
- Stat tiles (today "6 h 53 min" at 28 bold is crammed edge to edge): numbers 28 bold tabular, units 14
  semibold `textMuted` on the same baseline ("6 h 53 min" = **6** h **53** min). Bare counts ("5", "2") stay 28.
  Label 12 label style. Tiles white + e1, no border, equal heights, icon 20 `textMuted` above the value.
- "Location sharing stopped": `successTint` card without border, `check-circle` 20 `status.moving`. Good otherwise.
- SOS/Stops rows: keep the coloured left bars. Text: "Karthik · SOS 11:08 → cleared 11:10" 16; time part
  tabular `textMuted`. Stop rows add the duration: "Arun · stopped 11:07 · 3 min".
- Riders: avatars without "(bot)" initials bug; "left early" 14 `textSubtle`.
### P2
- Static route thumbnail (my trail) in the hero, 120 tall, when the trail is cached.

## 7. Profile (20, 23), Emergency contacts (21), Auth (22)
### P1
- Profile: grouped list. White cards + e1, no borders. Rows are `SettingsRow` 56–64 inside one card per
  section, with inset dividers (today every row is its own bordered card: 20, 23). Identity row: avatar 56 +
  name 20 semibold + "Edit" ghost `brandOnBg`, instead of the pencil glyph.
- Guest account card: icon tile 40 `brandTint` `cloud-upload-outline`, title 16 semibold, body 14 `textMuted`,
  button `secondary` "Save your account". "Not set" status: amber 8 dot + 14 `textMuted` text (exists, keep).
- Toggle (Vibration): use the platform `Switch` with `trackColor true = brand.primary`, thumb white. Row 64.
- "Delete my account": `ghost` `sosOnBg`, 16 semibold, centred. Version 12 `textSubtle`.
- Emergency contacts (21): top info card → `notice` with `brand.primary` bar (not red), `account-group-outline`
  24. The empty state shield 48 → 56 tile. "+ Ambulance 108" chip → `secondary` pill button with
  `plus` 16 icon. "Emergency · 112 / Built in": "Built in" 12 label `textSubtle`. Footer: tonal "Add from
  contacts" + primary "Add a contact" (exists).
- Auth (22): title 28 bold, sub 16 `textMuted`, input per 0.4 with placeholder "you@example.com"
  (`textSubtle`). The blocking message "Finish or leave your ride first." should be a `notice` card (amber
  bar, `information-outline`), not a bare ⚠ line under the hint. Disabled button per 0.4.

## 8. Empty / loading / error (all screens) — P1
| Pattern | Spec |
|---|---|
| Empty | `EmptyState`: 56 tile (brandTint, glyph 28) · title 20/26 semibold · body 16/24 `textMuted` max 3 lines, centred, max-width 320 · optional secondary button. Copy says what will appear and how |
| Loading | `Skeleton` blocks in `surface` matching the final layout (rows 72 with a 40 circle + two bars 60 %/35 %). Never a lone spinner on a full screen. Spinner only inside buttons (`ActivityIndicator` in label colour) |
| Error, recoverable | inline `notice` card, amber bar, `alert-circle-outline`, message 16 + "Try again" ghost. Haptic Error |
| Error, transient | toast (e2, `text` bg, white 14 semibold, 3 s, bottom above the footer) |
| Viewer offline | existing grey banner, first thing under the header (rule 2) |
Rule from 13 stays: 112 is never behind a loading or error state.

## 9. Web / PWA differences (iPhone riders join via the browser) — P1
- **Phone (375–430 px):** same layouts as Android. Gutters 16. The action bar and footers respect
  `env(safe-area-inset-bottom)` (`SafeAreaView` from `react-native-safe-area-context` already maps it). At
  375 px the action bar side buttons drop to icon + 12 label (already icon-over-label, §1). Glance numbers
  keep 28.
- **Desktop / tablet (> 600 px):** a centred app column, `maxWidth: 480`, full height, `bg` inside. Outside
  the column: light `#E9ECF0`, dark `#05070A`. The column gets `e2` in light. Sheets and toasts are confined to
  the column (position relative to the column, not the viewport). The map stays inside the column. No
  desktop layout beyond that.
- **Fonts:** `useFonts` (§0.1). Add `<link rel="preload">` for the three Inter woff2 files in `+html.tsx` to
  avoid a text swap.
- **Hover/focus:** pressables get `:hover` = pressed colour at 50 %, and a visible focus ring (2 px
  `brand.primary`, offset 2) for keyboard users.
- **"Keep this tab open" notice (iOS Safari stops location when the tab is hidden):**
  ```
  ┌──────────────────────────────────────────┐ sticky under the header, surfaceRaised + e2, radius 12, margin 12
  │ [📱] Keep this tab open                    │ icon tile 32 brandTint `cellphone-lock`; title 16 semibold
  │      Sharing stops if you switch apps or   │ body 14 textMuted
  │      lock your phone.        [ Got it ]    │ ghost brandOnBg 48 (inside a 56 hit area)
  └──────────────────────────────────────────┘
  ```
  - Shows when the ride goes live on web (lobby and live), `isIOS || !('wakeLock' in navigator)`.
  - "Got it" collapses it to a **persistent pill** in the header sub-line: `cellphone-lock` 14 + "Keep tab
    open" 12 semibold `textMuted`. While sharing on web it is never fully hidden.
  - Request `navigator.wakeLock.request('screen')` when the ride is live. If granted, the pill says "Screen
    stays on". Re-acquire it on `visibilitychange` → visible.
  - When the tab comes back after being hidden > 30 s: an info banner, `status.offline` styling (grey: no
    data is not the same as stopped), "Sharing paused for 4 min while this tab was closed", auto-dismiss 8 s.
    The other riders see this rider as offline, which is correct.
  - Copy keys: `web.keepOpenTitle`, `web.keepOpenBody`, `web.keepOpenPill`, `web.screenOnPill`,
    `web.pausedBanner` (✎ marketing may refine).
- **Install hint (P2):** after the first ride on iOS Safari, one dismissible card: "Add to Home Screen for a
  full-screen map". Manifest `display: standalone`, `theme_color #0B0F14`, icons from 15 §7.
- Files: `src/app/+html.tsx` (create), `screen.tsx` (column wrapper on web), `banner.tsx`,
  `src/lib/location/*` (web), `app.json` `web`.

---

## Top 10 P0, in order of work
1. ~~SOS ahead/behind mismatch~~ verified not a bug; skip.
2. Inter via `@expo-google-fonts/inter`, 3 weights, `family` tokens, no `fontWeight` (0.1).
3. Type scale with line heights and tracking; buttons 16 semibold (0.2).
4. Grouped light theme: `bg #F5F6F8`, white cards, new tokens (`surfacePressed`, `textSubtle`, `brandOnBg`, `movingTint`) (0.3).
5. Elevation tokens; remove borders from cards/buttons; tonal secondary; proper disabled state (0.4).
6. Quiet "Moving"/"Ready" tint chips; loud only for stopped/offline/SOS (§1).
7. Live header on white, no "Online" when healthy, Map/List segmented control replaces the grey bars (§1).
8. Action bar: tonal icon-over-label side buttons, SOS without the outer ring (§1).
9. Name/number hygiene: bot initials, "6 h 53 min", "Just started", "'s ride" guard, takeover headline case (0.7).
10. Brand: new icon, adaptive icon, splash, favicon and the home lockup (15, §3).

## Acceptance checklist
- [ ] `grep -r "fontWeight" src/` returns nothing outside tokens; every Text uses an Inter family.
- [ ] Distances stay the same width as digits change (tabular) on Android and web.
- [ ] No card or button in light theme has a 1 px border except inputs and outline-on-red buttons.
- [ ] A screen of 5 moving riders shows no saturated green fill; one stopped rider is the loudest element.
- [ ] Bot rider "Arun (bot)" shows initials "AR"; header shows "6 h 53 min"; no "'s ride" anywhere.
- [ ] SOS takeover direction equals the banner and row direction for the same rider (test with sim bots).
- [ ] Reduce Motion: no pulses, scales or slides; the HoldButton ring still animates.
- [ ] Contrast spot-checks (light + dark): `textSubtle` ≥ 4.5:1 on its surfaces; `brandOnBg` ≥ 4.5:1; chips per tokens.
- [ ] Web at 390 px and 1440 px: column max 480 centred; iOS keep-open notice shows and collapses to the pill.
- [ ] Dark-mode screenshots of live, SOS, home, summary at font scale 1.3 reviewed.
