# 21 — Solo navigation ("Where to?")

> **2026-10-20, see 26 §2 R1 and §4 E1:** the route panel's line 1 is the duration alone; distance and arrive time share
> line 2. Loading buttons ("Starting…", "Ending ride…") show a spinner and their label.

Source: user request, 2026-10-13: *"I want this app to have single user ride like Google Maps. It allows the
individual user to go to the destination whenever the user wants."* Settled user decisions: (1) **"Where to?"
first**, (2) **turn banner + voice**, (3) **arrival offers, never auto-acts**.
Builds on 00, 06, 07, 16 §2.5 (P2 "planned route" option, now designed here for solo), 17, 19, 20.
Code read: `home.tsx`, `lib/solo-ride.ts`, `lib/enter-ride.ts`, `lib/routing.ts`, `ride/[id]/{_layout,live,search}.tsx`,
`permissions.tsx`, `lib/{nav-route,place-search,live-chrome,live-sheet,stop-ui,geo,format,full-map,nav-camera,haptics,icon-names}.ts`,
`hooks/{use-nav-route,use-nav-camera,use-place-search}.ts`, `components/{stop-card,ride-header,ride-map}.tsx`,
`lib/location/{tracking,background-task,ride-config}.ts`, `store/{live-ui-store,ride-store}.ts`, `theme/tokens.ts`.
Docs checked: Expo SDK 57 `expo-speech`, `expo-audio`, `expo-location`, `expo-router`; OSRM v5 API; OSRM demo and
FOSSGIS usage policies; expo-speech Android source (`SpeechModule.kt`). 2026-10-13 amendment: SDK 57 `expo-audio`
docs (AudioMode, config plugin) and source (`AudioModule.swift`: category and activation), `expo-speech` iOS source
(`SpeechModule.swift`), `expo-location` Android source (`LocationModule.kt`: watches paused in the background),
`app.json`, `lib/location/*`, `lib/supabase.ts`.

**Constraints kept from 19:** no Google name, logo, fonts or APIs; nothing in the app holds a secret key; OSM data
is attributed; SOS reachable on every ride screen state.

### Decisions (user, 2026-10-13: answers to §15)
| # | Question | Decision | Where it lands |
|---|---|---|---|
| D1 | Routing provider before launch | **Deferred.** Keep the OSRM public demo for now. It stays a **pre-launch risk** (§5.1, §15.1) | No change to P1–P3 |
| D2 | Avoid expressways by default? | **Yes, with a toggle.** "Allow expressways" on the route preview, **off** by default, remembered on this phone; changing it refetches; reroutes and every other route on this phone use it | **P1**: §2.3.1, §3.1, §3.8, §9, §12 |
| D3 | Background voice | **Yes, in this build.** Voice keeps speaking with the screen locked or another app in front | **P3**: §4.1, §4.3, §4.5 (new), §5.5, §10, §12, §13 |
| D4 | Typing lock passenger override | **No override** (resolved as recommended) | §2.2.2 unchanged |
| D2a | Expressway switch while the router cannot honour it (user, **2026-10-14**) | The public OSRM demo rejects every `exclude` (HTTP 400 `InvalidValue`, "Exclude flag combination is not supported."), so the switch could not do anything. **Hidden unless `EXPO_PUBLIC_ROUTING_EXCLUDE=1`** (`flags.ROUTING_SUPPORTS_EXCLUDE`, default off). Off: no request (preview, live, reroute, group stop route) carries `exclude`, there is no doomed first request or double request, and the preview note is `preview.carNoteMayUse` "Route for cars — may use expressways that ban two-wheelers." On: §2.3.1 as written (switch with an On/Off word, busy state, disabled while Go runs, 500 ms settle, "Updating route…" with the old line at 0.4 opacity, `preview.noRouteAvoid`, the reject-fallback and its 30 min memo, `nav.expressways_toggled` / `nav.exclude_rejected`). Only an exclude-related `InvalidValue` counts as a rejection, so a bad `bearings` value (P2) cannot switch avoidance off | **P1**: §2.3.1, §3.1, §3.8 |

**2026-10-16, see 24:** D1 is decided: routing is **LocationIQ Directions** (driving) through the `geo` Edge Function
(24 §3), search is Geoapify with a Photon fallback (24 §2), and the OSRM credit is replaced by "Routes by LocationIQ.com"
(24 §4). §3.1's URL and User-Agent, §5.1 and the `live.attributionRoute` string are superseded there; D2a stays (LocationIQ
does not document `exclude`).

**P2 implementation notes (engineer, 2026-10-14):** where the build settled a spec ambiguity or chose a close alternative.
- **Engine files.** Besides §3's modules: `nav-engine.ts` (engine state, `selectBanner`, `isNavActive`, `newestPosition`),
  `nav-banner-view.ts` (what the banner draws, a11y label) and `geo.ts` `buildPlainTrail` (a route's own geometry, no
  GPS-breadcrumb spacing or jump filter). The engine writes `nav-store.engine`; the screens read it.
- **Off-route counting.** `offCount` counts *consecutive* good off fixes: any good on-route fix resets it to 0 (so
  off, on, off, on, off never adds up to 3), and `offRoute` clears after 2 consecutive on fixes. §3.8 read literally
  ("reset by 2 consecutive on fixes") would let interleaved fixes add up.
- **Windowed projection.** When the window match is worse than 150 m and the whole-route match is not within 30 m,
  `alongM` holds (the window's nearest point is only its edge) and off-route takes over.
- **1 request per second.** `shouldFetchNavRoute` enforces it for every engine request (first fetch, reroute,
  reconnect), on top of the 10/20/40/60 s backoff. The preview's own requests are outside the engine (500 ms settle).
- **Bearings.** Sent only at >= 15 km/h with a usable course, via `bearingsParam` (whole 0..359). After a failed
  request that carried one, later attempts go without.
- **Group continuity (§10 "rider joins").** `isNavActive` is true for a ride of one, or while a session that was
  started solo keeps running for the leader. A group never *starts* navigation (§6).
- **Arrival.** The engine latches it (rules a-c) on every fix, tells the app once (haptic + `nav.arrived`), and goes
  idle. The live screen's P1 effect remains for rides the engine is not running.
- **Roundabout copy keys.** Exit text uses `nav.exit.ord` ("{o} exit") up to the tenth, else `nav.ord.n` ("exit {n}")
  so "Roundabout · exit 12" never reads "exit 12 exit"; voice has `nav.say.roundaboutN` / `rotaryN` for the same case.
- **Compass arrow (`noRoute`).** The map reports its bearing to `live-ui-store.mapBearing`; the arrow turns
  `bearing(me -> dest) - mapBearing`.
- **Screen-reader announce.** Announced on a maneuver change; P3 must gate it on voice being muted (today there is no
  voice, so it always announces when a screen reader is on).

**P2 review fixes (engineer, 2026-10-14)** — behaviour changes after review of the P2 build:
- **GPS-lost clock (H1).** `NavEngineState.lastGoodFixAt` is the receipt time of the last good fix and runs with or
  without a route; `gpsLost(lastGoodAt, startedAt, now)` reads it. A failed first request now reads `noRoute` while fixes
  keep arriving, and `noGps` only 10 s after they stop.
- **Poor fixes (H2).** A poor fix updates `Progress.displayAlongM` (what the banner shows) and nothing else; `alongM`
  (the floor and what step advance uses) moves on good fixes only.
- **Carriageway choice (H3).** Projection returns one match per distinct stretch of route (`geo.trailMatches`, stretches
  within 20 m of the best). With history: the earliest stretch not more than 30 m behind `alongM`; at >= 15 km/h matches
  heading > 90 degrees from the course lose (all kept when none is left, mid U-turn). First fix (and every fix until
  the rider is first on the line): the earliest stretch. A forward jump of the projection beyond `speed x dt + 50 m`
  is held until a second consistent fix (a whole-route re-acquire after a tunnel is exempt). `dt` is receipt time since
  the last good fix, at least 1 s.
- **Roundabouts (M1).** `PreparedRoute.passAt[i]`: a roundabout / rotary step with an exit number is passed at the next
  raw step (the exit), the banner still counts down to the entry.
- **Start away from the road (M2).** `Progress.joined` is false until the first good on-route fix: no off-route counting
  and no reroute before it. New banner kind `toRoad` ("Head to the road" / "Directions start when you reach it",
  `nav.toRoad`, `nav.toRoadSub`, blue, icon `navigate`), shown instead of `guide` meanwhile. A rider who never reaches the
  road is never rerouted (the router would snap to the same road again).
- **Flapping network (M3).** A reconnect keeps `failures` and grants one immediate attempt until a request succeeds
  (still 1 request/s); `useNavigation` tells the engine "offline" only after 3 s offline, "online" at once.
- **No cache for the engine (M4).** `NavRouteOptions.noCache` (not part of the request or the key); the engine sets it
  on every request, the preview keeps the cache.
- **Stop card (M5).** While navigating, the card's distance and ETA are `engineRemaining(progress, prepared)`:
  route line left and `durationS x left / total`, the banner's own source.
- **Banner text (M6).** Named rotary: primary "2nd exit", road part "· Hardinge Circle" (copy `nav.v.rotaryName`
  replaces `nav.v.rotary`), so the name truncates first. The primary shrinks to 70 % (`adjustsFontSizeToFit`) before it
  would truncate, so "Destination on the right" keeps "right". Table row 6 is now `['2nd exit', '· Hardinge Circle']`.
- **Bearings (L1).** A failure that carried `bearings` retries without them after the 1 s gap and does not count as a
  failure for the backoff.
- **Offline copy (L2).** `banner.offlineSolo` replaces `banner.offline` in the layout for a navigating ride of one
  that is not off route.
- **Arrival announcement (L3).** One claim (`nav-store.claimArrivalAnnouncement`, used by `lib/announce-arrival.ts`) for
  the engine and the live screen's P1 latch: haptic + `nav.arrived` once per ride and destination in any ride type that
  detects it (solo, or a navigating leader after riders joined). A group ride with no engine still does not announce.
- **Origin (L4).** `pickOrigin`: the newest of {last local fix of the previous session, server echo (with its time),
  Where-to origin} that is at most 30 s old; none = wait for the first local fix (banner `starting`).
- **Future fixes (L5).** `ingest` refuses a fix dated more than 30 s ahead of the clock without touching the dedupe key.
- **Resume / offline start (L6).** Dead reckoning is 0 once the last good fix is over 10 s old (no capped
  extrapolation after a resume); `NavSessionStart.offline` is set before the first request. The engine is fed by the
  local watch only: the server echo is never ingested (it is the same GPS 5 s later, and mixing the two sources would
  reorder fixes); the echo still drives my marker when it is newer (`newestPosition`) and seeds the first request.

**P3 implementation notes (engineer, 2026-10-14):** where the build settled a spec ambiguity or chose a close alternative.
- **User decisions.** Android swipe-away keeps voice (as §4.5.4). Android has no ducking and may speak during calls (follow-up: a native audio-focus module). `android.allowBackup` is `false` (recent places, prefs and the arrival state stay on the device). A group ride with no engine does not announce arrival (P1 behaviour kept).
- **Prompt state.** `nav-voice.ts` `planVoice` is the whole schedule (start, continue, maneuver stages, rerouting, GPS lost) as one pure step over a `VoiceState`; `nextPrompt` is the per-maneuver part. The session calls it from `ingest` after progress and arrival.
- **Blocked = marked, not replayed.** While muted or in an SOS the schedule still advances (stages, start, continue and reroute flags are marked as if said) and nothing is spoken; the gap clock does not start. So a stage crossed while muted is never replayed, and unmuting speaks the next stage that becomes due (§4.3, §4.5.5).
- **A prompt in progress holds back the non-urgent ones.** Besides the 4 s gap, `far` / `near` / continue wait while the previous prompt is still being spoken (`speaking`); `now` and "Rerouting" / "GPS signal lost" do not wait. A gap-held prompt is not marked and is retried on the next fix.
- **Clock.** The gap and the 30 s / 2 min limits use the receipt clock (`deps.now()`), not the fix timestamp: a batch of fixes delivered at once (background) is processed in one go, and dead reckoning already uses the receipt clock.
- **Start prompt before the rider is on the road.** The "Route to …" prompt is said on the first good fix; the first maneuver's prompt is appended only once I have been on the line (`progress.joined`), because before that its distance is from the route start.
- **Good fixes only.** Maneuver and start prompts run on good fixes (accuracy <= 50 m); a poor fix never causes a prompt.
- **"Rerouting" offline.** Not said while offline (no reroute is coming); said once the network is back if I am still off route.
- **GPS lost with no fixes at all.** `ingest` never runs without fixes, so `use-navigation` also calls `navSession.tick()` every 2 s while navigating (foreground JS timer; no maneuver prompt ever comes from a tick). In the background with no fixes the banner is not visible and the spoken notice depends on that timer running.
- **Arrival prompt.** "You've arrived at {place}" is said by the session when it latches. The layout then stops the session (navActive false); a soft `stop()` lets the prompt finish and releases the audio session when it ends. `stop({ hard: true })`, used first inside `stopRideTracking()`, cuts it at once.
- **Banner tap** calls `navSession.repeat()`: the current instruction in the now-form, only while a guide banner is on and voice is not blocked.
- **Voice toggle in the right column** shows in a ride of one (`mapControlVisibility.voice`); in a group fit-all takes the column and voice lives in the ⋯ menu (§6).
- **Screen-reader announce** now runs only while voice is muted (the preference), as specified.
- **Fix rate (revised after review: C1, H1, L4, M3).** `setNavRate` persists the wish (`ride.navRate`) and the rate the OS task was last registered with (`ride.taskNav`, so a new JS process does not re-register needlessly). On Android only, and only while the app is in front (`AppState === 'active'`), the task is updated **in place**: `startLocationUpdatesAsync` on the already-registered task (expo-task-manager `registerTask` calls `setOptions`, which restarts the updates and the notification). It is never stopped first: Android refuses to start a foreground-service task from the background (`ForegroundServiceStartNotAllowedException`), so a stop-then-start with the screen off (arrival) left no task and no uploads. A rate change wished for in the background waits for the next `active`; `ride.taskNav` is set only after a successful start; a failed start is reported (`background_task`, `op: nav_rate`) and retried on the next `active`. `startTrackingRecovery()` (root layout) also restarts a task that should exist but is not registered, and clears a `ride.navRate` left by a dead process when no session is running (the task is then put back to 5 s with the normal notification text).
- **One queue (H1).** Start, stop, rate change and recovery run through one promise queue in `tracking.ts`. `stopRideTracking` clears the tracking and nav-rate flags and bumps a generation counter before its first await, so a queued start or rate change that wakes later bails; a stop that finds the task already gone (`not found`) counts as done; `clearRideId` only runs if no newer ride began meanwhile. `stopRideTracking` now never rejects (a failed stop is reported; with no ride id the task uploads nothing).
- **Uploads while navigating (M3).** The 4.5 s upload gap applies on **Android only** (where the task's rate actually went from 5 s to 1 s), and is **bypassed while any SOS of mine is on** (sending, retrying or active). iOS was throttled by the first build for no reason (its fix rate never changed); that is removed.
- **Never a late prompt (H3).** `planVoice` speaks no maneuver prompt once the rider is at or past the maneuver (`displayAlongM >= step.alongM`, or the dead-reckoned distance is 0): the stages are marked spent instead. A fix that reaches the engine more than 3 s after it was taken (`PROMPT_FIX_MAX_AGE_MS`, a late background batch) is not a "good fix" for maneuver and start prompts.
- **Audio session (M1, M2, L3).** Whenever `say` leaves after a successful activation (superseded, out of date, hush or teardown during activation) the session is released, unless a newer prompt owns it; deactivation no longer short-circuits on the cached flag and is retried up to 4 times. On iOS the engine's 2 s beat calls `releaseIfIdle()`: nothing speaking and the last prompt ended over 1 s ago means deactivate regardless of the cached flag (expo-audio's `handleInterruptionEnded` re-activates the session after a call or Siri). If the audio mode could not be set, prompts are skipped (counted as `nav.voice_skipped`), never spoken in the default category.
- **Voice engine (L1, L2, L5).** Android: an en-IN voice is chosen by identifier (`voice:`), because expo-speech builds `Locale("en-IN")` (malformed) from `language`; iOS keeps `language: 'en-IN'`. The voice lookup is raced against a 1.5 s timeout (the prompt then uses the device default and the lookup still fills the cache). expo-speech 57 drops the native `speak` promise, so a rejection cannot be caught from JS: text longer than `maxSpeechInputLength` is skipped up front, and a voice is only ever one the engine listed. Residual: an exotic native failure still shows as an unhandled rejection (the 20 s utterance watchdog then frees the prompt).
- **Android swipe-away voice (H2).** Decided: patch expo-speech (`patches/expo-speech+57.0.3.patch`, `patch-package` on `postinstall`; needs a native rebuild). The engine is shut down on module destroy instead of activity destroy. JS side: `say` gives a prompt up as `skipped` if the engine sends no `onStart` within 6 s (`START_TIMEOUT_MS`), so a dead engine cannot hold `speaking` for the 20 s watchdog; the next prompt calls `speak` again. **SDK 57 links expo-speech as a precompiled AAR on Android, which ignores the patched source**, so `package.json` sets `expo.autolinking.android.buildFromSource: ["expo-speech"]`. Check the autolinking list in `expo run:android` output: expo-speech must not carry the 📦 (prebuilt) marker.
- **Voice block (M4).** The store listeners that feed `setVoiceBlocked` are wrapped (`voice-block-sync.ts`): a voice bug is reported and never propagates into an SOS send or receive.
- **Received SOS that only arrives as a push.** The notification handlers (`alerts.ts`, the response listener in `_layout.tsx`) update no store, so a push with the socket down does not block voice. It is blocked as soon as the member row reaches `ride-store` (realtime or the next refresh). Accepted; closing it would need a received-listener that writes a store.
- **Fix latency (M5).** While the nav rate is on, the background task reports `nav.fix_latency` once a minute (`n`, `avg_ms`, `max_ms`, `max_batch`, `app_state`; no coordinates). It is a §4.5.8 gate measurement.
- **Release checklist (M6).** expo-audio links recording APIs, so the first TestFlight upload must be checked for **ITMS-90683** (missing `NSMicrophoneUsageDescription`). If App Store Connect rejects it, add a truthful string via `app.json` `ios.infoPlist` ("Throttle Tribe does not record audio; this is required by the audio library") and re-upload. Nothing in the app ever requests the microphone.
- **Voice screen-reader text (L6).** "Double-tap to ..." left the labels (`nav.a11yBanner`, `nav.a11yVoiceOn/Off`). What a tap does is in `accessibilityHint`, worded as the result ("Mutes voice directions.", "Repeats the instruction.") because VoiceOver and TalkBack already announce the gesture.
- **Telemetry.** `nav.voice_muted` { muted } on the toggle; `nav.voice_skipped` { reason: 'session' } when the iOS audio session could not start.
- **expo-audio plugin.** Options verified in `node_modules/expo-audio/plugin/build/withAudio.js` (SDK 57.0.5): `microphonePermission: false`, `recordAudioAndroid: false`, `enableBackgroundRecording: false`, `enableBackgroundPlayback: false` exist as written. The plugin still adds `MODIFY_AUDIO_SETTINGS` (a normal permission, no prompt). The `fetch` background mode in the resulting Info.plist comes from the existing expo-task-manager plugin.
- **Session API.** `setAudioModeAsync` / `setIsAudioActiveAsync` are the SDK 57 names; `setAudioModeAsync` only sets the category and does not activate the session, so music is ducked only while a prompt plays.
---

## 0. Summary

**Purpose:** let one rider pick a place and ride there with turn-by-turn directions, in about 3 taps from Home.

**One-second glance while riding:** 1. am I in trouble / offline (layout banners, unchanged) → 2. **what do I do
next and how far away is it** (turn banner: arrow + `400 m` + "Turn left onto NH275") → 3. how far is it to the
destination (stop card `119 km · 1 h 34 min`, unchanged from 20 C5).

**How it is built:** a solo navigation ride is an ordinary solo ride (19 C) whose **next stop** (19 A) is the
destination. Nothing new on the server. What's new is client-side: a pre-ride search and route preview, a turn
engine on top of OSRM `steps=true`, a docked turn banner, voice prompts, and an arrival panel.

| Phase | Ships | New dependency |
|---|---|---|
| **P1** Where to? + preview + arrival | Home "Where to?", `/where-to`, `/route-preview` with the **Allow expressways** toggle (D2), ride created at **Go**, nav rides open in sheet mode, latched arrival panel (End ride / Pick next destination), solo "Go here" in-ride search, "Stop directions", OSRM credit, typing lock while moving | none |
| **P2** Turn banner | OSRM steps, instruction text, 1 Hz local GPS, step advance, fast reroute, banner + "Then" row + banner states, full-map banner. The engine lives outside React (`nav-session.ts`, §4.5) so P3 can run it in the background | none |
| **P3** Voice | Prompt schedule, mute toggle (map + menu), SOS suppression, **background voice** (screen locked / another app in front, D3) | `expo-speech` + `expo-audio` (**new dev build**), iOS `UIBackgroundModes` `audio` (§4.5.6) |
| Follow-up | Group rides (§6), hosted routing (pre-launch, D1), "continue to X after a break", lane hints, step list, Android ducking (§4.5.4) | — |

### 0.1 Prior decisions this spec changes
| # | Was | Now | Why |
|---|---|---|---|
| 1 | 19 C: Home card **Ride solo** (one tap → free solo ride) | Home card **Where to?**. Free solo = Where to? → **Just ride, no destination** (2 taps) | User decision 1: "Where to?" first |
| 2 | 19 B / 20 C4: full map is the default the first time a solo ride opens | **Superseded by 22 D6 (2026-10-15): no ride opens in full map by itself, a free ride included (the Invite riders row must be visible).** Was: only for a **free** solo ride; a ride with a destination starts in **sheet** mode | The solo panel (distance · ETA + SOS) is the bottom bar riders expect; full map has nowhere to show the ETA (§2.6) |
| 3 | 19 A: the search result sheet has two buttons (break / destination) | **Solo** rides: one primary **Go here**; the stop kind comes from the place category | Rule 4; in solo, "suggest" and "set" are the same act |
| 4 | 19 A: after the leader sets a stop, the map frames me + stop (camera goes free) | Solo navigation: the camera stays in **follow** | Framing the route and then needing Re-centre is wrong when the next turn matters |
| 5 | 20 C5: menu "Remove next stop" + "Remove the stop for everyone?" | Solo: **Stop directions** + solo copy. Solo End confirm loses "for everyone" | The copy was wrong for a ride of one |
| 6 | 19 A / `use-nav-route`: reroute when > 150 m off and at most once per 60 s | While **navigating**: 3-fix off-route debounce and a 10 s minimum with backoff (§3.8). The 60 s rule stays for everyone else | At 60 km/h a wrong turn is 1 km behind you after 60 s |
| 7 | My live position = server echo of my background samples (about every 5 s, freezes offline) | While navigating: a local **1 Hz foreground watch** drives the engine, my marker and the camera (§3.6) | Turn guidance can't run on 5 s fixes that arrive over the network |
| 8 | 20 C1: right column = full-map + fit-all | Solo navigation: **voice toggle** + full-map (still at most 2; fit-all is hidden in solo anyway) | The mute control needs to be within gloved reach |
| 9 | 19 A: the in-ride search lets you type at any speed | **Typing lock** when moving ≥ 10 km/h, here and in-ride; chips and recent places still work | Safety: no typing while riding |
| 10 | 19 A: Photon bias uses 5-decimal coordinates; attribution "© OpenFreeMap © OpenStreetMap" | Bias rounded to **2 decimals** (≈ 1 km). With a route drawn, attribution adds **OSRM** | Privacy (rule 8); OSRM policy requires the credit |

---

## 1. Flow

```
Home ──[Where to?]──► /where-to ──[recent / result]──► /route-preview ──[Go]──► (create + start + set stop)
  │                      │                                   │                      │
  │                      └─[Just ride, no destination]───────┼──────────────────────┤ startSoloRide (today)
  │                                                          └─[‹]► back to /where-to (state kept)
  ▼                                                                                 ▼
(open ride → card hidden, resume card as today)        [permissions explainer, only if needed (04)]
                                                                                    ▼
                                         /ride/<id>/live  (stack reset to [home, live])
                                            navigating ──off route──► rerouting ──new route──► navigating
                                                │
                                         arrived (latched) ──[Pick next destination]──► /ride/<id>/search ──[Go here]──► navigating
                                                └─────────[End ride]──► confirm ──► /ride/<id>/summary
```
**Tap count:** Home → **Where to?** (1) → **recent place** (2) → **Go** (3). With a chip: 4 (chip, result, Go). Typed: input, type,
result, Go. The first ride ever adds the permissions explainer, as every ride does today.

**When the ride row is created: at Go, never earlier.** Where to? and the preview don't touch Supabase at all.
They only call Photon (search) and OSRM (preview route). A rider who browses and backs out creates nothing.

---

## 2. Screens

Reference phone 360×780 dp. Every value comes from `src/theme/tokens.ts`; new tokens are in §8.

### 2.1 Home entry (`src/app/(app)/home.tsx`)
- Replace the **Ride solo** `ActionCard` (L228-236) with **Where to?**: icon `mapSearch` (new, `map-search-outline`),
  title `home.whereToTitle`, sub `home.whereToSub`. Same slot, same rule: hidden while `hasRide`.
- `onPress` → `router.push(href('/where-to'))`. `onSolo` / `soloBusy` move to Where to? (Just ride).
- Retire `home.soloTitle`, `home.soloSub`.

### 2.2 Where to? — `src/app/(app)/where-to.tsx` (new route, outside `ride/[id]`)
**Purpose:** pick a destination, or start a free solo ride. **Glance:** the list of places, nearest first for chips.

```
┌────────────────────────────────────────┐
│ ‹  ( 🔍 Search cafes, fuel, places   ) │ 56: back 56 + AppTextInput 56 (flex), NOT auto-focused
├────────────────────────────────────────┤
│ (⛽ Fuel) (☕ Coffee) (🍽 Food) (🅿 …)  → │ chips 48, horizontal scroll, padding 12/16 (SEARCH_CHIPS)
│────────────────────────────────────────│
│ [📍]  Allow location to plan routes    │ LocationRow 64+ (only when not granted, §2.2.1)
│  40   We use your location to find …   │
│       ( Allow location )               │
│────────────────────────────────────────│
│ RECENT                          Clear  │ SectionLabel 32 + text button 56 hit (brandOnBg)
│ [🕘]  Mysuru Palace            118 km  │ PlaceRow 64 (tile 40 surface + history 20 textMuted)
│  40   Sayyaji Rao Rd, Mysuru           │   name 16 semibold · address 14 muted · km 14 semibold tabular
│ [🕘]  Nandi Hills               61 km  │   max 5 rows
│ …                                      │
│                                        │
│     Search by OpenStreetMap contributors│ 12 textSubtle (19 attribution)
│ [ 🏍  Just ride, no destination      ] │ BigButton secondary 56 (footer, thumb zone)
└────────────────────────────────────────┘
```
- **Reuse, don't fork:** move the body of `ride/[id]/search.tsx` (input row, chips, results, `PlaceRow`,
  `Attribution`) into `src/components/place-search-view.tsx`. Both routes render it. Props:
  `{ me, autoFocus, typingLocked, header?: ReactNode, emptyContent: ReactNode, onPick(place), footer }`.
  `usePlaceSearch` and `place-search.ts` stay as they are, apart from the bias rounding (§5.6).
- **No auto-focus** here (the in-ride search keeps `autoFocus`). With gloves, recents and chips are the main path,
  and an open keyboard would cover them and the footer.
- Body when the query is empty and no chip is on: the Recent section, or if there are none, `EmptyState` with
  `whereTo.emptyTitle` / `whereTo.emptyBody`. A typed query or a chip replaces the body with the results (19 A rules:
  ≥ 3 chars, 350 ms debounce, loading spinner, `search.error` + Try again, `search.empty`).
- **Pick a row** (recent or result) → haptic `select` → `router.push('/route-preview?…')` with the params `id, name,
  address, lat, lng, category`. The current fix goes into `nav-store.origin` (§3.6) so the preview can route at once.
- **Recent places** (`src/lib/recent-places.ts`, pure, unit-tested). Stored **on this device only**, under
  `STORAGE_KEYS.recentPlaces = 'pref.recentPlaces'`, as JSON `{ id, name, address, lat, lng, category, usedAt }[]`.
  - `addRecent(list, place, now)`: drops any entry with the same `id` or within 50 m, puts the new one first,
    keeps at most 8. `parseRecents(raw)`: invalid input gives `[]`.
  - A place is added when navigation **starts** to it (Go, or in-ride Go here), not when it is only previewed.
  - Shown: the 5 newest, distance recomputed from my fix (`formatDistance`). Without a fix there is no distance column.
  - **Clear** → ConfirmSheet `whereTo.clearTitle` / `whereTo.clearBody`, confirm `whereTo.clearConfirm` (danger),
    Cancel. Recents are also cleared on sign-out.
- **Footer:** `whereTo.justRide`, icon `bike`, secondary → today's `startSoloRide(thresholdS)` (unchanged), with
  `loading` while it runs. On error: toast `errorText(code)`.
- **Position on this screen:** with foreground permission, `Location.getLastKnownPositionAsync({ maxAge: 120000 })`
  for an instant bias, then `watchPositionAsync({ accuracy: Balanced, distanceInterval: 10 })` while focused (it also
  feeds the typing lock). Removed on blur.

#### 2.2.1 Location not granted (rule 8: explain before asking)
- `LocationRow`, the 64 info-row anatomy (20 C6): tile `brandTint` + `permLocation` 20 `brandOnBg`; title
  `whereTo.locTitle` 16 semibold; body `whereTo.locBody` 14 muted, up to 3 lines (the explanation, which mentions
  OSRM and Photon); action BigButton secondary 56 `whereTo.locAllow` → `requestForegroundPermissionsAsync()`.
  When `canAskAgain === false`, the button is `perm.openSettings` → `Linking.openSettings()`, and returning to the
  app re-reads the permission (as `permissions.tsx` does).
- Without a position, search still works (no bias, no distances) and so does picking. Background permission is
  **not** asked here; Go runs the normal `hrefAfterEnter` explainer.

#### 2.2.2 Typing lock (here and in `ride/[id]/search.tsx`)
`typingLocked(prev, speedKmh, fixAgeMs)` (new `src/lib/typing-lock.ts`, pure):
- `speedKmh == null || fixAgeMs > 10000` → `false` (never lock without evidence)
- `speedKmh >= 10` → `true`; `prev && speedKmh >= 5` → `true` (hysteresis); otherwise `false`.

When locked: `Keyboard.dismiss()`, the input becomes `editable={false}` and keeps its text, the placeholder is
`whereTo.lockedPlaceholder`, and a 14 muted line `whereTo.typingLocked` appears under the chips. Chips, recents,
results and Just ride all keep working (each is one tap). There is no passenger override (decided, D4).

### 2.3 Route preview — `src/app/(app)/route-preview.tsx` (new route)
**Purpose:** confirm the place and see the trip before committing. **Glance:** `1 h 34 min · 119 km` and the line on the map.

```
┌────────────────────────────────────────┐
│ (‹)56                                  │ floating back circle: fabBg, e2, top = insets.top + 8, left 12
│                                        │
│        (●me)━━━━┓                      │ RoutePreviewMap: route navRoute + navRouteCasing (16 §2.5 widths),
│                 ┗━━━━━━━━━━━━━━(🏁)    │   my dot (meMarker), StopPin (destination)
│                                        │ camera fitBounds(route), north-up, pan/zoom allowed
│ © OpenFreeMap © OpenStreetMap · OSRM   │ attribution pill (12) above the panel
├────────────────────────────────────────┤ panel: surfaceRaised, top radius 24, e3, padding 16
│ 1 h 34 min · 119 km                    │ 28 bold tabular (duration) + 20 semibold (" · km"), 2 spans
│ Mysuru Palace                          │ 16 semibold, 1 line
│ Sayyaji Rao Rd, Mysuru                 │ 14 textMuted, 1 line
│ Arrive about 11:42                     │ 14 textMuted tabular (device clock + duration)
│ ⓘ Route for cars, avoiding expressways.│ 14 textMuted, icon alertCircle 16, up to 2 lines
│   Watch for two-wheeler bans.          │
│────────────────────────────────────────│ hairline `border`, margin-top 12
│ Allow expressways          Off  (○══)  │ ExpresswayToggle 56, full-width target (§2.3.1)
│────────────────────────────────────────│ margin-bottom 12
│ [ ➤                Go                ] │ BigButton primary, prominent, icon navigate, 56
└────────────────────────────────────────┘
```
- **Map:** new `src/components/route-preview-map.tsx` + `.web.tsx`. It reuses the route and casing layers and
  `StopPin` from `ride-map(.web).tsx`; extract the layer constants into `src/components/route-layers.ts` so both
  maps draw identical lines. Fit padding: top `insets.top + 8 + 56 + 24`, bottom = panel height + 24 + 28
  (attribution), sides 48. This is the preview's version of the C2 rule: everything floating over the map is counted.
- **Route:** `fetchNavRoute(origin, dest, { steps: true, avoidMotorways: !allowExpressways })` (§3.1). The result
  is **seeded** into `nav-store.seed(destKey, route)` so live doesn't fetch it again (one request saved per start).
  The seed records the `avoidMotorways` it was requested with; live uses a seed only when that matches the current
  preference.
- Line 1 = two spans. The duration (`formatDuration`) is `flexShrink: 0` and the distance shrinks first.
- The car note shows whenever there is a route (§5.2). Its text follows what the route **actually** did, not just the
  switch (§2.3.1 table): `preview.carNote` (avoided), `preview.carNoteAllowed` (switch on), or
  `preview.carNoteNoAvoid` (switch off, but the server rejected `exclude` and the retry went without it).
- **Go** (§2.4). It stays tappable while the route is loading or has failed: navigation degrades (§2.7); it doesn't block.

**Preview states**
| State | Map | Panel line 1 / note | Go |
|---|---|---|---|
| Locating (no fix yet) | destination pin, zoom 14 | place name as line 1 (20 semibold); `preview.noFix` | enabled |
| Route loading | dashed straight line me → dest | skeleton 28-tall bar 160 wide + `preview.loading` | enabled |
| Route OK | road route | duration · km, arrive, car note | enabled |
| OSRM `NoRoute` | dashed straight line | `≈ {km}` (`stop.cardDistanceApprox`) + `preview.noRoute` | enabled |
| OSRM `NoRoute` with avoidance on | dashed straight line | `≈ {km}` + `preview.noRouteAvoid` (points at the switch) | enabled |
| Fetch failed / timeout | dashed straight line | `≈ {km}` + `preview.routeFailed` + ghost `common.tryAgain` 56 | enabled |
| Updating (switch changed, §2.3.1) | previous route line kept at opacity 0.4 | skeleton line 1 + `preview.updating`; switch shows the **new** position, busy | enabled |
| Viewer offline (`useNetOffline`) | as cached | `preview.offline` (Banner `offline` tone at the top) | **disabled** (creating the ride needs the server) |
| Go running | unchanged | — | `loading`, label `preview.starting`; switch disabled |
| Go failed | unchanged | toast `errorText(code)` | enabled again |

#### 2.3.1 Allow expressways toggle (D2, P1)
**Purpose:** let the rider choose whether routes may use expressways (which often ban two-wheelers in India).
Off (avoid) is the default.

**Control: `ExpresswayToggle`** (new `src/components/toggle-row.tsx`, generic `ToggleRow`; there is no switch
component in the app today, so build it once and reuse it later).
- Row: `minHeight` 56, full panel width, `paddingHorizontal` `space.sm` 8 with `marginHorizontal` −8 (text lines
  up with the panel's 16 padding, and the pressed fill has room), gap `space.md` 12. The **whole row** is the
  target. With gloves no one hits a 32 dp switch, so the row is the hit area.
- Left: title `preview.expressways` 16 `family.semibold` `text`, up to 2 lines (1 at 1×), flex 1.
- Right: state word `preview.expresswaysOff` / `preview.expresswaysOn` 14 `family.semibold` `textMuted`, then the
  switch graphic. The word is the text half of the state (rule 1: never colour or position alone).
- Switch graphic (decorative, not a separate target): track 52×32, radius 16; knob 24, inset 4.
  - **Off:** track `surface` + 2 dp border `textMuted`, knob `textMuted`, knob left.
  - **On:** track `accent` + 2 dp border `brandOnBg`, knob `onAccent`, knob right. That's dark on orange in Tribe;
    in Maps it uses the style's own pair.
  - Contrast: the off border and knob use `textMuted`, ≥ 4.5:1 on `surfaceRaised` in all four palettes, well above
    the 3:1 needed for UI parts. Tribe-light `accent` #F97316 is only about 2.8:1 on white, so the **on** track
    carries the `brandOnBg` border (#C2410C, 5.2:1) to reach the 3:1 boundary. The state word carries the meaning
    regardless.
  - Knob slides 150 ms (`motion.fast`); no motion under Reduce Motion.
- Pressed: row background `surfacePressed` (the SettingsRow pattern), radius `radius.md` 12.
- Hairline `border` above and below, 12 margin each side, so the row reads as a setting and not as a second button
  (rule 4: Go stays the one primary).
- Panel height grows by 56 + 24 + 2. The map fit padding (§2.3 Map) uses the measured panel height, so nothing more
  to change.

**State and persistence**
- `nav-store.allowExpressways: boolean`, persisted as `STORAGE_KEYS.allowExpressways = 'pref.allowExpressways'`
  (`'1'` / `'0'`). Missing or invalid → `false` (avoid). It is a **device preference**, like the map style: kept
  across rides and restarts, **not** cleared on sign-out (it holds nothing personal).
- It is read at **fetch time** by every route this phone requests: the preview, the live route line (solo and the
  19 A group stop route), and every reroute (§3.8). The preview is the only place it changes. A change made on a
  later preview applies to the next fetch.

**Interaction**
| Step | What happens |
|---|---|
| Tap the row | haptic `select`; the switch flips at once (optimistic); the value is persisted at once; `track('nav.expressways_toggled', { allowed })` |
| Refetch | cancel any in-flight preview request (`AbortController`), then fetch with the new option after a **500 ms** settle. Rapid taps: only the last value is fetched (keeps the demo's 1 req/s rule). The 5-minute cache (§3.1) is keyed by option, so flipping back is instant and makes no request |
| While updating | previous route line at opacity 0.4 (context, no flash to a dashed line); line 1 = skeleton + `preview.updating`; the switch shows its new position and is still tappable; `accessibilityState.busy = true` |
| Result OK | new line, numbers and note replace the old in one frame. If a screen reader is on, `announceForAccessibility(preview.a11ySummary)` |
| Result failed | the §2.3 failed state (`preview.routeFailed` + Try again); the switch **keeps** the new value (it is the rider's choice, not the result) |
| Go during an update | allowed (Go never blocks). Live fetches with the current value; the stale seed is dropped (seed option ≠ preference) |
| Offline | the switch still flips and persists; no request is made; the offline state shows; the next fetch uses it |
| Go running | the row is disabled (`accessibilityState.disabled`, opacity 0.5) |

**Server rejects `exclude`** (HTTP 400 when `exclude` was sent, §3.1):
- `fetchNavRoute` retries once without `exclude` and returns `route.avoidedMotorways = false`.
- The preview shows the route with the note `preview.carNoteNoAvoid`, icon `alertCircle` 16 in `textMuted` (a
  warning in words, not an amber colour: amber means stopped). The switch **stays off**: the preference is unchanged,
  only this route couldn't honour it.
- Live: the stop card shows nothing new. The same retry rule applies to reroutes. A rejected `exclude` is cached per
  session (`excludeUnsupported = true`), so later fetches skip the doomed first request. Log
  `track('nav.exclude_rejected')` once per session.
- Over OSRM `NoRoute` with avoidance on, the preview says `preview.noRouteAvoid`. There is no automatic retry with
  expressways: that would quietly overrule the rider. The rider flips the switch if they want to try.

**Note text by state**
| Switch | Server | Note |
|---|---|---|
| Off | honoured `exclude` | `preview.carNote` "Route for cars, avoiding expressways. Watch for two-wheeler bans." |
| Off | rejected `exclude` (retried without) | `preview.carNoteNoAvoid` "Couldn't avoid expressways on this route. It may use some that ban two-wheelers." |
| On | — | `preview.carNoteAllowed` "Route for cars. It may use expressways that ban two-wheelers." |

**Accessibility:** `accessibilityRole="switch"`, label `preview.expressways`, `accessibilityState={{ checked:
allowExpressways, busy: updating, disabled }}`, hint `preview.expresswaysHint`. It is a single focus stop (the state
word and graphic are not separate). `maxFontSizeMultiplier` 1.3. At 1.3× the title wraps to 2 lines before the row
grows past 56 + 8.

### 2.4 Go: what happens (`src/lib/solo-nav.ts`, new; pattern of `solo-ride.ts`)
```ts
export async function startNavigationRide(place: Place, stopThresholdS: number): Promise<string> {
  const ride = await createRide(copy['solo.rideName'], stopThresholdS);       // name unchanged: "Solo ride"
  try {
    const started = await startRide(ride.id);
    await proposeStop(ride.id, { name: place.name.slice(0, 80), address: place.address.slice(0, 160),
      lat: place.lat, lng: place.lng, kind: stopKindFor(place.category) });   // leader → applied at once (19 A)
    return await hrefAfterEnter(started);
  } catch (e) {
    await endRide(ride.id).catch(() => {});   // never strand a half-made ride (as solo-ride.ts)
    throw e;
  }
}
/** cafe | fuel | restaurant | toilets | parking → 'break'; other → 'destination'. */
export function stopKindFor(category: PlaceCategory): StopKind
```
- Before navigating: `addRecent(place)`, `track('nav.started', { from: 'where_to' })`.
- **Stack reset:** `router.dismissTo(href('/home'))` and then `router.push(href(target))`. SDK 57 router:
  "Dismisses screens until the provided href is reached." The result is `[home, live]` (or `[home, permissions]`,
  which replaces itself with live). Ride-header Back then lands on Home as 00 §1 requires, not on a stale preview.
  "Just ride" uses the same reset.
- **Live opens in sheet mode:** `shouldDefaultFullMap` gains `hasStop`, and returns `false` when the ride has a stop
  on its first open (decision 2). It still writes `soloFullMapSeen`. A rider whose persisted `pref.fullMap` is on
  still gets full map (§2.6).
- **Camera:** follow. Don't call `focusStop()` (decision 4).
- **No "Next stop" toast** for a stop I set myself in a solo ride (the `_layout.tsx` `stopNotice` effect skips
  `kind === 'set'` when `setBy === myUserId && activeCount <= 1`). The banner and the route line are the feedback.
- No migration. An atomic `start_solo_ride(p_name, p_threshold, p_stop…)` RPC is a possible later cleanup (one round
  trip instead of three); not needed now.

### 2.5 Live, navigating — sheet mode (solo)
**Condition:** `navActive = variant === 'solo' && stop !== null && arrival !== 'arrived'` (group: §6).

**Chrome stacking, top to bottom (the answer to "where does the banner sit"):**
1. `RideHeader` 60, unchanged (back · "Solo ride" / elapsed · search · ⋯). It stays: it holds Back, ⋯ (End ride) and
   the connection pill.
2. The layout banner stack (SOS mine / received, offline, not sharing, alert), max 2, unchanged, then approval
   cards. **Safety and connection always sit above the turn banner.**
3. **The live area.** `NavBanner` is **docked** at `top: 0` of the area (full-bleed, radius 0, `elevate('e2')`), just
   like the convoy strip.
4. `ConvoyStrip` (group only) docks under the banner at `top: navBannerH`. In solo it isn't drawn.
5. Map, with the C1 slots unchanged: bottom-left "me" slot (speed bubble / Re-centre), bottom-right column,
   attribution.
6. Solo panel (stop card + invite row), unchanged from 20 C4.
7. Action bar: full-width SOS, unchanged.

**C2 camera rule, applied:** `sheetTopInset = navBannerH + (convoy ? CONVOY_STRIP_H : 0)`, where
`navBannerH = navActive && bannerShown ? size.navBanner + (thenRow ? size.navThenRow : 0) : 0`. Add
`navTopInset(...)` to `lib/live-chrome.ts` (pure, tested). The follow camera keeps me in the lower third of
`mapVisH` (existing `followPadding`), so the road ahead is visible. When the "Then" row appears or goes, the padding
change eases over 450 ms (existing `RECENTRE_MS`).

```
┌────────────────────────────────────────┐
│ ‹  Solo ride                  [🔍] [⋯] │ RideHeader 60
│    42 min                              │
├────────────────────────────────────────┤
│ ↰     400 m                            │ NavBanner 96: navBannerBg; icon 48 onNavBanner
│ 48    Turn left onto NH275             │   36/40 bold tabular · 20/26 semibold (road truncates first)
├────────────────────────────────────────┤
│ Then  ↱ Turn right                     │ Then row 40: navBannerThenBg (only when ≤ 500 m after)
├────────────────────────────────────────┤ ← topInset = 136
│                                        │
│               (me ➤)                   │ follow: heading-up, me in the lower third
│                                 (🔊)56 │ right column: voice toggle (P3), full-map
│ ⎛60⎞                            (⤢)56  │
│ © OpenFreeMap © OpenStreetMap · OSRM   │
├────────────────────────────────────────┤ solo panel, radius 24 (20 C4)
│ [🏁]  119 km · 1 h 34 min              │ StopCard 64 (unchanged)
│  40   Mysuru Palace                    │
│────────────────────────────────────────│
│ [👤+] Invite riders                  › │ SoloInviteRow 64
├────────────────────────────────────────┤
│ [ ⚠           Hold for SOS           ] │ 64, full width
└────────────────────────────────────────┘
mapVisH at 360×780 (area 588): 588 − 136 − 136 = 316; with 2 layout banners 204 (right column still ≥ 176).
```
**No duplicated fact:** the banner shows the distance **to the next maneuver**. The stop card shows the distance and
ETA **to the destination**. These are different numbers.

#### NavBanner anatomy (`src/components/nav-banner.tsx`)
- Main row: height `size.navBanner` 96, padding-x `space.lg` 16, gap `space.md` 12, content centred vertically.
  - Maneuver icon `size.maneuverIcon` 48, `onNavBanner`, inside a 56 column (§3.4 icon table).
  - Text column: line 1 = maneuver distance (§3.5), `type.display` 36/40, `family.bold`, tabular, `onNavBanner`.
    Line 2 = instruction, 20/26 `family.semibold`, `onNavBanner`, one line. It renders as two spans: `primary`
    (`flexShrink: 0`, `maxWidth: '100%'`, tail-truncates only when alone) + `road` (`flexShrink: 1`, truncates first).
- Then row (§3.7): height `size.navThenRow` 40, bg `navBannerThenBg`, padding-x 16, gap 8: `nav.then` 14 semibold
  `onNavBannerMuted` · icon 20 `onNavBanner` · next `primary` 14 semibold `onNavBanner` (no road, no distance).
- The banner never shows the destination name, the ETA or the speed (one fact, one place).
- The whole banner is one 96+ dp target: **tap** → haptic `select`, re-centre (follow), and in P3 the current
  instruction is spoken again (now-form, §4.2).
- Enters and exits with a 150 ms fade + 8 dp slide (`motion.fast`), off under Reduce Motion.

### 2.6 Live, navigating — full map
- The header is hidden (19 B). The kept banners float at the top (`topStackH`, unchanged).
- `NavBanner` **replaces the `StopChip`** at `top: fullTop + space.sm`, inset `space.sm` left/right, radius
  `radius.lg` 16, `elevate('e2')`.
- `fullMapTopInset` is generalised to `fullMapTopInset(fullTop, topCardH)` = `fullTop + (topCardH ? topCardH + space.sm : 0)`.
  `topCardH` = the banner height (96 / 136) when it is shown, else `STOP_CHIP_H` 40 when a stop chip is shown, else 0.
- Trip distance and ETA are **not shown** in full map while navigating (no slot that doesn't collide with the floating
  SOS or the right column). The rider exits full map to see them. Accepted trade-off, decision 2.
- Floating SOS, "me" slot, right column (voice + collapse): unchanged positions.

### 2.7 Banner states (P2)
One 96 main row in every state; the Then row appears only in `guide`. Priority when several apply:
`noGps > offlineOffRoute > rerouting > starting > noRoute > guide`.

| State | When | Bg / fg | Icon 48 | Line 1 | Line 2 |
|---|---|---|---|---|---|
| `guide` | route + progress | `navBannerBg` / `onNavBanner` | maneuver (§3.4) | `400 m` (36 bold) | instruction (20) |
| `starting` | first fetch in flight, no seeded route | navBannerBg | `navigate` | `nav.starting` (20 semibold) | `nav.startingSub` (16, muted) |
| `toRoad` | a route exists but I have not been on it yet (start away from the road); review fix M2 | navBannerBg | `navigate` | `nav.toRoad` (20 semibold) | `nav.toRoadSub` (16, muted) |
| `noRoute` | no road route (failed or NoRoute) and a fix exists | navBannerBg | `navigation` rotated by `bearing(me→dest) − mapBearing` | `≈ 119 km` (36 bold) | `nav.noRouteSub` |
| `rerouting` | off route (§3.8), online | navBannerBg | `reroute` (static) | `nav.rerouting` (20 semibold) | `nav.reroutingSub` |
| `offlineOffRoute` | off route and `netOffline` | `status.offline` / `onStatus.offline` | `offline` | `nav.offRoute` | `nav.offRouteOfflineSub` |
| `noGps` | no fix with accuracy ≤ 50 m for ≥ 10 s, or location services off | `status.offline` / `onStatus.offline` | `noGps` | `nav.noGps` | `nav.noGpsSub` |

- Grey is used **only** for "no data" (rule 2). No amber anywhere in navigation (amber = stopped). No green either
  (green = moving).
- **Viewer offline, still on route:** the banner stays in `guide`. Steps are local, so navigation works offline. The
  layout's offline banner above it says `banner.offlineSolo` in a solo ride ("You're offline — directions still work").
  Group rides keep `banner.offline`.
- During `rerouting` the old route line stays drawn (context). When the new route arrives it replaces the line in a
  single frame.

### 2.8 Arrived (P1; banner and voice parts in P2/P3)
- Detection is the pure `arrivalState` (§3.9). It **latches** per destination key (`lat,lng`) until the rider taps a
  choice or the stop changes. It never un-latches by itself and nothing is acted on automatically (decision 3).
- On latch: haptic `success`; the banner exits (`motion.fast`), so `topInset` → 0; voice (P3) speaks
  `nav.say.arrived` once; `track('nav.arrived')`.
- The solo panel becomes the **ArrivalPanel** (`src/components/arrival-panel.tsx`):
```
├────────────────────────────────────────┤ solo panel, radius 24
│ [✓]   You've arrived                   │ ArrivedCard 64: tile navRoute + checkCircle onNavRoute;
│  40   Mysuru Palace                    │   line 1 stop.arrived 20 semibold; line 2 name 14 muted
│ (      Pick next destination         ) │ BigButton secondary 56 (above)
│ [              End ride              ] │ BigButton primary 56 (lowest = thumb), opens a confirm
├────────────────────────────────────────┤
│ [ ⚠           Hold for SOS           ] │ unchanged
```
  - Height: `SOLO_TOP 8 + 64 + 12 + 56 + 12 + 56 + 8 = 216`. `soloSheet(hasStop, arrived)` returns it for every snap.
  - **Pick next destination** → `router.push('/ride/<id>/search')` (§2.10).
  - **End ride** → `requestEnd()` (RideActions) → the layout's ConfirmSheet with the solo copy `nav.endTitleSolo` /
    `nav.endBodySolo`, confirm `live.endConfirm`, cancel `live.keepRiding` → `doEnd` → summary. **Never ends on a
    single tap.** The Invite row is hidden while arrived (a decision moment, not an invite moment).
- If the rider rides on without tapping, the panel stays (no auto action). The banner and voice stay off for this
  destination, the route line is hidden, and the stop card's live distance is not shown.
- Full map + arrived: the `StopChip` shows the arrived line (exists), and tapping it exits full map so the panel shows.

### 2.9 Just ride, no destination
Today's free solo ride (19 C + 20 C4), **without the full-map first open (22 D6: it opens in the sheet view)**: solo panel = the Invite row only, header
search to add a stop later. If a stop is added later (solo **Go here**), navigation starts: banner and voice. It does
not jump to full map.

### 2.10 Changing or stopping the destination mid-ride (solo)
- Header search (20 C2) and Pick next destination both open `/ride/[id]/search` with `PlaceSearchView`, `autoFocus`,
  and the typing lock.
- **Solo result sheet** (`variant === 'solo'`; group keeps the 19 A two buttons): name (heading), address, distance,
  and when a stop exists, the 14 muted line `nav.replaces` "Replaces Mysuru Palace"; then one BigButton primary
  `nav.goHere` (icon `navigate`) → `proposeStop(kind = stopKindFor(category))` → `addRecent` → back to live in
  follow mode (no `focusStop`). The new stop key resets progress, voice stages and the arrival latch.
- **⋯ menu (solo):** the leader's "Remove next stop" becomes `nav.menuStop` "Stop directions" (icon `close`, not
  destructive-red: the ride goes on) → ConfirmSheet `nav.stopTitle` / `nav.stopBody`, confirm `nav.stopConfirm`
  (primary), cancel `nav.stopCancel` → `clearStop` → free solo ride. Group rides keep the 20 C5 copy.
- **⋯ menu (P3):** a `SheetAction` above End ride: `nav.menuVoiceOff` / `nav.menuVoiceOn` (icon `voiceOff` / `voiceOn`).

---

## 3. Turn-by-turn engine (P2)

Pure modules (no React, Jest-tested): `src/lib/nav-steps.ts` (parse + model), `src/lib/nav-instructions.ts`
(text), `src/lib/nav-progress.ts` (advance, off-route, arrival), `src/lib/nav-voice.ts` (prompt schedule, P3).
**Engine runtime (D3):** `src/lib/nav-session.ts`, a module-level singleton with no React. It takes fixes
(`ingest(fix)`), runs progress, reroute and (P3) voice, and writes its state into `nav-store`. It must not depend on
a mounted component, because in P3 the background location task feeds it (§4.5.2). Hook glue:
`src/hooks/use-nav-position.ts` (the foreground watch → `ingest`) and `src/hooks/use-navigation.ts`. That hook is
mounted in `ride/[id]/_layout.tsx`: it starts and stops the session and live renders from `nav-store`.

### 3.1 OSRM request (`lib/nav-route.ts`)
```ts
export const ROUTING_URL = flags.ROUTING_URL ?? 'https://router.project-osrm.org/route/v1/driving'; // EXPO_PUBLIC_ROUTING_URL, not a secret
export function buildOsrmUrl(from: LatLng, to: LatLng, o: { steps?: boolean; avoidMotorways?: boolean; bearingDeg?: number | null } = {}): string
// → `${ROUTING_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
//   + (steps ? '&steps=true' : '')
//   + (avoidMotorways ? '&exclude=motorway' : '')
//   + (bearingDeg != null ? `&bearings=${Math.round(bearingDeg)},45;` : '')   // start heading: no U-turn routes
```
- `bearingDeg` is passed only when my course is valid and speed ≥ 15 km/h (reroutes while moving).
- `avoidMotorways` = `!nav-store.allowExpressways`, read **at fetch time** by every caller (preview, live route line,
  reroutes; D2, §2.3.1). There is no hard-coded default in the callers.
- `fetchNavRoute(from, to, opts, signal)`: if the response is HTTP 400 and `exclude` was set, retry **once** without
  it and mark `route.avoidedMotorways = false` (else `avoidedMotorways = avoidMotorways`). After the first rejection,
  set a module-level `excludeUnsupported` for the session and send no `exclude` from then on (still marking
  `avoidedMotorways = false`). Header `User-Agent: ThrottleTribe/<app version> (+<support URL the
  team chooses>)` on native (browsers forbid it on web). Timeout 8 s (exists).
- In-memory cache: key `round(from,3)|to|opts`, 5 min, 4 entries. A back-and-forth on the preview doesn't refetch.

### 3.2 Step model (`lib/nav-steps.ts`)
```ts
export type ManeuverType = 'turn' | 'new name' | 'depart' | 'arrive' | 'merge' | 'on ramp' | 'off ramp' | 'fork'
  | 'end of road' | 'continue' | 'roundabout' | 'rotary' | 'roundabout turn' | 'notification'
  | 'exit roundabout' | 'exit rotary' | 'use lane' | 'ramp' | 'unknown';
export type Modifier = 'uturn' | 'sharp right' | 'right' | 'slight right' | 'straight' | 'slight left' | 'left' | 'sharp left';
export interface NavStep {
  type: ManeuverType; modifier: Modifier | null; exit: number | null;
  name: string; ref: string; destinations: string; exits: string; rotaryName: string;
  location: LatLng; distanceM: number; drivingSide: 'left' | 'right';
  alongM: number;            // route distance from the start to this maneuver
}
export interface NavRoute { coords: LatLng[]; distanceM: number; durationS: number; steps?: NavStep[]; avoidedMotorways?: boolean }
```
- Parse `routes[0].legs[0].steps[]`: `maneuver.{type, modifier, exit, location:[lng,lat]}`, `name`, `ref`,
  `destinations`, `exits`, `rotary_name`, `distance`, `driving_side`. An unknown `type` string → `'unknown'`, and
  an unknown modifier → `null`. A step with no valid location is dropped. `steps` is left undefined when the leg
  holds none (P1 routes still parse).
- `alongM`: `alongM[0] = 0`, `alongM[i] = Σ_{k<i} steps[k].distanceM × scale`, where
  `scale = trail.totalM / Σ steps.distanceM` (1 when the sum is 0). Step distances then line up with the overview
  geometry that progress projects onto.
  *Test:* distances `[100, 300, 0]`, trail 400 → alongM `[0, 100, 400]`; trail 800 → `[0, 200, 800]`.

### 3.3 Which steps are announced (`isAnnounced(step)`)
| Type | Announced? | Treated as |
|---|---|---|
| `depart`, `notification`, `exit roundabout`, `exit rotary` | no | — (depart → start prompt, §4.2) |
| `new name` | only if modifier ∈ {left, right, sharp left, sharp right, uturn} | `turn` |
| `continue`, `use lane` | only if modifier ∉ {null, straight} | `continue` |
| `ramp` | yes | `on ramp` |
| `unknown` | only if modifier ≠ null | `turn` (OSRM: "handle unknown like turn") |
| everything else | yes | itself |

`announced = steps.filter(isAnnounced)`. It always ends with the `arrive` step; if OSRM omits it, synthesise one
at the last coordinate. **All progress indices below refer to `announced`.**

### 3.4 Instruction text (`lib/nav-instructions.ts`)
```ts
export interface BannerText { primary: string; road: string | null }   // rendered: primary + (road ? ' ' + road : '')
export function bannerText(step: NavStep, opts?: { short?: boolean }): BannerText   // short = Then row: primary only
export function voiceText(step: NavStep, place: string, opts?: { withRoad?: boolean }): string
export function maneuverIcon(step: NavStep): IconName
```
**Road label.** `roadLabel(step)` = first token of `ref` split on `;` (trimmed), else `name`, else `''`. Refs are
short and match the road signs. `spokenRoad(step)` = `name`, else `spellRef(firstRef)`, where
`spellRef('NH275') = 'N H 275'`: a token matching `/^([A-Z]{1,4})[- ]?(\d+[A-Z]?)$/` → letters joined by spaces + `' '` + digits.
Other tokens are left unchanged.

**Direction words** (from the modifier): `left/right` → "left"/"right"; `slight x` → "slightly x" (voice) / "Slight x"
(banner); `sharp x` → "sharp x"; `straight` → "straight"; `uturn` → U-turn. A modifier "contains left/right" →
side = left/right, else none.

**Connector for the road part.** `onto {road}` by default. `continue` → `to stay on {road}`. `off ramp`/`on ramp`:
when `destinations` is non-empty → `towards {dest}` (dest = text after the first `:`, if any, then the first
comma-separated item, trimmed); else `onto {road}`. `arrive`, `roundabout` with no exit, U-turn → no road part.
Empty label → no road part.

**Templates** (copy keys in §9; `{o}` = ordinal 1st…10th, else "exit {n}"; `{ow}` = first…tenth, else "exit {n}"):
| Type (after §3.3) | Banner `primary` | Voice (now-form) |
|---|---|---|
| turn left/right/sharp/slight | `nav.v.turn` "Turn left" · "Sharp left" · "Slight left" | `nav.say.turn` "Turn left" · "Turn sharp left" · "Turn slightly left" |
| turn straight | `nav.v.straight` "Go straight" | "Go straight" |
| any uturn | `nav.v.uturn` "Make a U-turn" | "Make a U-turn" |
| `end of road` | as turn | `nav.say.endOfRoad` "At the end of the road, turn {dir}" |
| `fork` | `nav.v.keep` "Keep left/right" | `nav.say.fork` "At the fork, keep {dir}" |
| `continue` slight | `nav.v.keep` "Keep left/right" | "Keep {dir}" |
| `continue` left/right/sharp | as turn | as turn |
| `merge` | `nav.v.merge` "Merge left/right" (no side → "Merge") | same |
| `on ramp` | `nav.v.ramp` "Take the ramp" | `nav.say.ramp` "Take the ramp{ on the side}" |
| `off ramp` with `exits` | `nav.v.exitNumber` "Take exit {exits}" | same |
| `off ramp` without | `nav.v.exit` "Take the exit" | `nav.say.exit` "Take the exit{ on the side}" |
| `roundabout` / `rotary` with exit | `nav.v.roundabout` "Roundabout · {o} exit"; rotary with name: "{rotaryName} · {o} exit" | `nav.say.roundabout` "At the roundabout, take the {ow} exit" / `nav.say.rotary` "At {rotaryName}, take the {ow} exit" |
| `roundabout` / `rotary` without exit | `nav.v.roundaboutEnter` "Enter the roundabout" | same |
| `roundabout turn` | as turn | `nav.say.roundaboutTurn` "At the roundabout, turn {dir}" |
| `arrive` | `nav.v.arrive` "Destination on the left/right" · "Destination ahead" | `nav.say.arrive` "Your destination, {place}, is on the left" · "…is ahead" |

The voice road part is `" " + connector + " " + spokenRoad`, appended unless `withRoad === false`.

**Unit-test table (must pass verbatim)**
| # | Input | Banner (primary · road) | Voice (now-form) | Icon |
|---|---|---|---|---|
| 1 | turn left, name "MG Road" | Turn left · onto MG Road | Turn left onto MG Road | turnLeft |
| 2 | turn slight right, ref "NH275;NH948", name "Bengaluru–Mysuru Highway" | Slight right · onto NH275 | Turn slightly right onto Bengaluru–Mysuru Highway | slightRight |
| 3 | turn uturn, side left | Make a U-turn · — | Make a U-turn | uturnRight |
| 4 | turn uturn, side right | Make a U-turn · — | Make a U-turn | uturnLeft |
| 5 | roundabout exit 3, name "Ring Road", side left | Roundabout · 3rd exit · onto Ring Road | At the roundabout, take the third exit onto Ring Road | roundaboutCw |
| 6 | rotary exit 2, rotaryName "Hardinge Circle", name "" | Hardinge Circle · 2nd exit · — | At Hardinge Circle, take the second exit | roundaboutCw |
| 7 | roundabout, no exit, side right | Enter the roundabout · — | Enter the roundabout | roundaboutCcw |
| 8 | roundabout exit 12 | Roundabout · exit 12 | At the roundabout, take exit 12 | roundabout… |
| 9 | roundabout turn left, name "X" | Turn left · onto X | At the roundabout, turn left onto X | turnLeft |
| 10 | off ramp slight left, exits "12", destinations "NH48: Pune, Satara" | Take exit 12 · towards Pune | Take exit 12 towards Pune | slightLeft |
| 11 | off ramp right, no exits/destinations, name "Service Rd" | Take the exit · onto Service Rd | Take the exit on the right onto Service Rd | turnRight |
| 12 | on ramp slight right, ref "NH44", name "" | Take the ramp · onto NH44 | Take the ramp on the right onto N H 44 | slightRight |
| 13 | fork slight left, name "Old Madras Rd" | Keep left · onto Old Madras Rd | At the fork, keep left onto Old Madras Rd | slightLeft |
| 14 | merge slight right, ref "NH75" | Merge right · onto NH75 | Merge right onto N H 75 | merge |
| 15 | end of road right, name "Hosur Rd" | Turn right · onto Hosur Rd | At the end of the road, turn right onto Hosur Rd | turnRight |
| 16 | continue left, name "MG Road" | Turn left · to stay on MG Road | Turn left to stay on MG Road | turnLeft |
| 17 | continue slight right, name "X" | Keep right · to stay on X | Keep right to stay on X | slightRight |
| 18 | continue straight / new name straight / depart / notification / exit roundabout | not announced | — | — |
| 19 | new name left, name "Y" | Turn left · onto Y | Turn left onto Y | turnLeft |
| 20 | unknown type, modifier right | Turn right | Turn right | turnRight |
| 21 | unknown type, no modifier | not announced | — | — |
| 22 | turn left, name "" ref "" | Turn left · — | Turn left | turnLeft |
| 23 | arrive left, place "Mysuru Palace" | Destination on the left · — | Your destination, Mysuru Palace, is on the left | endRide |
| 24 | arrive straight / no modifier | Destination ahead · — | Your destination, Mysuru Palace, is ahead | endRide |
| 25 | roundabout exit 1 | Roundabout · 1st exit | At the roundabout, take the first exit | roundabout… |

**Maneuver icons** (new `icon-names.ts` entries, covered by the glyph test): `turnLeft 'arrow-left-top-bold'`,
`turnRight 'arrow-right-top-bold'`, `slightLeft 'arrow-top-left-thick'`, `slightRight 'arrow-top-right-thick'`,
`sharpLeft 'arrow-left-bottom-bold'`, `sharpRight 'arrow-right-bottom-bold'`, `straight 'arrow-up-bold'`,
`uturnLeft 'arrow-u-left-top-bold'`, `uturnRight 'arrow-u-right-top-bold'`, `merge 'call-merge'`,
`roundaboutCw 'rotate-right'`, `roundaboutCcw 'rotate-left'`, `reroute 'refresh'`, `noGps 'crosshairs-off'`,
`voiceOn 'volume-high'`, `voiceOff 'volume-off'`, `mapSearch 'map-search-outline'`, `navigation 'navigation'`.
Rules:
- Ramps, forks and continue use the modifier's arrow. Arrive uses `endRide` (flag-checkered).
- Roundabouts: `drivingSide === 'left'` (clockwise, India and UK) → `roundaboutCw`, else `roundaboutCcw`.
- U-turn: side left → `uturnRight`, side right → `uturnLeft` (you turn across the oncoming lane).

### 3.5 Distance formatting
```ts
/** Banner line 1. */
export function formatManeuverDistance(m: number): string
//   m < 15            → copy 'nav.now' "Now"
//   15 ≤ m < 100      → `${Math.round(m / 10) * 10} m`      (15 → "20 m", 94 → "90 m", 96 → "100 m")
//   m ≥ 100           → formatDistance(m)                    (949 → "950 m", 980 → "1.0 km", 9949 → "9.9 km", 9950 → "10 km")
/** Voice. */
export function spokenDistance(m: number): string
//   m < 200           → nearest 50, min 50: "150 metres"    (nav.say.metres)
//   200 ≤ m < 1000    → nearest 100: "400 metres"
//   1000 ≤ m < 10000  → nearest 0.5 km: "1 kilometre" (nav.say.km1) · "1.5 kilometres" · "2 kilometres"
//   m ≥ 10000         → whole km: "24 kilometres"
```
Metric only (km/m); imperial is out of scope.

### 3.6 Position source (`src/hooks/use-nav-position.ts`)
- **Why:** today my on-screen position is my own background sample (every 5 s, `LocationAccuracy.High`) coming back
  through Supabase. That's about 110 m between fixes at 80 km/h, it arrives late, and it **freezes when offline**.
  Turn guidance needs better.
- While `navActive` and `AppState === 'active'`: `Location.watchPositionAsync({ accuracy: Accuracy.BestForNavigation,
  timeInterval: 1000, distanceInterval: 0 })`. `timeInterval` is Android-only; on iOS BestForNavigation already gives
  about 1 Hz. Fix = `{ lat, lng, accuracyM, speedMps, courseDeg, t }`. Remove the watch when inactive, backgrounded or
  unmounted. (Android pauses foreground watches in the background anyway: SDK 57 `OnActivityEntersBackground` →
  `stopWatching()`.) In P2 the background task (group upload) is unchanged. In P3 it also feeds `nav-session` and
  runs at 1 Hz while navigating (§4.5.2). `ingest` ignores any fix with `t ≤ lastFixT`, so the two sources never
  double-count in the foreground.
- The newest of {local fix, store position} drives: the nav engine, **my marker**, the follow camera and the speed
  bubble (`mapRiders` me entry overridden in `live.tsx`). Other riders still see my 5 s samples; that's fine.
- `nav-store` (`src/store/nav-store.ts`, zustand): `origin` (last Where-to fix), `seeded: { key, route } | null`,
  `voiceOn` (persisted `STORAGE_KEYS.navVoice = 'pref.navVoice'`, default on), `allowExpressways` (persisted
  `STORAGE_KEYS.allowExpressways = 'pref.allowExpressways'`, default off, §2.3.1), and per-destination session state
  (`progress`, `spoken`, `arrival`) keyed by `lat,lng` and reset when the key changes.

### 3.7 Progress and step advance (`lib/nav-progress.ts`)
```ts
export interface Progress { routeId: number; idx: number; alongM: number; passCount: number; offCount: number;
  offRoute: boolean; lastGoodFixT: number | null }
export function initProgress(routeId: number): Progress            // idx 0 (first announced), alongM 0
export function stepProgress(p: Progress, fix: Fix, route: NavRouteWithTrail, now: number): Progress
export function maneuverDistanceM(p: Progress, route): number     // max(0, announced[idx].alongM − p.alongM)
export function thenStep(p: Progress, route): NavStep | null      // §2.5 Then row
```
Per fix:
1. **Good fix** = `accuracyM ≤ 50` (or unknown). A poor fix only refreshes the displayed distance from its
   projection: it never advances `idx` and never counts toward off-route. Good fixes set `lastGoodFixT`.
2. **Windowed projection:** `projectOntoTrailWindow(trail, fix, p.alongM − 100, p.alongM + 1500)` (new in `geo.ts`;
   the same maths as `projectOntoTrail`, restricted to segments overlapping the window). This stops a route that
   doubles back, or a flyover above a service road, from snapping me to the wrong part of the line. If the window's
   `offTrailM > 150`, try the full `projectOntoTrail`, and accept it only if its `offTrailM ≤ 30` (re-acquired after a
   tunnel).
3. `alongM = max(p.alongM − 30, proj.alongM)`. Small backward jitter is allowed; `idx` never goes backwards.
4. **Pass rule** for maneuver `k = idx`: `alongM ≥ announced[k].alongM + 20` → `passCount += 1`. Advance
   (`idx += 1`, `passCount = 0`) when `passCount ≥ 2` **or** `alongM ≥ announced[k].alongM + 60`. Repeat for the
   following maneuvers on the same fix (closely spaced steps can be passed together). A fix below the pass margin
   resets `passCount` to 0.
5. **Then row** when `announced[idx+1]` exists, isn't `arrive`, and `announced[idx+1].alongM − announced[idx].alongM ≤ 500`.
6. **Dead reckoning:** with no good fix for 2–10 s and the last speed ≥ 15 km/h, the displayed distance drops by
   `v × Δt` (never below 0, never advancing `idx`). After 10 s with no good fix → banner `noGps`.
7. Until the first good fix after a (seeded) route: `alongM = 0`, distance measured from the route start.

*Tests:* the pass needs 2 fixes at +20 m, or 1 at +60 m; a fix with 80 m accuracy at +100 m doesn't advance; a
projection onto a parallel return carriageway outside the window is ignored; two steps 15 m apart are both passed
by one fix at +80 m past the second; `idx` is monotonic over a jittered sequence.

### 3.8 Off-route and reroute (navigating only)
```ts
export const OFF_ROUTE_MIN_M = 35, OFF_ROUTE_MAX_M = 75, OFF_ROUTE_FIXES = 3, OFF_ROUTE_FAR_M = 250;
export const NAV_REROUTE_BACKOFF_S = [10, 20, 40, 60] as const;   // then 60 s
export function isOffFix(offTrailM: number, accuracyM: number | null): boolean
//   offTrailM > clamp((accuracyM ?? 20) * 1.5, OFF_ROUTE_MIN_M, OFF_ROUTE_MAX_M)
export function offRouteNow(offCount: number, offTrailM: number): boolean
//   offCount >= OFF_ROUTE_FIXES || offTrailM > OFF_ROUTE_FAR_M      (good fixes only)
export function shouldRerouteNav(a: { offRoute: boolean; lastFetchAt: number; failures: number; inFlight: boolean; now: number }): boolean
//   offRoute && !inFlight && now − lastFetchAt >= NAV_REROUTE_BACKOFF_S[min(failures, 3)] * 1000
```
- `offCount` = consecutive good off fixes, reset by **2** consecutive on fixes (`offRoute` clears at that point too).
- The reroute fetch uses the current fix as origin, `steps: true`, `avoidMotorways` from the stored preference (D2), and
  `bearingDeg` = course (§3.1). Success → new `routeId`, `initProgress`, voice stages reset (§4.2), `failures = 0`,
  `track('nav.rerouted')`. Failure → keep the old route, `failures += 1`, `track('nav.route_failed', { code })`.
- Offline (`netOffline`) → no fetch; banner `offlineOffRoute`. The first allowed fetch after reconnecting goes at once.
- **Request budget:** at worst 1 request per 10 s per navigating rider, and only while off route. Plus 1 for the
  preview (seeded into live) and 1 per cold start. Well inside the demo's "at most 1 request per second".
- `useNavRoute` keeps its 60 s policy when not navigating (group stop cards, 19 A). `use-navigation.ts` owns routing
  while navigating.

### 3.9 Arrival (`arrivalState`, pure; P1 uses rule a only)
```ts
export function arrivalState(prev: 'navigating' | 'arrived', a: { me: LatLng | null; accuracyM: number | null;
  dest: LatLng; arriveAt: LatLng | null; remainingAlongM: number | null; onFinalStep: boolean }): 'navigating' | 'arrived'
```
- `prev === 'arrived'` → `'arrived'` (latched; only a new destination key resets it).
- No `me`, or `accuracyM > 100` → `prev`.
- `'arrived'` when **any** of these holds:
  (a) `haversine(me, dest) ≤ ARRIVED_WITHIN_M` (150, existing);
  (b) `arriveAt` (the snapped `arrive` maneuver location) and `haversine(me, arriveAt) ≤ 40`;
  (c) `onFinalStep && remainingAlongM ≤ 30`.
- (b) and (c) cover a destination pinned deep inside a campus or palace grounds, where the road ends more than
  150 m from the pin.

---

## 4. Voice (P3)

### 4.1 expo-speech facts (SDK 57 docs + Android source) and what the engineer must do
- Install: `npx expo install expo-speech expo-audio`. expo-speech is "included in Expo Go", but this project runs on
  **`expo-dev-client`**, so **a new development build is required** (`eas build --profile development` or
  `npx expo run:android|ios`). expo-speech has no config plugin. expo-audio's plugin **must** be configured: its
  defaults add Android recording and media-playback services we don't want (§4.5.6).
- `Speech.speak(text, { language, rate, pitch, volume, onDone, onStopped, onError, useApplicationAudioSession })`.
  Calls made while speaking are **queued**; on Android the module uses `QUEUE_ADD` and never `QUEUE_FLUSH`.
  → **Always `await Speech.stop()` before `speak()`**, so a stale prompt is never spoken late.
- **Android ducking: none.** The module requests no audio focus and sets no `AudioAttributes`. Over music in a
  helmet headset, prompts mix in at the same level. P3 accepts this (prompts are short); revisit only if riders
  complain. A fix would need a native change or an audio-focus helper (expo-audio's `interruptionMode: 'duckOthers'`
  applies to expo-audio's own players, not to TTS).
- **iOS silent switch:** the docs say expo-speech "won't produce sound if the device is in silent mode" (it uses
  the app's default session). **Decided (D3):** iOS uses the **app audio session managed by `expo-audio`**: category
  `.playback`, which ignores the silent switch, plus `duckOthers`, activated **per prompt** (§4.5.3).
  `useApplicationAudioSession: false` is **not** used: its background and silent-switch behaviour isn't documented,
  and background voice can't rest on it. The old (i)/(ii) experiment is replaced by the §4.5.8 device gate.
- **Background voice is in P3 (D3).** Prompts keep playing with the screen locked or another app in front. The
  architecture, config and test gate are in §4.5. Keep-awake still holds the screen on while the app is in front
  (ride layout, unchanged).
- `language`: `'en-IN'` when `getAvailableVoicesAsync()` lists an `en-IN` voice (better local place names), else omit
  (the device default; Android falls back by itself). `rate: 1.0`, `pitch: 1.0`, `volume: 1.0`.
- Wrapper `src/lib/speech.ts` (the one place that imports expo-speech and expo-audio, like `haptics.ts`):
  `prepare()` (iOS audio mode, once per navigation session), `say(text)` (iOS: activate the session → stop →
  speak → release, §4.5.3; Android/web: stop → speak; resolves on done/stopped/error), `hush()` (stop + release),
  `teardown()` (hush + deactivate), `isAvailable()`. It never throws.

### 4.2 Prompt schedule (`lib/nav-voice.ts`, pure)
```ts
export type Stage = 'far' | 'near' | 'now';
export function thresholds(vMps: number): { far: number; near: number; now: number }
//   v = max(vMps, 30 / 3.6)  (unknown speed → 50 km/h)
//   far  = min(2000, max(500, v * 45))   near = max(150, v * 12)   now = max(30, v * 4)
//   30 km/h → 500 / 150 / 33 m · 60 km/h → 750 / 200 / 67 m · 100 km/h → 1250 / 333 / 111 m
export function nextPrompt(a: { d: number; v: number; step: NavStep; next: NavStep | null; legBeforeM: number;
  done: ReadonlySet<Stage>; place: string; sinceLastPromptMs: number }): { stage: Stage; text: string } | null
```
- `v` = EMA of the fix speed (α 0.3).
- **Eligible stages:** `now` when `d ≤ now`; `near` when `d ≤ near`; `far` when `d ≤ far` **and**
  `legBeforeM ≥ far` (the stretch since the previous maneuver is long enough for an early warning). `arrive` never
  gets `now` (the arrived prompt replaces it).
- Speak **only the most urgent** eligible stage not yet in `done`; mark it and every less urgent stage done. Each
  (routeId, idx, stage) is spoken at most once.
- **Gap:** no prompt starts within 4 s of the previous one, **except `now`**, which interrupts (`say` stops first).
- **Text:** `far`/`near` → `nav.say.in` "In {spokenDistance(d)}, {voiceText lower-first}"; `now` → `voiceText`.
  Lower-first only touches the first character, and every template starts with our own word ("Turn", "At", "Your",
  "Take", "Keep", "Merge", "Make", "Go", "Enter"), so place names are never lower-cased.
- **Then:** for `near` and `now`, when `next` exists, isn't `arrive`, and `next.alongM − step.alongM ≤ 150`, append
  `nav.say.then` ", then {voiceText(next, place, { withRoad: false }) lower-first}".
- **Start prompt** (first good fix of a navigation session): `nav.say.start` "Route to {place}, {spokenDistance(total)}."
  If maneuver 0 is already inside its `far` band, append its far/near prompt and mark those stages done.
- **Continue prompt:** right after `idx` advances, if the next maneuver is ≥ 5 km away →
  `nav.say.continue` "Continue on {spokenRoad of the step just taken} for {spokenDistance}" (no road →
  `nav.say.continueNoRoad`). Once per idx.
- **Reroute:** entering `offRoute` → `nav.say.rerouting` "Rerouting", at most once per 30 s. After a new route,
  `done` resets; if maneuver 0 is already inside `near`, skip `far`.
- **GPS lost** (`noGps` for 10 s): `nav.say.noGps` once per episode, at most once per 2 min.
- **Arrived latch:** `nav.say.arrived` "You've arrived at {place}" once.

*Test examples:* at 60 km/h approaching a left turn on a 3 km leg: `far` at ≤ 750 m "In 700 metres, turn left onto
MG Road"; `near` at ≤ 200 m "In 200 metres, turn left onto MG Road"; `now` at ≤ 67 m "Turn left onto MG Road". A
fix arriving first at d = 120 m (after a reroute) gives `near` only, never `far`. A leg of 300 m gives no `far`. A
right turn 100 m after the left → `now` says "Turn left onto MG Road, then turn right".

### 4.3 Suppression (never talk over an emergency)
`hush()`, and no prompts, while: my SOS is on (`sosIsOn(phase)`), including the hold in progress; **any received SOS
is active in `ride-store`** (not "the takeover is visible": in the background no takeover is visible, but the SOS is
still on); `voiceOn` is false; or navigation isn't active (arrived, no stop). When the suppression ends, nothing
missed is replayed. The next stage that becomes due is spoken.
**The app being in the background no longer suppresses voice (D3).** That rule is removed; §4.5 replaces it.

### 4.4 Mute
- **Map control:** the top slot of the right column, 56 circle, `fabBg`, icon `voiceOn` / `voiceOff` 24 `fabIcon`.
  Muted: 2 dp `brandOnBg` ring + `accessibilityState.selected` (the fit-all pattern, C1). Tap → haptic `select`,
  toggles `nav-store.voiceOn` (persisted), `hush()` on mute, toast `nav.toastVoiceOff` / `nav.toastVoiceOn` (the
  text half of the state, rule 1). Shown only while `navActive`. It hides with the right column under C1's
  `mapVisH < 176` rule.
- **Menu:** ⋯ row (§2.10), always reachable, including when the column is hidden.
- **Persistence:** `pref.navVoice` (`'1'` / `'0'`, default on), on this device. It survives restarts and later
  rides and is not cleared on sign-out (a device preference). The same value governs foreground and background:
  muting in the app before locking the phone keeps it silent in the pocket. There is no mute from the lock screen or
  notification in this build; the location notification says how (`nav.fgsBody`, §4.5.4).

### 4.5 Background voice (D3, P3)
**Goal:** with the screen locked or another app in front, prompts keep coming at the same thresholds as in the
foreground, and they stop on End ride, arrival, SOS, mute or when the app is killed.

#### 4.5.1 What keeps us running (existing, verified in code)
- **One JS runtime, no second engine.** The app already stays alive in the background during a ride:
  - **iOS:** `UIBackgroundModes: location` (expo-location plugin `isIosBackgroundLocationEnabled`) plus active
    `startLocationUpdatesAsync` (`AutomotiveNavigation`, `pausesUpdatesAutomatically: false`,
    `showsBackgroundLocationIndicator: true`, in `lib/location/tracking.ts`).
  - **Android:** the expo-location **foreground service** (`isAndroidForegroundServiceEnabled`,
    `killServiceOnDestroy: false`) keeps the process, and so the JS thread, alive.
- `TaskManager.defineTask(LOCATION_TASK)` (`background-task.ts`) runs **in that same runtime** while the app is
  alive. So the task can call `navSession.ingest(fix)` directly: same module instance, same `nav-store`.
- What we add: **audio** (iOS needs an active audio session and the `audio` background mode to make sound in the
  background; Android needs nothing, see §4.5.4) and a **faster fix rate** while navigating (Android).
- **No new permission prompt.** Background voice works exactly when background sharing works, because it rides on
  the same task. If the task couldn't start or the OS stops background updates (for example, on iOS with "While
  Using" only), voice stops when the app leaves the screen and resumes on return. The existing not-sharing banner
  already tells the rider; nothing new is shown.

#### 4.5.2 Where prompts are produced
- **In `nav-session.ts` (JS runtime, kept alive as above), driven by fixes, not timers.** Each `ingest(fix)` runs
  `stepProgress` → `arrivalState` → `nextPrompt` → `speech.say()`. There are no `setTimeout`-scheduled prompts: on
  Android with the screen off the CPU may sleep between fixes and JS timers drift. Fix delivery wakes the runtime
  reliably. The 4 s gap and the 30 s / 2 min limits compare fix timestamps.
- **Fix sources:**
  - Foreground: the 1 Hz watch (§3.6) **and** the task. Ingest dedupes by `t`.
  - Background: the **task only** (Android pauses foreground watches; iOS foreground watches aren't set up for
    background).
- **Fix rate while navigating:** `tracking.setNavRate(on)` (new). Called with `true` when `navActive` becomes true
  and `false` when it ends. It re-registers `LOCATION_TASK` (the same stop → start as `startRideTracking`) with:
  - `timeInterval: 1000` instead of `5000` (Android only; on iOS `timeInterval` is ignored, and `distanceInterval: 0`
    already delivers about 1 Hz).
  - `accuracy` stays `High` (not BestForNavigation; battery, §5.5).
  - The foreground-service notification text becomes `nav.fgsTitle` / `nav.fgsBody`.
  A gap of 1–2 s while it re-registers is acceptable.
- **Uploads unchanged:** while nav rate is on, the task still forwards **every** fix to `ingest`, but `enqueue`s
  for upload only if ≥ 4.5 s after the last enqueued sample. Supabase writes and other riders' view stay at today's
  5 s cadence.
- **Reroutes in the background** use the same rules (§3.8) and the same network path the task already uses for
  uploads. "Rerouting" is spoken; offline gives no fetch and no extra prompt.
- **Headless guard:** the session only runs after `use-navigation` (ride layout, UI runtime) calls
  `navSession.start(...)` with a route and destination. In a headless relaunch (Android restarting the service
  after process death; iOS relaunching for location) the session is empty, so `ingest` is a no-op: **no voice, no
  route fetch**. Voice resumes when the rider opens the app.
- **Ride screens left in the foreground** (Back to Home with the ride still active): the layout unmounts →
  `navSession.stop()`. Home shows the resume card. Backgrounding does **not** unmount anything, so it doesn't stop
  the session.

#### 4.5.3 iOS audio session (expo-audio)
- `speech.prepare()` at session start (iOS only):
  `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers',
  allowsRecording: false })`. SDK 57 source: `playsInSilentMode: true` → category `.playback`; `duckOthers` →
  option `.duckOthers`.
- **Per prompt:** `setIsAudioActiveAsync(true)` → `Speech.stop()` → `Speech.speak(text, { useApplicationAudioSession:
  true, … })` → on `onDone` / `onStopped` / `onError`, if no other prompt starts within **500 ms** →
  `setIsAudioActiveAsync(false)`. expo-audio deactivates with `.notifyOthersOnDeactivation`, so the rider's music
  comes back up.
- **Why per prompt:** expo-audio only deactivates the session after one of *its own* players pauses or finishes. It
  does not deactivate it on background (verified in the SDK 57 source). A session left active with `duckOthers`
  would keep the rider's music ducked for the whole ride.
- **Activation fails** (phone call, Siri, a non-mixable app holding audio) → skip that prompt, mark its stage done
  (never replay late), `track('nav.voice_skipped', { reason: 'session' })`.
- `speech.teardown()` on session stop: `Speech.stop()` + `setIsAudioActiveAsync(false)`.

#### 4.5.4 Android
- No audio-session work. expo-speech hands text to the system TTS engine. Our process is in a foreground-service
  state, so speaking in the background needs **no new permission and no new service type**.
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK` must **not** be added (§4.5.6).
- **Known limits (accepted for this build):**
  - **No ducking.** The module requests no audio focus (§4.1).
  - **A prompt may play during a phone call.** There is no call-state signal without `READ_PHONE_STATE`, which we
    won't add.
  - The fix for both is a small local native module requesting `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` around each
    prompt. That's a follow-up; record the call behaviour in the gate.
  - OEM battery managers (Xiaomi, Oppo, Vivo, some Samsung) can kill even foreground-service apps. That's the same
    existing risk as background sharing, with the same mitigation (the existing battery guidance, if any).
- **Notification while navigating:** title `nav.fgsTitle`, body `nav.fgsBody`. No place name (it shows on the lock
  screen; rule 8).
- **Swipe-away from Recents:** the activity is destroyed but the service keeps the process (`killServiceOnDestroy:
  false`), so the ride, sharing **and voice continue**. That's intended: voice follows the ride, not the screen, and
  the notification is visible. The rider stops it with mute or End ride. (On iOS a swipe-away force-quits the app,
  which stops location and voice.) **This needs a patched expo-speech** (`patches/expo-speech+57.0.3.patch`, applied by
  `patch-package` on `postinstall`): stock expo-speech shuts its `TextToSpeech` engine down in `OnActivityDestroys`
  while its lazy holder and `ttsState = READY` stay, so after the activity dies every later `speak()` goes to a dead
  engine and no callback ever comes. The patch shuts the engine down in `OnDestroy` (the module's own lifecycle)
  instead. **Re-verify the patch on every expo-speech upgrade** (it must still apply, and the swipe-away gate step
  below must still pass); drop it if upstream fixes the lifecycle.

#### 4.5.5 What stops voice
| Trigger | Effect | Resumes |
|---|---|---|
| Mute (map toggle / ⋯) | `hush()`; no prompts; persisted (§4.4) | on unmute: next due stage only |
| Arrival latch | speaks `nav.say.arrived` once, then the session goes idle; `setNavRate(false)`; iOS session released | new destination |
| Stop directions / stop cleared | `navSession.stop()` → `teardown()`, `setNavRate(false)` | new stop |
| Destination replaced (Go here) | `hush()`, stages reset, new route | at once |
| My SOS (hold started or on) / any received SOS active | `hush()`, no prompts | SOS cleared: next due stage, nothing replayed |
| End ride (any path: arrival panel, ⋯, the server `ended` broadcast, Leave, `not_a_member`) | `navSession.stop()`. **Also called first inside `stopRideTracking()`**, which every end path already calls | — |
| iOS phone call / Siri | session activation fails → prompt skipped | after the interruption |
| App killed (iOS force-quit, Android process death) | silent (no runtime); headless relaunch stays silent (§4.5.2) | opening the app |
| Ride screens left in the foreground | `navSession.stop()` | returning to the ride |

#### 4.5.6 Config and dependencies
- `npx expo install expo-speech expo-audio` (both native → **one new dev build**, and new store builds).
- `app.json` plugins, add:
  ```json
  ["expo-audio", { "microphonePermission": false, "recordAudioAndroid": false,
                   "enableBackgroundRecording": false, "enableBackgroundPlayback": false }]
  ```
  - `enableBackgroundPlayback` defaults to **true**, which would add an Android `mediaPlayback` foreground service
    (`AudioControlsService`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`) and a Play Console declaration we don't need.
  - `recordAudioAndroid` defaults to true (`RECORD_AUDIO`).
  - Also add `"android.permission.RECORD_AUDIO"` to `android.blockedPermissions` as a guard.
- iOS background mode, set explicitly (since `enableBackgroundPlayback` is off, the plugin won't add it):
  ```json
  "ios": { "infoPlist": { "UIBackgroundModes": ["location", "audio"] } }
  ```
  List `location` as well, so the result doesn't depend on plugin merge order.
- No change to the location usage strings is required. Marketing may add "and give spoken directions" to
  `locationAlwaysAndWhenInUsePermission` (✎).
- Verify with `npx expo prebuild --clean` (scratch) or `npx expo config --type introspect`: Info.plist
  `UIBackgroundModes` = {location, audio}, no duplicates, no `NSMicrophoneUsageDescription`; the merged
  AndroidManifest has no `RECORD_AUDIO`, no `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, no `AudioControlsService`.

#### 4.5.7 Store review
- **App Store review notes (iOS `audio` background mode)** ✎:
  > Throttle Tribe gives turn-by-turn spoken directions during a navigation ride. The "audio" background mode lets
  > these spoken directions continue when the phone is locked or another app is in front, as in other navigation
  > apps. The app plays no other audio. Its audio session is active only while a direction is being spoken. The
  > "location" mode keeps the rider's position updating for the directions and for sharing with their riding
  > group; it stops when the ride ends. To test: sign in → Where to? → pick a place → Go → lock the phone while
  > moving (or simulate a route with a GPX file).
- **Google Play:** no new permission or foreground-service type. Update the existing **location** foreground-service
  declaration text ✎:
  > During a ride, a location foreground service shares the rider's position with their group and gives
  > turn-by-turn directions, including spoken directions while the screen is off. It runs only during a ride and
  > stops when the ride ends.
  - Re-record the declaration video to show a spoken prompt with the screen off.

#### 4.5.8 Device-test gate (P3 must pass before merge)
Use physical devices with a release-config dev build, on a real ride or a simulated route (Xcode GPX / Android
emulator route playback for dry runs, then one real ride per platform). The route needs ≥ 10 announced maneuvers,
including a roundabout and a deliberate wrong turn.

**Pass, in every run:**
- No missed `near` / `now` prompt.
- `now` heard ≤ 2 s after its threshold is crossed.
- No prompt after its maneuver was passed.
- Music never stays ducked more than about 1 s after a prompt.
- **Fix latency (measure, M5).** Read the `nav.fix_latency` events (one per minute while navigating: `n`, `avg_ms`,
  `max_ms`, `max_batch`, `app_state`) for each run. With the screen locked, `max_ms` must stay within the `now`
  budget (≤ 2 s heard after the threshold means fixes must reach the engine well inside that) and `max_batch` should
  be 1; record both numbers. A larger value is a failure of "on time" even when no prompt was missed.

**iOS** (one current iPhone):
1. **Silent switch on**, screen **locked**, Bluetooth headset playing music: prompts audible, music ducks and recovers.
2. Silent on, locked, phone speaker, no music: audible.
3. Another app in front (e.g. WhatsApp), unlocked: prompts continue.
4. Incoming call while a prompt is due: no prompt during the call; prompts resume after it; `nav.voice_skipped` logged.
5. Received SOS from a second phone while locked: silence until cleared; no replay.
6. Muted in the app, then locked: silent for the whole route; unmute → next due stage only.
7. End ride → no further speech; the location indicator goes away.
8. Force-quit → silent.
9. 30 min locked: no gaps, no stuck ducking.
10. **Call / Siri reactivation (M2).** Music playing, navigation on, no prompt for a while: take a call or invoke Siri
    and finish it. Music must not stay ducked: the 2 s beat gives the session back within about 3 s (`releaseIfIdle`).
    Also end the ride (or tap Stop directions) right as a prompt is starting: music must come back at full volume.

**Android** (one Pixel or stock Android 14+, plus one aggressive-OEM phone):
1. Screen **off**, music over Bluetooth: prompts audible (mixed, not ducked: known). Logs show about 1 Hz fixes
   in the task.
2. Another app in front, screen on: prompts continue.
3. Battery saver on: prompts continue, or record the failure.
4. Phone call while a prompt is due: record the behaviour (known gap, §4.5.4).
5. Swipe-away from Recents **during navigation** (patched expo-speech, §4.5.4): the next prompt is heard with the
   app gone from Recents; **reopen the app**: prompts still work and the banner is current; End ride stops it. Also
   check a build from a clean `npm ci` has the patch applied (`postinstall`).
6. 30 min screen-off: no missed `near` prompts.
7. Uploads still about every 5 s (Supabase `ride_samples`).
8. **Arrive with the screen off (C1).** Arrive (or End directions) with the screen locked while sharing: location
   sharing must continue (`ride_samples` keep arriving, the notification stays); unlocking returns the task to 5 s.
9. **End ride while navigating** (screen on): the location indicator and the foreground notification go away and
   `ride_samples` stop.

**Battery (both platforms):** record % per hour for (a) foreground navigation, screen on and (b) background
navigation, screen off, with voice. (b) must be ≤ (a). Record both numbers in §5.5.

---

## 5. Risks and mitigations

### 5.1 OSRM public demo: policy and reliability
**Facts:** "Do not exceed 1 request per second"; "restricted to reasonable, non-commercial use-cases"; "no guarantees
wrt. uptime, latency, or data updates"; a valid identifying User-Agent is required ("faking … WILL get you blocked");
routes must credit OSRM (and ODbL data); access "shall be withdrawn at any time and without giving a reason".
**Mitigations built into this spec:** request budget (§3.8), preview seeding, 5-min cache, User-Agent header, OSRM in
the attribution, the base URL in `EXPO_PUBLIC_ROUTING_URL` (swap without a release of the logic), and graceful
degradation (`noRoute` banner + compass arrow + stop card `≈ km`, so a missing route never blocks riding),
plus telemetry (`nav.route_failed`) to watch the failure rate.
**Decided (D1): deferred.** Keep the demo for now; this remains a **pre-launch risk item** that must be closed
before a public launch or group navigation (§6). Background voice (D3) adds no requests: reroutes are the same
whether the app is in front or not. The question that stays open is whether the demo is acceptable beyond a closed beta. The keyless,
secret-free options are: self-host OSRM or **Valhalla** (Valhalla has a real `motorcycle` costing and built-in
instructions) for the India extract on a small VM; or a commercial router behind a **Supabase Edge Function proxy**
(the key stays server-side, satisfying "no secret in the app"). FOSSGIS `routing.openstreetmap.de` has the same
1 req/s, user-agent and attribution terms, and its "bike" profile is a bicycle, not a motorcycle.

### 5.2 Driving profile vs motorcycle
- OSRM `driving` is a car profile. It doesn't read `motorcycle=no`, so it can route onto access-controlled
  expressways that ban two-wheelers in India (for example the Bengaluru–Mysuru Expressway main carriageway, which is
  NH275, the example in this spec).
- **Mitigation:** `exclude=motorway` by default (`avoidMotorways`), with a single retry without it if the server
  rejects the parameter (verify on the demo during P1), plus the visible car note on the preview.
- ETAs are car ETAs; acceptable for riders.
- **Decided (D2):** avoid by default, with the rider-controlled **Allow expressways** switch (§2.3.1). Note that
  `exclude=motorway` only avoids roads tagged `highway=motorway`; a two-wheeler ban on a `trunk` road isn't caught.
  The car note stays for that reason.

### 5.3 Offline / no network
- **Before Go:** search and preview need the network. Go is disabled offline (it needs the server to create the ride).
- **While riding:** steps are local, and the position is local (§3.6), so guidance, step advance, voice and arrival
  all work offline. Only rerouting stops (`offlineOffRoute`). Map tiles may be missing, but the banner doesn't need them.
- A cold start offline mid-ride → `noRoute` banner + compass arrow until reconnected.

### 5.4 GPS jitter at junctions
Accuracy-gated fixes, windowed projection, the 2-fix / 60 m pass rule, the 3-fix / 2-fix off-route hysteresis,
accuracy-scaled off-route distance, dead reckoning ≤ 10 s, and a monotonic `idx`. All in pure functions with
sequence tests (§3.7–3.8).

### 5.5 Battery and heat
1 Hz BestForNavigation + screen on (already on) + TTS. No UI change. The engineer measures the drain on a 1-hour
ride (acceptance). The watch runs only while navigating and in the foreground.
**Background voice (D3):**
- **Android:** the task runs at 1 s instead of 5 s while navigating. GNSS is already on continuously at a 5 s
  high-accuracy interval, so the extra cost is mostly waking JS once a second, plus short TTS bursts.
- **iOS:** the fix rate is unchanged (already about 1 Hz).
- The audio session is active only while speaking.
- Accuracy stays `High` in the background (not BestForNavigation).
- The screen being off saves far more than all of this costs, so a locked-phone navigation ride should drain
  **less** than a foreground one. The gate (§4.5.8) requires (b) ≤ (a) and records both figures here:
  *iOS: (a) — %/h, (b) — %/h · Android: (a) — %/h, (b) — %/h.* **TODO (device test, §4.5.8): not measured; the code and tests cannot measure battery. Fill in after the gate runs.**

### 5.6 Privacy (rule 8)
- The destination is the ride's stop: visible only to ride members (existing RLS). In solo that is me; anyone I
  later invite sees it as the next stop (expected; the invite screen is unchanged).
- Recent places stay on the device and can be cleared.
- Third parties receive coordinates: Photon (search bias, now rounded to 2 decimals in `buildPhotonUrl`, matching
  its cache key) and OSRM (exact start and end, which routing needs). `whereTo.locBody` says so before the OS prompt.
- No name or user id is sent to either service.

---

## 6. Group rides — recommendation (follow-up, not in this spec's scope)
**Recommend yes, as P4:** every rider gets the banner and voice to the ride's stop. The model already supports it:
the stop is shared and each phone already routes from its own position (19 A), so it's mostly widening
`navActive` to `stop !== null`. Prerequisites and open design points for that spec:
1. **Hosted routing first**: N riders × reroutes on the demo server breaks fair use (§5.1).
2. **Vertical budget**: banner 96 (+40) + convoy 84 + up to 2 banners. Consider a 72 dp compact banner in groups and
   keep the C1 `mapVisH` auto-hide.
3. **Right column**: fit-all + full-map are already 2, so voice lives only in ⋯ for groups.
4. **Who navigates**: on for everyone when the stop is a `destination`; for a `break`, the banner only.
5. **Voice vs alerts**: whether stopped / SOS alerts get spoken too (07 escalation).
6. Proposals (riders suggesting) stay as 19 A.

---

## 7. Safety, glanceability, accessibility
- **Glance:** the banner distance is the largest text on screen (36 bold). Arrow 48. White on dark blue, at least
  10:1 (Tribe) and 7.8:1 (Maps). Readable in sun; no glare at night.
- **No typing while moving** (§2.2.2). Every navigation action is one tap on a target ≥ 56 dp. Nothing requires a swipe.
- **SOS always reachable:** the bar (sheet mode) or the floating SOS (full map) is never covered. SOS banners stack
  above the nav banner. Voice is hushed during SOS (§4.3). Where to? and the preview are outside a ride, so there is
  no SOS there, the same as Home today.
- **Destructive actions:** End ride (arrival panel or ⋯) → confirm. Stop directions → confirm. Clear recents → confirm.
- **Keep-awake:** already active for the whole ride (ride layout). Navigation needs no change; Where to? and the
  preview don't keep the screen awake.
- **Screen readers:**
  - NavBanner is `accessibilityRole="button"`, label `nav.a11yBanner` "{distance spoken}, {voice now-form}.
    {Then …}." and `accessibilityHint` `nav.a11yBannerHint` ("Repeats the instruction."), e.g. "In 400 metres, turn left onto N H 275. Then turn right."
  - When the **maneuver changes** (not on every distance tick), `AccessibilityInfo.announceForAccessibility` the
    instruction, **only when voice is muted** (no double speech).
  - Then row: part of the banner label, not focusable on its own.
  - Voice toggle: `nav.a11yVoiceOn` / `nav.a11yVoiceOff`, `selected` when muted.
  - Expressway switch (preview): role `switch`, `checked` / `busy` / `disabled`, one focus stop (§2.3.1).
  - Arrival buttons: plain labels; ArrivedCard: `nav.a11yArrived`.
  - Where-to rows: `whereTo.a11yRow`; LocationRow: header + button.
  - Preview: line 1 read as `preview.a11ySummary` "1 hour 34 minutes, 119 kilometres to Mysuru Palace"; Go:
    `preview.goA11y`.
- **Dynamic type:** `maxFontSizeMultiplier` 1.3 on the banner, Then row, panel, rows and preview panel.
  - Banner at 1.3×: 47 + 34 + 4 = 85 ≤ 96, so the height is fixed and never grows.
  - The road span truncates first, then the primary.
  - Preview line 1: the distance span truncates before the duration.
- **360 dp:** banner text column = 360 − 16 − 56 − 12 − 16 = 260 dp: "450 m" at 36 bold ≈ 110 dp, and "Turn left"
  at 20 ≈ 90 dp, leaving about 170 dp for the road. Then row fits "Then ↱ Take exit 12". The arrival buttons are
  full width (328).
- **Light/dark × Tribe/Maps:** token-driven; the banner tokens are the same in light and dark per style (§8).

---

## 8. Tokens (`src/theme/tokens.ts`)
```ts
// Tokens interface, all four palettes:
navBannerBg:       Tribe light '#1E3A8A' · Tribe dark '#1E3A8A' · Maps light '#174EA6' · Maps dark '#174EA6'
navBannerThenBg:   Tribe '#172554' (both)                       · Maps '#0D3A85' (both)
onNavBanner:       '#FFFFFF' (all)      // 10.4:1 on #1E3A8A · 7.8:1 on #174EA6 · 14.7:1 on #172554 · 10.7:1 on #0D3A85
onNavBannerMuted:  '#DBEAFE' (all)      // 8.5:1 · 6.4:1 · 12.0:1 · 8.8:1
// size:
size.navBanner    = 96   // turn banner main row
size.navThenRow   = 40   // "Then" row
size.maneuverIcon = 48   // banner arrow
```
- Status tokens are reused unchanged (`status.offline` / `onStatus.offline` for `noGps` and `offlineOffRoute`).
- Blue is not a status colour, so the banner can never read as moving, stopped, offline or SOS.
- Local constants (not tokens): the §3.7–3.9 and §4.2 thresholds, `ARRIVAL_PANEL_H = 216`.

---

## 9. Copy (`src/lib/copy.ts`; ✎ = marketing may refine)
| Key | Text |
|---|---|
| `home.whereToTitle` ✎ | Where to? |
| `home.whereToSub` ✎ | Ride solo with turn-by-turn directions |
| `whereTo.emptyTitle` ✎ | Where are you riding to? |
| `whereTo.emptyBody` | Search for a place, or pick a category. |
| `whereTo.recent` | Recent |
| `whereTo.clear` | Clear |
| `whereTo.clearTitle` | Clear recent places? |
| `whereTo.clearBody` | They're only saved on this phone. |
| `whereTo.clearConfirm` | Clear |
| `whereTo.justRide` ✎ | Just ride, no destination |
| `whereTo.locTitle` | Allow location to plan routes |
| `whereTo.locBody` ✎ | We use your location to find places near you and plan your route. Your start point and destination go to OpenStreetMap search and routing (Photon, OSRM), not linked to your name. |
| `whereTo.locAllow` | Allow location |
| `whereTo.lockedPlaceholder` | Stop to search by name |
| `whereTo.typingLocked` ✎ | Typing is off while you're moving. Pick a category or a recent place. |
| `whereTo.a11yRow` | {name}, {address}, {distance} away |
| `preview.a11yBack` | Back to search |
| `preview.loading` | Finding a route… |
| `preview.distanceSpan` | · {km} |
| `preview.arrive` | Arrive about {time} |
| `preview.carNote` ✎ | Route for cars, avoiding expressways. Watch for two-wheeler bans. |
| `preview.carNoteNoAvoid` ✎ | Couldn't avoid expressways on this route. It may use some that ban two-wheelers. |
| `preview.carNoteAllowed` ✎ | Route for cars. It may use expressways that ban two-wheelers. |
| `preview.expressways` | Allow expressways |
| `preview.expresswaysOff` / `preview.expresswaysOn` | Off / On |
| `preview.expresswaysHint` | Changes the route. Many expressways ban two-wheelers. |
| `preview.updating` | Updating route… |
| `preview.noRouteAvoid` | No route without expressways. Turn on Allow expressways to try again. |
| `preview.noFix` | Route shows when GPS is ready |
| `preview.noRoute` | No road route to this place. You'll see a straight line instead. |
| `preview.routeFailed` | Couldn't load the route. It retries when you start. |
| `preview.offline` | You're offline. Starting needs a connection. |
| `preview.go` | Go |
| `preview.starting` | Starting… |
| `preview.goA11y` | Start riding to {name} |
| `preview.a11ySummary` | {duration}, {distance} to {name} |
| `live.attributionRoute` | © OpenFreeMap © OpenStreetMap · OSRM |
| `banner.offlineSolo` | You're offline — directions still work |
| `nav.now` | Now |
| `nav.then` | Then |
| `nav.toRoad` | Head to the road |
| `nav.toRoadSub` | Directions start when you reach it |
| `nav.starting` | Getting directions |
| `nav.startingSub` | This takes a few seconds |
| `nav.noRouteSub` | Route unavailable · retrying |
| `nav.rerouting` | Rerouting |
| `nav.reroutingSub` | Finding a new route |
| `nav.offRoute` | Off route |
| `nav.offRouteOfflineSub` | New route when you're back online |
| `nav.noGps` | GPS signal lost |
| `nav.noGpsSub` | Directions paused |
| `nav.onto` / `nav.towards` / `nav.stayOn` | onto {road} / towards {place} / to stay on {road} |
| `nav.v.turnLeft` … `nav.v.sharpRight` | Turn left · Turn right · Slight left · Slight right · Sharp left · Sharp right |
| `nav.v.straight` / `nav.v.uturn` | Go straight / Make a U-turn |
| `nav.v.keepLeft` / `nav.v.keepRight` | Keep left / Keep right |
| `nav.v.mergeLeft` / `nav.v.mergeRight` / `nav.v.merge` | Merge left / Merge right / Merge |
| `nav.v.ramp` / `nav.v.exit` / `nav.v.exitNumber` | Take the ramp / Take the exit / Take exit {n} |
| `nav.v.roundabout` / `nav.v.rotary` / `nav.v.roundaboutEnter` | Roundabout · {o} exit / {name} · {o} exit / Enter the roundabout |
| `nav.v.arriveLeft` / `nav.v.arriveRight` / `nav.v.arriveAhead` | Destination on the left / Destination on the right / Destination ahead |
| `nav.ord.1` … `nav.ord.10`, `nav.ord.n` | 1st … 10th, exit {n} |
| `nav.say.turn*` | Turn left · Turn right · Turn slightly left · Turn slightly right · Turn sharp left · Turn sharp right |
| `nav.say.endOfRoad` | At the end of the road, turn {dir} |
| `nav.say.fork` | At the fork, keep {dir} |
| `nav.say.ramp` / `nav.say.exit` | Take the ramp{side} / Take the exit{side} (side = " on the left" / " on the right" / "") |
| `nav.say.roundabout` / `nav.say.rotary` / `nav.say.roundaboutTurn` | At the roundabout, take the {ow} exit / At {name}, take the {ow} exit / At the roundabout, turn {dir} |
| `nav.say.arriveLeft` / `Right` / `Ahead` | Your destination, {place}, is on the left / …is on the right / …is ahead |
| `nav.sayOrd.1` … `nav.sayOrd.10` | first … tenth (above 10: `nav.ord.n`) |
| `nav.say.in` | In {distance}, {instruction} |
| `nav.say.then` | , then {instruction} |
| `nav.say.start` | Route to {place}, {distance}. |
| `nav.say.continue` / `nav.say.continueNoRoad` | Continue on {road} for {distance} / Continue for {distance} |
| `nav.say.rerouting` | Rerouting |
| `nav.say.noGps` | GPS signal lost |
| `nav.say.arrived` | You've arrived at {place} |
| `nav.say.metres` / `nav.say.km` / `nav.say.km1` | {n} metres / {n} kilometres / 1 kilometre |
| `nav.pickNext` | Pick next destination |
| `nav.a11yArrived` | You've arrived at {place} |
| `nav.endTitleSolo` | End your ride? |
| `nav.endBodySolo` | Location sharing stops and you'll see your ride summary. |
| `nav.goHere` | Go here |
| `nav.replaces` | Replaces {place} |
| `nav.menuStop` | Stop directions |
| `nav.stopTitle` | Stop directions to {place}? |
| `nav.stopBody` | You'll keep riding. Your ride doesn't end. |
| `nav.stopConfirm` | Stop directions |
| `nav.stopCancel` | Keep going |
| `nav.menuVoiceOff` / `nav.menuVoiceOn` | Mute voice directions / Turn on voice directions |
| `nav.toastVoiceOff` / `nav.toastVoiceOn` | Voice directions off / Voice directions on |
| `nav.fgsTitle` ✎ | Throttle Tribe — directions on |
| `nav.fgsBody` ✎ | Sharing your location with your ride. Open the app to mute voice directions. |
| `nav.a11yVoiceOn` / `nav.a11yVoiceOff` | Voice directions on / Voice directions muted (labels). Hints `nav.a11yVoiceOnHint` / `nav.a11yVoiceOffHint`: Mutes voice directions. / Turns voice directions on. |
| `nav.a11yBanner` | {instruction}. {then} (label; hint `nav.a11yBannerHint`: Repeats the instruction.) |

- Reused: `search.*`, `perm.openSettings`, `stop.arrived`, `stop.cardDistanceApprox`, `live.endConfirm`,
  `live.keepRiding`, `common.tryAgain`, `solo.rideName`.
- Retired: `home.soloTitle`, `home.soloSub`.

---

## 10. States
| State | Behaviour |
|---|---|
| Where to?: no permission / blocked | LocationRow Allow / Open settings; search unbiased, no distances (§2.2.1) |
| Where to?: no recents | EmptyState; chips + Just ride |
| Where to?: offline | Banner `home.offlineSaved`-style at the top (`banner.offline` tone); recents still listed; search shows `search.error`; Just ride → `errors.network` toast |
| Where to?: moving ≥ 10 km/h | Typing lock (§2.2.2) |
| Preview: all | §2.3 table |
| Go: create OK, set-stop fails | Ride ended (compensating), toast error, stay on preview |
| Live: loading (`!loaded`) | As 20 §4; no banner until the ride and stop load (`starting` once a stop is known) |
| Live: navigating, then row, rerouting, offline off route, no GPS, no route | §2.5 / §2.7 |
| Live: viewer offline, on route | `banner.offlineSolo` above; banner `guide` continues |
| Live: my SOS on / received SOS | SOS banners above the nav banner; takeover on top; voice hushed |
| Live: not sharing / GPS off | Kept banner (exists); location services off → banner `noGps` |
| Live: arrived | ArrivalPanel latched (§2.8); banner hidden; route line hidden |
| Live: rider joins (1 → 2 active) | Group sheet (20 C4 transition). Navigation **continues for me** (I'm the leader and the stop is the ride's), convoy docks under the banner, `topInset` = banner + 84. Voice moves to ⋯ (fit-all takes the column). Other riders: no banner until §6 ships |
| Live: full map | §2.6 |
| Live: app backgrounded (screen locked / other app) | P2: no local watch, banner frozen; on return, re-project at once (the pass rule allows a jump of ≥ 60 m). **P3 (D3):** the engine keeps running on task fixes (1 Hz while navigating) and **voice continues** (§4.5); on return the banner shows the current state at once |
| Preview: Allow expressways changed | §2.3.1 (updating state, persisted, refetch) |
| Route server rejected `exclude` | Preview note `preview.carNoteNoAvoid`; switch unchanged; later fetches skip `exclude` this session (§2.3.1) |
| Cold start mid-navigation | Gate → live; route fetched once (no seed); progress re-acquired by full projection; arrival recomputed |
| Light / dark × Tribe / Maps | Token-driven; check banner contrast (§8) and the dark map edge (e2 hairline) |
| 360 dp / 1.3× | §7 |

## 11. Interactions
| Control | Gesture | Feedback | Result |
|---|---|---|---|
| Home Where to? 72 | tap | `select` | push `/where-to` |
| Where-to chip 48 (56 hit) | tap | `select`, selected ring | chip search (19 A) |
| Recent / result row 64 | tap | `select`, `surfacePressed` | push `/route-preview` |
| Clear (recents) 56 | tap → confirm | `select` | list emptied |
| Allow location 56 | tap | `select` | OS prompt / settings |
| Just ride 56 | tap | `select`, loading | `startSoloRide` → stack reset → live (sheet view; 22 D6) |
| Preview back 56 | tap / Android back | `select` | back to `/where-to`, state kept |
| Allow expressways row 56 | tap (whole row) | `select`, switch flips, updating state | persisted; route refetched after 500 ms (§2.3.1) |
| Go 56 | tap | `success` on start, loading | §2.4 |
| NavBanner 96+ | tap | `select` | re-centre (follow) + repeat prompt (P3) |
| Voice toggle 56 | tap | `select` + toast | mute / unmute, persisted |
| Pick next destination 56 | tap | `select` | push `/ride/[id]/search` |
| End ride 56 (arrival or ⋯) | tap → confirm | `select`; `success` on summary | end ride |
| Go here 56 (solo sheet) | tap | `success` | set stop, back to live (follow) |
| ⋯ Stop directions | tap → confirm | `select` | `clearStop`, free solo |
| SOS | hold 2 s | as 07 | unchanged |

---

## 12. Acceptance checklist

**P1**
- [ ] Home shows **Where to?** (no Ride solo card) when no ride is open; it's hidden while a ride is open.
- [ ] Opening Where to? and the preview, then backing out, creates **no** ride row (check `rides` in Supabase).
- [ ] Recent place → Go = 3 taps from Home to live; Android back / header Back from live lands on **Home**.
- [ ] Where to? is not auto-focused; the in-ride search still is.
- [ ] No location permission: the explainer row comes before any OS prompt; search works without distances.
- [ ] At ≥ 10 km/h (simulated) the input locks with the message; chips, recents and Just ride still work; it unlocks below 5 km/h.
- [ ] Preview shows duration (28 bold) · distance, name, address, arrival time, car note; route + pin + me framed clear of the back button and panel.
- [ ] Preview offline: Go disabled with `preview.offline`; OSRM failing: Go still works and live shows the `≈` stop card.
- [ ] Go: `create_ride` → `start_ride` → `propose_stop` (destination applied); if any step fails the ride is ended and an error toast shows.
- [ ] A navigation ride opens in **sheet** mode, camera following; a free ride too since 22 D6 (full map is the toggle).
- [ ] No "Next stop" toast for my own solo stop.
- [ ] Within 150 m: ArrivalPanel latches (You've arrived · Pick next destination · End ride); nothing ends without a tap; End ride asks "End your ride?" first.
- [ ] Riding away from an unanswered arrival keeps the panel; no route line, no reroute.
- [ ] Solo result sheet: one **Go here** (+ "Replaces …" when a stop exists); group keeps the two 19 A buttons.
- [ ] Solo ⋯: "Stop directions" + solo confirm; group ⋯ unchanged.
- [ ] Attribution reads "© OpenFreeMap © OpenStreetMap · OSRM" whenever a road route is drawn (live and preview).
- [ ] Preview shows **Allow expressways · Off** on first use; the whole 56 dp row toggles; the state word changes with the switch; screen reader reads "Allow expressways, switch, off".
- [ ] Toggling refetches after 500 ms with the previous line faded and `preview.updating`; rapid toggles send one request; toggling back is served from cache (no request).
- [ ] The choice survives an app restart and a sign-out; the live route line, and every reroute, use it (check the request URL for `exclude=motorway`).
- [ ] Server 400 on `exclude` (mock): one retry without it, note `preview.carNoteNoAvoid`, switch still off, no `exclude` sent for the rest of the session.
- [ ] `NoRoute` with avoidance on: `preview.noRouteAvoid`; no automatic retry with expressways.
- [ ] Unit tests: `recent-places` (dedupe by id and 50 m, cap 8, parse), `typingLocked`, `stopKindFor`, `arrivalState` rule (a) + latch, `buildOsrmUrl` (steps / exclude / bearings), `fetchNavRoute` exclude-retry + `excludeUnsupported`, the `allowExpressways` parse (missing / invalid → false), `shouldDefaultFullMap` with `hasStop`, Photon bias rounding.

**P2**
- [ ] Banner docked under the header (sheet) / floating under the status bar (full map, replacing the stop chip); `topInset` includes banner + Then row (+ convoy). My marker is never under the banner after Re-centre.
- [ ] Banner: arrow 48 · distance 36 bold tabular · instruction 20 with the road truncating first; Then row only when the next maneuver is ≤ 500 m after.
- [ ] All 25 rows of the §3.4 table pass; §3.5 distance cases pass; alongM scaling test passes.
- [ ] Step advance needs 2 fixes ≥ 20 m past, or 1 ≥ 60 m past; poor-accuracy fixes never advance; `idx` monotonic (sequence tests incl. a doubled-back route).
- [ ] Off route after 3 good off fixes (or > 250 m); back on after 2 on fixes; reroute ≥ 10 s apart with 10/20/40/60 s backoff; offline shows the grey off-route banner and fetches on reconnect.
- [ ] No good fix for 10 s → grey "GPS signal lost"; never amber; dead reckoning only shortens the displayed distance.
- [ ] Local 1 Hz watch runs only while navigating in the foreground; it stops on arrival, stop cleared, background, unmount.
- [ ] Banner contrast checks (§8) in all four palettes; 360 dp and 1.3× screenshots in each banner state.
- [ ] Arrival rules (b) and (c) tested with a destination 250 m off the road.

**P3**
- [ ] Dev build with `expo-speech` + `expo-audio`; config check of §4.5.6 passes (Info.plist modes {location, audio}; no `RECORD_AUDIO`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `AudioControlsService` or microphone string).
- [ ] Prompts at the §4.2 thresholds (30 / 60 / 100 km/h cases), most-urgent-only, ≥ 4 s gap except `now`, "then" chaining ≤ 150 m.
- [ ] `Speech.stop()` before every `speak()`; a prompt never plays after its maneuver was passed (test with a delayed engine).
- [ ] Voice hushed during my SOS (incl. the hold), any received SOS (also in the background), and mute; nothing replayed afterwards. Background does **not** hush.
- [ ] The engine runs in `nav-session.ts` with no React import; the location task forwards fixes to it; `ingest` dedupes by `t`; a headless task run with no session is a no-op (unit test).
- [ ] `setNavRate(true/false)` follows `navActive`; uploads stay ≥ 4.5 s apart while it's on.
- [ ] iOS: per-prompt session activate / release (music ducks only during prompts); activation failure skips the prompt and logs `nav.voice_skipped`.
- [ ] `stopRideTracking()` calls `navSession.stop()` first; every §4.5.5 trigger stops voice.
- [ ] Voice toggle (map + ⋯) persists across restarts and governs background too; toast states the new mode; screen reader announces only when muted.
- [ ] **§4.5.8 device gate passed** on iOS (locked + silent switch, other app in front) and Android (screen off, other app in front, plus one aggressive-OEM phone); results and battery figures recorded in §5.5.
- [ ] Store texts (§4.5.7) handed to whoever submits; the Play location-FGS video re-recorded.

**Cross-cutting**
- [ ] `npx expo lint`, `npx tsc --noEmit`, Jest clean; web compiles (banner on web, voice best effort).
- [ ] Telemetry: `nav.started`, `nav.rerouted`, `nav.route_failed`, `nav.arrived`, `nav.voice_muted`, `nav.expressways_toggled`, `nav.exclude_rejected`, `nav.voice_skipped` (names match `^[a-z][a-z0-9_.]{0,63}$`).

## 13. Files (engineer)
**P1**
- New:
  - `src/app/(app)/where-to.tsx`, `src/app/(app)/route-preview.tsx`
  - `src/components/place-search-view.tsx` (extracted from `ride/[id]/search.tsx`, incl. `PlaceRow`, `Attribution`)
  - `src/components/route-preview-map.tsx` + `.web.tsx`, `src/components/route-layers.ts`
  - `src/components/arrival-panel.tsx`
  - `src/components/toggle-row.tsx` (`ToggleRow`, used by the Allow expressways row, §2.3.1)
  - `src/lib/solo-nav.ts`, `src/lib/recent-places.ts`, `src/lib/typing-lock.ts`, `src/store/nav-store.ts` (incl. `allowExpressways`), plus tests
- Changed:
  - `home.tsx` (card)
  - `ride/[id]/search.tsx` (uses `PlaceSearchView`; solo sheet; typing lock; no `focusStop` in solo)
  - `live.tsx` (ArrivalPanel, `navActive`, no full-map default when a stop exists)
  - `_layout.tsx` (solo End / Stop directions copy, self-set toast skip)
  - `lib/full-map.ts` (`hasStop`), `lib/live-sheet.ts` (`soloSheet(hasStop, arrived)`)
  - `lib/nav-route.ts` (URL options, User-Agent, cache, `exclude` retry, `ROUTING_URL`), `lib/flags.ts` (`EXPO_PUBLIC_ROUTING_URL`)
  - `lib/place-search.ts` (bias rounding), `lib/storage.ts` (`recentPlaces`, `navVoice`, `allowExpressways`)
  - `hooks/use-nav-route.ts` (passes `avoidMotorways` from the preference for the group stop route too)
  - `ride-map(.web).tsx` (attribution text), `lib/icon-names.ts` (`mapSearch`), `lib/copy.ts`
  - sign-out path (clear recents)

**P2**
- New:
  - `src/lib/nav-steps.ts`, `nav-instructions.ts`, `nav-progress.ts` (+ tests)
  - `src/lib/nav-session.ts` (engine singleton, no React; §3 intro, §4.5.2)
  - `src/hooks/use-nav-position.ts`, `src/hooks/use-navigation.ts` (mounted in `ride/[id]/_layout.tsx`)
  - `src/components/nav-banner.tsx`
- Changed:
  - `lib/geo.ts` (`projectOntoTrailWindow`)
  - `lib/live-chrome.ts` (`navTopInset`, generalised `fullMapTopInset`)
  - `live.tsx` (banner slot, insets, local me position)
  - `ride-map(.web).tsx` (me override)
  - `lib/icon-names.ts` (maneuver icons), `theme/tokens.ts` (§8), `lib/copy.ts`

**P3**
- `npx expo install expo-speech expo-audio` → new dev build
- `app.json`: the expo-audio plugin entry, `ios.infoPlist.UIBackgroundModes`, `RECORD_AUDIO` in `blockedPermissions` (§4.5.6)
- New: `src/lib/speech.ts`, `src/lib/nav-voice.ts` (+ tests)
- Changed:
  - `nav-session.ts` (prompts, suppression, headless guard)
  - `lib/location/background-task.ts` (forward fixes to `navSession.ingest`, upload throttle while nav rate is on)
  - `lib/location/tracking.ts` (`setNavRate`, nav notification text, `navSession.stop()` first in `stopRideTracking`)
  - `ride-map(.web).tsx` (voice circle), `_layout.tsx` (⋯ voice row), `nav-store.ts`, `lib/copy.ts`

## 14. Phase plan
1. **P1 (no new native code):** gives "pick a place, ride there, arrive" with the existing route line and stop card.
   It also proves the OSRM `exclude` support and the Go sequence.
2. **P2:** the turn engine plus banner. It ships behind no flag once the §3 tests pass and one real ride over junctions,
   a roundabout and a deliberate wrong turn has been reviewed.
3. **P3:** voice, foreground and background (D3). Needs a dev build and the §4.5.8 device gate before merge, and
   the §4.5.7 store texts with the next store submission.
4. **Follow-up:** group navigation (§6), hosted routing (pre-launch, D1, §5.1), Android audio focus (ducking, no
   prompts during calls, §4.5.4), "Continue to X" after a fuel break
   (one stop per ride today: a break replaces the destination, so the sheet warns with `nav.replaces`), lane hints
   from OSRM `intersections.lanes`, a step list, suggestions from past ride destinations.

## 15. Open questions (answered 2026-10-13, see Decisions at the top)
1. **Routing provider beyond a closed beta.** The OSRM demo is best-effort and "non-commercial"; it can be withdrawn
   at any time. Options: self-hosted Valhalla (true motorcycle routing; about one small VM), or a commercial router
   via a Supabase Edge Function proxy (no key in the app). **Deferred (D1).** Keep the demo; this is an open
   **pre-launch risk** that must be decided before public launch or group navigation.
2. **Avoid expressways by default?** **Resolved (D2):** yes, with an "Allow expressways" switch on the preview
   (off by default, remembered on this phone), §2.3.1.
3. **Background voice** (screen locked / another app in front)? **Resolved (D3):** yes, in this build (P3), §4.5.
   I had recommended "not now"; the user chose yes.
4. **Typing lock without a passenger override?** **Resolved (D4):** no override (chips and recents remain).

**Still to settle later (not blocking P1–P3):**
- Android audio focus (ducking, silence during calls) needs a small native module; it's a follow-up (§4.5.4).
- Whether swipe-away on Android should keep voice going (this spec says yes, §4.5.4). Revisit if riders find it surprising.
