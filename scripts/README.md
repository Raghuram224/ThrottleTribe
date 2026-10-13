# scripts

## sim-riders.mjs

Bot riders against the real Supabase backend (anonymous auth, profile, `join_ride`, scripted GPS).

```
node --env-file=.env scripts/sim-riders.mjs --code 123456 [--riders 4] [--tick 5] \
  [--emulator emulator-5554] [--route mysuru] [--duration 900] [--propose 60]
```

- `--code` 6-digit ride code (create the ride in the app first). `--riders` 1-8 (default 4).
- `--tick` seconds between samples (default 5). `--duration` seconds after the ride becomes active (default 900).
- `--emulator <serial>` also drives the Android emulator GPS at 60 km/h along the same route (needs `~/Library/Android/sdk/platform-tools/adb`).
- `--propose <sec>` that long after the ride is active, Priya (bot 1, needs `--riders 2`+) proposes a coffee break at a real nearby café via `propose_stop` (Photon lookup, fallback café on the Mysuru road) so the leader can test Accept/Decline.
- Needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env`.

Bots wait in the lobby (sending stationary samples) until the leader starts the ride. Scenarios (seconds after start, editable in `CONFIG`):
bot 0 fuel stop 120-360 s, bot 1 tunnel 90-190 s (backlog upload), bot 2 SOS 200-320 s, bot 3 lagging at 40 km/h, others steady.
Ctrl-C (or ride end / duration) makes bots leave the ride and prints a summary.
