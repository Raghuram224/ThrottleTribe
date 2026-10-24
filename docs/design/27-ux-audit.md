# 27 — UX audit (Phase 1)

**Date:** 2026-10-24. **Method:** impeccable `audit.native` + `onboard` playbooks, Android reference, run on real
screens. Read-only: nothing here is fixed yet; each finding names the phase of the UX plan that fixes it.

## Coverage

| | Device | Build | Appearance | Text | Data |
|---|---|---|---|---|---|
| Hardware | moto g64 5G, Android 15, 1080×2400 @ 400 dpi | dev client, Metro (JS dev mode) | dark (app + system) | 1.0 | the owner's real account, real GPS |
| Emulator | Medium Phone API 37, 4 cores / 4 GB | same | light | 1.0 and 1.3 | app data cleared: first run |

**Walked:** Home, profile (all sections), Just ride → live → End ride → summary, search → result → route preview, map-type
sheet, first run (welcome → name → location prompt → denied → Home first-ride guide), Join with a code.

**Not tested (do not read as passing):** a live TalkBack session (labels and states were read from the accessibility tree
only), a group ride with 2+ riders, joining from an invite link, SOS hold (deliberately not triggered), offline, landscape,
tablet, release-build speed. One real solo ride was created on the live project while testing Just ride and ended at once.

Screenshots are in the session scratchpad (`audit/p*.png` phone, `audit/e*.png` emulator), not in the repo: the phone
captures show the owner's real area.

## Health score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Labels and roles are thorough; a demo card reads as a real alert (11) |
| 2 | Performance | 2 | Live map black for 10–15 s at ride start (2); tiles time out on weak Wi-Fi (6) |
| 3 | Appearance & theming | 3 | Dark is first-class; status bar shows map labels under the clock on map screens |
| 4 | Platform conformance | 3 | Material sheets, snackbars, radio roles; one unconfirmed Back exit (5) |
| 5 | Adaptivity | not assessed | No landscape, tablet or split-screen run |

No total: one dimension was not assessed.

**Verdict:** reads as a native Android app, not a web port. The weak spots are the first 15 seconds of a ride and the
first minute after install, not the screens themselves.

## Findings

### P0

**1. Live location may stop after Android restarts the app in the background** — *suspected, strong evidence*
- Where: `src/app/_layout.tsx:2` imports `@/lib/location/background-task` (the `defineTask`) as a side effect.
- Evidence: on 2026-10-21 the phone showed "GPS signal lost · Directions paused" after a cold start while the app logged
  9 m fixes, and Metro printed `No task registered for key expo-task-manager`. Expo Router evaluates route files when it
  renders them, so a headless background launch can deliver location before `_layout` (and the task) loads.
- Impact: on a long ride Android kills the app; its riders' position sharing can silently stop.
- Fix: a custom entry file that imports the task, then `expo-router/entry`, and `"main"` pointing at it. Confirm with a
  headless repro before and after. → Phase 2, `harden`.

### P1

**2. Every ride starts on a black map for 10–15 s**
- Where: `src/components/ride-map.tsx:182`: with no rider position the camera is `center [0, 20], zoom 2` (the Atlantic).
- Evidence: phone, Just ride: "Waiting for positions…" over black until the first background fix (p04, p05).
- Fix: seed the camera from the planning position Home already holds, then hand over to follow. → Phase 2.

**3. Android's location prompt comes before the app explains it**
- Evidence: emulator first run: name → Home → system prompt at once (e04); the "See where you are" card appears only after
  Don't allow (e05). A rider who refuses here gets a map that cannot find them.
- Fix: show the card first and ask on its button (or on the first search). → Phase 3, `onboard`.

**4. Before a GPS fix, Home shows the northern border region, not India**
- Where: `HOME_FALLBACK_CAMERA` (`src/lib/plan-flow.ts:34`, India centre, z4) ignores the open sheet, which covers ~85 %
  of the first-run screen; the strip left visible is Pakistan, Kashmir and western China (Islamabad, Lahore, Hotan).
- Impact: disorienting, and the border drawing there is sensitive in India (OSM's depiction differs from the official
  map). Flag for a product/legal check separately.
- Fix: apply the sheet as camera padding for the fallback view. → Phase 2.

**5. Back from ride search once left the app** — *observed once, not reproduced*
- Evidence: 2026-10-21, phone resumed on the ride search screen; Back opened Google Maps.
- Fix: reproduce (likely a resume or deep entry with search as the only route), then guard with a fallback route.
  → Phase 4, `expo-router`.

**6. Map tiles time out on weak networks, leaving blank squares**
- Evidence: 2026-10-21, phone Wi-Fi at 200–990 ms: repeated `Failed to load tile … openmaptiles: timeout`.
- Fix: measure on mobile data; tune the native tile cache and request retry. → Phase 2, `harden`.

### P2

**7. Just ride commits in one tap.** It creates the ride and starts sharing location with no confirm or undo (p04).
Fix: a "Ride started · Undo" snackbar for a few seconds (Material: snackbar, not a dialog). → Phase 3.

**8. The location card hides its own promise.** "…They get your area or start point, never …" truncates at the key words
"your name" (e05; worse at 1.3× text, e07) and names vendors (Geoapify, LocationIQ). Fix: one plain sentence plus the
existing "How sharing works" link. → Phase 3, `clarify`.

**9. A fuel stop shows a coffee cup.** `src/components/stop-card.tsx:36` draws a cup for every break; the stop has no
category (`RideStop`, `src/lib/stop-ui.ts:12`). Needs a `stop_category` column: **live DB change, needs approval**.
→ Phase 5.

**10. No-destination follow view has nothing to orient by.** Just ride follows at z16.5: buildings, no street names (p05).
Fix: confirm whether labels were still loading; else ease to ~z15 when there is no route. → Phase 5.

**11. The welcome demo card reads as a real alert.** TalkBack announces "Priya stopped · 2 min. 1.7 km behind you" (e01).
Fix: label it as an example or hide the decorative scene from accessibility. → Phase 3.

**12. The avatar's orange dot is unexplained.** Only TalkBack hears "2 things to set up" (guest account, emergency
contacts); on Profile only the contacts row carries a dot. Fix: mark both items, or replace the dot with a "Finish setup"
row. → Phase 3, `clarify`.

### P3

13. Segmented controls say "selected" twice in TalkBack: "Dark, selected" plus `checked`. (Style and map-type cards are
    correct: radio role with state only.)
14. Join: the code field's label has an empty slot ("Ride code, 6 digits, , 0 of 6 digits"); pasting needs a hidden
    long-press. Offer a Paste button when the clipboard holds 6 digits.
15. Solo ride summary says "All finished together".
16. Map style warnings: `line dasharray requires at least two elements`, `Invalid geometry in line layer`.

## Patterns

- **Start-of-ride gaps:** 1, 2 and 6 are the same story: the screen is ready before location and tiles are. The fix is
  to seed from what the app already knows (planning fix, cached tiles) instead of waiting.
- **Explanations arrive late:** 3, 8 and 12: the copy exists but shows after the moment it was for.

## What works (keep it)

- Every control has a TalkBack label; pickers use radio roles with checked state; targets are 48–56 dp.
- Dark theme is designed, not inverted; text at 1.3× reflows without clipping in the sheet.
- First-run Home already has a three-step first-ride guide and an emergency-contacts nudge: refine, don't rebuild.
- Route preview: one number (42 min), arrival time, an honest "route for cars" warning, two clear actions.
- End ride asks first; the summary is calm and specific ("< 50 m", "1 min").
- Search answers fast with relevant results and the right row icons (pin, recent).

## Phase 2 status (2026-10-24)

Fixed and checked on the moto g64 unless noted:
- **1:** custom entry `index.js` defines the task first, with a light task module whose body loads on the first fix.
  After a kill mid-ride, Android relaunched the app headlessly and the task ran; `No task registered` no longer appears.
- **2:** the live map opens on my position, seeded from the planning fix (≤ 30 min old).
- **4:** Home's fallback centres India in the strip above the sheet at z4 (emulator, also after a relaunch).
- **6:** ambient tile cache raised to 200 MB from the first loaded map. Request timeouts need native code: not changed.
- **9:** `0012_stop_category.sql` written; the client retries without the category on a server that lacks it (checked
  live). **Not yet applied** to the live project.

Found during Phase 2:
- **Fixed:** chip search ran before the position was known and searched worldwide ("Petrol" in Croatia). Chips now
  wait for a position, seeded from Home's.
- **Open, P1:** a red-box crash, `[runtime not ready] Cannot read property 'EventEmitter' of undefined`, when the app
  is opened while a headlessly relaunched process is alive. It is likely a dev-client runtime issue and not the entry
  order. Verify on a release build.
- **Open, P3:** the header briefly reads "Lobby · 0 riders" while a solo ride loads.

## Recommended order

1. **[P0] `harden`**: register the location task from a custom entry (1).
2. **[P1] `harden`**: seed the live and Home cameras (2, 4); tile timeouts (6); reproduce the Back exit (5).
3. **[P1] `onboard`**: explain, then ask for location (3); undo for Just ride (7); demo card (11).
4. **[P2] `clarify`**: location card copy (8), setup dot (12), P3 copy (13–15).
5. **[P2] `polish`**: stop icons once the column is approved (9), follow zoom (10), style warnings (16).
6. **`polish`**: final pass, then re-run this audit on the phone.
