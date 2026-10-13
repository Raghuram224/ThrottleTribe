# GitHub Release 1.0.0

Tag: `v1.0.0`. Attach the signed APK as **`throttle-tribe.apk`** (the exact filename, so the site's `releases/latest/download/throttle-tribe.apk` link works).

## Release title

```
Throttle Tribe 1.0.0: first Android release
```

## Release body

```markdown
Throttle Tribe keeps your riding group together. One live map shows who is ahead, behind, stopped or out of signal, and one tap sends an SOS to every rider in your ride.

## What it does
- Create a ride, share a 6-digit code or link. Friends join with just a riding name. No password.
- Live map and a simple rider list: ahead, behind, stopped, no signal.
- Stop alerts after 1, 3 or 5 minutes (your choice). "No signal" is never confused with "stopped".
- SOS with your location to every rider in your ride, plus six quick messages: Fuel stop, Puncture, Slow down, Regroup, Break, All good.
- Save up to 5 emergency contacts. After an SOS you get one-tap Call and "Text my location" buttons. You tap; nothing is sent for you.
- Location is shared only with riders in your current ride, and only while the ride is open.

## Install (Android)
1. Download `throttle-tribe.apk` below and open it.
2. If Android blocks it, tap Settings and allow "Install unknown apps" for your browser or Files app, then go back and tap Install.
3. If Google Play Protect warns that the developer is new, tap More details, then Install anyway. This notice appears for any app from a developer Play Protect has not seen before.
4. Open the app, pick a riding name, allow location.

Optional: check the download against the checksum below.

APK SHA-256: <fill>

## iPhone
There is no iPhone app yet. Use the web app in Safari: https://raghuram224.github.io/throttletribe/app/
It shares your location only while the page is open and the screen is on. Lock the phone or switch apps and your group stops seeing you.

## Known limitations
- Native app is Android only. The Play Store listing comes later.
- iPhone web app needs the page open and the screen on to share location.
- Tested on Android emulators and simulated riders so far. Real-world group rides may reveal rough edges, so please report them.
- Needs mobile data to share locations. With no signal, updates reach the group when you are back online.
- SOS alerts the riders in your ride only. It does not contact emergency services and the app does not detect crashes. In India, dial 112.
- No offline maps yet.

Privacy: https://raghuram224.github.io/throttletribe/privacy/
Delete your account and data: https://raghuram224.github.io/throttletribe/delete/
Found a problem? Open an issue on this repository.
```

Before publishing: replace `<fill>` with `shasum -a 256 throttle-tribe.apk` output.
