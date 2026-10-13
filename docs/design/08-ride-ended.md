# 08 — Ride ended (`ride/[id]/summary.tsx`)

**Purpose:** close the ride calmly: how long, how far, who rode, where people stopped, any SOS.
**One-second glance:** "Ride over · 2 h 14 min · 86 km" — and that location sharing has stopped.

Arrival: the ride layout sees `ride.status === 'ended'` → `stopRideTracking()` → `replace` here.
At rest, so more detail is fine; keep-awake released.

## Data
- Duration: `ended_at − started_at` (`formatDuration`, floor). Cancelled-in-lobby (no `started_at`)
  → cancelled variant.
- My distance: sum of `haversineM` between my consecutive `ride_samples` for this ride
  (**engineer:** add `fetchMySamples(rideId)` — same shape as the leader-trail query, my `user_id`),
  ignoring jumps with implied speed > 250 km/h (GPS spikes). Show "—" if unavailable.
- Riders: members incl. those who left (left ones marked "left early").
- Stops: `ride_events` type `stopped` (payload `since`, `lat`, `lng`), oldest first.
- SOS: `sos` events paired with the next `sos_cleared` for the same user.
- **Engineer:** the snapshot holds only the newest 50 events; summary must fetch all events for the
  ride (`order created_at asc`, limit 500).

## Layout
```
┌──────────────────────────────────────┐
│  Ride over                    (28)   │
│  Sunday Run · Sun 12 Oct      (16m)  │
│  ✓ Location sharing stopped   (14)   │ moving-green ✓ + text
│ ┌───────────┬───────────┬──────────┐ │ stat tiles: surface, radius 16, 96 tall
│ │ 2 h 14 min│  86 km    │    6     │ │ value 28/700 tabular
│ │ Duration  │ You rode  │ Riders   │ │ label 14 muted
│ └───────────┴───────────┴──────────┘ │
│                                      │
│  SOS (1)                     (20/600)│ section only if any
│ ┌──────────────────────────────────┐ │
│ │ ⚠ Priya · 11:05 → cleared 11:09   │ │ row 56, 4 px sosStrong left bar
│ └──────────────────────────────────┘ │
│  Stops (3)                   (20/600)│
│ ┌──────────────────────────────────┐ │
│ │ ⏸ Sam · 10:12                     │ │ row 56, 4 px stopped left bar
│ │ ⏸ Priya · 10:58                   │ │
│ │ ⏸ Jo · 11:40                      │ │
│ └──────────────────────────────────┘ │
│  Riders                      (20/600)│
│  (AR) Arun ★ Leader                  │ 48 rows
│  (PK) Priya                          │
│  (JO) Jo · left early                │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │          Back to home            │ │ primary
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```
- Header area: title `summary.title` 28/700; meta = ride name + date (device locale, short);
  confirmation `summary.sharingStopped` with ✓ (privacy reassurance).
- Stat tiles: three equal tiles, gap 8. Values tabular; distance format from 06 (`86 km`, `4.2 km`).
- SOS rows (before stops — more important): `⚠ <name> · <time>` + ` → cleared <time>` or
  ` → not cleared` when no matching cleared event.
- Stop rows: `⏸ <name> · <time of since>`; consecutive stops by the same rider within 2 min merge.
  Tap a row → small map sheet (`Sheet` with a 240-tall static MapLibre map centred on lat/lng,
  zoom 15, one marker) — optional, P2; MVP rows are not tappable.
- Empty stops: `summary.noStops` ("No stops longer than 3 min.") with the ride's threshold.
- Riders list: `RiderAvatar` 32 (no ring), name, leader tag, `summary.leftEarly`. Sort: leader, then joined order.
- Scroll body; footer pinned.

## Variants & states
| Case | Change |
|---|---|
| Cancelled in lobby | title `summary.cancelledTitle` "Ride cancelled"; hide stat tiles, stops, SOS; show riders |
| Loading events | tiles show values from store; sections show a 2-row skeleton |
| Load error | sections replaced by `errors.loadRide` + Try again; tiles stay |
| Offline | banner; Back to home still works |
| I left early (arrived via left) | not shown — leaving goes to home (00) |

## Interactions
- Back to home → `replace('/home')` (clear the ride stack: `router.dismissAll()` then replace).
  Calls `useRideStore.reset()`.
- Android back / ‹ = same.
- No "ride again" or share in MVP.

## Accessibility
- Tiles read as "Duration, 2 hours 14 minutes" etc.
- SOS/stop rows read full sentence: "Priya sent SOS at 11:05, cleared at 11:09".

## Copy
Keys `summary.*` in 09.

## Acceptance checklist
- [ ] Shown to every member automatically when the leader ends the ride.
- [ ] Tracking stopped before this screen renders; confirmation line visible.
- [ ] Duration floors; my distance filters GPS spikes; "—" when unknown.
- [ ] SOS section above stops; SOS without clear says "not cleared".
- [ ] All events fetched (not just the snapshot's 50).
- [ ] Cancelled variant when the ride never started.
