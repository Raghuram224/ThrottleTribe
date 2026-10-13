# 17 — Themes: "Tribe" and "Maps"

Source: user request ("two themes … one like Google Maps so the user doesn't feel strange … let the user
choose"). Builds on 16 (signature pass); nothing in 16 changes for Tribe.
Mockups: `docs/design/mockups/17/*.html` → `png/*.png`, overview **`contact-sheet.png`** (Tribe vs Maps
side by side). Static map images: `mockups/17/maps/maps-*.png` (baked from real OpenFreeMap tiles via `bake.html#<config>`).

**One-line idea.** Same app, same layout, same safety language. **Maps** swaps the *chrome* for the
look riders already know from their everyday map app: a blue route with a darker casing, a blue
location dot with a white ring and accuracy halo, white surfaces with 1 dp grey outlines instead of
shadows, Material-style neutral greys, pill buttons and pill segmented controls, and a familiar
colourful road basemap (green parks, blue water, yellow main roads).

**Legal line (inspired by, not copied).** No Google logos, names, wordmarks, Google Sans / Product Sans,
or copied icons/sprites. The UI never says "Google". Colours are Material-family values (colours are not
protectable; Material Design is a public guideline). Icons stay MDI in the app (Material Symbols in the
mockups, Apache-2.0). Basemap = OpenFreeMap `liberty` / `fiord` (OSM data, OpenMapTiles schema), not
Google tiles. The blue dot + accuracy halo is an industry-wide convention (Apple, Google, Mapbox, OsmAnd).

---

## 0. Rules that hold in both styles (safety and identity)
1. **Status semantics are identical**: `palette.status.*`, `palette.onStatus.*`, `sosStrong`, all status
   tints (`movingTint`, `onMovingTint`, `stoppedTint`, `onStoppedTint`, `onOfflineTint`, `sosOnBg`,
   `successTint`) have the **same values in Tribe and Maps** for a given scheme. Chips, row bars, map rings,
   convoy rings, the gap-dash, offline dashed rings: unchanged. Red is never used for anything but SOS in
   Maps either (e.g. the summary **finish** pin is blue, not a red "destination" pin).
2. **SOS takeover, pinned SOS banner, SOS row, Hold-for-SOS button, action bar**: pixel-identical in both
   styles (`maps-sos.png`). They ignore style traits (radius stays `radius.lg`, no pill).
3. **Identity stays orange**: app icon, splash, favicon, the brand mark and the "Throttle **Tribe**"
   wordmark (orange "Tribe") are the same in Maps. Welcome / onboarding are always Tribe (the user has not
   chosen anything yet, and it is the brand moment).
4. **Rider colours (`palette.rider`) are identical** in both styles, so "Karthik is the teal one" holds
   across riders on different styles. The blue "me" dot is distinguished from blue rider avatars by
   shape (22 dp plain dot + white ring + halo, no initials) vs 36–40 dp initials avatars.
5. Layout, sizes, type scale, spacing, motion: identical. Only tokens + the few traits in §2 differ.
6. Font: **Inter in both styles** (§6).

---

## 1. Token architecture

```
palettes[style][scheme]: Tokens        // colours, per style × scheme  (already in tokens.ts)
styleTraits[style]:      StyleTraits   // non-colour shape decisions, per style (NEW, §2)
palette                                // scheme/style-independent: status, onStatus, rider, onRider, brand (identity), markers
```
- `ThemeStyle = 'tribe' | 'maps'`, `Scheme = 'light' | 'dark'` (exists). `resolveTokens(style, scheme)` (exists).
- `useTheme()` returns `{ colors, scheme, style, traits }` (add `traits: styleTraits[style]`).
- `useTheme()` currently overrides `colors.brand` with the accent. Keep that (buttons follow the style),
  **but** the brand mark and the wordmark must not read `colors.brand` / `brandOnBg`: they read
  `palette.brand.primary` (static orange) and the new `wordmarkAccent` token. Audit: `home.tsx` top bar,
  `welcome.tsx`, any `logo-mark` render, web `+html.tsx` theme-color (stays `#0B0F14`).
- Persistence: `STORAGE_KEYS.themeStyle = 'pref.themeStyle'` (exists). Values `'tribe' | 'maps'`;
  anything else → `'tribe'` (`parseThemeStyle`, unit test). Default **`tribe`**.
- Switching is instant: `prefs-store.setThemeStyle(style)` writes storage and sets state; every
  `useTheme()` consumer re-renders. No reload, no restart. Map views re-key on `mapStyle` (§3.3).

### 1.1 The complete token table
Every key of the `Tokens` interface in `src/theme/tokens.ts`, plus **NEW** keys (add to the interface;
Tribe values given so Tribe looks exactly as today). Contrast notes are WCAG ratios on the surface named.

| Token | Tribe light | Tribe dark | Maps light | Maps dark | Notes (Maps) |
|---|---|---|---|---|---|
| `bg` | `#F5F6F8` | `#0B0F14` | `#F8F9FA` | `#1B1C1E` | page |
| `surface` | `#EEF0F3` | `#1F2630` | `#F1F3F4` | `#2F3135` | tonal fills, seg track, sketch tile |
| `surfacePressed` | `#E4E7EB` | `#28303B` | `#E8EAED` | `#3A3C40` | |
| `surfaceRaised` | `#FFFFFF` | `#161B22` | `#FFFFFF` | `#232427` | cards, header, list, action bar, sheets |
| `text` | `#111827` | `#F9FAFB` | `#202124` | `#E8EAED` | 16.1:1 white · 14.6:1 bg |
| `textMuted` | `#4B5563` | `#C2C8D0` | `#5F6368` | `#BDC1C6` | 6.1 white / 5.4 surface · 8.7 card / 7.2 surface |
| `textSubtle` | `#5F6876` | `#8B95A1` | `#686C71` | `#9AA0A6` | ≥ 4.6 on white, bg, surface, meRowBg · ≥ 5.0 dark surfaces |
| `border` | `#E3E6EA` | `#262D36` | `#E8EAED` | `#34363A` | hairline dividers only |
| `borderStrong` | `#C4C9D0` | `#3D4652` | `#80868B` | `#5F6368` | input outline, outline buttons, unselected picker card (3.7:1 white) |
| `meRowBg` | `#FFF7ED` | `#24160B` | `#E8F0FE` | `#1C2B41` | blue tint; "Sharing" green 6.2 / 10.2 on it |
| `brandTint` | `#FFF7ED` | `#24160B` | `#E8F0FE` | `#1C2B41` | accent tint tiles (Join with a code) |
| `brandOnBg` | `#C2410C` | `#FB923C` | `#1967D2` | `#8AB4F8` | accent TEXT/icons: 5.4 white, 5.1 bg, 4.8 surface · 8.4 bg, 7.5 card |
| `brandPressed` | `#EA580C` | `#EA580C` | `#185ABC` | `#A8C7FA` | pressed fill of `accent` |
| `accent` | `#F97316` | `#F97316` | `#1A73E8` | `#8AB4F8` | primary fill, selected picker ring, me-row bar, end pin |
| `onAccent` | `#111827` | `#111827` | `#FFFFFF` | `#202124` | 4.51:1 on `#1A73E8` (labels ≥ 16 semibold only) · 7.6:1 |
| `meMarker` | `#F97316` | `#F97316` | `#1A73E8` | `#8AB4F8` | the blue dot |
| `successTint` | `#ECFDF5` | `#0C2A1B` | = Tribe | = Tribe | status: identical |
| `movingTint` | `#DCFCE7` | `#0F2E1D` | = Tribe | = Tribe | identical |
| `onMovingTint` | `#166534` | `#86EFAC` | = Tribe | = Tribe | identical |
| `stoppedTint` | `#FEF3C7` | `#3A2A08` | = Tribe | = Tribe | identical |
| `onStoppedTint` | `#92400E` | `#FCD34D` | = Tribe | = Tribe | identical |
| `onOfflineTint` | `#374151` | `#C2C8D0` | = Tribe | = Tribe | 9.3 on `#F1F3F4` · 7.7 on `#2F3135` |
| `overlayScrim` | `rgba(17,24,39,0.6)` | `rgba(0,0,0,0.7)` | `rgba(32,33,36,0.6)` | `rgba(0,0,0,0.7)` | |
| `sosOnBg` | `#B91C1C` | `#FCA5A5` | = Tribe | = Tribe | identical (6.1 on `#F8F9FA`, 9.3 on `#1B1C1E`) |
| `mapStyle` | `…/styles/positron` | `…/styles/dark` | `https://tiles.openfreemap.org/styles/liberty` | `https://tiles.openfreemap.org/styles/fiord` | §3 |
| `routeBeforeId` | `waterway_line_label` | `highway_name_other` | `waterway_line_label` | `water_name` | verified §3.2 |
| `routeLine` | `#F97316` | `#FB923C` | `#1A73E8` | `#8AB4F8` | 4.1:1 on liberty bg, 3.9 on yellow roads · 3.8 on fiord |
| `routeCasing` | `#9A3412` | `#0B0F14` | `#185ABC` | `#1B3A6B` | 6.0 on liberty bg, 5.6 on yellow roads |
| `segThumb` | `#FFFFFF` | `#343D49` | `#D2E3FC` | `#2D4A77` | selected segment (tonal blue, Material style) |
| `trackLine` | `#D5D9DF` | `#3A424D` | `#DADCE0` | `#44474C` | convoy track, step rail |
| `fabBg` | `#FFFFFF` | `#1F2630` | `#FFFFFF` | `#2F3135` | map circle buttons |
| `hairlineOnDark` | `rgba(255,255,255,0.08)` | same | same | same | |
| `edge1` | `transparent` | `rgba(255,255,255,0.06)` | `#DADCE0` | `#3C4043` | Maps: the **card outline** in both schemes (§2) |
| `edge2` | `transparent` | `rgba(255,255,255,0.08)` | `transparent` | `rgba(255,255,255,0.10)` | floating elements (shadow in light) |
| `ink` | `#0B0F14` | `#0B0F14` | `#0B0F14` | `#0B0F14` | welcome only in Maps (always Tribe) |
| `inkRaised` | `#161B22` | `#161B22` | `#161B22` | `#161B22` | |
| `paper` | `#F9FAFB` | `#F9FAFB` | `#F9FAFB` | `#F9FAFB` | |
| `onInkMuted` | `#C2C8D0` | `#C2C8D0` | `#C2C8D0` | `#C2C8D0` | |
| `onInkSubtle` | `#8B95A1` | `#8B95A1` | `#8B95A1` | `#8B95A1` | |
| `toastBg` | `#111827` | `#161B22` | `#303134` | `#3C4043` | snackbar-style |
| `toastText` | `#F9FAFB` | `#F9FAFB` | `#F1F3F4` | `#E8EAED` | 11.7 · 8.7 |
| `startGlow` | `rgba(249,115,22,0.28)` | `transparent` | `transparent` | `transparent` | Maps buttons are flat |
| **NEW** `segThumbIcon` | `#111827` (=text) | `#F9FAFB` (=text) | `#174EA6` | `#D2E3FC` | icon/label on `segThumb`: 6.0 · 6.8 |
| **NEW** `fabIcon` | `#111827` | `#F9FAFB` | `#1967D2` | `#8AB4F8` | map button glyphs (5.4 · 6.2) |
| **NEW** `wordmarkAccent` | `#C2410C` | `#FB923C` | `#C2410C` | `#FB923C` | "Tribe" in the wordmark: identity, never blue |
| **NEW** `convoyBand` | `transparent` | `transparent` | `#A8C7FA` | `#4A6FA8` | 4 dp band tail→lead over `trackLine` (§2) |
| **NEW** `meHalo` | `transparent` | `transparent` | `rgba(26,115,232,0.16)` | `rgba(138,180,248,0.18)` | accuracy halo + heading cone base |
| **NEW** `meRing` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | white ring on the dot / arrow disc |
| **NEW** `pinStartBg` | `#111827` | `#F9FAFB` | `#3C4043` | `#E8EAED` | summary start pin |
| **NEW** `pinStartFg` | `#FFFFFF` | `#111827` | `#FFFFFF` | `#202124` | glyph `circle-double` (10.5 · 13.4) |
| **NEW** `pinEndBg` | `#F97316` | `#F97316` | `#1A73E8` | `#8AB4F8` | finish pin + ride-log end dot |
| **NEW** `pinEndFg` | `#111827` | `#111827` | `#FFFFFF` | `#062E6F` | glyph `flag-checkered` |
| **NEW** `mapPreviewLand` | `#F2F3F0` | `#0C0C0C` | `#F8F4F0` | `#45516E` | picker thumbnails only (§4) |
| **NEW** `mapPreviewPark` | `#E6E9E5` | `#202020` | `#D8E8C8` | `#4A5D6B` | |
| **NEW** `mapPreviewWater` | `#C2C8CA` | `#1B1B1D` | `#9EBDFF` | `#38435C` | |
| **NEW** `mapPreviewRoad` | `#FFFFFF` | `#2A2A2A` | `#FFFFFF` | `#5A6A8C` | |
| **NEW** `mapPreviewMajor` | `#FFFFFF` | `#3C3C3C` | `#FFEEAA` | `#3C4357` | |

Unchanged and style-independent (`palette`): `status.*`, `onStatus.*`, `rider[16]`, `onRider`,
`markerOutline #FFFFFF`, `markerStroke #111827`, `brand.primary #F97316` / `brand.onPrimary #111827`
(identity: mark, icon, splash). Route widths (16 §2.5 `ROUTE_WIDTH` / `CASING_WIDTH`) are the same in both styles.
Route sketch tiles (home) use `routeLine` on `surface` (Maps: blue sketch).

---

## 2. Style traits and component differences beyond colour

```ts
export interface StyleTraits {
  buttonRadius: number;          // BigButton primary/tonal/ghost/outline, "Back to ride", Join/Share buttons
  segRadius: number;             // segmented control track (header Map/List, Auto/Light/Dark)
  segThumbRadius: number;
  segThumbShadow: boolean;       // e1 on the selected thumb
  cardElevation: 'shadow' | 'outline';
  meMarker: 'arrow' | 'dot';
  heroCard: 'ink' | 'surface';   // home "Ride in progress" card
  startIcon: 'mark' | 'navigation-variant';
}
export const styleTraits: Record<ThemeStyle, StyleTraits> = {
  tribe: { buttonRadius: radius.lg, segRadius: radius.md, segThumbRadius: 9, segThumbShadow: true,
           cardElevation: 'shadow', meMarker: 'arrow', heroCard: 'ink', startIcon: 'mark' },
  maps:  { buttonRadius: radius.pill, segRadius: radius.pill, segThumbRadius: radius.pill, segThumbShadow: false,
           cardElevation: 'outline', meMarker: 'dot', heroCard: 'surface', startIcon: 'navigation-variant' },
};
```
Heights stay the same (buttons 56/60, segment 44 and 56): pills do not shrink hit areas.

**Token-only differences** (no code beyond reading the token): blue accent everywhere the accent is used
(primary buttons, links "See all", tint tiles, me-row 4 dp left bar, selected states), blue route +
casing, basemap, segment thumb tonal blue + `segThumbIcon`, FAB glyphs `fabIcon`, convoy band, summary
pins, ride-log end dot (`pinEndBg`), toast colours, no Start glow, route sketches blue.

**Conditional code (the complete list):**
1. **`elevate(level, scheme, tokens, traits)`.** `cardElevation: 'outline'` → `e1` returns
   `{ borderWidth: 1, borderColor: tokens.edge1 }` and **no shadow**, in light and dark. `e2`/`e3`
   (floating: FABs, map ✕/fit buttons, action bar, sheets, toasts) keep today's behaviour (shadow in light,
   `edge2` hairline in dark). Cards in Maps are flat white with a 1 dp `#DADCE0` outline (`maps-home-recent.png`).
2. **Me marker** (`traits.meMarker`), one component `MeMarker` used in three places:
   - **Map** (`ride-map.tsx` / `.web.tsx`): `arrow` = today (brand arrow 34 on white disc). `dot` =
     22 dp circle `meMarker`, 3 dp `meRing`, shadow `0 2 6 rgba(0,0,0,0.4)`; **accuracy halo** = circle
     `meHalo` with a 1 dp ring of `meMarker` at 0.32 alpha, diameter = GPS accuracy in metres converted to
     px at the current zoom, clamped **40–160 dp** (fixed 72 when accuracy is unknown); **heading cone** =
     44×42 dp wedge (apex at the dot centre, 84° spread) filled with a linear gradient `meMarker` @0.8 →
     transparent, rotated to heading; shown only when heading is known and speed ≥ 3 km/h. Dot is drawn
     above rider markers (z-order as today). Reduce motion: no cone animation (it only rotates).
   - **Convoy strip**: `dot` = 20 dp dot + 2.5 dp `meRing`, **no halo** (accuracy means nothing on a strip),
     same centre as the arrow (`maps-live-map.png`).
   - **Me row**: `dot` = 18 dp dot + 2.5 dp ring centred in the 40 dp avatar column.
   a11y labels unchanged ("You").
3. **Convoy band**: draw one extra 4 dp `View` from x(min offset) to x(max offset) in `convoyBand`, on top
   of the track and under the gap-dash and dots. In Tribe it is transparent, so skip rendering when
   `convoyBand === 'transparent'`.
4. **Ride in progress card** (`traits.heroCard`): `ink` = today (dark token set inside, both schemes).
   `surface` = render the card with the **current** tokens: `surfaceRaised` + `edge1` outline (no ink, no
   big shadow), radius 20, same content; "● RIDE IN PROGRESS" label uses `onMovingTint`, the primary
   "Back to ride →" is the blue pill. (Ink in a Material-looking app reads as a foreign object.)
5. **Start a ride button** (`traits.startIcon`): `mark` = today's 24 dp ink mono mark. `navigation-variant`
   = MDI `navigation-variant` 22 in `onAccent` (the orange mark must never be drawn white-on-blue; rule 3).
6. **Segmented control** reads `segRadius`, `segThumbRadius`, `segThumbShadow`, `segThumb`,
   `segThumbIcon`. Selected text option also shows a 18 dp `check` before the label in Maps (Material
   segmented convention; it adds a non-colour selected cue). Icon-only header switch: no check.
7. **Style picker** thumbnails (§4) — new component.
8. **Map re-key** on style change (§3.3).

Not different (deliberately): header layout, list rows, chips, status bars/rings, convoy layout,
action bar, SOS everything, sheet layouts, summary layout, motion, sizes. No floating search pill, no
bottom-sheet drag handle (it would promise a gesture we don't have).

---

## 3. Map tiles

### 3.1 Choice
OpenFreeMap styles available (fetched 2026-10-13, `https://tiles.openfreemap.org/styles/<name>`):
`liberty`, `bright`, `positron`, `dark`, `fiord`.

| Style × scheme | Style URL | Why |
|---|---|---|
| Tribe light | `https://tiles.openfreemap.org/styles/positron` | 16 §2.6: quiet grey basemap, markers pop |
| Tribe dark | `https://tiles.openfreemap.org/styles/dark` | 16 D1 |
| **Maps light** | **`https://tiles.openfreemap.org/styles/liberty`** | Closest to a familiar road map: warm off-white land, white minor roads, yellow primaries, orange-tan motorways with casing, green parks, blue water, POI-light. `bright` is the same palette with many more POI icons (busier at handlebar distance). |
| **Maps dark** | **`https://tiles.openfreemap.org/styles/fiord`** | Blue-grey "night" map, the look people know from map apps' night mode; blue route reads at 3.8:1. Fallback if night glare is reported in QA: `dark` with the same blue route (`maps-live-dark.png` baked for comparison; casing `#0C0C0C`, before `highway_name_other`). |

Known trade-off: on `liberty` yellow primary roads sit near amber "stopped". Stopped is never colour
alone (ring + `pause` badge + chip text), markers have white rings, and the route paints over roads,
so it is acceptable; QA should still check a stopped rider on a yellow road at zoom 12–15.

### 3.2 Route insert layer ("before" id), verified from the style JSON
Rule (16 §2.5): first `symbol` layer after the last `transportation`/`building` line/fill layer.

| Style | `routeBeforeId` | Check |
|---|---|---|
| positron | `waterway_line_label` | 16 |
| dark | `highway_name_other` | 16 |
| liberty | `waterway_line_label` (index 88 of 111) | above `building` (83) and `building-3d` fill-extrusion (84) and all roads; below every label |
| fiord | `water_name` (index 31 of 48) | follows the last road/rail line (`railway_dashline`, 30); in fiord `water_name` sits **after** the roads, so it is correct here (unlike `dark`) |

The web helper `routeBeforeId(m)` from 16 computes the same ids; native uses the token.

### 3.3 Switching
`mapStyle` changes with style and scheme. Native: give `<MapView>` `mapStyle={colors.mapStyle}` and
key the route `GeoJSONSource` / layers on `${style}-${scheme}` so they remount with the new `beforeId`
and colours after the style loads. Web: the existing `style.load` handler re-adds the layers; add
`colors.routeBeforeId` to its deps. Camera position is kept across the switch. Summary map: same.
Attribution "© OpenFreeMap © OpenStreetMap" unchanged.

---

## 4. Settings UX: Profile › Appearance (`maps-appearance.png`, `tribe-appearance.png`)

```
APPEARANCE                                          section label (exists)
┌ card ────────────────────────────────────────────┐ padding 16
│ Style                                    16/22 semibold
│ Changes the colours and the map. Alert colours never change.   14/20 textMuted
│ ┌ Tribe ──────────┐  ┌ Maps ───────────┐          two cards, gap 12, equal width, radius 16, padding 8/8/12
│ │ [mini live      ]│  │ [mini live      ]│          thumbnail: width 100 %, aspect 157:212, radius 12
│ │ [ screen        ]│  │ [ screen        ]│
│ │ ○ Tribe          │  │ ● Maps           │          radio 22 + name 16/22 semibold
│ │   Bold orange    │  │   Familiar blue  │          13/18 textMuted
│ └──────────────────┘  └──────────────────┘
│ ───────────────────────────────────────────────── divider (full bleed)
│ Light or dark                            16/22 semibold (label renamed from "Theme")
│ [ ✓ Auto | Light | Dark ]                existing SegmentedControl, 56 tall
│ Pick Light for bright sun.               existing hint
└──────────────────────────────────────────────────┘
```
- **Cards** are `Pressable` radio buttons (whole card = hit area, ≈ 155×280 dp). Selected: 2 dp ring in the
  **current** `accent` + filled radio (`accent` disc, `check` 16 in `onAccent`). Unselected: 1 dp
  `borderStrong` ring + empty 2 dp radio. Press: scale 0.97 (`PressableScale`), haptic `selection`.
- **Thumbnail** = a tiny Live screen drawn from `resolveTokens(thatStyle, currentScheme)` (so in dark you
  preview the dark variant of each): header bar (`surfaceRaised`, two text bars `text`/`textMuted`, seg
  pill with `segThumb`), convoy row (`trackLine` + `convoyBand`, 3 rider dots + me marker of that style),
  map area 96 tall (`mapPreview*` land, park, water, 4 roads, 1 major road, route = `routeCasing` 7 +
  `routeLine` 4.6, me arrow or dot+halo, 2 rider dots), 2 list rows (rider dots, text bars, one amber
  stopped pill), action bar (`surface` tile + `sosStrong` SOS bar). Pure `View`s (or react-native-svg if
  already installed; do not add it for this). Non-interactive, `importantForAccessibility="no-hide-descendants"`.
- **Apply instantly** on tap: `setThemeStyle()`; the whole screen re-colours in place (no navigation, no
  restart). Status bar style follows scheme as today. If a ride map is mounted underneath it re-keys (§3.3).
- **Copy** (marketing may refine): `profile.styleLabel` "Style" · `profile.styleHint` "Changes the
  colours and the map. Alert colours never change." · `profile.styleTribe` "Tribe" ·
  `profile.styleTribeSub` "Bold orange" · `profile.styleMaps` "Maps" · `profile.styleMapsSub` "Familiar
  blue" · `profile.themeLabel` → "Light or dark". Never write "Google" anywhere (legal).
- **A11y**: radiogroup `accessibilityRole="radiogroup"` label "Style"; each card `accessibilityRole="radio"`,
  `accessibilityState={{ checked }}`, label "Tribe, bold orange" / "Maps, familiar blue map look".
  Selected state is ring + filled radio + check (not colour alone).
- **Default** `tribe`; key `pref.themeStyle`. New installs and existing users start on Tribe.
- **First-run hint (P2, optional):** existing users only, once after the update, on Home under the stats
  strip: a `brandTint` tip row "New: Maps style. A familiar blue map look." + ghost "Try it" (→ Profile ›
  Appearance, scrolled) + ✕ 48 hit. Dismiss or "Try it" sets `pref.styleTipSeen = '1'`. Never during an
  active ride, never on first run (the 3-step card owns that screen).

---

## 5. Screens in Maps (what changes, per mockup)
- **Home** (`maps-home-recent.png`): outlined cards, blue avatar `RA` (`accent`/`onAccent`), blue tint
  dial-pad tile, blue "See all", blue route sketches, **blue pill "Start a ride"** with
  `navigation-variant`, no glow. Wordmark keeps orange "Tribe" + orange/ink mark.
- **Live map** (`maps-live-map.png`, dark `maps-live-map-dark.png`): liberty/fiord tiles, blue route with
  casing, blue dot + halo + cone, blue convoy band, pill Map/List switch with tonal blue thumb, white FABs
  with blue glyphs, light-blue me row. Rider rows, chips, Hold for SOS: unchanged.
- **Live list states** (`maps-live-states.png`): SOS banner, SOS row, stopped amber chip + bar, offline
  outline chip + dashed ring, gap-dash on the convoy: all identical to Tribe (`tribe-live-states.png`).
- **Summary** (`maps-summary.png`): liberty route map, start pin dark grey, finish pin blue, stop/SOS pins
  unchanged, outlined stats/log cards, blue log end dot, blue pill "Back to home".
- **SOS takeover** (`maps-sos.png`): unchanged.

## 6. Font decision: keep Inter
Roboto is **not** what makes a map app feel familiar today: the familiar product uses its own
proprietary face (off limits), and familiarity comes from colour, the basemap, the blue dot and the
shapes, which the mockups show working with Inter. Roboto would add 3 font files (~ 500 KB), a second
type ramp to tune (tracking and tabular figures differ; our 28 semibold glance numbers were tuned in
Inter), and font switching at runtime. Inter is already embedded, has true tabular figures and the
same neutral-grotesque feel. **Decision: Inter for both styles, no new font dependency.**

## 7. Accessibility summary
All text pairs ≥ 4.5:1, UI components ≥ 3:1 (table §1.1). Tightest: white on `#1A73E8` = **4.51:1**: use it
only for labels ≥ 16 semibold (all buttons are 16–19 semibold); never for 12–14 regular text on the
accent (use `brandOnBg #1967D2` text on white instead). Route vs basemap ≥ 3:1 for the line or its casing
everywhere. Dynamic type and screen-reader labels unchanged from the screen specs.

## 8. Files (engineer)
`src/theme/tokens.ts` (Maps palettes, NEW keys in both styles, `StyleTraits`/`styleTraits`, `elevate`
signature), `src/theme/use-theme.ts` (return `traits`), `src/store/prefs-store.ts` (`themeStyle`,
`setThemeStyle`, `parseThemeStyle` + test), `src/lib/copy.ts`, `src/app/(app)/profile.tsx` (picker), new
`src/components/style-picker.tsx` + `style-thumbnail.tsx`, new `src/components/me-marker.tsx` (arrow |
dot, used by `ride-map(.web).tsx`, `convoy-strip.tsx`, `live-rows.tsx`), `convoy-strip.tsx` (band),
`segmented-control.tsx`, `big-button.tsx` (radius, start icon), `card.tsx` (elevation via traits),
`home.tsx` (hero card, wordmark token), `summary-route-map(.web).tsx` (pin tokens), `ride-log.tsx`
(end dot), `toast-host.tsx`. No new dependency.

## Acceptance
- [ ] Profile › Appearance shows Tribe and Maps cards with live token thumbnails; tapping one re-colours
      the app instantly (no restart); choice survives a cold start; default Tribe.
- [ ] Style × scheme: all 4 combinations render every screen with no hard-coded orange outside identity
      (mark, wordmark "Tribe", icon, splash, welcome).
- [ ] Maps light map = liberty, Maps dark = fiord; route is blue with darker casing, above roads and
      `building-3d`, below labels; switching style mid-ride re-colours the route without losing the camera.
- [ ] Me = blue dot + white ring + accuracy halo (+ heading cone when moving) on the map; plain dot in the
      convoy strip and me row.
- [ ] SOS takeover, SOS banner/row, Hold for SOS, stopped/offline chips, status rings: pixel-identical
      between Tribe and Maps (compare `tribe-live-states.png` / `maps-live-states.png`).
- [ ] No string, asset or font mentions or copies Google. Inter only.
- [ ] `npx expo lint`, `npx tsc --noEmit` clean; `parseThemeStyle` and `resolveTokens` unit-tested
      (every Maps key defined, status keys equal across styles).
