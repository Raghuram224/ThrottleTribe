# 28 — Maps-like Home

**Date:** 2026-10-24. Builds on 22 (map home), 21 (solo navigation) and 27 (UX audit). §1 to §7 are Home only; §8 moves the
live ride onto Home's one map (owner-approved, same day).

The owner's four asks, and what answers them:

| Ask | Answer |
|---|---|
| Search shows places on the same page, like Google Maps | `search` mode: typing list, then pins on the map and a bottom list. No screen is pushed. |
| No chevron; hide the sheet like Maps; floating Search / Speak / SOS | The sheet is a thin pull-up strip. The floating Search / Speak / SOS stack shows only during a ride (owner, 2026-10-24); browse has the search bar and no floating buttons. |
| A real route, loading while it loads, several routes to choose from | The preview never draws a straight line. Up to three routes are drawn; tap a line, its duration pill or a choice card. |
| Back should not come from another screen | One map: place -> search results -> browse. Android Back follows the same order. |

## 1. Modes and Back

`PlanMode = 'browse' | 'search' | 'place' | 'route'`. All four share the one `PlanMap`; nothing remounts.

```
browse --(bar, Search button, chip)--> search --(pin or row)--> place --(Directions)--> route
   ^                                      |  ^                    |                        |
   |------------- Back -------------------|  |------- Back -------|------- Back -----------|
```

* `planBack` (src/lib/plan-flow.ts): route -> place (picked from a search) or browse (a recent place); place -> **search**;
  search -> browse; expanded strip -> collapsed; otherwise the OS leaves the app.
* Back from a place returns to the **results stage** with the query, the chip and the results kept (Home holds the search
  state; see `useHomeSearch`). "Search again" on the place bar opens a **new** search seeded with the text that found the place.
* A recent place goes straight to the route; its Back goes to browse (it has no place sheet).
* `/where-to` is not a screen any more. The route stays for deep links and old callers: it opens the inline search in the
  plan store with its `q` / `chip` / `focus` params (`parseSearchEntry`), then `router.dismissTo('/home')` (back to the Home
  under it, or a replace). It renders nothing.

## 2. Inline search

* **Entering.** The top bar and the floating Search button open `search` with the keyboard; a chip opens it with that
  chip's results and no keyboard. The bar becomes the text input: back arrow left, clear X right (once there is text),
  chips under it with a selected state (fill, border, tick, `selected`). Tapping the chosen chip again clears it.
* **Focus rules (ported from where-to).** `useTypingLockJudged`, `useSettleTimeout` and `shouldFocusSearch` decide whether
  the keyboard comes up: not while moving (>= 10 km/h), and not before the lock has been judged on a live fix (capped at
  1.5 s). The decision is latched once per open; Back from a place never pops the keyboard. While locked the input is not
  editable ("Stop to search by name"), the keyboard is dismissed, and chips, rows and results keep working.
* **Typing stage.** A solid surface fills the screen under the bar and chips (the offline banner stays above it): recents
  with "Clear" (and the confirm) when the text is empty, the location explainer row, the chip states (locating, needs
  location, still locating), and the matches as rows. The credit row is its footer (plain text while locked).
* **Results stage.** After a chip, the keyboard's search key (3+ characters), or the keyboard closing with results: category
  pins on the map (the `StopPin` look, padded to a 48 dp target) and the same places as a list in a bottom panel of 45% of
  the window. The camera fits the pins inside the visible area (`searchResultsPadding`: under the bar and chips, clear of a
  pin's height, above the panel and the credit pill). A pin or a row opens `place`. Tapping the input goes back to typing.
* **Stages are state in the plan store** (`searchStage`, `searchSeed`); the text, chip and results are `usePlaceSearch`
  state inside Home, seeded in the render that sees a new `searchSeed.nonce` and cleared once Home is back in browse.
* `PlaceSearchView` and the in-ride stop search (`ride/[id]/search.tsx`) are unchanged in behaviour: the list body moved to
  `PlaceResults` and the row to `PlaceRow`, which Home's panels reuse.

## 3. The strip

The collapsed sheet is a 56 dp strip (`HOME_STRIP_H`) plus the gesture inset: a grab handle and **one line**, the greeting,
or while a lobby ride is open a compact "Back to <ride>" row that opens the ride (an active ride has no strip: §8.5). No chevron. Tapping the strip or dragging it up
expands to everything: the tiles (Just ride, Join), the ride card, recent places, the location row, steps, the nudge,
stats and recent rides. Expanded height, scrolling and the first-run "opens expanded once" rule are unchanged.

* `homeSheetBlocks` returns `{ strip: 'title' | 'resume', expanded }`: nothing is left in the collapsed sheet (no tiles, no
  recents).
* Accessibility: the strip is a button with `expand` / `collapse` actions and a hint saying what a tap does. While a ride
  is open the 24 dp handle zone is the expand button (with the same actions) and the line below opens the ride; dragging
  anywhere on the strip expands.
* Camera padding follows the strip (`browsePadding` uses the measured strip height).

## 4. No floating stack in browse

**Owner decision (2026-10-24, supersedes the first design):** the Search and SOS circles show only during a ride, in the
ride view's stack (§8). Browse keeps the map clear: search is the top bar and the chips, and `browsePadding` keeps the
usual 16 dp on the right. The Home emergency sheet (112, contacts, text my location) went with the browse SOS; an SOS
outside a ride is the phone's own emergency call. Speak (voice guidance) was always ride-only.

## 5. Routes (preview)

* **No straight line, ever, in the preview.** Loading, locating, failed, no route and rate-limited states draw no line:
  the map shows the pins only. While loading, a "Finding routes…" pill (spinner + words, live region) sits level with the
  back circle. Failure states keep their panel message and Try again. The panel's straight-line distance text stays as
  information. Live navigation's own dashed fallback is untouched.
* **Alternatives.** The preview asks for `alternatives=true` (OSRM URL, and the `geo` function's optional `alternatives`
  boolean, validated by its parser and passed to LocationIQ). `parseOsrmRoutes` reads up to three routes (unreadable ones
  and repeats skipped); `parseOsrmResponse` still reads the first only. `NavRouteResult` ok carries `routes: NavRoute[]`
  (`route` is `routes[0]`, the router's pick: "Fastest"). The cache key carries `alt` only for alternatives requests, and the
  cache holds all the routes. The function change is not deployed.
* **Map.** Every route is drawn: the others grey (`trailPassed`) on a surface-coloured casing, the chosen one in the route
  colour on its casing, drawn last (the lines re-mount when the choice changes so the chosen one is on top). Tapping a grey
  line (MapLibre `GeoJSONSource.onPress`, default 44 px hit box) or its pill chooses it. Each route has a duration pill
  at the point where the routes differ most (`routeLabelAnchors`: the candidate furthest from the other routes, at least
  400 m from the other labels); the chosen pill is the route colour. The camera fits all routes.
* **Panel.** A row of radio cards under the place: "42 min", "31 km · Arrive 6:42 pm", "Fastest" on the first, the chosen
  card with a heavier outline and a tick. `radiogroup` / `radio` roles with `checked`; each card reads duration, distance,
  arrival and tag. The summary, arrive time, credit and expressway note follow the chosen route. Start ride seeds the
  navigation session with the chosen route; Invite riders is unchanged.
* `usePreviewRoute` keeps its rules: one request per key, an older answer never wins, the rate-limit retry, and the
  `updating` state (the previous routes, faded, choices disabled).

## 6. Decisions the brief did not cover

* The strip stays 56 dp tall (the old header): the touch-target floor, and with the body gone it is already thin.
* With a ride open, the 24 dp handle zone is the tap-to-expand target; the 32 dp resume row opens the ride.
* A selected route is remembered by identity: new routes (another place, the expressway switch) start on the router's pick.
* Typing-lock settle: the 1.5 s cap stays latched for the life of Home once it has fired.
* Web: the web `PlanMap` draws the chosen route only (no alternatives, pins or pills); the product is Android and iOS.

## 7. Unverified

Not run on a device: pin and duration-pill presses (`Marker.onPress`), line presses (`GeoJSONSource.onPress`) on both
platforms, the keyboard-avoiding list on Android edge-to-edge, TalkBack and VoiceOver passes, the SOS hold, and the
`dismissTo` hand-off from a deep link. The `geo` function change needs a deploy before alternatives come from LocationIQ;
until then the app gets one route from it and the choice row is hidden.

---

## 8. The live ride on Home's map (the ride view)

Google-Maps style: starting a ride, or opening one, never slides to another screen and never reloads the map. Behind
`LIVE_ON_HOME` (`src/lib/flags.ts`, default **on**; `EXPO_PUBLIC_LIVE_ON_HOME=0` brings back the separate live screen). Web always
keeps the live screen (`RIDE_ON_HOME = rideOnHome(flag, Platform.OS)`).

### 8.1 One map, two scenes
* `HomeMap` (`src/components/home-map.tsx`, a `.web.tsx` twin renders the plan map only) is one `MapLibreMap` that is never
  remounted. Its scenes take turns, **one at a time**: the planning scene (`PlanLayers`: route lines, pins, my dot, the
  place pin) and the ride scene (`RideLayers`: passed and ahead trail, my route, stop pin, start dot, clustered riders, me).
  The scenes have different source ids (`nav-route-<i>` against `nav-route`), sit under their own React keys, and the plan
  route lines are not passed while the ride scene shows, so a switch removes one scene and adds the other, native markers
  included. The map's accessibility label follows the scene.
* The old `RideMap` and `PlanMap` are the same pieces composed (`MapLibreMap` + layers + camera hook): `RideMap` =
  `MapLibreMap` + `RideLayers` + `RideMapChrome` + `useRideMap`; `PlanMap` = `MapLibreMap` + `PlanLayers` + `usePlanCamera`. The
  flag-off and web live screen keep using them; they behave as before.
* `RideView` (`src/components/ride-view/ride-view.tsx`) holds the overlay UI and **publishes** the ride scene (layers, map
  handlers) to `useRideViewStore`; `HomeMap` reads it. The ride's model is one hook, `useRideViewModel`, shared with the live
  screen (the list, snaps, riders, stop, route, banner, convoy, camera insets). The ride scene is drawn only once the ride is
  loaded; until then the planning scene keeps the map.

### 8.2 Camera
* **Entering.** `RideView` mounts fresh on every entry, so `useNavCamera` starts with new state (follow mode, no history).
  The browse camera is not touched: while the ride view owns the map `HomeMap` does not report idles as the browse camera and
  the plan camera stands down (`usePlanCamera({ active: false })`). With my fix in the ride the follow camera eases in
  (`entryEaseMs` 450, `followPitch`, heading) with the 20 C2 padding (`followPadding`: header + banner stack + nav banner +
  convoy strip on top, the list at the bottom); without one it eases to the last fix Home knew (`seed`, else the 2-minute
  planning origin), so the map is never left on a world frame (audit 27 #2). A map created with the ride view already asked
  for (cold start, notification) starts at `liveStartView` (the planning position, tilted), not the saved browse camera.
* **Leaving** (Back to browse): Home sets a `restore` intent with the saved browse camera, bearing 0, pitch 0; the plan camera
  runs it again as it takes over.
* **Stop search** swaps the scene to the planning one (result pins, `searchResultsPadding`, plan camera) and back; the ride
  view remounts afterwards, so its camera is seeded again.

### 8.3 What the ride view shows
Top to bottom, over the map: the ride header (name, elapsed time, search icon, ⋯ menu; `RideHeader`, shared with the ride
layout) and the banner stack with the leader's approval card (`useRideBanners`, shared with the ride layout; it replaces
Home's offline banner and status-bar scrim); the docked turn banner and the convoy strip under it; at the bottom the rider
list in the existing live sheet (`LiveSheet`, same snaps, solo panel and arrival panel; the navigation-bar inset is added to
every height, `withSheetInset`); on the sheet's top edge the credit pill, the me slot (speed bubble / Re-centre) and the
bottom-right stack. Full map keeps its rules: header and non-safety banners go, SOS and "not sharing" banners and approval
cards float under the status bar, the map runs edge to edge with the status-bar scrim.

**The stack** (`RideFabStack`, 56 dp circles with icon and word, `FabCircle`), top to bottom:
fit all (two or more riders), full map, **Message** (group rides: the one-tap messages sheet that used to live in the action
bar), **Search** (stops along the way: the inline stop search), **Speak** (voice guidance; **only while navigation is active**:
icon `voiceOn` / `voiceOff` with the word "Speak" / "Muted", a 2 dp ring and `selected` when muted), **SOS** (the group SOS,
`RideSosButton`: the same hold, early-release toast, cancel-hold and screen-reader confirm as the old action bar). When the
visible map is too short for all of them `rideStackItems` drops from the top of the keep order SOS > Search > Speak > Message >
full map > fit all: SOS and Search never go (68 dp a circle, 176 for two as the old column).

### 8.4 Entry points
Every way into a live ride goes through `openLiveRide(rideId)` (`src/lib/reset-to-ride.ts`): it sets `viewRideId`, resets the plan
(never a stale place or route), and `dismissTo('/home')` (pops lobby / hand-off screens; replaces the ride route when Home is not
in the stack; a no-op on Home). Callers: Start ride and Just ride (`resetToRide` maps a `/ride/<id>/live` target to it), the
Home learning of an active ride (its open-ride read), a lobby ride turning active (the session's redirect table), the stop
search bar with a ride active, notification taps, and `/ride/<id>/live` itself (deep links, the launch gate, the permissions
explainer, join): on native that route is a hand-off that calls `openLiveRide`.

### 8.5 Back (`rideBack`, pure, `src/lib/plan-flow.ts`)
**Owner decision (supersedes the first design): there is no "Back to ride" and no browse while a ride runs.** While a ride is
active (I am a member, not left) Home's map IS the ride view, from every entry: start, Just ride, the launch gate, a
notification, a deep link, and a return from invite, emergency contacts or profile. Home learns of an active ride from its open-ride
read and opens the view (`viewRideId` follows the active ride; the rider cannot leave it). The browse strip, chips, search-places
bar do not exist then, and the "Back to <ride>" row and resume card are gone for an active ride (a lobby
ride keeps its row: the lobby is still its own screen). Ending or leaving the ride returns the same map to browse: via the summary
for an ended ride (the summary keeps its own screen; after it, Home browse), straight to browse when I leave.

Back, one step per press: inline stop search -> ride view; selected rider -> cleared; full map -> normal; list pulled up ->
collapsed; then `'system'`: Home's handler returns false and the OS backgrounds the app, like a navigation app. Never browse.
The header has a ‹ only while one of those steps exists (it runs the same chain); otherwise no arrow. The receiver-takeover rule
and the starting-ride block still come first.

### 8.6 Session and navigation rules
* One session (`RideHost`), unchanged: with a ride view open it runs for `viewRideId`; the hand-off route does not start another.
* The ride view closes when its ride's summary or lobby is in front (`RideHost`), never earlier (the session must not be released
  before the summary has its data). Redirects from the ride view **push** the lobby / summary over Home; a replace would take Home
  and its map away. Leaving the ride, or a `not_a_member` error, closes the view and does not replace Home when it is in front.
* `homeMapMounted` is a deny-list (22 §4.3): only the summary unmounts Home's map.
* Home's focus `plan.reset()` never touches `viewRideId`.

### 8.7 Stop search in the ride (inline)
`openSearch(entry, 'ride-stop')` (plan store `searchContext`) opens Home's inline search for the ride: the same bar, chips, typing
list, result pins and panel, with the typing lock. A pick (row, pin) opens `StopPickSheet` instead of a place sheet: the leader
sets the stop (a break or the destination), a rider proposes, a ride of one has "Go here"; `propose_stop` is the one RPC. Recent
places are hidden (they would start a second ride). Done: back to the ride view; a non-solo stop frames me and the stop.
`ride/[id]/search.tsx` stays for web and old links and uses the same sheet.

### 8.8 Decisions and deviations
* The rider list keeps the live sheet's three snaps (collapsed / half / expanded) and solo panel rather than becoming a 56 dp
  strip: its content (pinned alerts, stop card, arrival panel) and screen-reader behaviour were already built and checked. It
  shares the grabber, surface and radius with Home's strip; the strip itself is not used in the ride view.
* Message is a stack circle (group rides) because the action bar it lived in is gone; the brief named Search, Speak, SOS.
* Back from a half-open list collapses it first (the list opens at `half` by default); after that Back is the OS's.

### 8.9 Unverified (needs a device)
The one-map scene swap (sources and native markers), the entry and exit eases, the camera on a cold start into a ride, the stack's
spacing against the credit pill on small phones, the hand-off from the launch gate and notifications, `dismissTo` when Home is
not in the stack, Android Back order, and TalkBack / VoiceOver passes on the new stack.
