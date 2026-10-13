# Throttle Tribe — architecture contract

Decisions are fixed here so every implementer builds against the same contract.
Stack: Expo SDK 57, React Native 0.86 (New Architecture), Expo Router (`src/app/`), TypeScript strict,
Zustand, Supabase (Auth, Postgres, Realtime), MapLibre RN v11 + OpenFreeMap, expo-location +
expo-task-manager, expo-notifications (local), expo-haptics, expo-keep-awake, NetInfo. Android + iOS only.

## Backend (applied: `supabase/migrations/0003_rides.sql`)

Clients **never** write `rides`, `ride_members`, `rider_positions` or `ride_events` directly.

| Write path | How |
|---|---|
| Profile | `profiles` upsert of own row (`id = auth.uid()`), `display_name` 1–40 chars |
| Create / join / start / end / leave | RPCs `create_ride(p_name, p_stop_threshold_s)`, `join_ride(p_code)`, `start_ride(p_ride_id)`, `end_ride(p_ride_id)`, `leave_ride(p_ride_id)` |
| SOS | RPC `set_sos(p_ride_id, p_on)` |
| Quick message | RPC `send_ride_message(p_ride_id, p_kind)`; kinds: `fuel`, `puncture`, `slow_down`, `regroup`, `break`, `all_good` |
| GPS | insert into `ride_samples` (own `user_id` defaulted by DB) via upsert `onConflict: 'ride_id,user_id,recorded_at', ignoreDuplicates: true`. Allowed while ride status is `lobby` or `active`. |

Triggers (server side):
- each `ride_samples` insert updates `rider_positions` (latest per member; late/out-of-order samples
  never move a rider backwards) and maintains `slow_since` (first time speed < 3 km/h; null when moving;
  unchanged when speed is null). When `recorded_at - slow_since >= rides.stop_threshold_s` it inserts one
  `ride_events` row of type `stopped`.
- changes are broadcast on the **private** Realtime channel `ride:<ride_id>` with events:
  `position` (rider_positions row), `member` (ride_members row), `ride` (rides row), `event` (ride_events row).
  Payload = the row as JSON. Only active members can join the channel (RLS on `realtime.messages`).
  Presence is allowed on the same channel.

Errors raised by RPCs (message text): `not_authenticated`, `profile_required`, `ride_not_found`,
`not_leader_or_not_in_lobby`, `not_leader_or_already_ended`, `leader_must_end_ride`,
`invalid_message_kind`, `not_a_member`.

Generated types: `src/lib/database.types.ts` (regenerate after schema changes).

## Client rules

- Subscribe: `supabase.channel('ride:' + id, { config: { private: true } })`, call
  `await supabase.realtime.setAuth()` before subscribing. On (re)subscribe, refetch the snapshot
  (ride, members + profiles, positions, recent events, leader trail) so missed broadcasts don't matter.
- Status (pure function, `src/lib/rider-status.ts`), evaluated against `Date.now()`:
  1. member.sos → `sos`, since `sos_at`
  2. no position, or `now - position.updated_at > 60 s` → `offline`, since `updated_at` (null if never seen)
  3. `slow_since` and `now - slow_since >= stop_threshold_s` → `stopped`, since `slow_since`
  4. else `moving`, since null
  "No data is not the same as stopped." Never infer `stopped` from missing samples.
- Own connectivity: if NetInfo says offline or the channel is not `SUBSCRIBED`, show a "You're offline"
  banner; other riders' grey state may be our own fault.
- Ahead/behind (`src/lib/geo.ts`, pure): project each rider onto the **leader's trail** (leader's
  `ride_samples` ordered by `recorded_at`, downsampled to ≥ 20 m spacing, extended live by leader
  `position` broadcasts). `alongKm` = distance along trail to the projection (+ distance past the end when
  beyond the last point). If a rider is > 500 m from the trail, fall back to straight-line distance and
  mark `offTrail` (no ahead/behind label). Before the trail has 2 points, use straight-line distance.
  Leader is `alongKm` of the leader's latest point.
- Background location: one task (`LOCATION_TASK`) defined at module top level, imported by the root
  layout. Current ride id lives in persistent storage (headless task has no React state). Persistent
  queue + batched upsert, as proven in the Phase 1 spike. Start when entering the lobby, stop on
  end/leave.
- Alerts are local notifications raised by the app when another rider's derived status changes to
  `stopped`, `offline` (after it was seen), or `sos`, and on quick messages / ride ended. Android channels:
  `ride-alerts` (high) and `ride-sos` (max, sound). Haptics accompany in-app alerts. No remote push yet.
- Design: tokens in `src/theme/tokens.ts` only; 56 px touch targets; status = colour + icon + text;
  primary actions at the bottom; dark mode supported.
- Map: `@maplibre/maplibre-react-native` v11 exports `Map` (`mapStyle`), `Camera` (ref: `fitBounds`,
  `flyTo`, `easeTo`, `jumpTo`), `Marker` (custom React child view), `GeoJSONSource` (`data`), `Layer`.
  Style URLs: light `https://tiles.openfreemap.org/styles/liberty`, dark-ish fallback
  `https://tiles.openfreemap.org/styles/positron`. Show OSM attribution. Verify props against
  `node_modules/@maplibre/maplibre-react-native/lib/typescript/module/**/*.d.ts`.

## Testing

`scripts/sim-riders.mjs` runs bot riders against the real backend (anonymous sign-in, profile, join by
code, scripted GPS + scenarios: fuel stop, tunnel/signal loss with backlog upload, SOS, lagging rider) and
can also drive the Android emulator's GPS along the same route via `adb emu geo fix`.
Pure logic (`rider-status`, `geo`, `format`) has Jest tests (`jest-expo` preset).
