# 13 — UX overhaul: holistic pass (round 2)

Goal: premium, confident and rider-friendly, without touching what is validated. **Not
redesigned:** the live rider list hierarchy (distance 28/700 → status chip → name), the action bar
layout, alert escalation, marker clustering, grey offline, End as secondary, the vector icon set
(`icon.tsx` + `icon-names.ts`). Everything here layers on top. Rules from the role file still apply
(colour + icon + text, 56 targets, one primary at the bottom, deliberate gestures for SOS/End).

Priority = rider impact: **P0** safety or core flow (ship with features 10–12) · **P1** clearly
better daily use · **P2** polish. Each item names the tokens, components and copy keys it needs.

## 0. Foundations (do first, every screen depends on them)

### 0.1 New tokens (`src/theme/tokens.ts`)
```ts
themes.light.surfaceRaised = '#FFFFFF'   themes.dark.surfaceRaised = '#1C222B'  // cards on bg (light: + border)
themes.light.brandTint     = '#FFF7ED'   themes.dark.brandTint     = '#2A1709'  // action tiles, hero, achievement
themes.light.successTint   = '#ECFDF5'   themes.dark.successTint   = '#0C2A1B'  // summary "sharing stopped", joined
themes.light.sosOnBg       = '#B91C1C'   themes.dark.sosOnBg       = '#FCA5A5'  // red TEXT/borders on bg (dark-safe)
themes.light.borderStrong  = '#9CA3AF'   themes.dark.borderStrong  = '#4B5563'  // input focus-less borders, dividers on surface

export const motion = {
  fast: 150,      // banners, row insert, crossfades
  base: 200,      // sheet content, re-sort (existing LayoutAnimation 200)
  slow: 300,      // screen-level hero entrance
  stagger: 60,    // list/tile entrance step
  countUp: 600,   // summary numbers
} as const
// Easing: Easing.out(Easing.cubic) everywhere. No spring/bounce on ride screens.

export const size += {
  actionCard: 72,   // ActionCard (10), SettingsRow is 64
  settingsRow: 64,
  contactRow: 72,
  statTile: 96,     // already used by summary
  heroIcon: 64,     // icon glyph size in heroes (icons are not type; scale unaffected)
}
```
`meRowBg` stays and equals `brandTint` (keep both names, `meRowBg` is semantic for the list).
No new font sizes. 48 is not added: summary hero uses 36.

### 0.2 Motion rules
- Read Reduce Motion once (`useReducedMotion()` from `react-native-reanimated`, already installed)
  in a hook `useMotion()` → `{ reduce, duration(ms) }` that returns 0 for decorative motion when reduced.
- **Decorative** (entrances, count-up, crossfades, pulse halos, slide-ins) → off when reduced
  (opacity-only 150 ms is allowed). **Functional** (HoldButton progress ring, the loading spinner)
  → always on.
- Never animate while the live list is being touched. Never animate layout in the glance zones
  except the existing 200 ms re-sort.

### 0.3 Haptics map (`src/lib/haptics.ts`, one place, every call goes through it)
| Moment | Haptic |
|---|---|
| Any button in ride screens, segmented change, chip select | `selectionAsync` |
| Primary success: ride created, joined, account saved, contact saved, invitee joined | `notification Success` |
| Error line appears (wrong code, failed save) | `notification Error` |
| Ride starts (riders), ride ends (summary arrives) | `notification Success` |
| Alert banner (stopped/offline/message) | `notification Warning` (existing) |
| SOS hold start / 1 s / complete | Light / Medium / Error (existing) |
| Call button on SOS panels | `impact Medium` |
| Long-press share on code | `impact Light` |
Setting `prefs.haptics` (default on) in Profile → Appearance (P2). SOS haptics ignore it.

### 0.4 Shared components (new)
| Component | Spec |
|---|---|
| `Card` | `surfaceRaised` bg, light: border 1 `border` / dark: no border, radius 16, padding 16, gap 8. Variants `default`, `brand` (bg `brandTint`, 2 px `brand.primary` border: resume card), `notice` (4 px left bar in a status token) |
| `ActionCard` | 72 tall Pressable: icon tile 40 (`brandTint`, radius 12, glyph 24 `text`) · title 16/700 · sub 14 muted · `chevron-right` 20 muted. Pressed: bg `surface`. (10) |
| `SettingsRow` | 64: icon 24 `text` · title 16/600 · value 14 muted right · chevron. Divider 1 inset 56 |
| `SectionLabel` | 12/700 uppercase, letterSpacing 1, `textMuted`, margin-top 24, bottom 8 |
| `EmptyState` | icon 48 `textMuted` · title 20/600 · body 16 muted (max 3 lines) · optional secondary button. Centred, max width 320 |
| `PhoneInput` | 10 §7 |
| `SosSenderPanel` | 11 §5 |
| `Skeleton` | `surface` block, radius 12, opacity pulse 0.5↔1 1.2 s (static at 0.7 when reduced) |
| `StatTile` (extract from summary) | 96, `surfaceRaised`, value 28/700 tabular, label 14 muted, optional icon 20 above value |

New icon names in `icon-names.ts` (CI glyph test covers them): `contacts: 'contacts'`,
`chevronRight: 'chevron-right'`, `shield: 'shield-account'`, `group: 'account-group'`,
`lock: 'lock'`, `phonePlus: 'phone-plus'`, `ambulance: 'ambulance'`, `invited: 'clock-outline'`,
`smsText: 'message-processing'`, `link: 'link-variant'`, `history: 'history'`,
`distance: 'map-marker-distance'`, `duration: 'timer-outline'`, `riders: 'account-multiple'`,
`cloudSave: 'cloud-upload-outline'`, `cloudSaved: 'cloud-check'`, `email: 'email-outline'`,
`cellphone: 'cellphone'`, `signOut: 'logout'`, `palette: 'theme-light-dark'`, `delete: 'delete-outline'`,
`arrowUp: 'arrow-up'`, `arrowDown: 'arrow-down'`, `invite: 'account-plus'`, `dialpad: 'dialpad'`.
The summary hero reuses `endRide` (`flag-checkered`). No trophies.

## 1. Welcome (01) — first impression
Today: correct but flat. Big empty middle, plain title, debug FAB (dev only).

**P0**
- Footer per 12 §4: secondary `welcome.signIn` above primary `welcome.cta`. Note stays above.
**P1 — onboarding delight**
- Hero block at the top: `Card` variant brand-less, full-bleed band 200 tall, bg `brand.primary`,
  `motorbike` icon `heroIcon` 64 in `brand.onPrimary`, title `welcome.title` 36/700 `brand.onPrimary`,
  tagline 16/600 `brand.onPrimary`. Dark text on orange (rule 1). Status bar `dark` over it.
  Uses the empty space and ties to the orange splash, so launch feels continuous.
- Three feature rows move into a `Card` (padding 16, gap 16) below the hero. Tiles stay (48, status
  fills, onStatus glyphs). Entrance: hero fades in over `motion.slow`, then rows fade + slide up 8 dp
  one after another (`motion.stagger`). Off when reduced.
- Point 3 copy → `welcome.point3` "Hold SOS to alert your group and family" (✎). This promises contacts (11).
**P2**
- Splash dark variant: `expo-splash-screen` `dark.backgroundColor` `#0B0F14` with the orange icon,
  so night launches don't flash a bright screen.

## 2. Name (01)
**P1**
- **Live identity preview** under the input: "This is how riders see you" (`name.previewLabel`
  14 muted) + `RiderAvatar` 56 with live initials (`palette.me` fill) + a mini row mock
  "`AR` Arun · ▶ Moving" using the real `StatusChip sm`. Updates as you type, crossfade on initials
  change 150 ms. Teaches the list language before the first ride and makes short names feel right.
- Continue → `Success` haptic → home.
**P2**
- If the name has > 12 characters, the hint turns into `name.hintLong` ("Riders will see '{first}' in alerts.").

## 3. Home (02) — from empty to useful
Today: one heading and two buttons on a 900 dp empty screen. New order top→bottom (ScrollView body,
footer unchanged: secondary Join, primary Start):

```
┌──────────────────────────────────────┐
│ Throttle Tribe            (AR) Arun ›│ top row; avatar gets a 10 dp amber dot when profile incomplete
│ [offline banner]                     │
│ ┌──────────────────────────────────┐ │ RESUME CARD (when open ride) — unchanged, Card brand
│ └──────────────────────────────────┘ │
│  Good evening, Arun          (28/700)│ greeting (no open ride)  home.greet{Morning|Afternoon|Evening}
│  Ready to ride?              (16m)   │ home.heading demoted to subtitle
│ ┌──────────────────────────────────┐ │ QUICK JOIN card (ActionCard style, 72)
│ │ [#] Have a ride code?            │ │ icon 'dialpad'; sub "Join in one tap"
│ │     Enter 6 digits             › │ │ tap → /join (keyboard opens)
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │ ONE NUDGE CARD max (priority: contacts > save account)
│ │ [🛡] Add an emergency contact     │ │ Card notice, left bar status.sosStrong
│ │ Who should you be able to call   │ │
│ │ in one tap if you send SOS?      │ │
│ │ [ Add contact ]   Later          │ │ secondary 56 + text button 56
│ └──────────────────────────────────┘ │
│  RECENT RIDES                        │ SectionLabel
│ ┌──────────────────────────────────┐ │ RecentRideRow 72
│ │ Sunday Run              Sat 10 Oct│ │ name 16/700 · date 14 muted right
│ │ 86 km · 2 h 14 min · 6 riders   › │ │ 14 muted tabular; km only if cached
│ ├──────────────────────────────────┤ │
│ │ Nandi Hills             Sun 4 Oct │ │
│ │ 2 h 40 min · 4 riders           › │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ [ Join with code ]  secondary        │ (kept: the gloved-thumb path)
│ [ Start a ride   ]  primary          │
└──────────────────────────────────────┘
```
**P0**
- Nudge card slot (11 §4, 12 §4). Max one card. It never pushes the resume card down: the resume
  card is always first.
**P1**
- Greeting by local hour: 5–11 morning, 12–16 afternoon, else evening (`home.greet*`, `{name}` = first name).
- Quick join card. Yes, it duplicates the footer Join; it sits in the scroll area for the one-handed
  "friend just texted me a code" case, and the footer stays for consistency. If QA finds it noisy,
  drop the footer Join (P2 decision after testing).
- Recent rides: up to 5 ended rides, newest first. Row tap → `/ride/<id>/summary` (read-only
  summary; the layout must not start tracking for an ended ride). **Data (engineer/backend):**
  `getMyRecentRides(5)` → rides where I am a member, `status='ended'`, `started_at not null`,
  order `ended_at desc`, with member count. My distance: cache `{rideId: meters}` locally when the
  summary computes it (`storage.ts` key `rideStats`). Show km only when cached. Never compute it on home.
- Recent empty state (no ended rides): `EmptyState` compact: icon `history`, title
  `home.recentEmptyTitle` ("Your rides will show here"), body `home.recentEmptyBody` ("Start one and
  share the code. It takes 10 seconds."). No button (footer has it).
- Loading recent: 2 `Skeleton` rows 72. Error: hide the section silently (home must never look broken).
- Profile completeness dot: amber 10 dp dot on the avatar + a11y suffix `home.a11yProfileTodo`
  ("2 things to set up") when 0 contacts or guest. Amber dot + text (not colour alone). The count
  is in the label and the nudge card carries the words.
**P2**
- "See all rides" text button under the list when > 5 (`home.seeAll`) → `(app)/rides.tsx` (simple list, same rows).

## 4. New ride (02)
**P1**
- After Create → invite (10) instead of straight to the lobby. Haptic `Success` on create.
- Threshold segmented control: add the sub-label under each segment (12 muted): "1 min · city",
  "3 min · default", "5 min · highway" (`newRide.threshold*Hint`). That explains the trade-off
  better than one hint line, and the hint line goes away.
**P2**
- Ride name suggestions chips (`newRide.suggest*`: "Sunday ride", "Breakfast run", "Weekend tour"), 48 tall.

## 5. Join (03)
**P1**
- Accept `?c=` as well as `?code=` (10 §9).
- After success, a 300 ms check-mark state on the boxes (all borders `status.moving` + `check` 20)
  before navigating. Static when reduced.
**P2**
- Rejected: auto-reading a 6-digit code from the clipboard. It needs a new dependency and
  Android 13+ shows a privacy toast. Long-press paste stays.

## 6. Permissions (04)
**P1**
- Step dots (3 dots 8 dp, active `brand.primary`, others `border`) plus the existing "Step n of N"
  text. Primary buttons get the matching icon (20).
- Add `perm.openSettings` ("Open settings") as the action when a permission is permanently denied (also used by 10 §6).

## 7. Lobby (05)
Validated parts stay (code hero, readiness chips). Changes:
**P0**
- "Share code" button → **Invite riders** (`lobby.invite`, icon `invite` = `account-plus`)
  secondary → 10. Long-press code still shares the link.
- Under the riders title, when this phone has invitees: `lobby.invitedLine` ("3 invited · 1 joined ›")
  14 muted, 56-tall tap row → invite screen.
- Contacts nudge banner (info variant) when I have 0 contacts (11 §4).
**P1**
- Code block inside `Card` (surfaceRaised) with the label + code + `invite.codeNote`; the Invite button sits inside the card. One visual unit = "how people get in".
- Empty (only me): replace the hint with an `EmptyState`: icon `account-multiple`, title
  `lobby.emptyTitle` ("Nobody here yet"), body `lobby.emptyHint`, button `lobby.invite` (secondary).
- Arrival moment: new member row slides in (existing) + the leader gets `Success` haptic only for
  invitees who match (10 §5), `selection` for others.
- Rider footer "Waiting for Arun to start": keep the pulsing dot (static when reduced).
**P2**
- Pre-ride checklist for me (collapsed row "Your setup: ✓ Location ✓ Alerts ○ SOS contact"),
  each item tappable. Only shows if something is missing.

## 8. Live ride (06) — glanceability first
List hierarchy validated. **Do not change row sizes, order or chip design.**
**P0**
- My SOS → `SosSenderPanel` (11 §5); pinned banner tap reopens it.
- Receiver takeover contacts section (11 §6).
- Menu `⋯`: "Share code" → `live.menuInvite` ("Invite riders") → 10. Alone hint button → invite.
**P1**
- Header elapsed: `5 min` / `1 h 24` (review P2-1) if not shipped yet.
- Glance-zone contrast check in dark: chips use `onStatus` dark text on fills (already). Me row
  dark `meRowBg` `#2A1709` with `text` → 15:1. OK.
- Quick-message sheet: tiles get `selection` on press-in, `Success` on send (existing toast).
**P2**
- "Night" map: evaluate an OpenFreeMap dark style for the dark theme against marker contrast in a
  real night ride. Keep positron until tested (bright tiles at night = glare, but markers read).

## 9. Summary (08) — make it an achievement
Today: a correct report. New: one clear "you did it" moment, then the facts. Calm, not gamified
(no confetti during a safety app's SOS summary).
```
┌──────────────────────────────────────┐
│ ┌──────────────────────────────────┐ │ HERO Card brand (brandTint, no border), padding 24
│ │ [🏁]                  (icon 64)   │ │ flag-checkered, heroIcon 64, colour `text`
│ │ Ride complete          (28/700)  │ │ summary.titleDone
│ │ Sunday Run · Sat 10 Oct  (16m)   │ │
│ │ 86 km                  (36/700)  │ │ my distance = hero number, tabular, count-up 600 ms
│ │ you rode                 (16m)   │ │
│ └──────────────────────────────────┘ │
│ [⏱ 2 h 14 min][👥 6 riders][⏸ 3 stops]│ StatTiles 96, icon 20 above value
│ ✓ Location sharing stopped           │ Card successTint, check icon in status.moving fill
│  SOS (1) … (unchanged rows)          │
│  Stops (3) … (unchanged rows)        │
│  Riders … ("(you)" on my row)        │
├──────────────────────────────────────┤
│ [ Share ride ]   secondary           │ P1
│ [ Back to home ] primary             │
└──────────────────────────────────────┘
```
**P1**
- Title `summary.titleDone` "Ride complete" (replaces "Ride over"), hero number = my distance;
  if unknown, duration becomes the hero and tiles show distance "—".
- Third tile: stops count (`summary.stopsTile`), replacing riders; riders move into the hero meta
  ("Sunday Run · 6 riders · Sat 10 Oct"). Stops are more interesting at rest; riders stay visible.
- Arrival: `Success` haptic once; hero fades in (`motion.slow`), number counts up (`motion.countUp`,
  ease-out, tabular so width doesn't jump). Reduced: final values immediately.
- **Share ride** → `Share.share({ message: summary.shareMessage })` ("Rode 86 km with 6 riders in 2 h
  14 min on Throttle Tribe."). No location, no names. Hidden for cancelled rides.
- When there was an SOS, the hero keeps the same calm style, but the SOS section comes first under
  the tiles (unchanged order) and the share button is hidden (don't invite sharing an emergency).
- Cancelled variant: hero title `summary.cancelledTitle`, icon `close`, no number, no share.
**P2**
- Stop rows tappable → map sheet (08 P2, unchanged).

## 10. Profile → settings structure (02)
```
┌──────────────────────────────────────┐
│ ‹  Profile                           │ profile.title → "Profile"
│   (AR 56)  Arun                 ✎    │ identity row 72: avatar 56 me, name 20/700; tap = edit name sheet
│  ACCOUNT                             │
│  [AccountCard guest | saved row]     │ 12 §4
│  SAFETY                              │
│  🛡 Emergency contacts      2 of 5 › │ SettingsRow; "Not set" + amber dot when 0
│  APPEARANCE                          │
│  Theme  [Auto|Light|Dark]            │ existing SegmentedControl + hint
│  PRIVACY                             │
│  🔒 How sharing works              › │ P2: static page from 04 copy
│                                      │
│  Delete my account                   │ text button 56, sosOnBg, at the very bottom
│  Throttle Tribe 1.0.0 (12m)          │ version, muted
└──────────────────────────────────────┘
```
**P0**
- Sections ACCOUNT and SAFETY (12, 11). No footer Save button any more: the name is edited in a
  sheet (`profile.editName` title, AppTextInput, primary Save inside the sheet), so the screen has
  no primary and no confusing disabled Save.
**P1**
- Delete account moves to a muted bottom text button (destructive, rare) with the existing confirm.
  Copy `profile.deleteBody` reviewed (09).
**P2**
- Haptics toggle (0.3), "How sharing works".

## 11. Dark mode (all screens)
**P1**
- Cards: `surfaceRaised` `#1C222B` on `bg` `#0B0F14` (separation without borders). In light,
  `surfaceRaised` is white with 1 px `border`.
- Every red text or outline on `bg` uses `sosOnBg` (dark `#FCA5A5`), never `sosStrong` (fails on
  near-black). Red fills with white text keep `sosStrong`.
- `brand.primary` fills keep dark text (`brand.onPrimary` #111827). Never white on orange.
- Skeleton/surface contrast in dark: `surface` `#161B22` on `bg` → visible. Keep.
- QA: shoot every screen in dark at 1.3 font scale.

## 12. Empty, loading and error states (summary)
| Screen | Empty | Loading | Error |
|---|---|---|---|
| Home recent | EmptyState compact | 2 skeleton rows | section hidden |
| Invite list | `invite.emptyHint` | code skeleton | toasts per action |
| Contacts | EmptyState + quick add + 112 | 2 skeleton rows | `contacts.errLoad` + Try again |
| Lobby alone | EmptyState + Invite | existing skeleton | existing |
| Takeover contacts | `sos.contactsNone` + 112 | 1 skeleton + 112 | `sos.contactsUnavailable` + 112 |
| Summary no stops | existing `summary.noStops` | existing | existing |
Rule: **112 is never behind a loading or error state.**

## Engineer order of work
1. P0 foundations (tokens, haptics.ts, useMotion, Card/ActionCard/SettingsRow/EmptyState/PhoneInput).
2. 11 (contacts settings, sender panel, takeover section) — safety first.
3. 10 (invite route, lobby/menu entry points, hosted page).
4. 12 (account), Profile restructure.
5. Home, Summary, Welcome/Name P1. Then P2.

## Acceptance checklist
- [ ] All new tokens in `tokens.ts`; no raw values; `sosOnBg` used for red-on-bg in both themes.
- [ ] Reduce Motion disables every decorative animation; the HoldButton ring still animates.
- [ ] All haptics go through `haptics.ts` with the table above.
- [ ] Home: resume card first, at most one nudge card, recent rides (or empty state), one primary.
- [ ] Summary: hero number, count-up (off when reduced), Success haptic once, share hidden after SOS/cancel.
- [ ] Profile has sections; no footer Save; delete at the bottom.
- [ ] Live list rows unchanged (diff review: `live-rows.tsx` untouched except menu/invite wiring).
- [ ] Dark-mode screenshots of every screen pass contrast review.
