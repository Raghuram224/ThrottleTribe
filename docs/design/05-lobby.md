# 05 — Lobby (`ride/[id]/lobby.tsx`)

**Purpose:** gather the group before riding: share the code, watch people arrive, leader starts.
**One-second glance:** the code (huge) and "4 riders · 3 ready".

Data: ride store (`ride`, `members`, `positions`) via the ride layout's `useRideChannel`.
**Engineer note (store change):** expose Presence — on channel `presence` `sync`, set
`connectedUserIds: Set<string>` in the ride store (keys = `user_id` from `track`). Lobby needs it.

## Layout
```
┌──────────────────────────────────────┐
│ ‹  Sunday Run               ● Live ⋯ │ RideHeader (00 §2.3), line 2 "Lobby · 4 riders"
├──────────────────────────────────────┤
│ [banners]                            │
│  RIDE CODE                     (12b) │
│  4 8 1  2 5 9            (36/700)    │ RideCodeDisplay, tabular, letterSpacing 4
│ ┌──────────────────────────────────┐ │
│ │  ⇪  Share code                   │ │ secondary BigButton w/ icon
│ └──────────────────────────────────┘ │
│  Stop alert after 3 min       (14m)  │
│                                      │
│  Riders (4) · 3 ready          (16b) │
│ ┌──────────────────────────────────┐ │
│ │(AR) Arun (you)  ★ Leader  ✓ Ready │ │ MemberRow 64
│ │(PK) Priya            ✓ Ready     │ │
│ │(SM) Sam              ● Connected │ │
│ │(JO) Jo               ○ Away      │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│  Everyone ready? You can start any   │ leader: helper 14 muted
│  time — late riders can still join.  │
│ ┌──────────────────────────────────┐ │
│ │          Start ride              │ │ primary (leader)
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```
Rider footer instead:
```
│  ◌ Waiting for Arun to start   (20)  │ text, centred, pulsing dot (1.2 s, opacity 0.4↔1)
│ ┌──────────────────────────────────┐ │
│ │          Leave ride              │ │ secondary
│ └──────────────────────────────────┘ │
```

### Elements
- Code block: label `lobby.codeLabel` 12/700 uppercase muted; code shown as `XXX XXX` 36/700
  `text`, `fontNumeric`, letter-spacing 4; long-press the code = same as Share.
- Share → RN `Share.share({ message: lobby.shareMessage })` with ride name, grouped code and the
  link `throttletribe://join?code=XXXXXX`. Haptic `selection`.
- Threshold line: `lobby.threshold` ("Stop alert after N min") 14 muted.
- Member list (ScrollView, not virtualised; groups are small). Sort: me first, then leader, then
  by `joined_at`. Members with `left_at` are hidden.
- `MemberRow` (64 tall, padding 12/16, divider 1 `border`):
  `RiderAvatar` 40 (rider colour, initials, **no status ring in lobby**) · name 16/600 + "(you)"
  muted · `★ Leader` tag (12/700, `surface` pill, border 1) · right: readiness (icon + 14/700 text):

| Readiness | Rule | Display |
|---|---|---|
| Ready | position `updated_at` ≤ 60 s | `✓ Ready` on `status.moving` chip, dark text |
| Connected | in `connectedUserIds`, no fresh position | `● Connected` text only, `text` colour |
| Away | neither | `○ Away` text, `textMuted` |
| Me, not sharing | foreground denied | `Not sharing` amber chip (`status.stopped`) |

  "N ready" in the section title counts Ready rows.
- New member arrives: row slides in (150 ms) + light haptic for the leader only.

## States
| State | Behaviour |
|---|---|
| Loading (`!loaded`) | header + code skeleton (surface blocks), list shows 2 grey rows |
| `loadError` | inline ⚠ `errors.loadRide` + `common.tryAgain` (calls `load(id)`) |
| Only me | list shows my row + empty hint `lobby.emptyHint` ("Share the code. Riders appear here as they join.") |
| Viewer offline | offline banner; readiness of others may be stale (banner says so) |
| Ride becomes `active` | layout replaces with live; haptic `Success` (riders); toast `lobby.started` |
| Ride `ended` in lobby (leader cancelled) | layout → summary; summary shows "cancelled" variant (08) |
| Removed/left | layout → home |

## Interactions
- **Start ride (leader):** single tap is fine (not destructive). `startRide(id)` loading →
  layout navigates on the `ride` broadcast; if no broadcast within 3 s, navigate on RPC success.
  Error `not_leader_or_not_in_lobby` → toast `errors.not_leader_or_not_in_lobby`, refetch.
- **Leave ride (rider):** `ConfirmSheet` `lobby.leaveTitle`/`lobby.leaveBody`, confirm `lobby.leaveConfirm`
  (danger) → `leaveRide(id)` → `stopRideTracking()` → `replace('/home')`.
- **Leader cannot leave.** Ride menu (`⋯`) for the leader shows `lobby.cancelRide` instead →
  `ConfirmSheet` `lobby.cancelTitle`/`Body` → `endRide(id)`. If the server ever returns
  `leader_must_end_ride`, show its 09 message.
- Ride menu items (lobby): Share code · Leave ride (rider) / Cancel ride (leader) · Close.
- Back `‹` → home; ride continues (resume card).

## Accessibility
- Code read as digits: label `lobby.a11yCode` ("Ride code 4 8 1 2 5 9").
- MemberRow label: "Priya, ready" / "Arun, you, leader, ready".
- Waiting line is a live region so riders hear when it changes to started.

## Copy
Keys `lobby.*` in 09.

## Acceptance checklist
- [ ] Code is the largest text; grouped 3+3; tabular.
- [ ] Share sends name, code and link.
- [ ] Readiness uses icon + text; Ready/Connected/Away logic as table; presence added to store.
- [ ] Leader sees Start ride (primary) and Cancel in the menu; never "Leave".
- [ ] Rider sees "Waiting for <leader first name> to start" and Leave (confirmed).
- [ ] Every member auto-navigates to live within 1 s of the start broadcast.
