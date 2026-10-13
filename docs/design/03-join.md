# 03 — Join with code (`src/app/join.tsx`)

**Purpose:** get into a friend's ride by typing, pasting or tapping a link with a 6-digit code — with gloves on.
**One-second glance:** six big boxes; how many digits are filled; a clear red line when the code is wrong.

Route is at the root (not in `(app)`) so the deep link `throttletribe://join?code=123456` resolves
even before onboarding. Read `code` with `useLocalSearchParams()`.

## Deep-link handling
1. Strip non-digits from `code`; if exactly 6 digits → valid, else ignore it (empty boxes).
2. No profile yet → save `pendingJoinCode` (persistent storage) → `replace('/welcome')`.
   Onboarding finishes on `/join?code=…` (01). Clear `pendingJoinCode` after use.
3. Profile exists → prefill boxes and **auto-submit** (show the submitting state immediately).
   A link is an explicit intent; an extra tap only slows riders at the meeting point.

## Layout
```
┌──────────────────────────────────┐
│ ‹  Join a ride                   │
│                                  │
│  Enter the ride code       (28)  │
│  Ask the leader for the 6 digits.│
│                            (16m) │
│ ┌────┐┌────┐┌────┐ ┌────┐┌────┐┌────┐
│ │ 4  ││ 8  ││ 1  │ │ 2  ││ ▌  ││    │  48×64 boxes, digit 36/700 tabular
│ └────┘└────┘└────┘ └────┘└────┘└────┘
│  ⚠ No ride with that code. Check │  error line (16/700), only on error
│    the 6 digits.                 │
│  Long-press the boxes to paste.  │  hint 14 muted
│ ┌──────────────────────────────┐ │
│ │           Join               │ │ primary, enabled at 6 digits
│ └──────────────────────────────┘ │
│ [ 1 ][ 2 ][ 3 ]                  │ system number pad
│ [ 4 ][ 5 ][ 6 ] ...              │
└──────────────────────────────────┘
```
- `CodeInput`: one hidden `TextInput` (`keyboardType="number-pad"`, `inputMode="numeric"`,
  `maxLength={6}`, `autoFocus`, `textContentType="oneTimeCode"`, `autoComplete="one-time-code"`
  so iOS/Android suggest codes from messages) laid absolutely over the six visual boxes, full row
  size, `opacity: 0.01` (not 0 — Android ignores touches on fully transparent inputs), `caretHidden`.
  Tap focuses it; long-press opens the native Paste menu.
- Boxes: `size.codeBox` 48×64, gap 8, extra gap 16 between box 3 and 4 (grouping matches
  "123 456" in the lobby). Total width 48·6 + 8·4 + 16 = 336 → on narrow screens (< 368 dp) reduce
  gaps to 4/12 (total 324). Border 2 `border`, radius 12, `surface` bg.
  Active box (next to fill): border 3 `brand.primary` + blinking caret. Filled: `text` digit.
  Error: all borders 3 `status.sosStrong`.
- **Paste:** the hidden input accepts system paste (long-press). Any change runs
  `value.replace(/\D/g, '').slice(0, 6)`, so "Code: 123 456" works. No clipboard library and no
  separate Paste button; hint `join.pasteHint` 14 muted under the boxes (hidden while an error shows).
- Footer primary `join.cta`, disabled until 6 digits. **Auto-submits on the 6th digit**; the button
  is the fallback after an error.
- Footer rides above the keyboard (KeyboardAvoidingView).

## States
| State | Visual |
|---|---|
| Empty | first box active, Join disabled |
| Typing | filled boxes, next active |
| Submitting | boxes dimmed (opacity 0.6), Join `loading`, input not editable |
| Success | haptic `Success`; ride `lobby` → permissions (if needed, 04) → lobby; ride `active` → permissions → live |
| `ride_not_found` | haptic `Error`, red borders, error line `errors.ride_not_found`, boxes keep digits, typing any digit clears all and restarts at box 1 |
| `network` | error line `errors.network`, Join enabled as "Try again" |
| `profile_required` | `replace('/name')` with pending code saved |
| `not_authenticated` / `unknown` | error line from 09, Try again |
| Offline (viewer) | offline banner (00 §2.5) above heading; Join still tries |

## Already in a ride
On submit, if `getMyOpenRide()` returns a different ride:
- I'm a **rider** there → `ConfirmSheet` `join.switchTitle` / `join.switchBody` (names the old ride),
  confirm `join.switchConfirm` → `leaveRide(old)` + `stopRideTracking()` → `joinRide(code)`.
- I'm the **leader** there → sheet `home.leaderBusyTitle`/`Body`, single action "Go to <ride>".
- Same ride → just navigate to it.

## Accessibility
- The hidden input is the accessible element: label `join.a11yInput`, value read as digits
  ("4 8 1 2, 4 of 6 digits"). Boxes are `importantForAccessibility="no-hide-descendants"`.
- Error line uses `accessibilityLiveRegion="assertive"` (Android) / `AccessibilityInfo.announceForAccessibility` (iOS).
- Digits ignore font scaling above 1.3 (fixed boxes).

## Copy
Keys `join.*` and `errors.*` in 09.

## Acceptance checklist
- [ ] Number pad opens automatically; boxes ≥ 48×64; whole row tappable.
- [ ] Pasting "Code: 123-456" fills 123456.
- [ ] 6th digit auto-submits; errors keep digits; next keystroke restarts.
- [ ] `throttletribe://join?code=123456` works cold (no profile: after onboarding; with profile: auto-join).
- [ ] Every RideError code shows its 09 message; ride_not_found shows red boxes + haptic.
- [ ] Mid-ride join (`active`) goes to live, not lobby.
