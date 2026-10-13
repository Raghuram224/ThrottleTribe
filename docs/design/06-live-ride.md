# 06 — Live ride (`ride/[id]/live.tsx`) — the key screen

**Purpose:** while riding, show who is ahead, who is behind, and who has stopped or lost signal.
**One-second glance (per row):** `4.2 km behind` (largest) → `⏸ Stopped · 6 min` → `Arun`.
Screen-level glance: an SOS or "You're offline" is always the first thing seen.

Mounted portrait on a 6" phone (reference 360×780 dp, ~720 usable). Riders glance for ~1 s, often
with gloves. The **list is the primary instrument; the map is context.**

## 1. Modes and proportions (decision)
Two modes, toggle persisted per device (default **Split**):

| Mode | Map | List | Why |
|---|---|---|---|
| **Split** (default) | 40 % of the content area (min 200 dp) | rest, ≥ me row + 3 rider rows on 360×780 | see shape of the group + exact numbers |
| **List only** | unmounted (saves battery/GPU) | full content area, ~7 rows | the glance mode: biggest numbers, nothing else |

Content area = window − safe areas − header 64 − banners − action bar (72 + 24 padding).
Reference: 720 − 64 − 96 = 560 → map 224, list 336 (me row 56 + 3×72 + slack).
No map-only mode in MVP (a map without numbers answers none of the three questions precisely).

Toggle placement: in Split, a floating 56×56 button on the map's top-left `☰` (`live.toListOnly`);
in List-only, a full-width 56-tall `surface` row at the top of the list `🗺 Show map` (`live.showMap`).
The toggle lives where the map is/was, so the header and action bar stay uncluttered.

## 2. Layout
```
┌──────────────────────────────────────┐
│ ‹  Sunday Run             ● Live  ⋯  │ RideHeader 64; line 2 "1:24 · 6 riders"
├──────────────────────────────────────┤
│ ⚠ SOS — Priya · 2.1 km behind  View  │ banner slot(s), 0–2 × 56 (00 §2.5)
├──────────────────────────────────────┤
│ [☰]                                  │
│        ·····(AR)★·····               │ RideMap, 40 %
│              ·  ●me                  │  trail line + markers
│      (PK)⏸  ·                        │
│                          [ ⤢ All ]   │ fit-everyone 56
│ © OpenFreeMap © OpenStreetMap        │
├──────────────────────────────────────┤
│(AR)  1.8 km ahead                    │ RiderRow 72
│      Arun ★ Leader       ▶ Moving    │
│▌(●) You · 42 km/h     ✓ Sharing      │ MeRow 56 (reference)
│(SM)  With you                        │
│      Sam                 ▶ Moving    │
│(PK)  4.2 km behind                   │
│      Priya          ⏸ Stopped · 6 min│
│ OFF ROUTE                            │ group label 32
│(JO)  ≈3.1 km away                    │
│      Jo             📶 No signal·4 min│
├──────────────────────────────────────┤
│ ┌────────┐ ┌──────────────┐ ┌──────┐ │ action bar 72 (+12 pad, + safe area)
│ │💬 Msg  │ │ ⚠ Hold for SOS│ │⏹ End │ │ End only for leader
│ └────────┘ └──────────────┘ └──────┘ │
└──────────────────────────────────────┘
```

## 3. Map (`RideMap`)
- MapLibre `Map` with `mapStyle = themes[scheme].mapStyle`; compass off, rotate off (north-up:
  stable for a glance), pitch off, logo/attribution: show OSM attribution text
  `live.attribution` bottom-left, 12, `bg` pill 80 % opacity. Scale bar off.
- **Leader trail:** `GeoJSONSource` LineString from `leaderTrail.points`; `Layer` line width 5,
  colour `mapTrail`, opacity 0.55, round caps/joins. Drawn under markers.
- **Rider marker** (`Marker` with `RiderAvatar` child), one per active member with a position, except me:
  - Circle `size.avatar` 40, fill `palette.rider[colorIndex]`, initials 14/700 `onRider`,
    outline 2 `markerOutline`, **status ring** 4 px outside the outline in the status colour.
  - Status badge 20 circle at top-right (status colour fill, glyph `onStatus` 12): ⏸ stopped,
    📶 offline, ⚠ SOS. Moving has ring only, no badge (less clutter for the common case).
  - Leader: 16 ★ badge at bottom-right (`bg` circle, `text` glyph).
  - Offline: whole marker opacity 0.5 and ring dashed (shows last known position, clearly stale).
  - SOS: size `avatarSos` 56, ring `status.sos` 6 px, pulsing halo (scale 1→1.6, opacity 0.6→0,
    1.2 s loop; static ring if Reduce Motion). SOS markers render on top (z-order last).
- **Me:** `size.meDot` 24 circle `palette.me`, outline 3 `markerOutline`; heading chevron 10 in
  `palette.me` when `heading` is known and speed > 2 m/s. No status ring (my state is in MeRow).
- **Camera:** on mount `fitBounds` over all positioned members incl. me, padding 48 (top padding
  +56 for the ☰ button). Auto re-fit when any rider leaves the viewport **unless** the user touched
  the map in the last `timing.fitIdleMs` (30 s). Max zoom 16 when fitting (two riders together
  should not zoom to street level), min span 300 m.
- **Fit everyone** button: 56 tall, `bg` fill, border 1 `border`, radius 16, `⤢ All` 16/700,
  bottom-right inset 12. Tap → fitBounds (400 ms) and resumes auto-fit. After a manual pan it gets a
  2 px `brand.primary` border to hint it is available.
- Tap a marker → select rider (§4 selection). Tap empty map → clear selection.
- Before any positions: map centred on my position (or world-zoom 2 if none) + overlay pill
  `live.mapWaiting`.

## 4. Rider list
**Sorting** (top→bottom):
1. Riders in SOS (pinned, newest SOS first).
2. On-trail riders by `alongM` (projection onto the leader trail) **descending** = furthest ahead
   first. **Me** sits in this order at my own `alongM` — the reference row; riders above me are
   ahead, below me behind. Ties (< 100 m, "level") keep stable order by name.
3. Group label `OFF ROUTE` (`live.offRoute`, 12/700 uppercase muted, 32 tall) then riders with
   `kind: 'away'`, by straight-line distance ascending.
4. Riders never seen (no position) last, under the same label.
Before the trail has 2 points every rider is `away`: show them sorted by distance **without** the
OFF ROUTE label (it would be wrong at the start).
Re-sorting animates with `LayoutAnimation` 200 ms; rows never jump while the user's finger is down.

**Keeping me visible:** in Split mode, after mount and after each re-sort, if the list has not been
touched for 10 s, scroll so MeRow is visible (centre if possible). In List-only with ≤ 7 riders the
list does not scroll at all.

**RiderRow** (`size.rowLive` 72, padding 8/16, divider 1 `border`):
```
(AV)  4.2 km behind                     line 1: distance 28/700 tabular + direction 20/600
      Priya ★ Leader      ⏸ Stopped · 6 min   line 2: name 16/600 + leader tag | StatusChip sm
```
- `RiderAvatar` 40 with status ring (same as marker, no pulse).
- Line 1 text by relative kind (distance formatting below):
  | kind | line 1 |
  |---|---|
  | ahead | `4.2 km` + ` ahead` |
  | behind | `4.2 km` + ` behind` |
  | level | `With you` (no number; < 100 m) |
  | away | `3.1 km` + ` away` |
  | no position for them | `No location yet` (20/600 muted) |
  | no position for me | `—` + line-1 suffix omitted; one info row at list top `live.noMyFix` |
  Offline rider: prefix `≈`, whole line 1 in `textMuted` (old data must look old).
- Line 2: name truncate tail; `★ Leader` tag 12/700 when role leader; right: `StatusChip size="sm"`
  — `▶ Moving` · `⏸ Stopped · 6 min` · `📶 No signal · 4 min` (= last seen 4 min ago) ·
  `📶 No signal yet` (never seen) · `⚠ SOS · 2 min` (sosStrong).
- SOS row: row bg `status.sosStrong`, all text `onStatus.sosStrong`, avatar ring white.
- **Distance format** (`formatDistance`, tabular): < 1 000 m → nearest 50 m `350 m`;
  1–9.9 km → one decimal `4.2 km`; ≥ 10 km → integer `12 km`. Never show more than 4 characters
  of number.
- Tap row → select: row gets 3 px `brand.primary` outline 5 s, map `easeTo` the rider (zoom keeps
  current unless < 13). Haptic `selection`. Long-press does nothing (avoid accidental modes).

**MeRow** (`size.rowMe` 56, bg `meRowBg`, 4 px left bar `palette.me`):
`me dot 24` · `You` 20/700 · my speed `42 km/h` 16 muted tabular (hidden when null or < 3 km/h) ·
right: `✓ Sharing` (text, 14/700) or amber chip `Not sharing` (tap → Fix flow, 04) or, when my SOS
is on, `⚠ SOS on` chip.

## 5. Action bar and menus
- **Messages** (`💬 Msg`, secondary, flex 1) → Quick messages sheet.
- **SOS** (`HoldButton`, flex 1.5, `status.sosStrong`, white 20/700 `⚠ Hold for SOS`) — 07 §4.
- **End** (leader only, flex 1, secondary with `sosStrong` 2 px border, `⏹ End`) →
  `ConfirmSheet` `live.endTitle`/`live.endBody`, confirm `live.endConfirm` (danger) → `endRide`.
  The ride layout then routes everyone to summary.
- Rider (non-leader) bar has Messages + SOS only (SOS flex 2).

**Quick messages sheet** (`Sheet`): title `live.msgTitle` 20/700; 2×3 grid of tiles, each 100 tall,
radius 16, `surface`, border 1; emoji 36 + label 16/700 (from `MESSAGE_KINDS`, in that order:
fuel, puncture, slow_down / regroup, break, all_good). Close button 56 at the bottom.
- Tap = send immediately (non-destructive, speed matters): `sendMessage(id, kind)`, haptic
  `Success`, sheet closes, toast `live.msgSent` ("Sent: ⛽ Fuel stop") 3 s.
- Same kind is disabled for 10 s after sending (tile shows `✓ Sent`), preventing double taps.
- Failure: toast `errors.<code>`; **no offline queue** (a stale "Regroup" is worse than none).
- My own messages raise no alert for me (alerts.ts already skips me).

**Ride menu (`⋯`)** sheet: `Share code` (shows code + Share, riders can join mid-ride) ·
`Leave ride` (rider; ConfirmSheet `live.leaveTitle`/`Body` → `leaveRide` + `stopRideTracking`
→ home) · leader sees `End ride` here too (same confirm) · `Close`.

## 6. States
| State | Behaviour |
|---|---|
| Loading (`!loaded`) | header + map placeholder (`surface`) + 3 skeleton rows; action bar active (SOS must work immediately) |
| `loadError` | inline row `errors.loadRide` + Try again at top of list; keep last data if any |
| Viewer offline (00 §2.4) | offline banner first; every rider's line 1 turns `textMuted` with `≈`; chips keep their derived state (their grey may be our fault — the banner says so) |
| Alone in ride | list = MeRow + hint `live.alone` ("Share the code so others can join") with Share button |
| Trail < 2 points | straight-line `away` distances, no OFF ROUTE label |
| Me = leader | my alongM = trail end; everyone is behind or level — correct and expected |
| Rider SOS | SOS row pinned, SOS banner + takeover (07) |
| Ride ended | layout routes to summary (08) |
| Light/dark | tokens; map style switches; markers identical |

## 7. Ticking and performance
- Status + header elapsed recompute every 5 s from a single `useNow(5000)` ticker plus store changes.
- `RiderRow` memoised on (userId, line-1 string, status, sinceMinutes) so rows re-render ≤ once per
  minute when nothing moves. Markers update position only on `positions` change.
- Keep-awake on (ride layout).

## 8. Accessibility
- RiderRow single element, label: "Priya, 4.2 kilometres behind, stopped 6 minutes" (leader adds
  ", leader"; offline: "no signal, last seen 4 minutes ago, about 3.1 kilometres away").
- MeRow: "You, 42 kilometres per hour, sharing location".
- Map is `accessibilityElementsHidden` except the Fit and ☰ buttons (the list carries all data).
- SOS HoldButton: label `live.a11ySos` ("SOS. Press and hold for 2 seconds to alert your group"),
  `accessibilityActions=[{name:'activate'}]` performs the hold for screen-reader users after a
  confirm sheet.
- `maxFontSizeMultiplier` 1.3 for header, rows, chips, action bar.
- Contrast: line-1 `text` on `bg`; offline `textMuted` (≥ 10:1); chips use `onStatus`.

## Copy
Keys `live.*` in 09.

## Acceptance checklist
- [ ] Split default (map 40 %), List-only toggle persists; map unmounted in List-only.
- [ ] On 360×780 Split shows header, map, MeRow + ≥ 3 rider rows, action bar without scrolling.
- [ ] Order: SOS pinned → ahead→behind by alongM with MeRow in place → OFF ROUTE → never seen.
- [ ] Line 1 is the largest text; distance format rules; "With you" for level.
- [ ] Offline riders: `≈`, muted, grey dashed marker at 50 % — never amber.
- [ ] Markers: rider colour + initials + status ring + badge; leader ★; me = orange dot; SOS 56 pulsing.
- [ ] Leader trail drawn; Fit everyone works; auto-fit pauses 30 s after a pan.
- [ ] Messages send in one tap with toast; 10 s per-kind cooldown; no offline queue.
- [ ] End ride (leader) needs a confirm; riders can Leave from the menu with confirm.
- [ ] OSM attribution always visible.
