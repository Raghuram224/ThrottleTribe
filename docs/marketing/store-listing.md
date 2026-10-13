# Store listings: Google Play and App Store

All counts are characters, verified by script (spaces and punctuation included). Language: English (India).
Category suggestion: Google Play "Maps & Navigation" (alternative: "Travel & Local"); App Store primary "Navigation", secondary "Travel". Content rating: Everyone / 4+ (confirm questionnaire; location sharing between users may raise the rating on some forms).

## Google Play

### Title (limit 30)
Count: **27/30**
```
Throttle Tribe: Group Rides
```

### Short description (limit 80)
Count: **80/80**
```
See who's ahead, behind or stopped on your group ride. One-tap SOS to the group.
```

### Full description (limit 4000)
Count: **2989/4000** (same text used for the App Store description)
```
Riding with friends is better when nobody gets left behind. Throttle Tribe shows your whole group on one live map, so you can see who is ahead, who is behind, who has stopped and who has lost signal.

Made for riding groups: weekend trips, club rides, long tours.

START OR JOIN IN SECONDS
- Enter your riding name. No password, no sign-up form.
- Create a ride and share the 6-digit code or a link.
- Invite riders from your contacts. The app opens a ready-to-send text; you tap send.
- Friends join with the code or the link. The leader starts the ride when everyone is ready.

SEE YOUR GROUP AT A GLANCE
- Live map with every rider in your ride.
- A simple rider list: ahead, behind, stopped, no signal or SOS.
- Distances are measured along the leader's path, so "2 km behind" means something.
- Big buttons and high contrast, made for a quick look at a phone on the handlebar.

STOP ALERTS
- Pick how long a stop should count: 1, 3 or 5 minutes.
- Get an alert when a rider stops or loses signal.
- We never confuse "no signal" with "stopped". If you are offline, the app tells you, so you know the grey rider may be your own signal.

SOS AND QUICK MESSAGES
- One tap sends an SOS with your location to everyone in your ride.
- Six quick messages, no typing: Fuel stop, Puncture, Slow down, Regroup, Break, All good.
- The sender can cancel the SOS any time with "I'm OK".

YOUR EMERGENCY CONTACTS
- Save up to 5 people, like family, an ambulance number or the police.
- After an SOS you get one-tap Call buttons and a "Text my location" button. They open your phone or messages app. You tap call or send; nothing is sent for you.
- Your contacts are private. Riders in your ride can see them only while your SOS is active.

YOUR ACCOUNT
- Start as a guest with no sign-up. Optionally save your account with an email or phone code to keep your rides and sign in on a new phone.

PRIVATE BY DESIGN
- Your location is shared only with riders in your current ride.
- Sharing runs only while a ride is open. It stops when the ride ends or you leave.
- Background location is used only during a ride, so your group can still see you while your phone is locked.
- We don't upload your phone contacts. Ride location history is deleted 30 days after a ride ends.
- Delete your account and data any time, inside the app.

AFTER THE RIDE
- See your ride summary when the leader ends the ride.

GOOD TO KNOW
- Throttle Tribe needs mobile data to share locations. Where there is no signal, your updates reach the group only when you are back online.
- SOS always alerts the riders in your ride. It does not contact emergency services or your contacts for you. In India, dial 112 in an emergency.
- Throttle Tribe does not detect crashes.
- Map data: OpenStreetMap contributors via OpenFreeMap.

Android riders use the app. iPhone riders can join the same ride from the web app, which shares location only while the page is open and the screen is on.

Ride together. Stay together. Throttle Tribe.
```

### Google Play: Data safety form
The full, current answers are in `play-data-safety.md` (supersedes the table below, which is the earlier summary).
Additions since this table: optional email/phone, emergency contacts (name + number, shown to ride members only
during that rider's SOS), analytics and crash logs in our own backend (90 days), ride GPS deleted 30 days after the
ride, in-app account deletion. Do not request SEND_SMS or CALL_PHONE.

| Question | Answer |
|---|---|
| Collects data? | Yes |
| Location: precise | Collected; shared with other riders in the same ride; required for the app to work (not optional); not used for ads. Collected in foreground and background (during a ride only) |
| Personal info: name | Collected (riding name, 1-40 chars); shared with riders in the same ride; required |
| App activity / other: ride events (SOS, quick messages, stops) | Collected; shared with riders in the same ride |
| Device or other IDs | Anonymous account ID created on first launch (no email or phone) |
| Data shared with third parties for ads or sale | No |
| Encrypted in transit | Yes |
| Deletion | In-app "Delete my account" exists; Play also needs a web URL for deletion requests |
| Background location declaration | "Share your position with your riding group while the phone is locked, only during an active ride." Demo video needed; persistent notification shown. |

## App Store

### Name (limit 30)
Count: **14/30**
```
Throttle Tribe
```

### Subtitle (limit 30)
Count: **29/30**
```
Group ride tracker for bikers
```

### Promotional text (limit 170)
Count: **129/170**
```
Create a ride, share a 6-digit code and see your whole group live on the map. Know who's ahead, who's stopped and who needs help.
```

### Keywords (limit 100, comma-separated, no spaces after commas)
Count: **99/100**
```
group ride,motorcycle,biker,riding group,live location,convoy,SOS,regroup,tracker,bike trip,touring
```
Notes: "Throttle", "Tribe", "group", "ride", "tracker" in name/subtitle are indexed already; do not repeat them in new combinations beyond this. No competitor or trademark names.

### Description (limit 4000)
Count: **2989/4000**. Use the same text as the Google Play full description above.

### App Privacy ("nutrition label")

| Data type | Linked to user? | Used for tracking? | Purpose |
|---|---|---|---|
| Precise location | Yes (linked to the anonymous account ID) | No | App functionality (shown to riders in your ride) |
| Name (riding name) | Yes | No | App functionality |
| User ID (anonymous) | Yes | No | App functionality |
| Other user content (SOS and quick messages) | Yes | No | App functionality |
| Email address, phone number (optional account) | Yes | No | App functionality (sign-in) |
| Contacts (emergency contacts the user saves) | Yes | No | App functionality |
| Product interaction, crash data, performance data | Yes (linked to the anonymous ID) | No | Analytics, App functionality |

No tracking, no advertising, no third-party analytics SDK. Analytics and crash data go to our own backend (90 days).
Re-confirm against the final build; see `privacy-policy.md`.

### Permission strings (iOS Info.plist, from app.json today)

| Key | Current text | Count |
|---|---|---|
| NSLocationWhenInUseUsageDescription | Throttle Tribe shows your position to your riding group during a ride so everyone can see who is ahead or behind. | 113 |
| NSLocationAlwaysAndWhenInUseUsageDescription | During a ride, Throttle Tribe keeps sharing your position with your group while your phone is locked or in your pocket, so nobody loses track of you. Sharing stops when the ride ends. | 183 |

Both match the truthfulness rules (why, when, stops at ride end). Keep as is.

## Both stores: support and legal fields to prepare

- Privacy policy URL (required): must state location is shared only with the ride's members, when it is stored, retention, and deletion. See flags in the launch plan.
- Support email and a one-page support/FAQ URL.
- "What's new" for 1.0.0 (limit 500 on Play, 4000 on App Store):
  `First release. Create or join a ride with a code or link, invite riders from contacts, see your group live, get stop alerts, send SOS and quick messages, and save emergency contacts.` (182 chars)

## Release channel note (v1.0.0)

v1.0.0 ships as a signed APK on GitHub Releases (landing page: https://raghuram224.github.io/throttletribe/). The Play text above is the final copy for the Play Store release later. Short description is final at 80/80. The line about iPhone riders in the full description matches the web-app reality; revert to "Android and iPhone riders can ride together" only once a native iOS app ships. For the App Store (not planned for 1.0.0) the description needs the same reality check.

## Screenshot shot-list (from docs/qa/round2)

Same order as `screenshots.md` captions, mapped to the real captures. Play needs 2 to 8 phone screenshots; use these 7, in this order.

| # | File | Sells | Headline suggestion |
|---|---|---|---|
| 1 | `13-live-map.png` (or `12-live-riding.png`) | Rider list: "100 m ahead", "With you", "350 m behind", Hold for SOS | Your whole tribe, one map |
| 2 | `11-lobby-full.png` | Big 6-digit code, Invite riders, riders ready | Join with 6 digits |
| 3 | `08-new-ride.png` | Start a ride in seconds, stop-alert time | Start a ride in seconds |
| 4 | `14-live-tunnel-offline.png` | Quick message banner ("Fuel stop") over the live list | Quick messages, no typing |
| 5 | `15-live-stopped-alert.png` | Verify first: in the round2 capture this file shows the SOS screen with a heads-up notification, not a stop alert. Re-capture a "stopped" alert for the "Know when someone stops" headline, or use it for slot 6. | Know when someone stops |
| 6 | `16-sos-takeover.png` | SOS screen: Navigate, I'm on my way, Call contacts, "Visible only while SOS is on" | Help, one tap away |
| 7 | `05-summary.png` (check fields) or `21-emergency-contacts.png` | Ride summary or private emergency contacts | Every ride, wrapped up |

Before using any of them in the store:
- Rider names show a "(bot)" suffix and the contact number is a test value (`+910000000001`). Re-capture with clean test data (Arun, Meera, Karthik, Imran) and no "(bot)".
- Slot 4 file name says "tunnel offline" but shows a quick-message banner. For "No signal is not stopped" capture a dedicated grey no-signal rider.
- Keep the SOS screenshot showing the 112 line; never frame it as emergency services being contacted.
- Capture the live map ("Show map" open, `18-live-map-sos.png` style) for at least one shot, so the store shows an actual map.

Feature graphic: `assets/marketing/play-feature-graphic.svg` (PNG next to it, 1024x500).
