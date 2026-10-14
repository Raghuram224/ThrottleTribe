# 22 — Map home ("Where to?" first, then solo or group)

Source: user request, 2026-10-14: *"I don't want to see this page as home screen, I want the map page as home
screen like Google Maps. When the user enters a location, ask the user is it an individual or group ride. Based on
the preference move further. Follow the Google Maps app flow."* Screenshot of today's Home (Android, Tribe light,
first run): brand header + avatar, "Welcome, Raghu" + 3-step explainer, Join with a code, Where to?, emergency
contacts nudge, footer "Start a ride".

## Decisions (user, 2026-10-14) — these override anything below that says otherwise

| # | Decision | Effect on this spec |
|---|---|---|
| 1 | **Group navigation: everyone gets turn-by-turn later, once hosted routing exists (D1).** Until then a group ride with a destination gives **every** rider the route line + stop card, and **no turn banner or voice for anyone in a group ride, the leader included.** | §3.8 option A (leader-only banner + voice), §0.1 row 9, the P2 `leaderNav` / `GROUP_LEADER_NAV` work and the P2 acceptance item are **not approved** and are dropped. Option C stays the plan after D1. `isNavActive` is fixed (§3.8.1): navigation is never *started* for a group ride; a ride that starts solo and gains riders keeps navigating for its leader (21 §10, unchanged). |
| 2 | **Route preview primary: Ride solo is the filled primary; Ride with a group is secondary.** | Confirms the §3.4 layout and closes open question 2. Positions stay fixed. |
| 3 | **The destination is not in the WhatsApp / invite text.** | Closes open question 3; the P3 "destination in the invite text" item is dropped. `lib/invite.ts` is not touched. |

Open questions 1-3 in §15 are answered by the table above.

### P1 review fixes (2026-10-14) — behaviour that differs from, or adds to, the text below
- **Default group ride name (decision 3):** the normal `defaultRideName(first)`, also with a destination (§3.6). The
  destination is not in the invite text, so it is not in the default name either.
- **No second open ride from the group form (§3.6):** `createGroupRide` returns `{ existing: false, ride }` or
  `{ existing: true, rideId, href }`. Without a `leaveRideId` it asks `getMyOpenRide()` inside the start lock; an open ride
  is opened as it is (toast `preview.existingRide`, or `newRide.existingRide` with no destination), nothing is created.
- **Create is not interruptible:** while the ride is being made, hardware Back, the modal swipe (`gestureEnabled: false`)
  and ✕ are blocked, so the stack cannot end as `[invite]` and an error is never lost.
- **Map remount (§4.3):** when the map comes back after a ride screen it starts at the camera the store holds now,
  centred again (`free` reset), not at the first-launch frame.
- **Planning watch (§4.3):** also requires the app in the foreground (`AppState`). A watch with a 10 m filter sends
  nothing to a rider standing still, so while watching a once-a-minute `getCurrentPositionAsync` heartbeat renews the
  fix; without it §4.4 would remove the marker of anyone standing still for 2 minutes.
- **Fix lost (§4.4):** implemented. `fixFresh(fix.at, now)`: the me marker, "Re-centre" and the follow camera ignore a
  fix older than 2 min (me slot goes back to "Finding you…"). Route mode keeps its start point.
- **Where to? keyboard (§3.2):** with location on, the input is focused only after the typing lock has been judged
  against a live (watch) fix, at most 1.5 s after the permission is granted (`shouldFocusSearch`). Decided once: a later
  unlock does not pop the keyboard.
- **Sheet (§3.1.1):** collapsing resets the body scroll to the top. The bottom inset is now after the last row (the
  body is clipped above it) instead of between the peek and expanded blocks.
- **Attribution (§3.1.1 item 6):** on the map above the sheet at peek (fading out over the first quarter of a drag up);
  when the sheet is expanded it is the sheet's own footer row above the gesture inset (`attributionInSheet`), because an
  expanded sheet reaches up under the search bar. Visible somewhere whenever the map is mounted.
- **Switch sheet (§3.4.2):** "Leave and continue" re-reads the open ride first (`confirmedSwitch`): the same lobby ride
  is left; if it ended nothing is left; if it started, changed or I became leader, Home shows it as it is (and asks again
  for a lobby ride) instead of leaving it on the old confirmation.
- **Guards:** a second tap on Ride with a group does not push the form twice; Android Back is blocked while Just ride
  solo starts; the browse camera is not written once there is no session.
- **Accessibility (§10):** `onAccessibilityEscape` on the place and route panels = `plan.back()` (iOS; Android has no
  such gesture and uses Back).
- **Group-ride marker (§3.8.1):** pruned when its ride ends or I leave it (ride layout) and when Home sees it in the
  ended list, not by count (a 100-entry cap only stops a runaway list). `isGroupRide` is read once per ride.
  **Limitation:** the marker is device-local, so it fails open: on another device or after a reinstall a leader alone in a
  group ride would navigate. **Follow-up (needs a migration):** a server-side `rides.is_group` flag set by `create_ride`.

Builds on 00, 02, 04, 05, 13 §3, 16 §3, 17, 19 A, 20 C1/C4/C5, 21 (P1–P3 notes and D1–D4, D2a).
Code read: `src/app/(app)/{home,where-to,route-preview,new-ride,_layout}.tsx`, `ride/[id]/{_layout,lobby,search}.tsx`
(menu, stop notice, nav wiring), `src/app/{index,join}.tsx`, `lib/{routing,enter-ride,ride-start,solo-ride,solo-nav,
nav-engine,reset-to-ride}.ts`, `hooks/use-planning-position.ts`, `components/{route-preview-map(.web),place-search-view,
map-controls,live-sheet}.tsx`, `store/nav-store.ts`, `theme/tokens.ts`, `lib/icon-names.ts`, `lib/telemetry/events.ts`,
`lib/copy.ts` (home, whereTo, preview, newRide, lobby, stop keys), `supabase/migrations/0009_next_stop.sql`.
Docs checked: Expo SDK 57 `expo-router` (`router.dismissTo`: "Dismisses screens until the provided href is reached.
If the href is not found, it will instead replace the current screen"; params on `dismissTo` are undocumented, so
this spec never relies on them).

**Constraints kept:** no Google name, logo, fonts, tiles or APIs (19, 17 §0). OpenFreeMap tiles, Photon search, OSRM
routing, all attributed. No secret in the app. Location is never requested at launch and never without an explainer
(04, rule 8). Status = colour + icon + text. Every target ≥ 56 dp (chips 48 visual with a 56 hit, as 21).

---

## 0. Summary

**Purpose:** open the app on a map centred on me, pick where to ride, then choose **solo** or **group** and go.

**One-second glance (at rest, phone in hand or on the mount before setting off):**
1. Am I offline / is a ride already running? (offline banner at the top; "Back to ride" card at the bottom)
2. Where am I? (my marker on the map)
3. Where to? (the search bar, and my recent places one thumb-tap away in the sheet)

**The flow in one line (Google Maps pattern, our branding):**
Map home → search → place sheet → **Directions** → route preview → **"How are you riding?" Ride solo / Ride with a
group** → solo: today's 21 navigation · group: ride setup with the destination attached → lobby → live.

**How it is built:** Home becomes one screen with **one MapLibre map** and three modes (`browse` → `place` →
`route`) held in a small store. The search screen stays a separate route (`/where-to`, full screen, no map). The
route preview stops being a separate route and becomes Home's `route` mode, so the map never reloads between steps.
Solo uses `startNavigationRide` unchanged. Group uses `new-ride` with the place pre-filled and attaches it with
`propose_stop` right after `create_ride` (the leader's stop applies at once, in the lobby). **No migration.**

| Phase | Ships | New dependency |
|---|---|---|
| **P1** Map home + choice | Map home (browse), sheet with all old Home content, search bar + chips → `/where-to`, place sheet, route mode with **Ride solo / Ride with a group**, solo wired to 21, group wired to `new-ride` **with the destination attached** at create, lobby caption "Riding to …", open-ride states, first-run, no-permission and offline states, web parity | none |
| **P2** Group with destination | Lobby destination card (≈ distance per rider, set by, leader Remove), **leader-only turn banner + voice in a group ride** (pending Q1), lobby menu copy fix | none |
| **P3** Polish | Chip results as pins on the home map, long-press to drop a pin, "Make it the destination" for a lobby leader, change destination from the lobby, "Stay" chip, destination in the invite text (pending Q3) | none |

### 0.1 Prior decisions this spec changes
| # | Was | Now | Why |
|---|---|---|---|
| 1 | 02 / 13 §3 / 16 §3: Home is a scrolling card page with a footer "Start a ride" primary | Home is a full-screen map with a floating search bar and a two-snap bottom sheet that holds the old content (§0.2). The screen's primary is the **search bar**; there is no filled footer button unless a ride is open ("Back to ride") | User request: map page as home, like Google Maps |
| 2 | 17 §2: "No floating search pill, no bottom-sheet drag handle" | **Map home only:** a floating search bar + chip row, and a draggable sheet with a grabber (it really drags, like the live group sheet, and has a tap/chevron alternative). Live keeps 20 C2 (search in the header) | 17 §2 protected the live map's glance and camera framing. Home is used at rest; the bar is counted in the camera padding (the 20 C2 camera rule) |
| 3 | 21 §2.1: Home card "Where to?" | The search bar **is** Where to? (placeholder "Where to?") | Same entry, Google position |
| 4 | 21 §2.2: Where to? is never auto-focused | Auto-focused **when opened from the bar** (the rider asked to type). Not focused when opened from a chip, and never while the typing lock is on (21 §2.2.2 unchanged) | Tapping a search field means "type". With no footer on the search screen any more, the keyboard leaves 5 recent rows visible at 360×780 |
| 5 | 21 §2.2: Where to? footer "Just ride, no destination" (2 taps from Home) | Home sheet tile **"Just ride solo"** (1 tap). The search screen has no footer | Free rides live on the map home (§3.9) |
| 6 | 21 §2.2: picking any row pushes `/route-preview` | **New place** (search result) → Home `place` mode (place sheet). **Recent place** (from the search screen or the home sheet) → straight to Home `route` mode. `/route-preview` becomes a redirect into Home (§5) | Google: a new place shows its card first; a place you already went to goes straight to directions. Keeps the fast path (§1) |
| 7 | 21 §2.3: one primary **Go** on the preview | Two stacked actions under "How are you riding?": **Ride with a group** (secondary, above) and **Ride solo** (primary, lowest) | User decision: ask solo or group after the place is chosen. Two actions on the preview, not a sheet after Start (§3.4.1) |
| 8 | 21 §1: 3 taps Home → recent → Go | **2 taps** from a recent place in the home sheet (recent → Ride solo); 3 from the search screen's recents; 4 for a searched place (bar, result, Directions, Ride solo) | Recents are in the thumb zone; the place sheet costs one tap only for new places |
| 9 | 21 §6 / `isNavActive`: a group never starts navigation | **P2, pending Q1:** the **leader** of a group ride with a stop gets the turn banner + voice; other riders get the route line + stop card (19 A, unchanged) | Same request budget as one solo rider; the group follows the leader; removes today's quirk where a group ride started with only the leader present navigates and one started with two does not (§3.8) |
| 10 | 13 §3 greeting as the page title ("Good evening, Raghu", 28) | Greeting moves to the sheet header (16 semibold). First run keeps "Welcome, {name}" there | Nothing big floats over the map; the greeting is warmth, not a glance fact |
| 11 | 02: with a lobby ride open, "Start a ride" stays as a secondary (switch / leader-busy sheets) | With any open ride the three tiles are hidden. Starting another ride is still possible from a place's route mode, which runs the same switch / leader-busy sheets | One open-ride state, one primary ("Back to ride") |
| 12 | 05: the lobby has no destination | Lobby shows the ride's destination (P1 caption, P2 card) | Group rides can now be created with one |
| 13 | 21 §2.2 Where to? is entered from Home's card and closes back to Home | Where to? returns its pick to Home through `plan-store` and `router.back()`; it never pushes a preview | One map instance (§2) |

### 0.2 What happens to today's Home content
| Today | New place | Why / notes |
|---|---|---|
| Brand lockup (mark + "Throttle Tribe") | Brand mark 24 at the left end of the search bar | Identity stays orange in both styles (17 §0.3); the header row goes |
| Avatar 40 + amber to-do dot → Profile | Right end of the search bar, same avatar, dot and a11y label | Google position; unchanged behaviour |
| Greeting "Good morning/afternoon/evening, {name}" / "Ready to ride?" | Sheet header text (greeting only). "Ready to ride?" retired | The bar's "Where to?" asks the question |
| First run: "Welcome, {name}" + "three steps away" + 3-step explainer | Sheet, **expanded on first run** (once). Step 1 is reworded for the new flow (§8) | The explainer is the first-run moment; the map is visible above it once collapsed |
| Join with a code card | Sheet tile **"Join with a code"**, always in the peek (one tap) | Must stay one tap away |
| Where to? card | The search bar | — |
| Emergency contacts nudge (one nudge max, contacts > save account) | Expanded sheet, after recent places / the location row (order in §3.1.2) | Not a ride-blocking item; the to-do dot, the lobby setup row and the lobby nudge banner (11 §4) still carry it |
| Stats strip (month) | Expanded sheet | Rest-time information |
| Recent rides (5 + See all) | Expanded sheet | Rest-time information |
| Footer "Start a ride" (primary) | Sheet tile **"Start a group ride"** (no destination), and **Ride with a group** on any place's route preview | Group rides now usually start from a destination; a destination-less group ride is still one tap |
| Ride in progress card (convoy, exception line, Back to ride) | Peek: compact card with **Back to ride** (the primary). Expanded: the full card with the convoy strip | Unchanged data (`useHomeConvoy`) |
| Offline banner `home.offlineSaved` | Full-bleed at the top, above the search bar, new text `homeMap.offline` | Viewer offline is said first (rule 2) |
| Welcome toast after onboarding | Unchanged | — |
| Switch / leader-busy confirm sheets | Unchanged copy; now opened from route mode's two actions | — |

---

## 1. Flow

```
                         ┌───────────── Home (one screen, one map) ──────────────┐
launch → gate ──none──►  │ browse ──[place picked]──► place ──[Directions]──► route │
            │            │   ▲  ▲          (Android back / ‹ / ✕) ◄──┘   ◄──(‹ / back)┘ │
            │            │   │  └─────[recent place: home sheet or search recents]────┘ │
            │            └───┼────────────────────────────────────────────────────────┘
            │                │ bar / chip                       route ─[Ride solo]──► startNavigationRide (21 §2.4)
            │                ▼                                    │                    → [permissions] → live (nav)
            │           /where-to (search, full screen)           └─[Ride with a group]─► /new-ride?dest=1 (modal)
            │                                                          → create_ride + propose_stop
            ├─active ride──► /ride/<id>/live  (unchanged)              → invite?first=1 → [permissions] → lobby → live
            └─lobby ride───► /ride/<id>/lobby (unchanged)
Home sheet tiles: Start a group ride → /new-ride · Join with a code → /join · Just ride solo → startSoloRide → live
Open ride on Home: peek = Back to ride (primary) · search bar (active ride) → /ride/<id>/search?from=home
```

**Tap counts (from the map home, no ride open):**
| Goal | Taps |
|---|---|
| Solo to a recent place | recent row in the sheet (1) → **Ride solo** (2) |
| Solo via search recents | bar (1) → recent (2) → Ride solo (3) |
| Solo to a new place | bar (1) → result (2) → Directions (3) → Ride solo (4). Chip: chip, result, Directions, Ride solo |
| Group to a recent place | recent (1) → Ride with a group (2) → Create ride (3) → invite Continue (4) → lobby Start (5) |
| Just ride solo / Start a group ride / Join | 1 tile tap |

The first ride ever adds the permissions explainer (04), as every ride does today.

**When rows are created:** solo at **Ride solo** (21 §2.4, unchanged); group at **Create ride**. Browsing the map,
searching, opening a place or a route creates nothing on the server.

---

## 2. How Home is built (engineer)

### 2.1 One map, three modes
- `src/store/plan-store.ts` (zustand, memory only except `camera`):
  ```ts
  type PlanMode = 'browse' | 'place' | 'route';
  interface PlanState {
    mode: PlanMode;
    place: PlanPlace | null;          // { id, name, address, lat, lng, category } (Place minus distance)
    from: 'search' | 'recent' | null; // how the place came in (telemetry, and what Back does from route)
    query: string;                    // the search text that found it ("search again" from the bar)
    sheetSnap: 'peek' | 'expanded';
    camera: { lat: number; lng: number; zoom: number } | null; // browse camera, persisted (§4.2)
    openPlace(p: PlanPlace, query: string): void;   // → place
    openRoute(p: PlanPlace, from: 'search' | 'recent'): void; // → route (recents, Directions)
    back(): boolean;                  // planBack(); false = nothing to undo (let the OS handle it)
    reset(): void;                    // → browse, place null (called on every ride entry, §5.3)
  }
  ```
- `src/lib/plan-flow.ts` (pure, Jest): `planBack(s)`:
  `route` → `place` when `from === 'search'`, else `browse` · `place` → `browse` · `browse` + `expanded` → `peek` ·
  `browse` + `peek` → `null` (OS default: leave the app). Also `homeSheetBlocks(...)`, `initialSheetSnap(...)`,
  `peekRecentCount(windowH)`, `homeMapMounted(pathname)`, `meSlotForHome(...)`, `searchBarTarget(openRide)` (§3, §4).
- Home's `BackHandler` calls `plan.back()` and returns its result. `useFocusEffect` scopes it to Home being focused.
- **Rejected alternative:** place / route as routes over a layout-owned map. Native-stack screens are opaque to
  touches, so the map underneath would not pan, and every step would be a screen animation over a static map.

### 2.2 Map component
`src/components/plan-map.tsx` + `.web.tsx`: **`route-preview-map(.web).tsx` renamed and extended** (same route layers
via `navRouteLayerProps` / `syncNavRouteLayers`, `StopPin`, `MeMarker`, `colors.mapStyle`, north-up, no rotate or
pitch, attribution off in the native view and drawn by Home). New props:
```ts
interface PlanMapProps {
  me: { lat: number; lng: number; accuracyM: number | null } | null;
  place: { lat: number; lng: number; kind: StopKind } | null;   // pin (place + route modes)
  line: NavLine | null; faded?: boolean;                         // route mode only
  padding: { top: number; bottom: number; left: number; right: number };
  intent: CameraIntent; intentNonce: number;                     // re-run the intent when the nonce changes
  initial: { lat: number; lng: number; zoom: number };           // first frame, no animation
  onUserGesture(): void;                                         // ViewStateChangeEvent.userInteraction (as ride-map.tsx)
  onIdle(center: { lat: number; lng: number }, zoom: number): void; // browse only: persist the camera
  onMapError(): void;                                            // style or tiles failed (§6)
  onMapPress?(): void;                                           // browse: collapse an expanded sheet
}
type CameraIntent =
  | { kind: 'me'; zoom: number }            // ease 450 ms (RECENTRE_MS) to my fix
  | { kind: 'place'; zoom: number }         // ease 400 ms to the pin
  | { kind: 'fit' }                         // fitBounds(route + me + dest), FIT_MS 400 (today's preview)
  | { kind: 'none' };
```
The same marker and line components as live, so a destination pin on Home, the preview and live are one thing.

---

## 3. Screens

Reference phone 360×780 dp (status bar 24, gesture inset 24). Every value comes from `src/theme/tokens.ts`; new
tokens in §9. Floating elements on the map are `surfaceRaised` + `elevate('e2')` (shadow in light, `edge2` hairline
in dark).

### 3.1 Map home — `browse` mode (`src/app/(app)/home.tsx`, rewritten)
**Purpose:** see where I am and start: search a place, pick a recent one, or use a tile.
**Glance:** my marker; the bar "Where to?"; at the bottom either the tiles + recent places, or **Back to ride**.

#### 3.1.1 Layout, top to bottom (z-order: map lowest)
1. **Map** (`PlanMap`), full bleed, under the status bar. `StatusBar style="auto"`.
2. **Offline banner** (viewer offline, `useNetOffline`): `Banner tone="offline" icon="offline"` full-bleed,
   `paddingTop: insets.top`, text `homeMap.offline`. Pushes the bar down by its height (`bannerH`). Never amber.
3. **Search bar** `HomeSearchBar` (new): `position: absolute`, `top: insets.top + bannerH + space.sm`, left/right
   `space.md` 12 (336 wide at 360), height `size.searchBar` 56, radius `radius.pill`, `surfaceRaised`, e2.
   - Left: padding 16, brand mark 24 (`logo-mark.png` / `logo-mark-on-dark.png` by scheme; static orange, never
     tinted: 17 §0.3), gap 12.
   - Middle (flex, 1 line, tail truncate): placeholder `homeMap.searchPlaceholder` 16 `family.regular` `textMuted`.
     Active ride: `homeMap.searchStops` "Search stops for {ride}" (§3.10).
   - Right: avatar button 56×56 (RiderAvatar 40, `colorIndex 0`, `me`, amber 10 dp to-do dot with a `bg` 1 dp
     border: today's `home.tsx` markup moved as is), label `pill.label` (`profilePill`).
   - The bar minus the avatar is **one** button: pressed fill `surfacePressed`, haptic `select`,
     → `searchBarTarget(open)` (§3.2 / §3.10). `maxFontSizeMultiplier` 1.3 (fixed height).
4. **Chip row** `HomeChips` (new): `top: barBottom + space.sm`, horizontal `ScrollView`, content padding-x 12, gap 8.
   Chips from `SEARCH_CHIPS` (Fuel, Coffee, Food, Parking, Toilets), each `minHeight` 48 + `hitSlop` 4 top/bottom
   (56 hit), radius pill, `surfaceRaised`, e2, glyph 20 + label 16 semibold `text`, padding-x 12. No selected state
   on Home (selection lives on the search screen). Tap → haptic `select` → `push('/where-to?chip=<key>')`.
   Hidden: when the sheet is `expanded` (it would sit under the sheet), in `place` / `route` modes, and while an
   active ride is open.
5. **Me slot** (bottom-left, `left: space.md`, `bottom: sheetH + ATTRIBUTION_CLEAR` 36). One element
   (`meSlotForHome`), the 20 C1 pill anatomy (56 tall, pill, `fabBg`, e2, icon 24 + label 16 semibold `brandOnBg`):
   | Permission / fix / camera | Slot |
   |---|---|
   | granted, fix, camera centred on me | nothing (the marker says it) |
   | granted, fix, camera moved by the rider | **Re-centre** (`centerMe`, `live.recentre`) |
   | granted, no fix yet | **Finding you…** (`homeMap.findingYou`), disabled, opacity 0.5 |
   | undetermined / denied (can ask) / blocked / location services off | **Show my location** (`permLocation`, `homeMap.showMe`) → explainer sheet (§3.1.5) |
   Hidden when the sheet is `expanded` (no map visible).
6. **Attribution** pill (bottom-left, `bottom: sheetH + space.sm`): `live.attribution` 12 regular `text` on
   `surfaceRaised` @ 0.85 (as the preview). Never hidden while any map is visible.
7. **Home sheet** `HomeSheet` (new; mechanics copied from `LiveSheet` group: header-only pan, settle by velocity,
   Reduce Motion snaps without animation, screen-reader increment/decrement). Two snaps:
   - `peek` = header 56 + peek block (measured) + `space.sm` + `insets.bottom`.
   - `expanded` = content height, capped at `windowH − (insets.top + bannerH + 8 + 56 + 8)` (the sheet top stops
     8 dp under the bar; the bar stays reachable). The body scrolls when capped.
   - Panel: `surfaceRaised`, top radius `radius.xl` 24, e3, no side margins.
   - **Header** (56, the drag and tap target): grabber 4×40 `borderStrong` centred 6 from the top; left text
     (padding-left 16) 16 `family.semibold` `text`, 1 line: first run `home.firstTitle` / `home.firstTitleNoName`,
     else the greeting (`greetingCopyKey`); right: chevron button 56×56, icon `chevronUp` (peek) / `chevronDown`
     (expanded) 24 `textMuted`. Tap anywhere on the header (or the chevron) toggles, haptic `select`.
     a11y: `accessibilityRole="adjustable"`, label `homeMap.sheetA11y`, value `live.sheetValueCollapsed` /
     `live.sheetValueExpanded`, increment/decrement actions.
   - Collapses also on: Android back (expanded first, §5.1), a tap on the map strip above it (`onMapPress`).
   - The camera's bottom padding follows the **visible** sheet height (shared value, as live).

#### 3.1.2 Sheet content by state (`homeSheetBlocks`, pure, tested)
Peek block (always visible) / expanded-only blocks, in order:

| State | Peek block | Expanded adds (in order) |
|---|---|---|
| **First run** (no rides ever, no open ride) | `home.firstSub` 14 muted (1–2 lines) · **Tiles** | LocationRow (if not granted) · 3 steps (`FirstRunSteps`, step 1 reworded) · nudge |
| **Returning**, no ride | **Tiles** · up to `peekRecentCount(windowH)` recent places (2 when `windowH ≥ 760`, else 1; 0 if none) | "Recent places" section (up to 5, Clear) · LocationRow (if not granted) · nudge · stats strip · recent rides (5 + See all) |
| **Ride open — active** | Compact ride card + **Back to ride** (primary) | Full ride card (convoy strip) · nudge · recent rides |
| **Ride open — lobby** | Compact ride card ("Waiting in the lobby") + **Back to ride** | nudge · recent places (5, Clear) · recent rides |

- **Initial snap** (`initialSheetSnap`): first run and `pref.homeFirstRunSeen` not set → `expanded`; set
  `homeFirstRunSeen` the first time the sheet is collapsed or a ride is created. Everything else → `peek`. On every
  return to Home (focus) the sheet goes back to `peek` unless first run.
- Loading (rides / open ride not fetched yet): returning layout without recent rides; the ride card fades in
  (150 ms) when found (02 rule: never block the tiles on this fetch). Recent rides: 2 skeleton rows (exists).
- Errors fetching recent rides: the section hides (13 §3, unchanged).

#### 3.1.3 Tiles (`QuickTiles`, new)
Three equal tiles in one row, gap 8, padding-x 16: width `(windowW − 32 − 16) / 3` = **104** at 360.
`minHeight` `size.quickTile` 80 (grows with text), radius `radius.lg` 16, bg `surface`, pressed `surfacePressed`
(+ the `PressableScale` press motion), padding 8, centred column: icon circle 32 `brandTint` with icon 20
`brandOnBg`, gap 8, label 14 `family.semibold` `text`, centred, up to 2 lines (3 at 1.3×).

| Tile | Icon | Label | a11y label | Action |
|---|---|---|---|---|
| 1 | `riders` | `homeMap.tileGroup` "Start a group ride" | `homeMap.tileGroupA11y` | `push('/new-ride')` (today's form, no destination) |
| 2 | `dialpad` | `homeMap.tileJoin` "Join with a code" | `homeMap.tileJoinA11y` | `push('/join')` |
| 3 | `bike` | `homeMap.tileSolo` "Just ride solo" | `homeMap.tileSoloA11y` | `startSoloRide(thresholdS)` → `resetToRide` (today's Just ride, unchanged; full map the first time). Tile shows a spinner in the icon circle and ignores taps while it runs; error → toast `errorText(code)` |

Tiles are tonal on purpose: the screen's primary is the search bar; the tiles are equal alternatives. Hidden while a
ride is open (§3.10).

#### 3.1.4 Recent places in the sheet
- Rows = `PlaceRow` 64 with the `history` tile (as `RecentPlacesSection`), name 16 semibold, address 14 muted,
  distance 14 semibold tabular from my fix (no column without a fix).
- Peek rows have no section label; their a11y label is prefixed `homeMap.recentA11y` "Recent place, {row}".
- Tap → haptic `select` → `plan.openRoute(place, 'recent')` (straight to route mode, §3.4).
- Expanded: `SectionLabel` `homeMap.recentPlaces` + text button `whereTo.clear` (56 hit) → the existing
  `whereTo.clear*` ConfirmSheet.

#### 3.1.5 Location (rule 8, 04: explain before asking, never at launch)
- Home **never** calls `requestForegroundPermissionsAsync` on its own. Position: `usePlanningPosition()` (permission
  read, last-known ≤ 2 min, Balanced watch every 10 m while Home is focused). It already writes `nav-store.origin`.
  Add `servicesEnabled` (`Location.hasServicesEnabledAsync()`, re-read on `AppState` active).
- `LocationRow` (moved from `where-to.tsx` to `src/components/location-row.tsx`, props `title`, `body`): on Home it
  uses `homeMap.locTitle` / `homeMap.locBody`; services off: `homeMap.locServicesTitle` / `homeMap.locServicesBody`
  with `perm.openSettings`. Blocked (`canAskAgain === false`): `perm.openSettings` → `Linking.openSettings()`.
- **Show my location** (me slot) opens a `Sheet` with the same LocationRow content and its button. After a grant the
  sheet closes, haptic `success`, camera intent `me`.
- Without location the map shows the saved camera, else `HOME_FALLBACK_CAMERA` (India, zoom 4, §4.2). Search,
  places and routes still work (no bias, no distances; the route needs a start point, §3.4).

#### 3.1.6 Wireframes

**A. New user, first run, no location permission (sheet expanded once)**
```
┌────────────────────────────────────────┐
│ status bar (map under it)              │
│ ( [mark]  Where to?             (RA)• )│ bar 56: mark 24 · 16 muted · avatar 40 + amber dot
│ (Fuel) (Coffee) (Food) (Parking) (To…  │ chips 48 (56 hit); hidden while expanded, shown on peek
├──────────────────── ── ────────────────┤ sheet expanded, top 8 under the bar, radius 24
│ Welcome, Raghu                     (˅) │ header 56: 16 semibold · chevron 56
│ Your first group ride is three steps   │ 14 muted
│ away.                                  │
│ ┌────────┐ ┌────────┐ ┌────────┐       │ tiles 104×80, gap 8
│ │ (grp)  │ │ (dial) │ │ (bike) │       │   icon 32 brandTint / 20 brandOnBg
│ │Start a │ │Join    │ │Just    │       │   14 semibold, 2 lines
│ │group   │ │with a  │ │ride    │       │
│ │ride    │ │code    │ │solo    │       │
│ └────────┘ └────────┘ └────────┘       │
│ [pin]  See where you are               │ LocationRow: tile 40 brandTint · 16 semibold
│  40    Shows you on the map and finds  │   14 muted, up to 3 lines
│        places near you. …              │
│ (          Allow location            ) │ BigButton secondary 56
│ (1)─ Pick where you're riding          │ FirstRunSteps (step 1 new copy)
│  │   Search a place, then choose solo… │
│ (2)─ Share the 6-digit code            │
│ (3)─ Ride. Nobody gets lost.           │
│ [shield] Add emergency contacts  Add ✕ │ NudgeCard (unchanged)
└────────────────────────────────────────┘
Collapsed (peek): header + sub + tiles; map above shows India at zoom 4, me slot "Show my location".
```

**B. Returning rider, location granted, no ride (peek)**
```
┌────────────────────────────────────────┐
│ ( [mark]  Where to?              (RA) )│ top = insets.top + 8
│ (Fuel) (Coffee) (Food) (Parking) (To…  │ top chrome bottom = 144 at 360×780
│                                        │
│                 (me)                   │ camera centred on me, zoom 15, north-up
│                                        │ clear map ≈ 328 dp
│ © OpenFreeMap © OpenStreetMap          │ attribution (me slot empty: centred)
├──────────────────── ── ────────────────┤ peek = 56 + 80 + 12 + 128 + 8 + inset
│ Good evening, Raghu                (˄) │
│ [ Start a  ] [ Join with ] [ Just ride]│ tiles
│ [group ride] [  a code   ] [   solo   ]│
│ [hist] Mysuru Palace            118 km │ PlaceRow 64 → route mode (2 taps to ride)
│  40    Sayyaji Rao Rd, Mysuru          │
│ [hist] Nandi Hills               61 km │
└────────────────────────────────────────┘
```

**C. Returning rider, sheet expanded**
```
│ ( [mark]  Where to?              (RA) )│ chips hidden
├──────────────────── ── ────────────────┤ top 8 under the bar
│ Good evening, Raghu                (˅) │
│ tiles                                  │
│ (2 peek recent rows)                   │
│ RECENT PLACES                   Clear  │ SectionLabel 32 + text button 56 hit
│ … up to 3 more rows (5 total)          │
│ [shield] Add emergency contacts  Add ✕ │ one nudge max
│ ┌ 214 km │ 3 Rides │ 7 h 40 ┐          │ StatsStrip (unchanged)
│ RECENT RIDES                  See all  │
│ [sketch] Sunday Run         Sat 10 Oct │ RecentRideRow 80 (unchanged)
│ …                                      │ body scrolls; no empty space below the last row
```

**D. Ride open — active (peek)**
```
│ ( [mark]  Search stops for Sunday Run (RA) )│ → /ride/<id>/search?from=home ; chips hidden
│                 (me)                   │
│ ( > Re-centre )56                      │ only after the rider panned
│ © OpenFreeMap © OpenStreetMap          │
├──────────────────── ── ────────────────┤
│ Good evening, Raghu                (˄) │
│ ┌──────────────────────────────────┐   │ RideProgressCard variant="compact" (traits.heroCard)
│ │ ● RIDE IN PROGRESS         1:24  │   │   12 label + 8 dp green dot · elapsed 14 tabular
│ │ Sunday Run                       │   │   20 bold, 1 line
│ │ You're the leader · 5 riders     │   │   14 muted
│ │ [pause] Priya · stopped 6 min    │   │   exception line: status icon + text (never colour alone)
│ │ [        Back to ride  >       ] │   │   BigButton primary 56 = the screen's one primary
│ └──────────────────────────────────┘   │
Expanded adds the convoy strip inside the card (today's full card), the nudge and recent rides.
```

**E. No location permission (returning, peek) and viewer offline**
```
│▓ [signal-off] You're offline — the map and search may not load ▓│ Banner offline (status.offline / onStatus.offline)
│ ( [mark]  Where to?              (RA) )│ pushed down by the banner
│ (Fuel) (Coffee) (Food) …               │
│        saved camera or India, zoom 4   │ cached tiles only; missing tiles show the style background
│ ( [pin] Show my location )56           │ me slot → explainer sheet (never the OS prompt directly)
│ © OpenFreeMap © OpenStreetMap          │
├──────────────────── ── ────────────────┤
│ Good evening, Raghu                (˄) │
│ tiles (enabled; their own screens explain network errors, 02 rule)
│ recent places (no distance column: no fix)
```

### 3.2 Search — `/where-to` (changed)
**Purpose and glance:** unchanged (21 §2.2). Changes only:
- Params: `?focus=1` (from the bar: `autoFocus` unless typing-locked), `?chip=<key>` (chip preselected, no focus),
  `?q=<text>` (search again from the place bar, focus + text). `PlaceSearchView` gets `initialText` and
  `initialChip` props; nothing else in it changes (chips, results, typing lock, attribution).
- Back button label `whereTo.a11yBack` "Back to home" (exists). Back keeps Home's mode as it was.
- **Pick a search result** → `plan.openPlace(place, text)` → `router.canGoBack() ? router.back() : router.replace('/home')`.
- **Pick a recent** → `plan.openRoute(place, 'recent')` → same return.
- **Footer removed** ("Just ride" is the Home tile). Attribution stays pinned at the bottom.
- LocationRow stays (21 §2.2.1 copy), offline banner stays.
```
┌────────────────────────────────────────┐
│ ‹  ( [search] Search cafes, fuel, |  ) │ 56: back 56 + input 56, focused, keyboard up
│ (Fuel) (Coffee) (Food) (Parking) →     │ chips 48
│ RECENT                          Clear  │
│ [hist] Mysuru Palace            118 km │ → Home route mode (recent rule)
│ [hist] Nandi Hills               61 km │
│ … (5 rows stay above the keyboard)     │
│ ┌──────────── keyboard ──────────────┐ │
```

### 3.3 Place sheet — Home `place` mode
**Purpose:** confirm this is the right place. **Glance:** the name and how far it is.
- Map: `StopPin` (kind from `stopKindFor(category)`) at the place; my marker if known. Camera intent
  `{ kind: 'place', zoom: HOME_PLACE_ZOOM 15 }` with padding top = bar bottom + 24, bottom = panel height + 24 + 28,
  sides 48. The browse camera is kept in the store and restored on Back.
- Bar in place mode: left back button 56 (`back` 28, label `homeMap.barBackA11y` "Back to map") → `plan.back()`;
  middle = place name 16 `family.semibold` `text`, 1 line (tap → `push('/where-to?q=<query>')`, label
  `homeMap.barPlaceA11y`); no avatar, no chips.
- Panel `PlacePanel` (new), fixed (no drag), `surfaceRaised`, top radius 24, e3, padding 16 + `insets.bottom`:
```
├────────────────────────────────────────┤
│ Mysuru Palace                     (✕)  │ 20 semibold, up to 2 lines · close 56 (top-right)
│ ≈ 118 km away · Landmark               │ 16 semibold tabular (straight line) + " · " category 14 muted
│ Sayyaji Rao Rd, Mysuru                 │ 14 textMuted, up to 2 lines
│ [ >            Directions            ] │ BigButton primary prominent 56, icon navigate
└────────────────────────────────────────┘ ≈ 204 dp at 360 (1-line name and address)
```
- Distance: `formatDistance(haversine(me, place))` with `place.distance` "≈ {km} away"; no fix → `stop.noFix`.
  Category word only for chip categories (`search.chip*` label); `other` shows none. No OSRM request in this mode.
- ✕ (label `place.closeA11y` "Close {name}") and Android back → browse. **Directions** → haptic `select`,
  `plan.openRoute(place, 'search')`, `track('home.directions')`.
- On enter: `AccessibilityInfo.setAccessibilityFocus` on the name; the panel is one group labelled
  `place.a11ySummary`.

### 3.4 Route preview with the choice — Home `route` mode
**Purpose:** see the trip, then say how you are riding. **Glance:** `1 h 34 min · 119 km`, then the two choices.
The 21 §2.3 preview, moved into Home: `RoutePanel` (new, the body of today's `Preview` component), the same
`usePreviewRoute`, the same states table (21 §2.3), the same car note / D2a flag, the same `previewPadding` for the
fit and the same floating back circle (`fabBg`, 56, `top: insets.top + bannerH + 8`, `left: 12`,
label `preview.a11yBack` now "Back"). Only the bottom changes:

```
┌────────────────────────────────────────┐
│ (‹)56                                  │ back → place (from search) or browse (from a recent)
│        (me)━━━━┓                       │ route navRoute + casing, pin, me; fitBounds
│                ┗━━━━━━━━━━━━━━━(flag)  │
│ © OpenFreeMap © OpenStreetMap · OSRM   │
├────────────────────────────────────────┤ panel surfaceRaised, radius 24, e3, padding 16
│ 1 h 34 min · 119 km                    │ 28 bold tabular + 20 semibold (distance shrinks first)
│ Mysuru Palace                          │ 16 semibold
│ Sayyaji Rao Rd, Mysuru                 │ 14 muted
│ Arrive about 11:42                     │ 14 muted tabular
│ (i) Route for cars — may use express-  │ 14 muted, alertCircle 16 (preview.carNoteMayUse, D2a)
│     ways that ban two-wheelers.        │
│ [Allow expressways        Off  (o==)]  │ only when flags.ROUTING_SUPPORTS_EXCLUDE (D2a)
│────────────────────────────────────────│ hairline border, margin 12
│ How are you riding?                    │ 14 semibold textMuted, accessibilityRole header
│ ( [grp]       Ride with a group      ) │ BigButton secondary 56, icon riders
│ [ >              Ride solo           ] │ BigButton primary prominent 56, icon navigate (lowest = thumb)
└────────────────────────────────────────┘ ≈ 358 dp; clear map ≈ 334 at 360×780
```

#### 3.4.1 Why two actions on the preview (and not a sheet after one Start)
- **Fewer taps:** the choice costs zero extra taps; a sheet after Start costs one (21's 3-tap target becomes 2 from
  the home sheet, §1).
- **It still asks:** the label "How are you riding?" plus two labelled buttons is the question the user asked for,
  shown at the moment it matters, without a modal over the route.
- **Different weights are honest:** Ride solo commits now (creates and starts the ride). Ride with a group opens a
  setup screen that has its own primary (Create ride). Primary = the action that starts riding.
- **Glove safety:** neither action is destructive. A mis-tap on Ride solo starts a solo ride that End ride undoes;
  a mis-tap on Ride with a group opens a form that ✕ closes. 12 dp gap, 56 dp each, full width (328 at 360).
- Positions never change (no "remember last choice" re-ordering: muscle memory with gloves).

#### 3.4.2 States added to the 21 §2.3 table
| State | Panel | Ride with a group | Ride solo |
|---|---|---|---|
| Viewer offline | `preview.offline` banner (exists) | **disabled** | **disabled** |
| No location permission | note `preview.noLocation` + ghost `whereTo.locAllow` 56 (→ OS prompt; blocked → `perm.openSettings`); map frames the pin only | enabled | enabled (the ride's own permissions explainer runs after) |
| Ride solo running | `preview.starting` on Ride solo, loading | disabled | loading; Android back blocked (exists) |
| A lobby ride is open (I'm a rider) | unchanged | → `home.confirmSwitch*` sheet → `/new-ride?dest=1&leaveRideId=…` | → `home.confirmSwitch*` sheet → `startNavigationRide(place, s, { leaveRideId })` |
| A lobby ride is open (I'm its leader) | unchanged | → `home.leaderBusy*` sheet ("Go to {ride}") | same sheet |
| Active ride open | not reachable (the bar opens the in-ride search, §3.10); a stale route mode is reset on focus | — | — |

### 3.5 Solo path
- **Ride solo** = 21 §2.4 `startNavigationRide(place, thresholdS)` unchanged, plus an optional
  `{ leaveRideId }` (leave + `stopRideTracking()` first, as `new-ride.tsx` does today) for the switch case.
- Then exactly today's preview `go()`: `nav-store.startSession(rideId, seed, avoidMotorways)`, `recents.add(place)`,
  `track('nav.started', { from: 'map_home' })`, `track('plan.choice', { choice: 'solo' })`, haptic `success`,
  `plan.reset()`, `resetToRide(href)` (`dismissTo('/home')` is a no-op with Home on top, then push).
- Live: 21 unchanged (sheet mode, turn banner, voice, arrival).

### 3.6 Group setup with the destination — `/new-ride?dest=1` (changed)
**Purpose:** name the group ride and its stop alert; the destination is already chosen.
**Glance:** where we are riding to, and the Create button.
- `new-ride.tsx` reads `plan-store.place` when `dest=1` (and the route numbers if `route` state is ok). If
  `dest=1` but the store has no place (cold web URL), it behaves as today (no destination).
```
┌────────────────────────────────────────┐
│ ✕  New group ride                      │ TopBar 56, title newRide.titleDest
│ DESTINATION                            │ SectionLabel
│ ┌────────────────────────────────────┐ │ DestinationCard (new) 64, Card surfaceRaised e1
│ │ [flag] Mysuru Palace               │ │ tile 40 navRoute + endRide/coffee 20 onNavRoute · 16 semibold
│ │  40    119 km · 1 h 34 min         │ │ 14 muted tabular: route if known, else "≈ 118 km", else address
│ └────────────────────────────────────┘ │ not pressable (info)
│ Riders see it in the lobby. Everyone   │ 14 muted newRide.destNote
│ gets the route when the ride starts.   │
│ Ride name                              │
│ ( Arun's ride                        ) │ AppTextInput, the normal default name, max 60
│ (Sunday ride) (Breakfast run) (Week…)  │ suggestion chips (unchanged)
│ Alert when a rider has stopped for     │
│ [ 1 min | ✓ 3 min | 5 min ]            │ SegmentedControl 56 (unchanged)
│ We'll alert the group if someone …     │
│ [             Create ride            ] │ primary (unchanged)
└────────────────────────────────────────┘
```
- Default name: the **normal** `defaultRideName(first)` ("Arun's ride"), with or without a destination. Never "To {place}": the WhatsApp text carries the ride name, so a place-bearing default would put the destination in the invite (decision 3). Editable as today; `newRide.defaultNameDest` is retired.
- ✕ → `router.back()` → Home route mode, state kept.
- **Create ride** → `createGroupRide({ name, thresholdS, dest, leaveRideId })` (new `src/lib/group-ride.ts`):
  ```ts
  export function createGroupRide(i: { name: string; thresholdS: number; dest: NavPlace | null; leaveRideId?: string }): Promise<RideRow> {
    return withStartLock(async () => {
      if (i.leaveRideId) { await leaveIfMember(i.leaveRideId); await stopRideTracking(); } // today's new-ride logic
      const ride = await createRide(i.name, i.thresholdS);
      if (!i.dest) return ride;
      try {
        await proposeStop(ride.id, { name: i.dest.name.slice(0, STOP_NAME_MAX), address: i.dest.address.slice(0, STOP_ADDRESS_MAX),
          lat: i.dest.lat, lng: i.dest.lng, kind: stopKindFor(i.dest.category) });   // leader → applied at once, status lobby is allowed
        return ride;
      } catch (e) { await rollbackRide(ride.id); throw e; }                           // nobody has the code yet: safe to undo
    });
  }
  ```
  Success: haptic `success`, `recents.add(place)`, `track('ride.created', { with_dest: true })`,
  `track('plan.choice', { choice: 'group' })`, `plan.reset()`, then today's `replace('/ride/<id>/invite?first=1')`.
  Failure: today's inline error + Try again (the ride was rolled back; nothing half-made is left).
- **How the destination is attached:** `propose_stop` **right after `create_ride`**, not at `start_ride`. Reasons:
  the stop lives on the ride row, so every joiner's normal load and the `rides` broadcast carry it into the lobby
  (riders know where they are going before they commit); the RPC already allows `lobby` (it only refuses `ended`);
  and the failure is handled while the leader is still on the form. No seeded route for groups (the lobby can last
  an hour; live fetches from where each rider is at start).
- The leader's own `stop_set` toast is already skipped (alone in the ride, `_layout.tsx` rule).

### 3.7 Lobby with the destination (`ride/[id]/lobby.tsx`)
**P1 (caption):** under `lobby.threshold`, a 14 muted line with the `endRide` (or `coffee`) icon 16
`textMuted`: `lobby.destLine` "Riding to {place}". Everyone sees it. Nothing else changes.

**P2 (card):** replace the caption with a `DestinationCard` between the code card and the threshold caption:
```
┌────────────────────────────────────────┐
│ ‹  To Mysuru Palace              ⋯     │ RideHeader (lobby meta "Lobby · 3 riders", unchanged)
│ ┌ code 123 456 · note · (Invite riders)┐│ unchanged
│ DESTINATION                            │ SectionLabel lobby.destTitle
│ ┌────────────────────────────────────┐ │ DestinationCard 64 (not pressable)
│ │ [flag] Mysuru Palace               │ │ 16 semibold
│ │  40    ≈ 118 km from you · Set by A│ │ 14 muted tabular; "Set by Arun" only for non-leaders
│ └────────────────────────────────────┘ │
│ Stop alert after 3 min                 │
│ Your setup: ✓ Location ✓ Alerts ○ SOS  │ unchanged
│ Riders                     3 · 2 ready │
│ …                                      │
├────────────────────────────────────────┤
│ Everyone ready? Start when you are.    │ unchanged footer (leader: Start ride / rider: Waiting + Leave)
```
- Distance: straight line from **my** position in `ride-store.positions[me]` (lobby already tracks):
  `lobby.destDistance` "≈ {km} from you"; no fix → `stop.noFix`. No OSRM request in the lobby (fair use, D1).
- Non-leaders see the same card, read-only, with `lobby.destSetBy` "Set by {leader first name}".
- **Leader: Remove** lives in the ⋯ menu (as 20 C5): the existing `isLeader && hasStop` row. **Fix in the lobby:**
  label `lobby.menuRemoveDest` "Remove destination" (today the lobby shows the solo "Stop directions" copy because
  the leader is alone), ConfirmSheet `lobby.removeDestTitle` / `lobby.removeDestBody`, confirm
  `lobby.removeDestConfirm`, cancel `stop.clearCancel` → `clear_stop`. Riders get the existing `stop_cleared` notice.
- Changing the destination from the lobby is P3 (needs `search` allowed in `lobby` by `rideRedirect`).

### 3.8 Live group ride with a destination, and group navigation
**Everyone (P1, no change needed):** the ride starts with the stop set, so live shows the 19 A route line from each
phone's own position and the 20 C5 stop card ("119 km · 1 h 34 min / Mysuru Palace"), the full-map stop chip and
the 150 m arrival line. No "Next stop" toast at start (the stop was set before they joined).

**Recommendation for navigation in a group (P2, needs Q1): leader-only turn banner + voice.**
```ts
// lib/nav-engine.ts
isNavActive(a) = a.rideLive && a.hasStop && !a.arrived && (a.solo || a.engineRunning || a.leaderNav)
// _layout.tsx: leaderNav = flags.GROUP_LEADER_NAV && isLeader   (EXPO_PUBLIC_GROUP_LEADER_NAV, default on)
```
- The leader gets the 21 banner docked above the convoy strip (21 §10 "rider joins" layout, already built), voice
  (toggle in ⋯ for groups, 21 §6.3), arrival haptic + "You've arrived" once (21 L3). No ArrivalPanel in a group (the
  group sheet stays; End ride is in ⋯).
- Other riders: route line + stop card only (unchanged; reroute on the 19 A 60 s rule).
- **Trade-off for the user:**
  | Option | Riders get | Cost / risk |
  |---|---|---|
  | **A. Leader-only banner + voice (recommended)** | Leader: turn-by-turn. Others: line + distance/ETA, they follow the leader | Request load = one solo rider on the OSRM demo (D1 unchanged). Leader's phone: 1 Hz GPS + voice battery (21 §5.5). Fixes today's quirk (a group started with only the leader present navigates, one started with two does not) |
  | B. Nothing new | Everyone: line + card | No new load; leaders get no directions in groups |
  | C. Everyone (21 §6 P4) | Everyone: turn-by-turn | Needs hosted routing first (D1): N riders rerouting breaks the demo's fair use. Out of scope |
#### 3.8.1 `isNavActive` after decision 1 (implemented in P1)
```ts
isNavActive(a) = a.rideLive && a.hasStop && !a.arrived &&
  (a.engineRunning || (a.solo && a.leader && !a.groupRide))
```
- `groupRide` = a ride created through `createGroupRide` (remembered on the creating phone, `nav.groupRides.v1`).
  A group ride never *starts* navigation, whether one rider or ten are present when it starts: this removes the
  quirk where a group started with only the leader navigated and one started with two did not.
- `leader`: only a ride's leader starts navigation (a rider left alone in someone else's ride does not).
- `engineRunning` (leader whose session is already running for this stop) still carries on when a rider joins a
  solo ride (21 §10). It can never be true for a group ride, because the engine never started for it.

- Note: the 19 A route lines already send one OSRM request per rider per stop change (+ reroutes). That load exists
  today and grows with group size; it stays the D1 pre-launch risk.
- Vertical budget at 360×780 (leader, collapsed sheet): 588 − banner 96 − convoy 84 − sheet 136 = **272** visible
  map; with 2 layout banners the right column auto-hides (20 C1 `mapVisH < 176`). Acceptable; a 72 dp compact
  group banner stays a follow-up (21 §6.2).

### 3.9 Free rides (no destination)
| Ride | Where | Behaviour |
|---|---|---|
| Solo, no destination | Tile **Just ride solo** (1 tap) | `startSoloRide` (unchanged): live, full map the first time, header search adds a stop later (21 §2.9) |
| Group, no destination | Tile **Start a group ride** (1 tap) | Today's `new-ride` (title `newRide.title`, no destination card) → invite → lobby. A stop can be set once live (19 A) |
| Join | Tile **Join with a code** (1 tap) | `/join` (unchanged) |
Not on long-press (undiscoverable, and long-press on the map is reserved for "drop a pin", P3).

### 3.10 An open ride on Home
- **Gate unchanged** (`decideGate`): active → live, lobby → lobby, none → home. Home only shows an open ride after
  the rider went Back from lobby/live (the ride keeps tracking, 00 §1), or when the cached ride is stale offline.
- Peek = compact ride card + **Back to ride** (primary) → `push(rideHref(id, status))` (exists). Tiles hidden.
- Active ride: the bar reads `homeMap.searchStops` and opens `/ride/<id>/search?from=home` (19 A search; leader
  sets, rider suggests). `search.tsx`: when `from=home`, a successful pick does `router.replace('/ride/<id>/live')`
  instead of `back()`. Chips are hidden. Recent places are hidden (they would lead to a second ride).
- Lobby ride: the bar is the normal "Where to?"; route mode's two actions run the switch / leader-busy sheets
  (§3.4.2). P3: a lobby leader gets "Make it the destination of {ride}" instead.
- On focus with an active ride, `plan.reset()` (a stale place/route mode is never shown under "Back to ride").

---

## 4. The home map

### 4.1 Same map as live, lighter
- Tiles: `colors.mapStyle` (OpenFreeMap; Tribe positron/dark, Maps liberty/fiord; 17 §3). Re-keys on style change
  (17 §3.3). Riders who want the familiar road-map look pick the Maps style (17); Home does not override it.
- Markers: `MeMarker variant="map"` (arrow in Tribe, blue dot + halo in Maps), `StopPin`. No other riders on the
  home map (the ride card carries the convoy; privacy rule 8 needs no change).
- Gestures: pan and pinch zoom; no rotate, no pitch (as the preview). No compass needed.

### 4.2 Camera
| Situation | Camera |
|---|---|
| First mount, saved camera exists | `initial` = saved (no animation). If a fresh fix arrives before any gesture → intent `me` |
| First mount, no saved camera, fix | `initial` = fix at zoom `HOME_ME_ZOOM` 15 |
| No fix, no saved camera | `HOME_FALLBACK_CAMERA` = `{ lat: 20.59, lng: 78.96, zoom: 4 }` (India) |
| Centred (after mount or Re-centre) | follows each fix (watch every 10 m) with a 450 ms ease; zoom kept |
| Rider pans / zooms (`userInteraction`) | `free`; me slot shows Re-centre |
| Re-centre | haptic `select`, intent `me` (zoom 15), `track('map.recentre', { screen: 'home' })` |
| Enter `place` / `route` | intent `place` / `fit`; the browse camera is kept and restored on Back |
- Padding always counts what floats over the map (20 C2 rule): top = banner + 8 + 56 (+ 8 + 48 chips in browse) +
  16; bottom = visible sheet / panel height + 36; sides 16 (browse) / 48 (place, route).
- `onIdle` in browse persists `{lat, lng, zoom}` (3 decimals, ≈ 100 m) under `STORAGE_KEYS.homeCamera =
  'pref.homeCamera'`, at most once per 5 s. Device-only, **cleared on sign-out** (it is location history).

### 4.3 Performance and battery
- **No 1 Hz watch on Home.** `usePlanningPosition`: one last-known read + Balanced, 10 m watch, only while Home is
  focused and the app is active (iOS suspends it in the background; Android pauses it, 21 notes).
- **One GL map at a time.** `homeMapMounted(pathname)`: the map is mounted only while the path is `/home`,
  `/where-to` or `/new-ride` (instant return from search and setup). On any other path (ride screens, permissions,
  profile, join, rides) Home renders `bg` instead of the map; on return it remounts at the saved camera with a 150 ms
  fade from `bg` (none under Reduce Motion). So the home map and the live map never run together.
- No OSRM request in browse or place mode. One preview request per route mode (5 min cache, 21 §3.1).
- No keep-awake on Home (unchanged).

### 4.4 Offline and failures
- Viewer offline: banner first (§3.1). MapLibre's ambient cache shows tiles seen before; unseen areas show the style
  background. The search screen keeps its own offline banner; recents still work; route mode disables both actions.
- Map style or tiles fail (`onMapError`, e.g. OpenFreeMap down): the map area shows `bg` with a centred 14 muted line
  `homeMap.mapFailed` under the chips; bar, chips, sheet and every flow keep working. Retry on the next focus.
- Fix lost: the marker stays at the last fix for up to 2 min, then is removed (no stale "me").

### 4.5 Web parity
- `plan-map.web.tsx` from `route-preview-map.web.tsx` (maplibre-gl, `MapMarker`, `syncNavRouteLayers`), plus the
  centring, `dragstart`/`zoomstart` with `originalEvent` as the user-gesture signal, and `moveend` for `onIdle`.
- Position on web: `expo-location` (browser geolocation), requested only from the explainer button (the browser shows
  its own prompt then). Everything else is shared code.
- No hardware back on web; the visible ‹ / ✕ do the same as `plan.back()`. Browser Back leaves Home (the modes are
  not history entries). Accepted: web is the secondary target.

---

## 5. Back stack and deep links

### 5.1 Android back (and the visible equivalents)
| Where | Android back | Visible control |
|---|---|---|
| Home browse, sheet expanded | collapse to peek | chevron / header tap |
| Home browse, peek | OS default (leave the app) | — |
| Home place | → browse (camera restored) | bar ‹, panel ✕ |
| Home route (from a search result) | → place | floating ‹ |
| Home route (from a recent) | → browse | floating ‹ |
| Home route, Ride solo running | blocked (exists) | ‹ ignored |
| `/where-to` | → Home, mode unchanged | ‹ |
| `/new-ride?dest=1` | → Home route mode, state kept | ✕ |
| Lobby / live | → Home browse (the ride keeps going; plan was reset at entry) | header ‹ |
| A Sheet / ConfirmSheet open on Home | closes the sheet first | Cancel / scrim |
iOS: Home is the stack root (no edge swipe); `new-ride` modal swipe-down = ✕.

### 5.2 Stacks after each start
- Solo: `[home, live]` (or `[home, permissions → live]`) via `resetToRide`, as 21.
- Group: `[home, new-ride]` → replace → `[home, invite]` → `[home, permissions|lobby]` → `[home, live]`.
- Join (tile or deep link): unchanged `join.tsx` replaces; the stack ends `[home, lobby|live]` when Home was below.

### 5.3 Plan reset (never a stale preview under a ride)
`plan.reset()` runs: in `resetToRide()`, on `createGroupRide` success, on join success (`join.tsx`), and on Home
focus when an active ride is open. The browse camera is kept.

### 5.4 Deep links and old routes
- `throttletribe://join?code=` and the hosted invite `?c=` → `/join` (outside `(app)`): unchanged. They work with
  the map home mounted below or not.
- Notification taps → ride routes: unchanged.
- `/where-to` opened directly (web URL): works; a pick does `replace('/home')` with the plan store set.
- `/route-preview?id&name&address&lat&lng&category` (old links, bookmarks): the route file becomes a redirect:
  `parsePreviewParams` → `plan.openRoute(place, 'recent')` → `<Redirect href="/home" />`; bad params → `/home`.

---

## 6. States

| Screen / state | Behaviour |
|---|---|
| Home: first run | Sheet expanded once (§3.1.2 A); welcome text in the header; LocationRow if not granted |
| Home: returning, no ride | Peek: tiles + 1–2 recent places; expanded: recents, nudge, stats, recent rides |
| Home: loading (open ride / rides unknown) | Returning layout without recent rides; tiles enabled; ride card fades in if found |
| Home: active ride open | Peek: compact ride card + Back to ride; bar → in-ride search; tiles, chips, recents hidden |
| Home: lobby ride open | Peek: compact card ("Waiting in the lobby") + Back to ride; bar = Where to?; route actions → switch / leader-busy |
| Home: location undetermined / denied | Me slot "Show my location" → explainer sheet; LocationRow in the sheet; no distances |
| Home: location blocked / services off | Same, button `perm.openSettings`; services copy when off; re-read on return |
| Home: granted, no fix yet | Me slot "Finding you…" disabled; camera saved / fallback |
| Home: viewer offline | Offline banner on top; cached tiles; tiles and search enabled (they explain errors) |
| Home: map failed | `homeMap.mapFailed` on `bg`; everything else works |
| Home: received SOS while on Home | Unchanged from today: push notification → ride (Home is outside the ride layout, as before) |
| Place: no fix | `stop.noFix` instead of the distance; pin centred |
| Place: offline | Works (data came from search); Directions enabled; route mode shows its offline state |
| Route: all | 21 §2.3 table + §3.4.2 |
| Group setup: with destination / without | §3.6 / today's form |
| Group setup: create OK, propose_stop fails | Ride rolled back; inline error + Try again; stays on the form |
| Group setup: offline | Today's network error on Create |
| Lobby: destination set (leader / rider) | P1 caption; P2 card (rider sees "Set by") |
| Lobby: destination removed | Card/caption gone; riders get the `stop_cleared` notice |
| Live group with destination | 19 A line + 20 C5 card for all; leader banner + voice (P2, Q1) |
| Light / dark × Tribe / Maps | Token-driven. Floating chrome e2 (shadow light, `edge2` dark); sheet e3; check bar/chip contrast on positron, dark, liberty, fiord |
| 360 dp / 1.3× | §10 |

---

## 7. Interactions

| Control | Size | Gesture | Feedback | Result |
|---|---|---|---|---|
| Search bar | 56 | tap | `select`, pressed fill | `/where-to?focus=1` (active ride: `/ride/<id>/search?from=home`) |
| Avatar | 56 | tap | `select` | `/profile` |
| Chip | 48 (56 hit) | tap | `select` | `/where-to?chip=<key>` |
| Map | — | pan / pinch | none | camera free; Re-centre appears |
| Map (sheet expanded) | — | tap | none | sheet → peek |
| Re-centre / Show my location | 56 | tap | `select` | camera → me / explainer sheet |
| Allow location (row or sheet) | 56 | tap | `select`; `success` on grant | OS prompt / settings |
| Sheet header / chevron | 56 | tap, or drag | `select` | toggle peek ↔ expanded |
| Tile | 104×80 | tap | `select`, press scale | §3.1.3 |
| Recent place row | 64 | tap | `select`, `surfacePressed` | Home route mode |
| Clear (recents) | 56 | tap → confirm | `select` | list emptied |
| Back to ride | 56 | tap | `select` | lobby / live |
| Place bar ‹ / panel ✕ | 56 | tap | `select` | browse |
| Place bar name | 56 | tap | `select` | `/where-to?q=…` |
| Directions | 56 | tap | `select` | route mode |
| Route ‹ | 56 | tap | `select` | place / browse |
| Allow expressways (flagged) | 56 | tap row | `select` | 21 §2.3.1 |
| Ride with a group | 56 | tap | `select` | `/new-ride?dest=1` (or switch / leader-busy sheet) |
| Ride solo | 56 | tap | loading; `success` on start | 21 §2.4 → live |
| Create ride (dest) | 56 | tap | loading; `success` | create + propose_stop → invite |
| Lobby ⋯ Remove destination | 56 | tap → confirm | `select` | `clear_stop` |

---

## 8. Copy (`src/lib/copy.ts`; ✎ = marketing may refine)

| Key | Text |
|---|---|
| `homeMap.searchPlaceholder` ✎ | Where to? |
| `homeMap.searchA11y` | Where to? Search places (hint `homeMap.searchHint`: Opens search.) |
| `homeMap.searchStops` | Search stops for {ride} |
| `homeMap.chipA11y` | {label} nearby (hint: Opens search.) |
| `homeMap.offline` | You're offline — the map and search may not load |
| `homeMap.mapFailed` | Map unavailable right now. Everything else still works. |
| `homeMap.showMe` | Show my location |
| `homeMap.findingYou` | Finding you… |
| `homeMap.locTitle` | See where you are |
| `homeMap.locBody` ✎ | Shows you on the map and finds places near you. Search and routes use OpenStreetMap services (Photon, OSRM). They get your area or start point, never your name. |
| `homeMap.locServicesTitle` | Location is off on this phone |
| `homeMap.locServicesBody` | Turn it on in Settings to see where you are. |
| `homeMap.sheetA11y` | Ride options |
| `homeMap.tileGroup` ✎ / `homeMap.tileGroupA11y` | Start a group ride / Start a group ride without a destination |
| `homeMap.tileJoin` / `homeMap.tileJoinA11y` | Join with a code / Join a ride with a 6-digit code |
| `homeMap.tileSolo` ✎ / `homeMap.tileSoloA11y` | Just ride solo / Start a solo ride without a destination |
| `homeMap.recentPlaces` | Recent places |
| `homeMap.recentA11y` | Recent place, {row} |
| `homeMap.barBackA11y` | Back to map |
| `homeMap.barPlaceA11y` | {name}. Search again |
| `homeMap.step1Title` ✎ | Pick where you're riding |
| `homeMap.step1Body` ✎ | Search a place, then choose solo or group. |
| `place.distance` | ≈ {km} away |
| `place.directions` / `place.directionsA11y` | Directions / Directions to {name} |
| `place.closeA11y` | Close {name} |
| `place.a11ySummary` | {name}, {distance} away, {address} |
| `preview.choiceLabel` ✎ | How are you riding? |
| `preview.rideSolo` / `preview.rideSoloA11y` | Ride solo / Ride solo to {name}. Starts now. |
| `preview.rideGroup` / `preview.rideGroupA11y` | Ride with a group / Set up a group ride to {name} |
| `preview.noLocation` | Allow location to see the route. |
| `preview.a11yBack` (changed) | Back |
| `newRide.titleDest` | New group ride |
| `newRide.destLabel` | Destination |
| `newRide.destNote` ✎ | Riders see it in the lobby. Everyone gets the route when the ride starts. |
| `newRide.existingRide` | You already have a ride open, so we opened it. End it first to start a new one. |
| `newRide.a11yDest` | Destination {name}, {distance} |
| `lobby.destLine` (P1) | Riding to {place} |
| `lobby.destTitle` (P2) | Destination |
| `lobby.destDistance` | ≈ {km} from you |
| `lobby.destSetBy` | Set by {name} |
| `lobby.menuRemoveDest` | Remove destination |
| `lobby.removeDestTitle` | Remove the destination? |
| `lobby.removeDestBody` | Riders won't get a route to it. You can set a stop after the ride starts. |
| `lobby.removeDestConfirm` | Remove |

- Reused: `home.firstTitle`, `home.firstTitleNoName`, `home.firstSub`, `home.greet*`, `home.step2*`, `home.step3*`,
  `home.resume*`, `home.role*`, `home.confirmSwitch*`, `home.leaderBusy*`, `home.toastWelcome`, `home.recent*`,
  `home.seeAll*`, `home.stat*`, `home.exc*`, `whereTo.*` (incl. `clear*`, `locAllow`), `perm.openSettings`,
  `live.recentre`, `live.recentreA11y`, `live.attribution`, `live.attributionRoute`, `live.sheetValueCollapsed` /
  `Expanded`, `preview.*` (21), `stop.noFix`, `stop.clearCancel`, `newRide.*`.
- Retired: `newRide.defaultNameDest` (decision 3), `home.heading`, `home.subtitle`, `home.start`, `home.join`, `home.joinTitle`, `home.joinSub`,
  `home.quickJoinTitle`, `home.quickJoinSub`, `home.whereToTitle`, `home.whereToSub`, `home.offlineSaved`,
  `home.step1Title`, `home.step1Body`, `whereTo.justRide`, `preview.go`, `preview.goA11y`.

---

## 9. Tokens (`src/theme/tokens.ts`)
```ts
size.searchBar  = 56   // home floating search bar height (= touchTarget; named for the camera padding maths)
size.quickTile  = 80   // home sheet tile minimum height
size.sheetHeader = 56  // home sheet header (grabber + text + chevron)
```
- No new colours. Bar, chips, me slot: `surfaceRaised` / `fabBg` + `text`, `textMuted`, `brandOnBg` (all ≥ 4.5:1 on
  their fills in the four palettes, 17 §1.1). Tiles: `surface`, `brandTint`, `brandOnBg`, `text`. Destination tile:
  `navRoute` + `onNavRoute` (20 C5, ≥ 4.5:1). Grabber `borderStrong` (decorative).
- Local constants (not tokens), in `lib/plan-flow.ts`: `HOME_FALLBACK_CAMERA`, `HOME_ME_ZOOM = 15`,
  `HOME_PLACE_ZOOM = 15`, `HOME_CAMERA_SAVE_MS = 5000`, `PEEK_TWO_ROWS_MIN_H = 760`.
- Storage keys: `pref.homeCamera`, `pref.homeFirstRunSeen` (both cleared on sign-out).

---

## 10. Safety and accessibility
- **Glove:** every control ≥ 56 (chips 48 + 56 hit, as 21). The sheet drags, but every drag has a tap
  equivalent (header, chevron, Android back). No action needs a swipe. No long-press is required for anything.
- **Thumb zone:** the commit actions (Back to ride, Directions, Ride solo, Ride with a group, tiles, recent places)
  are all at the bottom. The search bar sits at the top by design (Google pattern, used at rest); the most common
  destinations are duplicated at the bottom as recent places, so the top is never the only way.
- **Typing lock:** unchanged on the search screen (21 §2.2.2). Home itself has no text input.
- **No status colours misused:** the to-do dot is the only amber on Home (dot + words in the label, as today).
  Offline = grey banner with icon + words. Exception lines in the ride card keep icon + text.
- **Viewer offline first:** the banner is the first element (visual and reading order).
- **SOS:** Home is outside a ride, as today; no SOS on Home. Live / lobby keep theirs.
- **Screen-reader order (browse):** offline banner → search bar → avatar → chips → me-slot pill → sheet header
  (adjustable) → sheet content in visual order. The map view is hidden from screen readers
  (`accessibilityElementsHidden`, as the preview); the marker information is in the pill and the place panel.
  Place mode: focus moves to the place name; route mode: focus moves to the summary (`preview.a11ySummary`), then
  the note, the choice label (header), Ride with a group, Ride solo. `onAccessibilityEscape` = `plan.back()`.
- **Dynamic type:** `maxFontSizeMultiplier` 1.3 on the bar, chips, me slot, sheet header, tiles, place and route
  panels (fixed-height or glance zones). Expanded sheet content scales like today's Home (rest-time).
  At 1.3× the tile label may take 3 lines (tile grows past 80; the peek height is measured, not fixed).
- **360 dp:** bar text column = 336 − 16 − 24 − 12 − 56 = 228 dp ("Search stops for Sunday Run" truncates the ride
  name); place bar text = 336 − 56 − 16 = 264; tiles 104; route buttons 328; chips scroll horizontally (3 visible).
- **Light / dark × Tribe / Maps:** the bar and chips must read on every basemap: e2 shadow in light, `edge2`
  hairline in dark. QA screenshot set: A–E × 4 palettes.

---

## 11. Telemetry (`lib/telemetry/events.ts` allowlist)
`home.search_opened` { from: `bar` | `chip` } · `home.place_opened` { from: `search` | `recent` } ·
`home.directions` · `plan.choice` { choice: `solo` | `group` } · `ride.created` gains `with_dest: boolean` ·
`nav.started` gains `from: 'map_home'` · `map.recentre` gains `screen: 'home'`. No coordinates in any event.

---

## 12. Files (engineer)

**P1**
- New:
  - `src/store/plan-store.ts`; `src/lib/plan-flow.ts` (+ `__tests__/plan-flow.test.ts`)
  - `src/components/plan-map.tsx` + `.web.tsx` (renamed from `route-preview-map(.web).tsx`, extended §2.2)
  - `src/components/home-search-bar.tsx`, `home-chips.tsx`, `home-sheet.tsx`, `quick-tiles.tsx`,
    `place-panel.tsx`, `route-panel.tsx` (today's `Preview` body + the choice), `location-row.tsx` (moved from
    `where-to.tsx`), `destination-card.tsx`
  - `src/hooks/use-home-camera.ts` (centred / free, saved camera, intents)
  - `src/lib/group-ride.ts` (`createGroupRide`, + test with mocked `ride-api`)
- Changed:
  - `src/app/(app)/home.tsx` (rewrite: map, modes, sheet; keeps the refresh / welcome toast / confirm sheets logic)
  - `src/app/(app)/where-to.tsx` (params, pick → plan store + back, no footer), `place-search-view.tsx`
    (`initialText`, `initialChip`)
  - `src/app/(app)/route-preview.tsx` → redirect into Home (§5.4); keep `lib/preview-params.ts`
  - `src/app/(app)/new-ride.tsx` (`dest=1`, destination card, default name, `createGroupRide`)
  - `src/app/(app)/ride/[id]/lobby.tsx` (destination caption)
  - `src/app/(app)/ride/[id]/search.tsx` (`from=home` → replace live)
  - `src/app/join.tsx` (plan reset on success); `src/lib/reset-to-ride.ts` (plan reset)
  - `src/lib/solo-nav.ts` (`{ leaveRideId }` option), `hooks/use-planning-position.ts` (`servicesEnabled`)
  - `src/components/ride-progress-card.tsx` (`variant: 'compact' | 'full'`), `home-widgets.tsx` (step 1 keys),
    `recent-places-section.tsx` (peek variant: no label, `limit`, a11y prefix)
  - `src/lib/storage.ts` (`homeCamera`, `homeFirstRunSeen`) + sign-out path (clear both)
  - `src/lib/copy.ts`, `src/lib/telemetry/events.ts`, `src/theme/tokens.ts` (§9)
- Deleted: `route-preview-map.tsx` / `.web.tsx` (renamed), `action-card.tsx` if no other user remains.

**P2**
- `src/app/(app)/ride/[id]/lobby.tsx` (DestinationCard), `ride/[id]/_layout.tsx` (lobby Remove destination copy,
  `leaderNav`), `src/lib/nav-engine.ts` (`isNavActive` + test), `src/lib/flags.ts` (`GROUP_LEADER_NAV`),
  `src/lib/copy.ts`.

**P3**
- `plan-map(.web).tsx` (result pins, long-press), `lib/place-search.ts` (Photon `/reverse`, `stay` chip),
  `lib/routing.ts` (`search` allowed in `lobby` for the leader), `route-panel.tsx` (lobby-leader action),
  `lib/invite.ts` (destination in the share text, if Q3 = yes).

---

## 13. Acceptance checklist

**P1**
- [ ] Launch with no ride lands on the map home; active ride → live, lobby ride → lobby (gate unchanged).
- [ ] No location prompt at launch or on any Home render; "Show my location" and the LocationRow explain first; the
      OS prompt comes only from their button; blocked / services off open Settings and re-read on return.
- [ ] Without permission the map shows the saved camera or India at zoom 4; search, places and routes still work.
- [ ] With permission: marker + centred camera; panning shows Re-centre; Re-centre eases back; no fix → "Finding you…".
- [ ] Search bar: 56 tall, brand mark left, avatar (with to-do dot and label) right; tap opens search with the
      keyboard (not when typing-locked); chip opens search with that chip's results and no keyboard.
- [ ] Search result → place sheet (name, ≈ distance, address, Directions); recent (search or home sheet) → route mode.
- [ ] Android back: route → place (or browse for recents) → browse → collapse sheet → leave app; ‹ and ✕ match.
- [ ] Route mode = 21 preview (summary, arrive time, note, flagged expressway row) + "How are you riding?" with
      Ride with a group (secondary, above) and Ride solo (primary, lowest); both disabled offline.
- [ ] Ride solo = 21 Go (create → start → propose_stop, seed, recents, stack `[home, live]`); 2 taps from a home recent.
- [ ] Ride with a group → "New group ride" with the destination card and the normal "{name}'s ride" default name; Create = create_ride
      then propose_stop (check the `rides` row has `stop_*` while `status = 'lobby'`); a failing propose_stop rolls
      the ride back and shows the error on the form.
- [ ] Lobby shows "Riding to {place}" for the leader and for a rider who joined by code; live shows the route line
      and stop card for every rider at start, with no "Next stop" toast.
- [ ] Tiles: Start a group ride → today's form; Join with a code → /join; Just ride solo → free solo ride (full map first time).
- [ ] Open ride on Home: compact card + Back to ride is the only primary; tiles hidden; active ride: bar opens the
      in-ride search and a pick lands on live; lobby ride: route actions open the switch / leader-busy sheets.
- [ ] Browsing (search, place, route) and backing out creates no ride row.
- [ ] The home map is unmounted on ride screens (one GL map at a time: check with the profiler) and remounts at
      the saved camera; no location watch runs while Home is not focused.
- [ ] Offline: banner above the bar; cached tiles; map failure shows `homeMap.mapFailed` and nothing else breaks.
- [ ] First run: sheet opens expanded once with welcome, tiles, LocationRow and the reworded steps; later opens peek.
- [ ] Every old Home item is where §0.2 says; one primary per state.
- [ ] Deep links `/join?code=`, `?c=` and notification taps still work with the map home below; `/route-preview?…`
      redirects into route mode.
- [ ] Web: map home, search, place and route modes work in a browser (maplibre-gl), no console errors.
- [ ] Screen-reader order as §10; map hidden; focus moves to the place name / route summary on mode change.
- [ ] 360 dp and 1.3× screenshots of A–E, place and route, in all four palettes.
- [ ] Unit tests: `planBack`, `homeSheetBlocks`, `initialSheetSnap`, `peekRecentCount`, `homeMapMounted`,
      `meSlotForHome`, `searchBarTarget`, `createGroupRide` (rollback on stop failure, lock), camera save throttle.
- [ ] `npx expo lint`, `npx tsc --noEmit`, Jest clean.

**P2**
- [ ] Lobby destination card: ≈ distance from my position (no OSRM request), "Set by" for riders; no fix → `stop.noFix`.
- [ ] Lobby ⋯ shows "Remove destination" (not "Stop directions") with its confirm; riders see the card disappear.
- [ ] (Q1 = A) Group leader with a stop gets banner + voice; riders do not; the flag off restores B; the layout
      matches 21 §10 (banner above the convoy); `isNavActive` tests cover `leaderNav`.

**P3**
- [ ] Per the items in §14.

## 14. Phase plan
1. **P1 — Map home and the choice (no new native code, no migration).** Ships the whole user request end to end:
   map home, search, place sheet, route preview with Ride solo / Ride with a group, solo into 21, group into the
   setup with the destination attached and visible in the lobby (caption). Order: plan store + pure flow → map
   component → browse + sheet content migration → place + route modes → search changes → group create → lobby caption.
2. **P2 — Group with destination, properly.** Lobby destination card and remove, the lobby menu copy fix, and
   (if Q1 = A) leader-only navigation behind `GROUP_LEADER_NAV`, after one real group test ride.
3. **P3 — Polish.** Chip results as pins on the map (list + pins), long-press drop-pin with Photon reverse, lobby
   leader "Make it the destination", change destination in the lobby, "Stay" chip, destination in the invite text
   (Q3), optional route prefetch on the place sheet.
4. **Still open from 21:** hosted routing before public launch or everyone-navigates groups (D1).

## 15. Open questions (need the user's call)
1. **Group navigation (blocks P2).** Leader-only turn banner + voice (recommended, §3.8 option A), nothing new for
   groups (B), or wait for hosted routing and give everyone directions (C)?
2. **Which choice is the filled primary on the route preview?** Recommended: **Ride solo** (it starts riding now;
   the group button opens a setup screen with its own primary). The alternative makes **Ride with a group** primary
   to keep group rides the app's headline. Positions stay fixed either way.
3. **Destination in the WhatsApp invite text?** ("Join my ride to Mysuru Palace"). Recommended: **not now** (P3 at
   the earliest): the invite reaches people who are not yet ride members (rule 8 is about rider location, but a
   destination can reveal plans).
