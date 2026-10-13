# Microcopy

For the app-engineer: drop these in as constants. Table format: `key | where | text | length / max`.
Length is the character count of the text with placeholders expanded to their worst case
(`{name}` = 14 chars, `{N}` = 2 digits, `{X}` = 4 chars like "12.5", `{code}` = 6 digits, `{icon}` = 2 chars,
`{label}` = "Slow down"). Counts verified by script; every row is within its max.

## Rules the code must follow

1. **Truncate rider names to 14 characters plus an ellipsis in titles, banners and notifications.** Names
   can be 40 characters, which would break the 40-char notification title limit. Tune `alerts.ts` and the UI.
2. `{N}` in "stopped" copy is minutes since the stop (UI) or the ride's stop-alert setting (notification).
   `detectAlerts` does not currently pass minutes; add it, or use the fallback body "Check the map." (15).
3. SOS: stay factual. Never say "emergency services have been notified".
4. Error text should replace `ERROR_MESSAGES` in `src/lib/ride-api.ts`; wording below keeps the same meaning,
   shortens it, and drops blame.
5. The six quick-message labels and icons already exist in `src/lib/message-kinds.ts`; keys `msg.*` mirror them.
6. In-ride strings are glanceable; permission and error strings can be full sentences.

## Onboarding

| key | where | text | length / max |
|---|---|---|---|
| `onboarding.1.title` | Welcome slide 1 | See your whole tribe | 20/28 |
| `onboarding.1.body` | Welcome slide 1 | Who's ahead, behind or stopped, at a glance. | 44/60 |
| `onboarding.2.title` | Welcome slide 2 | Know when someone stops | 23/28 |
| `onboarding.2.body` | Welcome slide 2 | Get an alert if a rider stops or loses signal. | 46/60 |
| `onboarding.3.title` | Welcome slide 3 | Help is one tap away | 20/28 |
| `onboarding.3.body` | Welcome slide 3 | SOS and quick messages go to everyone in your ride. | 51/60 |
| `onboarding.cta.next` | Welcome slides | Next | 4/16 |
| `onboarding.cta.start` | Welcome slide 3 | Get started | 11/16 |
| `name.title` | Name prompt | What should we call you? | 24/32 |
| `name.input.placeholder` | Name prompt | Your riding name | 16/24 |
| `name.help` | Name prompt | Your ride sees this name. No password needed. | 45/60 |
| `name.cta` | Name prompt | Let's ride | 10/16 |
| `name.error.empty` | Name prompt | Enter a name to continue. | 25/40 |
| `name.error.long` | Name prompt | Keep it under 40 characters. | 28/40 |

## Permission explainers (own screens, shown before the system prompt)

Order: location while using, then (when the user first creates or joins a ride) background, then notifications.
Do not ask for background location at first launch.

| key | where | text | length / max |
|---|---|---|---|
| `perm.location.title` | Location (while using) | Show you on the map | 19/32 |
| `perm.location.body` | Location (while using) | Your position is shared with riders in your ride, only while a ride is open. | 76/110 |
| `perm.location.cta` | Location (while using) | Allow location | 14/20 |
| `perm.location.skip` | Location (while using) | Not now | 7/16 |
| `perm.location.denied.title` | Location denied | Location is off | 15/32 |
| `perm.location.denied.body` | Location denied | Your group can't see you without it. Turn it on in Settings. | 60/90 |
| `perm.location.denied.cta` | Location denied | Open Settings | 13/20 |
| `perm.bg.title` | Background / all the time | Keep sharing when locked | 24/32 |
| `perm.bg.body` | Background / all the time | During a ride we keep sharing your position with the screen off. It stops when the ride ends or you leave. | 106/130 |
| `perm.bg.hint.android` | Background (Android) | Next, choose 'Allow all the time'. | 34/50 |
| `perm.bg.hint.ios` | Background (iOS) | Next, choose 'Change to Always Allow'. | 38/50 |
| `perm.bg.cta` | Background / all the time | Continue | 8/20 |
| `perm.bg.denied` | Background declined | Sharing may pause when your screen is off. Keep the app open to stay visible. | 77/100 |
| `perm.notif.title` | Notifications | Get ride alerts | 15/32 |
| `perm.notif.body` | Notifications | We'll alert you when a rider stops, loses signal or sends SOS or a quick message. | 81/110 |
| `perm.notif.cta` | Notifications | Allow alerts | 12/20 |
| `perm.notif.denied` | Notifications denied | Alerts are off. You can turn them on in Settings. | 49/70 |

OS-level strings (already in `app.json`, keep): see `store-listing.md` (113 and 183 chars).

## Home, join, lobby

| key | where | text | length / max |
|---|---|---|---|
| `home.greeting` | Home | Hi, {name} | 18/24 |
| `home.empty.title` | Home (no ride) | No ride yet | 11/32 |
| `home.empty.body` | Home (no ride) | Start a ride or join one with a code. | 37/60 |
| `home.cta.create` | Home | Start a ride | 12/20 |
| `home.cta.join` | Home | Join with code | 14/20 |
| `home.resume.title` | Home (open ride) | Ride in progress | 16/32 |
| `home.resume.cta` | Home (open ride) | Rejoin | 6/16 |
| `create.name.label` | Create ride | Ride name | 9/24 |
| `create.name.placeholder` | Create ride | Sunday to Nandi Hills | 21/32 |
| `create.stop.label` | Create ride | Alert me when someone stops for | 31/44 |
| `create.stop.option` | Create ride (1 / 3 / 5) | {N} min | 6/12 |
| `create.cta` | Create ride | Create ride | 11/20 |
| `join.title` | Join | Join a ride | 11/24 |
| `join.input.label` | Join | Ride code | 9/24 |
| `join.input.hint` | Join | Enter the 6-digit code | 22/40 |
| `join.cta` | Join | Join | 4/16 |
| `join.error.format` | Join (client check) | Codes have 6 digits. | 20/40 |
| `lobby.title` | Lobby | Lobby | 5/16 |
| `lobby.code.label` | Lobby | Ride code | 9/24 |
| `lobby.empty.title` | Lobby (alone) | Waiting for riders | 18/32 |
| `lobby.empty.body` | Lobby (alone) | Share code {code} so your tribe can join. | 41/60 |
| `lobby.cta.share` | Lobby | Share code | 10/20 |
| `lobby.cta.start` | Lobby (leader) | Start ride | 10/20 |
| `lobby.waiting` | Lobby (rider) | Waiting for the leader to start | 31/40 |
| `lobby.cta.leave` | Lobby | Leave ride | 10/20 |
| `lobby.rider.leader` | Lobby rider row | Leader | 6/12 |

## Errors (one per RideError code)

| key | where | text | length / max |
|---|---|---|---|
| `error.not_authenticated` | Any screen | You're signed out. Restart the app and try again. | 49/70 |
| `error.profile_required` | Create / join | Add your riding name first. | 27/70 |
| `error.ride_not_found` | Join | No ride found with that code. Check the 6 digits. | 49/70 |
| `error.not_leader_or_not_in_lobby` | Lobby start | Only the leader can start a ride from the lobby. | 48/70 |
| `error.not_leader_or_already_ended` | Live ride end | Only the leader can end the ride. It may already be over. | 57/70 |
| `error.leader_must_end_ride` | Leave ride | You're the leader. End the ride for everyone instead. | 53/70 |
| `error.invalid_message_kind` | Quick messages | That message isn't available. Pick one from the list. | 53/70 |
| `error.not_a_member` | Any ride screen | You're not in this ride. Join with a code. | 42/70 |
| `error.network` | Any screen | No connection. Check mobile data and try again. | 47/70 |
| `error.unknown` | Any screen | Something went wrong. Try again. | 32/70 |
| `error.cta.retry` | Error toast / dialog | Try again | 9/16 |

## Live ride: status labels, banners, messages

| key | where | text | length / max |
|---|---|---|---|
| `status.moving` | Rider row / chip | Moving | 6/12 |
| `status.stopped` | Rider row / chip | Stopped | 7/12 |
| `status.offline` | Rider row / chip | No signal | 9/12 |
| `status.sos` | Rider row / chip | SOS | 3/12 |
| `rider.ahead` | Rider row | {X} km ahead | 13/20 |
| `rider.behind` | Rider row | {X} km behind | 14/20 |
| `rider.offtrail` | Rider row (> 500 m from leader's path) | Away from leader | 16/20 |
| `rider.you` | Rider row | You | 3/12 |
| `rider.stopped.since` | Rider row sub | Stopped {N} min | 14/24 |
| `rider.offline.since` | Rider row sub | Last seen {N} min ago | 20/30 |
| `banner.me.offline.title` | Live banner | You're offline | 14/24 |
| `banner.me.offline.body` | Live banner | Reconnecting. Others may not see you. | 37/50 |
| `banner.me.online` | Live banner (brief) | Back online | 11/24 |
| `banner.stopped` | Live banner | {name} stopped {N} min | 29/34 |
| `banner.offline` | Live banner | {name} lost signal | 26/34 |
| `banner.message` | Live banner | {icon} {name}: {label} | 28/40 |
| `banner.ended` | Live banner | Ride ended | 10/24 |
| `msg.sheet.title` | Quick messages sheet | Tell your ride | 14/24 |
| `msg.sent` | Toast after sending | Sent to your ride | 17/24 |
| `msg.fuel` | Quick message | Fuel stop | 9/12 |
| `msg.puncture` | Quick message | Puncture | 8/12 |
| `msg.slow_down` | Quick message | Slow down | 9/12 |
| `msg.regroup` | Quick message | Regroup | 7/12 |
| `msg.break` | Quick message | Break | 5/12 |
| `msg.all_good` | Quick message | All good | 8/12 |
| `live.end.cta` | Live ride (leader) | End ride | 8/16 |
| `live.end.confirm.title` | End dialog | End ride for everyone? | 22/36 |
| `live.end.confirm.body` | End dialog | Location sharing stops for all riders. | 38/70 |
| `live.leave.cta` | Live ride (rider) | Leave ride | 10/16 |
| `live.leave.confirm.body` | Leave dialog | Your location stops sharing when you leave. | 43/70 |

## SOS

Sender flow: button, confirm, active, fail. Receiver flow: full-screen alert, cleared.

| key | where | text | length / max |
|---|---|---|---|
| `sos.button` | Live ride | SOS | 3/8 |
| `sos.confirm.title` | SOS sender, confirm | Send SOS to your ride? | 22/32 |
| `sos.confirm.body` | SOS sender, confirm | Everyone in your ride gets a loud alert with your location. | 59/80 |
| `sos.confirm.disclaimer` | SOS sender, confirm | This does not call emergency services. In India, dial 112. | 58/80 |
| `sos.confirm.cta` | SOS sender, confirm | Send SOS | 8/16 |
| `sos.confirm.cancel` | SOS sender, confirm | Cancel | 6/16 |
| `sos.active.title` | SOS sender, active | SOS sent | 8/24 |
| `sos.active.body` | SOS sender, active | Your ride can see you need help. Stay put if it's safe. | 55/80 |
| `sos.active.cta` | SOS sender, active | I'm OK, cancel SOS | 18/24 |
| `sos.fail` | SOS sender, failed | SOS didn't send. Check signal and try again, or call 112. | 57/80 |
| `sos.recv.title` | SOS receiver screen | SOS from {name} | 23/32 |
| `sos.recv.body` | SOS receiver screen | {name} needs help. Check where they are. | 48/60 |
| `sos.recv.since` | SOS receiver screen | SOS sent {N} min ago | 19/30 |
| `sos.recv.cta` | SOS receiver screen | See on map | 10/16 |
| `sos.recv.dismiss` | SOS receiver screen | Dismiss | 7/16 |
| `sos.cleared.title` | SOS receiver, cleared | {name} is OK | 20/32 |
| `sos.cleared.body` | SOS receiver, cleared | They cleared their SOS. | 23/60 |

## Notifications (title max 40, body max 90)

Current code strings (`src/lib/alerts.ts`) are close; these are the proposed replacements. Android channels
`ride-alerts` and `ride-sos` keep their ids; only the display names below change.

| key | where | text | length / max |
|---|---|---|---|
| `notif.stopped.title` | Notification | {name} stopped | 22/40 |
| `notif.stopped.body` | Notification | No movement for {N} min. Check the map. | 38/90 |
| `notif.offline.title` | Notification | {name} lost signal | 26/40 |
| `notif.offline.body` | Notification | No updates from {name}. They may be in a dead zone. | 59/90 |
| `notif.sos.title` | Notification (SOS channel) | SOS from {name} | 23/40 |
| `notif.sos.body` | Notification (SOS channel) | {name} needs help. Open the map to see where. | 53/90 |
| `notif.sos_cleared.title` | Notification | {name} is OK | 20/40 |
| `notif.sos_cleared.body` | Notification | {name} cleared their SOS. | 33/90 |
| `notif.message.title` | Notification | {icon} {label} | 12/40 |
| `notif.message.body` | Notification | {name}: {label} | 25/90 |
| `notif.ended.title` | Notification | Ride ended | 10/40 |
| `notif.ended.body` | Notification | The leader ended the ride. See your summary. | 44/90 |
| `notif.channel.alerts` | Android channel name | Ride alerts | 11/30 |
| `notif.channel.sos` | Android channel name | SOS | 3/30 |

## Android foreground-service notification

Set via expo-location `foregroundService: { notificationTitle, notificationBody }` when starting location updates.
Android requires this notification while location runs in the background; it is also our proof of "only during a ride".

| key | where | text | length / max |
|---|---|---|---|
| `fgs.title` | Android persistent notification | Throttle Tribe: ride on | 23/40 |
| `fgs.body` | Android persistent notification | Sharing your position with your ride. | 37/90 |

## Ride-ended summary

Use only the labels whose numbers the summary screen actually shows; drop the rest.

| key | where | text | length / max |
|---|---|---|---|
| `summary.title` | Ride ended | Ride complete | 13/24 |
| `summary.subtitle` | Ride ended | Nice riding, {name}. | 28/40 |
| `summary.distance` | Summary label | Distance | 8/16 |
| `summary.duration` | Summary label | Ride time | 9/16 |
| `summary.riders` | Summary label | Riders | 6/16 |
| `summary.stops` | Summary label | Stops | 5/16 |
| `summary.longest_stop` | Summary label | Longest stop | 12/16 |
| `summary.empty` | Summary (no data) | No ride data yet. | 17/40 |
| `summary.cta` | Summary | Back home | 9/16 |

---

# Round 2: invites, emergency contacts, SOS contact actions, accounts

Extra placeholders for the counts below: `{link}` = 40 chars (invite or share URL, assumed short, e.g.
`https://<domain>/j/123456`; if the real URL is longer, recount), `{mapsLink}` = 46 chars
(`https://maps.google.com/?q=12.971599,77.594566`), `{contact}` = 14, `{phone}` = 15 (`+91 98765 43210`),
`{email}` = 30, `{N}` = 2 digits. Counts verified by script.

Hard rules for this round (safety and truthfulness):

1. The ride is ALWAYS notified on SOS. There is no setting to turn that off, and no copy may imply a choice.
2. Nothing is ever sent automatically to a contact. "Call" and "Text my location" only open the phone or
   messages app, pre-filled. The rider taps call or send. Copy must say "opens", never "sends to".
3. Never say emergency services are contacted by the app. 108 and 112 are numbers the rider dials.
4. Say plainly that emergency contacts are private: visible to the rider, and to ride members only while that
   rider's SOS is active.
5. Invite texts go from the user's own SIM through their own messages app (carrier rates may apply).
   We do not read or upload the contact list.

## Invite riders (SMS and share link)

| key | where | text | length / max |
|---|---|---|---|
| `invite.title` | Invite screen | Invite riders | 13/24 |
| `invite.contacts.cta` | Invite screen | Invite from contacts | 20/24 |
| `invite.link.cta` | Invite screen | Share invite link | 17/24 |
| `invite.code.cta` | Invite screen | Copy code | 9/24 |
| `invite.copied` | Toast | Code copied | 11/24 |
| `invite.perm.title` | Contacts permission explainer | Find your riding buddies | 24/32 |
| `invite.perm.body` | Contacts permission explainer | Pick people to text an invite. We don't upload your contacts. | 61/90 |
| `invite.perm.cta` | Contacts permission explainer | Allow contacts | 14/20 |
| `invite.perm.denied` | Contacts denied | Contacts are off. Share the link instead, or turn them on in Settings. | 70/90 |
| `invite.picker.title` | Contact picker | Pick riders | 11/24 |
| `invite.picker.search` | Contact picker | Search contacts | 15/24 |
| `invite.picker.none` | Contact picker (empty) | No contacts with phone numbers. | 31/50 |
| `invite.picker.cta` | Contact picker | Invite {N} | 9/16 |
| `invite.sms.note` | Contact picker, under button | Opens your messages app. You tap send. | 38/60 |
| `invite.sms` | Pre-filled SMS body (hard limit: one SMS) | {name} invited you to ride on Throttle Tribe. Join here: {link} Code: {code} | 118/160 |
| `invite.share.subject` | Share sheet title (where supported) | Join my ride on Throttle Tribe | 30/50 |
| `invite.share.message` | Share sheet body (WhatsApp etc.) | {name} invited you to a group ride on Throttle Tribe. Join with code {code} or tap {link} | 131/200 |
| `invite.sms.fail` | Toast | Couldn't open your messages app. Share the link instead. | 56/70 |
| `lobby.cta.invite` | Lobby (replaces/extends `lobby.cta.share`) | Invite riders | 13/20 |

Invite web page (opened from the link; if the app is installed it should open the join screen instead):

| key | where | text | length / max |
|---|---|---|---|
| `web.invite.title` | Invite page heading | {name} invited you to ride | 34/40 |
| `web.invite.code.label` | Invite page | Ride code | 9/24 |
| `web.invite.open` | Invite page, button | Open in Throttle Tribe | 22/28 |
| `web.invite.store` | Invite page, button | Get it on Google Play | 21/28 |
| `web.invite.body` | Invite page | No app yet? Install it, then enter the code above. | 50/70 |
| `web.invite.privacy` | Invite page footer | Your location is shared only with riders in this ride. | 54/70 |

## Emergency contacts (private)

| key | where | text | length / max |
|---|---|---|---|
| `ec.title` | Screen title | Emergency contacts | 18/28 |
| `ec.intro` | Under title | People you can call or text if you send an SOS. | 47/80 |
| `ec.privacy` | Under intro | Private to you. Your ride sees them only while your SOS is active. | 66/90 |
| `ec.empty.title` | Empty state | No contacts yet | 15/28 |
| `ec.empty.body` | Empty state | Add up to 5 people, like family or a friend who can help. | 57/70 |
| `ec.count` | Header | {N} of 5 | 7/12 |
| `ec.add` | Button | Add contact | 11/20 |
| `ec.add.phone` | Add sheet | Pick from phone | 15/24 |
| `ec.add.manual` | Add sheet | Type a number | 13/24 |
| `ec.limit` | Toast / hint at 5 | You can add up to 5. Remove one to add another. | 47/70 |
| `ec.suggest.title` | Quick add row | Quick add | 9/20 |
| `ec.suggest.108` | Quick add chip | Ambulance 108 | 13/20 |
| `ec.suggest.112` | Quick add chip | Police 112 | 10/20 |
| `ec.suggest.note` | Under chips | You make the call. We don't contact emergency services for you. | 63/80 |
| `ec.form.name.label` | Form | Name | 4/16 |
| `ec.form.name.placeholder` | Form | Mom | 3/16 |
| `ec.form.phone.label` | Form | Phone number | 12/24 |
| `ec.form.phone.placeholder` | Form | +91 98765 43210 | 15/24 |
| `ec.form.save` | Form | Save | 4/16 |
| `ec.form.remove` | Form | Remove contact | 14/20 |
| `ec.error.name` | Form | Enter a name. | 13/40 |
| `ec.error.phone` | Form | Enter a valid phone number. | 27/40 |
| `ec.error.duplicate` | Form | That number is already saved. | 29/40 |
| `ec.save.fail` | Toast | Couldn't save. Check mobile data and try again. | 47/70 |
| `ec.remove.confirm.title` | Dialog | Remove {contact}? | 22/32 |
| `ec.remove.confirm.body` | Dialog | They won't show up if you send an SOS. | 38/70 |
| `ec.nudge.title` | Home card (dismissible) | Add emergency contacts | 22/32 |
| `ec.nudge.body` | Home card | Know who to call if you need help on a ride. | 44/60 |
| `ec.nudge.cta` | Home card | Add contacts | 12/20 |
| `ec.nudge.skip` | Home card | Later | 5/16 |

Product check: "Ambulance 108" and "Police 112" are the owner's examples. 112 is India's unified emergency
number and 108 is the ambulance number in most states, but confirm both before launch and consider "Emergency 112".

## SOS: sender contact actions

Shown on the "SOS sent" screen, under `sos.active.body`. Extra line on the confirm dialog.

| key | where | text | length / max |
|---|---|---|---|
| `sos.confirm.contacts` | SOS confirm dialog, extra line | Next you can call or text your contacts. Nothing goes to them automatically. | 76/80 |
| `sos.contacts.title` | SOS sent screen | Reach your contacts | 19/28 |
| `sos.contacts.call` | Button per contact | Call {contact} | 19/24 |
| `sos.contacts.text.all` | Button | Text my location | 16/24 |
| `sos.contacts.text.hint` | Under button | Opens your messages app. You tap send. | 38/60 |
| `sos.contacts.none` | SOS sent screen (no contacts) | No emergency contacts yet. You can dial 112. | 44/60 |
| `sos.contacts.add` | SOS sent screen (no contacts) | Add contacts | 12/20 |
| `sos.contacts.noloc` | Under Text button, no GPS fix | Location not found yet. The text will say so. | 45/60 |
| `sos.contacts.call.fail` | Toast | Couldn't open the phone app. Dial {phone}. | 50/60 |
| `sos.contacts.text.fail` | Toast | Couldn't open your messages app. | 32/60 |
| `sos.sms` | Pre-filled SMS body (hard limit: one SMS) | SOS from {name}. I need help. My location: {mapsLink} | 97/160 |
| `sos.sms.noloc` | Pre-filled SMS, no location | SOS from {name}. I need help. My location isn't available yet. | 70/160 |

## SOS: receiver (ride members)

Shown below `sos.recv.body` ONLY while the sender's SOS is active. Hidden when cleared.

| key | where | text | length / max |
|---|---|---|---|
| `sos.recv.contacts.title` | SOS receiver screen | {name}'s contacts | 25/32 |
| `sos.recv.contacts.body` | SOS receiver screen | Shown to your ride only while their SOS is on. | 46/60 |
| `sos.recv.contacts.call` | Button per contact | Call {contact} | 19/24 |
| `sos.recv.contacts.hint` | Under list | Call if you can't reach {name}. | 39/50 |
| `sos.recv.contacts.none` | SOS receiver screen | {name} hasn't added contacts. | 37/50 |

## Account: save, sign in, OTP

Guest accounts stay the default; upgrading is optional and keeps ride history.

| key | where | text | length / max |
|---|---|---|---|
| `account.title` | Screen title | Your account | 12/24 |
| `account.guest.status` | Account screen | Guest account | 13/24 |
| `account.guest.body` | Account screen | Add an email or phone to keep your rides if you change phones. | 62/80 |
| `account.optional` | Account screen | Optional. You can keep riding as a guest. | 41/60 |
| `account.upgrade.cta` | Account screen | Save my account | 15/20 |
| `account.signedin.email` | Account screen | Signed in as {email} | 43/50 |
| `account.signedin.phone` | Account screen | Signed in as {phone} | 28/50 |
| `account.method.title` | Method screen | How do you want to sign in? | 27/40 |
| `account.method.email` | Method choice | Email | 5/16 |
| `account.method.phone` | Method choice | Phone number | 12/20 |
| `account.email.label` | Form | Email | 5/16 |
| `account.email.placeholder` | Form | you@example.com | 15/32 |
| `account.phone.label` | Form | Phone number | 12/24 |
| `account.phone.placeholder` | Form | +91 98765 43210 | 15/24 |
| `account.phone.help` | Under phone field | We'll text you a code. Carrier rates may apply. | 47/60 |
| `account.send` | Button | Send code | 9/16 |
| `otp.title` | OTP screen | Enter your code | 15/24 |
| `otp.sent.email` | OTP screen | We sent a 6-digit code to {email}. | 57/60 |
| `otp.sent.phone` | OTP screen | We sent a 6-digit code to {phone}. | 42/60 |
| `otp.input.hint` | OTP field | 6-digit code | 12/20 |
| `otp.cta` | Button | Verify | 6/16 |
| `otp.resend` | Link | Resend code | 11/20 |
| `otp.resend.wait` | Link, disabled | Resend in {N}s | 13/20 |
| `otp.resent` | Toast | New code sent | 13/24 |
| `otp.change` | Link | Change email or number | 22/28 |
| `upgrade.success` | Toast / screen | Account saved. Your rides are kept. | 35/50 |
| `signin.entry` | Onboarding link | Already have an account? Sign in | 32/40 |
| `signin.title` | Screen title | Sign in | 7/16 |
| `signin.body` | Screen | Use your email or phone to get your rides back on a new phone. | 62/80 |
| `signin.warn.guest` | Warning, if a guest session with data exists | Signing in switches this phone to your saved account. | 53/70 |
| `signin.success` | Toast | Welcome back, {name}. | 29/40 |
| `signout.cta` | Account screen | Sign out | 8/16 |
| `signout.guest.title` | Dialog, guest tries to sign out | Save your account first? | 24/32 |
| `signout.guest.body` | Dialog | Guests can't sign back in. Signing out loses this account. | 58/80 |
| `signout.guest.save` | Dialog button | Save account | 12/20 |
| `signout.guest.confirm` | Dialog button | Sign out anyway | 15/20 |
| `otp.error.invalid` | Inline error | That code isn't right. Check it and try again. | 46/70 |
| `otp.error.expired` | Inline error | That code has expired. Send a new one. | 38/70 |
| `otp.error.toomany` | Inline error | Too many tries. Wait a few minutes and try again. | 49/70 |
| `account.error.email` | Inline error | Enter a valid email. | 20/40 |
| `account.error.phone` | Inline error | Enter a valid phone number. | 27/40 |
| `account.error.inuse` | Inline error | That email or number is linked to another account. Sign in instead. | 67/90 |
| `account.error.sms` | Inline error | We couldn't send the SMS. Check the number and try again. | 57/70 |
| `account.error.mail` | Inline error | We couldn't send the email. Check the address and try again. | 60/70 |

Message templates sent by the auth provider (set in Supabase dashboard):

| key | where | text | length / max |
|---|---|---|---|
| `auth.sms.otp` | Phone OTP SMS (one SMS) | Your Throttle Tribe code is {code}. Don't share it with anyone. | 63/160 |
| `auth.email.subject` | Email OTP subject | Your Throttle Tribe code | 24/50 |
| `auth.email.body` | Email OTP body | Your sign-in code is {code}. If you didn't ask for it, ignore this email. | 73/160 |

Product check: sign-in on a new phone and what happens to a guest session already on that phone
(`signin.warn.guest`) is a product decision; adjust the warning to the real behaviour. India SMS OTP may need
DLT template registration with the SMS provider (not a copy matter, but the `auth.sms.otp` text must match the
registered template).

## Delete my account

| key | where | text | length / max |
|---|---|---|---|
| `delete.cta` | Account screen | Delete my account | 17/24 |
| `delete.confirm.title` | Dialog | Delete your account? | 20/32 |
| `delete.confirm.body` | Dialog | This removes your profile, emergency contacts and ride history. It can't be undone. | 83/110 |
| `delete.confirm.cta` | Dialog | Delete account | 14/20 |
| `delete.done` | Toast | Account deleted. | 16/32 |
| `delete.fail` | Toast | Couldn't delete. Check mobile data and try again. | 49/70 |

Confirm `delete.confirm.body` against what the deletion function really removes (rides the user led, rows other
riders still need, etc.).
