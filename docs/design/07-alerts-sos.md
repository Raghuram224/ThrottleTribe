# 07 — Alerts and SOS

**Purpose:** tell riders about changes that need attention, escalating only as far as the event deserves.
**One-second glance:** banner = "who + what + where" in one line; SOS = the whole screen is red.

Escalation ladder (non-negotiable rule 7):
| Event (`detectAlerts` kind) | In-app | Local notification | Haptic | Takeover |
|---|---|---|---|---|
| message | banner 8 s | yes (`ride-alerts`) | Warning | — |
| stopped | banner 15 s | yes | Warning | — |
| offline (seen before) | banner 15 s | yes | Warning | — |
| sos_cleared | banner 8 s | yes | Success | closes takeover |
| ended | navigate to summary | yes (background only) | Success | — |
| sos | takeover + pinned banner | yes (`ride-sos`, sound, bypass DnD) | Error ×5 | **yes** |

Alerts are raised only for other riders (`detectAlerts` already skips me) and only on transitions
(no flood on load).

## 1. Alert banner (`Banner`, slot 4 in 00 §2.5)
```
┌──────────────────────────────────────┐
│ ⏸  Priya stopped · 4.2 km behind  View ✕│  56–64 tall
└──────────────────────────────────────┘
```
| Kind | Bg | Text colour | Icon | Text (09 key) |
|---|---|---|---|---|
| stopped | `status.stopped` | `onStatus.stopped` | ⏸ | `alert.stopped` "Priya stopped · 4.2 km behind" |
| offline | `status.offline` | `onStatus.offline` | 📶 | `alert.offline` "Priya lost signal · last seen 4.2 km behind" |
| message | `surface` + 4 px `brand.primary` left bar | `text` | kind emoji | `alert.message` "Priya: Fuel stop" |
| sos_cleared | `status.moving` | `onStatus.moving` | ✓ | `alert.sosCleared` "Priya is OK — SOS cleared" |
Text 16/700, one line, truncate the **name** first (distance is never cut): build as
`<name>` (flex-shrink) + `<rest>` (no shrink). Distance phrase = the 06 line-1 phrase
(`With you` → "with you"; `away` → "3.1 km away"; unknown → omit).
- **View** (56 wide text button) → select that rider in the list/map (06 §4). Not shown for message
  kinds without a position.
- **✕** 56×56 closes. Tap on the banner body = View.
- Queue: one alert banner visible. Priority stopped/offline > message > sos_cleared; a newer
  same-priority alert replaces the current one after it has shown ≥ 3 s. Repeated alert for the
  same rider+kind replaces in place (no duplicates). Queue max 5; older ones drop.
- Shown on lobby and live (ride layout owns the queue).

## 2. Local notifications
Raised by `notifyAlert`. Copy must name the rider and include distance when known.
**Engineer change:** `detectAlerts` gets an optional `distanceText(userId)` (06 phrase) and
`rideName`; titles/bodies come from 09 keys `notif.*`:
| Kind | Title | Body |
|---|---|---|
| sos | `⚠ SOS from Priya` | `2.1 km behind you · tap to see where` |
| stopped | `Priya has stopped` | `4.2 km behind you · Sunday Run` |
| offline | `Priya lost signal` | `Last seen 4.2 km behind you` |
| sos_cleared | `Priya is OK` | `SOS cleared · Sunday Run` |
| message | `⛽ Fuel stop` | `From Priya · Sunday Run` |
| ended | `Ride ended` | `Sunday Run is over. See your summary.` |
- Foreground: set `content.data.kind`; the notification handler returns `shouldShowBanner:false,
  shouldPlaySound:false` when the app is active **unless kind is `sos`** (in-app banner already shows;
  SOS gets both so the sound plays).
- Tapping a notification opens `/ride/<id>/live` (SOS: with the takeover open).
- Android channels as in `alerts.ts` (`ride-alerts` high, `ride-sos` max + sound + bypass DnD).

## 3. SOS takeover — receivers (`SosTakeover`, overlay in ride layout)
Appears when a member's status becomes `sos` (or on load if a member is already in SOS and I have
not dismissed that SOS on this device).
```
┌──────────────────────────────────────┐ bg status.sosStrong, full screen, status bar light
│                                      │
│   ⚠  SOS                     (36/700) │ white
│   Priya needs help           (28/700) │
│                                      │
│   2.1 km behind you          (36/700) │ the key fact, tabular
│   Last position 1 min ago    (20)    │ white 90 %
│   Sent 10:42                 (16)    │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │  🧭  Navigate to Priya           │ │ white bg, sosStrong text 20/700, 72 tall
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │  🏍  I'm on my way               │ │ transparent, white 2 px border, white text, 72
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │        Dismiss                   │ │ text button 56, white
│ └──────────────────────────────────┘ │
│   +1 more SOS                  (16)  │ only when queue > 1 → tap shows next
└──────────────────────────────────────┘
```
- Data: name + distance phrase (06), last position age from `positions[userId].updatedAt`
  (fallback: event payload lat/lng, "Position unknown" if none), `sosAt` clock time (device locale).
  Updates live while open (distance, age).
- **Navigate** → opens turn-by-turn to the SOS rider's last position:
  Android `google.navigation:q=<lat>,<lng>` (fallback `geo:<lat>,<lng>?q=<lat>,<lng>(Priya)`),
  iOS `http://maps.apple.com/?daddr=<lat>,<lng>&dirflg=d`. Disabled with text `sos.noPosition`
  when no position. Takeover stays (minimised to banner) when returning.
- **I'm on my way** → sends a message so the group (and the SOS rider) know help is coming.
  **Do not reuse `all_good`** — "👍 All good" during an SOS would tell everyone the emergency is over.
  **Backend request:** add message kind `on_my_way` (label "On my way", icon 🏍) to
  `send_ride_message` validation and `MESSAGE_KINDS`; exclude it from the quick-messages grid
  (only offered here). Until that ships, **hide this button**.
  After sending: button shows `✓ Sent` disabled; banner for others `alert.message` "Sam: On my way".
- **Dismiss** → takeover closes into the **pinned SOS banner** (slot 1): `sosStrong` bg, white
  16/700 `⚠ SOS — Priya · 2.1 km behind` + `View` (re-opens takeover). Not closable while that
  rider's SOS is on.
- SOS cleared (`sos_cleared` or member.sos false) → takeover/banner close, green banner
  `alert.sosCleared`, haptic Success.
- Multiple SOS: queue newest first; "+N more SOS" link; pinned banner shows the count.
- Sound & haptics on appear: notification sound (SOS channel) once; `Haptics.notificationAsync(Error)`
  every 1.5 s, 5 times, stopped by any button press. No looping in-app alarm in MVP (no audio
  dependency); revisit with `expo-audio` after the first real-ride test.
- Back button / Android back = Dismiss.

## 4. SOS — sender (`HoldButton` in the action bar)
**Hold to send** (`timing.sosHoldMs` 2 s):
- Press-in: ring progress around the button border (3 px, white) fills clockwise over 2 s; label
  changes to `sos.holding` "Keep holding…"; haptic `impact Light` at start, `Medium` at 1 s.
- Release early: ring rewinds in 200 ms, label back, toast `sos.holdHint` "Hold for 2 seconds to send SOS".
- Complete: haptic `notification Error`, `setSos(id, true)`.
- Works in Lobby? **No** — SOS lives on the live screen only (lobby = everyone together, parked).

**SOS active state (my screen):**
```
┌──────────────────────────────────────┐
│ ⚠ SOS on — your group was alerted  📞 112 │ pinned banner, sosStrong, white 16/700
├──────────────────────────────────────┤
│ ... live screen as usual ...         │ MeRow chip "⚠ SOS on"
├──────────────────────────────────────┤
│ ┌────────┐ ┌──────────────────────┐  │
│ │💬 Msg  │ │ Hold to cancel SOS   │  │ white bg, sosStrong 2px border + text
│ └────────┘ └──────────────────────┘  │
└──────────────────────────────────────┘
```
- `📞 112` action (56×56, label `sos.call`) → `Linking.openURL('tel:112')` (112 routes to emergency
  services on most mobile networks, including India and the EU). Default 112; a per-country number
  is a later preference.
- **Cancel:** same HoldButton gesture, 2 s (`sosCancelHoldMs`) → `setSos(id, false)` → banner
  `sos.cancelled` "SOS cancelled" (green, 3 s).
- **Sending failed / offline:** banner text becomes `sos.retrying` "Sending SOS… no signal, retrying";
  retry every 5 s until success or cancel; on success the text switches to the active text.
  Never silently drop an SOS.
- Leave/End while my SOS is on: the confirm sheet adds `sos.leaveWarning`; on confirm call
  `setSos(id, false)` first, then `leaveRide`/`endRide` (do not rely on the server clearing it).

## 5. Accessibility
- Takeover: `accessibilityViewIsModal`, focus to the title, announces "SOS. Priya needs help.
  2.1 kilometres behind you." Buttons labelled with the rider name.
- Banners: live region polite (SOS: assertive).
- HoldButton screen-reader path: double-tap opens ConfirmSheet `sos.a11yConfirm` → confirm sends.
- Reduce Motion: no pulse, progress ring still animates (it is functional feedback).
- Contrast: white on `#B91C1C` 6.5:1; dark on amber 8.3:1; dark on grey 7.6:1; dark on green 8.6:1.

## Copy
Keys `alert.*`, `notif.*`, `sos.*` in 09.

## Acceptance checklist
- [ ] Each kind follows the escalation table; only SOS takes over the screen.
- [ ] Banners show name + what + distance; name truncates first; View selects the rider.
- [ ] No duplicate OS banner in foreground except SOS.
- [ ] Takeover shows distance as the largest fact; Navigate opens maps on both platforms.
- [ ] "I'm on my way" never sends `all_good`; hidden until `on_my_way` exists.
- [ ] Dismiss leaves a non-closable SOS banner until cleared.
- [ ] Sender: 2 s hold with visible ring; early release cancels; cancel also needs 2 s hold.
- [ ] Offline SOS retries every 5 s with visible "retrying" state.
