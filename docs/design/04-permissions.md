# 04 — Permissions (`(app)/permissions.tsx?rideId=…`)

**Purpose:** explain why location (and notifications) matter *before* the OS asks, then ask, in the
order the platforms require. Denial never blocks the ride — it only stops my sharing.
**One-second glance:** "My group sees me only during a ride; tap Allow."

## When it is shown
After `createRide` / `joinRide` succeeds and before entering the ride, read `getPermissionState()`
and `Notifications.getPermissionsAsync()`:
- Show the screen if foreground is `undetermined`, **or** background is `undetermined`, **or**
  notifications are undetermined. Start at the first step still needed.
- Everything `granted` → skip straight to the ride and call `startRideTracking(rideId)`.
- Anything `denied` (already answered) → skip the screen; the ride shows the "Not sharing" banner
  (§Denied). We never nag with a full screen twice.
Also reached from the "Fix" action on the banner (opens step for the missing permission, or the
system settings when the OS will not ask again).

Never shown on first app launch (privacy rule: ask at the moment of use).

## Layout (one screen, three steps, same frame)
```
┌──────────────────────────────────┐
│  Step 1 of 3            Skip(56) │  14 muted · Skip = text button, right
│                                  │
│        ┌────────┐                │
│        │  📍    │  72 tile, brand │
│        └────────┘                │
│  Share your position with  (28)  │
│  your group                      │
│                                  │
│  • Your group sees where you are │  16, gap 12
│    only during this ride.        │
│  • Sharing stops when the ride   │
│    ends or you leave.            │
│  • Nobody outside the ride can   │
│    see it.                       │
│                                  │
│ ┌──────────────────────────────┐ │
│ │       Allow location         │ │ primary
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

### Step 1 — Location while using (`perm.loc.*`)
- Primary `perm.loc.cta` → `Location.requestForegroundPermissionsAsync()`.
- Granted → step 2. Denied → go to ride with "Not sharing" banner (skip step 2, go to step 3).

### Step 2 — Keep sharing when locked (`perm.bg.*`)
Platform-specific text (the OS wording differs):
- Android: title `perm.bg.title`, bullets `perm.bg.why`, plus an **instruction card** (`surface`,
  radius 12, padding 16, 16/700): `perm.bg.androidHow` ("On the next screen choose **Allow all the
  time**"). Android 11+ opens Settings — the card tells them to come back with Back.
- iOS: same title/why, instruction `perm.bg.iosHow` ("Choose **Change to Always Allow** when iOS
  asks"). iOS may show the upgrade prompt later, not immediately; that is expected — continue.
- Primary `perm.bg.cta` → `startRideTracking(rideId)` (it re-uses the granted foreground and
  requests background). Result:
  - `ok:true, backgroundGranted:true` → step 3.
  - `ok:true, backgroundGranted:false` → step 3; ride shows the amber "Keep the app open" banner.
  - `ok:false, 'foreground-denied'` → step 3; "Not sharing" banner.
  - `ok:false, 'start-failed'` → inline ⚠ `perm.startFailed` + `common.tryAgain`; Skip still works.
- Skip (top right) → `startRideTracking` is still called (foreground tracking works while open).

### Step 3 — Alerts (`perm.notif.*`)
Bullets: stopped riders, lost signal, SOS. Primary `perm.notif.cta` → `setupNotifications()`
(creates Android channels and asks). Either answer → `replace('/ride/<id>/lobby|live')`.
`setupNotifications()` must also run (silently, no prompt if already answered) on every ride entry
so channels exist.

Tracking ownership: `ride/[id]/_layout.tsx` on mount calls `startRideTracking(rideId)` when
foreground is granted and `isTracking()` is false (covers the skipped-screen path and app restarts).

Step indicator: "Step n of N" where N counts only the steps being shown.

## Denied / degraded behaviour (shown in the ride, 00 §2.5 banner slot 3)
| Situation | In ride | Banner (amber `status.stopped`, dark text) |
|---|---|---|
| Foreground denied | I can see everyone, I'm not on their map. Me row reads "Not sharing". SOS still works (sends last known/no position). | `banner.notSharing` + action `banner.fix` |
| Background denied | Sharing works while the app is open; stops when locked. | `banner.bgOff` + `banner.fix`, closable (✕), reappears next ride |
| Notifications denied | In-app banners + haptics only. | lobby only, once per ride: `banner.notifOff`, closable |
| Location services off (device) | same as foreground denied | `banner.gpsOff` + `banner.fix` |

"Fix": if `canAskAgain` → re-run the relevant step; else `Linking.openSettings()`. On returning
to the app (AppState `active`) re-check and restart tracking when newly granted.

## Accessibility
- Step heading is the first focus; bullets are one text block.
- Skip has label `perm.a11ySkip` ("Skip, continue without this").
- Instruction card's bold phrase matches the OS button text exactly.

## Copy
Keys `perm.*`, `banner.*` in 09. Marketing may refine bullets; the OS-button phrases must stay exact.

## Acceptance checklist
- [ ] Never asks at app launch; asks only after create/join.
- [ ] Foreground is requested before background, with the step-2 explainer between them.
- [ ] Android path explains "Allow all the time" and survives the round-trip to Settings.
- [ ] Denying anything still lands in the ride; viewer sees everyone.
- [ ] Banner "Fix" re-asks or opens Settings; returning re-checks and starts tracking.
- [ ] Notification channels are created on every ride entry.
