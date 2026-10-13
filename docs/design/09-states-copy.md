# 09 — Copy (single source of truth)

Rules: plain words, no jargon ("signal", not "connectivity"), sentence case, numbers as digits,
"min"/"km"/"m"/"h" abbreviations in glance zones. `{name}` = display name (first word only in glance
zones: banners, rows, takeover title; full name elsewhere). `{dist}` = 06 distance phrase
("4.2 km behind", "with you", "3.1 km away"); `{distYou}` = same with "you" where it reads
naturally ("4.2 km behind you", "with you", "3.1 km away"). Unknown distance → drop the phrase and
its separator. Max length = characters after substitution with a
12-char name; above it the string must still fit by truncating `{name}` only. ✎ = marketing may refine.

Implementation: put these in `src/lib/copy.ts` as a flat `const copy = { 'home.start': '…' }` with
small formatter functions for templated keys. No i18n library in MVP.

## Common
| key | screen | text | max |
|---|---|---|---|
| common.tryAgain | any | Try again | 16 |
| common.cancel | sheets | Cancel | 16 |
| common.close | sheets | Close | 16 |
| common.back | top bar a11y | Back | 8 |

## Onboarding (01)
| key | screen | text | max |
|---|---|---|---|
| welcome.title | welcome | Throttle Tribe | 20 |
| welcome.tagline ✎ | welcome | Ride together. Nobody gets left behind. | 48 |
| welcome.point1 ✎ | welcome | See who's ahead and who's behind | 40 |
| welcome.point2 ✎ | welcome | Know when someone stops or loses signal | 44 |
| welcome.point3 ✎ | welcome | Hold SOS to alert your group and family (round 2, was "…your whole group") | 44 |
| welcome.noSignup | welcome | No sign-up. Just your name. | 32 |
| welcome.cta | welcome | Get started | 20 |
| welcome.signIn | welcome | I have an account (12) | 20 |
| welcome.errorNetwork | welcome | No signal. You need a connection once to get started. | 64 |
| name.title | name | What should riders call you? | 32 |
| name.subtitle | name | Shown to your group on the map and in alerts. | 56 |
| name.hint | name | Short names are easier to read at a glance. | 48 |
| name.errorTooLong | name | Use 40 characters or fewer. | 32 |
| name.cta | name | Continue | 16 |
| name.a11yInput | name | Your rider name | 24 |
| name.previewLabel | name | This is how riders see you (13) | 32 |
| name.hintLong | name | Riders will see "{first}" in alerts. (13, P2) | 44 |

## Home, new ride, profile (02)
| key | screen | text | max |
|---|---|---|---|
| home.appName | home | Throttle Tribe | 20 |
| home.heading ✎ | home | Ready to ride? | 24 |
| home.subtitle ✎ | home | Start a ride and share the code, or join a friend's ride. | 64 |
| home.start | home | Start a ride | 20 |
| home.join | home | Join with code | 20 |
| home.resumeLabel | home | Ride in progress | 20 |
| home.roleLeader | home | You're the leader | 20 |
| home.roleRider | home | You're riding | 20 |
| home.startedAgo | home | Started {duration} ago | 28 |
| home.inLobby | home | Waiting in the lobby | 24 |
| home.resume | home | Back to ride | 20 |
| home.toastWelcome | home | You're all set, {name} | 32 |
| home.a11yProfile | home | Your profile, {name}. Edit name | 48 |
| home.confirmSwitchTitle | sheet | Leave {ride}? | 40 |
| home.confirmSwitchBody | sheet | You can only be in one ride. Your group in {ride} will stop seeing you. | 96 |
| home.confirmSwitchConfirm | sheet | Leave and continue | 24 |
| home.leaderBusyTitle | sheet | You're leading {ride} | 40 |
| home.leaderBusyBody | sheet | End that ride before starting or joining another. | 64 |
| home.leaderBusyAction | sheet | Go to {ride} | 32 |
| newRide.title | new ride | New ride | 16 |
| newRide.nameLabel | new ride | Ride name | 16 |
| newRide.defaultName | new ride | {name}'s ride | 60 |
| newRide.thresholdLabel | new ride | Alert when a rider has stopped for | 40 |
| newRide.threshold1 / 3 / 5 | new ride | 1 min / 3 min / 5 min | 6 |
| newRide.thresholdHint | new ride | Shorter means more alerts at traffic lights. | 48 |
| newRide.cta | new ride | Create ride | 20 |
| newRide.setName | new ride | Set your name first | 24 |
| home.greetMorning ✎ | home | Good morning, {name} (13) | 28 |
| home.greetAfternoon ✎ | home | Good afternoon, {name} | 28 |
| home.greetEvening ✎ | home | Good evening, {name} | 28 |
| home.quickJoinTitle | home | Have a ride code? | 20 |
| home.quickJoinSub | home | Enter 6 digits | 20 |
| home.recentTitle | home | Recent rides | 16 |
| home.recentMeta | home | {km} · {duration} · {riders} (each part optional) | 36 |
| home.recentEmptyTitle | home | Your rides will show here | 28 |
| home.recentEmptyBody ✎ | home | Start one and share the code. It takes 10 seconds. | 56 |
| home.seeAll | home | See all rides (P2) | 16 |
| home.a11yProfileTodo | home | {n} things to set up | 24 |
| home.a11yRecentRow | home | {ride}, {date}, {meta}. Open summary | 96 |
| newRide.threshold1Hint / 3Hint / 5Hint | new ride | city / default / highway (13) | 8 |
| newRide.suggest1 / 2 / 3 ✎ | new ride | Sunday ride / Breakfast run / Weekend tour (P2) | 16 |
| profile.title | profile | Profile (round 2, was "Your profile") | 20 |
| profile.editName | sheet | Edit name | 16 |
| profile.sectionAccount | profile | Account | 12 |
| profile.sectionSafety | profile | Safety | 12 |
| profile.sectionAppearance | profile | Appearance | 12 |
| profile.sectionPrivacy | profile | Privacy | 12 |
| profile.contactsRow | profile | Emergency contacts | 24 |
| profile.contactsValue | profile | {n} of 5 | 8 |
| profile.contactsNotSet | profile | Not set | 8 |
| profile.howSharing | profile | How sharing works (P2) | 24 |
| profile.haptics | profile | Vibration (P2) | 12 |
| profile.version | profile | Throttle Tribe {version} | 28 |
| profile.delete | profile | Delete my account | 20 |
| profile.deleteTitle | sheet | Delete your account? | 24 |
| profile.deleteBody | sheet | This removes your name, rides, emergency contacts and location history. Rides you lead will end. You can't undo this. | 128 |
| profile.deleteConfirm | sheet | Delete account | 16 |
| profile.nameLabel | profile | Name | 12 |
| profile.themeLabel | profile | Theme | 12 |
| profile.themeAuto / Light / Dark | profile | Auto / Light / Dark | 6 |
| profile.themeHint | profile | Pick Light for bright sun. | 32 |
| ~~profile.guestNote~~ | — | removed in round 2; replaced by `account.guest*` (12) | — |
| profile.save | profile | Save | 12 |
| profile.saved | profile | Name saved | 16 |

## Join (03)
| key | screen | text | max |
|---|---|---|---|
| join.title | join | Join a ride | 20 |
| join.heading | join | Enter the ride code | 24 |
| join.subtitle | join | Ask the leader for the 6 digits. | 40 |
| join.pasteHint | join | Long-press the boxes to paste. | 36 |
| join.cta | join | Join | 12 |
| join.a11yInput | join | Ride code, 6 digits | 24 |
| join.switchTitle | sheet | Leave {ride}? | 40 |
| join.switchBody | sheet | Joining this ride takes you out of {ride}. | 64 |
| join.switchConfirm | sheet | Leave and join | 20 |

## Permissions (04)
| key | screen | text | max |
|---|---|---|---|
| perm.step | perms | Step {n} of {total} | 12 |
| perm.skip | perms | Skip | 8 |
| perm.a11ySkip | perms | Skip, continue without this | 32 |
| perm.loc.title | perms | Share your position with your group | 40 |
| perm.loc.why1 ✎ | perms | Your group sees where you are only during this ride. | 56 |
| perm.loc.why2 ✎ | perms | Sharing stops when the ride ends or you leave. | 56 |
| perm.loc.why3 ✎ | perms | Nobody outside the ride can see it. | 40 |
| perm.loc.cta | perms | Allow location | 20 |
| perm.bg.title | perms | Keep sharing when your phone is locked | 40 |
| perm.bg.why ✎ | perms | Your phone will be in a mount or pocket. Without this, your group loses you when the screen turns off. | 110 |
| perm.bg.androidHow | perms | On the next screen choose **Allow all the time**, then come back. | 72 |
| perm.bg.iosHow | perms | When iOS asks, choose **Change to Always Allow**. | 56 |
| perm.bg.cta | perms | Continue | 16 |
| perm.notif.title | perms | Get alerts during the ride | 32 |
| perm.notif.why ✎ | perms | We'll tell you when a rider stops, loses signal or sends SOS. | 64 |
| perm.notif.cta | perms | Allow alerts | 16 |
| perm.startFailed | perms | Couldn't start sharing your location. | 40 |
| perm.openSettings | perms, sheets | Open settings | 16 |

## Banners (00, 04)
| key | screen | text | max |
|---|---|---|---|
| banner.offline | ride, home | You're offline — positions may be old | 40 |
| banner.backOnline | ride | Back online | 16 |
| banner.notSharing | ride | Your location isn't shared | 32 |
| banner.bgOff | ride | Keep the app open — sharing stops when locked | 48 |
| banner.notifOff | lobby | Alerts are off. You'll only see them in the app. | 52 |
| banner.gpsOff | ride | Location is off on this phone | 32 |
| banner.fix | ride | Fix | 6 |

## Status (StatusChip, 06)
| key | screen | text | max |
|---|---|---|---|
| status.moving | rows | ▶ Moving | 10 |
| status.stopped | rows | ⏸ Stopped · {duration} | 20 |
| status.offline | rows | 📶 No signal · {duration} | 22 |
| status.noSignalYet | rows | 📶 No signal yet | 18 |
| status.sos | rows | ⚠ SOS · {duration} | 16 |

## Lobby (05)
| key | screen | text | max |
|---|---|---|---|
| lobby.headerMeta | lobby | Lobby · {n} riders | 20 |
| lobby.codeLabel | lobby | Ride code | 12 |
| lobby.share | lobby | Share code (round 2: the button becomes `lobby.invite`; the key stays for a11y of long-press) | 16 |
| lobby.shareMessage | share sheet | **replaced by `invite.shareMessage`** (https link) | — |
| lobby.invite | lobby | Invite riders | 16 |
| lobby.invitedLine | lobby | {n} invited · {j} joined | 24 |
| lobby.emptyTitle | lobby | Nobody here yet | 20 |
| lobby.a11yLongPressCode | lobby | Ride code {digits}. Long-press to share | 48 |
| lobby.threshold | lobby | Stop alert after {n} min | 28 |
| lobby.ridersTitle | lobby | Riders ({n}) · {r} ready | 28 |
| lobby.you | lobby | (you) | 6 |
| lobby.leaderTag | lobby, live | ★ Leader | 10 |
| lobby.ready | lobby | ✓ Ready | 10 |
| lobby.connected | lobby | ● Connected | 12 |
| lobby.away | lobby | ○ Away | 8 |
| lobby.notSharing | lobby | Not sharing | 12 |
| lobby.emptyHint | lobby | Share the code. Riders appear here as they join. | 52 |
| lobby.startHint | lobby | Start any time — late riders can still join. | 48 |
| lobby.start | lobby | Start ride | 16 |
| lobby.waiting | lobby | Waiting for {leader} to start | 36 |
| lobby.leave | lobby | Leave ride | 16 |
| lobby.leaveTitle | sheet | Leave this ride? | 24 |
| lobby.leaveBody | sheet | Your group will stop seeing you. You can rejoin with the code. | 72 |
| lobby.leaveConfirm | sheet | Leave ride | 16 |
| lobby.cancelRide | menu | Cancel ride | 16 |
| lobby.cancelTitle | sheet | Cancel this ride for everyone? | 36 |
| lobby.cancelBody | sheet | Everyone in the lobby will be sent home. | 48 |
| lobby.cancelConfirm | sheet | Cancel ride | 16 |
| lobby.started | toast | Ride started — ride safe! | 28 |
| lobby.a11yCode | lobby | Ride code {d d d d d d} | 28 |

## Live ride (06)
| key | screen | text | max |
|---|---|---|---|
| live.headerMeta | live | {H:MM} · {n} riders | 20 |
| live.connLive | header | Live | 8 |
| live.connConnecting | header | Connecting | 12 |
| live.connOffline | header | Offline | 8 |
| live.toListOnly | map | List only (a11y) | 16 |
| live.showMap | list | 🗺 Show map | 14 |
| live.attribution | map | © OpenFreeMap © OpenStreetMap | 32 |
| live.mapWaiting | map | Waiting for positions… | 24 |
| live.fitAll | map | ⤢ All | 6 |
| live.offRoute | list | Off route | 12 |
| live.ahead | rows | {km} ahead (`{km}` = formatDistance, e.g. "4.2 km") | 14 |
| live.behind | rows | {km} behind | 15 |
| live.level | rows | With you | 10 |
| live.away | rows | {km} away | 13 |
| live.noLocation | rows | No location yet | 16 |
| live.noMyFix | list | Waiting for your GPS — distances will appear soon | 52 |
| live.you | me row | You | 4 |
| live.sharing | me row | ✓ Sharing | 10 |
| live.notSharing | me row | Not sharing | 12 |
| live.sosOn | me row | ⚠ SOS on | 10 |
| live.alone | list | Share the code so others can join. | 40 |
| live.msg | action bar | 💬 Msg | 7 |
| live.sos | action bar | ⚠ Hold for SOS | 16 |
| live.end | action bar | ⏹ End | 6 |
| live.endTitle | sheet | End the ride for everyone? | 28 |
| live.endBody | sheet | Location sharing stops for all riders. This can't be undone. | 64 |
| live.endConfirm | sheet | End ride | 12 |
| live.msgTitle | sheet | Send to your group | 24 |
| live.msgSent | toast | Sent: {icon} {label} | 24 |
| live.msgSentTile | sheet | ✓ Sent | 8 |
| live.menuShare | menu | **replaced by `live.menuInvite`** | — |
| live.menuInvite | menu | Invite riders | 16 |
| live.menuLeave | menu | Leave ride | 16 |
| live.menuEnd | menu | End ride | 12 |
| live.leaveTitle | sheet | Leave the ride? | 20 |
| live.leaveBody | sheet | Your group will stop seeing you. You can rejoin with the code. | 72 |
| live.leaveConfirm | sheet | Leave ride | 16 |
| live.a11ySos | action bar | SOS. Press and hold for 2 seconds to alert your group | 56 |

Quick message labels/icons come from `MESSAGE_KINDS` (Fuel stop ⛽, Puncture 🛞, Slow down 🐢,
Regroup 🧭, Break ☕, All good 👍) + proposed `on_my_way` "On my way" 🏍 (07).

## Alerts, notifications, SOS (07)
| key | screen | text | max |
|---|---|---|---|
| alert.stopped | banner | {name} stopped · {dist} | 40 |
| alert.offline | banner | {name} lost signal · last seen {dist} | 48 |
| alert.message | banner | {name}: {label} | 28 |
| alert.sosCleared | banner | {name} is OK — SOS cleared | 32 |
| alert.view | banner | View | 6 |
| alert.sosPinned | banner | ⚠ SOS — {name} · {dist} | 40 |
| notif.sos.title | OS | ⚠ SOS from {name} | 30 |
| notif.sos.body | OS | {distYou} · tap to see where | 48 |
| notif.stopped.title | OS | {name} has stopped | 30 |
| notif.stopped.body | OS | {distYou} · {ride} | 60 |
| notif.offline.title | OS | {name} lost signal | 30 |
| notif.offline.body | OS | Last seen {distYou} | 40 |
| notif.sosCleared.title | OS | {name} is OK | 24 |
| notif.sosCleared.body | OS | SOS cleared · {ride} | 60 |
| notif.message.title | OS | {icon} {label} | 16 |
| notif.message.body | OS | From {name} · {ride} | 60 |
| notif.ended.title | OS | Ride ended | 12 |
| notif.ended.body | OS | {ride} is over. See your summary. | 60 |
| sos.title | takeover | ⚠ SOS | 6 |
| sos.needsHelp | takeover | {name} needs help | 28 |
| sos.lastPosition | takeover | Last position {duration} ago | 32 |
| sos.positionUnknown | takeover | Position unknown | 20 |
| sos.sentAt | takeover | Sent {time} | 12 |
| sos.navigate | takeover | 🧭 Navigate to {name} | 28 |
| sos.noPosition | takeover | No position to navigate to | 28 |
| sos.onMyWay | takeover | 🏍 I'm on my way | 18 |
| sos.onMyWaySent | takeover | ✓ Sent | 8 |
| sos.dismiss | takeover | Dismiss | 10 |
| sos.more | takeover | +{n} more SOS | 14 |
| sos.holding | action bar | Keep holding… | 16 |
| sos.holdHint | toast | Hold for 2 seconds to send SOS | 32 |
| sos.active | banner | ⚠ SOS on — your group was alerted | 36 |
| sos.retrying | banner | Sending SOS… no signal, retrying | 36 |
| sos.call | banner | 📞 112 | 6 |
| sos.cancelHold | action bar | Hold to cancel SOS | 20 |
| sos.cancelled | banner | SOS cancelled | 16 |
| sos.leaveWarning | sheet | Your SOS will be cancelled. | 32 |
| sos.a11yConfirm | sheet | Send SOS to your group now? | 32 |
| sos.call | banner, panels | Call 112 (as shipped; panels use `sosMe.call112`) | 10 |
| sos.bannerReopen | banner a11y | SOS on. Tap for call buttons | 32 |
| sos.contactsTitle | takeover | Call {name}'s emergency contacts | 40 |
| sos.callContact | takeover | Call {who} ({who} = relation, else contact first name) | 24 |
| sos.contactMeta | takeover | {name}'s {relation} · {phone} (no relation: {contactName} · {phone}) | 44 |
| sos.call112 | takeover | Call 112 · Emergency | 24 |
| sos.contactsPrivacy | takeover | Visible only while {name}'s SOS is on. | 44 |
| sos.contactsNone | takeover | {name} hasn't added emergency contacts. | 48 |
| sos.contactsUnavailable | takeover | Couldn't load {name}'s contacts. | 40 |
| sos.a11yCallContact | takeover | Call {name}'s {who}, {spokenPhone} | 80 |

## SOS sender panel (11 §5)
| key | screen | text | max |
|---|---|---|---|
| sosMe.title | panel | SOS on | 8 |
| sosMe.alerted | panel | Your group was alerted | 28 |
| sosMe.sending | panel | Sending to your group… | 28 |
| sosMe.retrying | panel | No signal. Still trying your group… | 40 |
| sosMe.alwaysOn | panel | Always on. Your group is told first, every time. | 52 |
| sosMe.call | panel | Call {who} | 24 |
| sosMe.call112 | panel | Call 112 · Emergency | 24 |
| sosMe.text | panel | Text my location to contacts | 32 |
| sosMe.textSub | panel | To {names} (first names, comma-separated, truncate) | 40 |
| sosMe.smsBody | SMS (ASCII, ≤160) | SOS from {name} (Throttle Tribe). I need help. Location: https://maps.google.com/?q={lat},{lng} at {time} | 160 |
| sosMe.smsBodyNoFix | SMS (ASCII) | SOS from {name} (Throttle Tribe). I need help. My location is unknown. Please call me. | 160 |
| sosMe.smsOpened | toast | Messages opened. Tap send if you haven't. | 44 |
| sosMe.emptyTitle | panel | No emergency contacts | 24 |
| sosMe.emptyAdd | panel | Add for next time | 20 |
| sosMe.minimise | panel | Map | 6 |
| sosMe.a11yMinimise | panel | Back to the map. SOS stays on | 36 |
`{name}` in SMS = my display name, ASCII-folded (non-ASCII letters → closest ASCII, else dropped) and truncated to 20.

## Emergency contacts (11)
| key | screen | text | max |
|---|---|---|---|
| contacts.title | contacts | Emergency contacts | 24 |
| contacts.groupNotice | contacts | Your ride group is always alerted when you send SOS. This can't be turned off. | 84 |
| contacts.heading ✎ | contacts | Who else should we help you reach? | 40 |
| contacts.sub ✎ | contacts | We show one-tap call buttons on your SOS screen. | 52 |
| contacts.listLabel | contacts | Your contacts · {n} of 5 | 24 |
| contacts.firstHint | contacts | The first one is the biggest button on your SOS screen. | 60 |
| contacts.alwaysLabel | contacts | Always available | 20 |
| contacts.builtIn112 | contacts | Emergency · 112 | 20 |
| contacts.builtInTag | contacts | Built in | 10 |
| contacts.privacy | contacts | Only you can see these. While your SOS is on, riders in your ride can see them so they can call for you. They're hidden again after. | 140 |
| contacts.emptyTitle | contacts | No emergency contacts yet | 28 |
| contacts.emptyBody ✎ | contacts | Add family or a friend. If you send SOS you can call them in one tap, and so can the riders helping you. | 110 |
| contacts.quickAmbulance | contacts | + Ambulance 108 | 18 |
| contacts.addFromContacts | contacts | Add from contacts | 20 |
| contacts.add | contacts | Add a contact | 16 |
| contacts.full | contacts | 5 of 5. Remove one to add another. | 40 |
| contacts.addTitle | sheet | Add a contact | 16 |
| contacts.editTitle | sheet | Edit contact | 16 |
| contacts.nameLabel | sheet | Name | 8 |
| contacts.phoneLabel | sheet | Phone | 8 |
| contacts.relationLabel | sheet | Relation (optional) | 20 |
| contacts.relMom / Dad / Partner / Friend / Doctor / Other | sheet | Mom / Dad / Partner / Friend / Doctor / Other… | 8 |
| contacts.relOtherPlaceholder | sheet | e.g. Brother | 16 |
| contacts.save | sheet | Save | 8 |
| contacts.added | toast | {name} added | 28 |
| contacts.saved | toast | Contact saved | 16 |
| contacts.edit | menu | Edit | 8 |
| contacts.moveUp | menu | Move up | 10 |
| contacts.moveDown | menu | Move down | 10 |
| contacts.remove | menu | Remove | 8 |
| contacts.removeTitle | sheet | Remove {name}? | 28 |
| contacts.removeBody | sheet | You won't see a call button for them on your SOS screen. | 60 |
| contacts.removeConfirm | sheet | Remove | 8 |
| contacts.errFull | inline | You already have 5 contacts. | 32 |
| contacts.errLoad | inline | Couldn't load your contacts. | 32 |
| contacts.a11yRow | contacts | {pos}, {name}, {relation}, {spokenPhone}. Actions | 96 |

## Nudges (11 §4, 12 §4)
| key | screen | text | max |
|---|---|---|---|
| nudge.contactsTitle | home | Add an emergency contact | 28 |
| nudge.contactsBody ✎ | home | Who should you be able to call in one tap if you send SOS? | 64 |
| nudge.contactsCta | home | Add contact | 16 |
| nudge.later | home | Later | 8 |
| nudge.lobbyBanner | lobby banner | Add an SOS contact before you ride | 36 |
| nudge.lobbyAdd | lobby banner | Add | 6 |
| nudge.saveTitle | home | Keep your rides | 20 |
| nudge.saveBody ✎ | home | Save your account so a new phone doesn't mean starting over. | 64 |
| nudge.saveCta | home | Save account | 16 |

## Phone input (10 §7)
| key | screen | text | max |
|---|---|---|---|
| phone.prefixTitle | sheet | Country code | 16 |
| phone.prefixOther | sheet | Other: type it with + | 24 |
| phone.placeholder | input | 98450 12210 | 16 |
| phone.invalid | inline | Check the number. Use 10 digits, or start with +. | 52 |
| phone.a11yPrefix | input | Country code {code}. Change | 28 |

## Invite (10)
| key | screen | text | max |
|---|---|---|---|
| invite.title | invite | Invite riders | 16 |
| invite.codeNote | invite | Anyone with this code can join. | 36 |
| invite.midRideNote | invite | They can join while you ride. | 32 |
| invite.textTitle | invite | Text people | 16 |
| invite.textSub | invite | Pick from your contacts | 28 |
| invite.shareTitle | invite | Share link | 16 |
| invite.shareSub | invite | WhatsApp, Telegram and more | 32 |
| invite.listTitle | invite | Invited ({n}) · {j} joined | 28 |
| invite.stateInvited | invite | Invited | 8 |
| invite.stateJoined | invite | Joined | 8 |
| invite.stateLeft | invite | Left | 6 |
| invite.sentAt | invite | Texted {time} | 16 |
| invite.joinedAs | invite | Joined as {rider} | 32 |
| invite.honestNote | invite | We can't see if a text was sent. "Joined" shows when someone with that name joins. | 88 |
| invite.emptyHint ✎ | invite | Text a few riders or share the link. They join with one tap. | 64 |
| invite.continue | invite | Continue to lobby | 20 |
| invite.done | invite | Done | 8 |
| invite.cta | live alone hint | Invite riders | 16 |
| invite.pickNumberTitle | sheet | Which number for {name}? | 36 |
| invite.noNumber | toast | {name} has no phone number. | 36 |
| invite.trayTitle | sheet | Text an invite | 16 |
| invite.addAnother | sheet | Add another | 16 |
| invite.typeNumber | sheet | Type a number | 16 |
| invite.add | sheet | Add | 6 |
| invite.openSms | sheet | Open messages | 16 |
| invite.openSmsN | sheet | Text {n} people | 16 |
| invite.nextPerson | sheet | Next: {name} · {i} of {n} | 28 |
| invite.trayDone | toast | {n} invites opened in Messages | 32 |
| invite.alreadyInvited | sheet | Already invited | 16 |
| invite.trayFull | toast | Up to 10 at a time. | 20 |
| invite.textAgain | sheet | Text again | 12 |
| invite.remove | sheet | Remove from list | 20 |
| invite.removed | toast | Removed | 8 |
| invite.smsUnavailable | toast | Texting isn't available on this phone. Share the link instead. | 64 |
| invite.permTitle | sheet | Pick people from your contacts | 32 |
| invite.permBody | sheet | We only read the person you pick. Nothing is uploaded. | 56 |
| invite.permCta | sheet | Continue | 12 |
| invite.permDenied | toast | No access to contacts. You can type a number. | 48 |
| invite.smsBody | SMS (ASCII, ≤160) | Join my ride "{ride}" on Throttle Tribe. Code {code3a} {code3b}: {link} ({ride} ≤ 24 chars + "...") | 160 |
| invite.shareMessage | share sheet | Join my ride "{ride}" on Throttle Tribe.\nCode: {code3a} {code3b}\n{link} | 200 |
| invite.link | — | https://aqzpdxyckwbxlvqnsnye.supabase.co/functions/v1/join?c={code} | 67 |
| invite.a11yText | invite | Text people. Pick from your contacts | 40 |
| invite.a11yShare | invite | Share link. WhatsApp, Telegram and more | 44 |
| invite.a11yRow | invite | {name}, {state}, {meta} | 72 |
| invite.a11yJoined | announce | {name} joined | 24 |
| invite.a11yRemove | tray | Remove {name} | 24 |

**SMS strings (`invite.smsBody`, `sosMe.smsBody*`) must be plain ASCII**: straight quotes, no em
dash, no ellipsis character (use `...`), no emoji. A unit test asserts `/^[\x20-\x7E]*$/` and ≤ 160.

### Hosted join page (edge function `join`)
| key | text | max |
|---|---|---|
| web.title | Join a ride · Throttle Tribe | 32 |
| web.heading | You're invited to a ride | 28 |
| web.codeLabel | Ride code | 12 |
| web.open | Open in Throttle Tribe | 24 |
| web.play | Get it on Google Play | 24 |
| web.help ✎ | New here? Install the app, then tap "Open" again or enter the code. | 72 |
| web.broken | This invite link is broken. Ask for the 6-digit code. | 56 |
| web.ogDescription | Tap to open the ride in Throttle Tribe. | 44 |

## Account (12)
| key | screen | text | max |
|---|---|---|---|
| account.saveTitle | identify | Save your account | 20 |
| account.saveSub ✎ | identify | Keep your rides and contacts if you change phones. | 56 |
| account.signinTitle | identify | Sign in | 12 |
| account.signinSub | identify | Use the email or phone you saved. | 40 |
| account.viaEmail / viaPhone | identify | Email / Phone | 8 |
| account.emailLabel | identify | Email | 8 |
| account.phoneLabel | identify | Phone | 8 |
| account.codeHint | identify | We'll send a 6-digit code. | 28 |
| account.sendCode | identify | Send code | 12 |
| account.emailInvalid | inline | Check the email address. | 28 |
| account.inRide | inline | Finish or leave your ride first. | 36 |
| account.replaceGuestTitle | sheet | Sign in instead of this guest? | 32 |
| account.replaceGuestBody | sheet | Rides and contacts from this guest stay with this guest and you'll lose them on this phone. Save this guest first if you want to keep them. | 150 |
| account.replaceGuestConfirm | sheet | Sign in anyway | 16 |
| account.saveGuestFirst | sheet | Save this guest first | 24 |
| account.guestTitle | profile | Guest account | 16 |
| account.guestBody | profile | Only on this phone. Save it to keep your rides and contacts if you change phones. | 88 |
| account.saveCta | profile | Save your account | 20 |
| account.savedTitle | profile | Account saved | 16 |
| account.signOut | profile | Sign out | 10 |
| account.signOutTitle | sheet | Sign out on this phone? | 28 |
| account.signOutBody | sheet | Your rides stay in your account. Sign in again with your email or phone. | 76 |
| account.signOutConfirm | sheet | Sign out | 10 |
| account.saved | toast | Account saved | 16 |
| account.welcomeBack | toast | Welcome back, {name} | 32 |
| account.noAccount | inline | No account with that {via}. Check it, or start as a new rider. | 64 |
| account.tryOther | inline | Use a different one | 20 |
| account.taken | inline | That {via} is already used by another account. | 52 |
| account.signInInstead | inline | Sign in instead | 16 |
`{via}` = "email" or "phone number".

## Code verification (12 §3)
| key | screen | text | max |
|---|---|---|---|
| otp.title | verify | Enter the code | 16 |
| otp.sentTo | verify | Sent to {to} | 48 |
| otp.change | verify | Change | 8 |
| otp.verify | verify | Verify | 8 |
| otp.resendIn | verify | Resend code in {m:ss} | 24 |
| otp.resend | verify | Resend code | 12 |
| otp.resent | toast | New code sent | 16 |
| otp.checkSpam | verify | Not there? Check spam. | 24 |
| otp.wrong | inline | That code didn't work. Check it and try again. | 48 |
| otp.expired | inline | That code expired. Send a new one. | 36 |
| otp.rateLimited | inline | Too many tries. Wait {n} min. | 32 |
| otp.tooMany | inline | Too many codes sent. Try again in 10 min. | 44 |
| otp.a11yInput | verify | Verification code, 6 digits | 28 |

## Summary (08)
| key | screen | text | max |
|---|---|---|---|
| summary.title | summary | Ride over (round 2: hero uses `summary.titleDone`) | 12 |
| summary.titleDone ✎ | summary | Ride complete | 16 |
| summary.heroUnit | summary | you rode | 10 |
| summary.heroMeta | summary | {ride} · {riders} · {date} | 60 |
| summary.stopsTile | summary | Stops | 8 |
| summary.share | summary | Share ride | 12 |
| summary.shareMessage ✎ | share sheet | Rode {km} with {n} riders in {duration} on Throttle Tribe. | 72 |
| summary.cancelledTitle | summary | Ride cancelled | 16 |
| summary.meta | summary | {ride} · {date} | 60 |
| summary.sharingStopped | summary | ✓ Location sharing stopped | 28 |
| summary.duration | summary | Duration | 10 |
| summary.myDistance | summary | You rode | 10 |
| summary.riders | summary | Riders | 8 |
| summary.sosTitle | summary | SOS ({n}) | 10 |
| summary.sosRow | summary | ⚠ {name} · {time} → cleared {time} | 40 |
| summary.sosNotCleared | summary | ⚠ {name} · {time} → not cleared | 40 |
| summary.stopsTitle | summary | Stops ({n}) | 12 |
| summary.stopRow | summary | ⏸ {name} · {time} | 28 |
| summary.noStops | summary | No stops longer than {n} min. | 32 |
| summary.ridersTitle | summary | Riders | 8 |
| summary.leftEarly | summary | left early | 12 |
| summary.home | summary | Back to home | 16 |

## Errors — every `RideErrorCode` (`ride-api.ts`) + screen errors
Replace `ERROR_MESSAGES` in `src/lib/ride-api.ts` with these texts.
| key | where it can appear | text | max |
|---|---|---|---|
| errors.not_authenticated | welcome, name, any RPC | Couldn't sign you in. Check your signal and try again. | 60 |
| errors.profile_required | create, join | Set your rider name first. | 32 |
| errors.ride_not_found | join | No open ride with that code. Check the 6 digits. | 52 |
| errors.not_leader_or_not_in_lobby | lobby Start | This ride has already started, or you're not the leader. | 60 |
| errors.not_leader_or_already_ended | End / Cancel | This ride is already over, or you're not the leader. | 56 |
| errors.leader_must_end_ride | Leave | You're the leader. End the ride instead of leaving. | 56 |
| errors.invalid_message_kind | messages | That message can't be sent. Update the app. | 48 |
| errors.not_a_member | any ride RPC | You're no longer in this ride. | 32 |
| errors.network | everywhere | No signal. Check your connection and try again. | 52 |
| errors.unknown | everywhere | Something went wrong. Try again. | 36 |
| errors.loadRide | lobby, live, summary | Couldn't load the ride. | 28 |
| errors.contact_limit_reached | contacts | You already have 5 contacts. | 32 |

Handling notes: `not_a_member` on any ride RPC → toast, then `replace('/home')`.
`not_leader_or_already_ended` → toast, refetch; if ended, the layout routes to summary.
`profile_required` → route to name/profile. All others → inline/toast + Try again.
