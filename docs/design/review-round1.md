# Design review — round 1 (Android release build, light theme, 1080×2400 ≈ 411×914 dp)

Source: `docs/qa/round1/01…07.png`. Known items (a)–(g) are not re-reported; where I refine one it says **refines (x)**.
Overall: the live list does its job. Distance + direction is the largest thing on every row (28/700), the status chip
is the second thing you see, rows are 72 dp, the me row sits in the right place in the order (05, 06), and the action bar
follows spec. The blockers are about the map when riders bunch up, and about offline still *looking amber*.

## P0 — safety / glance blockers

**P0-1 · Live (04) · Bunched markers hide each other and the me dot.** KB/MB/AB overlap; initials are clipped ("K", "1B");
my orange dot sits on top of them. At the start of a ride (the moment people check "is everyone here?") the map is unreadable.
The camera also looks zoomed to roughly 3 km for a group spread over less than 100 m.
Fix (`RideMap`):
- Screen-space clustering: rider markers whose centres are < 44 dp apart merge into a `RiderCluster`. It is a 48 dp circle,
  fill `text` (#111827), count `{n}` 16/700 white, 2 px `markerOutline`, 4 px ring in the **worst** member status
  (sos > offline > stopped > moving), and the worst non-moving badge at top-right. An SOS rider is **never** clustered.
  Tap → `fitBounds` of its members, maxZoom 18. If they are still < 44 dp apart, select the first and scroll the list to it.
  a11y is hidden (the list carries the data).
- Me dot: always rendered last (on top), never clustered, 24 dp + 3 px white outline + **1 px `text` outer stroke** (so it
  stays distinct from the amber stopped ring in sunlight).
- Check that fit bounds use **member positions only** (not trail points), with maxZoom 16 and min span 300 m (06 §3).

**P0-2 · Live (05), map + chip + banner · Offline renders with an amber/orange icon.** The 📶 emoji is an orange tile inside the
grey "No signal" chip, on the faded PB map badge and in the grey banner. This breaks rule 2 ("offline must never look like
stopped"). **Refines (a):** use the icon table below. Offline glyph = `signal-off` in `onStatus.offline` (#111827) on the grey
fill. Acceptance: no orange or amber pixel inside any offline element.

**P0-3 · Live (05), alert banner · The fact that matters is the part that gets truncated.** "lost signal · last seen 1.2 km be…"
loses the distance. **Refines (b):**
- Copy `alert.offline` → `{name} · no signal · {dist}` and `alert.stopped` → `{name} · stopped · {dist}`, using `firstName`.
  `{dist}` = short form `1.2 km back` / `1.2 km ahead` (new keys `alert.distBehind` "{d} back", `alert.distAhead` "{d} ahead").
- Layout: two `Text` spans in a row. Name span `flexShrink:1, numberOfLines:1`; status + distance span `flexShrink:0`.
  If anything gets truncated, it is the name, never the distance.
- Remove the ✕ from **alert** banners (they already auto-dismiss after `bannerStatusMs`). Tapping the banner body = View.
  This gives the text back 56 dp. Keep ✕ on the permission banners.

## P1 — clarity

**P1-1 · Lobby (03) · Two stacked amber banners (≈ 120 dp of amber) shout, and both truncate.** Notifications-off is not a sharing
failure, so it should not use the warning colour.
- `banner.notifOff`: new `Banner` variant `info`. bg `surface`, text `text`, icon `bell-off` in `textMuted`, closable, no action.
- Shorter copy so both fit on one line (about 26 characters fit next to Fix + ✕): `banner.bgOff` → "Sharing stops when locked";
  `banner.notifOff` → "Alerts show only in the app".
- Keep 0 dp between the stacked banners, but add a 1 px `border` divider. Today the second banner has no action, so its text
  starts at a different x than the first. Align both icons at x = 16 and both texts at x = 48.

**P1-2 · Lobby header (03) · "● Live" shows in the lobby,** where it reads as "the ride has started". The connection pill in the
header should say `● Online` (new key `header.online`) on both lobby and live. Offline stays `📶 Offline` → `signal-off` icon.

**P1-3 · Live action bar (04–06) · End is red-bordered with a red/orange tile next to the red SOS.** Two red controls side by side
weaken SOS, and the End icon looks like a media "stop" button. Make End `secondary`: border 1 `border`, icon `flag-checkered`
20 in `text`, label "End". Red is for SOS only. Keep the confirm sheet. Confirm the gap between the three buttons is
`space.md` (12) and every button is ≥ 72 tall. **Refines (d):** a11y label = "End ride for everyone".

**P1-4 · Live (04–06) · About 80 dp of blank space under the list** while the map is clipped. Map height =
`clamp(contentH − listContentH, 0.40·contentH, 0.55·contentH)`. With 5 riders this gives the map about 50 % and no blank
space. With more riders it falls back to the spec's 40 % and the list scrolls.

**P1-5 · Live (05) · Offline marker at 50 % opacity disappears into the tiles in sunlight,** and the badge fades with it.
Marker body opacity 0.6, but the **status badge and dashed ring stay at full opacity**. Badge 20 dp grey `status.offline` +
`signal-off` 12 dark. Same rule for the row avatar.

**P1-6 · Live (04) · "With you" is the right word for a bunched start, but it flickers.** Meena reads "100 m behind" while the
others read "With you". Add hysteresis in `geo.ts`: a rider becomes `level` below 100 m and only stops being `level` at 150 m
or more. Keep "With you" at 28/700. It is the true answer and must stay glanceable.

## P2 — polish

- **P2-1 · Header (04–06):** "0:05" can be misread as 5 seconds. Under 1 h show `5 min`, from 1 h show `1 h 24`
  (`live.elapsedMin`, `live.elapsedHm`).
- **P2-2 · Map toggle (04):** a bare ☰ is ambiguous. Make it a 56-tall pill like "All": icon `format-list-bulleted` + "List"
  16/700. The Fit pill becomes `fit-to-screen` + "All".
- **P2-3 · Rows (04–06):** a green ring on every moving avatar plus a green chip is a lot of green, so stopped and offline pop less.
  In **list rows** draw no ring for moving (keep it on map markers). Stopped and offline keep their rings.
- **P2-4 · Map (05):** the attribution pill covers markers near the bottom edge (KB). Add +28 dp bottom padding to `fitBounds`.
- **P2-5 · Summary (07):** my row is missing "(you)": append `lobby.you` muted. **Refines (g):** the client should also drop
  `stopped` events whose `since` is before `started_at` (Raghu · 5:29 PM was in the lobby).
- **P2-6 · Lobby (03):** initials render as "A(" for "Arun (bot)". The current `initialsOf` already skips punctuation, so the
  lobby row may come from an older build or use a different helper. Make sure `MemberRow` uses `RiderAvatar` / `initialsOf`
  and re-shoot.
- **P2-7 · Welcome (01):** the feature tiles stay the same, but use icons from the table below, glyph 28 in `onStatus.*`
  (amber tile with a dark pause icon, not a tile inside a tile).

## Icon mapping (refines a) — one family: `MaterialCommunityIcons` from `@expo/vector-icons`

Glyph colour on a status fill = `onStatus.*`; on `bg`/`surface` = `text`. Sizes: chip sm 14, map badge 12, banner 20,
buttons 20, welcome/permission tiles 28. Every icon is `accessibilityElementsHidden`; the text carries the meaning.
Check each name against `MaterialCommunityIcons.glyphMap` in CI (unit test), so a typo fails the build instead of showing "?".

| Use | Glyph | Use | Glyph |
|---|---|---|---|
| Moving | `play` | End ride | `flag-checkered` |
| Stopped | `pause` | Msg | `message-text` |
| Offline / no signal / header Offline | `signal-off` | List-only toggle | `format-list-bulleted` |
| SOS (chip, badge, button, banner, summary) | `alert` | Show map | `map` |
| Leader tag / badge | `star` | Fit everyone | `fit-to-screen` |
| Ready / Sharing ✓ | `check` | Share code | `share-variant` |
| Connecting | `dots-horizontal-circle-outline` | Back / menu / close | `chevron-left` / `dots-horizontal` / `close` |
| Not sharing / bg-off banner | `map-marker-off` / `cellphone-lock` | Notifications off banner | `bell-off` |
| Perm: location | `map-marker` | Perm: background | `map-marker-radius` |
| Perm: notifications | `bell-ring` | Welcome tiles | `play`, `pause`, `alert` |

Quick-message tiles (⛽ 🛞 🐢 🧭 ☕ 👍) **keep colour emoji**. They are content, not status, and they read well at 36.
