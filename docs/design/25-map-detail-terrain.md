# 25 — Map detail and terrain (hillshade, more places, richer roads)

Source: user request, 2026-10-20: *"improve the map UI and UX, add more details and terrains to the map."* Decisions given
with the brief (not re-opened here): terrain = **2D hillshade** only; terrain is **opt-in** through a **Standard / Terrain**
toggle (riders on slow or costly mobile data must never be forced to download elevation tiles); **all four** detail groups
(rider POIs, natural features, richer roads, buildings and landuse); 3D buildings stay off; **free only**, on the spec 24
stack (spec 23, Google, stays superseded).

Builds on 17 (styles, thumbnails), 20 C1 (map controls, declutter), 21 (live camera, tilt), 22 (map home), 24 (tuned
OpenFreeMap styles, L1–L7 / D1–D2, credits). Continues 24's rule numbering: **L8–L18** (`tt-liberty`), **D3–D11** (`tt-dark`).
Code read: `src/lib/map-style-tune.ts`, `src/lib/map-styles.ts`, `scripts/build-map-styles.mjs`,
`assets/map-styles/tt-liberty.json` + `tt-dark.json` (every layer), `src/components/map/maplibre-map.tsx`,
`src/components/ride-map.tsx` + `.web.tsx`, `src/components/summary-route-map.tsx`, `src/components/map-controls.tsx`,
`src/components/map-credit-pill.tsx`, `src/components/credits-sheet.tsx`, `src/components/style-thumbnail.tsx`,
`src/lib/credits.ts`, `src/lib/live-chrome.ts`, `src/store/prefs-store.ts`, `src/app/(app)/profile.tsx`,
`src/theme/tokens.ts`, `src/lib/icon-names.ts`, `src/lib/telemetry/events.ts`, `src/lib/copy.ts`,
`node_modules/@maplibre/maplibre-react-native` (11.5.0: `RasterDEMSource`, `Layer`, `android/gradle.properties`,
`MapLibreReactNative.podspec`).
Checked 2026-10-20 (sources in §1.7): Mapterhorn (site, data access, TileJSON, attribution.json, privacy policy, README),
AWS Terrain Tiles registry + Tilezen joerd docs (formats, use-service, attribution), OpenFreeMap home page, MapLibre style
spec (sources, layers: hillshade SDK table), maplibre-native issue #58 (WebP), OpenMapTiles schema + `poi.yaml`,
`poi/mapping.yaml`, `transportation.yaml`, `mountain_peak.yaml`, `park.yaml`, OpenFreeMap sprite `ofm_f384/ofm.json`;
two real DEM tiles downloaded and measured.

**Constraints kept:** $0 and no Google (24). Status = colour + icon + text; nothing on the map may look like a status.
Targets ≥ 56 dp. Viewer offline is said first. SOS reachable everywhere. **24's map rule:** the route line and the rider
markers are always the strongest things on the map. **20's rule:** one fact, one place; one control per job; nothing new
floats over the live map.

---

## Decisions in this spec (designer, for the user to confirm; open questions in §14)

| # | Question | Decision |
|---|---|---|
| T1 | Where does the Standard / Terrain toggle live? | **Home map** (all three modes): one 56 dp map-type circle, top-right, under the chip row; it opens a small **Map type** sheet. **Also Profile → Appearance → Map type** (same setting). **Not on the live map.** The live right column holds two circles at most (20 C1, `live-chrome.ts`: full map + fit-all, or full map + voice); a third circle would make it hide more often on short maps; and picking a map type is not a one-second task at speed |
| T2 | Persist? | **Yes.** `pref.mapLayer` = `'standard'` (default) \| `'terrain'`, kept across launches. Not cleared at sign-out (it is a display preference, not location history) |
| T3 | Terrain during a live ride? | **Yes, when the rider chose it** (the user's lean, adopted). Why it is safe: the shading sits **under every road**, is **faintest at the live follow zoom** (16.5), and DEM tiles stop at z12, so a ride costs about 2 MB an hour (§1.5). §3.4 sets hard limits so the route and markers stay strongest |
| T4 | Which maps show terrain | Home (browse, place, route preview), live, ride summary. **Not** the welcome hero or the style / map-type thumbnails |
| T5 | How the hillshade gets into the map | **Injected at run time, only while Terrain is on** (a `RasterDEMSource` + `hillshade` layer as map children on native, a `syncHillshade()` helper on web). **Not** baked into the bundled styles (§13.1 explains, and the rejected options) |
| T6 | DEM provider | **Mapterhorn** (Copernicus GLO-30 over India, terrarium WebP 512 px, Cloudflare). **Fallback: AWS Terrain Tiles** (terrarium PNG 256 px), switched by one constant (`EXPO_PUBLIC_DEM_PROVIDER`), shippable as an OTA update. Mapterhorn publishes **no terms of use**: confirm production use before public launch (§14.1) |
| T7 | Hillshade method | `standard` method (the default) on every platform: a single light from **335°**, **viewport-anchored**, so the relief never inverts when the live map turns heading-up. The newer methods (`multidirectional`, `igor`) exist natively but are not used (§1.2) |
| T8 | Things the free tiles do not have | **Waterfalls**: not in the OpenMapTiles schema (no `waterfall` in `poi` or `waterway`), so they are **not feasible** as a category; named attractions (often how "… Falls" are tagged) appear instead. **Dhabas**: no cuisine field in the tiles, so they stay **restaurants** (icon + name, already drawn). **Ghat roads / hairpins**: no tag; made readable through road widths, label rules and terrain context, not a special symbol. **NH vs SH**: same generic shield, told apart by the ref text ("NH48", "SH17") |
| T9 | Icons missing from the OpenFreeMap sprite | Use sprite stand-ins plus a text fallback for unnamed places: ATM → `bank`, mechanic → `car`, viewpoint → `attraction`, peak → `mountain`. Custom icons are a later step (§14.3) |
| T10 | Dark map readability (emulator: dark roads too faint) | **Lift the dark road palette** (D3; minor roads 1.1:1 → 1.5:1, major edges 1.6:1 → 2.7:1, motorway edges → 3.4:1), brighter road names (D4), and **fix dark forests**, which today draw **nothing** because the style asks for a `wood-pattern` image the sprite does not have (D5) |
| T11 | Which earlier removals are reversed | **Only part of L3** (the rider POI whitelist gets 3 classes + 2 subclasses). **L1 (3D buildings) and L2 (`poi_r7`, `poi_r20`, `poi_transit`) stay removed.** Found while checking: removing `building-3d` also removed **all buildings from z14 up**, because upstream draws flat buildings only up to z14; L17 restores the flat footprints (no 3D). §4.1 |
| T12 | Credits | While terrain is shown, the map pill gets one more line, **"Terrain © Mapterhorn"**; the Credits sheet gets a seventh row with the Copernicus line. §5 |

---

## 0. Summary

**Purpose:** a map that tells a rider more about the road ahead (hills, ghats, unpaved stretches, where fuel, ATMs,
mechanics and a bed are) without ever out-shouting the riders or the route.

**One-second glance (unchanged, 20 / 21 / 24):** 1. anyone in trouble → 2. where each rider is → 3. next turn / distance
to the stop. **New for this spec:** terrain and the new places are **context**, read at rest (Home, route preview, summary)
or in a stop, never at speed. At handlebar distance the rider still sees the route line first, the markers second, then
the roads.

### 0.1 Goals
1. Terrain shading a rider can switch on, that costs nothing when off and little when on.
2. More rider places on the map: ATM, mechanic / bike shop, lodging, viewpoint, place of worship (and dhabas, as restaurants).
3. Natural features: peaks with height, viewpoints, forests, national parks and protected areas, with readable labels.
4. Roads: NH / SH refs readable on both maps, unpaved stretches marked, ghat roads and hairpins readable.
5. Towns readable: buildings back from z14 up, built-up areas tinted.
6. A dark map whose roads and forests are visible at night.

### 0.2 Non-goals
- 3D terrain (`terrain` / tilted relief), 3D buildings, contour lines, hypsometric colour (`color-relief`): future options
  only (§14.7).
- Offline map packs or pre-downloading terrain for a route.
- A separate "bike route" profile (24 §3.1 stays: routes are car routes).
- Changing the route, marker, pin or status tokens (24 §1.6 unchanged).
- A map-type control on the live screen (T1).
- Auto-switching terrain by network type (Android cannot tell us reliably whether a connection is metered; the rider chooses).

---

## 1. Feasibility (research, 2026-10-20)

### 1.1 Free DEM tiles for hillshade
| | **Mapterhorn** (chosen) | **AWS Terrain Tiles** (Mapzen / Tilezen joerd; fallback) | OpenFreeMap |
|---|---|---|---|
| Tile URL | `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp` (TileJSON `https://tiles.mapterhorn.com/tilejson.json`) | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` (EU copy: bucket `elevation-tiles-prod-eu`) | **No DEM.** Only the Natural Earth shaded-relief raster `natural_earth/ne2sr` (z0–6), which Liberty already draws to z7 |
| Encoding · size · format | **terrarium** · **512 px** · WebP, lossless (`VP8L` chunk, checked on a real tile) | **terrarium** · 256 px (S3 has only 256 for terrarium / normal) · PNG | — |
| Max zoom | Global planet file z0–12; z13–17 only where finer national data exists. The TileJSON states **no maxzoom** (MapLibre would assume 22). Over India the only source is GLO-30, so we cap the source at **z12** | z0–15 for 256 px tiles ("Requests beyond these return a 404") | — |
| India coverage and quality | **Copernicus GLO-30**, 30 m, TanDEM-X 2011–2015: the only India entry of 151 sources. Recent, fewer voids in steep Himalayan / Western Ghats terrain. It is a surface model (canopy and buildings included): invisible at our exaggeration and z12 cap | SRTM 30 m (2000) with GMTED2010 / ETOPO1 fill. Older, with known voids on steep slopes that are filled with coarser data | — |
| Terms | Code BSD-3. Data "various open-data sources". **No terms of use, fair-use policy or SLA published** (site, data-access page, README, privacy policy checked). The privacy policy logs source IP, path, user agent and so on for up to 30 days; Cloudflare PoP logged (Cloudflare has Indian PoPs) | Registry page: no licence text beyond the attribution page, "No AWS account required". joerd: *"The S3 tiles are meant for efficient networking with EC2 resources only"*, *"not cached using Cloudfront"*. us-east-1 from India ≈ 250 ms per request | Free, commercial use allowed, no limits stated (24) |
| Attribution | TileJSON: `<a href='https://mapterhorn.com/attribution'>© Mapterhorn</a>`. India source producer line: "DLR e.V. 2010-2014, Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA." (licence "COPERNICUS full, free and open license") | Per-source lines; for India: "SRTM data courtesy of the U.S. Geological Survey", "GMTED2010 data courtesy of the U.S. Geological Survey", ETOPO1 (NOAA NCEI). The old hosted service also asked for "Mapzen" | — |
| Production app use | **Not addressed.** It is a public service built for web maps (the README's migration snippet is from AWS). Ask the maintainer (§14.1) | **Not addressed**; the docs discourage direct client use (EC2 note) | — |
| Measured tile, Western Ghats (Kodagu), z12 x2909 y1905 | **114.3 KB** (512 px) | **45.8 KB** (256 px, the same ground at half the detail; the same detail needs four z13 tiles, ≈ 180 KB, estimate) | — |

**Pick: Mapterhorn.** Newer and better DEM for India, a quarter as many requests (512 px), about 35 % fewer bytes than AWS
256 px PNGs at the same detail (114 vs ≈ 180 KB), served through a CDN with Indian edges, and built for exactly this use.
**Fallback: AWS Terrain Tiles** (the same terrarium encoding, so only the URL, `tileSize` 256 and `maxzoom` 13 change; z13 at
256 px gives the same ground detail as z12 at 512 px). The switch is one constant in JS (§13.3), so it ships as an OTA update
without regenerating styles. **Blocker for public launch, not for building:** Mapterhorn's terms (§14.1).

### 1.2 MapLibre support (`raster-dem` + `hillshade`)
| Engine | Version in this app | `raster-dem`, `terrarium` | `hillshade` layer | `hillshade-method`, multi-light | WebP DEM |
|---|---|---|---|---|---|
| MapLibre Native Android | **13.6.1** (`maplibre-react-native` 11.5.0 `android/gradle.properties`, `nativeVariant=opengl`) | yes (since 6.0.0) | yes (since 6.0.0) | yes (since 13.0.0) | decoded by the platform (minSdk 24); **verify on device** (§12) |
| MapLibre Native iOS | **6.31.0** (`MapLibreReactNative.podspec` `$MLRN_NATIVE_VERSION`) | yes (since 6.0.0) | yes (since 4.0.0) | yes (since 6.24.0) | yes (maplibre-native #58, closed as completed) |
| maplibre-gl JS (web) | **^5.24** | yes (0.43.0) | yes | yes (5.5.0) | yes (browser) |
| maplibre-react-native 11.5 | `RasterDEMSource` (`tiles`, `tileSize`, `minzoom`, `maxzoom`, `encoding: 'mapbox' \| 'terrarium'`); `Layer` takes any `LayerSpecification`, hillshade included; `HillshadeLayerStyle` exported | | | prop pass-through for the new properties **not verified**, hence T7 | |

Caveats that shape the spec:
- `encoding: 'custom'`, `resampling` and `global-state` are **not** supported natively: not used.
- Every hillshade paint property is zoom-interpolatable, but the layer has **no opacity property**. Strength by zoom comes
  from `hillshade-exaggeration` and the **alpha** of the shadow, highlight and accent colours (§3.3).
- Hillshade needs neighbouring DEM tiles to shade tile edges. While neighbours load, a faint seam can show for a moment
  (accepted; it settles in under a second on 4G).
- Using the TileJSON `url` would leave `maxzoom` at 22 and make the engine ask for z13+ tiles that do not exist over India
  (404 → holes). **Use `tiles` + `maxzoom: 12`.**

### 1.3 OpenMapTiles fields in the OpenFreeMap planet tiles (schema unmodified, per OpenFreeMap)
| Want | Tile data | In upstream Liberty? | In upstream Dark? | This spec |
|---|---|---|---|---|
| Peaks with height | `mountain_peak`: `class` peak / volcano / saddle / ridge / cliff / arete, `ele` (metres), `ele_ft`, `rank` (1 = most important in the tile), names | **no layer** | no layer | new L10 / D10 |
| ATM | `poi` class **`atm`** (subclass `atm`) | filtered out by L3 | no POIs at all | L8 / D9 |
| Mechanic / bike shop | `poi` class **`car`** with subclass **`car_repair`** (class `car` also holds `car`, `car_parts`, `taxi`); `shop=motorcycle` → class **`shop`**, subclass **`motorcycle`** | filtered out (L2 removed `poi_r7`/`poi_r20`; L3 whitelist) | none | L8 / D9 (by subclass) |
| Lodging | class **`lodging`** (hotel, motel, guest_house, hostel, bed_and_breakfast, chalet, alpine_hut, dormitory) | filtered out | none | L9 / D9 |
| Viewpoint | class **`attraction`**, subclass **`viewpoint`** (`tourism=viewpoint` is imported) | filtered out | none | L11 / D10 |
| Place of worship | `amenity=place_of_worship` is imported; no general class, so `class` = subclass = **`place_of_worship`** | filtered out | none | L9 / D9 |
| Waterfall | **not imported**: the `poi` mapping has no `natural` key; its only `waterway` value is `dock` | — | — | **not feasible** (T8) |
| Dhaba | `amenity=restaurant` → class `restaurant`; the tiles carry **no cuisine** | drawn (L3 `restaurant`) | none | stays a restaurant |
| Paved / unpaved | `transportation.surface`: `paved` \| `unpaved` (unpaved = unpaved, compacted, dirt, earth, fine_gravel, grass, …) | **not used** | not used | new L15 / D11 |
| NH / SH refs | `transportation_name.ref`, `ref_length`, `network` (India falls to the default `road`), `route_1…6_ref` / `_network` | **drawn**: `highway-shield-non-us` (z8+, `road_{ref_length}` icon, `ref_length ≤ 6`) | refs only as plain text on motorways (`highway_name_motorway`) | L14 tune / D11 add |
| National parks, protected areas | `park` layer; `class` = `protected_area` tag value or lower-cased `protection_title` ("National Park" → `national_park`, "Nature Reserve" → `nature_reserve`, "Wildlife Sanctuary" → `wildlife_sanctuary`, "Reserved Forest" → `reserved_forest`, …), fallback `protected_area`; `name`, `rank` on **points** | fill `park` + a near-invisible dashed `park_outline`; **no labels** | none (only `landuse` park) | L12 / D6 |
| Forests | `landcover` class **`wood`** (subclass `forest`, `wood`) | `landcover_wood` (faint) | `landcover_wood` with `fill-pattern: wood-pattern`, **missing from the sprite → draws nothing** | L12 / D5 |
| Protected areas in `boundary` | no: `boundary` is admin lines (+ aboriginal lands) | — | — | use `park` |
| Buildings | `building` polygons (`render_height`, `hide_3d`) | `building` fill **z13–14 only**; z14+ was `building-3d` (removed by L1) | `building` z12+ but fill `#0A0A0A` on land `#0C0C0C` (invisible) | L17 / D7 |
| Built-up areas | `landuse` classes residential, commercial, retail, industrial, garages, railway, … | `landuse_residential` **to z12 only** | `landuse_residential` to z9 | L18 |

The schema docs give no per-zoom thresholds for `surface`, peaks or park points. The engineer confirms them in the tiles
with the maplibre-gl inspector at z9–14 over the test areas in §12 before tuning the minzooms below.

### 1.4 Sprite (`https://tiles.openfreemap.org/sprites/ofm_f384/ofm`, shared by both styles)
Present: `bank`, `car`, `shop`, `lodging`, `attraction`, `place_of_worship`, `religious_christian`, `religious_muslim`,
`religious_jewish`, `mountain`, `volcano`, `park`, `campsite`, `fuel`, `cafe`, `restaurant`, `fast_food`, `toilets`,
`hospital`, `police`, `parking`, `road_1`…`road_6`, `circle_11_black`, `oneway`, `arrow` (each also as `_11`).
**Missing:** `atm`, `car_repair`, `motorcycle`, `viewpoint`, `waterfall`, `peak`, `national_park`, `hotel`, `temple`,
**`wood-pattern`** (used by upstream Dark). A missing image makes MapLibre log a warning and draw no icon (for
`fill-pattern`: no fill). §4.5 maps every class to a present icon; the build script fails on any missing one (§13.2).

### 1.5 Data cost of terrain (honest numbers for the copy)
512 px tiles: at map zoom *z* the engine draws tiles of zoom *z* (capped at 12, overzoomed above). A 360 × 700 dp map shows
about 1 × 1.5 tiles at their own zoom, so 4–6 tiles with edges. A z12 tile over India is ≈ 9.6 km wide.
| Situation | DEM tiles fetched (first time) | ≈ Data |
|---|---|---|
| Home browse at zoom 15 (default), new area | 1–2 (z12, overzoomed) | 0.1–0.25 MB |
| Looking at a region, zoom 10–12 | 4–6 | 0.5–0.7 MB in hills, less on plains |
| Route preview fitting 100–150 km (zoom 8–9) | 4–6 | up to ≈ 1 MB (low-zoom hill tiles can be larger: estimate) |
| Live follow (zoom 16.5, 45° tilt), 60 km/h | one new z12 tile about every 10 km, plus neighbours at corners | ≈ 1.5–2 MB per hour |
| Fit all riders (zoom ≈ 11) | ≈ 4 | ≈ 0.5 MB once |
Revisited areas come from MapLibre's ambient cache (shared with vector tiles) at no cost while they stay cached. From
one measured tile, these are estimates; §12 measures the real numbers on the moto g64 and the copy is fixed to them.
**Copy:** "about 2 MB an hour while riding, and up to 1 MB when you look at a new area" (§8).

### 1.6 Verdict on the brief
| Brief item | Feasible? | Closest alternative where not |
|---|---|---|
| 2D hillshade, opt-in toggle, persisted, on in rides | yes, all platforms | — |
| ATM, mechanic, lodging, viewpoint, place of worship | yes (icons are stand-ins: T9) | — |
| Dhabas | **no** as a category | shown as restaurants (icon + name, "Dhaba" is in most names) |
| Peaks with elevation, viewpoints, forests, national parks / protected areas | yes | — |
| Waterfalls | **no** (not in the tiles) | named attractions at z15; later, an OSM-derived bundled point file (§14.4) |
| NH / SH shields | yes (text ref on a generic shield; already in Liberty, added to Dark) | colour-coded NH / SH shields need custom icons (§14.3) |
| Ghat roads and hairpins readable | **partly** (no tag) | widths, `text-max-angle`, terrain context, names (L16) |
| Unpaved tracks marked | yes | — |
| Buildings and landuse clearer, no 3D | yes (and a regression fixed) | — |

### 1.7 Sources
https://mapterhorn.com/ · https://mapterhorn.com/data-access · https://tiles.mapterhorn.com/tilejson.json ·
https://download.mapterhorn.com/attribution.json · https://mapterhorn.com/privacy-policy/ ·
https://github.com/mapterhorn/mapterhorn (README) · https://registry.opendata.aws/terrain-tiles/ ·
https://github.com/tilezen/joerd/blob/master/docs/{formats,use-service,attribution}.md · https://openfreemap.org/ ·
https://maplibre.org/maplibre-style-spec/sources/ (raster-dem) · https://maplibre.org/maplibre-style-spec/layers/ (hillshade) ·
https://github.com/maplibre/maplibre-native/issues/58 · https://openmaptiles.org/schema/ ·
https://github.com/openmaptiles/openmaptiles/tree/master/layers/{poi,transportation,mountain_peak,park} ·
https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json · measured: `tiles.mapterhorn.com/12/2909/1905.webp`,
`elevation-tiles-prod/terrarium/12/2909/1905.png`.

---

## 2. Map type toggle

### 2.1 Home: the map-type circle (`MapTypeButton`, new)
**Purpose:** switch between Standard and Terrain where the rider plans a ride. **Glance:** is terrain on (icon + ring).
- **Anatomy:** the 20 C1 circle (`size.mapControl` 56, `fabBg`, `elevate('e2')`: shadow in light, `edge2` hairline in dark),
  icon 24. Built from the same circle style as `map-controls.tsx` (export it as `MapCircleButton` and reuse it; the live
  column keeps its own layout).
  | State | Icon | Ring (2 dp, always drawn so the circle never changes size) | a11y |
  |---|---|---|---|
  | Standard | `layers` (`layers-outline`) `fabIcon` | transparent | value "Standard" |
  | Terrain | `terrain` (`terrain`) `brandOnBg` | `brandOnBg` | value "Terrain" |
  Two cues besides colour: the glyph changes and the ring appears (rule 1).
- **Position** (360 × 780, status bar 24, no offline banner):
  | Home mode | `top` | `right` |
  |---|---|---|
  | browse | chips bottom + `space.sm` = 144 + 8 = **152** | `space.md` 12 |
  | place | place bar bottom + 8 = **96** | 12 |
  | route | same `top` as the floating back circle (`insets.top + bannerH + 8` = **32**) | 12 |
  The offline banner pushes it down by `bannerH` like the bar. It sits in the right 68 dp; the camera padding rules of
  22 §4.2 already keep the place pin and the fitted route centred, clear of it (route-mode top padding counts the back-circle row).
- **Hidden:** when the Home sheet is `expanded` (no map to change), when the map failed (`homeMap.mapFailed`), and in the
  first-run expanded sheet.
- **Tap** → haptic `select` → opens the **Map type** sheet (§2.2).

### 2.2 Map type sheet (`MapTypeSheet`, new; 00 §2.8 `Sheet`)
```
┌────────────────────────────────────────┐ Sheet, surfaceRaised, top radius 24, padding 16
│ Map type                          (✕)  │ 20 semibold (heading) · close 56
│ ┌──────────────┐ ┌──────────────┐      │ two cards, 160 wide at 360 ((328 − 8) / 2), gap 8
│ │ ░░░░░░░░░░░░ │ │ ▒▒░░▓▒░░▒▒░░ │      │ MapTypeThumbnail 144 × 72, radius 12
│ │ ═══╗  ┄┄┄    │ │ ═══╗ ▓▒      │      │   (land, park, water, 2 roads, route; Terrain adds 2 ridges)
│ │    ╚═══      │ │    ╚═══ ▒▓   │      │
│ │ Standard  (✓)│ │ Terrain      │      │ 16 semibold text · check-circle 20 brandOnBg when selected
│ │ Roads and    │ │ Hills and    │      │ 14 textMuted, up to 2 lines
│ │ places       │ │ valleys      │      │
│ └──────────────┘ └──────────────┘      │ card: radius 16, padding 8, min height 168
│ (i) Terrain uses extra data: about     │ 14 textMuted, alertCircle 16 (preview.carNote pattern)
│     2 MB an hour while riding, and up  │
│     to 1 MB when you look at a new     │
│     area. Areas you've seen recently   │
│     load from your phone.              │
└────────────────────────────────────────┘ + insets.bottom
```
- **Cards:** each is one `Pressable` (the whole card, ≥ 160 × 168). Unselected: 1 dp `borderStrong` border, `surfaceRaised`.
  Selected: 2 dp `brandOnBg` border, the `checkCircle` icon top-right of the label row, `accessibilityState.checked`.
  Pressed: `surfacePressed`. Selected is shown by border width + check + state (never colour alone).
- **Tap a card** → haptic `select` → `setMapLayer(value)` → every mounted map adds or removes the shading at once (no
  reload, §13.1) → the sheet **stays open** so the rider sees the change behind it; ✕, the scrim or Android Back closes it.
  Tapping the selected card does nothing.
- Screen readers: the card row is a `radiogroup` labelled "Map type"; each card is `radio` with label
  `mapType.cardA11y` ("Terrain. Hills and valleys.") and checked state. On change, announce `mapType.announceTerrain` /
  `mapType.announceStandard`.
- **Offline (viewer):** the note line is replaced by `mapType.offlineNote` "You're offline. Terrain shows only where you've
  looked before." (first line of the sheet body, before the cards: viewer offline is said first). Both cards still work.
- `MapTypeThumbnail` (new, Views only, hidden from screen readers): the `mapPreview*` tokens (24 §1.7) at 144 × 72: land,
  one park rectangle, a water band, two roads (5 dp `mapPreviewRoadEdge` under 3 dp fill), the route (`routeCasing` 7 +
  `routeLine` 4.6). Terrain adds two soft diagonal ridge bands of the new token `mapPreviewRelief` under the roads.

### 2.3 Profile → Appearance → Map type
Inside the Appearance card, after "Light or dark" (`profile.tsx`): divider, label `profile.mapTypeLabel` "Map type"
(16 semibold), `SegmentedControl` [Standard | Terrain] (the existing control: 56 tall, selected check in both styles),
caption `profile.mapTypeHint` (14 muted). Same pref, same telemetry (`from: 'profile'`). This is the way to change it
without the Home map (for example after leaving a ride to Home is not wanted).
```
│ Light or dark                          │
│ [  Auto  |  Light  | ✓ Dark  ]         │
│────────────────────────────────────────│
│ Map type                               │ 16 semibold
│ [ ✓ Standard  |   Terrain    ]         │ SegmentedControl 56
│ Terrain shades hills and valleys. It   │ 14 muted, profile.mapTypeHint
│ uses extra data: about 2 MB an hour    │
│ while riding.                          │
```

### 2.4 Live ride: no control, the choice applies
- The live map shows terrain when `mapLayer === 'terrain'`. Nothing is added to the live screen: no circle, no ⋯ row, no
  banner. To change it in a ride: Back to Home (the ride keeps running, 22 §5.1), or Profile.
- Why not the live right column (the brief's likely place): 20 C1 limits it to two circles; with three the column needs
  ≈ 244 dp of map and would hide on the 272 dp group-leader layout (22 §3.8) whenever a second banner shows. A map-type
  switch is a rest-stop job, and Home has room for it.

### 2.5 Wireframe — Home browse, Terrain on (peek)
```
┌────────────────────────────────────────┐
│ ( [mark]  Where to?              (RA) )│ bar 56, top 32
│ (Fuel) (Coffee) (Food) (Parking) (To…  │ chips 48, top 96
│                                 ((⛰))56│ MapTypeButton top 152, right 12; Terrain: terrain icon + 2 dp ring
│      ░░▒▒▓▒░        ▒▒░                │ hillshade under roads; roads and labels on top
│  ════╗   ▒▓▒  (me)                     │
│      ╚═══════                          │
│ © OpenMapTiles © OpenStreetMap         │ pill: 2 lines (§5), bottom = sheetH + 8
│ Terrain © Mapterhorn                   │
├──────────────────── ── ────────────────┤
│ Good evening, Raghu                (˄) │ sheet (22, unchanged)
│ [ Join with a code ] [   Just ride   ] │
```

---

## 3. Terrain shading (hillshade)

### 3.1 Source (`src/lib/dem.ts`, pure)
| Field | Mapterhorn (default) | AWS fallback |
|---|---|---|
| `id` | `tt-dem` | `tt-dem` |
| `tiles` | `['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp']` | `['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']` |
| `encoding` | `'terrarium'` | `'terrarium'` |
| `tileSize` | 512 | 256 |
| `minzoom` / `maxzoom` | 5 / **12** | 5 / **13** |
| Pill line | `map.creditTerrain` | `map.creditTerrainAws` |
Never the TileJSON `url` (§1.2). No `attribution` prop (native attribution is off; we draw credits, §5).

### 3.2 Layer
- `id` `tt-hillshade`, `type: 'hillshade'`, `source: 'tt-dem'`, **`minzoom` 6**, **`maxzoom` 18** (above 18 the overzoomed z12
  data only blurs; nothing is drawn there).
- **Position: `beforeId = colors.hillshadeBeforeId`** (new token), computed by the pure
  `hillshadeBeforeId(layers)`: *the layer right after the last `fill` layer whose `source-layer` is `landcover`, `landuse` or
  `park`.* So the shading sits **above** land, landcover, landuse and park fills and **below** water lines, roads,
  buildings, boundaries, labels, the route and every marker.
  | Style | Token |
  |---|---|
  | `tt-liberty` (after L12 / L18) | `'waterway_tunnel'` |
  | `tt-dark` (after D5 / D6) | `'waterway'` |
  Test: for each bundled style, `hillshadeBeforeId(style.layers) === token` (as 24 does for `routeBeforeId`).
- Liberty's own Natural Earth relief raster (`natural_earth`, z0–7) is untouched; between z6 and z7 both fade across each other.

### 3.3 Paint (`hillshadePaint(scheme)`, pure; identical in Tribe and Maps)
All three colours are fully transparent at z6, so the layer fades in from z6 to z7 (there is no hillshade opacity property).
```ts
// tt-liberty (light): warm brown shadow on the cream land, white highlight.
'hillshade-illumination-direction': 335,          // NW light, cartographic convention
'hillshade-illumination-anchor': 'viewport',      // light stays top-left on screen when the live map turns heading-up
'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 0.45, 13, 0.35, 15, 0.25, 17, 0.15],
'hillshade-shadow-color': ['interpolate', ['linear'], ['zoom'],
  6, 'rgba(84,70,52,0)', 7, 'rgba(84,70,52,0.30)', 13, 'rgba(84,70,52,0.26)', 15, 'rgba(84,70,52,0.18)', 17, 'rgba(84,70,52,0.10)'],
'hillshade-highlight-color': ['interpolate', ['linear'], ['zoom'],
  6, 'rgba(255,255,255,0)', 7, 'rgba(255,255,255,0.35)', 15, 'rgba(255,255,255,0.20)', 17, 'rgba(255,255,255,0.10)'],
'hillshade-accent-color': ['interpolate', ['linear'], ['zoom'],
  6, 'rgba(84,70,52,0)', 7, 'rgba(84,70,52,0.08)', 13, 'rgba(84,70,52,0.05)', 15, 'rgba(84,70,52,0)'],

// tt-dark: the near-black land cannot get darker, so the highlight does the work, kept below the darkest road.
'hillshade-illumination-direction': 335,
'hillshade-illumination-anchor': 'viewport',
'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 6, 0.45, 10, 0.4, 13, 0.3, 15, 0.2, 17, 0.12],
'hillshade-shadow-color': ['interpolate', ['linear'], ['zoom'],
  6, 'rgba(0,0,0,0)', 7, 'rgba(0,0,0,0.55)', 15, 'rgba(0,0,0,0.35)', 17, 'rgba(0,0,0,0.20)'],
'hillshade-highlight-color': ['interpolate', ['linear'], ['zoom'],
  6, 'rgba(255,255,255,0)', 7, 'rgba(255,255,255,0.11)', 13, 'rgba(255,255,255,0.09)', 15, 'rgba(255,255,255,0.06)', 17, 'rgba(255,255,255,0.04)'],
'hillshade-accent-color': ['interpolate', ['linear'], ['zoom'],
  6, 'rgba(0,0,0,0)', 7, 'rgba(0,0,0,0.25)', 15, 'rgba(0,0,0,0)'],
```
Strength by zoom: strongest at z7–12 (seeing where the hills are), half at z15 (Home default), lowest at z16.5–17 (live
follow), where roads, the route and markers carry the glance.

### 3.4 The route and markers stay dominant (hard limits, tested)
1. **Order:** hillshade below every road, label, route and marker (§3.2). It can never draw over them.
2. **Light, darkest relief ≥ L 0.45.** Worst case (steepest shadow slope, shadow 0.30 + accent 0.08 at z7) ≈ `#BEB6AD`
   (L 0.47). The 24 §1.5 rule (line **or** casing ≥ 3:1 on every surface) still holds there:
   | Line on `#BEB6AD` | line | casing | passes by |
   |---|---|---|---|
   | Tribe trail `#F97316` / `#9A3412` | 1.4 | **3.7** | casing |
   | Tribe stop route `#2563EB` / `#1E3A8A` | 2.6 | **5.2** | casing |
   | Maps trail `#1A73E8` / `#185ABC` | 2.3 | **3.3** | casing (the binding case: this is why shadow alpha stops at 0.30) |
   | Maps stop route `#1A73E8` / `#174EA6` | 2.3 | **3.9** | casing |
   On unshaded land the 24 §1.5 table is unchanged.
3. **Dark, brightest relief ≤ `#272727`** (land 12 + 0.11 × 243 ≈ 39): Tribe trail `#FB923C` 6.6:1, Tribe stop route
   `#60A5FA` 5.9:1, Maps `#8AB4F8` 7.1:1. And **the brightest relief stays darker than the darkest road** (`#303030` after
   D3), so terrain never reads as a road.
4. **Labels:** every label drawn over shaded land has a halo (L7, D1, and the new layers' halos in §4), so text sits on its
   own halo colour, not on the relief.
5. **Markers:** rider, me, stop and SOS markers are native views above the map (white 2 dp outline, 24 §1.6). Checked over
   relief in §12, including a stale (offline) marker on a steep shaded slope.

### 3.5 Behaviour
- Off (`standard`): the source and layer **do not exist** in the map: zero DEM requests.
- On: added to every mounted map (Home, live, summary) within one render; removed the same way. No style reload, the
  camera and markers do not move.
- Theme / style change: the native source is keyed `tt-dem-${style}-${scheme}` (as the route sources), web re-syncs on
  `style.load`.
- Viewer offline: cached DEM tiles shade; unseen areas stay flat (that looks like a normal map, nothing to explain on the map).
- DEM provider down or slow: no shading, no message (decoration, not ride data). Map, routes and markers are unaffected.

---

## 4. Map detail (style tuning, both styles)

### 4.1 What this reverses from 24, and why the clutter does not come back
| 24 rule | Status | Why it stays clean |
|---|---|---|
| L1 `building-3d` removed | **kept removed** | No pitch-dependent extrusion. L17 only lets the **flat** `building` fill continue past z14 (upstream stopped it at z14 because 3D took over; removing 3D silently removed all buildings at z14+, the zooms Home (15) and live (16.5) use) |
| L2 `poi_r7`, `poi_r20`, `poi_transit` removed | **kept removed** | Shops, bus stops and low-rank POIs stay off. New places come only through **whitelisted** layers |
| L3 `poi_r1` whitelist | **widened** (ATM, mechanic at z15; lodging z16; worship z17 in their own layers) | (a) whitelist, not a blacklist; (b) still rank 1–6 per grid cell; (c) the numerous kinds start **above** the live follow zoom (worship z17 > 16.5) or at it (lodging); (d) icons 0.6–0.75 opacity, all below the route; (e) a measured budget: ≤ 8 place / peak icons on a live screen in a dense town (§12) |
| 20 declutter | respected | No new live chrome. Only map content changes, and it sits under the route |

### 4.2 `tt-liberty` changes (continue 24 §1.2)
| # | Layer(s) | Change | Zoom | Why |
|---|---|---|---|---|
| L8 | `poi_r1` | Whitelist (replaces L3's clause): `class` ∈ `RIDER_POI_CLASSES` (fuel, cafe, restaurant, fast_food, parking, toilets, hospital, police, **atm**) **or** (`class` = `car` and `subclass` = `car_repair`) **or** (`class` = `shop` and `subclass` ∈ {`motorcycle`, `motorcycle_repair`}). `icon-image`: `match` on class: `atm` → `bank`, `shop` → `car`, else the upstream expression. `text-field`: the style's name expression, falling back to `"ATM"` (atm) / `"Mechanic"` (car, shop). Opacity as L3 (icon 0.75, text 0.85) | 15+ (unchanged) | ATM and mechanic are ride needs; unnamed ones still say what they are |
| L9 | new `tt_poi_lodging`, `tt_poi_worship` (copies of `poi_r1`'s layout / paint, inserted **before** `poi_r1`) | `class` = `lodging` (icon `lodging`) / `class` = `place_of_worship` (icon `place_of_worship`, one generic icon for every faith); rank 1–6; named only; `icon-opacity` 0.6, `text-opacity` 0.8 | lodging **16+**, worship **17+** | A bed for the night matters; temples and churches are landmarks but are dense in Indian towns, so they wait for z17 |
| L10 | new `tt_peak_major` (z9–12, `rank` = 1) and `tt_peak` (z12+, `rank` ≤ 5), source-layer `mountain_peak`, `class` ∈ {peak, volcano}, named only | `icon-image`: `mountain` (volcano → `volcano`), `icon-opacity` 0.8; text = name, then a second line `"{ele} m"` when `ele` exists (`format`, second line Noto Sans Regular); `text-font` Noto Sans Bold; `text-size` interpolate z9 12 → z15 14; `text-color` `#6B5444`; halo `#FFFFFF` 1.5; `text-anchor` top, `text-offset` [0, 0.6]; `symbol-sort-key` `rank`; `text-optional` false | 9+ / 12+ | Riders plan by the passes and peaks they ride under; height in metres (India) |
| L11 | new `tt_viewpoint` (`class` attraction, `subclass` viewpoint) and `tt_attraction` (`class` attraction, `subclass` attraction, rank 1–6, named only) | icon `attraction`; viewpoint text = name or `"Viewpoint"`; `icon-opacity` 0.75; text `#666`, halo white 1.5 | viewpoint **13+**, attraction **15+** | Viewpoints are ride stops; attractions also carry most named waterfalls (T8) |
| L12 | `park_outline`, new `tt_park_label_major` + `tt_park_label`, `landcover_wood` | Outline: `line-color` `#8DB87A`, width interpolate z8 0.75 → z14 1.5, dash [3, 2], opacity 0.8, `minzoom` 8. Labels from `park` **points**: major = `class` ∈ {national_park, nature_reserve, wildlife_sanctuary, tiger_reserve, biosphere_reserve, protected_area} at z8+; others (reserved_forest, park, …) at z13+; Noto Sans Italic 12 → 14 (z8 → z13), `text-color` `#3D6B35`, halo `#FFFFFF` 1.5, `text-max-width` 8, `symbol-sort-key` `rank`. Forest `fill-opacity` 0.4 → **0.5** | 8+ / 13+ | Riders ride through these (and their gate times matter); today Liberty draws the fill with no name and a near-white outline |
| L13 | (reserved: no change to water, already labelled with halos) | — | — | — |
| L14 | `highway-shield-non-us` | Filter adds `class` ∈ {motorway, trunk, primary, secondary} (no refs on minor district roads); `symbol-spacing` interpolate z8 500 → z12 300 → z15 250. Icons (`road_{ref_length}`) and `text-size` 10 unchanged (the shield sprites are sized for 10) | 8+ | NH (mostly `trunk` in India) and SH refs stay, district-road clutter goes; "NH48" vs "SH17" in the text tells them apart |
| L15 | new `tt_road_unpaved` (inserted before `road_major_rail`: above road fills, below bridges and rail) | `surface` = unpaved, `class` ∈ {trunk, primary, secondary, tertiary, minor, service, track}, `brunnel` not tunnel; `line-color` `#B89C6E`; width interpolate exp 1.2: z12 0.75, z14 1.25, z16 2, z20 4; `line-dasharray` [2, 2]; `line-cap` butt | 12+ | A dashed sand-brown centre line says "not tarmac" (2.6:1 on a white road, 2.2:1 on primary). It is thinner and differently coloured than the dashed route fallback (`NAV_DASH`, 4–13 dp in route colours) |
| L16 | `highway-name-path`, `-minor`, `-major` | `text-max-angle` 30 (upstream default 45) | — | Names do not wrap round hairpins and hide the bend; on ghats the bends stay visible and the name moves to a straight stretch |
| L17 | `building` | Remove `maxzoom` (was 14); `fill-color` `#DCD9D6` (24 §1.5's building value); outline unchanged | 13+ | Restores town blocks at z14+ (lost with L1); flat, no 3D |
| L18 | `landuse_residential`; new `tt_landuse_commercial`, `tt_landuse_industrial` (after `landuse_school`) | Residential: `maxzoom` 12 → 16, colour stops 9 `hsla(0,3%,85%,0.84)`, 12 `hsla(35,57%,88%,0.49)`, 15 `hsla(35,57%,88%,0.3)`. Commercial (`class` ∈ commercial, retail) `#F2E8DC`; industrial (industrial, garages, railway) `#E8E6EC`; both `fill-opacity` interpolate z12 0 → z13 0.6 | 12+ | Built-up areas readable in towns without competing with parks (green) or hospitals (`#FFDDEE`) |

### 4.3 `tt-dark` changes (continue 24 §1.2)
| # | Layer(s) | Change | Why |
|---|---|---|---|
| D3 | `highway_minor`, `highway_major_inner`, `highway_major_casing`, `highway_motorway_inner`, `highway_motorway_casing`, `highway_path`, `highway_major_subtle`, `highway_motorway_subtle` | minor `#181818` → **`#303030`**; major inner `hsl(0,0%,7%)` → **`#383838`**, casing `rgba(60,60,60,0.8)` → **`#575757`**; motorway inner (`#000` from z6) → **`#404040`**, casing → **`#666666`**; path `#1B1B1D` → `#2A2A2A`; the z6–11 subtle layers `#2A2A2A` → `#3A3A3A` | Emulator QA: roads too faint. Against land `#0C0C0C`: minor 1.10 → **1.47:1**, major edge 1.59 → **2.70:1**, motorway edge → **3.40:1**. Still monochrome, so no hue meets a route colour |
| D4 | `highway_name_other` (patches D1); `place_town`, `place_city`, `place_city_large` (patches D2) | Road names `#858585` → **`#9A9A9A`** (halo `#0C0C0C` 1.5 kept): 6.9:1 on the halo. Towns and cities `#9A9A9A` → **`#B5B5B5`** (9.5:1); villages, suburbs and others stay `#9A9A9A` | Brighter roads need brighter names; places stay above roads in the hierarchy |
| D5 | `landcover_wood` | Remove `fill-pattern` (`wood-pattern` is **not in the sprite**, so forests draw nothing today); `fill-color` `#121A14`, opacity 1; `minzoom` 10 → 8 | Forests visible as a faint green-black (1.2:1): context, not contrast |
| D6 | new `tt_park` fill + `tt_park_outline` (after `landuse_park`), `tt_park_label_major` / `tt_park_label` | Fill `#131C15` from the `park` layer (z6+); outline `#2F4A35` 1 dp, dash [3, 2], z9+; labels as L12 with `text-color` `#7FA383` (7.1:1 on the halo), halo `#0C0C0C` 1.5 | National parks and protected areas exist on the dark map at all |
| D7 | `building` | `fill-color` `#0A0A0A` → `#1A1A1A`, outline `#1B1B1D` → `#262626` | Buildings were darker than the land (invisible) |
| D8 | `water`, `waterway`, `water_name` | Water `#1B1B1D` → `#111B26`; waterway lines `#1A2A3A`, width interpolate z10 1 → z16 3; `water_name` text `hsla(0,0%,0%,0.7)` (black on black) → **`#7F97B2`**, halo `#0C0C0C` 1.5 (6.5:1) | Rivers and lakes help orientation in ghats at night; their names were unreadable |
| D9 | new `tt_poi_rider` (copy of L8), `tt_poi_lodging`, `tt_poi_worship` (copies of L9), all before `highway_name_other` | Same filters, icons and zooms as Liberty; `icon-opacity` 0.7; text Noto Sans Italic 12, `#A3A3A3`, halo `#0C0C0C` 1.5. **Icon check:** the sprite was drawn for light maps; any class whose icon has < 3:1 edge contrast on `#0C0C0C` goes **text-first** (`icon-opacity` 0, the label carries it). Decided in QA, listed in the tuner | Fuel, ATM and a bed matter most at night; Dark had no POIs |
| D10 | new `tt_peak_major`, `tt_peak`, `tt_viewpoint`, `tt_attraction` (copies of L10–L11) | `text-color` `#A3A3A3`, halo `#0C0C0C` 1.5; icons 0.7 | Same detail at night |
| D11 | new `tt_shield` (copy of the L14 shield, after `highway_name_motorway`); `highway_name_motorway` → `visibility: none`; new `tt_road_unpaved` (before `railway_transit`) | Shield: same filter / sprite; `icon-opacity` 0.85, `text-color` `#111111` on the light shield. The motorway ref text is hidden (the shield replaces it, one fact one place). Unpaved: `#7A6A52` dashes (2.5:1 on `#303030`), same widths as L15 | NH refs on trunks were missing in dark |

Updated dark contrast (24 §1.5, routes unchanged and still strongest): the route casing is wider than every road casing
(24 §1.4), so a route is framed by its own casing, never flush against a road edge. Route line vs the brightest road surface
(`#666666` motorway edge): Tribe trail 2.5:1, Tribe stop route 2.3:1, Maps 2.6:1, plus a different hue and twice the width.
Route vs land, water (`#111B26`) and relief: all ≥ 5.9:1.

### 4.4 Draw order and label priority
MapLibre places symbols from the **top** layer down, so a higher layer wins collisions. Bottom → top (both styles):
`… road fills · tt_road_unpaved · bridges · buildings · boundaries · water labels` → `tt_attraction · tt_poi_worship ·
tt_poi_lodging · tt_park_label(_major) · tt_viewpoint · tt_peak · tt_peak_major · poi_r1 / tt_poi_rider` →
**route (inserted at `routeBeforeId`)** → `road names · shields · place names`.
- Priority, highest first: **place names → road shields → road names → rider POIs (fuel, ATM, mechanic, food…) → peaks →
  viewpoints → park labels → lodging → worship → attractions.**
- Everything in the middle group draws **under the route**. Rider markers, me, pins and SOS are native views above the
  whole map and never take part in collisions.
- `routeBeforeId` is unchanged (`'highway-name-path'` / `'highway_name_other'`): the new layers are `poi`,
  `mountain_peak` and `park` symbols (not `transportation_name` / `place`), and the new line layers sit among the roads. The
  24 test still holds.

### 4.5 POI and natural icons (sprite stand-ins)
| Kind | Tile filter | Icon (sprite) | Text | Zoom (light = dark) |
|---|---|---|---|---|
| Fuel, cafe, restaurant (dhabas), fast food, parking, toilets, hospital, police | as L3 | as upstream | name | 15+ |
| ATM | `class` atm | `bank` | name, else "ATM" | 15+ |
| Mechanic / bike shop | `car` + `car_repair`; `shop` + `motorcycle` / `motorcycle_repair` | `car` | name, else "Mechanic" | 15+ |
| Lodging | `class` lodging | `lodging` | name (named only) | 16+ |
| Place of worship | `class` place_of_worship | `place_of_worship` (generic, every faith) | name (named only) | 17+ |
| Viewpoint | `attraction` + `viewpoint` | `attraction` | name, else "Viewpoint" | 13+ |
| Attraction (incl. named falls) | `attraction` + `attraction`, rank ≤ 6 | `attraction` | name (named only) | 15+ |
| Peak / volcano | `mountain_peak` | `mountain` / `volcano` | name + "{ele} m" | 9+ (rank 1), 12+ (rank ≤ 5) |
| National park, sanctuary, reserve | `park` points | none (text only) | name | 8+ / 13+ |
| Waterfall | **not in tiles** | — | — | — |
Fallback strings are English constants in the tuner (the style cannot read `copy.ts`); they are listed in §8 so copy changes
are made in both places. Map label text uses the style fonts (Noto Sans); tabular figures cannot be set in map symbols.

### 4.6 What appears at each zoom (light and dark)
| Zoom | New in this spec | Where it is used |
|---|---|---|
| 6–8 | hillshade fades in (Terrain), park outlines (z8), major park names (z8), shields (z8) | country / state overview |
| 9–11 | most important peak per tile (z9) | route preview of a long ride (z8–10) |
| 12–13 | peaks rank ≤ 5, unpaved dashes, commercial / industrial tints, viewpoints (z13), other park names (z13) | planning a ghat |
| 14 | buildings continue (L17) | — |
| 15 | ATM, mechanic (+ existing rider POIs), attractions | **Home default** (`HOME_ME_ZOOM` 15), place mode |
| 16 – 16.5 | lodging | **live follow zoom 16.5** |
| 17+ | places of worship | zoomed-in Home / free live camera |

---

## 5. Attribution and credits (extends 24 §4)

### 5.1 Map pill (`MapCreditPill`)
- Lines: 1 = `live.attribution` "© OpenMapTiles © OpenStreetMap" (always); then the service line from 24 §4.2 (route or
  place provider) if any; then **`map.creditTerrain` "Terrain © Mapterhorn"** whenever the hillshade layer is mounted on
  that map. Up to **3 lines**, each `numberOfLines={1}`, shrink to 0.85 before cutting (24 rules).
  ```
  1 line (24)                       2 lines (Home, Terrain)           3 lines (live, road route, Terrain)
  ┌───────────────────────────────┐ ┌───────────────────────────────┐ ┌───────────────────────────────┐
  │ © OpenMapTiles © OpenStreetMap│ │ © OpenMapTiles © OpenStreetMap│ │ © OpenMapTiles © OpenStreetMap│
  └───────────────────────────────┘ │ Terrain © Mapterhorn          │ │ Routes by LocationIQ.com      │
                                    └───────────────────────────────┘ │ Terrain © Mapterhorn          │
                                                                      └───────────────────────────────┘
  ```
- Height = 8 + 16 × lines → **24 / 40 / 56**. `attributionClear(lines)` = 8 + height + 8 → **40 / 56 / 72**.
  `meSlotMinMapH(lines)` → **104 / 124 / 144**. Live worst case (group leader, 272 dp visible map, 22 §3.8) ≥ 144: the me slot
  still shows. Width: "Terrain © Mapterhorn" ≈ 130 dp at 1.3×, well inside the 268 dp `pillMaxWidth` at 360.
- The lift animates with `motion.fast` (none under Reduce Motion); a hold on the floating SOS is not cancelled by it (24).
- Home expanded-sheet footer (`attributionInSheet`): line 1, plus the terrain line when on (2 lines).
- a11y label: `map.creditA11y` + each extra line, e.g. "Map data © OpenMapTiles, © OpenStreetMap. Routes by
  LocationIQ.com. Terrain © Mapterhorn."
- AWS fallback: `map.creditTerrainAws` "Terrain: Mapzen, USGS".

### 5.2 Credits sheet (Profile → Privacy → Map and search credits): a 7th row, after OpenFreeMap
| Title | Sub | URL |
|---|---|---|
| `credits.dem` "© Mapterhorn" | `credits.demSub` "Terrain shading. Elevation: Copernicus DEM, © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; all rights reserved." | https://mapterhorn.com/attribution |
| (AWS fallback) `credits.demAws` "Terrain Tiles (Mapzen, on AWS)" | `credits.demAwsSub` "Terrain shading. SRTM and GMTED2010 data courtesy of the U.S. Geological Survey; ETOPO1 from NOAA." | https://github.com/tilezen/joerd/blob/master/docs/attribution.md |
Row anatomy unchanged (64, title 16 semibold, sub 14 muted wraps, `openInNew` 20, link role). The row shows whether or
not the rider uses Terrain (the credits list is static).

### 5.3 Where the terrain credit appears
| Surface | Terrain credit |
|---|---|
| Home (any mode), live, summary, with Terrain on | pill line (last line) |
| Home expanded sheet footer, Terrain on | footer line 2 |
| Standard, welcome hero, thumbnails | none (no DEM drawn) |
| Profile → Credits | row 7 (link) |

---

## 6. States
| State | Map | Toggle (Home circle / sheet / Profile) |
|---|---|---|
| Standard (default, first install) | 24 styles + §4 detail; no DEM source | circle: layers icon, no ring; sheet: Standard checked |
| Terrain | §3 shading under the roads on Home, live, summary | circle: terrain icon + ring; sheet: Terrain checked |
| Loading (DEM tiles on the way) | map draws at once; shading appears per tile (≤ 1 s on 4G); brief edge seams | — |
| Empty (flat region, sea) | almost no visible shading (flat terrain draws nothing): correct | — |
| Error (DEM provider down / 404) | no shading, nothing else changes; no message | unchanged (the setting stays) |
| Map failed (style / vector tiles) | `homeMap.mapFailed` (22) | circle hidden |
| **Viewer offline** | offline banner first (22 / live); cached tiles shade; unseen areas flat | sheet: `mapType.offlineNote` above the cards; both cards still selectable |
| Rider moving / stopped / offline / SOS | markers unchanged (24 §1.6). Stopped (amber ring + pause badge) and offline (grey, faded, dashed ring) stay distinct from each other and from relief, unpaved dashes and brown peak text; checked in §12 | — |
| Leader vs rider | identical | identical |
| Solo vs group | identical | identical |
| Light / dark × Tribe / Maps | `tt-liberty` / `tt-dark` with §3.3 paints; same in both styles | tokens (`fabBg`, `fabIcon`, `brandOnBg`, `surfaceRaised`) |
| Home sheet expanded | — | circle hidden |
| Live (any) | terrain follows the pref | no control on the live screen (T1) |

## 7. Interactions
| Control | Size | Gesture | Feedback | Result |
|---|---|---|---|---|
| Map-type circle (Home) | 56 | tap | `select` | opens the Map type sheet |
| Map type card | ≥ 160 × 168 | tap | `select`, pressed fill, check moves | pref saved, shading added / removed at once, screen-reader announcement; sheet stays open |
| Sheet ✕ / scrim / Android Back | 56 | tap / back | none | closes the sheet |
| Profile → Map type segment | 56 | tap | `select` (SegmentedControl) | same pref; Home and any open map follow |
| Map (Terrain on) | — | pan / pinch | none | unchanged (22, 21) |
| Map labels, POIs, peaks | — | — | — | not interactive (as today; taps on the map keep their 21 / 22 meaning) |
No swipe, long-press or precision tap anywhere (rule 3); nothing here is destructive.

## 8. Copy (`src/lib/copy.ts`; ✎ = marketing may refine; ⚖ = needs the provider's or a lawyer's OK)
| Key | Text |
|---|---|
| `mapType.buttonA11y` | Map type |
| `mapType.buttonHint` | Opens map type options. |
| `mapType.title` | Map type |
| `mapType.standard` / `mapType.standardSub` | Standard / Roads and places |
| `mapType.terrain` ✎ / `mapType.terrainSub` ✎ | Terrain / Hills and valleys |
| `mapType.cardA11y` | {type}. {sub}. |
| `mapType.dataNote` ✎ | Terrain uses extra data: about 2 MB an hour while riding, and up to 1 MB when you look at a new area. Areas you've seen recently load from your phone. |
| `mapType.offlineNote` | You're offline. Terrain shows only where you've looked before. |
| `mapType.announceTerrain` / `mapType.announceStandard` | Terrain shading on / Standard map |
| `profile.mapTypeLabel` | Map type |
| `profile.mapTypeHint` ✎ | Terrain shades hills and valleys. It uses extra data: about 2 MB an hour while riding. |
| `map.creditTerrain` ⚖ | Terrain © Mapterhorn |
| `map.creditTerrainAws` ⚖ | Terrain: Mapzen, USGS |
| `credits.dem` / `credits.demSub` ⚖ | © Mapterhorn / Terrain shading. Elevation: Copernicus DEM, © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; all rights reserved. |
| `credits.demAws` / `credits.demAwsSub` ⚖ | Terrain Tiles (Mapzen, on AWS) / Terrain shading. SRTM and GMTED2010 data courtesy of the U.S. Geological Survey; ETOPO1 from NOAA. |
| *(style constants, `map-style-tune.ts`)* `POI_FALLBACK.atm` / `.mechanic` / `.viewpoint`, `PEAK_ELE` | ATM / Mechanic / Viewpoint / {ele} m |
Unchanged: `live.attribution`, `map.creditA11y`, `credits.title`, `profile.creditsRow`, every 24 key. Never "bike route"
or "motorcycle route" (24). The numbers in `mapType.dataNote` / `profile.mapTypeHint` are replaced by the measured ones
from §12 before release.

## 9. Accessibility
- **Contrast:** §3.4 (routes over relief), §4.2–4.3 (labels: every new label has a 1.5 halo; dark text colours ≥ 6.5:1 on
  their halo), circle icon `fabIcon` / `brandOnBg` on `fabBg` ≥ 4.5:1 in all four palettes (17 §1.1), ring `brandOnBg`
  ≥ 3:1 on `fabBg`, card border 2 dp `brandOnBg` ≥ 3:1 on `surfaceRaised`.
- **Not colour alone:** Terrain state = glyph change + ring + a11y value; selected card = border width + check + checked state.
- **Targets:** circle 56; cards ≥ 160 × 168; segment 56; sheet close 56.
- **Screen readers:** circle: role button, label `mapType.buttonA11y`, `accessibilityValue.text` "Standard" / "Terrain",
  hint `mapType.buttonHint`. Sheet: header, then the offline note (if any), the radiogroup, the data note. Change announced
  (`AccessibilityInfo.announceForAccessibility`). Reading order on Home (22 §10) gains the circle **after the chips**.
  The map itself stays hidden from screen readers (unchanged); credits are outside it and read.
- **Dynamic type:** `maxFontSizeMultiplier` 1.3 on the circle (icon only), sheet title, cards and note; cards grow in
  height (labels wrap, never truncate); the Profile caption scales freely (rest-time). Map labels do not follow the system
  font size (MapLibre), as today.
- **Reduce Motion:** nothing animates here except the pill lift (24 rule); the hillshade appears without a fade.

## 10. Performance and data limits (India mid-range, moto g64: Dimensity 7025, Mali-G57 MC2, 8 GB)
- **Requests:** Standard adds **zero** DEM requests (no source). Terrain: ≤ 6 DEM tiles per fresh screen at any zoom
  (512 px, z ≤ 12); ≈ 1 new tile per 10 km while riding.
- **Memory:** a 512 px DEM tile ≈ 1 MB decoded + ≈ 1 MB prepared hillshade texture; ≤ 8 tiles in view ≈ 16 MB GPU/CPU.
  Budget: PSS increase ≤ 40 MB with Terrain over a 30-min ride.
- **GPU:** the hillshade is prepared once per tile, then drawn as a texture: cheap per frame. Budget: MapLibre render-thread
  frame time p90 ≤ 16.7 ms in follow mode at 16.5 + 45° tilt on a ghat, and ≤ 2 ms worse than Standard (Perfetto).
- **More symbol layers:** the new layers start at z8–17 with rank limits, so the extra placement work is bounded by zoom.
- **Battery:** ≤ 2 percentage points more per hour of riding than Standard.
- **Cache:** MapLibre's default ambient cache is shared with vector tiles; it is not raised in v1 (§14.5). DEM requests carry
  no user id (tile URL only); Mapterhorn logs IP and path for ≤ 30 days (§1.1), like any tile server.
- **One GL map at a time** (22 §4.3) stays true: the shading lives inside the existing maps.

## 11. Telemetry (`src/lib/telemetry/events.ts`; never coordinates, tile ids or names)
| Event | Props | When |
|---|---|---|
| `map.layer_changed` (new) | `layer`: `standard` \| `terrain`; `from`: `home` \| `profile` | the rider changed the map type (not on load) |
| `tracking.started` (changed) | adds `terrain`: boolean | each ride start on this phone: tells us how many rides run with terrain (data-cost question) |
No DEM error event: native has no per-source tile error callback, and the web would not match it.

## 12. Acceptance checklist — moto g64 (Android 14), 360 dp width, font 1.3×, Light and Dark, Tribe and Maps
Test areas: **Charmadi Ghat (NH73)** and **Agumbe (SH1)** in the Western Ghats; **Nandi Hills** (hairpins); **Manali–Rohtang**
(Himalaya); **Bengaluru MG Road** (dense town); **Kodagu** (forest, reserved forests, unpaved roads).

Toggle
- [ ] Fresh install: Standard. Home circle (layers icon, no ring) sits under the chips at the right in browse, under the place bar in place mode, level with the back circle in route mode; hidden with the sheet expanded and when the map failed.
- [ ] Tap → Map type sheet; tap Terrain → shading appears behind the sheet without the map reloading or the camera moving; the check, border and announcement change; the circle turns to the terrain icon with a ring. Kill and relaunch: still Terrain.
- [ ] Profile → Appearance → Map type changes the same setting; Home follows on return.
- [ ] The live screen has no new control; a ride started with Terrain on shows shading; switching to Standard at Home during a ride and going back to live removes it.
- [ ] Airplane mode: the sheet says "You're offline…" first; areas seen before are shaded, unseen areas flat; no error.
- [ ] Every target ≥ 56; TalkBack reads "Map type, Terrain, button" and the cards as radio buttons with their state.

Terrain
- [ ] Standard: no request to `tiles.mapterhorn.com` (proxy / Charles) in a 10-min session across Home, live and summary.
- [ ] Terrain: requests are `…/{z}/{x}/{y}.webp` with z ≤ 12 only (no 404s over India); shading fades in from z6, strongest z7–12, faint at 16.5.
- [ ] Shading is under every road, building, label, the route and all markers, at z8, 12, 15, 16.5 and 17 (both styles).
- [ ] Light: pixel-sample the darkest shaded slope at Charmadi z9–13: L ≥ 0.45 (≈ `#BEB6AD` or lighter); the Maps blue trail's casing still reads there.
- [ ] Dark: the brightest lit slope is darker than the darkest road (`#303030`); the route is the brightest line on screen.
- [ ] Heading-up live map turning through 360° on a ghat: valleys never look like ridges (light stays top-left of the screen).
- [ ] A stale (offline) rider marker on a steep shaded slope at z12–15 is still findable and still grey with a dashed ring; a stopped rider still shows ring + pause badge; SOS marker and halo visible over relief.
- [ ] WebP DEM decodes on Android and iOS (shading visible); web identical (maplibre-gl).
- [ ] `EXPO_PUBLIC_DEM_PROVIDER=aws`: AWS PNG tiles, z ≤ 13, same look; pill reads "Terrain: Mapzen, USGS"; Credits row switches.

Detail
- [ ] z15 MG Road: fuel, food, ATM ("ATM" when unnamed, bank icon), mechanic ("Mechanic", car icon); no shops, bus stops or florists; z16: lodging; z17: places of worship. At live follow 16.5 a screen shows **≤ 8** place / peak icons; if not, lodging moves to z17.
- [ ] No POI, peak or park label draws above the route; road names and place names win every collision against them.
- [ ] Peaks: Kodachadri / Rohtang area at z9 shows the main peak "Name / 1343 m" (mountain icon); z12 up to 5 per tile; unnamed peaks hidden.
- [ ] Viewpoints from z13 ("Viewpoint" when unnamed); a named "… Falls" tagged as an attraction appears at z15.
- [ ] National parks / sanctuaries: dashed outline from z8, italic green name; reserved forests named from z13; dark shows fill, outline and name.
- [ ] Dark forests visible (they drew nothing before D5).
- [ ] NH refs show on NH trunks in both styles from z8 ("NH48"); SH refs on primaries; no refs on minor roads; dark motorways show the shield, not a duplicate text ref.
- [ ] Unpaved roads at z12+ in Kodagu: sand-brown dashed centre line; never confused with the dashed route fallback (side-by-side screenshot).
- [ ] Nandi Hills hairpins at z14–15: bends visible, names placed on straight stretches.
- [ ] Buildings visible at z14, 15, 16.5, 17 in both styles (light flat grey, dark `#1A1A1A`); no 3D at any pitch; built-up areas tinted at z12–15 (light).
- [ ] Dark at night (brightness 30 %): minor and major roads readable at arm's length; road names and town names readable; river names readable.

Credits
- [ ] Terrain on: pill adds "Terrain © Mapterhorn" as the last line on Home, live and summary; live with a road route shows 3 lines; me slot / Re-centre / floating SOS sit above it (72); at 360 dp 1.3× nothing is cut and the pill never touches the right column.
- [ ] Standard: no terrain line anywhere on the map.
- [ ] Profile → Credits: 7 rows; "© Mapterhorn" opens mapterhorn.com/attribution.

Performance and data (moto g64)
- [ ] 30-min GPX replay at 50 km/h over Charmadi, follow mode, tilt on: extra mobile data with Terrain ≤ 1.5 MB vs Standard (Android data usage per app; ≤ 3 MB/h). Home: 10 pans at z10–12 over the Ghats ≤ 8 MB extra. Update the copy numbers (§8) to the measured values.
- [ ] Frame time, memory and battery within §10 budgets.

Build
- [ ] `node scripts/build-map-styles.mjs`: no missing layers, no missing sprite icons; the committed styles match the output.
- [ ] `npx expo lint`, `npx tsc --noEmit`, Jest: tuner (§13.4), `hillshadeBeforeId` = tokens, `routeBeforeId` unchanged, `hillshadePaint` limits, `pillLines` / `attributionClear` 40 / 56 / 72, `meSlotMinMapH` 104 / 124 / 144, `parseMapLayer`, credits entries (7).

---

## 13. Implementation notes (engineer)

### 13.1 Recommendation: inject the hillshade at run time
- **Native** (`src/components/map/terrain-layer.tsx`, new): `TerrainLayer` renders
  `<RasterDEMSource key={`tt-dem-${style}-${scheme}`} id="tt-dem" {...demSourceFor(DEM_PROVIDER)}>` with one
  `<Layer id="tt-hillshade" type="hillshade" beforeId={colors.hillshadeBeforeId} minzoom={6} maxzoom={18}
  paint={hillshadePaint(scheme)} />` when `usePrefsStore(s => s.mapLayer) === 'terrain'`, else `null`. Mounted inside
  `<Map>` in `components/map/maplibre-map.tsx` (Home, route preview, summary) and `components/ride-map.tsx` (live).
- **Web** (`src/lib/hillshade-web.ts`, new): `syncHillshade(map, { on, scheme, beforeId, provider })` adds or removes the
  source and layer and re-runs on `style.load` (theme switch), like `route-layers-web.ts`. Called from `plan-map.web.tsx`,
  `ride-map.web.tsx`, `summary-route-map.web.tsx`.
- **Why:** (1) Standard has **no DEM source at all**: zero requests, guaranteed, without relying on the engine skipping an
  unused source; (2) switching does **not reload the style**: no flash, the camera, markers and route layers stay;
  (3) the provider (Mapterhorn ↔ AWS) is a JS constant, so it ships as an OTA update without regenerating the styles;
  (4) the bundled styles stay exactly what the tuner makes; (5) one pure paint module serves native and web.
- **Rejected:** (a) the tuner writes four styles (`tt-liberty(-terrain)`, `tt-dark(-terrain)`): ~200 KB more JSON, a full
  style reload on every toggle, route sources re-keyed, provider change = regenerate + rebuild. (b) The tuner bakes the
  layer in with `visibility: none`: the source is still in the style, and maplibre-react-native's `Layer` creates layers;
  toggling a style's own layer is not its documented use.

### 13.2 Style tuner and build script
- `src/lib/map-style-tune.ts`: add L8–L18 and D3–D11 as in §4, keeping the file pure and import-free:
  - constants: `RIDER_POI_CLASSES` gains `'atm'`; new `RIDER_POI_SUBCLASSES = { car: ['car_repair'], shop: ['motorcycle', 'motorcycle_repair'] }`,
    `POI_FALLBACK`, `PEAK_ELE`, `PARK_MAJOR_CLASSES`, the D3 road colours, the D9 `TEXT_FIRST_CLASSES` list (filled from QA);
  - new-layer definitions as plain objects; a helper `insertBefore(anchorId, layer)` that reports a missing anchor in
    `report.missing`; `TuneReport` gains `added: string[]` (the script prints it);
  - new pure exports `hillshadeBeforeId(layers)` (§3.2) and `iconsUsed(style)` (every literal `icon-image` / `fill-pattern`
    name, including `match` outputs).
- `scripts/build-map-styles.mjs`: also fetch `${style.sprite}.json` (or read `sprite.json` with `--dir`) and **fail** if
  `iconsUsed(style)` has a name not in the sprite (this would have caught `wood-pattern`). Run it, commit
  `assets/map-styles/tt-liberty.json` and `tt-dark.json`.
- Before fixing minzooms, check `surface`, `mountain_peak` and `park` points in the tiles at z9–14 over the §12 areas
  (maplibre-gl `showTileBoundaries` + a feature inspector) and adjust any minzoom where the data starts later.

### 13.3 App code
| File | Change |
|---|---|
| `src/lib/dem.ts` (new, pure) | `DemProvider = 'mapterhorn' \| 'aws'`, `demSourceFor(p)` (§3.1), `DEM_SOURCE_ID`, `HILLSHADE_LAYER_ID`, `hillshadePaint(scheme)` (§3.3), `HILLSHADE_MIN/MAXZOOM` |
| `src/lib/flags.ts` | `DEM_PROVIDER` from `EXPO_PUBLIC_DEM_PROVIDER` (default `'mapterhorn'`; unknown → default) |
| `src/store/prefs-store.ts`, `src/lib/storage.ts` | `mapLayer: 'standard' \| 'terrain'`, `setMapLayer` (writes `pref.mapLayer`, tracks `map.layer_changed`), `parseMapLayer` (unknown → `'standard'`); **not** in the sign-out clear list |
| `src/theme/tokens.ts` | new `hillshadeBeforeId` (`'waterway_tunnel'` light, `'waterway'` dark, all four palettes); new `mapPreviewRelief` (`rgba(84,70,52,0.28)` light, `rgba(255,255,255,0.10)` dark) |
| `src/components/map/terrain-layer.tsx` (new), `map/maplibre-map.tsx`, `ride-map.tsx` | §13.1 native |
| `src/lib/hillshade-web.ts` (new), `plan-map.web.tsx`, `ride-map.web.tsx`, `summary-route-map.web.tsx` | §13.1 web |
| `src/components/map-controls.tsx` | export the circle as `MapCircleButton` (no behaviour change in live) |
| `src/components/map-type-button.tsx`, `map-type-sheet.tsx`, `map-type-thumbnail.tsx` (new) | §2.1–2.2 |
| `src/app/(app)/home.tsx` | place the circle per mode (§2.1), hide rules, sheet state; pill and sheet-footer terrain line |
| `src/app/(app)/profile.tsx` | Map type segment + hint (§2.3) |
| `src/lib/credits.ts` | `CREDIT_URLS.dem` (+ AWS), `CREDIT_ENTRIES` row 7 by provider, `pillLines(ctx, terrain)` returning 1–3 keys, `PILL_H(lines)` = 8 + 16n, `attributionClear(1 \| 2 \| 3)`, `meSlotMinMapH(1 \| 2 \| 3)` |
| `src/components/map-credit-pill.tsx` | `lines: string[]` instead of `line2` (a11y label joins them) |
| `src/lib/live-chrome.ts` | `creditLines?: 1 \| 2 \| 3`; replace the two `ME_SLOT_MIN_MAP_H*` constants with `meSlotMinMapH` |
| `src/components/credits-sheet.tsx` | renders the 7 entries (no layout change) |
| `src/lib/copy.ts`, `src/lib/icon-names.ts` (`layers: 'layers-outline'`, `terrain: 'terrain'`), `src/lib/telemetry/events.ts` | §8, §2.1, §11 |
No new dependency (RasterDEMSource ships in maplibre-react-native 11.5; maplibre-gl 5 has raster-dem). No native config change.

### 13.4 Tests
- `map-style-tune.test.ts`: every L8–L18 / D3–D11 layer exists with its anchor order (§4.4); L8 filter accepts atm,
  car + car_repair, shop + motorcycle and rejects car + taxi, shop + clothes; `poi_r7` / `poi_r20` / `poi_transit` /
  `building-3d` still absent; `building` has no maxzoom; dark `landcover_wood` has no `fill-pattern`;
  `highway_name_motorway` hidden; `iconsUsed` ⊆ a committed sprite-key fixture; `routeBeforeId` = 24 tokens;
  `hillshadeBeforeId` = §3.2 tokens.
- `dem.test.ts`: `demSourceFor` (maxzoom 12 / 13, tileSize 512 / 256, terrarium, never `url`); `hillshadePaint` alpha caps
  (light shadow ≤ 0.30, accent ≤ 0.08; dark highlight ≤ 0.11), all colours transparent at z6, direction 335, anchor viewport.
- `credits.test.ts`: `pillLines` for live + route + terrain (3), Home + terrain (2), Standard (1); `attributionClear`
  40 / 56 / 72; 7 entries; provider switch.
- `prefs` / storage: `parseMapLayer`. `live-chrome.test.ts`: `meSlot` thresholds 104 / 124 / 144.

### 13.5 Specs touched
"See 25" notes added to 24 (§1.2, §4.4) and 22 (§4.1). 24's L3 is superseded by L8; D1's road-name colour and D2's
town / city colours are superseded by D4.

---

## 14. Open questions
1. **Mapterhorn terms (blocker for public launch).** No terms of use, fair-use rule or SLA are published. Ask the maintainer
   (via the GitHub repo) whether a free mobile app may use `tiles.mapterhorn.com` directly, at an estimated 2 MB per
   rider-hour with Terrain on, and whether "© Mapterhorn" plus the Copernicus line in Credits is the credit they want. If
   the answer is no: switch to the AWS fallback (whose docs also discourage direct client use), or later self-host an India
   extract of Mapterhorn's open planet file (≈ 4–5 GB z0–12, estimate) on a free static host. Decide before launch.
2. **A map-type row in the live ⋯ menu?** v1 has none (T1, 20's declutter). Add one only if riders ask to change it mid-ride.
3. **Custom icons** for ATM, mechanic, viewpoint and colour-coded NH / SH shields (SDF icons added at run time with
   `Images` / `map.addImage`, re-added on every style swap). Worth it once the stand-ins are seen in QA?
4. **Waterfalls:** ship a small bundled point file of named waterfalls in India from OSM (ODbL, already credited), refreshed
   by a script? It is not in the free tiles at all.
5. **Ambient cache size:** keep MapLibre's default, or raise it (for example to 100 MB) so terrain does not push vector
   tiles out on long rides? Decide from the §12 data run.
6. **Combined refs** ("NH44;AH43", `ref_length` > 6) show no shield today. Check whether OpenFreeMap tiles carry `route_1_ref`
   for Indian highways; if yes, prefer it in L14 / D11.
7. **Future terrain options** (not in this spec): contour lines (maplibre-contour works on the web; native has no custom
   protocol hook), 3D terrain with tilt, `color-relief` height tints. Each needs its own data-cost and dominance check.
8. **Dark POI icons:** which classes go text-first (D9) is decided from device screenshots; confirm the list in review.
9. **Wording sign-off (⚖):** "Terrain © Mapterhorn" on the map and the Copernicus line in Credits.
