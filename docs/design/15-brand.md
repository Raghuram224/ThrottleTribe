# 15 — Brand: mark, wordmark, icons, splash, favicon

Assets: `assets/brand/*.svg` (source of truth), `assets/brand/png/*.png` (rendered from the SVGs),
`assets/brand/generate-brand-svgs.mjs` (writes every SVG from one geometry; edit there, not by hand).

## 1. Concept: "Formation"
The mark is a **navigation arrowhead split into three riders**: a leader at the front, and two riders
behind on the left and right. That is the staggered formation group riders use on the road.
- **Arrowhead** = live position and heading. It is the same shape as the "me" marker on the map (14 §6), so
  the icon and the product use one symbol.
- **Three pieces** = the tribe. The group still reads as one arrow, so riders together make one shape.
- **Leader piece** = the top piece is the same arrow at half size (self-similar). In two-colour use it is
  orange: the leader sets the pace.
- **Graceful at small sizes**: at 16 px the gaps close up and it reads as one solid arrow, which is still the brand.

No motorbike outline, no wheels, no flames, no text in the mark.

## 2. Construction (1024 grid, `generate-brand-svgs.mjs`)
```
Outer arrow   T(512,192)  L(240,832)  N(512,672) notch  R(784,832)
Leader        T(512,192)  (648,512)  (512,432)  (376,512)    = outer arrow × 0.5, same tip
Cut           a V parallel to the notch V, 90 units below the leader notch (G)
Centre gap    80 units (g), splits the band behind the leader into two wings
Rounding      every piece has a same-colour stroke of 28 with round joins (≈ 14 radius corners)
Visible gaps  ≈ 50 units (6.5 % of mark height), the same across the cut and the centre gap
Optical centre  the mark's box centre sits 18 units above the canvas centre (y 530), because the wings are heavier
```
Favicon variant: G 130, g 120, rounding 20, so the split still shows at 32 px.
Wordmark: hand-drawn geometric monoline letters (stroke 20 on a 100 cap height, x-height 70, round
`o/b/e` bowls of radius 25, flat terminals). "Throttle" in ink, "Tribe" in orange. Mark-to-text gap = 0.26 × mark height.
Letters are drawn paths (stroked lines and circles), not a font, so they render the same everywhere.

## 3. Colours
| Token | Hex | Use |
|---|---|---|
| Brand orange | `#F97316` | leader piece, splash bg, favicon tile, adaptive bg fallback |
| Orange light | `#FB923C` | gradient start (top-left) on the app icon |
| Orange deep | `#EA580C` | gradient end (bottom-right); "Tribe" in the wordmark on white (3.6:1, large display only) |
| Ink | `#0B0F14` | mark on orange, "Throttle" on light, dark splash bg |
| Paper | `#F9FAFB` | mark and "Throttle" on dark |

On orange the mark is always **ink, never white** (white on `#F97316` is 2.8:1; ink is 7:1). Same rule as the UI.

## 4. Clear space and minimum size
- Clear space on every side = the **leader piece's height** (¼ of the mark's height). Nothing enters it.
- Minimum size: mark 16 px (favicon variant), two-colour mark 24 px, wordmark 20 px cap height (≈ 120 px wide).
- Below 24 px use the one-colour mark (`logo-mark-mono.svg`) or the favicon tile.

## 5. Do / don't
Do: use the files as they are · ink on orange · two-colour mark on white or ink · keep the mark pointing up.
Don't: rotate the brand mark (the *map marker* rotates; the logo doesn't) · add outlines, shadows, glows or
3D · put white on orange · recolour the wings orange (one orange piece only) · put the mark on a photo
without an ink or orange tile · change letter spacing or redraw the wordmark in a font · use the old blue-white Expo icon anywhere.

## 6. Files
| File | What | Canvas |
|---|---|---|
| `logo-mark.svg` | two-colour mark (orange leader, ink wings), transparent | 1024² |
| `logo-mark-mono.svg` | one-colour ink mark, transparent | 1024² |
| `logo-mark-on-dark.svg` | orange leader + paper wings on ink tile | 1024² |
| `logo-wordmark.svg` / `logo-wordmark-dark.svg` | mark + "Throttle Tribe", for light / on ink | 1019×216 |
| `app-icon.svg` | full-bleed square: orange gradient + ink mark (86 % scale) | 1024² |
| `adaptive-foreground.svg` | ink mark inside the safe circle (max radius 282 of 313 allowed), transparent | 1024² |
| `adaptive-background.svg` | orange gradient, full bleed | 1024² |
| `monochrome.svg` | Android 13+ themed icon, same geometry as the foreground, single colour | 1024² |
| `splash-icon.svg` | ink mark, transparent, for the orange light splash | 1024² |
| `splash-icon-dark.svg` | orange leader + paper wings, transparent, for the ink dark splash | 1024² |
| `favicon.svg` | orange rounded tile (r 200) + ink mark, wider gaps | 1024² |

## 7. PNGs (already rendered into `assets/brand/png/`, regenerate when the SVGs change)
| PNG | Size | From | Used by |
|---|---|---|---|
| `icon.png` | 1024×1024, no alpha | app-icon.svg | `expo.icon` (Android legacy, iOS, stores) |
| `android-icon-foreground.png` | 1024×1024, alpha | adaptive-foreground.svg | `android.adaptiveIcon.foregroundImage` |
| `android-icon-background.png` | 1024×1024 | adaptive-background.svg | `android.adaptiveIcon.backgroundImage` |
| `android-icon-monochrome.png` | 1024×1024, alpha | monochrome.svg | `android.adaptiveIcon.monochromeImage` |
| `splash-icon.png` / `splash-icon-dark.png` | 1024×1024, alpha | splash-icon(-dark).svg | `expo-splash-screen` |
| `favicon.png` | 48×48 | favicon.svg | `web.favicon` |
| `apple-touch-icon.png` | 180×180, no alpha | app-icon.svg | web `<link rel="apple-touch-icon">` (iPhone home screen) |
| `icon-192.png`, `icon-512.png` | 192², 512² | app-icon.svg | PWA manifest `icons` (`purpose: "any maskable"`; the mark is inside the 80 % maskable safe zone) |
| `play-store-512.png` | 512×512 | app-icon.svg | Play Console hi-res icon |
Still to make (marketing): Play feature graphic 1024×500 = `logo-wordmark-dark.svg` centred on `#0B0F14`.

How they were rendered: headless Chrome (`--default-background-color=00000000 --screenshot`, window = target
size, `<img>` of the SVG). Any SVG rasteriser works (resvg, svgexport); the SVGs use only paths, circles,
rects and one linearGradient.

## 8. app.json (engineer: copy the PNGs to `assets/` or point at `assets/brand/png/`)
```json
{
  "expo": {
    "icon": "./assets/brand/png/icon.png",
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/brand/png/android-icon-foreground.png",
        "backgroundImage": "./assets/brand/png/android-icon-background.png",
        "backgroundColor": "#F97316",
        "monochromeImage": "./assets/brand/png/android-icon-monochrome.png"
      }
    },
    "web": {
      "favicon": "./assets/brand/png/favicon.png",
      "themeColor": "#0B0F14",
      "backgroundColor": "#0B0F14"
    },
    "plugins": [
      ["expo-splash-screen", {
        "backgroundColor": "#F97316",
        "image": "./assets/brand/png/splash-icon.png",
        "imageWidth": 160,
        "dark": {
          "backgroundColor": "#0B0F14",
          "image": "./assets/brand/png/splash-icon-dark.png"
        }
      }]
    ]
  }
}
```
- Replaces today's `backgroundColor: "#E6F4FE"` (Expo default blue). That has to go.
- Splash `imageWidth` 160: the mark is about 110 dp tall. On Android 12+ the system splash API crops the
  icon to a circle; the mark stays inside it.
- Check the `dark.image` key against the expo-splash-screen v57 docs. If it is not supported, use
  `splash-icon-dark.png` for both (the orange leader + paper wings also read on orange, but less well).
- Web (`app/+html.tsx`): add `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` (copy
  `favicon.svg` to `public/`), `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
  `<meta name="theme-color" content="#0B0F14">`. Hosted pages in `web/` (j, privacy, delete) use
  `logo-wordmark.svg` at 28 px cap height in their header.
- In-app wordmark (home top bar, welcome hero): render `logo-mark.svg` via `react-native-svg` **or** use a
  24 dp PNG of the mark + the text "Throttle Tribe" in Inter Bold 20. Pick the PNG + text route if
  `react-native-svg` is not already installed (don't add a dependency only for this).

## Acceptance
- [ ] Launcher shows the orange arrow icon (round, squircle and themed masks: nothing clipped).
- [ ] Android 13 themed icons on: the monochrome mark shows, tinted by the system.
- [ ] Cold start in light = orange splash, ink mark; in dark = ink splash, orange/paper mark; no white flash.
- [ ] Browser tab shows the orange favicon tile; iPhone "Add to Home Screen" shows the 180 px icon.
- [ ] No Expo default asset is still referenced in app.json.
