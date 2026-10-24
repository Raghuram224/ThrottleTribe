# 22 — Map home ("Where to?" first, then Start)

> **2026-10-20, see 26 §1:** place rows, the place panel and the route panel drop an address line that only repeats the
> place name (`distinctAddress`); no hairline under the last row of a list.

Source: user request, 2026-10-14: *"I don't want to see this page as home screen, I want the map page as home
screen like Google Maps. When the user enters a location, ask the user is it an individual or group ride. Based on
the preference move further. Follow the Google Maps app flow."* Screenshot of today's Home (Android, Tribe light,
first run): brand header + avatar, "Welcome, Raghu" + 3-step explainer, Join with a code, Where to?, emergency
contacts nudge, footer "Start a ride".

## Decisions (user, 2026-10-14) — these override anything below that says otherwise

| # | Decision | Effect on this spec |
|---|---|---|
| 1 | **Group navigation: everyone gets turn-by-turn later, once hosted routing exists (D1).** Until then a group ride with a destination gives **every** rider the route line + stop card, and **no turn banner or voice for anyone in a group ride, the leader included.** | §3.8 option A (leader-only banner + voice), §0.1 row 9, the P2 `leaderNav` / `GROUP_LEADER_NAV` work and the P2 acceptance item are **not approved** and are dropped. Option C stays the plan after D1. `isNavActive` is fixed (§3.8.1): navigation is never *started* for a group ride; a ride that starts solo and gains riders keeps navigating for its leader (21 §10, unchanged). |
| 2 | **Route preview primary: Ride solo is the filled primary; Ride with a group is secondary.** | Closed open question 2. **Superseded by D5:** there is one primary, Start ride. |
| 3 | **The destination is not in the WhatsApp / invite text.** | Closes open question 3; the P3 "destination in the invite text" item is dropped. `lib/invite.ts` is not touched. |
| **D5** (2026-10-15) | **One kind of ride; a ride becomes a group when its code is shared.** User: *"Instead of creating a separate menu for the group ride, the user will create a ride like Google Maps; then if the user wants a group ride he can share the code with others and it will be a group ride. We don't have to show a separate button from the start. It will happen in the flow."* **Also: the location permission is asked when Home opens** (once per app run, while still undetermined), replacing "no prompt on launch" (§3.1.5, rule 8 of the constraints). | **Overrides the solo / group choice everywhere in this spec.** Route preview has one primary, **Start ride** (= the old Ride solo: create + start + propose stop, turn-by-turn, voice, arrival). "How are you riding?", **Ride with a group**, the **Start a group ride** tile, the group setup screen (`/new-ride`, `createGroupRide`), the lobby "Riding to {place}" caption and the `plan.choice` event are **removed**. The Home tiles are **Join with a code** and **Just ride** (no destination; neutral name). Every ride started from Home gets the normal `defaultRideName(first)` ("Raghu's ride"), never "Solo ride". The group happens inside the ride: live panel **Invite riders** row (or ⋯ → Invite riders) → invite screen (6-digit code + WhatsApp). Joiners join the active ride by code or link and get the route line + stop card; the leader who was navigating keeps turn-by-turn + voice (decision 1 stands: group turn-by-turn for everyone waits for D1). The device-local "group ride" marker (`nav.groupRides.v1`) is replaced by a "this phone navigates this ride" marker (`nav.navRides.v1`, §3.8.1). The stop-alert time (1 / 3 / 5 min) moved from the removed form to **Profile → Safety**. P2 items that are obsolete: §3.7 lobby destination card / caption and the lobby "Remove destination" copy fix, the group-leader-nav flag work (already dropped by decision 1), and the §13 P2 acceptance list. P3 "Make it the destination of {ride}" for a lobby leader and "change destination in the lobby" are obsolete too (no new lobby rides carry a destination). |
| **D6** (2026-10-15) | **Invite riders on the route preview, Just ride in the normal view, review fixes.** User decisions: (1) the route preview gets **Invite riders** (secondary) under **Start ride** (primary): it creates the ride in the **lobby** with the destination, opens the invite screen (code + WhatsApp), then the lobby (who has joined, "Riding to {place}"), and the leader taps **Start** → live with turn-by-turn + voice; riders can join while it waits. (2) The stop-alert time stays in Profile → Safety, with a note that it applies to new rides. (3) A leader **Rename ride** in the ⋯ menu: built in the app, with migration 0010 (applied 2026-10-15, §3.6). (4) **Just ride opens in the normal (sheet) view**, never full map by itself, so Invite riders is visible. | **Partly reverses D5:** the lobby "Riding to {place}" caption (§3.7) and the invite screen's `?first=1` "Continue to lobby" mode (§3.5.1) are back, for rides made by Invite riders; the route preview has two actions (§3.4); the full-map first-open default is gone (§3.9; 19 §B, 21 decision 2). `isNavActive`'s `navRide` now carries the **destination** (§3.8.1): the leader's turn-by-turn is decided by `marker === destKey(stop)`, read live, not by whether a screen remounted. Review fixes and the launch prompt: §3.1.5, §3.8.1, §11. |

Open questions 1-3 in §15 are answered by the table above.

### P1 review fixes (2026-10-14) — behaviour that differs from, or adds to, the text below
*(D5 withdrew the group form, so the items below about `createGroupRide`, the group form, Ride with a group and the group-ride marker are history; the rest stands.)*
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
routing, all attributed. No secret in the app. **Location is asked when Home opens (D5, replaces "never at launch")**,
once per app run and only while the permission is undetermined; the "Show my location" explainer stays the way back after
"Don't allow" (04, rule 8 is relaxed for this one prompt). Status = colour + icon + text. Every target ≥ 56 dp (chips 48 visual with a 56 hit, as 21).

---

## 0. Summary

**Purpose:** open the app on a map centred on me, pick where to ride and **Start**. The ride is one kind; it becomes a
group when the rider shares its code from inside the ride (D5).

**One-second glance (at rest, phone in hand or on the mount before setting off):**
1. Am I offline / is a ride already running? (offline banner at the top; "Back to ride" card at the bottom)
2. Where am I? (my marker on the map)
3. Where to? (the search bar, and my recent places one thumb-tap away in the sheet)

**The flow in one line (Google Maps pattern, our branding):**
Map home → search → place sheet → **Directions** → route preview → **Start ride** → live with turn-by-turn (21).
To ride with others (D6): route preview → **Invite riders** → share the 6-digit code / WhatsApp link → **Continue to lobby**
→ riders join, the lobby shows who is in and "Riding to {place}" → **Start** → live with turn-by-turn + voice for the leader.
Or from a running ride: live → **Invite riders** → share the code → they join the running ride.

**How it is built:** Home becomes one screen with **one MapLibre map** and three modes (`browse` → `place` →
`route`) held in a small store. The search screen stays a separate route (`/where-to`, full screen, no map). The
route preview stops being a separate route and becomes Home's `route` mode, so the map never reloads between steps.
Start uses `startNavigationRide` (21 §2.4, with the default ride name). **D5:** there is no separate group start;
the earlier design that attached the destination in a group setup screen (`new-ride`, `createGroupRide`) is removed.
**No migration.**

| Phase | Ships | New dependency |
|---|---|---|
| **P1** Map home + Start | Map home (browse), sheet with all old Home content, search bar + chips → `/where-to`, place sheet, route mode with one **Start ride**, wired to 21, open-ride states, first-run, no-permission and offline states, web parity. *(D5: the solo / group choice, the group form and the lobby caption that P1 first shipped are removed.)* | none |
| **P2** ~~Group with destination~~ | **Obsolete (D5).** Lobby destination card, leader-only banner + voice (already dropped by decision 1), lobby menu copy fix | — |
| **P3** Polish | Chip results as pins on the home map, long-press to drop a pin, "Stay" chip. *(Obsolete: "Make it the destination" for a lobby leader, change destination from the lobby, destination in the invite text.)* | none |

### 0.1 Prior decisions this spec changes
| # | Was | Now | Why |
|---|---|---|---|
| 1 | 02 / 13 §3 / 16 §3: Home is a scrolling card page with a footer "Start a ride" primary | Home is a full-screen map with a floating search bar and a two-snap bottom sheet that holds the old content (§0.2). The screen's primary is the **search bar**; there is no filled footer button unless a ride is open ("Back to ride") | User request: map page as home, like Google Maps |
| 2 | 17 §2: "No floating search pill, no bottom-sheet drag handle" | **Map home only:** a floating search bar + chip row, and a draggable sheet with a grabber (it really drags, like the live group sheet, and has a tap/chevron alternative). Live keeps 20 C2 (search in the header) | 17 §2 protected the live map's glance and camera framing. Home is used at rest; the bar is counted in the camera padding (the 20 C2 camera rule) |
| 3 | 21 §2.1: Home card "Where to?" | The search bar **is** Where to? (placeholder "Where to?") | Same entry, Google position |
| 4 | 21 §2.2: Where to? is never auto-focused | Auto-focused **when opened from the bar** (the rider asked to type). Not focused when opened from a chip, and never while the typing lock is on (21 §2.2.2 unchanged) | Tapping a search field means "type". With no footer on the search screen any more, the keyboard leaves 5 recent rows visible at 360×780 |
| 5 | 21 §2.2: Where to? footer "Just ride, no destination" (2 taps from Home) | Home sheet tile **"Just ride"** (1 tap; was "Just ride solo", renamed by D5). The search screen has no footer | Free rides live on the map home (§3.9) |
| 6 | 21 §2.2: picking any row pushes `/route-preview` | **New place** (search result) → Home `place` mode (place sheet). **Recent place** (from the search screen or the home sheet) → straight to Home `route` mode. `/route-preview` becomes a redirect into Home (§5) | Google: a new place shows its card first; a place you already went to goes straight to directions. Keeps the fast path (§1) |
| 7 | 21 §2.3: one primary **Go** on the preview | One primary, **Start ride** (D5), and since D6 a secondary **Invite riders** under it (create in the lobby with the destination, invite, start from the lobby). *(Superseded design: two stacked actions under "How are you riding?", Ride with a group + Ride solo.)* | User, 2026-10-15: no separate group menu (D5), but a group start from the preview is wanted (D6) |
| 8 | 21 §1: 3 taps Home → recent → Go | **2 taps** from a recent place in the home sheet (recent → Start ride); 3 from the search screen's recents; 4 for a searched place (bar, result, Directions, Start ride) | Recents are in the thumb zone; the place sheet costs one tap only for new places |
| 9 | 21 §6 / `isNavActive`: a group never starts navigation | **Not approved (decision 1), and no longer needed (D5):** navigation is started for a ride of one led by me; riders who join later get the route line + stop card, the leader keeps turn-by-turn (§3.8.1) | There is no group-creation path any more, so "a ride created as a group" no longer exists |
| 10 | 13 §3 greeting as the page title ("Good evening, Raghu", 28) | Greeting moves to the sheet header (16 semibold). First run keeps "Welcome, {name}" there | Nothing big floats over the map; the greeting is warmth, not a glance fact |
| 11 | 02: with a lobby ride open, "Start a ride" stays as a secondary (switch / leader-busy sheets) | With any open ride the tiles are hidden. Starting another ride is still possible from a place's route mode, which runs the same switch / leader-busy sheets | One open-ride state, one primary ("Back to ride") |
| 12 | 05: the lobby has no destination | **Withdrawn (D5), then partly restored (D6):** a ride made by **Invite riders** sits in the lobby with its destination and the lobby shows "Riding to {place}" (§3.7). Start ride and Just ride still start at once | Only Invite riders makes a lobby ride with a destination |
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
| Footer "Start a ride" (primary) | Search bar → place → **Start ride** on the route preview; sheet tile **"Just ride"** (no destination) | D5: there is no group start; a ride becomes a group when its code is shared from the live screen |
| Ride in progress card (convoy, exception line, Back to ride) | Peek: compact card with **Back to ride** (the primary). Expanded: the full card with the convoy strip | Unchanged data (`useHomeConvoy`) |
| Offline banner `home.offlineSaved` | Full-bleed at the top, above the search bar, new text `homeMap.offline` | Viewer offline is said first (rule 2) |
| Welcome toast after onboarding | Unchanged | — |
| Switch / leader-busy confirm sheets | Unchanged copy; now opened from route mode's Start ride | — |

---

## 1. Flow

```
                         ┌───────────── Home (one screen, one map) ──────────────┐
launch → gate ──none──►  │ browse ──[place picked]──► place ──[Directions]──► route │
            │            │   ▲  ▲          (Android back / ‹ / ✕) ◄──┘   ◄──(‹ / back)┘ │
            │            │   │  └─────[recent place: home sheet or search recents]────┘ │
            │            └───┼────────────────────────────────────────────────────────┘
            │                │ bar / chip                       route ─[Start ride]──► startNavigationRide (21 §2.4)
            │                ▼                                    │                    → [permissions] → live (nav)
            │           /where-to (search, full screen)           │
            ├─active ride──► /ride/<id>/live  ◄── joiners (code / link) enter here, with the route line + stop card
            └─lobby ride───► /ride/<id>/lobby (a ride made by Invite riders, or one an older build left in the lobby)
Home sheet tiles: Join with a code → /join · Just ride → startSoloRide → live (normal sheet view)
Group (D6): route ─[Invite riders]─► startInviteRide (lobby ride + stop) → /ride/<id>/invite?first=1 ─[Continue to lobby]─► lobby ─[Start]─► live (the leader navigates)
Group from a running ride (D5): live → "Invite riders" row (or ⋯ → Invite riders) → /ride/<id>/invite (6-digit code + WhatsApp) → riders join the running ride
Open ride on Home: peek = Back to ride (primary) · search bar (active ride) → /ride/<id>/search?from=home
```

**Tap counts (from the map home, no ride open):**
| Goal | Taps |
|---|---|
| Ride to a recent place | recent row in the sheet (1) → **Start ride** (2) |
| Via search recents | bar (1) → recent (2) → Start ride (3) |
| Ride to a new place | bar (1) → result (2) → Directions (3) → Start ride (4). Chip: chip, result, Directions, Start ride |
| Start a ride with riders (D6) | route preview: **Invite riders** (1) → share the code / WhatsApp (optional) → **Continue to lobby** (2) → **Start** (3). From a recent place in the sheet: 2 + 3 = 5 taps |
| Make the running ride a group (D5) | live: **Invite riders** row (1) → share the code / WhatsApp (2). Or ⋯ (1) → Invite riders (2) → share (3) |
| Just ride / Join | 1 tile tap |

The first ride ever adds the permissions explainer (04), as every ride does today.

**When rows are created:** at **Start ride** (21 §2.4, unchanged), **Invite riders** (D6: a lobby ride with the stop) or
**Just ride**. Browsing the map, searching, opening a place or a route creates nothing on the server. Sharing the
code later changes no row: joiners add `ride_members` rows to the ride.

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

#### 3.1.3 Tiles (`QuickTiles`, new; D5: two tiles)
Two equal tiles in one row, gap 8, padding-x 16: width `(windowW − 32 − 8) / 2` = **160** at 360 (`homeTiles()`, tested).
`minHeight` `size.quickTile` 80 (grows with text), radius `radius.lg` 16, bg `surface`, pressed `surfacePressed`
(+ the `PressableScale` press motion), padding 8, centred column: icon circle 32 `brandTint` with icon 20
`brandOnBg`, gap 8, label 14 `family.semibold` `text`, centred, up to 2 lines (3 at 1.3×).

| Tile | Icon | Label | a11y label | Action |
|---|---|---|---|---|
| 1 | `dialpad` | `homeMap.tileJoin` "Join with a code" | `homeMap.tileJoinA11y` | `push('/join')` (one tap, unchanged) |
| 2 | `bike` | `homeMap.tileRide` "Just ride" | `homeMap.tileRideA11y` | `startSoloRide(thresholdS, defaultRideName(first))` → `resetToRide` (a ride with no destination; **normal sheet view since D6**, not full map). Tile shows a spinner in the icon circle and ignores taps while it runs; error → toast `errorText(code)` |

~~Tile 1 "Start a group ride"~~ is removed (D5): any ride becomes a group from the live screen. "Just ride" is named
neutrally for the same reason (it was "Just ride solo").

Tiles are tonal on purpose: the screen's primary is the search bar; the tiles are equal alternatives. Hidden while a
ride is open (§3.10).

#### 3.1.4 Recent places in the sheet
- Rows = `PlaceRow` 64 with the `history` tile (as `RecentPlacesSection`), name 16 semibold, address 14 muted,
  distance 14 semibold tabular from my fix (no column without a fix).
- Peek rows have no section label; their a11y label is prefixed `homeMap.recentA11y` "Recent place, {row}".
- Tap → haptic `select` → `plan.openRoute(place, 'recent')` (straight to route mode, §3.4).
- Expanded: `SectionLabel` `homeMap.recentPlaces` + text button `whereTo.clear` (56 hit) → the existing
  `whereTo.clear*` ConfirmSheet.

#### 3.1.5 Location (D5: asked when Home opens; the explainer stays as the way back)
- **Launch prompt (user decision, 2026-10-15, replaces "no prompt on launch"):** Home asks for foreground location as
  soon as it opens while the permission is `undetermined` and can still be asked (`launchPromptWanted` in
  `plan-flow.ts`, with a **module-level** flag in `home.tsx`: once per app **process**, not per Home mount, so coming
  back from a ride never asks again; **never on web**, where the browser prompt stays on the explainer button). If it is granted the camera eases to me (`recentre`). After "Don't allow" the OS does not show
  the dialog again, so **Show my location** (below) is the way back and it explains first.
- Position: `usePlanningPosition()` (permission read, last-known ≤ 2 min, Balanced watch every 10 m while Home is
  focused; AppState `unknown` at cold start counts as in front, `lib/app-state.ts`). It already writes
  `nav-store.origin`. `servicesEnabled` is `Location.hasServicesEnabledAsync()`, re-read on `AppState` active.
- `LocationRow` (moved from `where-to.tsx` to `src/components/location-row.tsx`, props `title`, `body`): on Home it
  uses `homeMap.locTitle` / `homeMap.locBody`; services off: `homeMap.locServicesTitle` / `homeMap.locServicesBody`
  with `perm.openSettings`. Blocked (`canAskAgain === false`): `perm.openSettings` → `Linking.openSettings()`.
- **Show my location** (me slot) opens a `Sheet` with the same LocationRow content and its button. It explains first; the
  OS prompt comes from the launch prompt (once per run) and, after a refusal the OS lets us ask again, from this button. After a grant the
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
│ Your first ride is three steps away.   │ 14 muted (home.firstSub)
│ ┌──────────────┐ ┌──────────────┐      │ tiles 160×80, gap 8 (D5: two)
│ │    (dial)    │ │    (bike)    │      │   icon 32 brandTint / 20 brandOnBg
│ │ Join with a  │ │  Just ride   │      │   14 semibold, 2 lines
│ │    code      │ │              │      │
│ └──────────────┘ └──────────────┘      │
│ [pin]  See where you are               │ LocationRow: tile 40 brandTint · 16 semibold
│  40    Shows you on the map and finds  │   14 muted, up to 3 lines
│        places near you. …              │
│ (          Allow location            ) │ BigButton secondary 56
│ (1)─ Pick where you're riding          │ FirstRunSteps (D5 copy)
│  │   Search a place, check the route,  │   tap Start.
│ (2)─ Share the code to ride together   │   Invite riders from your ride. They join from WhatsApp or the code.
│ (3)─ Ride. Nobody gets lost.           │   Everyone sees who is ahead, behind or stopped.
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
│ [ Join with a code ] [   Just ride   ] │ tiles (D5)
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

### 3.4 Route preview with Start — Home `route` mode
**Purpose:** see the trip, then start (alone, or with riders: D6). **Glance:** `1 h 34 min · 119 km`, then **Start ride**.
The 21 §2.3 preview, moved into Home: `RoutePanel` (new, the body of today's `Preview` component), the same
`usePreviewRoute`, the same states table (21 §2.3), the same car note / D2a flag, the same `previewPadding` for the
fit and the same floating back circle (`fabBg`, 56, `top: insets.top + bannerH + 8`, `left: 12`,
label `preview.a11yBack` now "Back"). **D5, amended by D6:** the bottom has one primary (Start ride) and one secondary under it (Invite riders):

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
│ [ >            Start ride            ] │ BigButton primary prominent 56, icon navigate (`routeActions().start`)
│ [ +        Invite riders             ] │ BigButton secondary 56, icon invite (D6, `routeActions().invite`)
└────────────────────────────────────────┘ ≈ 354 dp at 360 (290 with Start only); clear map ≈ 340
```

#### 3.4.1 One primary, one secondary (D5, D6)
- **D6:** under Start ride sits **Invite riders** (`preview.invite`, secondary, 56, icon `invite`, label while it runs
  `preview.inviting`). Start stays the one filled primary. Both are disabled offline; while one runs it loads and the
  other is blocked (`routeActions`, tested), and Android Back is blocked, exactly as for Start (the same `goingRef` guard and start lock).
- The earlier two-action design ("How are you riding?" + **Ride with a group** + **Ride solo**, decisions 2 and the
  P1 reviews) is withdrawn. There is one kind of ride; the rider shares its code from inside the ride when they want
  company (§3.8). Nothing asks "solo or group" at the start.
- **Fewer taps and a lower panel than the two-choice design:** 2 taps from a recent place to Start.
- **Glove safety:** Start commits now (creates and starts the ride); a mis-tap is undone by End ride. Full width, 56.

#### 3.4.2 States added to the 21 §2.3 table
| State | Panel | Start ride |
|---|---|---|
| Viewer offline | `preview.offline` banner (exists) | **disabled** |
| No location permission | note `preview.noLocation` + ghost `whereTo.locAllow` 56 (→ OS prompt; blocked → `perm.openSettings`); map frames the pin only | enabled (the ride's own permissions explainer runs after) |
| Start / Invite running | `preview.starting` on Start ride, or `preview.inviting` on Invite riders, loading | the running one loads, the other is disabled; Android back blocked (exists) |
| A lobby ride is open (I'm a rider) | unchanged | both → `home.confirmSwitch*` sheet → `startNavigationRide` / `startInviteRide(place, s, { leaveRideId, rideName })` (the one that was tapped) |
| A lobby ride is open (I'm its leader) | unchanged | both → `home.leaderBusy*` sheet ("Go to {ride}") |
| Active ride open | not reachable (the bar opens the in-ride search, §3.10); a stale route mode is reset on focus | — |

### 3.5 Start (was "Solo path")
- **Start ride** = 21 §2.4 `startNavigationRide(place, thresholdS, { rideName, leaveRideId? })`. `rideName` is
  `defaultRideName(first)` ("Raghu's ride"; "Group ride" when the name is unknown): **never "Solo ride"**, because the ride
  may be shared and its name is in the invite text (decision 3 still keeps the destination out of it). `leaveRideId`
  (leave + `stopRideTracking()` first) is for the switch case.
- Then exactly today's preview `go()`: `nav-store.startSession(rideId, seed, avoidMotorways)`, `recents.add(place)`,
  `track('nav.started', { from: 'map_home' })`, haptic `success`, `plan.reset()`, `resetToRide(href)` (`dismissTo('/home')`
  is a no-op with Home on top, then push). `ride.created` carries `start_kind: 'start'` (Just ride: `'just_ride'`, Invite
  riders: `'invite'`; D6 replaces `with_dest`, whose meaning had changed, §11). `solo-nav` also writes the nav-ride marker
  with the stop (`markNavRide(rideId, destKey(place))`) right after `propose_stop`, and removes it if a later step fails.
- Live: 21 unchanged (sheet mode, turn banner, voice, arrival), plus the Invite riders row (§3.8).

#### 3.5.1 Invite riders (D6): a lobby ride with the destination
`startInviteRide(place, thresholdS, { leaveRideId?, rideName })` in `lib/solo-nav.ts`, behind the same `withStartLock`
and the same open-ride check as Start (an open ride is opened as it is, toast `preview.existingRide`):
1. `create_ride(defaultRideName(first))`: the normal name, **never containing the destination**; the ride is in `lobby`.
2. `propose_stop` (the leader's stop applies at once). **If it fails the ride is ended again** (`rollbackRide`, retried, then
   remembered), no marker is written, the error toast shows and Home stays on route mode with both buttons enabled.
3. `markNavRide(rideId, destKey(place))`, so the leader navigates once the lobby ride (with riders) is started.
4. Home hands the previewed route to `nav-store.startSession` (as Start), adds the recent place, `haptic('success')`,
   `resetToRide('/ride/<id>/invite?first=1')`. Stack `[home, invite]`.
- **Invite screen, `?first=1`:** the 6-digit code + WhatsApp / SMS / share as always (10); the footer reads
  **Continue to lobby** (`invite.continue`) and does `replace(hrefAfterEnter({ id, status }))`: the lobby, or the
  permissions explainer first when something is still undetermined (04). A second tap and Android Back are ignored while
  it runs. Without `first` the footer stays **Done** (= back). TopBar Back leaves to Home: the ride stays in the lobby
  and Home shows "Back to ride" (the lobby is `hrefAfterEnter`'s home for it). When there is nothing to go back to the
  screen replaces itself with `rideHref(id, status)` for the ride's real status (not the lobby, which flashed before the redirect, L7).
- **Lobby (05 + D6):** unchanged, plus the **"Riding to {place}"** caption (`lobby.destLine`, §3.7) for the leader and for joiners.
  Riders join with the code or link while it waits. The leader taps **Start** (`lobby.start`, guarded against a double tap)
  → `start_ride` → the ride layout moves everyone to live. The leader's turn banner and voice start there (§3.8.1);
  joiners get the route line + stop card and never a banner.
- **Taps from the route preview:** Invite riders (1) → [share] → Continue to lobby (2) → Start (3).
- **Review fixes (after D6, behaviour changes):**
  - **No background tracking in the lobby (M1, M2).** The ride layout starts the location task only when the ride is
    **active** (`lib/location/start-rule.ts` `shouldStartTracking`: loaded, this ride, not left, foreground granted, a ride
    screen in front, `status === 'active'`). A forgotten lobby keeps no foreground service or uploads, and the Android 11+
    background-location Settings page can no longer pop up over the invite screen. Joiners in a lobby behave the same and
    start when the status turns active (the effect depends on `status`). The permissions explainer, when reached with
    `next=lobby` (a joiner), only **asks** (`requestTrackingPermissions`), it does not start tracking.
  - **The explainer runs at Start (M1).** Lobby **Start** reads the permissions first (`hrefAfterEnter({ status: 'active' })`),
    calls `start_ride`, and when something is undetermined goes to `/permissions?rideId=<id>&next=live` (the background
    prompt follows the explainer, exactly like Start ride); otherwise the ride layout moves everyone to live. The
    permissions screen is outside the ride, so the layout starts no tracking under it.
  - **Lobby "ready" = on the channel.** With no position shared in the lobby, a fresh position can no longer mean
    "ready": the lobby counts riders on the channel (`connected` or `ready`) in "N riders, R ready"; the row state shows
    `connected` until the ride starts.
  - **Android Back is ignored while lobby Start runs** (§13, M3), like Continue to lobby.
  - **Invite riders does not seed the route (L4).** `startSession(rideId, null, avoid)` for an invited ride: its lobby may wait
    minutes, and a seed counts as "just fetched", so the leader's first route is fetched fresh after Start.
  - **Telemetry (L6):** `nav.started { from: 'map_home' }` fires at lobby Start for an invited ride (this phone has its
    marker and the ride has a stop); the lobby code long-press sends `invite.shared { via: 'lobby' }`; `ride.group_formed`
    is persisted per ride (`nav.groupFormed.v1`, cleared with the ride's marker) so a restart cannot fire it twice.
  - **Marker pruning (L7):** `end_ride` (also how a lobby is cancelled) from this phone drops the ride's marker; Home drops
    markers of rides that are not my open ride after a successful open-ride read (`pruneNavRidesExcept`, skipped when a new
    marker appeared during the read). The orphan key `pref.soloFullMapSeen` is deleted there too (L3).
  - **Launch prompt (L8):** only while Home is focused (`launchPromptWanted({ focused })`); if the permission read resolves
    under a ride, it is asked on the next focus.

### 3.6 Group setup with the destination — withdrawn (D5)
`/new-ride`, `createGroupRide`, `lib/group-ride.ts`, `DestinationCard`, the `plan-store.routeSummary` hand-off and the
`newRide.*` form copy are deleted. The one thing the form held that is still needed, the **stop-alert time**
(1 / 3 / 5 min, `pref.stopThresholdS`), is now a setting under **Profile → Safety** ("Alert when a rider has stopped
for", the same `SegmentedControl`, keys `profile.threshold*`); every new ride is created with it. The note
`profile.thresholdNote` ("Applies to rides you start from now on.") sits under the preview line (D6). The ride name is not
editable at start any more (rides get the default name).

**Rename ride (D6 decision 3): done; migration 0010 applied to the project on 2026-10-15 (the user approved).** The ⋯ menu row
**"Rename ride"** (`SheetAction`, `edit` icon, after Share code) shows for the **leader only**, in lobby and live, never for riders,
after the ride ended or once I left (`renameMenuVisible`, `lib/rename-ride.ts`). It opens `RenameRideSheet`: a full-screen
sheet (same keyboard-safe pattern as the profile name editor) with a text field prefilled with the current name, a live
`n/60` count from 48 characters on, **Save** disabled when unchanged, empty (no letter or digit) or over 60 (`canSaveRename`),
and the typing lock (`useTypingLock`, 21 §2.2.2): while moving the field is read-only, the keyboard is dismissed, the note
`rename.locked` shows and Save stays disabled. Save calls `ride-api.renameRide` -> RPC `rename_ride` (`supabase/migrations/0010_rename_ride.sql`:
leader only, ride not ended, trim, 1 to 60 characters, `security definer`, no ride event). On success: the returned row goes
into the ride store at once (`applyRide`), toast "Ride renamed", success haptic; everyone else gets it through the existing
`rides_broadcast` update trigger (header re-renders from the store). On error the sheet stays open with the message under the
field. Until 0010 is applied the RPC fails with "function not found", mapped to `rename_unavailable` ("Renaming isn't
available yet. Try again later."). Telemetry: `ride.renamed` (no props).

### 3.7 Lobby with the destination — restored by D6 for Invite riders (the P2 card stays dropped)
D5 withdrew this because no ride from Home sat in the lobby. **Invite riders** (D6) makes one: the lobby shows the
one-line caption **"Riding to {place}"** (`lobby.destLine`, `caption` muted, a `coffee` / `endRide` icon by stop kind,
one line) under the stop-alert line, for the leader **and for joiners** (it reads the ride's stop, not local state). The P2
destination card (distance, Remove destination) and the lobby copy fix stay dropped. The lobby is otherwise 05.

### 3.8 How a ride becomes a group, and what each rider gets (D5)

**Becoming a group is inside the ride, with the existing screens (no new UI beyond copy):**
1. Live, solo panel: the **Invite riders** row (`SoloInviteRow`, 64 dp, below the stop card). Its sub-line is now
   `live.soloSub` "Share the code to ride together" (was "You're riding solo": it says what the row is for). Tap →
   `/ride/<id>/invite`. Or the header ⋯ → **Invite riders** (also **Share code**, which opens the share sheet directly).
2. Invite screen: the 6-digit code, WhatsApp / SMS / share (10). The text carries the ride name ("Raghu's ride") and the
   link or code, never the destination (decision 3).
3. Riders join with the code or the link (`join_ride`, which accepts any ride that is not `ended`); the leader's
   panel switches from the solo panel to the group sheet (20 C4) on the first join; the rest of the ride is unchanged.

**Discoverability with a destination (20 C4 heights checked).** The solo panel is one fixed height at every snap:
`8 + stop card 64 + invite row 64 = 136 dp` with a destination (72 without). The invite row is **not** displaced by the
stop card; both are always visible. The turn banner (96, +40 with the Then row) docks at the top of the map, above the
convoy strip, so it does not touch the sheet. Where the row is not on screen: **arrived** (the arrival panel, 216 dp,
replaces the invite row: the ride is ending, and ⋯ → Invite riders stays one tap away in sheet mode) and **full map**
(no sheet and no header; the rider leaves full map first). A free ride from **Just ride** no longer opens in
full map (D6, §3.9), so the row is visible from the first second; full map stays one tap away.

**What each rider gets in a ride that has riders (decision 1 stands):**
- **Joiners:** the 19 A route line from their own position and the 20 C5 stop card ("119 km · 1 h 34 min / Mysuru
  Palace"), the full-map stop chip and the 150 m arrival line. No "Next stop" toast at join (the stop was set before
  they joined). A joiner lands on `/ride/<id>/live` (`hrefAfterEnter`, via the permissions explainer when something is
  undetermined); the group sheet, not full map (no ride opens in full map by itself: the full-map toggle is per ride, see §3.9).
- **The leader who started navigating:** keeps the turn banner and voice (21 §10 layout: banner above the convoy strip,
  voice toggle in ⋯). Arrival is announced once; there is no ArrivalPanel in a group (End ride is in ⋯).
- **Group turn-by-turn for everyone** waits for hosted routing (D1): N riders rerouting would break the OSRM demo's
  fair use. Request load today = one navigating rider + one route per joiner on the 19 A 60 s rule.

#### 3.8.1 `isNavActive` after D5 and D6 (implemented)
```ts
isNavActive(a) = a.rideLive && a.hasStop && !a.arrived &&
  (a.engineRunning || (a.leader && (a.solo || a.navRide)))
```
- `leader`: only a ride's leader starts navigation (a rider left alone in someone else's ride does not).
- `solo`: a ride of one starts it (Start ride, or a stop added to a Just ride).
- `engineRunning`: the leader's session keeps running when riders join (21 §10), while the ride screens are up.
- `navRide` (D6: **`marker === destKey(stop)`**): this phone navigated THIS stop of the ride as its leader
  (`lib/nav-rides.ts`, `nav.navRides.v1` = `{ rideId: destKey }`). The marker is written (a) at creation, by `solo-nav`,
  for Start ride and for Invite riders (the leader navigates after starting a lobby ride that already has riders), and
  (b) by the ride layout whenever navigation is on for the leader (a solo leader who sets a new stop re-marks it). It is
  removed when the ride ends or I leave it, pruned from Home's ended list, and **cleared on sign-out**
  (`clearHomeDevicePrefs`). The first version (a list of ride ids) is read as empty.
- **Read live, so every screen agrees (review H1).** The layout and the live screen both use `useNavRide(rideId, stopLL)`
  (`useSyncExternalStore` on the marker), not a value read once at mount. Whether turn-by-turn is on no longer depends on
  whether a screen remounted: a stop that is not the marked one (a proposal the leader accepted with riders present, a stop
  added to a group) is **never navigated**, mounted or reopened; the same stop set again resumes.
- A phone without the marker (another device, reinstall) does not resume it: it fails closed, and the group keeps the
  route line and the stop card. Joiners never navigate (`leader`). The old "group ride" marker (`nav.groupRides.v1`) has
  no job and is deleted from storage by Home and at sign-out.
- Tests: `nav-banner.test.ts` (`isNavActive` and the marker scenarios), `nav-rides.test.ts`, `solo-nav.test.ts`.

- Note: the 19 A route lines already send one OSRM request per rider per stop change (+ reroutes). That load exists
  today and grows with group size; it stays the D1 pre-launch risk.
- Vertical budget at 360×780 (leader, collapsed sheet): 588 − banner 96 − convoy 84 − sheet 136 = **272** visible
  map; with 2 layout banners the right column auto-hides (20 C1 `mapVisH < 176`). Acceptable; a 72 dp compact
  group banner stays a follow-up (21 §6.2).

### 3.9 Free rides (no destination)
| Ride | Where | Behaviour |
|---|---|---|
| Just ride | Tile **Just ride** (1 tap) | `startSoloRide(thresholdS, defaultRideName(first))`: live in the **normal sheet view** (D6: never full map by itself; the Invite riders row and ⋯ are visible at once), header search adds a stop later (21 §2.9); invite riders from the panel / ⋯ like any ride. `lib/full-map.ts` has no first-open rule any more (`shouldDefaultFullMap`, `fullMapDefaultStep` and `pref.soloFullMapSeen` are deleted); full map is the toggle, and it is per ride: `createRide` calls `live-ui-store.startNewRide()`, so a new ride (Start ride, Invite riders, Just ride) never opens in full map because the last one was left in it (L1) |
| Join | Tile **Join with a code** (1 tap) | `/join` (unchanged) |
Not on long-press (undiscoverable, and long-press on the map is reserved for "drop a pin", P3).

### 3.10 An open ride on Home
- **Gate unchanged** (`decideGate`): active → live, lobby → lobby, none → home. Home only shows an open ride after
  the rider went Back from lobby/live (the ride keeps tracking, 00 §1), or when the cached ride is stale offline.
- Peek = compact ride card + **Back to ride** (primary) → `push(rideHref(id, status))` (exists). Tiles hidden.
- Active ride: the bar reads `homeMap.searchStops` and opens `/ride/<id>/search?from=home` (19 A search; leader
  sets, rider suggests). `search.tsx`: when `from=home`, a successful pick does `router.replace('/ride/<id>/live')`
  instead of `back()`. Chips are hidden. Recent places are hidden (they would lead to a second ride).
- Lobby ride: the bar is the normal "Where to?"; route mode's Start ride runs the switch / leader-busy sheets
  (§3.4.2). P3: a lobby leader gets "Make it the destination of {ride}" instead.
- On focus with an active ride, `plan.reset()` (a stale place/route mode is never shown under "Back to ride").

---

## 4. The home map

### 4.1 Same map as live, lighter
> **2026-10-16, see 24:** tiles are the bundled `tt-liberty` / `tt-dark` for both styles (24 §1); search and routes go
> through Geoapify / LocationIQ (24 §2–3); the attribution pill text, its second line and the route-panel credit row are in 24 §4.
>
> **2026-10-20, see 25:** a 56 dp **Map type** circle (Standard / Terrain) sits top-right in all three Home modes (under the
> chips in browse, under the place bar in place mode, level with the back circle in route mode) and opens the Map type sheet;
> terrain shading and the new map detail are in 25 §2–4.

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
- **One GL map at a time.** `homeMapMounted(pathname, rideOnHome)` (updated by 28 §8): with the live ride on Home's map
  (default on native) it is a **deny-list**: the map stays mounted on every path except `/ride/<id>/summary`, which draws its
  own map. The lobby, the invite screen, the live hand-off, profile, join and the rest keep Home's map mounted under them, so
  nothing reloads when a ride starts or opens, and Back lands on a map that is already there. With the flag off
  (`EXPO_PUBLIC_LIVE_ON_HOME=0`) and on web the old allow-list stands: the map is mounted only on `/home`, `/where-to` and
  `/route-preview`, and elsewhere Home renders `bg` (and remounts at the saved camera with a 150 ms fade). Either way the
  home map and a live-screen map never run together.
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
| Home browse, sheet expanded | collapse to peek | strip tap / drag |
| Home browse, peek | OS default (leave the app) | — |
| Home place | → browse (camera restored) | bar ‹, panel ✕ |
| Home route (from a search result) | → place | floating ‹ |
| Home route (from a recent) | → browse | floating ‹ |
| Home route, Start ride running | blocked (exists) | ‹ ignored |
| `/where-to` | → Home, mode unchanged | ‹ |
| Ride view on Home (28 §8) | one step per press, `rideBack`: stop search → ride view; selected rider → cleared; full map → normal; list pulled up → collapsed; then the OS (backgrounds the app). Never browse: while a ride is active the map IS the ride view | header ‹ only while there is a step (no arrow otherwise) |
| Lobby | → Home (the ride keeps going; plan was reset at entry) | header ‹ |
| A Sheet / ConfirmSheet open on Home | closes the sheet first | Cancel / scrim |
A receiver SOS takeover over Home owns Back (Home's handler returns false while one shows), and Back is still blocked while a
ride is being started. The order in Home's handler: starting-ride block, takeover, `rideBack`, then (ride view) the OS or (browse) `planBack`.
iOS: Home is the stack root (no edge swipe).

### 5.2 Stacks after each start
- Start / Just ride: `[home]` with the ride view open on it (28 §8; `openLiveRide`), or `[home, permissions]` and then the same when something is still undetermined. With the flag off or on web: `[home, live]` as 21.
- Invite riders on the route preview (D6): `[home, invite?first=1]` → Continue to lobby → `[home, lobby]` → Start → `[home, live]`.
- Inviting from the live view: `[home(ride view), invite]`; Done / Back returns to the ride view (`[home, live, invite]` with the flag off).
- Join (tile or deep link): unchanged `join.tsx` replaces; the stack ends `[home, live]` (or `[home, lobby]` for a ride an
  older build left in the lobby) when Home was below.

### 5.3 Plan reset (never a stale preview under a ride)
`plan.reset()` runs: in `resetToRide()`, on join success (`join.tsx`), and on Home
focus when an active ride is open. The browse camera is kept.

### 5.4 Deep links and old routes
- `throttletribe://join?code=` and the hosted invite `?c=` → `/join` (outside `(app)`): unchanged. They work with
  the map home mounted below or not, and with a ride that is already active and has a destination (D5, verified).
- `/new-ride` no longer exists (D5); nothing linked to it.
- Notification taps → ride routes: unchanged.
- `/where-to` opened directly (web URL): works; a pick does `replace('/home')` with the plan store set.
- `/route-preview?id&name&address&lat&lng&category` (old links, bookmarks): the route file becomes a redirect:
  `parsePreviewParams` → `plan.openRoute(place, 'recent')` → `<Redirect href="/home" />`; bad params → `/home`.

---

## 6. States

| Screen / state | Behaviour |
|---|---|
| Home: first run | Sheet expanded once (§3.1.2 A); welcome text in the header; LocationRow if not granted; the launch location prompt shows first (D5) |
| Home: returning, no ride | Peek: tiles + 1–2 recent places; expanded: recents, nudge, stats, recent rides |
| Home: loading (open ride / rides unknown) | Returning layout without recent rides; tiles enabled; ride card fades in if found |
| Home: active ride open | Peek: compact ride card + Back to ride; bar → in-ride search; tiles, chips, recents hidden |
| Home: lobby ride open | Peek: compact card ("Waiting in the lobby") + Back to ride; bar = Where to?; route actions → switch / leader-busy |
| Home: location undetermined / denied | Undetermined: asked once on open (D5). After "Don't allow": me slot "Show my location" → explainer sheet; LocationRow in the sheet; no distances |
| Home: location blocked / services off | Same, button `perm.openSettings`; services copy when off; re-read on return |
| Home: granted, no fix yet | Me slot "Finding you…" disabled; camera saved / fallback |
| Home: viewer offline | Offline banner on top; cached tiles; tiles and search enabled (they explain errors) |
| Home: map failed | `homeMap.mapFailed` on `bg`; everything else works |
| Home: received SOS while on Home | Unchanged from today: push notification → ride (Home is outside the ride layout, as before) |
| Place: no fix | `stop.noFix` instead of the distance; pin centred |
| Place: offline | Works (data came from search); Directions enabled; route mode shows its offline state |
| Route: all | 21 §2.3 table + §3.4.2 |
| Start ride: propose_stop fails | The ride is ended again (`rollbackRide`, 21 §2.4); toast; stay on route mode with Start enabled |
| Live ride with riders and a destination | 19 A line + 20 C5 card for joiners; the leader who was navigating keeps banner + voice (§3.8) |
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
| Tile | 160×80 | tap | `select`, press scale | §3.1.3 |
| Recent place row | 64 | tap | `select`, `surfacePressed` | Home route mode |
| Clear (recents) | 56 | tap → confirm | `select` | list emptied |
| Back to ride | 56 | tap | `select` | lobby / live |
| Place bar ‹ / panel ✕ | 56 | tap | `select` | browse |
| Place bar name | 56 | tap | `select` | `/where-to?q=…` |
| Directions | 56 | tap | `select` | route mode |
| Route ‹ | 56 | tap | `select` | place / browse |
| Allow expressways (flagged) | 56 | tap row | `select` | 21 §2.3.1 |
| Start ride | 56 | tap | loading; `success` on start | 21 §2.4 → live (or switch / leader-busy sheet) |
| Live: Invite riders row / ⋯ → Invite riders | 64 / 56 | tap | `select` | invite screen: code + WhatsApp (§3.8) |

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
| `homeMap.tileJoin` / `homeMap.tileJoinA11y` | Join with a code / Join a ride with a 6-digit code |
| `homeMap.tileRide` ✎ / `homeMap.tileRideA11y` (D5, was `tileSolo`) | Just ride / Start a ride without a destination. You can invite riders once it has started. |
| `home.firstSub` (D5) | Your first ride is three steps away. |
| `home.step2Title` / `home.step2Body` (D5) | Share the code to ride together / Invite riders from your ride. They join from WhatsApp or the code. No sign-up. |
| `live.soloSub` (D5) | Share the code to ride together |
| `profile.thresholdLabel` / `profile.threshold1,3,5` / `profile.thresholdPreview` (moved from `newRide.*`) | Alert when a rider has stopped for / 1 min, 3 min, 5 min / We'll alert the group if someone stays still for {n} min. |
| `preview.invite` / `preview.inviting` / `preview.inviteA11y` (D6) | Invite riders / Setting up… / Invite riders to ride to {name}. Opens the ride code first, and you start from the lobby. |
| `invite.continue` (restored, D6) | Continue to lobby |
| `lobby.destLine` (restored, D6) | Riding to {place} |
| `profile.thresholdNote` (D6) | Applies to rides you start from now on. |
| `newRide.defaultNameNeutral` (D6) | My ride (the default name when the rider's name is unknown; `newRide.defaultNameUnknown` "Group ride" stays only as `displayRideName`'s fallback for a blank stored name) |
| `homeMap.recentPlaces` | Recent places |
| `homeMap.recentA11y` | Recent place, {row} |
| `homeMap.barBackA11y` | Back to map |
| `homeMap.barPlaceA11y` | {name}. Search again |
| `homeMap.step1Title` ✎ | Pick where you're riding |
| `homeMap.step1Body` ✎ (D5) | Search a place, check the route, tap Start. |
| `place.distance` | ≈ {km} away |
| `place.directions` / `place.directionsA11y` | Directions / Directions to {name} |
| `place.closeA11y` | Close {name} |
| `place.a11ySummary` | {name}, {distance} away, {address} |
| `preview.start` / `preview.startA11y` (D5) | Start ride / Start riding to {name}. Starts now. |
| `preview.noLocation` | Allow location to see the route. |
| `preview.a11yBack` (changed) | Back |
| `preview.existingRide` | You already have a ride open, so we opened it. End it first to ride to {name}. |

- Reused: `home.firstTitle`, `home.firstTitleNoName`, `home.firstSub`, `home.greet*`, `home.step2*`, `home.step3*`,
  `home.resume*`, `home.role*`, `home.confirmSwitch*`, `home.leaderBusy*`, `home.toastWelcome`, `home.recent*`,
  `home.seeAll*`, `home.stat*`, `home.exc*`, `whereTo.*` (incl. `clear*`, `locAllow`), `perm.openSettings`,
  `live.recentre`, `live.recentreA11y`, `live.attribution`, `live.attributionRoute`, `live.sheetValueCollapsed` /
  `Expanded`, `preview.*` (21), `stop.noFix`, `stop.clearCancel`, `newRide.defaultName` / `defaultNameUnknown` (the name of every ride).
- Retired by D5: `homeMap.tileGroup*`, `homeMap.tileSolo*`, `preview.choiceLabel`, `preview.rideSolo*`, `preview.rideGroup*`,
  `newRide.title`, `newRide.nameLabel`, `newRide.cta`, `newRide.setName`, `newRide.suggest1-3`, `newRide.titleDest`, `newRide.destLabel`,
  `newRide.destNote`, `newRide.existingRide`, `newRide.a11yDest`, `solo.rideName` ("Solo ride"). (`invite.continue` and `lobby.destLine` came back with D6.)
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
- **Thumb zone:** the commit actions (Back to ride, Directions, Start ride, tiles, recent places)
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
  the note, Start ride. `onAccessibilityEscape` = `plan.back()`.
- **Dynamic type:** `maxFontSizeMultiplier` 1.3 on the bar, chips, me slot, sheet header, tiles, place and route
  panels (fixed-height or glance zones). Expanded sheet content scales like today's Home (rest-time).
  At 1.3× the tile label may take 3 lines (tile grows past 80; the peek height is measured, not fixed).
- **360 dp:** bar text column = 336 − 16 − 24 − 12 − 56 = 228 dp ("Search stops for Sunday Run" truncates the ride
  name); place bar text = 336 − 56 − 16 = 264; tiles 160; route button 328; chips scroll horizontally (3 visible).
- **Light / dark × Tribe / Maps:** the bar and chips must read on every basemap: e2 shadow in light, `edge2`
  hairline in dark. QA screenshot set: A–E × 4 palettes.

---

## 11. Telemetry (`lib/telemetry/events.ts` allowlist)
`home.search_opened` { from: `bar` | `chip` } · `home.place_opened` { from: `search` | `recent` } ·
`home.directions` · ~~`plan.choice`~~ (removed by D5) · `ride.created` gains **`start_kind: 'start' | 'invite' | 'just_ride'`** (D6;
the earlier `with_dest` is retired and not sent: its meaning had silently changed from HEAD's "group ride made with a
destination") · **`ride.group_formed`** (D6; no props; once per ride, on the leader's phone, when the active rider count goes
from exactly 1 to more: `lib/group-formed.ts`) · **`invite.shared`** (D6; `via: 'share' | 'sms' | 'menu'`: the code / link was
handed to the share sheet, an SMS composer opened, ⋯ → Share code, or a long-press on the lobby code (`lobby`)) · `nav.started` gains `from: 'map_home'` (Start ride; for Invite riders at the lobby's Start) ·
`map.recentre` gains `screen: 'home'`. No coordinates, names, codes or place names in any event.

---

## 12. Files (engineer)

**P1 (as shipped, then amended by D5)**
- New:
  - `src/store/plan-store.ts`; `src/lib/plan-flow.ts` (+ `__tests__/plan-flow.test.ts`)
  - `src/components/plan-map.tsx` + `.web.tsx` (renamed from `route-preview-map(.web).tsx`, extended §2.2)
  - `src/components/home-search-bar.tsx`, `home-chips.tsx`, `home-sheet.tsx`, `quick-tiles.tsx`,
    `place-panel.tsx`, `route-panel.tsx` (today's `Preview` body + Start ride), `location-row.tsx` (moved from
    `where-to.tsx`)
  - `src/hooks/use-home-camera.ts` (centred / free, saved camera, intents)
- Changed:
  - `src/app/(app)/home.tsx` (rewrite: map, modes, sheet; keeps the refresh / welcome toast / confirm sheets logic)
  - `src/app/(app)/where-to.tsx` (params, pick → plan store + back, no footer), `place-search-view.tsx`
    (`initialText`, `initialChip`)
  - `src/app/(app)/route-preview.tsx` → redirect into Home (§5.4); keep `lib/preview-params.ts`
  - `src/app/(app)/ride/[id]/search.tsx` (`from=home` → replace live)
  - `src/app/join.tsx` (plan reset on success); `src/lib/reset-to-ride.ts` (plan reset)
  - `src/lib/solo-nav.ts` (`{ leaveRideId, rideName }`), `hooks/use-planning-position.ts` (`servicesEnabled`)
  - `src/components/ride-progress-card.tsx` (`variant: 'compact' | 'full'`), `home-widgets.tsx` (step 1 keys),
    `recent-places-section.tsx` (peek variant: no label, `limit`, a11y prefix)
  - `src/lib/storage.ts` (`homeCamera`, `homeFirstRunSeen`) + sign-out path (clear both)
  - `src/lib/copy.ts`, `src/lib/telemetry/events.ts`, `src/theme/tokens.ts` (§9)
- Deleted: `route-preview-map.tsx` / `.web.tsx` (renamed), `action-card.tsx` if no other user remains.

**D5 (2026-10-15)**
- Deleted: `src/app/(app)/new-ride.tsx` (and its modal entry in `(app)/_layout.tsx`), `src/lib/group-ride.ts` (+ test),
  `src/lib/group-rides.ts`, `src/components/destination-card.tsx`, `plan-store.routeSummary`, `plan-flow`
  `newRideHref` / `choiceStep` / `afterSwitch` / `PlanChoice`, the lobby "Riding to" caption and the invite screen's
  `?first=1` "Continue to lobby" mode (**both restored by D6** for Invite riders), the `plan.choice` event, `solo.rideName`.
- New: `src/lib/nav-rides.ts` (+ `__tests__/nav-rides.test.ts`), `plan-flow` `startStep` / `startAction` / `homeTiles`.
- Changed: `home.tsx` (Start, Just ride, `rideName`, launch location request kept), `quick-tiles.tsx` (two tiles),
  `route-panel.tsx` (one primary), `solo-nav.ts` / `solo-ride.ts` (`rideName`, `with_dest`), `nav-engine.ts`
  (`isNavActive`: `navRide`), `ride/[id]/_layout.tsx` + `live.tsx` (`navRide`, marker set / cleared), `profile.tsx`
  (stop-alert time), `copy.ts`, `storage.ts`, `telemetry/events.ts`.
- Obsolete from the old plan: P2 (lobby destination card, lobby remove-destination copy, `leaderNav` / `GROUP_LEADER_NAV`)
  and the P3 items "Make it the destination of {ride}", "change destination in the lobby" and "destination in the
  invite text".

**D6 (2026-10-15)**
- New: `src/hooks/use-nav-ride.ts` (live marker read), `src/hooks/use-app-in-front.ts` (`useSyncExternalStore` on `AppState`),
  `src/lib/group-formed.ts`, `src/lib/location/front-recheck.ts` (+ tests `group-formed`, `front-recheck`).
- Changed: `nav-rides.ts` (rideId -> destKey, subscribe, `clearNavRides`), `solo-nav.ts` (`startInviteRide`, marker at creation),
  `solo-ride.ts` / `ride-api.ts` (`start_kind`), `plan-flow.ts` (`routeActions`, `launchPromptWanted`), `route-panel.tsx` (Invite riders),
  `home.tsx` (`launch`, module-level launch flag, no web prompt), `ride/[id]/{_layout,live,lobby,invite}.tsx`, `plan-store.ts`
  (sign-out clears markers), `use-planning-position.ts` / `use-nav-position.ts` (`useAppInFront`), `location/tracking.ts`
  (recovery re-checks the app state for ~2 s), `full-map.ts` + `live.tsx` (no first-open default), `names.ts`, `copy.ts`,
  `profile.tsx`, `telemetry/events.ts`, `storage.ts` (`soloFullMapSeen` removed).
- **Rename ride** built (§3.6): `rename-ride-sheet.tsx`, `lib/rename-ride.ts`, `ride-api.renameRide`, `ride/[id]/_layout.tsx`; **migration `0010_rename_ride.sql` applied 2026-10-15.**

**P3**
- `plan-map(.web).tsx` (result pins, long-press), `lib/place-search.ts` (Photon `/reverse`, `stay` chip).

---

## 13. Acceptance checklist

**P1 (amended by D5)**
- [ ] Launch with no ride lands on the map home; active ride → live, lobby ride → lobby (gate unchanged).
- [ ] **D5:** the location prompt appears once when Home first opens with the permission undetermined (not on every
      render, not again in the same app run after "Don't allow"); granted → the camera eases to me. "Show my location" and
      the LocationRow still explain first after a refusal; blocked / services off open Settings and re-read on return.
- [ ] Without permission the map shows the saved camera or India at zoom 4; search, places and routes still work.
- [ ] With permission: marker + centred camera; panning shows Re-centre; Re-centre eases back; no fix → "Finding you…".
- [ ] Search bar: 56 tall, brand mark left, avatar (with to-do dot and label) right; tap opens search with the
      keyboard (not when typing-locked); chip opens search with that chip's results and no keyboard.
- [ ] Search result → place sheet (name, ≈ distance, address, Directions); recent (search or home sheet) → route mode.
- [ ] Android back: route → place (or browse for recents) → browse → collapse sheet → leave app; ‹ and ✕ match.
- [ ] **D5:** Route mode = 21 preview (summary, arrive time, note, flagged expressway row) + **one** primary, Start ride;
      no "How are you riding?", no group button; disabled offline.
- [ ] **D5:** Start ride = 21 Go (create → start → propose_stop, seed, recents, stack `[home, live]`); 2 taps from a home
      recent. The ride is named "{name}'s ride" (check the `rides.name`), never "Solo ride".
- [ ] **D5:** Tiles: Join with a code → /join; Just ride → ride with no destination (normal sheet view since D6), also named
      "{name}'s ride". There is no group tile and no group form anywhere.
- [ ] **D5:** First run: "Your first ride is three steps away"; steps read pick a place → share the code to ride together
      → nobody gets lost.
- [ ] **D5:** From a running ride with a destination: the Invite riders row ("Share the code to ride together") is visible
      under the stop card; tap → invite screen with the code and WhatsApp; a second phone joins by code or link and lands
      on live with the route line and the stop card; the leader's panel becomes the group sheet and keeps the turn banner
      + voice; the joiner gets no banner and no voice.
- [ ] **D5:** Back to Home and back into that ride (riders present), and an app restart: the leader's banner + voice resume
      (`navRide` marker); the joiner's phone never starts turn-by-turn.
- [ ] **D5:** Profile → Safety has the stop-alert time (1 / 3 / 5 min); a new ride is created with the saved value, and the note says it applies to rides started from now on (D6).
- [ ] **D6:** Route preview shows **Start ride** (filled) with **Invite riders** (secondary) under it; both disabled offline. Invite riders →
      the invite screen with the code and WhatsApp (footer "Continue to lobby") → the lobby shows "Riding to {place}" and the
      leader's own row; a second phone joins by code and sees the same caption and itself in the list; the leader taps Start →
      both land on live; the leader has the turn banner and voice, the joiner the route line + stop card only. The ride is named
      "{name}'s ride" (never with the place); if `propose_stop` fails the ride is ended and both buttons come back.
- [ ] **D6:** Double-tapping Invite riders, Continue to lobby or the lobby's Start makes one ride / one hand-off; Android Back is ignored while they run.
- [ ] **D6:** Start ride, accept a rider's different stop with riders present: the leader's navigation stops for the new stop and
      stays stopped after leaving and re-entering the ride (the marker holds the old stop). Same after an app restart.
- [ ] **D6:** Just ride opens in the normal sheet view with the Invite riders row visible; full map is the toggle.
- [ ] **D6:** The launch location prompt shows once per app run (not again when coming back from a ride), and never on web.
- [ ] **D6:** A rider with no name gets "My ride" from Just ride. Sign-out clears the nav-ride markers.
- [ ] Open ride on Home: compact card + Back to ride is the only primary; tiles hidden; active ride: bar opens the
      in-ride search and a pick lands on live; lobby ride: Start ride opens the switch / leader-busy sheets.
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
      `meSlotForHome`, `searchBarTarget`, `startStep`, `confirmedSwitch`, `startAction`, `homeTiles`, `isNavActive`,
      nav-ride marker (with destination, subscribe, clear), `startNavigationRide` / `startInviteRide` / `startSoloRide` (ride name,
      rollback, marker), `routeActions`, `launchPromptWanted`, `noteRiderCount`, `recheckFront` + the Android cold-start recovery, camera save throttle.
- [ ] `npx expo lint`, `npx tsc --noEmit`, Jest clean.

**P2 — obsolete (D5).** The lobby destination card, "Remove destination" copy and `leaderNav` checks are dropped.

**P3**
- [ ] Per the items in §14.

## 14. Phase plan
1. **P1 — Map home and Start (no new native code, no migration).** Map home, search, place sheet, route preview with
   Start ride into 21. D5 removed the solo / group choice, the group setup and the lobby caption that P1 first shipped;
   a ride becomes a group from the live screen. Order: plan store + pure flow → map component → browse + sheet content
   migration → place + route modes → search changes.
2. ~~**P2 — Group with destination, properly.**~~ Obsolete (D5).
3. **P3 — Polish.** Chip results as pins on the map (list + pins), long-press drop-pin with Photon reverse, "Stay" chip,
   optional route prefetch on the place sheet. (Dropped: lobby-leader "Make it the destination", change destination in
   the lobby, destination in the invite text.)
4. **Still open from 21:** hosted routing before public launch or everyone-navigates groups (D1). A server-side
   `rides` flag is no longer needed (the old `is_group` follow-up is moot).

## 15. Open questions
All three original questions are answered (decisions 1-3). New, from D5:
1. ~~Just ride opens in full map the first time~~ **Answered by D6:** it opens in the normal sheet view.
2. **Arrival panel has no Invite row** (216 dp, End ride + Pick next). Keep (the ride is ending; ⋯ → Invite riders is one
   tap) or add a third row?
3. ~~Renaming a ride~~ **Done in the app (§3.6).** Migration `0010_rename_ride.sql` applied 2026-10-15.
