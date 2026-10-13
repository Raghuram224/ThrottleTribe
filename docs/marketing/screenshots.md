# Screenshot captions

Six screenshots, same order on both stores. Headline limit 30, sub limit 60; counts shown. Screen names
map to the routes in `docs/design/*.md` (not yet available when this was written; rename to match).
Show dark or light consistently across the set. Use rider names that look like real riders (Arun, Meera,
Karthik, Imran) and a recognisable Indian route, but no real people or brands.

| # | Screen to capture | Headline (max 30) | Sub (max 60) |
|---|---|---|---|
| 1 | Live ride: map with 5 rider markers, rider list showing ahead / behind / stopped | **Your whole tribe, one map** (25) | See who's ahead, behind or stopped, live. (41) |
| 2 | Create ride: ride name field, stop-alert time chips (1 / 3 / 5 min) | **Start a ride in seconds** (23) | Pick a name, create a ride, share the code. (43) |
| 3 | Lobby: big 6-digit code, share button, riders joining | **Join with 6 digits** (18) | Friends enter the code or tap your link. (40) |
| 4 | Live ride: banner "Arun stopped 4 min" over the map | **Know when someone stops** (23) | Choose 1, 3 or 5 minutes. Get an alert. (39) |
| 5 | Live ride: one rider grey "No signal, last seen 2 min ago" next to a "Stopped" rider | **No signal is not stopped** (24) | We tell them apart, so you don't worry. (39) |
| 6 | SOS receiver screen or the quick-message sheet (six message buttons) | **Help, one tap away** (18) | SOS and quick messages go to your ride. (39) |

Alternates (if a screen is weak): "Built for gloves and sunlight" (29) with "Big buttons. High contrast. Dark mode." (38), mapped to the live ride in dark mode.
Optional 7th (Play only): ride summary, "Every ride, wrapped up" (22) / "See your ride summary when the leader ends it." (46). Check summary fields in the build before using.

## Guardrails for imagery

- No device frames showing a "crash detected" or "emergency services" idea.
- SOS screen: show the "does not call emergency services" line where space allows.
- No map areas with a real person's home or live location; use test data.
- Status must show colour + icon + text (as in the app), not colour only.
