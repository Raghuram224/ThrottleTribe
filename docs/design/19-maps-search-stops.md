# 19 — Search, shared stops, full map, solo ride

Source: the user's Notion "Project Planner", the four **High** tasks (2026-10-13):

1. Implement the solo ride location like Google Maps.
2. When a rider updates the location on the map it should ask the leader; the leader updates the
   map for everyone. Same map for everyone.
3. Add a search bar and let the user update the ride, e.g. taking a break at a coffee shop.
4. Hide the overall menu, show the full map.

Constraints: no Google name, logo, fonts or APIs. Map data is OSM, so attribute it. Nothing in the app
holds a secret key. SOS must stay reachable on every screen state.

---

## A. Shared "next stop" (tasks 2 + 3)

### Model
One shared **next stop** per ride, stored on the ride row (so the existing `rides` broadcast updates
every phone, and late joiners get it from the normal load).

`rides` gets the following columns. All are nullable, and they are cleared together.

| column | type | notes |
|---|---|---|
| `stop_name` | text | 1–80 chars |
| `stop_address` | text | ≤ 160 chars, optional |
| `stop_lat`, `stop_lng` | double precision | range checks |
| `stop_kind` | text | `'break'` (coffee/fuel/food) or `'destination'` |
| `stop_set_by` | uuid | who proposed it (shown as "suggested by …") |
| `stop_set_at` | timestamptz | |

Proposals are **ride_events**, so they need no new table: add `'stop_proposed'`, `'stop_set'`,
`'stop_declined'` and `'stop_cleared'` to the `ride_events.type` check. The payloads are as follows.
- `stop_proposed`: `{ name, address, lat, lng, kind }` (the `id` of the event row is the proposal id)
- `stop_set`: same fields plus `proposal_id` (null when the leader picked it directly) and `proposed_by`
- `stop_declined`: `{ proposal_id }`
- `stop_cleared`: `{}`

### RPCs (security definer, `search_path = ''`, granted to `authenticated` only)
- `propose_stop(p_ride_id, p_name, p_address, p_lat, p_lng, p_kind)`. The caller must be an active
  member and the ride must not be ended. **If the caller is the leader**, the stop is applied directly
  (it updates the rides columns and inserts `stop_set`). Otherwise it inserts `stop_proposed`. It is
  rate-limited to 1 pending proposal per rider: a new one supersedes the old one, and the client shows
  only the newest. It returns `jsonb {applied: boolean, event_id}`.
- `decide_stop(p_ride_id, p_proposal_id, p_accept)`. Leader only. The proposal event must belong to
  this ride and be of type `stop_proposed`. Accept copies its payload onto the ride and inserts
  `stop_set` (with `proposed_by` = the proposer). Decline inserts `stop_declined`. A proposal that has
  already been decided returns `proposal_already_decided`.
- `clear_stop(p_ride_id)`. Leader only. Nulls the columns and inserts `stop_cleared`.

### Search (client)
> **Superseded 2026-10-16 by 24 §2:** search is Geoapify through the `geo` Edge Function, Photon is the automatic
> fallback; debounce 400 ms, chip radius 5 → 25 km, new credit row. The route provider below is now LocationIQ (24 §3).

- **Photon** (`https://photon.komoot.io/api/`). It is free, keyless and OSM-based. Requests use
  `q`, `lat`/`lon` = my last position (location bias), `limit=8`, and `lang=en`. Debounce 350 ms, abort
  in-flight requests, require at least 3 characters, cache the last 20 queries in memory, and give up
  after a 6 s timeout.
- Quick category chips (search without typing). Each one is a Photon search near me using an
  `osm_tag` filter:
  ☕ Coffee `amenity:cafe` · ⛽ Fuel `amenity:fuel` · 🍽 Food `amenity:restaurant` ·
  🅿 Parking `amenity:parking` · 🚻 Toilets `amenity:toilets`.
- Each result row shows: icon by category, name (bold), the address line (street, city) muted, and the
  straight-line distance from me ("2.4 km"). Results are sorted by distance when a chip is used and by
  relevance when typed.
- Footer: "Search by OpenStreetMap contributors" in muted text (the attribution).
- Offline or error: an inline error with the copy "Search needs a connection" and a Try-again button.

### Route to the stop (client)
- **OSRM demo server** (`https://router.project-osrm.org/route/v1/driving/{lng,lat};{lng,lat}?overview=full&geometries=geojson`).
  Each phone routes from its **own** position to the shared stop, and the route is drawn only on that
  phone.
- Fetch the route when the stop changes, then again when I am more than 150 m from the current route
  line, and at most once per 60 s. If the fetch fails, draw a dashed straight line and show
  "≈ x km" instead of an ETA. Never block the UI on routing.
- The line is drawn **under** rider markers and **over** the leader trail. It has a casing like the
  trail, its own colour token `navRoute` (Tribe: brand-ink blue `#2563EB`, dark `#60A5FA`; Maps:
  `#1A73E8`, dark `#8AB4F8`), and is 6 dp wide.
- Destination pin: a 36 dp teardrop in `navRoute` with a white glyph (☕/⛽/🍽/🏁 by kind/category).

### UI on the live screen
1. **Search pill**, floating at the top of the map, under the convoy strip: a 48 dp rounded pill with a
   search icon and the text "Search stops along the way". It is hidden when the sheet is expanded. Tap
   it to push `/ride/[id]/search`, which is a full-screen route with an auto-focused input, chips and
   results.
2. **Pick a result**, which shows a bottom sheet with the name, the address, "2.4 km away" and two
   buttons:
   - Leader: **Stop here for a break** (kind `break`) and **Make it the destination** (kind `destination`).
   - Rider: **Suggest a break here** and **Suggest as destination**. Afterwards a toast says
     "Sent to Arun for approval" (the leader's first name).
   - Then go back to live. The map then frames me plus the stop once, and follow mode resumes when the
     rider touches Re-centre.
3. **Next-stop card**: a 56 dp row at the top of the live sheet, above the summary line, visible in
   every snap.
   - Text: "☕ Cafe Coffee Day · 3.4 km · 9 min", with a muted "Suggested by Priya" line underneath
     when the stop came from a proposal.
   - Tap the card to frame me plus the stop.
   - The leader also gets an ✕ that opens a confirm sheet, "Remove the stop for everyone?", which then
     calls `clear_stop`.
   - Arrival: within 150 m the card says "You've arrived" with a check icon. It does not auto-clear.
4. **Leader approval** (the leader only): a proposal arrives as an **AlertBanner-style card** in the
   ride banner stack, at the lowest priority under SOS/offline. The card reads
   "Priya suggests a break · Cafe Coffee Day · 2.1 km" and has the buttons **Accept** (primary) and
   **Decline**.
   - It persists until it is decided. Only the newest pending proposal per rider is shown, and when
     there are 2 or more a "+1 more" chip appears.
   - Haptic `warning` plus a local notification when the app is in the background (reuse the alerts
     channel).
5. **Everyone else**: `stop_set` shows the toast "Next stop: Cafe Coffee Day", with a success haptic,
   and the route appears. The proposer gets "Arun accepted your stop" or "Arun declined your stop"
   when the decision concerns them.
6. Copy is added to `src/lib/copy.ts`, following the existing key style.

---

## B. Full map (task 4)

- A **full-map toggle**: a round 48 dp map control above Re-centre, using the "expand" icon. The live
  screen's full-map state lives in `live-ui-store` (`fullMap: boolean`) and is persisted in prefs so
  it survives restarts.
- Full map **hides** the ride header, the non-SOS banners, the convoy strip, the search pill, the live
  sheet and the action bar. The map fills the screen edge to edge, including under the status bar.
- What stays visible in full map:
  - the map controls (Re-centre / Show all / exit full-map with the "collapse" icon);
  - a compact **next-stop chip** at the top (one line) when there is a stop;
  - a floating **SOS hold button**: a 64 dp circle, bottom-left, with the same hold behaviour and
    a11y fallback as the bar button;
  - the **speed bubble** (see C);
  - SOS banners, SOS takeover and leader-approval cards (safety and decisions must never hide).
- Android back in full map exits full map first.
- Camera insets update so "me" stays in the lower third of the now-taller map.

## C. Solo ride (task 1)

> **Superseded for starting a ride:** the Home "Ride solo" action became 21's "Just ride, no destination", then 22 D5's
> "Just ride" tile, and **22 D7 (2026-10-24) removed it**: every ride now starts from a destination (route preview →
> Start ride / Invite riders). The live-screen rules below still apply to any ride of one.

- Home gets a secondary action **Ride solo** next to "Start a ride", using the same card style as the
  existing actions.
- Ride solo calls `create_ride('Solo ride', threshold)` then `start_ride` immediately, skips the invite
  and lobby, runs the same permission check as starting a ride, and goes to `/live`.
- Live with exactly 1 active member (solo, or everyone else has left):
  - the convoy strip is hidden (already true);
  - the sheet summary line is "Solo ride · 42 km/h" (or "Solo ride" when stopped);
  - the "alone" invite block becomes a single secondary row, "Invite riders", so others can still join
    by code;
  - the full map is the **default** the first time a solo ride opens. **Superseded by 22 D6 (2026-10-15): no ride opens in full map by itself; it is the toggle.**
- **Speed bubble** (all rides, follow mode): a 56 dp circle at the bottom-left of the map, above the
  sheet. It shows the current km/h big and "km/h" small, and is hidden when the speed is unknown or
  under 3 km/h. In full map it sits above the floating SOS button.
- Follow camera, heading-up and the blue dot in the Maps theme already exist (spec 18). Solo
  reuses them unchanged.

## D. Bot simulator

`scripts/sim-riders.mjs` gets `--propose <sec>`. At that time Priya proposes a coffee break at a real
café near the route, chosen by calling the `propose_stop` RPC as the bot. This lets the emulator leader
test Accept/Decline.

## Acceptance
- Typecheck, lint and Jest pass. There are new unit tests for: photon response parsing and sorting,
  the debounce/cache helper, the off-route check (re-route trigger), the pending-proposals reducer
  (newest per rider, decided ones removed), and the next-stop card text.
- The migration is applied to project `aqzpdxyckwbxlvqnsnye`, with RLS and grants checked and
  `database.types.ts` regenerated.
- Web (`ride-map.web.tsx`) compiles and draws the stop pin and route. Full map and search work on web.
