# 02 — Home, New ride, Profile

## Home (`(app)/home.tsx`)

**Purpose:** start a ride, join one, or get back to the ride you are already in.
**One-second glance:** if I am in a ride, "Back to ride" is the biggest thing on screen.

Data on focus: `getMyOpenRide()` (refetch on every focus and on app foreground) + `getMyProfile()`.

### Layout — no open ride
```
┌──────────────────────────────────┐
│ Throttle Tribe         [ AR Arun ✎]│ top row 56, name chip right
│                                  │
│  Ready to ride?            (28)  │
│  Start a ride and share the code,│
│  or join a friend's ride.  (16m) │
│                                  │
│                                  │
│ ┌──────────────────────────────┐ │
│ │       Join with code         │ │ secondary
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │        Start a ride          │ │ primary
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

### Layout — open ride exists (lobby or active)
```
┌──────────────────────────────────┐
│ Throttle Tribe         [ AR Arun ✎]│
│ ┌──────────────────────────────┐ │
│ │ ● RIDE IN PROGRESS     (12)  │ │ resume card: surface, border 2 brand,
│ │ Sunday Run             (28)  │ │ radius 16, padding 16
│ │ You're the leader · Started  │ │
│ │ 1:24 ago               (16m) │ │
│ │ ┌──────────────────────────┐ │ │
│ │ │      Back to ride        │ │ │ primary (inside card)
│ │ └──────────────────────────┘ │ │
│ └──────────────────────────────┘ │
│                                  │
│ ┌──────────────────────────────┐ │
│ │       Join with code         │ │ secondary (footer)
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │        Start a ride          │ │ secondary (footer)
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```
- Top row: app name `home.appName` 20/700 left; **name chip** right: `RiderAvatar` 32 (rider colour
  index 0 — no ride context, use `palette.me`) + first name 16/600 + ✎ 16; whole chip ≥ 56 tall,
  `surface`, radius 16 → `push('/profile')`.
- Resume card: label `home.resumeLabel` 12/700 uppercase letter-spacing 1 with a `status.moving`
  dot (active) or `status.offline` dot (lobby); ride name 28/700 truncate 1 line; meta 16 muted:
  role (`home.roleLeader` / `home.roleRider`) + `home.startedAgo` (active) or `home.inLobby` (lobby).
  Primary `home.resume` → `push('/ride/<id>/<lobby|live>')`.
- When the card is shown, Start/Join drop to `secondary` (one primary per screen).

### States
- Loading (first fetch): show the no-ride layout with both buttons enabled; resume card fades in
  (150 ms) if found. Never block the buttons on this fetch.
- Offline: banner `banner.offline` at top (00 §2.5); Start/Join still tappable — their own errors
  explain. Resume card shows from the last cached result if any.
- Open ride where I am leader and ride is `lobby` for > 12 h: still shown (no auto-cleanup in MVP).

### Interactions
- Start a ride → `push('/new-ride')` (modal).
- Join with code → `push('/join')`. If already in an open ride see 03 §"Already in a ride".
- Back to ride → as above. Haptic `selection`.
- Toast `home.toastWelcome` after onboarding: `surface` pill at bottom above footer, 3 s.

## New ride (`(app)/new-ride.tsx`, modal)

**Purpose:** name the ride and choose when to alert about a stopped rider. Two fields, one button.

```
┌──────────────────────────────────┐
│ ✕  New ride                      │
│                                  │
│  Ride name                 (16b) │
│ ┌──────────────────────────────┐ │
│ │ Arun's ride              (20)│ │
│ └──────────────────────────────┘ │
│                                  │
│  Alert when a rider has          │
│  stopped for               (16b) │
│ ┌─────────┬─────────┬──────────┐ │
│ │  1 min  │ ▣3 min  │  5 min   │ │ SegmentedControl 56
│ └─────────┴─────────┴──────────┘ │
│  Shorter = more alerts at        │
│  traffic lights.           (14m) │
│                                  │
│ ┌──────────────────────────────┐ │
│ │         Create ride          │ │ primary
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```
- Close ✕ 56×56 top-left (modal).
- Ride name: `AppTextInput` prefilled `newRide.defaultName` ("<FirstName>'s ride"), select-all on
  focus, `maxLength={60}`, required (trim ≥ 1).
- Stop alert: `SegmentedControl` options `1 min`/`3 min`/`5 min` → `60/180/300` s, **default 3 min**.
  Selected segment: `brand.primary` bg, `brand.onPrimary` 16/700 + ✓ prefix (not colour alone);
  unselected: `surface`, `text` 16/600. Each segment ≥ 56 tall, equal width.
  Remember the last choice per device as the next default.
- Helper `newRide.thresholdHint` 14 muted.
- Primary `newRide.cta` → `createRide(name, seconds)` (loading) → `replace('/permissions?rideId=…')`
  if permissions are needed (04), else `replace('/ride/<id>/lobby')`.
- Errors inline above the footer (⚠ 16): `profile_required` → button changes to `newRide.setName`
  → profile; `network`/`unknown` → messages from 09 + `common.tryAgain`.
- Already in an open ride: Start is still allowed for riders (confirm `ConfirmSheet`
  `home.confirmSwitch*`: leave old ride, then create). If I am the **leader** of an open ride, show
  the sheet `home.leaderBusy*` with one action "Go to <ride>" — leaders must end first.

## Profile (`(app)/profile.tsx`)

**Purpose:** change my name and theme.
```
┌──────────────────────────────────┐
│ ‹  Your profile                  │
│  Name                      (16b) │
│ ┌──────────────────────────────┐ │
│ │ Arun                     (20)│ │
│ └──────────────────────────────┘ │
│  Theme                     (16b) │
│ ┌─────────┬─────────┬──────────┐ │
│ │ ▣Auto   │  Light  │   Dark   │ │
│ └─────────┴─────────┴──────────┘ │
│  Pick Light for bright sun. (14m)│
│                                  │
│  Guest account on this phone.    │
│  Deleting the app removes it.(14m)│
│ ┌──────────────────────────────┐ │
│ │            Save              │ │ primary, enabled when name changed & valid
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```
- Theme applies instantly (no save needed); Save is for the name only (`saveProfile`).
- Name change mid-ride: other riders see it after their next snapshot refetch — acceptable.
- Saved → toast `profile.saved`, `back()`.

## Accessibility
- Name chip label: `home.a11yProfile` ("Your profile, Arun. Edit name").
- Resume card is one group; the button inside is separately focusable.
- SegmentedControl: `accessibilityRole="radiogroup"`, segments `radio` with `selected` state;
  label e.g. "3 minutes, selected".

## Copy
Keys `home.*`, `newRide.*`, `profile.*` in 09.

## Acceptance checklist
- [ ] Exactly one primary button visible in every Home state.
- [ ] Resume card appears when `getMyOpenRide()` returns a ride; it routes to lobby vs live by status.
- [ ] Threshold default 3 min, values 60/180/300 s sent to `createRide`; last choice remembered.
- [ ] Selected segment shows ✓ + colour.
- [ ] Leader of an open ride cannot start/join another without ending first.
- [ ] Theme preference applies immediately and persists.
