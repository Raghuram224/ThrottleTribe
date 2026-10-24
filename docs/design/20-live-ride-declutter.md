# 20 — Live ride declutter

> **2026-10-20, see 26 §3–4:** header pill follows the banner ("Connecting" / "Offline"); status- and nav-bar bands take
> the header / action-bar colour; sheet info tiles are all circles; "Share code" leaves the live ⋯ menu (pending the user).

Source: user feedback "the live-ride screen looks congested" + QA screenshot (Android emulator, Maps style,
light, solo ride, destination set, sheet at `half`, camera free after framing the stop). Builds on 06, 07,
13, 14, 16, 17, 19. Code read: `src/app/(app)/ride/[id]/{live,_layout}.tsx`, `live-sheet.tsx`,
`live-rows.tsx`, `ride-header.tsx`, `ride-map.tsx` (+`.web.tsx`), `search-pill.tsx`, `stop-card.tsx`,
`stop-pin.tsx`, `convoy-strip.tsx`, `hold-button.tsx`, `speed-bubble.tsx`, `live-ui-store.ts`,
`use-nav-camera.ts`, `lib/live-sheet.ts`, `lib/nav-route.ts`, `lib/full-map.ts`.

**Purpose:** while riding, show who is ahead, who is behind, who has stopped or lost signal, and (when set)
how far it is to the next stop. Nothing else is allowed to compete for the glance.

**One-second glance (unchanged order, 14 §1):** 1. is anyone in trouble (SOS / stopped / no signal
rows, banners) → 2. where is each rider relative to me (28 distances) → 3. am I sharing and connected.
New 4th: distance and ETA to the next stop (20, in the sheet). Ride name, elapsed time, search, invite:
rest-stop information, visually quiet.

**Diagnosis in one line.** The rider list and SOS are right. The congestion is **accretion from 19**: each
feature added its own floating element (search pill, full-map toggle, speed bubble, stop card, solo summary)
on top of the 16 layout, and nobody removed anything. The result is 9 controls and 3 copies of one number.
**Rule for this pass: one fact, one place; one control per job; nothing floats over the map's top edge.**

---

## 0. Verdict on the lead's list

| Observation | Verdict | Why |
|---|---|---|
| Competing map controls, no clear primary | **Confirm.** Worse than it looks: in follow mode the middle control is a **non-tappable** "Following" disc (`View`, role `image`) that looks like a button, so a gloved tap does nothing. The Re-centre pill is 2 dp outlined, about 145 dp wide, and the loudest thing on the map. Fit-all is shown on a 1-rider ride, where it does nothing useful. | Rules 3, 4 · 16 anti-pattern 4 |
| Destination line and ride summary repeat info / one crammed line | **Half.** They don't repeat each other. But the stop line is **crammed**: name, distance and ETA all at 16 semibold, so the fact you need (119 km · 1 h 34 min) is no bigger than the place name, and the emoji glyph isn't from the icon set. What *does* repeat is the rider count: header "1 rider", summary "Solo ride", plus a list holding only "You". | Rule 6 · 14 §0.5 one icon family |
| Speed shown twice | **Confirm, and it's three times.** Summary "60 km/h", me row "60 km/h", plus the speed bubble whenever the camera follows. | One fact, one place |
| Solo ride shows a member list of one | **Confirm.** The row only says "You ✓ Sharing". "Not sharing" already has a kept banner (`_layout.tsx` `notSharing` / `gpsOff`). | 16 anti-pattern 2 (quiet default) |
| Inconsistent row heights + unexplained empty gap | **Confirm.** Rows are 56 / 56 / 56 / then an 88 dp padded pill button (a form control inside a list). The gap comes from `snapHeights()`: `half = 45 %` and `expanded = 85 %` of the area **whatever the content**. Expanded solo shows about 380 dp of empty sheet. | 14 §1 P1 "no dead white space" |
| Search pill colliding with the header | **Confirm, and it's a camera bug too.** The pill floats 8 dp under the header and reads as a second header row. It is **not counted in `topInset`** (live.tsx passes `topInset = convoy ? 84 : 0`), so `followPadding` / `overviewPadding` frame the rider *under* the pill. The screenshot shows the me marker hidden right below it. 17 §2 had explicitly ruled out a floating search pill; 19 reintroduced it. | Rule 6 · 17 §2 |
| Hierarchy between Message and SOS | **Reject a redesign.** The 16 §2.4 bar is right: tonal 96 dp Message, red SOS taking the rest, one red thing. Two small fixes: the SOS label is 19 (off the type scale) → 20; and in **solo** Message has no recipients, so it goes and SOS takes the full width. | Rules 3, 4, 5 |

Also found: the full-map `StopChip` is not counted in the full-map `topInset` (same bug class as the pill);
`StopPin` draws a white glyph on `navRoute`, which in dark (`#60A5FA` / `#8AB4F8`) is about 2.5:1 / 2.0:1 (fails).

---

## 1. Wireframes

Reference phone 360×780 dp (small). Area = window − status bar − header 60 − action bar 84 ≈ 588 dp.

### 1.1 BEFORE — solo, stop set, sheet `half` (the screenshot)
```
┌────────────────────────────────────────┐
│ ‹  Breakfast run                    ⋯  │ RideHeader 60
│    10 h 40 min · 1 rider               │   count #1
├────────────────────────────────────────┤
│ ( 🔍 Search stops along the way      ) │ SearchPill 48, floats 8 under the header,
│                 (me)                   │   NOT in topInset → camera frames me under it
│                                        │
│                                 (⤢)48  │ full-map toggle
│                      ( ➤ Re-centre )52 │ outlined pill (free) / fake "Following" disc (follow)
│ © OpenFreeMap © OpenStreetMap   (▣)52  │ fit all — 1 rider
├─────────────────── ── ─────────────────┤ grabber (drag promise)
│ 🏁 Mysuru Palace · 119 km · 1 h 34 min ✕│ StopCard 56: one 16 line, emoji
│ Solo ride · 60 km/h                  ˄ │ summary 56: count #2, speed #1   (✕ stacked over ˄)
│▌● You   60 km/h             ✓ Sharing  │ MeRow 56: speed #2, list of one
│ (       👤+ Invite riders            ) │ BigButton in a list: 56 + 2×16 padding
│                                        │
│            ~55 dp empty                │ half = 45 % of area, not content
├────────────────────────────────────────┤
│ [💬 Message] [ ⚠  Hold for SOS       ] │ 64; Message has nobody to send to
└────────────────────────────────────────┘
In follow mode the speed bubble (speed #3) also appears bottom-left.
```

### 1.2 BEFORE — solo, sheet `expanded`
```
│ ‹  Breakfast run                    ⋯  │
├────────────────────────────────────────┤
│  map strip, controls hidden            │ ~90 dp
├─────────────────── ── ─────────────────┤
│ 🏁 Mysuru Palace · 119 km · 1 h 34 min ✕│
│ Solo ride · 60 km/h                  ˅ │
│▌● You   60 km/h             ✓ Sharing  │
│ (       👤+ Invite riders            ) │
│                                        │
│                                        │ ≈ 380 dp of empty sheet (85 % fixed)
│                                        │
├────────────────────────────────────────┤
│ [💬 Message] [ ⚠  Hold for SOS       ] │
```

### 1.3 BEFORE — group (5 riders), stop set, `collapsed`
```
│ ‹  Sunday Run                       ⋯  │ "1 h 12 min · 5 riders"   count #1
├────────────────────────────────────────┤
│ ← Behind      1.8 km spread    Ahead → │ ConvoyStrip 84
│ (PR)╌╌(ME)──────────(AR)──(KA)         │
├────────────────────────────────────────┤
│ ( 🔍 Search stops along the way      ) │ pill under the strip (not in topInset)
│                                 (⤢)    │
│ (62)                     ( ➤ Re-centre )│ three controls + bubble
│ © OpenFreeMap …                 (▣)    │
├─────────────────── ── ─────────────────┤
│ ☕ Cafe Coffee Day · 3.4 km · 9 min   ✕ │
│ 5 riders · 1 stopped                 ˄ │ count #2
│▌(PR) 4.2 km ↓ behind  [⏸ Stopped 6 min]│ pinned row 72
├────────────────────────────────────────┤
│ [💬 Message] [ ⚠  Hold for SOS       ] │
```

### 1.4 AFTER — solo, stop set (default sheet mode; full map unchanged, §2 C9)
```
┌────────────────────────────────────────┐
│ ‹  Breakfast run              [🔍] [⋯] │ RideHeader 60: search 56 + menu 56
│    10 h 40 min                         │   meta = elapsed only
├────────────────────────────────────────┤
│                                        │ nothing floats at the top edge
│               (me ➤)                   │ camera: me in the lower third
│                                        │
│                                        │
│ ⎛ 60 ⎞                          (⤢)56  │ bottom-left "me" slot: speed bubble (following)
│ ⎝km/h⎠                                 │   ↔ ( ◎ Re-centre ) 56 pill when panned
│ © OpenFreeMap © OpenStreetMap          │ fit-all hidden (< 2 riders)
├────────────────────────────────────────┤ solo panel: radius 24, no grabber, no chevron
│ [🏁]  119 km · 1 h 34 min              │ StopCard 64: 20 semibold tabular
│  40   Mysuru Palace                    │   14 textMuted
│────────────────────────────────────────│ hairline inset 68
│ [👤+] Invite riders                  › │ SoloInviteRow 64
│  40   You're riding solo               │
├────────────────────────────────────────┤
│ [ ⚠           Hold for SOS           ] │ full width, 64
└────────────────────────────────────────┘
Solo, no stop: the panel is only the Invite row (8 + 64 = 72 dp).
```

### 1.5 AFTER — group (5 riders), stop set, `collapsed`
```
│ ‹  Sunday Run                 [🔍] [⋯] │ "1 h 12 min"
├────────────────────────────────────────┤
│ ← Behind      1.8 km spread    Ahead → │ ConvoyStrip 84 (the only top chrome; = topInset)
│ (PR)╌╌(ME)──────────(AR)──(KA)         │
├────────────────────────────────────────┤
│                                        │
│              (me ➤)                    │
│                                 (⤢)56  │ right "view" column, max 2 circles
│ ⎛62⎞                            (▣)56  │ fit all
│ © OpenFreeMap © OpenStreetMap          │
├─────────────────── ── ─────────────────┤ grabber 16
│ [☕]  3.4 km · 9 min                    │ StopCard 64
│       Cafe Coffee Day · Suggested by Priya
│ 5 riders · 1 stopped                 ˄ │ summary 56 (the only rider count)
│▌(PR) 4.2 km ↓ behind  [⏸ Stopped 6 min]│ pinned 72 (max 2)
│      Priya                             │
├────────────────────────────────────────┤
│ [💬 ] [ ⚠      Hold for SOS          ] │ Message 96 + SOS flex
│ Message                                │
```

### 1.6 AFTER — group, `expanded` (height = content, capped at 85 %)
```
│ ‹  Sunday Run                 [🔍] [⋯] │
├────────────────────────────────────────┤
│ ConvoyStrip 84                         │
│ map (controls auto-hide < 176 dp)      │
├─────────────────── ── ─────────────────┤
│ [☕]  3.4 km · 9 min                    │ 64
│       Cafe Coffee Day                  │
│ 5 riders · 1 stopped                 ˅ │ 56
│ (KA)  500 m ↑ ahead            64 km/h │ 72
│ (AR)  = With you               61 km/h │ 72
│▌➤ You                       ✓ Sharing  │ 56: no speed text (a11y keeps it)
│▌(PR)  4.2 km ↓ behind [⏸ Stopped 6 min]│ 72
│ OFF ROUTE                              │ 32
│▌(JO)  ≈3.1 km away      ( No signal )  │ 72
│       Jo · seen 4 min ago              │
│ ── 8 dp, then the sheet ends ──        │ no empty sheet below the last row
├────────────────────────────────────────┤
│ [💬 ] [ ⚠      Hold for SOS          ] │
```
If 2–3 riders fit inside `half`, there is no `expanded` snap. The chevron toggles collapsed ↔ half.

---

## 2. Change list (ordered by rider impact)

Every value comes from `src/theme/tokens.ts`. New tokens are in §3.

### C1. Map controls: one slot per job, no fake buttons (P0)
**Principle:** rule 3 (56 targets), rule 4 (one primary), rule 6 (glanceable), 16 anti-pattern 4.
- **Bottom-left = "me" slot**, one element at a time:
  - camera `follow` and speed known → `SpeedBubble` (exists, 56);
  - camera `free` or `overview` → **Re-centre pill**: height `size.mapControl` 56, radius `pill`,
    padding-x `space.lg` 16, gap `space.sm` 8, icon `centerMe` 24 + label `live.recentre` 16 semibold,
    both `brandOnBg`, bg `fabBg`, `elevate('e2')`, **no border** (drop today's 2 dp outline). It is the
    only labelled control on the map, which makes it the primary when it's there. Disabled (opacity 0.5)
    while I have no fix (exists).
  - Position: `left: space.md` 12, `bottom: ATTRIBUTION_CLEAR` 36 (= 8 + 20 pill + 8, existing
    `SPEED_BOTTOM`). Full map: above the floating SOS (existing `SPEED_BOTTOM_FULL`).
  - The bubble and the pill never show together. Speed bubble and Re-centre are mutually exclusive
    by intent (riding vs. inspecting).
- **Delete the "Following" indicator** (`ride-map.tsx` L457-465, the non-pressable `View` with
  `live.followingA11y`). Following needs no badge: the moving, heading-up map and the speed bubble show it.
- **Bottom-right = "view" column**, max 2 circles, `right: space.md`, `bottom: space.md`, gap `space.md`,
  top → bottom:
  1. Full-map toggle: `size.mapControl` 56 circle (was 48), icon `expand` / `collapse` 24 `fabIcon`.
  2. Fit-all: 56 circle (was 52), icon `fitPage` 24 `fabIcon`. Overview active: 2 dp `brandOnBg` ring +
     icon `brandOnBg` + `accessibilityState.selected` (exists). **Hidden when fewer than 2 riders have a
     position** (solo: "show all riders" is just me; framing me + the stop is the stop card's tap).
- Glyphs use `fabIcon` (today `colors.text`). This is the 17 token that was never wired up.
- **Auto-hide by space, not only by snap:** visible map height `mapVisH = areaH − topInset − heights[snap]`.
  Hide the right column when `mapVisH < 176` (2×56 + 12 gap + 12 bottom + 12 top + 28 attribution).
  Hide the bottom-left slot when `mapVisH < 104`. `controlsHidden` (expanded) stays as the first condition.
  **Amendment (review):** the screen no longer passes `controlsHidden` for `expanded`. A tall sheet can
  still leave plenty of map (e.g. 224 dp), and the two `mapVisH` thresholds already hide the controls when
  there is not enough; the `controlsHidden` prop stays in the pure rule but is always `false` on this screen.
- Attribution unchanged (bottom-left, 12 regular, `surfaceRaised` @ 0.85). **Text and a second line (route credit)
  changed by 24 §4.2; `ATTRIBUTION_CLEAR` becomes `attributionClear(lines)` = 40 / 56.**
- Files: `ride-map.tsx`, `ride-map.web.tsx` (same changes), `live.tsx` (pass `riderCount`/`fitAllShown`
  and `mapVisH` or the hide flags), `tokens.ts`.

### C2. Search moves from the map to the header (P0)
**Principle:** rule 6, 17 §2 ("no floating search pill"), rest-time vs ride-time split (14 §1).
**Overturns 19 A UI §1** (floating pill under the convoy strip).
- `RideHeader` gets `onSearch?: () => void`. When set, render a 56×56 icon button (`search` 24, `text`)
  **left of ⋯**, `accessibilityRole="button"`, label `search.headerA11y`.
- `_layout.tsx` passes `onSearch` only when `child === 'live'` and `rideLive`. It pushes `/ride/[id]/search`
  (move `openSearch` from `live.tsx`).
- **Hidden while the connection pill shows** (`connection !== 'live'`). Search can't work offline
  ("Search needs a connection"), and on 360 dp the pill and the icon don't both fit next to the title.
  The pill takes the icon's place, so the layout doesn't shift.
- Not in full map (header hidden there; unchanged).
- `live.tsx`: delete the `SearchPill` slot (L457-461). Delete `search-pill.tsx` and the
  `search.pillNoStop` key (see open question 1).
- **Camera rule (fix, keep forever):** anything floating over the top of the map must be included in
  `RideMap.topInset`. After C2 that is the convoy strip (84) in sheet mode. In full mode it is
  `fullTop + (stopText ? STOP_CHIP_H + space.sm : 0)` with `STOP_CHIP_H = 40`. Today the chip is missing
  from the full-map inset.
- 360 dp budget: back 56 + title ≥ 136 + search 56 + ⋯ 56 = 304 + 16 slack. The title truncates (tail).

### C3. One fact, one place (P0)
**Principle:** rule 6; anti-pattern "chip/number on every row" (16 §8.2).
- **My speed** lives only in the map `SpeedBubble` (follow mode).
  - `LiveMeRow`: remove the visible speed `AppText`. Keep `speedKmh` for the **accessibility label only**
    ("You, 60 kilometres per hour, sharing location"). **Overturns 06 §4 / 14 §1 / 16 §2.2** (speed in
    the me row).
  - Solo summary line `Solo ride · 60 km/h` disappears with C4. Retire `soloSummaryLine` (`full-map.ts`),
    `live.soloSummary`, `live.soloSummarySpeed`.
  - Other riders' rows keep their speed (16 §2.2): it is information about *them*, shown nowhere else.
- **Rider count** lives only in the sheet summary ("5 riders · 1 stopped"). Live header meta =
  `formatElapsed(now − startedMs)` only. Lobby keeps `lobby.headerMeta` ("Lobby · 4 riders").
  **Overturns 00 §2.3 / 14 §1 / 16 §2.3** (header "1 h 12 min · 5 riders").
  File: `_layout.tsx` `meta`. Retire `live.headerMeta`.

### C4. Solo: a panel, not a list of one (P0)
**Principle:** 16 anti-pattern 2 (quiet default), 17 §2 ("no drag handle that promises a gesture we don't
have"), rule 4. **Overturns 19 C** (summary "Solo ride · 42 km/h", draggable sheet, "Invite riders"
BigButton under the me row).
- Applies when `loaded && activeCount <= 1` (solo, or everyone else left).
- `LiveSheet` gets `variant: 'group' | 'solo'` (default `group`). In `solo`:
  - no grabber, no `GestureDetector` pan, no summary row, no chevron, no adjustable a11y role;
  - top padding `space.sm` 8 (under the radius-24 corners), then `stopCard` (if any), then `children`;
  - height `SOLO_TOP + (stop ? 64 : 0) + 64`, i.e. 136 with a stop, 72 without. Pass all three
    `heights` equal to it so `overlayShift` and the camera's `bottomInset` keep working unchanged.
- `children` = **`SoloInviteRow`** (new, `src/components/live-rows.tsx`), using the shared 64 row
  anatomy (§2 C6): tile 40 (`brandTint`, radius 12, `inviteOutline` 22 `brandOnBg`) · title
  `invite.cta` "Invite riders" 16 semibold `text` · sub 14 regular `textMuted`: `live.soloSub` "You're
  riding solo", or `live.soloSubLeft` "Everyone else has left" when any member has `leftAt` · trailing
  `chevronRight` 20 `textMuted`. Whole row = one 64 dp target → `openInvite`. Pressed `surfacePressed`,
  haptic `select`.
- No `LiveMeRow` in solo. "Not sharing" / "GPS off" are the kept layout banners (they already show in
  sheet and full map). My SOS is the pinned `mySos` banner + the cancel bar.
- **Action bar in solo:** no Message tile (quick messages go to the group, and there is none). The
  SOS `HoldButton` gets `flex: 1` across the full bar. **Overturns 16 §2.4** for solo only.
- Fit-all hidden (C1). Convoy strip hidden (exists).
- Transition when someone joins (1 → 2 active): fade Message in (`motion.fast`), the sheet switches to
  `group` at the persisted `liveSheetSnap`, and the convoy appears once 2 riders have positions. The
  reverse applies when the last other rider leaves. A width change of the SOS button **must not cancel a
  hold in progress** (acceptance item).
- 19 B "full map is the default the first time a solo ride opens" stays. **Superseded by 22 D6: removed (Just ride opens in the sheet view).** (22 D7 then removed Just ride itself; no ride opens in full map by itself.)

### C5. Next-stop card: the number is the fact (P1)
**Principle:** rule 6 (largest = most important), rule 1 (icon + text), 14 §0.5 (one icon family).
- `StopCard`, height `size.sheetInfoRow` 64 (was 56; `STOP_CARD_H` in `lib/live-sheet.ts` → 64),
  padding-left `space.lg`, padding-right `space.lg`, gap `space.md`:
  ```
  [tile 40]  119 km · 1 h 34 min           line 1: 20/26 semibold, text, tabular
             Mysuru Palace · Suggested by Priya   line 2: 14/20 regular textMuted, 1 line, tail-truncate
  ```
  - Tile: 40 circle, bg `navRoute`, glyph 20 `onNavRoute` (**new token**, §3): `endRide`
    (flag-checkered) for `destination`, `coffee` for `break`. The same colour as the map pin, so card and
    pin read as one thing. No emoji.
  - Line 1 = two `Text` spans: distance (`flexShrink: 0`) + `" · " + eta` (`flexShrink: 1`), so the ETA
    truncates before the distance ever does (at 1.3× font).
  - Approximate (no route): line 1 `stop.cardDistanceApprox` "≈ 119 km" in `text` (it isn't stale, only
    straight-line).
  - Arrived (< 150 m): tile glyph `checkCircle`; line 1 `stop.arrived` "You've arrived".
  - No GPS fix yet: line 1 = place name 16 semibold; line 2 `stop.noFix` "Distance shows when GPS is ready".
- **The leader's ✕ leaves the card** → ⋯ menu row `stop.menuRemove` "Remove next stop" (icon `close`,
  `destructive`, shown to the leader only while a stop exists, placed above End ride). It opens the existing
  `stop.clearTitle` ConfirmSheet. Move that sheet and `doClearStop` from `live.tsx` into `_layout.tsx`, using
  `afterMenu.schedule` like Leave/End. **Overturns 19 A UI §3** (✕ on the card). Why: the ✕ stacked 56 dp
  above the sheet chevron is a gloved mis-tap waiting to happen, and removing a stop is rare and deliberate.
- Card tap = frame me + stop (exists). No trailing icon.
- `lib/nav-route.ts` `stopCardText` returns parts:
  `{ distance: string | null, eta: string | null, approximate: boolean, arrived: boolean, name: string, kind }`
  plus `text` (kept for `StopChip` in full map, built from the parts **without** the emoji).
- `StopPin` glyph colour → `onNavRoute` (fixes the dark-theme contrast failure).
- Files: `stop-card.tsx`, `stop-pin.tsx`, `lib/nav-route.ts` (+ tests), `lib/live-sheet.ts`, `_layout.tsx`,
  `live.tsx`, `copy.ts`.

### C6. Rows on a grid; the sheet ends where the content ends (P1)
**Principle:** 14 §1 P1 "no dead white space", rule 5 (grid), 16 anti-pattern 4.
- Four row heights only, all from tokens. Nothing in the sheet gets ad-hoc padding:
  | Row | Height | Token |
  |---|---|---|
  | Sheet summary, me row, NoFix row | 56 | `size.rowMe` / `touchTarget` |
  | Stop card, SoloInviteRow, load-error row | 64 | `size.sheetInfoRow` (new) |
  | Rider row | 72 | `size.rowLive` |
  | OFF ROUTE label | 32 | `ROW_HEIGHTS.label` |
- The 64 "info row" anatomy is shared (StopCard, SoloInviteRow): tile 40 at x 16 · gap 12 · two lines ·
  optional trailing 20 icon · hairline divider inset 68 (`border`), matching rider rows (16 §2.2).
- Remove `BigButton` from inside the sheet (`styles.alone` block). The load error becomes a 64 row:
  `alertCircle` tile on `stoppedTint` + `errors.loadRide` + trailing ghost `common.tryAgain` (56 hit,
  `brandOnBg`).
- **Content-aware snaps** (`lib/live-sheet.ts`):
  ```ts
  snapHeights(areaH, pinnedCount, hasStopCard, listContentH): { heights: Record<SheetSnap, number>, snaps: SheetSnap[] }
  fit       = headerHeight(hasStopCard) + listContentH + space.sm          // 8 dp after the last row
  collapsed = peekHeight(pinnedCount, hasStopCard)                         // unchanged
  half      = max(collapsed + 56, min(round(0.45 * areaH), fit))
  expanded  = min(round(0.85 * areaH), fit)
  snaps     = expanded > half ? ['collapsed','half','expanded'] : ['collapsed','half']   // and expanded := half
  ```
  - `nextSnap` / `stepSnap` / `settleSnap` walk `snaps`, not `SNAP_ORDER`. A persisted `expanded` that
    isn't available renders as `half` (don't rewrite the pref).
  - Chevron: `chevronUp` unless at the last available snap, then `chevronDown` (tap → collapsed).
  - `listContentH` = the ScrollView's `onContentSizeChange` height (already in `contentH`) **minus** the
    `paddingBottom` spacer. Debounce changes < 8 dp so the 1 s clock never makes the sheet breathe. A row
    insert/remove animates the height with `motion.layout` (`withTiming`, reduce-motion aware, exists in
    `animateTo`).
  - **Amendment (review):** the `snaps` rule above (`expanded > half`) contradicted §1.6 / §8 ("chevron
    toggles two states when content <= half"): on 360x780 (area 588) with me + 2 riders it gave 265 / 280,
    two snaps 15 dp apart. The rule is now: three snaps only when `expanded - half >= 72` (one rider row);
    otherwise `snaps = ['collapsed','half']` and `half = expanded = max(half, expanded)` (the content height).
  - **Amendment (review):** the solo panel with a failed reload shows the 64 dp load-error row above the
    invite row; `soloSheet(hasStop, hasError)` adds 64.
  - Supersedes the fixed 45 % / 85 % fractions from spec 18 (referenced in code; the file is missing from
    `docs/design/`).
- Files: `lib/live-sheet.ts` (+ `__tests__`), `live-sheet.tsx`, `live.tsx`.

### C7. Action bar (P1)
**Principle:** rules 3, 4, 5. Layout from 16 §2.4 kept: Message tonal 96×64 (icon 24 over label 12) +
`HoldButton` flex, gap `space.md`, padding 12/16/8, `surfaceRaised` + e2, bg extended under the bottom inset.
- `HoldButton` label `fontSize: 19` → `font.lg` 20 (type scale). Holding label and cancel tone too.
- Solo: Message hidden, SOS full width (C4).
- Unchanged: 2 s hold with fill progress, early-release hint toast, a11y double-tap → ConfirmSheet,
  cancel = 2 s hold, floating 64 SOS in full map.

### C8. Header type on the scale (P2)
**Principle:** rule 5; 14 §1 ("ride name is for rest stops, visually quiet").
- `RideHeader` title 18/24 → `bodyStrong` 16/22 semibold. Meta 13/18 → `caption` 14/20 regular
  `textMuted`, tabular. Height 60 unchanged. **Overturns 16 §2.3** sizes (18/13 are off-scale).

### C9. Full map (19 B), what changes
Only C1 (control slots and sizes), C2 (stop chip in `topInset`) and C5 (chip text without emoji, via the
new `text`). Everything else stays: floating SOS 64, kept SOS / not-sharing banners and approval cards,
Android back exits full map first.

### Not changed (guardrails)
Rider row anatomy and order (06 §4, 16 §2.2), pinned alert rows (max 2), convoy strip, alert escalation and
banners (07), SOS takeover and sender panel, End ride in ⋯ only, colour + icon + text on every status,
offline grey never amber, OSM attribution always visible, keep-awake, Tribe/Maps traits (17).

---

## 3. Tokens (`src/theme/tokens.ts`)
```ts
size.mapControl   = 56   // map circles and the Re-centre pill (was FAB 52 / TOGGLE 48 in ride-map.tsx)
size.sheetInfoRow = 64   // stop card, solo invite row, load-error row
// Tokens interface, all four palettes:
onNavRoute: Tribe light '#FFFFFF' (5.2:1 on #2563EB) · Tribe dark '#0B0F14' (7.5:1 on #60A5FA)
            Maps light  '#FFFFFF' (4.5:1 on #1A73E8, glyph only, ≥ 20 dp) · Maps dark '#0B0F14' (9.0:1 on #8AB4F8)
```
Local constants (not tokens): `ATTRIBUTION_CLEAR = 36`, `STOP_CHIP_H = 40`, `SOLO_TOP = space.sm`.
Remove `FAB`, `TOGGLE` from `ride-map(.web).tsx`.
New icon name (`src/lib/icon-names.ts`, covered by the glyph test): `alertCircle: 'alert-circle-outline'`
(load-error row, as in 14 §8). Every other glyph used here already exists (`search`, `inviteOutline`,
`centerMe`, `fitPage`, `expand`, `collapse`, `endRide`, `coffee`, `checkCircle`, `chevronRight`, `close`).

## 4. States

| State | Behaviour |
|---|---|
| Loading (`!loaded`) | Header (search icon shown), map placeholder `surface`, **group** sheet at `collapsed` with 3 skeleton rows 72 inside `half`. Action bar shows Message + SOS (most rides are group); SOS works immediately. Solo is decided on load (C4 transition). |
| Load error | 64 error row at the top of the group sheet body, last data kept (06 §6). |
| Viewer offline | Offline banner first (layout, unchanged). Header: the connection pill replaces the search icon. Rider rows muted with `≈` (exists). Stop card keeps working from my own GPS. A route never fetched shows "≈ km" (C5). Speed bubble unaffected. |
| Rider moving / stopped / no signal / never seen / SOS | Rows unchanged (16 §2.2): speed text / amber chip + bar / outline "No signal" + dashed ring + "seen 4 min ago" / "No location yet" + "No signal yet" / full red row, pinned first. |
| Me not sharing | Group: me row amber "Not sharing" (tap → Fix) + kept banner. Solo: kept banner only (no me row). No speed bubble (no fixes). |
| My SOS on | Pinned `mySos` banner (112 action), bar = "Hold to cancel SOS" (cancel tone; full width in solo), me row "SOS on" chip (group). |
| Received SOS | Takeover (07), then pinned banner + red pinned row. Unchanged. |
| Leader vs rider | Leader: ⋯ adds "Remove next stop" (when set) above "End ride". Rider: ⋯ = Invite · Share · Leave. Both have header search: the leader sets stops, riders suggest (19 A). |
| Solo / alone | §1.4. "Everyone else has left" sub when members have `leftAt`. |
| Group 2 riders | Convoy appears once both have positions. Sheet content fits `half`, so 2 snaps. |
| Group 6+ riders | `expanded` = min(85 %, fit); list scrolls; keep-me-visible (06 §4) unchanged. |
| With / without stop | Stop card in every snap, or nothing (no placeholder row). |
| Sheet collapsed / half / expanded | §1.5 / fit / §1.6. Map controls auto-hide by `mapVisH` (C1). |
| Camera follow / free / overview | Bubble / Re-centre pill / Re-centre pill + fit-all ring. |
| Full map | C9. |
| 360 dp wide | Header title ≥ 136 dp; stop line 1 width 276 dp (ETA truncates first); Re-centre pill ≤ 164 dp at 1.3× and never meets the right column (x 292); SOS ≥ 220 dp (group), 328 dp (solo). |
| Light / dark × Tribe / Maps | Token-driven only. Check `fabBg`/`fabIcon`, `onNavRoute`, `brandOnBg` on `fabBg` (Tribe dark 6.8:1, Maps light 5.4:1). |

## 5. Interactions

| Control | Gesture | Feedback | Result |
|---|---|---|---|
| Header search 56 | tap | `select` | push `/ride/[id]/search` (19 A flow unchanged) |
| Header ⋯ → Remove next stop | tap, then confirm | `select` | ConfirmSheet `stop.clearTitle` → `clear_stop` → toast `stop.toastCleared` (exists) |
| Stop card 64 | tap | `select` | frame me + stop, camera free → Re-centre pill appears |
| SoloInviteRow 64 | tap | `select`, pressed `surfacePressed` | push invite (10) |
| Sheet summary / chevron (group) | tap; drag on header | `select` on snap | cycle the available snaps (C6) |
| Re-centre pill 56 | tap | `select` | follow mode → pill swaps to speed bubble (150 ms crossfade, off with reduce motion) |
| Full-map 56 | tap | `select` | toggle full map (exists) |
| Fit-all 56 | tap | `select` | overview; ring while active |
| Message 96×64 | tap | `select` | quick-message sheet (exists) |
| SOS | hold 2 s | Light / Medium / Error, fill | 07 §4 (unchanged) |

## 6. Copy (`src/lib/copy.ts`; ✎ = marketing may refine)
| Key | Text |
|---|---|
| `search.headerA11y` | Search stops along the way |
| `live.soloSub` ✎ | You're riding solo |
| `live.soloSubLeft` ✎ | Everyone else has left |
| `live.soloInviteA11y` | Invite riders. {sub}. |
| `stop.cardDistanceEta` | {km} · {eta} |
| `stop.cardDistanceApprox` | ≈ {km} |
| `stop.cardSubSuggested` | {name} · Suggested by {by} |
| `stop.noFix` ✎ | Distance shows when GPS is ready |
| `stop.menuRemove` | Remove next stop |
| `stop.a11yCardParts` | Next stop {name}, {distance}, {eta}. Double-tap to show it on the map. |
Reused: `invite.cta`, `live.recentre`, `live.recentreA11y`, `live.fitAllA11y`, `stop.arrived`, `stop.clear*`.
Retired: `live.headerMeta`, `live.soloSummary`, `live.soloSummarySpeed`, `live.followingA11y`, `search.pill`,
`search.pillNoStop` (pending open question 1), `stop.cardLine*` (replaced by the parts keys).

## 7. Accessibility
- Every control ≥ 56 dp: header search, map circles (were 48/52), Re-centre pill, rows 64/72.
- Removed: the role-`image` "Following" disc (it was a focusable non-control). Following is announced by
  the speed bubble ("60 kilometres per hour") when present.
- Me row label keeps speed: "You, 60 kilometres per hour, sharing location".
- Stop card: `stop.a11yCardParts`, no emoji read-out. Arrived: "Next stop {name}, you've arrived."
- Solo panel: not `adjustable` (it has no snaps). SoloInviteRow `button`, `live.soloInviteA11y`.
- Group sheet: adjustable increment/decrement walk only the available snaps.
- Fit-all exposes `accessibilityState.selected`; hidden riders-of-one means it is not focusable in solo.
- Contrast: `onNavRoute` table §3; `fabIcon` on `fabBg` ≥ 5.4:1 in all four palettes (17 §1.1); stop line 1
  `text` on `surfaceRaised` ≥ 14:1; line 2 `textMuted` ≥ 5.4:1.
- Dynamic type: `maxFontSizeMultiplier` 1.3 on header, sheet rows, stop card, map pill, action bar. Single
  lines truncate (distance never: §C5 spans). Map circles are icon-only (not scaled).

## 8. Acceptance checklist
Map
- [ ] In follow mode the map shows at most: speed bubble (bottom-left), full-map + fit-all (bottom-right), attribution. No "Following" disc anywhere (`grep followingA11y src/` → nothing).
- [ ] Panning swaps the speed bubble for a 56 dp borderless Re-centre pill in the same slot; tapping it swaps back.
- [ ] All map circles measure 56×56 dp; glyphs use `fabIcon`; native and web identical.
- [ ] Solo ride: no fit-all button. 2+ positioned riders: fit-all shown.
- [ ] Right column auto-hides when visible map < 176 dp; bottom-left slot when < 104 dp.
- [ ] Nothing floats over the top edge of the map in sheet mode. My marker is never hidden under chrome after Re-centre or a stop-frame (check with a stop set, solo and group).
- [ ] Full map: `topInset` includes the stop chip; the chip never covers my marker.

Header
- [ ] Live header shows a 56 dp search button left of ⋯ that opens the stop search; it is hidden while the connection pill shows and absent in lobby and full map.
- [ ] Live header meta is elapsed time only ("10 h 40 min"); lobby still shows "Lobby · N riders".
- [ ] Title 16/22 semibold, meta 14/20, both ≤ 1.3× scale, truncating on 360 dp.

Sheet
- [ ] Solo: no grabber, no chevron, no summary line, no me row; panel = stop card (if set) + "Invite riders / You're riding solo" row; height 136 / 72 dp; no drag response.
- [ ] Others leave mid-ride → solo panel with "Everyone else has left"; someone joins → group sheet at the saved snap, Message fades in.
- [ ] My speed appears in exactly one place on screen at any time (bubble), and in the me row's screen-reader label.
- [ ] Group: rider count appears only in the sheet summary.
- [ ] No sheet snap ever shows empty sheet below the last row (2, 3, 6 and 10 riders; with and without stop). With content ≤ half, the chevron toggles between two states only.
- [ ] Row heights are only 32/56/64/72; no BigButton inside the sheet.
- [ ] Stop card: 64 dp, tile in `navRoute` with `onNavRoute` glyph, line 1 "119 km · 1 h 34 min" 20 semibold tabular, line 2 place 14 muted; no emoji; at 1.3× the ETA truncates before the distance.
- [ ] Stop card has no ✕; the leader removes the stop from ⋯ → confirm; riders never see the action.
- [ ] Dark theme (Tribe and Maps): stop pin and stop tile glyph contrast ≥ 4.5:1.

Action bar
- [ ] Group: Message 96 + SOS flex; solo: SOS full width, no Message.
- [ ] SOS label 20 bold; hold still 2 s with visible fill; double-tap with a screen reader confirms first.
- [ ] Starting a hold, then having a rider join (bar re-layout) does not cancel or complete the hold early.

Cross-cutting
- [ ] Light/dark × Tribe/Maps screenshots at 360×780 and 411×914, font scale 1.0 and 1.3: collapsed, half, expanded, solo, full map.
- [ ] Unit tests: `snapHeights` (content-aware, 2-snap case, persisted `expanded` fallback), `stopCardText` parts (route, approx, arrived, no fix), `nextSnap`/`stepSnap` over available snaps.
- [ ] `npx expo lint` and `npx tsc --noEmit` clean; web build checked.

## 9. Files (engineer)
`src/app/(app)/ride/[id]/live.tsx` (remove SearchPill slot + clear-stop confirm; solo variant; Message hidden
in solo; topInset rule; map hide flags) · `src/app/(app)/ride/[id]/_layout.tsx` (header `onSearch`, meta,
⋯ "Remove next stop" + its confirm) · `src/components/ride-header.tsx` (`onSearch`, type) ·
`src/components/ride-map.tsx` + `ride-map.web.tsx` (C1) · `src/components/live-sheet.tsx` (`variant`,
available snaps, chevron) · `src/lib/live-sheet.ts` (+ tests) · `src/components/live-rows.tsx`
(`LiveMeRow` speed → a11y only; new `SoloInviteRow`) · `src/components/stop-card.tsx`, `stop-pin.tsx` ·
`src/lib/nav-route.ts` (+ tests) · `src/lib/full-map.ts` (retire `soloSummaryLine`) ·
`src/components/hold-button.tsx` (20) · `src/theme/tokens.ts` · `src/lib/copy.ts` · delete
`src/components/search-pill.tsx`. No new dependency.

## 10. Decisions (user, resolved)
1. **Leader nudge for a destination: header search icon only.** The on-map "Set a destination to see the
   route ahead" prompt is dropped, and there is no replacement in the sheet (no info row, no first-10-minutes
   nudge). `search.pillNoStop` is retired together with `search.pill`. Re-check after one real ride.
2. **Speed while the map is panned: hidden.** Re-centre takes the speed bubble's slot in the bottom-left "me"
   slot; re-centring brings the bubble back. No third floating element and no bottom-centre Re-centre.
