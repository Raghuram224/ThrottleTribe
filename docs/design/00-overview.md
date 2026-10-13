# 00 — Overview: screen map, shared patterns, tokens

Throttle Tribe answers three questions in one glance: **who is ahead, who is behind, who has stopped
or lost signal.** Everything below serves the live-ride screen (06); the rest gets riders there fast.

Specs in this folder: 01 onboarding · 02 home (+ new ride, profile) · 03 join · 04 permissions ·
05 lobby · 06 live ride · 07 alerts & SOS · 08 ride ended · 09 copy (single source for every string) ·
10 invite riders · 11 SOS emergency contacts · 12 account (save / sign in) · 13 UX overhaul (round 2,
P0/P1/P2 per screen; it overrides older specs where they conflict).
Screen specs reference copy keys (`home.start`); the text lives only in `09-states-copy.md`.

## 1. Screen map and routes (Expo Router, `src/app/`)

```
src/app/
  _layout.tsx              Root Stack (headerShown:false). Imports location task, session init,
                           setupNotifications() is NOT called here (see 04).
  index.tsx                Gate (splash). Decides the first screen, renders nothing but the splash bg.
  join.tsx                 Code entry + deep link target throttletribe://join?code=123456   (03)
                           also accepts ?c=123456 (hosted https invite page, 10 §9)
  auth/
    identify.tsx           ?mode=save|signin  email / phone entry                           (12)
    verify.tsx             ?mode&via&to       6-digit code                                  (12)
  (onboarding)/
    _layout.tsx            Stack, no back gesture on welcome
    welcome.tsx            (01)
    name.tsx               (01)  first-time name only; editing lives in (app)/profile.tsx
  (app)/
    _layout.tsx            Stack. Guard: no profile -> /welcome
    home.tsx               (02)
    new-ride.tsx           (02)  presented as modal
    profile.tsx            (02, restructured in 13 §10)  sections: account, safety, appearance
    emergency-contacts.tsx (11)  list / add / edit / reorder, max 5
    rides.tsx              (13, P2)  all recent rides
    permissions.tsx        (04)  ?rideId=…  then replaces itself with the ride
    ride/[id]/
      _layout.tsx          Mounts useRideChannel(id) ONCE for the whole ride; owns SOS takeover,
                           alert banner queue, keep-awake; redirects on ride.status changes
      lobby.tsx            (05)
      invite.tsx           (10)  ?first=1 after Create ride; allowed while lobby or active
      live.tsx             (06)
      summary.tsx          (08)  also opened read-only from Home → Recent rides (no tracking)
```
Ride layout also owns `SosSenderPanel` (11 §5) next to `SosTakeover`, and caches my emergency
contacts in memory for the ride.

### Gate logic (`index.tsx`)
1. Wait for `useSessionStore.ready`. Splash colour stays visible (brand `#F97316`).
2. No session or `getMyProfile()` is null → `router.replace('/welcome')`.
3. `getMyOpenRide()`:
   - ride `active` → `replace('/ride/<id>/live')` (rider re-opened the app mid-ride: zero taps).
   - ride `lobby` → `replace('/home')` (home shows the resume card prominently).
   - none → `replace('/home')`.
4. Network failure in 2/3 with a cached session → go to `/home` and let home show its offline state.

### Ride layout redirect rules (`ride/[id]/_layout.tsx`)
| `ride.status` | Current child | Action |
|---|---|---|
| lobby | live/summary | `replace` lobby |
| active | lobby | `replace` live (haptic `Success`) |
| lobby / active | invite | stay (invite is valid in both) |
| ended | invite | `replace` summary |
| ended | lobby/live | `stopRideTracking()`, then `replace` summary |
| — (my member row has `left_at`) | any | `stopRideTracking()`, `replace('/home')` |

Back from lobby/live goes to **home without leaving the ride** (ride keeps tracking; home shows the
resume card). Android hardware back = same. Summary back = home.

### Flow
```
launch → gate ─┬─ no profile → welcome ─┬─ Get started → name ─┬─ pending join code → join
               │                        │                      └─ home
               │                        └─ I have an account → auth/identify → auth/verify → home
               ├─ active ride → live
               └─ home ─┬─ Start a ride → new-ride → invite → [permissions] → lobby → live → summary → home
                        ├─ Join with code / quick join → join → [permissions] → lobby|live
                        ├─ Back to ride → lobby|live
                        ├─ Recent ride → summary (read-only)
                        ├─ Nudge → emergency-contacts | auth/identify?mode=save
                        └─ profile chip → profile ─┬─ emergency-contacts
                                                   └─ auth/identify?mode=save
lobby / live menu → invite
```
`[permissions]` is shown only when needed (rules in 04).

## 2. Shared patterns

### 2.1 Screen frame
Existing `Screen` component: safe area, `bg`, body padding `space.lg` (16), footer pinned at the
bottom with padding 16 and gap 12. **One primary BigButton per screen, always in the footer.**
Secondary actions are `secondary` BigButtons in the same footer, placed **above** the primary: the
primary sits lowest, closest to the thumb. Order in footer: secondary (top), primary (bottom).

### 2.2 Top bar (non-ride screens)
Height 56. Left: back button 56×56 (`‹` glyph 28, label for a11y "Back"). Title `heading` (20/600),
single line, truncate tail. No right action unless a spec says so.

### 2.3 Ride header (lobby + live) — `RideHeader` (new)
Height 64, `surface` bg, bottom border 1 `border`.
```
┌──────────────────────────────────────────────┐
│ ‹  Sunday Run                 ● Live    ⋯    │
│    1:24 · 6 riders                            │
└──────────────────────────────────────────────┘
```
- Back 56×56 (to home, ride continues).
- Ride name 20/600 truncate; second line 14 `textMuted`: live = elapsed `H:MM` since `started_at`
  (tabular, ticks each minute) + " · N riders" (active members); lobby = "Lobby · N riders".
- Connection pill (see 2.4), min 56 tall hit area, visual 32.
- `⋯` 56×56 opens the Ride menu sheet (06 §5).

### 2.4 My connection state
Derived: `netOffline` (NetInfo `isConnected === false`) or `channelStatus !== 'subscribed'`
**for more than 5 s** (debounce, avoids flicker on reconnect).
| State | Header pill | Banner |
|---|---|---|
| subscribed | `● Live` dot `status.moving`, text `text` | none |
| connecting ≤5 s | `◌ Connecting` dot `status.offline` | none |
| offline / error / closed >5 s | `📶 Offline` pill bg `status.offline`, text `onStatus.offline` | Offline banner |

### 2.5 Banner stack (below header, above content) — `Banner` (new)
Order top→bottom, max **2 visible**; lower-priority banners wait:
1. **SOS-minimised** (06/07) — `status.sosStrong` bg, white text, cannot be closed while SOS is on.
2. **You're offline** — `status.offline` bg, `onStatus.offline` text: `banner.offline`. Not closable.
   Stays until 2.4 clears; then shows `banner.backOnline` (green) for 3 s.
3. **Not sharing location** (04) — amber `status.stopped` bg, dark text, action "Fix" (56 tall).
4. **Alert banner** (07) — one at a time, queue.

Banner anatomy: min height 56, padding 12/16, radius 0 (full-bleed), icon 20 + text 16/700 (one
line, truncate) + optional action/close 56×56 at right. Enters with 150 ms slide-down; no bounce.

### 2.6 Bottom action area (ride screens)
`surface` bg, top border 1, padding 12 + safe-area bottom. Height of controls 72 (larger than the
56 minimum: this is the gloved-thumb zone). Never put a scrolling list under it.

### 2.7 SOS takeover
Rendered by `ride/[id]/_layout.tsx` as an absolute overlay above everything (not a route), so it
appears in lobby and live and survives navigation inside the ride. Spec in 07.

### 2.8 Sheets and confirmations
No new dependency. `Sheet` (new) = RN `Modal` (transparent, `animationType="slide"`) + scrim
`overlay.scrim` + panel `bg`, top radius 16, padding 16, grab bar 4×40 `border`. Closes on scrim tap,
Android back, or explicit Close button (56). **Never** rely on swipe-to-close (gloves).
`ConfirmSheet` (new) = Sheet with title 20/700, body 16, two stacked BigButtons: confirm (danger or
primary) on **top**, Cancel (secondary) at the bottom, so a sloppy thumb lands on Cancel.

## 3. New tokens (add to `src/theme/tokens.ts`)

```ts
palette.status.sosStrong = '#B91C1C'   // SOS surfaces that carry text (takeover, SOS chip, danger
                                       // button). White on it = 6.5:1. #EF4444 stays for rings/markers.
palette.onStatus.sosStrong = '#FFFFFF'
palette.me = '#F97316'                 // "me" marker + me-row accent (= brand; reserved, no rider gets orange)

palette.rider = [                      // index = ride_members.color_index (0..15). No green/amber/
  '#1D4ED8', '#6D28D9', '#BE185D', '#0E7490', //   grey/red/orange, so identity never reads as status.
  '#4338CA', '#A21CAF', '#0369A1', '#7E22CE', //   All 700/800 shades: white initials ≥ 5.4:1.
  '#0F766E', '#9D174D', '#1E3A8A', '#5B21B6',
  '#155E75', '#86198F', '#312E81', '#854D0E',
] as const
palette.onRider = '#FFFFFF'            // initials on rider fill
palette.markerOutline = '#FFFFFF'      // 2 px outline on every map marker, both schemes

themes.light.meRowBg = '#FFF7ED'   themes.dark.meRowBg = '#2A1709'
themes.light.overlayScrim = 'rgba(17,24,39,0.6)'   themes.dark.overlayScrim = 'rgba(0,0,0,0.7)'
themes.light.mapTrail = '#111827'  themes.dark.mapTrail = '#F9FAFB'   // leader trail line, 5 px, 0.55 opacity
themes.light.mapStyle = 'https://tiles.openfreemap.org/styles/liberty'
themes.dark.mapStyle  = 'https://tiles.openfreemap.org/styles/positron'

export const size = {
  avatar: 40,          // rider avatar in rows, map marker
  avatarSos: 56,       // SOS marker
  meDot: 24,
  statusRing: 4,
  rowLive: 72,         // live rider row
  rowMe: 56,           // me reference row
  actionBar: 72,       // bottom ride controls
  codeBox: { w: 48, h: 64 },
} as const

export const timing = {
  sosHoldMs: 2000,         // hold to send SOS
  sosCancelHoldMs: 2000,   // hold to cancel my SOS
  offlineDebounceMs: 5000,
  bannerMessageMs: 8000,   // message / sos_cleared / back online(3000 own)
  bannerStatusMs: 15000,   // stopped / offline
  fitIdleMs: 30000,        // auto re-fit map after user stops panning
} as const

export const fontNumeric = { fontVariant: ['tabular-nums'] } as const  // every distance/time/code
```
### Round 2 tokens (full rationale in 13 §0.1)
```ts
themes.light.surfaceRaised = '#FFFFFF'  themes.dark.surfaceRaised = '#1C222B'
themes.light.brandTint     = '#FFF7ED'  themes.dark.brandTint     = '#2A1709'
themes.light.successTint   = '#ECFDF5'  themes.dark.successTint   = '#0C2A1B'
themes.light.sosOnBg       = '#B91C1C'  themes.dark.sosOnBg       = '#FCA5A5'  // red text/border on bg
themes.light.borderStrong  = '#9CA3AF'  themes.dark.borderStrong  = '#4B5563'
export const motion = { fast: 150, base: 200, slow: 300, stagger: 60, countUp: 600 } as const
size.actionCard = 72; size.settingsRow = 64; size.contactRow = 72; size.statTile = 96; size.heroIcon = 64
```
Haptics: one module `src/lib/haptics.ts` with the 13 §0.3 table. Reduce Motion: `useMotion()` (13 §0.2).

No new font sizes: the 12/14/16/20/28/36 scale covers every spec. `weight`: 400 body, 600 headings,
700 numbers/labels on colour.

## 4. New / changed components (`src/components/`)

| Component | Purpose | Spec |
|---|---|---|
| `StatusChip` (change) | add `size: 'md' \| 'sm'` (sm = 14/700, padding 4/8, radius 12); SOS uses `sosStrong` bg; `offline` with `sinceMs === null` reads `status.noSignalYet` | 06 |
| `BigButton` (change) | `danger` uses `sosStrong`; add optional `icon` (left, 20) | — |
| `RiderAvatar` | colour fill + initials + status ring + badge | 06 §3 |
| `RiderRow` / `MeRow` | live list rows | 06 §4 |
| `MemberRow` | lobby list row | 05 |
| `RideHeader`, `Banner`, `Sheet`, `ConfirmSheet` | §2 | — |
| `HoldButton` | long-press with progress ring (SOS send/cancel) | 07 §4 |
| `SegmentedControl` | 2–3 options, 56 tall | 02 |
| `CodeInput` | 6 digit boxes over hidden TextInput | 03 |
| `RideCodeDisplay` | big grouped code "123 456" | 05 |
| `RideMap` | MapLibre map, markers, trail, fit button | 06 §3 |
| `SosTakeover` | full-screen SOS for receivers | 07 |
| `AppTextInput` | 56 tall, 20 font, border 2 `border`, focus border `brand.primary`, radius 12 | 01 |
| `Icon` (exists) | MaterialCommunityIcons via `icon-names.ts`; round 2 adds the names in 13 §0.4 | review-1 |
| `Card`, `ActionCard`, `SettingsRow`, `SectionLabel`, `EmptyState`, `Skeleton`, `StatTile` | round 2 building blocks | 13 §0.4 |
| `PhoneInput` | +91 prefix box + phone-pad field + `normalisePhone` | 10 §7, 11 §3 |
| `InviteeRow`, `InviteTray` | invite list row, text-invite sheet | 10 |
| `ContactRow`, `ContactEditSheet`, `GroupNotice` | emergency contacts | 11 |
| `SosSenderPanel` | my SOS: call / text contacts, 112, hold to cancel | 11 §5 |
| `SosTakeover` (change) | + "Call {name}'s emergency contacts" section | 11 §6 |
| `AccountCard`, `OtpEntry` (wraps `CodeInput` + resend timer) | save / sign in | 12 |
| `RecentRideRow`, `NudgeCard` | home | 13 §3 |
| `Banner` (change) | `info` variant used for notif-off and the contacts nudge | review-1, 11 |

New native modules (need a dev build): `expo-contacts` (`Contact.presentPicker()`), `expo-sms`
(`sendSMSAsync`, `isAvailableAsync`). Install with `npx expo install`.

Initials rule (`initialsOf(name)`): two words or more → first letter of the first two words;
one word → first two letters. Uppercase. "Arun" → "AR", "Priya K" → "PK".

## 5. Light / dark / sunlight

- Follow the system scheme by default. Profile has a **Theme: Auto / Light / Dark** preference
  (default Auto, stored per device). `useTheme()` reads the preference first. Riders who ride in
  bright sun should pick **Light** — that is the sunlight mode; we do not ship a third theme.
- Status colours are scheme-independent fills; text on them always uses `onStatus.*`.
  **Never** use a status colour as a text colour on `bg` (amber/grey on white fail contrast).
- Light theme already meets AAA for body text (`#111827` on `#FFFFFF` 17:1; `textMuted` 10:1).
- Map: style from `themes.*.mapStyle`; markers carry a 2 px `markerOutline` (white) so they read on
  any tile colour.
- Status bar: `style="auto"`; on SOS takeover force `light`.
- Dynamic type: allow scaling everywhere, but `maxFontSizeMultiplier={1.3}` inside ride rows,
  header, banners and the action bar (fixed-height glance zones). Text truncates, never wraps
  into a second line in those zones.

## 6. Global behaviour
- `expo-keep-awake` active on lobby + live (ride layout), released on summary.
- Haptics: `selectionAsync` on every button press in ride screens; specific patterns in 07.
- Portrait only (app.json already locks it).
- OSM attribution visible on every map (06).

## Acceptance checklist
- [ ] Routes and groups exactly as §1; gate never flashes the wrong screen (splash bg until decided).
- [ ] Mid-ride cold launch lands on live with no taps.
- [ ] Back from lobby/live keeps the ride; home shows resume card.
- [ ] Ride status change lobby→active→ended navigates every member automatically.
- [ ] All new tokens added in `tokens.ts`; no raw colours/sizes in components.
- [ ] Offline banner uses 5 s debounce and never shows the amber colour.
- [ ] Sheets close via button/scrim/back, not swipe only.
- [ ] Theme preference Auto/Light/Dark works and persists.
