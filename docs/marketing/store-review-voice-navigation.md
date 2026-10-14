# Store review texts: spoken navigation (solo navigation, P3)

Drafted for whoever submits the next store builds. Nothing here has been submitted. Source: `docs/design/21-solo-navigation.md` §4.5.7. Marked ✎ = marketing may refine the wording.

The next store build adds the iOS `audio` background mode (spoken directions with the phone locked). It adds **no** new Android permission and **no** new Android foreground-service type: the existing location foreground service already keeps the app running.

## Apple: App Review notes (iOS `audio` background mode) ✎

Paste into App Store Connect, App Review Information, Notes:

> Throttle Tribe gives turn-by-turn spoken directions during a navigation ride. The "audio" background mode lets these spoken directions continue when the phone is locked or another app is in front, as in other navigation apps. The app plays no other audio. Its audio session is active only while a direction is being spoken. The "location" mode keeps the rider's position updating for the directions and for sharing with their riding group; it stops when the ride ends. To test: sign in → Where to? → pick a place → Go → lock the phone while moving (or simulate a route with a GPX file).

Reviewer checklist (what they will look for): the audio mode is used for real spoken directions; the app does not record audio (no microphone permission string is shipped, `NSMicrophoneUsageDescription` is absent); audio stops when the ride ends.

## Google Play: location foreground-service declaration ✎

No new permission and no new foreground-service type. Update the text of the existing **location** foreground-service declaration:

> During a ride, a location foreground service shares the rider's position with their group and gives turn-by-turn directions, including spoken directions while the screen is off. It runs only during a ride and stops when the ride ends.

- Re-record the declaration video to show a spoken prompt with the screen off.
- `FOREGROUND_SERVICE_MEDIA_PLAYBACK` is **not** declared and must not be added (the `expo-audio` plugin is configured with `enableBackgroundPlayback: false`). `RECORD_AUDIO` is blocked in `app.json`.
- Data safety: no change (no new data collected; the destination already goes only to ride members, and OpenStreetMap search and routing receive coordinates as described in `whereTo.locBody`).

## Optional wording for marketing ✎

`locationAlwaysAndWhenInUsePermission` (iOS) may add "and give spoken directions". Not needed for review; not changed in this build.

## Known Android limits to keep in the release notes of the dev / beta build

- No music ducking: prompts mix over a rider's music at the same level.
- A prompt may be spoken during a phone call (no call-state signal without `READ_PHONE_STATE`, which we do not request).
- Swipe-away from Recents keeps voice (patched expo-speech; re-verify on each expo-speech upgrade).
- Follow-up: a small local native module requesting transient audio focus around each prompt fixes both.
