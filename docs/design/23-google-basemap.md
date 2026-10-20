> **Superseded 2026-10-16: the app stays on OpenStreetMap; see decision note.** Throttle Tribe must stay free, so Google Maps was removed and every platform uses MapLibre + OpenFreeMap with the OSM attribution chip. Kept below for history only; do not implement. The free OSM stack that replaces it is `24-free-osm-stack.md`.

# 23 — Google maps on phones: Map or Satellite

Source: user decisions (final), 2026-10-15, revised the same day after reading Google Maps Platform Terms §3.2.3(e)
("…will not use the Google Maps Core Services with or near a non-Google Map…"). Builds on 17 (Tribe/Maps), 20 (live
controls), 22 (map home).

**Overturns, on native only:** 17 §0 "the UI never says Google", 17 §3 and 22 §4.1 (OpenFreeMap tiles) and 22 "no
Google tiles or APIs". **Web is unchanged** (OpenFreeMap / MapLibre, OSM chip, no picker).

**Purpose:** on Android and iOS every map (Home browse / place / route, live ride, summary) is a Google map (native
Google Maps SDK through `react-native-maps`, `provider={PROVIDER_GOOGLE}`). The rider picks **Map** (Google roadmap),
**Satellite** (Google hybrid: photo + road labels) or **Terrain** (Google terrain: relief and contours), and can
switch the **Traffic** overlay on top of any of them.
**One-second glance:** unchanged on every map. The basemap must never make a route, marker or status harder to read.

**Developer fallback (not a product state):** a native build without a Google key renders today's MapLibre maps with
no picker and no Google strings. EAS `preview` / `production` profiles must fail the build when the key is missing, so
this never ships.

## 1. Where the choice lives
| Entry | Control | Why |
|---|---|---|
| **Profile → Appearance → Map type**, between Style and Light or dark | The three picture cards (as the sheet) + the Traffic switch row | The setting's home. Three segments do not fit at 360 dp ("Satellite" + check at 16 semibold), so cards |
| **Map home, browse mode:** layers button, `top: chipsBottom + space.md` (no chips: `barBottom + space.md`), `right: space.md` | Opens the Map type sheet | Used at rest; the familiar position; Home's right edge is empty (22 §3.1.1), and browse has no pins, so no camera padding is needed |
| **Live ⋯ menu → Map type**, row above Leave / End ride | Opens the same sheet | Lets the rider switch at a rest stop. Nothing on the live map |
| Summary | None | Read-only; follows the setting |

- **No on-map entry in a live ride:** 20 C1 caps the right column at two 56 circles (plus voice while navigating).
- Layers button: 56 circle, `fabBg`, e2, icon `layers` (`layers-outline`) 24 `fabIcon`, label `map.layersA11y`.
  Hidden when the sheet is expanded and in place / route modes.
- Two options would also fit a toggle button, but a single icon toggle hides which state it shows. A sheet with two
  pictures is unambiguous, and it costs one extra tap at rest.
- Stored per device: `STORAGE_KEYS.basemap = 'pref.basemap'`, `'map' | 'satellite' | 'terrain'`, default `map`; unknown → `map`
  (`parseBasemap`, tested). Traffic: `STORAGE_KEYS.mapTraffic = 'pref.mapTraffic'`, `'1' | '0'`, default off; an independent
  overlay (`showsTraffic`) on any map type. Applies immediately to every mounted map.

### 1.1 Map type sheet (`BasemapSheet`)
```
┌────────────────────────────────────────┐ Sheet (00 §2.8), padding 16
│ Map type                          (✕)  │ 20 semibold · Close 56
│ ┌─────────────────┐ ┌─────────────────┐│ 3 radio cards, gap 8, width (W−32−16)/3 ≈ 104 at 360
│ │ [thumb       ✓] │ │ [thumb        ] ││ thumb full width × 72, radius 12
│ │ Map             │ │ Satellite       ││ 16 semibold, 1 line
│ │ Road map        │ │ Photo and roads ││ 12 regular textMuted, 1 line
│ └─────────────────┘ └─────────────────┘│ card radius 16, padding 8
│ Satellite looks the same day and night.│ 14 muted, only in dark scheme + Satellite / Terrain
│ [traffic] Traffic                 (o ) │ Switch row, 64 tall; hint 12 muted
└────────────────────────────────────────┘
```
- Selected: 2 dp `accent` ring + check badge 20 (`accent` disc, `check` 14 `onAccent`). Unselected: 1 dp `borderStrong`.
  Tap = apply at once, haptic `selection`, press scale 0.97; the sheet stays open; it closes on ✕, scrim or Android back.
- Cards: Map, Satellite, Terrain, in that order. The Traffic row sits under them; a switch applies at once, haptic
  `selection`. Terrain sub-text is `map.terrainSub` ("Relief map"): 12 px must fit one line in a 104 dp card.
- Thumbnails are drawn with `View`s (no Google screenshots, no logo), from the `basemapThumb*` tokens (§4). The Map
  thumbnail follows the scheme.

### 1.2 Style row (17 §4) on native
- Hint `profile.styleHint` becomes **"Changes the app and route colours. Alert colours never change."** Web keeps
  `profile.styleHintWeb` "Changes the colours and the map. Alert colours never change."
- The Tribe / Maps thumbnails draw their mini map from the `basemapThumbMap` tokens for the current scheme (the real
  basemap), not from `mapPreview*`. Web keeps `mapPreview*`.

## 2. How style and scheme drive a Google map
Tribe/Maps controls the chrome and the route and marker colours. Light/dark picks the Google light or Night style.
Map components read `resolveMapColors(style, scheme, basemap)`, which returns the normal tokens plus these overrides:

| Key | Google light | Google dark (Night) | Satellite (any scheme) |
|---|---|---|---|
| `routeLine` / `navRoute` | = light tokens | = dark tokens | Tribe `#EA580C` / `#2563EB` · Maps `#1A73E8` / `#1A73E8` |
| `routeCasing` / `navRouteCasing` | = light tokens | **`#0B0F14`** | `#FFFFFF` |
| **NEW** `routeHalo` | none | none | `rgba(11,15,20,0.8)`, under the casing |
| `meMarker` / `meHalo` | light tokens | dark tokens | light `meMarker`; halo `rgba(255,255,255,0.22)` |
| Rider markers, `StopPin`, summary pins | today's tokens + 2 dp white outline | dark tokens + white outline | light tokens + white outline **+ 1 dp `markerStroke` `#111827` outside it** |

- Widths (fixed dp; Google lines don't scale with zoom): ride route 7 / casing 11, nav route 6 / casing 9, halo = casing + 4.
  Draw order: halo, casing, line, then markers (Google always draws markers above lines). Lines sit above Google's
  labels: accepted.
- **Contrast** (rule: the line or its casing is ≥ 3:1 on every surface it crosses):
  - *Light* (land ≈ `#F5F5F5`, highways ≈ `#FDE293`): the Maps blue line is 4.1:1. The Tribe orange line is 2.6:1, but its
    casing `#9A3412` is 6.7 / 5.7:1. The light tokens were tuned on liberty, which has a very similar palette.
  - *Night* (land `#242F3E`, highways `#746855`): on land the lines are 5.3–6.4:1, but on highways they drop to 2.2–2.6:1.
    The old Maps-dark casing `#1B3A6B` is only 2.1:1 there, so the casing becomes `#0B0F14` (3.5:1).
  - *Satellite* (dark imagery with bright patches): the white casing is ≥ 6:1 on vegetation and asphalt, and the 80 % halo
    keeps ≥ 3:1 on sand or concrete. Against the white casing the blue line is 4.5:1 and `#EA580C` is 3.6:1 (brand
    `#F97316` would be 2.8).
- **Style JSON** (`customMapStyle`, roadmap only; Satellite is never styled):
  - Light: Google default, plus two declutter rules: `poi.business` visibility off, `transit` `labels.icon` off.
  - Dark: Google's standard **Night** sample from the Maps SDK styling docs (geometry `#242f3e`; labels fill `#746855`,
    stroke `#242f3e`; roads `#38414e` / stroke `#212a37`; highways `#746855` / `#1f2835`, labels `#f3d19c`; parks
    `#263c3f`; water `#17263c`; POI and locality labels `#d59563`), plus the same two rules. Files:
    `map-styles/google-{light,night}.json`.
- **Terrain:** Google styles only the road map, so Terrain (like Satellite) ignores `customMapStyle` and stays pale in the
  dark scheme. It uses the light route and "me" colours (`resolveMapColors`, no halo): the light casings (`#9A3412`,
  `#1E3A8A`, `#185ABC`) are dark enough on its pale green / beige. Needs a device check.
- **Switching** Map ↔ Satellite ↔ Terrain or light ↔ dark changes `mapType` (`standard` / `hybrid` / `terrain`) and `customMapStyle` on the
  **same** `MapView`. There is no remount, so the camera (centre, zoom, bearing, tilt, follow / free / overview) doesn't move.
- **Zoom:** the shared constants (`HOME_ME_ZOOM`, follow 16.5, …) and the stored `pref.homeCamera` stay in MapLibre zoom.
  The native adapter converts with `toGoogleZoom(z) = z + 1` (tested).
- Always set to false: `showsUserLocation`, `showsMyLocationButton`, `showsCompass`, `toolbarEnabled`, `showsIndoors`,
  `showsTraffic`. Our `MeMarker` is the only me dot. One map view at a time (22 §4.3) still holds.

## 3. Logo, attribution and credits
- Google draws its logo (bottom-left) and its data credits. **Nothing of ours covers them.** `mapPadding = { top: topInset,
  bottom: visible sheet / panel / action-bar height (full map: nav bar inset), left: 0, right: 0 }`. On Google this padding
  **is** the camera padding; don't pass it again to `animateCamera`.
- Padding updates when a snap is decided (gesture release or tap), not on every frame. During a drag the logo may pass under the
  moving edge for the animation only (≤ `motion.layout`). In free camera a snap change shifts the view by half the height
  change: accepted. With Home's sheet expanded (no map visible) the padding stays at the peek value.
- Clearances on native: `LOGO_CLEAR = 44` (8 + 28 + 8) for the me slot, the speed bubble and the floating SOS (web keeps 36).
  The right column's `bottom` moves from 12 to 44, because credits can sit bottom-right. The auto-hide thresholds become right
  column `mapVisH < 208` and me slot `< 112`.
- **No OSM chip on native**: not the Home pill, not the expanded-sheet footer, not the live pill.
- **Route credit** `map.routeCredit` "Route: OSRM · © OpenStreetMap", 12 regular `textMuted`, a 32 dp row at left 16,
  shown wherever a road route (OSRM, not the dashed straight line) is drawn:
  - the last line of the Home route panel;
  - the last row of the live group sheet, inside `listContentH`. It is not visible at `collapsed`: accepted;
  - under the invite row in the solo panel. The panel becomes 168 with a stop; `soloSheet()` adds 32 when a route is drawn.

  The summary shows the GPS track only, so it has no credit.
- **Search credit**: `search.attribution` becomes "Search: © OpenStreetMap (Photon)", 12 muted, as the last row of the
  results list on `/where-to` and `/ride/[id]/search`, on web too. It is never drawn on the map.

## 4. States
| State | Behaviour |
|---|---|
| Web | OpenFreeMap / MapLibre as today; no picker, no layers button, no ⋯ row |
| Native, no key (dev) | MapLibre fallback; no picker, no Google strings |
| Viewer offline | Offline banner first (unchanged). Google shows its cache and blank tiles elsewhere; markers, routes and lists keep working |
| Google fails (no `onMapLoaded` within 10 s while online: bad key, quota, no Play services) | Home: the existing `homeMap.mapFailed` line on `bg`; everything else works. In a ride: nothing new (no extra elements at speed) |
| Switch from ⋯ in a live ride | Same view, new `mapType`. Sheet snap, banners, SOS and the turn banner don't move |
| Satellite + dark scheme | Imagery doesn't change at night; chrome stays dark; the sheet shows `map.satelliteNight`. No auto-switch. P2, if night QA reports glare: a 25 % black dim polygon under the lines |
| Leader vs rider | Identical; the setting is per device |

**Tokens:** `resolveMapColors` + `routeHalo` (§2); thumbnail-only `basemapThumbMap.light = { land '#F1F3F4', road '#FFFFFF',
major '#FDE293', water '#AADAFF', park '#C8E6C9' }`, `.dark = { land '#242F3E', road '#38414E', major '#746855', water
'#17263C', park '#263C3F' }`, `basemapThumbSat = { land '#3B4A32', field '#5C5A3E', water '#1F3A4A', road '#E5E7EB' }`;
icon `layers: 'layers-outline'`.

## 5. Copy (`src/lib/copy.ts`; ✎ = marketing may refine)
| Key | Text |
|---|---|
| `map.typeTitle` / `profile.mapTypeLabel` / `live.menuMapType` | Map type |
| `profile.mapTypeHint` | Used on every map in the app. |
| `map.layersA11y` / hint `map.layersHint` | Map type / Choose a road map, satellite or terrain. |
| `map.map` / `map.mapSub` ✎ | Map / Road map |
| `map.satellite` / `map.satelliteSub` ✎ | Satellite / Photo and roads |
| `map.mapA11y` / `map.satelliteA11y` | Road map, by Google / Satellite photo with road names, by Google |
| `map.terrain` / `map.terrainSub` ✎ | Terrain / Relief map |
| `map.terrainA11y` | Terrain map with hills and contours, by Google |
| `map.terrainNight` ✎ | Terrain looks the same day and night. |
| `map.traffic` / `map.trafficHint` / `map.trafficA11y` | Traffic / Live road traffic on any map type. / Traffic layer |
| `map.satelliteNight` ✎ | Satellite looks the same day and night. |
| `map.routeCredit` | Route: OSRM · © OpenStreetMap |
| `search.attribution` (changed) | Search: © OpenStreetMap (Photon) |
| `profile.styleHint` (changed) / `profile.styleHintWeb` | Changes the app and route colours. Alert colours never change. / Changes the colours and the map. Alert colours never change. |
Native, Google only: `live.attribution` and `live.attributionRoute` are not used.

## 6. Accessibility
The sheet cards form a `radiogroup` labelled "Map type"; each card is a `radio` with `checked` (ring + check badge, not
colour alone). The Profile segmented control works as today. The Google map view is hidden from screen readers, like
today's maps. `maxFontSizeMultiplier` 1.3 on card text and the credit rows. All targets ≥ 56. Contrast in §2.

## 7. Telemetry
`'map.basemap_changed', // basemap: map | satellite | terrain; from: home | ride_menu | profile`. Sent only when the
rider picks a different option. `'map.traffic_toggled', // on: boolean; from: home | ride_menu | profile`, only on a real change.

## 8. Terms notes (Google Maps Platform Terms, read 2026-10-15)
- **§3.2.3(e), no Google map with or near a non-Google map:** native is Google-only. Never show OpenFreeMap tiles or a
  MapLibre view in a native build that has a key. The no-key fallback must never ship (build guard, top of spec).
- **§3.2.3(d)(iv):** this bans combining the Directions API, the Geolocation API and the Maps SDK into Google-Maps-like
  navigation. We route with OSRM; **never add Google's Directions API** to turn-by-turn.
- **§3.2.3(a)(iv), no text-to-speech of Google Maps Content:** voice (21) reads only OSRM instructions and our own strings.
  **Never pass Google-derived text** (map labels, Google place data) to TTS.
- The logo and credits stay visible (§3). No caching of Google tiles beyond what the SDK does itself.
- **A lawyer reviews this before public launch.**

## 9. Acceptance checklist (Moto phone, Google key build)
- [ ] Home, route preview, live and summary are all Google maps; no OpenFreeMap tiles or OSM chip anywhere on native.
- [ ] Profile → Map type (Map | Satellite | Terrain cards + Traffic), Home browse layers button, live ⋯ → Map type; the live map has no new button.
- [ ] A choice applies at once on every map, keeps the camera exactly (no jump, follow stays follow, the overview ring stays), and survives a cold start.
- [ ] Terrain: renders `terrain`, no Night styling in dark; route and markers readable on its pale green / beige. Traffic switch shows live traffic on Map, Satellite and Terrain and survives a cold start.
- [ ] Light → Google light style without business POIs; dark → Night; casings `#0B0F14`; route visible on a highway at zoom 12–15.
- [ ] Satellite: white casing + dark halo; route readable over fields, a city and sand / concrete; markers have the white + dark outline.
- [ ] Google logo and credits visible at every snap (Home peek / place / route; live collapsed / half / expanded; solo panel; full map with the floating SOS), never under the speed bubble, Re-centre, the right column or SOS.
- [ ] Route credit shows under every OSRM route (Home panel, live sheet, solo panel); search credit is the last row of the results.
- [ ] Our me dot only (no Google blue dot, My Location button or toolbar on a marker tap).
- [ ] Airplane mode: offline banner first. Bad key: Home shows `homeMap.mapFailed`; a ride shows nothing new.
- [ ] Web unchanged (OpenFreeMap, OSM chip, no picker); the no-key native dev build shows MapLibre and no Google strings; the production profile fails without a key.
- [ ] `map.basemap_changed` fires once per change with the right props.
- [ ] `npx expo lint`, `npx tsc --noEmit`, Jest (`parseBasemap`, `resolveMapColors`, `toGoogleZoom`, `soloSheet` with credit) clean.

## 10. Files (engineer)
`ride-map.tsx`, `plan-map.tsx`, `summary-route-map.tsx` (Google path; MapLibre kept for no-key and `.web.tsx`),
`map-controls.tsx` (clearances), `live.tsx` / `live-sheet.tsx` / `lib/live-sheet.ts` (padding, credit row, thresholds),
`home.tsx` / `route-panel.tsx` (layers button, credit), `ride/[id]/_layout.tsx` (⋯ row), `place-search-view.tsx`
(credit row), new `basemap-sheet.tsx`, `profile.tsx`, `style-picker.tsx` (thumb map colours), `prefs-store.ts`,
`storage.ts`, `tokens.ts`, `map-styles/google-{light,night}.json`, `copy.ts`, `icon-names.ts`, `telemetry/events.ts`, new
`app.config.ts` (wraps `app.json`; key from EAS env, never in git; build guard). New dependency: `react-native-maps` via
`npx expo install` (dev build required).
