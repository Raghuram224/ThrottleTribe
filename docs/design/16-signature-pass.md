# 16 — Signature pass: from "clean" to "crafted" (round 4)

Source: `docs/qa/round3/*`, `docs/qa/round4b/*`, `docs/qa/web/*` (release build + web, dark). Builds on 13–15.
Everything validated there stays: row order, distance-first rows, hold-to-SOS, alert escalation, the SOS
takeover layout, Inter + three weights, grouped surfaces, e1–e3, the brand arrow.
Mockups: `docs/design/mockups/16/*.html` → `png/*.png`, overview `contact-sheet.png`.

**Diagnosis in one line.** 14 fixed the *surface*. What still reads as template is that **nothing on screen
is specific to group riding except the list**. Every screen is a stack of generic cards. The app has no
picture of its core idea (a group strung out along a road), no memory of past rides (a summary with no
route, recent rides with no shape), and no motion (rows jump, chips pop). Strava, Citymapper and Google
Maps each have one or two **signature visuals** that only they could ship. Ours is the **Convoy strip**.

Priority: **P0** = this round (biggest perceived-quality lift) · **P1** = clearly better · **P2** = finish.

---

## 0. Verdict on the lead's observations
| Observation | Verdict |
|---|---|
| (User) Highlight the travelled route like Google Maps | **Agree, P0** (§2.5): casing + brand line, zoom-scaled, above roads and below labels, on Live and Summary. |
| Welcome: flat orange block + green/amber/red tiles = template | **Agree.** Traffic-light tiles also teach status colours as decoration. Replaced by a dark map hero (§1). |
| Home: empty, not *my* app, Start is just a bar | **Agree.** Fix with rider stats, route-shaped recent rides, a live "ride in progress" card, a 3-step first run (§3). The bottom Start button stays (rule 4: primary at the bottom), but it gets the mark and more weight. |
| Live: loud green "Moving" on every row | **Agree, go further:** moving rows get **no chip at all**, just speed in quiet text (§2.2). |
| Live: distance numerals too heavy | **Agree.** 28 bold → 28 **semibold**, unit drops to 18, direction gets an arrow glyph (§2.2). Size stays: glance rule. |
| Msg / End are generic grey tiles | **Half agree.** End moves into the ⋯ sheet (it is used once per ride, and it already lives there). Message stays as a single tonal tile, so SOS gets 70 % of the bar. |
| No motion; rows jump on re-sort | **Agree.** Reanimated layout transitions and a small motion system (§5). |
| Summary is numbers only | **Agree.** Route map hero, stats with average, a ride log timeline, riders card (§4). |
| Dark mode unaudited on native | **Confirmed real bugs** (§6): the dark map style is a *light* basemap; the selected segment is darker than its track. |
| Group-spread visual on live | **Recommend, P0.** It is the signature element (§2.1). |

---

## 1. Welcome — `welcome.png` (P0)
**Problem.** Orange slab + three status-coloured tiles + 40 % empty grey. Looks like a template and says
nothing visual about the product.

**Design.** Full-bleed **ink** screen in both themes (brand moment; Strava and Citymapper do the same).
```
┌ status bar (light content) ─────────────────────┐
│ ┌ notification card (live, RN view) ───────────┐│  top 64, margin 16, radius 16, #161B22 @0.92, hairline
│ │ [⏸ amber 36]  Priya stopped · 2 min     now  ││  title 15 semibold paper · sub 13 textMuted(dark) tabular
│ │               1.7 km behind you              ││
│ └──────────────────────────────────────────────┘│
│      dark map image: orange route, 4 riders,     │  hero image 390×520 dp, faded to ink from y 230→ 380
│      me arrow, one stopped rider                 │
│ [mark 32] Throttle Tribe                         │  18 bold, "Tribe" #FB923C
│ Ride together.                                   │  38/42 bold, tracking −1.2, paper, 3 lines
│ Nobody gets                                      │
│ left behind.                                     │
│ See who's ahead, who's behind and who stopped.   │  16/24 regular #C2C8D0
│ One glance, gloves on.                           │
│ [ Get started ]               primary 60         │
│ [ I have an account ]         ghost paper 52     │
│ No sign-up. Just your name.   13 #8B95A1         │
└──────────────────────────────────────────────────┘
```
- Hero asset: `assets/brand/png/welcome-hero.png` 1170×1560 (@3x of 390×520), rendered from
  `docs/design/mockups/16/bake.html#welcome` (real OpenFreeMap `dark` tiles + route). It is a static image:
  no map SDK on the welcome screen. **Attribution:** bake "© OpenFreeMap © OpenStreetMap" 10 px into the
  bottom-left of the image's faded area (marketing may swap it for an illustration later).
  `resizeMode="cover"`, anchored top. On tall screens the ink below simply grows.
- The notification card is a real view (crisp, translatable), not part of the image.
- Copy (marketing may refine): `welcome.title` "Ride together.\nNobody gets left behind." ·
  `welcome.body` "See who's ahead, who's behind and who stopped. One glance, gloves on." · buttons unchanged.
- Motion: the hero fades in 300 ms; the notification card slides down 12 dp + fades in, 320 ms,
  `Easing.out(cubic)`, delay 500 ms. Reduce motion: static.
- Remove the three feature tiles entirely.
- Files: `src/app/(onboarding)/welcome.tsx`, `src/lib/copy.ts`, new asset.
- Accept: no status-coloured tile on welcome; status bar light; headline ≥ 7:1 (paper on ink is 18:1);
  Get started reachable with thumb (bottom 25 %); looks identical in light and dark system themes.

## 2. Live ride — `live-map.png`, `live-states.png`, `live-map-dark.png`

### 2.1 Convoy strip — the signature element (P0)
**Purpose.** One horizontal picture of the whole group along the route: tail on the left, lead on the
right, me as the brand arrow. In one second it answers "are we together, and who is dropping back?",
which the list (one number per row) cannot.

**Why it is safe on a handlebar.** It is display-only (no taps needed), uses the same avatars and status
rings as the map and list, and has only two numbers (the tail and lead offsets). It replaces the
64 dp Map/List bar, so the screen gets no extra chrome.

```
┌─────────────────────────────────────────────────┐ surfaceRaised, 84 tall, padding 6/16/4, hairlines top/bottom
│ ← Behind          1.8 km spread          Ahead → │ 12/16 semibold textSubtle; spread textMuted tabular
│ (PR)╌╌╌╌╌(ME)───────────────────[➤](AR)────(KA) │ track 4 dp trackLine r2, y 39; dots 26; me arrow 30
│ −1.3 km                                  +500 m │ 12/16 semibold tabular, textMuted (stopped: onStoppedTint, offline: textSubtle)
└─────────────────────────────────────────────────┘
```
- **Data** (new pure fn `src/lib/convoy.ts`, unit-tested): input = the same `relativePosition` results
  live-list already computes. Signed offset: ahead `+d`, behind `−d`, level `±d` (keep sign of the raw
  delta), me `0`. `away` (off-trail) riders are **not** on the track: show a trailing chip
  `+1 off route` (12 semibold, `surface` pill) at the right end. No position yet: not drawn.
- **Scale:** linear from min to max offset; minimum span **500 m** (a tight group must not fill the
  bar). Padding 18 dp each end. Spread label = `max − min`, formatted like row distances. Spread < 200 m:
  label `Riding together` (onMovingTint).
- **Dots:** 26 dp avatar (initials 10.5 semibold white), 2 dp `surfaceRaised` cut-out ring. Stopped:
  + 2 dp `status.stopped` outer ring. Offline: opacity 0.5 + 2 dp dashed `status.offline` ring (never amber,
  rule 2). SOS: 30 dp `sosStrong` with a white `alert` 16 glyph (no initials), red ring + halo
  `rgba(239,68,68,0.22)` 10 dp, pulsing (§5). Leader: no extra mark (too small).
  Me: the brand arrow (leader piece of the mark), 30 dp, white disc, pointing right, always on top.
- **Clusters:** a rider within 24 dp of me is drawn 20 dp from me (avatar stack, overlapping under the
  arrow). Two non-me dots within 18 dp: stack 14 dp apart. 4+ in one cluster: one `surface` bubble `+3`.
- **Gap highlight (P1):** if the largest gap between consecutive riders is ≥ 1 km and ≥ 40 % of the
  spread, draw that segment as a 2 dp dashed `status.stopped` line over the track (5 on / 4 off).
  It is the "someone is dropping back" cue (`live-states.png`, Meena).
- **Ticks:** only the tail and lead offsets, not every rider ("−1.3 km", "+500 m"). If the tail or lead
  is me, omit that tick.
- **Visibility:** shown in Map and List modes, under the header. Hidden when fewer than 2 riders have a
  position (solo state keeps the 14 §1 empty card). Hidden in the SOS takeover.
- **A11y:** one element, `accessibilityRole="image"`, label e.g. "Group spread 1.8 kilometres. 2 riders
  ahead, 2 behind. Priya has no signal." Dots are not focusable.
- **Implementation:** plain `View`s (no SVG). Each dot is an `Animated.View` (reanimated) with
  `left` driven by `withTiming(x, {duration: 600, easing: Easing.out(Easing.cubic)})`. Web: same code.
- Files: new `src/components/convoy-strip.tsx`, `src/lib/convoy.ts` (+ `__tests__/convoy.test.ts`),
  `src/app/(app)/ride/[id]/live.tsx`, `src/lib/copy.ts`.
- Accept: in a 5-rider bot sim the strip order matches the list order; offline never shows amber;
  the me arrow is always visible; 2-rider ride shows both ends with ticks; the strip never overflows 360 dp
  width; no jitter (dots glide).

### 2.2 Rider rows (P0)
```
│ (KA)  500 m ↑ ahead                     64 km/h │  moving: no chip. Speed 14/20 regular textSubtle tabular, unit 12
│       Karthik                                   │
│ (AR)  = With you                        61 km/h │  level: 20/32 semibold + `equal` 20 textMuted
│▌(ME)  900 m ↓ behind        [⏸ Stopped 6 min]  │  filled amber chip 36, 15 semibold, age in the chip
│▌(PR)  ≈1.6 km ↓ behind          ( No signal )   │  OUTLINE chip: surface fill, 1.5 dp status.offline border,
│       Priya · seen 4 min ago                    │  onOfflineTint text; age moves to the sub line
```
- Distance number **28/32 semibold** (was bold), tracking −0.6, tabular. Unit "m"/"km" **18 semibold**, same
  colour, 2 dp gap. Direction **15 regular textMuted** with MDI `arrow-up` / `arrow-down` 16 before it.
  The arrow lets a glance tell ahead from behind without reading.
- Moving: **no chip** and **no tint**. Right side = speed (`{n} km/h`) or nothing when unknown. The calm
  default is what makes exceptions pop.
- Stopped: amber filled chip with the age ("Stopped 6 min": the duration is the alarm). 4 dp left bar (exists).
- Offline: outline chip "No signal" (filled grey looked *disabled*, and read close to stopped at a glance);
  sub line "Priya · seen 4 min ago" (`textSubtle`). Distance keeps `≈`.
- SOS row: unchanged (full `sosStrong` row, white pill "SOS 2 min", white ring on the avatar).
- Me row: replace the orange dot with the **brand arrow** 26 (no disc), "You" 16 semibold, speed 16
  regular textMuted, "Sharing" `check-circle` 16 + 14 semibold `onMovingTint`.
- Dividers inset 68. Rows 72 (unchanged).
- Files: `live-rows.tsx`, `status-chip.tsx` (new `variant: 'outline'` for offline), `copy.ts`
  (`live.seenAgo` "seen {age} ago"), `src/lib/live-list.ts` (speed per rider is already in the data).

### 2.3 Header + Map/List (P0)
- Header 60: back 48 · title 18/24 semibold · sub 13/18 textMuted tabular "1 h 12 min · 5 riders" ·
  **icon segmented control** (track `surface` 44 tall r12, two 48 wide thumbs r9, icons `map` /
  `view-agenda-outline` 22; selected thumb `segThumb` + e1, icon `text`; unselected `textMuted`; hit area
  56 tall) · ⋯ 48. a11y labels "Map view", "List view", `accessibilityState.selected`.
- The full-width Map | List bar (64 dp) is removed; the convoy strip takes its place.

### 2.4 Action bar (P0)
- `[ Message 96×64 tonal, icon 24 over label 12 ] [ ⚠ Hold for SOS — flex, 64, sosStrong, 19 bold ]`,
  gap 12, padding 12/16/8, `surfaceRaised` + e2.
- **End ride leaves the bar.** It stays in the ⋯ sheet (leader: red "End ride" last row; rider: "Leave
  ride"). Result: one red thing at the bottom, and a large SOS hit area (≈ 250 dp wide).
- Files: `live.tsx` (`ActionButton` End removed), `ride-header.tsx`.

### 2.5 Route highlight — "like Google Maps" (P0, user request)
**Problem.** The leader trail is a 5 dp `mapTrail` line at 0.55 opacity (`#111827` light / `#F9FAFB`
dark). It reads as just another road, and on liberty it disappears into the grey motorway casing.

**Design.** One highlighted route: **the group's route = the leader's trail from ride start** (it is
what every "ahead/behind" number is measured along, so the picture and the numbers agree). Two
layers: a darker **casing** underneath and a **brand line** on top, round caps and joins, zoom-scaled.
Drawn **above roads and buildings, below labels**, markers on top (markers are views, so they are
above all layers already). See `live-map.png`, `live-map-dark.png`, `summary*.png`.
- **My own trail is not drawn separately on Live.** On a group ride I'm on the leader's route almost
  all the time; a second line would only add a confusing double stroke. When I'm off route (`away`),
  the map already shows my arrow away from the line, which is the right signal. (Summary is different:
  there the only geometry we have is **my** samples, and the stats are mine, so the summary route is
  my trail. Same visual treatment.)
- Width (line): `['interpolate', ['linear'], ['zoom'], 8, 4, 11, 5, 13, 6.5, 15, 8.5, 17, 11]`
  (≈ 6.5–7 dp at city zoom). Casing: `['interpolate', ['linear'], ['zoom'], 8, 7, 11, 8, 13, 9.5, 15, 12, 17, 15]`
  (always ≈ 1.5 dp each side).
- Colours (new tokens): light `routeLine #F97316` (`brand.primary`), `routeCasing #9A3412` (orange-800,
  4.9:1 against positron's `#F2F2F2`, so the edge holds on light tiles and on white motorways). Dark:
  `routeLine #FB923C` (orange-400, brighter on black), `routeCasing #0B0F14` (ink: cuts the line out of
  grey dark-style roads). Both opacity 1. (`mapTrail` token is retired.)
- **Layer position.** Insert both layers **before the first label (symbol) layer that comes after the
  last road/building layer** of the style, so labels stay readable over the route but roads never draw
  over it. For the OpenFreeMap styles we use: `positron` → before **`waterway_line_label`**, `dark` →
  before **`highway_name_other`**. (Do not use "first symbol layer": in `dark` that is `water_name`,
  which sits *under* the roads, so the roads paint over the route and it looks hollow; caught in the mockups.)
- Start of ride (P1): a 14 dp ink dot with a 3 dp white ring at the trail's first point (dark: paper
  dot, ink ring), only when it is within the viewport; it is a `MarkerView`-style view like the other
  markers, not a layer. No finish marker on Live.
- Direction chevrons: **not recommended** (tried in the mockups at zoom 13–15 with a line-placed `›`
  glyph: too small to read at handlebar distance and visually noisy; direction is already carried by
  the me arrow, the strip and ahead/behind). P2 only, as a sprite icon at zoom ≥ 15.
- P2 idea: the stretch behind the tail rider (everyone has passed it) at `routeLine` opacity 0.45, split
  at the tail's `alongM` (cheap: `projectOntoTrail` already exists).

**Native** (`src/components/ride-map.tsx`, MapLibre RN v11, replaces the single `leader-trail-line` layer;
keep the `GeoJSONSource id="leader-trail"`). Use the v11 layer-ordering prop for "below this layer id"
(check the installed `Layer` props; v10 called it `belowLayerID`, v11 may expose `beforeId`). If none
works, add the layers last (above labels) rather than below roads.
```tsx
const ROUTE_WIDTH = ['interpolate', ['linear'], ['zoom'], 8, 4, 11, 5, 13, 6.5, 15, 8.5, 17, 11] as const;
const CASING_WIDTH = ['interpolate', ['linear'], ['zoom'], 8, 7, 11, 8, 13, 9.5, 15, 12, 17, 15] as const;
const ROUTE_BELOW = { light: 'waterway_line_label', dark: 'highway_name_other' } as const; // per mapStyle

<GeoJSONSource id="leader-trail" data={trailGeoJson}>
  <Layer
    id="leader-trail-casing"
    type="line"
    beforeId={ROUTE_BELOW[scheme]}            /* or belowLayerID, per installed v11 typings */
    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
    paint={{ 'line-color': colors.routeCasing, 'line-width': CASING_WIDTH, 'line-opacity': 1 }}
  />
  <Layer
    id="leader-trail-line"
    type="line"
    beforeId={ROUTE_BELOW[scheme]}
    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
    paint={{ 'line-color': colors.routeLine, 'line-width': ROUTE_WIDTH, 'line-opacity': 1 }}
  />
</GeoJSONSource>
```
(Casing must render first; with the same `beforeId` the later layer goes on top. Verify the order on
device.)

**Web** (`src/components/ride-map.web.tsx`, inside `syncTrail`, re-run on every `style.load` as today):
```ts
function routeBeforeId(m: MlMap): string | undefined {
  const layers = m.getStyle().layers ?? [];
  let lastRoad = -1;
  layers.forEach((l, i) => {
    const src = (l as { 'source-layer'?: string })['source-layer'];
    if ((src === 'transportation' || src === 'building') && (l.type === 'line' || l.type === 'fill')) lastRoad = i;
  });
  return layers.find((l, i) => i > lastRoad && l.type === 'symbol')?.id;
}
const before = routeBeforeId(m);
m.addLayer({ id: 'leader-trail-casing', type: 'line', source: TRAIL_SOURCE,
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': colors.routeCasing, 'line-width': CASING_WIDTH, 'line-opacity': 1 } }, before);
m.addLayer({ id: 'leader-trail-line', type: 'line', source: TRAIL_SOURCE,
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': colors.routeLine, 'line-width': ROUTE_WIDTH, 'line-opacity': 1 } }, before);
```
(The same helper can serve native as a constant table; the computed ids are the ones listed above.
`syncTrail`'s deps become `[colors.routeLine, colors.routeCasing]`; on theme change remove and re-add
both layers.)

**Summary** uses exactly the same two layers on my samples (`summary-route-map.tsx` / `.web.tsx`), with
start (28 dp ink disc, `circle-double`, white ring), finish (28 dp orange disc, `flag-checkered` ink), and
stop / SOS as **small 22 dp pins** (amber `pause` 12 / `sosStrong` `alert` 12, 2.5 dp white ring).
Camera fits the route bounds (§4).

**Accept:** the route reads as the most prominent line on the map in light and dark, at zoom 10–17, on
positron and dark; roads never draw over it; place and road labels stay readable on top of it; markers
are above it; the line is the same width on Android and web; on theme switch the route re-colours.

**P2 option, not designed: planned route to a destination.** Leader sets a destination; the route comes
from a keyless routing service (e.g. the public OSRM demo, rate-limited, fine for a hobby scale; cache
the result per ride). Shown Google-style: **ridden part** = the highlight above, **remaining part** =
same width, `routeLine` at 0.45 opacity with the casing at 0.6, or a 2/1.5 dash; ETA/"km to go" in the
header sub. Needs a "set destination" flow, off-route handling and privacy review (the destination is
shared with members only). Lead to confirm with the user before any design work.

### 2.6 Map (P1)
- Light basemap **liberty → positron** on Live and Summary (quiet basemap, markers pop; the yellow
  liberty roads compete with amber "stopped"). Keep liberty nowhere else. Dark: **`dark`** (see §6).
- FABs 52 circles, `surfaceRaised` + e2: `navigation-variant-outline` (centre on me) above
  `fit-to-page-outline` (show all). Bottom-right 12.
- Me marker = brand arrow 34 on a white disc (14 §1 P1, now required).

## 3. Home — `home-empty.png`, `home-recent.png`, `home-active.png`, `home-recent-dark.png`
### P0
- **Top bar:** mark 28 + "Throttle **Tribe**" 20 bold (Tribe in `brandOnBg`), avatar 40 with the amber
  completeness dot (exists).
- **Ride in progress card** (replaces the resume card when a ride is active):
  ink card in **both themes** (`ink` bg, `inkRaised` surface inside, radius 20, padding 16, light-theme
  shadow `0 8 24 rgba(11,15,20,0.22)`, dark: 1 dp `hairlineOnDark`). Inside, the dark token set applies:
  label row "● RIDE IN PROGRESS" 12 label `#86EFAC` with an 8 dp green dot (pulse §5) + elapsed 14
  tabular right · ride name 22/28 bold · "You're the leader · 5 riders" 14 textMuted · **Convoy strip**
  (326 wide) · one exception line when there is one ("Priya · no signal 1 min" with its status icon; else
  "Everyone is moving") · primary "Back to ride →" 56. When active: hide "Join with a code" and the
  bottom Start button (you can't ride two).
- **Recent rides with route shapes:** row 80: 56 **route sketch tile** (r14, `surface` bg, orange 3 dp
  polyline, start = hollow ink dot, end = filled ink dot) · title 16 semibold · meta 14 textMuted tabular
  "61 km · 2 h 14 min · 5 riders" · date 13 textSubtle top-right. Inset divider 86. "See all" ghost
  `brandOnBg` 14 semibold → `rides.tsx`.
  - Data: when the summary computes my distance it also caches a **simplified polyline** of my samples
    (Douglas–Peucker to ≤ 48 points, normalised to 0..1) next to the cached distance
    (`cacheRideSketch(rideId, pts)` beside `cacheRideDistance`). No sketch cached: show the 56 tile with the
    `flag-checkered` 24 glyph in `textMuted` instead.
  - Render: new `src/components/route-sketch.tsx`, pure RN: each segment is a `View` (height 3, radius 1.5,
    width = segment length) rotated around its start; joints get 3 dp dots. ≤ 48 views per tile, memoised.
- **Start a ride** button: 60 tall, mark 24 (ink, single colour) + "Start a ride" 17 semibold, soft orange
  glow `0 6 16 rgba(249,115,22,0.28)` in light only. 16 dp fade above it (exists).
### P1
- **Stats strip** (only with ≥ 1 cached ride this calendar month): white card e1, three columns divided by
  hairlines: "214 km · This month", "3 · Rides", "7 h 40 · In the saddle". Number 24/28 bold tabular,
  unit 14 semibold textMuted, label 12 textSubtle. Source: cached recent rides (no new query).
- **First run** (no rides ever): replace the history-icon empty state with a "How it works" card: 3
  numbered steps on a 2 dp rail (step 1 circle filled orange; others `surface`). Copy: "Start a ride /
  Name it and pick when to flag a stop." · "Share the 6-digit code / Riders join from WhatsApp or the code.
  No sign-up." · "Ride. Nobody gets lost. / Everyone sees who is ahead, behind or stopped." Greeting
  "Welcome, {name}" + "Your first group ride is three steps away."
- "Have a ride code?" → "Join with a code / 6 digits from the leader" (tile `brandTint`, `dialpad` 22 brandOnBg).
- Emergency-contact nudge becomes one row: tile + title + body + ghost "Add" on the right (no second
  button row; "Later" moves to a swipe-free ✕ 40 hit on the card's top-right only if needed — P2).
- Files: `home.tsx`, `recent-rides-section.tsx`, `recent-ride-row.tsx`, new `route-sketch.tsx`,
  `src/lib/recent-rides.ts`, `src/lib/home.ts`, `summary.tsx` (writes the sketch), `copy.ts`.
- Accept: active ride card shows the live convoy (updates without leaving home); recent rows show the
  real route shape; no history clip-art icon anywhere; one primary button per state.

## 4. Summary — `summary.png`, `summary-dark.png`
### P0
- **Route map hero**, full bleed, 300 dp tall including the status bar (status bar over the map, dark
  content in light, light in dark; 80 dp top scrim `bg`→transparent at 0.9).
  - MapLibre RN v11 (web: maplibre-gl) **non-interactive** (no scroll/zoom/rotate/pitch, no compass, no
    logo; attribution 10 px bottom-left). Camera: fit bounds of my samples, padding top 70 / bottom 56 /
    sides 70, no animation. Follow the source/layer API already used in `ride-map.tsx` / `ride-map.web.tsx`.
  - Trail: my samples (already fetched for the distance), drawn with the **route highlight** of §2.5
    (casing + brand line, zoom-interpolated widths, same layer position).
  - Pins: start/finish 28 dp, stop/SOS 22 dp (§2.5): start = ink disc with `circle-double`; end = orange
    disc with `flag-checkered` ink; stop = amber `pause`; SOS = `sosStrong` `alert`. Stop/SOS pins only when the
    event carries a position (check `docs/architecture.md`; otherwise no pin, the log still lists it).
  - Floating 44 circles (e2): ✕ top-left (= Back to home), `fit-to-page-outline` top-right (re-fit; P1).
  - No samples (< 2) or cancelled ride: keep today's `brandTint` hero card.
- **Sheet** overlaps the map by 24 (radius 24 top, `bg`, e3). Content padding 20/16:
  "🏁 RIDE COMPLETE" label `brandOnBg` · ride name 28/34 bold · "Sun, Oct 12 · 6:04 – 8:18 AM" 14
  textMuted tabular.
- **Stats card** (one card, 3 columns, hairline dividers): "61.0 km · You rode" (28 bold) · "2 h 14 ·
  Time" (22 bold) · "27 km/h · Average" (22 bold; = my distance / ride duration; hidden below 1 km or 5 min).
  Riders/Stops tiles go away (they move to the log and the riders card).
- **Ride log** (timeline card): time 13 textSubtle tabular right-aligned in a 44 column · 14 dp dot on a
  2 dp rail (ink start, amber stop, `sosStrong` SOS, orange end) · title 15 semibold · meta 13 textMuted.
  Rows: "Started · 5 riders" · "Arun stopped / 4 min · km 18" · "Karthik sent SOS / Cleared 7:33 · km 34" ·
  "Ride ended / Location sharing stopped for everyone". "km N" = my distance at that time (from my
  samples); omit if unknown. Replaces the separate SOS/Stops sections and the green "Location sharing
  stopped" card.
- **Riders card:** overlapping 32 avatars (−8 dp) · "5 riders" 15 semibold · "All finished together" /
  "2 left early" 13 textMuted · chevron → expands to today's rider list (left-early detail stays).
- Footer primary "Back to home" (exists). Share (when allowed by `summaryShareVisible`) = tonal 56 square
  icon button left of it.
- Motion: map fades in 300; sheet slides up 24 dp + fades, 320 ms; stat numbers count up (exists, 600).
### P2
- Per-rider distance in the riders list: only if other riders' samples are readable under RLS (privacy
  rule 8). Don't add a query that exposes them.
- Share image (map + stats card) for WhatsApp.
- Files: `summary.tsx`, new `src/components/summary-route-map.tsx` (+ `.web.tsx`), `stat-tile.tsx`
  (→ `stat-row.tsx`), new `ride-log.tsx`, `src/lib/summary.ts` (`buildRideLog`, `distanceAtTime`,
  `averageKmh`, tests), `copy.ts`.
- Accept: the route on the map is the same trail the distance was summed from; log is chronological;
  dark mode uses the dark basemap; no blank map ever (fallback card); screen reader reads stats as
  "61 kilometres you rode, 2 hours 14 minutes, average 27 kilometres per hour".

## 5. Motion system (P0 for rows/press, P1 for the rest)
Reanimated 4.5.1 is installed. All motion respects reduce motion: pass `.reduceMotion(ReduceMotion.System)`
to every layout animation and `reduceMotion: ReduceMotion.System` to `withTiming`; the existing
`useReduceMotion` hook guards the rest. **Never animate the glance number itself, never bounce, no
springs on ride screens.** Easing default `Easing.out(Easing.cubic)`.

New tokens (`motion`): `press: 90`, `release: 160`, `layout: 220`, `enter: 320`, `glide: 600`,
`pulse: 1400`.

| Moment | Spec | Reduce motion |
|---|---|---|
| Live row re-sort | Each row = `Animated.View` with `layout={LinearTransition.duration(220).easing(Easing.out(Easing.cubic))}`; replaces the `LayoutAnimation` opacity fade in `live.tsx` | rows swap instantly |
| Rider joins / leaves | `entering={FadeIn.duration(150)}`, `exiting={FadeOut.duration(120)}` | none |
| Status change (moving→stopped) | chip `entering={FadeIn.duration(150).withInitialValues({transform:[{scale:0.96}]})}`; left bar fades in 150 | instant |
| Convoy dots | `left` → `withTiming(x, {duration: 600})` on every position update | jump |
| SOS dot / SOS marker halo | halo scale 1→1.35 + opacity 0.35→0, 1400 ms, `withRepeat`, while SOS active | static halo |
| "RIDE IN PROGRESS" dot | halo 1→1.8, opacity 0.4→0, 1400 ms loop | static |
| Press (buttons, rows, cards) | scale 0.97 in 90 ms, back in 160 ms + pressed colour (`Pressable` + `useAnimatedStyle`, one shared `PressableScale` component) | colour only |
| Segmented thumb | thumb `left` withTiming 220 | instant |
| Sheet | slide 250 `Easing.out(cubic)`, scrim 200 (exists) | fade 150 |
| Screen transitions | Stack `animation: 'slide_from_right'` (native-stack default) for push; **live → summary `'fade'`** (ending is a state change, not navigation); welcome → name `'fade_from_bottom'` | `'none'` |
| Summary entrance | map fade 300, sheet slide 24 dp + fade 320, count-up 600 (exists) | final state |
| Welcome | hero fade 300, notification card slide 12 dp, delay 500 | static |

Web: reanimated layout animations (`LinearTransition`, `FadeIn/Out`) are supported on web in v4; verify
in the web build. If a transition misbehaves on web, gate it with `Platform.OS !== 'web'` rather than
shipping a broken one. Files: new `src/components/pressable-scale.tsx`, `live.tsx`, `live-rows.tsx`,
`convoy-strip.tsx`, `big-button.tsx`, `card.tsx`, `segmented-control.tsx`, `src/app/(app)/_layout.tsx`,
`src/app/(app)/ride/[id]/_layout.tsx`, `tokens.ts`.
Accept: in the bot sim, overtakes slide rows into place over ~0.2 s; nothing moves with system "Remove
animations" on; no frame drops on a mid-range Android (row transitions run on the UI thread).

## 6. Dark-mode audit (native + web) — P0
Found in `docs/qa/web/05-live.png`, `07-summary.png` and the dark mockups.
| # | Problem | Fix (tokens.ts unless noted) |
|---|---|---|
| D1 | **Dark map is a light map.** `dark.mapStyle` = `positron` (a light basemap): a white slab in a dark screen, glare at night | `dark.mapStyle: 'https://tiles.openfreemap.org/styles/dark'`; light → `.../positron` (§2.6). Route: `routeLine #FB923C` + `routeCasing #0B0F14`, inserted before `highway_name_other` (§2.5) |
| D2 | Selected segment invisible: thumb `surfaceRaised #161B22` sits on track `surface #1F2630` (selected looks *darker* than unselected) | new `segThumb`: light `#FFFFFF`, dark `#343D49`; use in `segmented-control.tsx` and the header switch |
| D3 | Cards have no edge: shadows are off and `#161B22` on `#0B0F14` is a 1.1:1 step | `elevate()` in dark returns `{ borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)' }` for e1 and `0.08` for e2/e3. Sheets: top hairline only |
| D4 | FABs on the dark map disappear (dark disc on dark map) | dark FAB bg `surface #1F2630` + e2 hairline; icon `text` |
| D5 | Map attribution chip `surfaceRaised` @0.85 is fine; marker white outlines stay white in dark (needed on dark tiles) | none, verify |
| D6 | Offline avatar (opacity 0.6) turns rider colours to mud on dark | dark: opacity 0.7 + dashed ring `#6B7280`; keep 0.55 in light |
| D7 | Orange "Tribe"/links: `brandOnBg #FB923C` 8.5:1 ✓. Primary orange buttons ✓ (ink text 7:1) | none |
| D8 | Android system bars: SDK 57 is edge-to-edge; the gesture area under the action bar / footers must be painted by our bottom bars | action bar, footers and sheets extend their bg under `insets.bottom`; `StatusBar style="auto"` except welcome (light) and SOS (light) |
| D9 | `meRowBg`/`brandTint` `#2A1709` reads brown-muddy next to `#161B22` rows | `#24160B` (slightly cooler), text contrast unchanged (paper 17:1) |
| D10 | Toasts use `text` bg (paper in dark): a white slab | toast bg `inkRaised #161B22` + hairline in dark, paper text |
| D11 | Light-only glow on Start button | no glow in dark |
New tokens (both themes): `routeLine` / `routeCasing` (light `#F97316`/`#9A3412`, dark `#FB923C`/`#0B0F14`; replace `mapTrail`), `ink #0B0F14`, `inkRaised #161B22`, `paper #F9FAFB` (palette); `segThumb`,
`trackLine` (light `#D5D9DF`, dark `#3A424D`), `hairlineOnDark rgba(255,255,255,0.08)`,
`stoppedTint/onStoppedTint` (light `#FEF3C7`/`#92400E` 7.0:1, dark `#3A2A08`/`#FCD34D` 10:1),
`onOfflineTint` (light `#374151` 9.2:1 on surface, dark `#C2C8D0`).
Audit procedure for QA: run every screen of the bot sim in dark on the release APK at 50 % and 100 %
brightness; check D1–D11; screenshot into `docs/qa/round5/dark/`.

## 7. SOS — no redesign (guardrail)
Keep the takeover (round4b/04) as is: it is clear and urgent. Only additions: the SOS dot in the convoy
strip and the map halo pulse (§5); the pinned red banner in list mode stays first under the header
(`live-states.png`). **Do not** add the convoy strip, gradients, maps or motion other than the halo
inside the takeover.

## 8. Anti-patterns to remove
1. Status colours used as decoration (welcome tiles, any green/amber/red icon tile that isn't a status).
2. A chip on every row. Quiet default, loud exception.
3. 700 weight on numbers that repeat (row distances). Bold is for one hero number per screen.
4. Full-width grey control bars (Map | List) eating 64 dp of glance space.
5. Two equal grey tiles flanking SOS; rare actions (End) in the always-visible bar.
6. Clip-art empty states (history clock, 48–64 MDI glyphs). Replace with content (steps, sketches).
7. Numbers without context on summary (Riders 5, Stops 2 tiles). Put events on a timeline.
8. Separate green "Location sharing stopped" card: fold into the log's last row.
9. `LayoutAnimation` global fades: rows must move, not blink.
10. A thin grey trail that reads as just another road. Light basemap in dark mode; selected states that are darker than unselected.
11. Orange left accent bars on non-urgent cards (contacts nudge): the tile carries the brand.
12. Text-only wordmark: always mark + wordmark.

## 9. Files touched (summary)
`src/theme/tokens.ts`, `src/theme/use-theme.ts` · new: `convoy-strip.tsx`, `route-sketch.tsx`,
`summary-route-map.tsx` (+`.web.tsx`), `ride-log.tsx`, `stat-row.tsx`, `pressable-scale.tsx`,
`src/lib/convoy.ts` (+test) · changed: `live-rows.tsx`, `status-chip.tsx`, `ride-header.tsx`,
`segmented-control.tsx`, `big-button.tsx`, `card.tsx`, `recent-ride-row.tsx`, `recent-rides-section.tsx`,
`ride-map.tsx`/`.web.tsx` (styles, FABs, me arrow), `toast-host.tsx`, screens `welcome.tsx`, `home.tsx`,
`live.tsx`, `summary.tsx`, layouts (transitions), `src/lib/{copy,recent-rides,summary,live-list,home}.ts`,
`app.json` not needed. Asset: `assets/brand/png/welcome-hero.png`.
**No new dependency.** (react-native-svg not needed: strip and sketches are Views; maps use MapLibre.)

## 10. Ship order
1. P0 tokens + dark fixes D1–D4 (half a day, removes the worst dark bugs).
2. Live: route highlight (§2.5), rows (§2.2), header switch (§2.3), action bar (§2.4), convoy strip (§2.1), row transitions (§5).
3. Summary route map + log (§4).
4. Home: active card with convoy, route sketches, Start button (§3 P0).
5. Welcome hero (§1).
6. P1: stats strip, first-run steps, press motion everywhere, map style switch, gap highlight.

## Acceptance (whole pass)
- [ ] Route highlight (casing + brand line, zoom-scaled) on Live and Summary, native and web, light and dark; never under roads.
- [ ] No "Moving" chip anywhere on live; stopped/offline/SOS each distinct by colour + icon + text.
- [ ] Convoy strip visible in map and list mode, matches list order, offline never amber, glides.
- [ ] End ride only in the ⋯ sheet; SOS button ≥ 240 dp wide on a 390 dp phone.
- [ ] Summary shows the ridden route on a real map in light and dark; fallback card when no samples.
- [ ] Recent rides show route sketches; home shows the live convoy while a ride is active.
- [ ] Welcome has no status-coloured tiles; ink hero in both themes.
- [ ] Dark: dark basemap, visible segment thumb, card hairlines, no white toasts.
- [ ] Reduce motion on: no movement anywhere except instant state changes.
- [ ] `npx expo lint` and `npx tsc --noEmit` clean; new pure fns unit-tested; web build checked.
