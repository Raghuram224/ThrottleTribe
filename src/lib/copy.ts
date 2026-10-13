// Single source of UI copy (docs/design/09-states-copy.md). Flat keys, no i18n library in MVP.
// Where docs/marketing/microcopy.md has a string for the same purpose that fits the designer's
// max length, marketing's wording is used (marked "mkt"). Templated strings use {placeholders};
// fill them with t(). Pure module: no React, no native imports.

export const copy = {
  // Common
  'common.tryAgain': 'Try again',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.back': 'Back',

  // Onboarding (01)
  'welcome.title': 'Throttle Tribe',
  'welcome.tagline': 'Ride together. Nobody gets left behind.',
  'welcome.point1': "See who's ahead and who's behind",
  'welcome.point2': 'Know when someone stops or loses signal',
  'welcome.point3': 'Hold SOS to alert your group and family',
  'welcome.noSignup': 'No sign-up. Just your name.',
  'welcome.cta': 'Get started',
  'welcome.errorNetwork': 'No signal. You need a connection once to get started.',
  'name.title': 'What should we call you?', // mkt
  'name.subtitle': 'Shown to your group on the map and in alerts.',
  'name.hint': 'Short names are easier to read at a glance.',
  'name.errorTooLong': 'Use 40 characters or fewer.',
  'name.cta': "Let's ride", // mkt
  'name.a11yInput': 'Your rider name',

  // Home, new ride, profile (02)
  'home.appName': 'Throttle Tribe',
  'home.heading': 'Ready to ride?',
  'home.offlineSaved': "You're offline — showing saved info",
  'home.subtitle': "Start a ride and share the code, or join a friend's ride.",
  'home.start': 'Start a ride',
  'home.join': 'Join with code',
  'home.resumeLabel': 'Ride in progress',
  'home.roleLeader': "You're the leader",
  'home.roleRider': "You're riding",
  'home.startedAgo': 'Started {duration} ago',
  'home.inLobby': 'Waiting in the lobby',
  'home.resume': 'Back to ride',
  'home.toastWelcome': "You're all set, {name}",
  'home.a11yProfile': 'Your profile, {name}. Edit name',
  'home.a11yProfileNoName': 'Your profile. Edit name',
  'home.profileNoName': 'Profile',
  'home.confirmSwitchTitle': 'Leave {ride}?',
  'home.confirmSwitchBody': 'You can only be in one ride. Your group in {ride} will stop seeing you.',
  'home.confirmSwitchConfirm': 'Leave and continue',
  'home.leaderBusyTitle': "You're leading {ride}",
  'home.leaderBusyBody': 'End that ride before starting or joining another.',
  'home.leaderBusyAction': 'Go to {ride}',
  'newRide.title': 'New ride',
  'newRide.nameLabel': 'Ride name',
  'newRide.thresholdPreview': "We'll alert the group if someone stays still for {n} min.",
  'newRide.defaultName': "{name}'s ride",
  'newRide.defaultNameUnknown': 'Group ride',
  'newRide.thresholdLabel': 'Alert when a rider has stopped for',
  'newRide.threshold1': '1 min',
  'newRide.threshold3': '3 min',
  'newRide.threshold5': '5 min',
  'newRide.thresholdHint': 'Shorter means more alerts at traffic lights.',
  'newRide.cta': 'Create ride',
  'newRide.setName': 'Set your name first',
  'profile.title': 'Profile',
  'profile.nameLabel': 'Name',
  'profile.themeLabel': 'Light or dark',
  'profile.themeAuto': 'Auto',
  'profile.themeLight': 'Light',
  'profile.themeDark': 'Dark',
  'profile.themeHint': 'Pick Light for bright sun.',
  'profile.guestNote': 'Guest account on this phone. Deleting the app removes it.',
  'profile.save': 'Save',
  'profile.saved': 'Name saved',
  // Not in 09 (engineer-authored; needs designer/marketing review).
  'profile.delete': 'Delete my account',
  'profile.deleteTitle': 'Delete your account?',
  'profile.deleteBody':
    "This removes your name, rides, emergency contacts and location history. Rides you lead will end. You can't undo this.",
  'profile.deleteConfirm': 'Delete account',

  // Join (03)
  'join.title': 'Join a ride',
  'join.heading': 'Enter the ride code',
  'join.subtitle': 'Ask the leader for the 6 digits.',
  'join.pasteHint': 'Long-press the boxes to paste.',
  'join.cta': 'Join',
  'join.a11yInput': 'Ride code, 6 digits',
  'join.switchTitle': "You're in {ride}",
  'join.switchBody': 'Leave it to join {code}?',
  'join.switchConfirm': 'Leave and join',

  // Permissions (04)
  'perm.step': 'Step {n} of {total}',
  'perm.skip': 'Skip',
  'perm.a11ySkip': 'Skip, continue without this',
  'perm.loc.title': 'Show you on the map', // mkt
  'perm.loc.why1': 'Your group sees where you are only during this ride.',
  'perm.loc.why2': 'Sharing stops when the ride ends or you leave.',
  'perm.loc.why3': 'Nobody outside the ride can see it.',
  'perm.loc.cta': 'Allow location',
  'perm.bg.title': 'Keep sharing when locked', // mkt
  'perm.bg.why':
    'During a ride we keep sharing your position with the screen off. It stops when the ride ends or you leave.', // mkt
  'perm.bg.androidHow': 'On the next screen choose **Allow all the time**, then come back.',
  'perm.bg.iosHow': 'When iOS asks, choose **Change to Always Allow**.',
  'perm.bg.cta': 'Continue',
  'perm.notif.title': 'Get ride alerts', // mkt
  'perm.notif.why': "We'll tell you when a rider stops, loses signal or sends SOS.",
  'perm.notif.cta': 'Allow alerts',
  'perm.startFailed': "Couldn't start sharing your location.",

  // Banners (00, 04)
  'banner.offline': "You're offline — positions may be old",
  // Phone has network but the ride channel is not up yet.
  'banner.reconnecting': 'Reconnecting to the ride…',
  'banner.backOnline': 'Back online',
  'banner.notSharing': "Your location isn't shared",
  'banner.bgOff': 'Sharing stops when locked',
  'banner.notifOff': 'Alerts show only in the app',
  'banner.gpsOff': 'Location is off on this phone',
  'banner.fix': 'Fix',

  // Status (06)
  // Text only: the icon is drawn by <Icon> next to it, so labels never contain symbols.
  'status.moving': 'Moving',
  'status.stopped': 'Stopped · {duration}',
  'status.offline': 'No signal · {duration}',
  'status.noSignalYet': 'No signal yet',
  'status.sos': 'SOS · {duration}',

  // Lobby (05)
  'lobby.headerMeta': 'Lobby · {riders}', // {riders} = riderCount(n): "1 rider" / "3 riders"
  'lobby.codeLabel': 'Ride code',
  'lobby.share': 'Share code',
  'lobby.shareMessage':
    'Join my ride "{ride}" on Throttle Tribe. Code: {code3a} {code3b}. Tap: throttletribe://join?code={code}',
  'lobby.threshold': 'Stop alert after {n} min',
  'lobby.ridersTitle': 'Riders',
  'lobby.readyCount': '{r} of {n} ready',
  'lobby.you': '(you)',
  'lobby.leaderTag': 'Leader',
  'lobby.ready': 'Ready',
  'lobby.connected': 'Connected',
  'lobby.away': 'Away',
  'lobby.notSharing': 'Not sharing',
  'lobby.emptyHint': 'Share the code. Riders appear here as they join.',
  'lobby.startHint': 'Start any time — late riders can still join.',
  'lobby.start': 'Start ride',
  'lobby.waiting': 'Waiting for {leader} to start',
  'lobby.leave': 'Leave ride',
  'lobby.leaveTitle': 'Leave this ride?',
  'lobby.leaveBody': 'Your group will stop seeing you. You can rejoin with the code.',
  'lobby.leaveConfirm': 'Leave ride',
  'lobby.cancelRide': 'Cancel ride',
  'lobby.cancelTitle': 'Cancel this ride for everyone?',
  'lobby.cancelBody': 'Everyone in the lobby will be sent home.',
  'lobby.cancelConfirm': 'Cancel ride',
  'lobby.started': 'Ride started — ride safe!',
  'lobby.a11yCode': 'Ride code {digits}',

  // Live ride (06)
  'live.headerMeta': '{time} · {riders}',
  'live.elapsedMin': '{n} min',
  'live.elapsedHm': '{h} h {mm} min',
  'live.elapsedH': '{h} h',
  'live.elapsedJustStarted': 'Just started',
  'live.elapsedDh': '{d} d {h} h',
  'header.online': 'Online',
  'live.connLive': 'Live',
  'live.connConnecting': 'Connecting',
  'live.connOffline': 'Offline',
  'live.toListOnly': 'List only',
  'live.showMap': 'Show map',
  'live.list': 'List',
  'live.fitAllA11y': 'Show all riders',
  'live.map': 'Map',
  'live.attribution': '© OpenFreeMap © OpenStreetMap',
  'live.mapWaiting': 'Waiting for positions…',
  'live.fitAll': 'All',
  'live.offRoute': 'Off route',
  'live.ahead': '{km} ahead',
  'live.behind': '{km} behind',
  'live.level': 'With you',
  'live.away': '{km} away',
  'live.noLocation': 'No location yet',
  'live.noMyFix': 'Waiting for your GPS — distances will appear soon',
  'live.you': 'You',
  'live.sharing': 'Sharing',
  'live.notSharing': 'Not sharing',
  'live.sosOn': 'SOS on',
  'live.alone': 'Share the code so others can join.',
  'live.msg': 'Message',
  'live.sos': 'Hold for SOS',
  'live.end': 'End',
  'live.a11yEnd': 'End ride for everyone',
  'live.endTitle': 'End the ride for everyone?',
  'live.endBody': "Location sharing stops for all riders. This can't be undone.",
  'live.endConfirm': 'End ride',
  'live.msgTitle': 'Send to your group',
  'live.msgSent': 'Sent: {icon} {label}',
  'live.msgSentTile': 'Sent',
  'live.menuShare': 'Share code',
  'profile.editLabel': 'Edit',
  'live.keepRiding': 'Keep riding',
  'live.menuLeave': 'Leave ride',
  'live.menuEnd': 'End ride',
  'live.leaveTitle': 'Leave the ride?',
  'live.leaveBody': 'Your group will stop seeing you. You can rejoin with the code.',
  'live.leaveConfirm': 'Leave ride',
  'live.a11ySos': 'SOS. Press and hold for 2 seconds to alert your group',

  // Alerts, notifications, SOS (07)
  'alert.stopped': '{name} · stopped · {dist}',
  'alert.offline': '{name} · no signal · {dist}',
  'alert.message': '{name}: {label}',
  'alert.sosCleared': '{name} is OK — SOS cleared',
  'alert.view': 'View',
  'alert.sosPinned': 'SOS — {name} · {dist}',
  'alert.sosPinnedNoDist': 'SOS — {name}', // eng: position unknown
  'alert.sosPinnedMany': '{n} SOS — {name} +{more} more', // eng: 07 "pinned banner shows the count"
  'notif.sos.title': '⚠ SOS from {name}',
  'notif.sos.body': '{distYou} · tap to see where',
  'notif.stopped.title': '{name} has stopped',
  'notif.stopped.body': '{distYou} · {ride}',
  'notif.offline.title': '{name} lost signal',
  'notif.offline.body': 'Last seen {distYou}',
  'notif.sosCleared.title': '{name} is OK',
  'notif.sosCleared.body': 'SOS cleared · {ride}',
  'notif.message.title': '{icon} {label}',
  'notif.message.body': 'From {name} · {ride}',
  'notif.ended.title': 'Ride ended',
  'notif.ended.body': '{ride} is over. See your summary.',
  'notif.ended.bodyNoRide': 'The leader ended the ride. See your summary.', // mkt (fallback)
  'sos.title': 'SOS',
  'sos.emergencyTitle': 'Emergency',
  // Sentence-case headline variants of the distance (takeover).
  'sos.distWith': 'Right next to you',
  'sos.distAhead': '{d} ahead of you',
  'sos.distBehind': '{d} behind you',
  'sos.needsHelp': '{name} needs help',
  'sos.lastPosition': 'Last position {duration} ago',
  'sos.positionUnknown': 'Position unknown',
  'sos.sentAt': 'Sent {time}',
  'sos.navigate': 'Navigate to {name}',
  'sos.noPosition': 'No position to navigate to',
  'sos.onMyWay': "I'm on my way",
  'sos.onMyWaySent': 'Sent',
  'sos.dismiss': 'Dismiss',
  'sos.more': '+{n} more SOS',
  'sos.holding': 'Keep holding…',
  'sos.holdHint': 'Hold for 2 seconds to send SOS',
  'sos.active': 'SOS on — your group was alerted',
  'sos.sending': 'Sending SOS…', // eng: first attempt in flight
  'sos.retrying': 'Sending SOS… no signal, retrying',
  'sos.call': 'Call 112',
  'sos.cancelHold': 'Hold to cancel SOS',
  'sos.cancelled': 'SOS cancelled',
  'sos.leaveWarning': 'Your SOS will be cancelled.',
  'sos.a11yConfirm': 'Send SOS to your group now?',

  // Summary (08)
  'summary.title': 'Ride over', // superseded by summary.titleDone (13 §9)
  'summary.cancelledTitle': 'Ride cancelled',
  'summary.meta': '{ride} · {date}',
  'summary.sharingStopped': 'Location sharing stopped',
  'summary.duration': 'Duration',
  'summary.myDistance': 'You rode',
  'summary.riders': 'Riders',
  'summary.sosTitle': 'SOS ({n})',
  'summary.sosRow': '{name} · {time} → cleared {time2}',
  'summary.sosNotCleared': '{name} · {time} → not cleared',
  'summary.stopsTitle': 'Stops ({n})',
  'summary.stopRow': '{name} · {time}',
  'summary.noStops': 'No stops longer than {n} min.',
  'summary.ridersTitle': 'Riders',
  'summary.leftEarly': 'left early',
  'summary.home': 'Back to home',

  // --- sos contacts --- (docs/design/11, 09; "mkt" = marketing Round 2 wording)
  'profile.safetyLabel': 'Safety',
  'contacts.title': 'Emergency contacts',
  'contacts.groupNotice': "Your ride group is always alerted when you send SOS. This can't be turned off.",
  'contacts.heading': 'Who else should we help you reach?',
  'contacts.sub': 'We show one-tap call buttons on your SOS screen.',
  'contacts.listLabel': 'Your contacts · {n} of 5',
  'contacts.firstHint': 'The first one is the biggest button on your SOS screen.',
  'contacts.alwaysLabel': 'Always available',
  'contacts.builtIn112': 'Emergency · 112',
  'contacts.builtInTag': 'Built in',
  'contacts.privacy':
    "Only you can see these. While your SOS is on, riders in your ride can see them so they can call for you. They're hidden again after.",
  'contacts.emptyTitle': 'No emergency contacts yet',
  'contacts.emptyBody':
    'Add family or a friend. If you send SOS you can call them in one tap, and so can the riders helping you.',
  'contacts.quickAmbulance': '+ Ambulance 108',
  'contacts.addFromContacts': 'Add from contacts',
  'contacts.add': 'Add a contact',
  'contacts.full': '5 of 5. Remove one to add another.',
  'contacts.addTitle': 'Add a contact',
  'contacts.editTitle': 'Edit contact',
  'contacts.nameLabel': 'Name',
  'contacts.phoneLabel': 'Phone',
  'contacts.phonePlaceholder': '98450 12210',
  'contacts.relationLabel': 'Relation (optional)',
  'contacts.relMom': 'Mom',
  'contacts.relDad': 'Dad',
  'contacts.relPartner': 'Partner',
  'contacts.relFriend': 'Friend',
  'contacts.relDoctor': 'Doctor',
  'contacts.relOther': 'Other…',
  'contacts.relOtherPlaceholder': 'e.g. Brother',
  'contacts.save': 'Save',
  'contacts.added': '{name} added',
  'contacts.saved': 'Contact saved',
  'contacts.edit': 'Edit',
  'contacts.moveUp': 'Move up',
  'contacts.moveDown': 'Move down',
  'contacts.remove': 'Remove',
  'contacts.removeTitle': 'Remove {name}?',
  'contacts.removeBody': "They won't show up if you send an SOS.", // mkt (ec.remove.confirm.body)
  'contacts.removeConfirm': 'Remove',
  'contacts.errFull': 'You already have 5 contacts.',
  'contacts.errLoad': "Couldn't load your contacts.",
  'contacts.errName': 'Enter a name.', // mkt (ec.error.name)
  'contacts.errPhone': 'Check the number. Use 10 digits, or start with +.',
  'contacts.errDuplicate': 'That number is already saved.', // mkt (ec.error.duplicate)
  'contacts.permTitle': 'Pick an emergency contact',
  'contacts.permBody': "We open your contacts so you can pick one person. We don't upload your contacts.",
  'contacts.permCta': 'Allow contacts',
  'contacts.permDenied': 'No access to contacts. You can type a number.',
  'contacts.noNumber': 'That contact has no phone number.',
  'contacts.pickNumber': 'Which number?',
  'contacts.a11yRow': '{pos}, {name}, {relation}, {phone}. Actions',

  'nudge.contactsTitle': 'Add emergency contacts', // mkt (ec.nudge.title)
  'nudge.contactsBody': 'Know who to call if you need help on a ride.', // mkt
  'nudge.contactsCta': 'Add contacts', // mkt
  'nudge.later': 'Later',
  'nudge.lobbyBanner': 'No SOS contact yet',
  'nudge.lobbyAdd': 'Add',

  'sosMe.title': 'SOS on',
  'sosMe.alerted': 'Your group was alerted',
  'sosMe.sending': 'Sending to your group…',
  'sosMe.retrying': 'No signal. Still trying your group…',
  'sosMe.alwaysOn': 'Always on. Your group is told first, every time.',
  'sosMe.call': 'Call {who}',
  'sosMe.call112': 'Call 112 · Emergency',
  'sosMe.text': 'Text my location to contacts',
  'sosMe.textSub': 'To {names}',
  'sosMe.smsOpened': "Messages opened. Tap send if you haven't.",
  'sosMe.smsUnavailable': "Texting isn't available on this phone.",
  'sosMe.smsFail': "Couldn't open your messages app.", // mkt (sos.contacts.text.fail)
  'sosMe.callFail': "Couldn't open the phone app. Dial {phone}.", // mkt (sos.contacts.call.fail)
  'sosMe.emptyTitle': 'No emergency contacts',
  'sosMe.emptyAdd': 'Add for next time',
  'sosMe.minimise': 'Map',
  'sosMe.a11yMinimise': 'Back to the map. SOS stays on',
  'sosMe.a11yReopen': 'SOS on. Open call and text options',
  // SMS bodies: plain ASCII, one SMS. Marketing wording (sos.sms), no time stamp.
  'sosMe.smsBody': 'SOS from {name}. I need help. My location: {mapsLink}', // mkt
  'sosMe.smsBodyNoFix': "SOS from {name}. I need help. My location isn't available yet. Please call me.", // mkt

  'sos.contactsTitle': "Call {name}'s emergency contacts",
  'sos.callContact': 'Call {who}',
  'sos.contactMeta': "{name}'s {relation} · {phone}",
  'sos.contactMetaPlain': '{contactName} · {phone}',
  'sos.contactsPrivacy': "Visible only while {name}'s SOS is on.",
  'sos.contactsNone': "{name} hasn't added emergency contacts.",
  'sos.contactsUnavailable': "Couldn't load {name}'s contacts.",

  // --- invite --- (docs/design/10, 09; "mkt" = marketing Round 2 wording)
  'invite.title': 'Invite riders',
  'invite.codeNote': 'Anyone with this code can join.',
  'invite.midRideNote': 'They can join while you ride.',
  'invite.textTitle': 'Text people',
  'invite.textSub': 'Pick from your contacts',
  'invite.shareTitle': 'Share link',
  'invite.shareSub': 'WhatsApp, Telegram and more',
  'invite.listTitle': 'Invited ({n}) · {j} joined',
  'invite.stateInvited': 'Invited',
  'invite.stateJoined': 'Joined',
  'invite.stateLeft': 'Left',
  'invite.sentAt': 'Texted {time}',
  'invite.joinedAs': 'Joined as {rider}',
  'invite.honestNote': 'We can\'t see if a text was sent. "Joined" shows when someone with that name joins.',
  'invite.emptyHint': 'Text a few riders or share the link. They join with one tap.',
  'invite.continue': 'Continue to lobby',
  'invite.done': 'Done',
  'invite.cta': 'Invite riders',
  'invite.pickNumberTitle': 'Which number for {name}?',
  'invite.noNumber': '{name} has no phone number.',
  'invite.trayTitle': 'Text an invite',
  'invite.addAnother': 'Add another',
  'invite.typeNumber': 'Type a number',
  'invite.add': 'Add',
  'invite.openSms': 'Open messages',
  'invite.openSmsN': 'Text {n} people',
  'invite.nextPerson': 'Next: {name} · {i} of {n}',
  'invite.trayDone': '{n} invites opened in Messages',
  'invite.alreadyInvited': 'Already invited',
  'invite.trayFull': 'Up to 10 at a time.',
  'invite.textAgain': 'Text again',
  'invite.remove': 'Remove from list',
  'invite.removed': 'Removed',
  'invite.smsUnavailable': "Texting isn't available on this phone. Share the link instead.",
  'invite.smsNote': 'Opens your messages app. You tap send.', // mkt (invite.sms.note)
  'invite.permTitle': 'Find your riding buddies', // mkt (invite.perm.title)
  'invite.permBody': 'We only read the person you pick. Nothing is uploaded.',
  'invite.permCta': 'Continue',
  'invite.permDenied': 'No access to contacts. You can type a number.',
  'invite.permBlocked': 'Contacts are off for this app. Open settings, or type a number.',
  // SMS and share texts. Plain ASCII; the SMS must stay in one 160-character segment. The "NoLink"
  // variants are used when EXPO_PUBLIC_INVITE_BASE_URL is not set, so we never print a broken link.
  'invite.smsBody': 'Join my ride "{ride}" on Throttle Tribe. Code {code3a} {code3b}: {link}',
  'invite.smsBodyNoLink': 'Join my ride "{ride}" on Throttle Tribe. Code {code3a} {code3b}',
  'invite.shareMessage': 'Join my ride "{ride}" on Throttle Tribe.\nCode: {code3a} {code3b}\n{link}',
  'invite.shareMessageNoLink': 'Join my ride "{ride}" on Throttle Tribe.\nCode: {code3a} {code3b}',
  'invite.a11yText': 'Text people. Pick from your contacts',
  'invite.a11yShare': 'Share link. WhatsApp, Telegram and more',
  'invite.a11yRow': '{name}, {state}, {meta}',
  'invite.a11yJoined': '{name} joined',
  'invite.a11yRemove': 'Remove {name}',
  'lobby.invite': 'Invite riders',
  'lobby.invitedLine': '{n} invited · {j} joined',
  'live.menuInvite': 'Invite riders',
  'perm.openSettings': 'Open settings',
  'phone.prefixTitle': 'Country code',
  'phone.prefixOther': 'Other: type it with +',
  'phone.placeholder': '98450 12210',
  'phone.invalid': 'Check the number. Use 10 digits, or start with +.',
  'phone.a11yPrefix': 'Country code {code}. Change',
  // --- end invite ---

  // --- account --- (docs/design/12, 09; "mkt" = marketing Round 2 wording)
  'welcome.signIn': 'I have an account',
  'profile.sectionAccount': 'Account',
  'account.saveTitle': 'Save your account',
  'account.saveSub': 'Keep your rides and contacts if you change phones.',
  'account.signinTitle': 'Sign in',
  'account.signinSub': 'Use the email or phone you saved.',
  'account.viaEmail': 'Email',
  'account.viaPhone': 'Phone',
  'account.emailLabel': 'Email',
  'account.phoneLabel': 'Phone',
  'account.codeHint': "We'll send a 6-digit code.",
  'account.sendCode': 'Send code',
  'account.emailInvalid': 'Check the email address.',
  'account.inRide': 'Finish or leave your ride first.',
  'account.replaceGuestTitle': 'Sign in instead of this guest?',
  'account.replaceGuestBody':
    "Rides and contacts from this guest stay with this guest and you'll lose them on this phone. Save this guest first if you want to keep them.",
  'account.replaceGuestConfirm': 'Sign in anyway',
  'account.saveGuestFirst': 'Save this guest first',
  'account.guestTitle': 'Guest account',
  'account.guestBody': 'Only on this phone. Save it to keep your rides and contacts if you change phones.',
  'account.saveCta': 'Save your account',
  'account.savedTitle': 'Account saved',
  'account.signOut': 'Sign out',
  'account.signOutTitle': 'Sign out on this phone?',
  'account.signOutBody': 'Your rides stay in your account. Sign in again with your email or phone.',
  'account.signOutConfirm': 'Sign out',
  'account.saved': 'Account saved',
  'account.welcomeBack': 'Welcome back, {name}',
  'account.noAccount': 'No account with that {via}. Check it, or start as a new rider.',
  'account.tryOther': 'Use a different one',
  'account.taken': 'That {via} is already used by another account.',
  'account.signInInstead': 'Sign in instead',
  'account.viaWordEmail': 'email',
  'account.viaWordPhone': 'number',
  'account.sendFailed': "We couldn't send the code. Check the {via} and try again.",
  'otp.title': 'Enter the code',
  'otp.sentTo': 'Sent to {to}',
  'otp.change': 'Change',
  'otp.verify': 'Verify',
  'otp.resendIn': 'Resend code in {time}',
  'otp.resend': 'Resend code',
  'otp.resent': 'New code sent',
  'otp.checkSpam': 'Not there? Check spam.',
  'otp.wrong': "That code isn't right. Check it and try again.", // mkt (otp.error.invalid)
  'otp.expired': 'That code expired. Send a new one.',
  'otp.rateLimited': 'Too many tries. Wait {n} min.',
  'otp.tooMany': 'Too many codes sent. Try again in 10 min.',
  'otp.a11yInput': 'Verification code, 6 digits',
  // --- end account ---

  // --- recent rides --- (docs/design/13 §3, 09)
  'home.recentTitle': 'Recent rides',
  'home.recentEmptyTitle': 'Your rides will show here',
  'home.recentEmptyBody': 'Start one and share the code. It takes 10 seconds.',
  'home.seeAll': 'See all rides',
  'home.a11yRecentRow': '{ride}, {date}, {meta}. Open summary',
  // --- end recent rides ---

  // --- ux overhaul --- (docs/design/13, 09)
  'name.previewLabel': 'This is how riders see you',
  'name.hintLong': 'Riders will see "{first}" in alerts.',
  'home.greetMorning': 'Good morning, {name}',
  'home.greetAfternoon': 'Good afternoon, {name}',
  'home.greetEvening': 'Good evening, {name}',
  // Used while the name is unknown (profile not loaded yet): never "Good evening, ".
  'home.greetMorningNoName': 'Good morning',
  'home.greetAfternoonNoName': 'Good afternoon',
  'home.greetEveningNoName': 'Good evening',
  'home.quickJoinTitle': 'Have a ride code?',
  'home.quickJoinSub': 'Enter 6 digits',
  'home.a11yProfileTodo': '{n} things to set up',
  'home.a11yProfileTodoOne': '1 thing to set up',
  'nudge.saveTitle': 'Keep your rides',
  'nudge.saveBody': "Save your account so a new phone doesn't mean starting over.",
  'nudge.saveCta': 'Save account',
  'newRide.threshold1Hint': 'city',
  'newRide.threshold3Hint': 'default',
  'newRide.threshold5Hint': 'highway',
  'newRide.suggest1': 'Sunday ride',
  'newRide.suggest2': 'Breakfast run',
  'newRide.suggest3': 'Weekend tour',
  'profile.editName': 'Edit name',
  'profile.a11yEditName': 'Your name, {name}. Edit',
  'profile.sectionSafety': 'Safety',
  'profile.sectionAppearance': 'Appearance',
  'profile.sectionPrivacy': 'Privacy',
  'profile.contactsRow': 'Emergency contacts',
  'profile.contactsValue': '{n} of 5',
  'profile.contactsNotSet': 'Not set',
  'profile.howSharing': 'How sharing works',
  'profile.haptics': 'Vibration',
  'profile.hapticsHint': 'Feedback when you tap. SOS always vibrates.',
  'profile.version': 'Throttle Tribe {version}',
  'lobby.emptyTitle': 'Nobody here yet',
  'lobby.a11yLongPressCode': 'Ride code {digits}. Long-press to share',
  'lobby.setupTitle': 'Your setup',
  'lobby.setupLocation': 'Location',
  'lobby.setupAlerts': 'Alerts',
  'lobby.setupContact': 'SOS contact',
  'lobby.a11ySetupDone': '{item}, done',
  'lobby.a11ySetupMissing': '{item}, not set up. Tap to fix',
  'summary.titleDone': 'Ride complete',
  'summary.heroUnit': 'you rode',
  'summary.heroMeta': '{ride} · {riders} · {date}',
  'summary.stopsTile': 'Stops',
  'summary.share': 'Share ride',
  // {riders} = riderCount(n): "1 rider" / "6 riders" (the spec's "{n} riders" would read "1 riders").
  'summary.shareMessage': 'Rode {km} with {riders} in {duration} on Throttle Tribe.',
  'summary.shareMessageNoKm': 'Rode with {riders} for {duration} on Throttle Tribe.',
  'summary.a11yHero': 'You rode {distance}',
  'summary.a11yTile': '{label}, {value}',
  // --- end ux overhaul ---

  // --- signature pass (16) ---
  'nudge.addShort': 'Add',
  'nudge.saveShort': 'Save',
  'convoy.together': 'Riding together',
  'convoy.spread': '{spread} spread',
  'convoy.behind': 'Behind',
  'convoy.ahead': 'Ahead',
  'convoy.offRoute': '+{n} off route',
  'live.seenAgo': 'seen {age} ago',
  'live.mapView': 'Map view',
  'live.listView': 'List view',
  'live.centerMeA11y': 'Centre on me',
  'live.recentre': 'Re-centre',
  'live.recentreA11y': 'Re-centre on me and follow',
  'live.followingA11y': 'Following you',
  'live.sheetExpandA11y': 'Expand riders',
  'live.sheetCollapseA11y': 'Collapse riders',
  'live.sheetA11y': 'Riders panel',
  'live.sheetValueCollapsed': 'Collapsed',
  'live.sheetValueHalf': 'Half open',
  'live.sheetValueExpanded': 'Fully open',
  'live.sumSep': ' · ',
  'live.sumSos': '{n} SOS',
  'live.sumStopped': '{n} stopped',
  'live.sumOffline': '{n} offline',
  // --- full map / solo ride (19 B, C) ---
  'live.fullMapA11y': 'Full map',
  'live.exitFullMapA11y': 'Exit full map',
  'live.sosShort': 'SOS',
  'live.sosCancelShort': 'Cancel',
  'live.soloSummary': 'Solo ride',
  'live.soloSummarySpeed': 'Solo ride · {kmh} km/h',
  'live.speedUnit': 'km/h',
  'live.speedA11y': '{kmh} kilometres per hour',
  'home.soloTitle': 'Ride solo',
  'home.soloSub': 'Just you on the map. Invite riders later.',
  'solo.rideName': 'Solo ride',
  // --- end full map / solo ride ---
  'welcome.headline': 'Ride together.\nNobody gets left behind.',
  'welcome.body': "See who's ahead, who's behind and who stopped. One glance, gloves on.",
  'welcome.notifTitle': 'Priya stopped · 2 min',
  'welcome.notifSub': '1.7 km behind you',
  'welcome.notifNow': 'now',
  'home.statMonth': 'This month',
  'home.statRides': 'Rides',
  'home.statSaddle': 'In the saddle',
  'home.a11yStats': '{km} this month, {rides}, {time} in the saddle',
  'home.rideRole': "{role} · {riders}",
  'home.convoyAllMoving': 'Everyone is moving',
  'home.excNoSignal': '{name} · no signal {age}',
  'home.excStopped': '{name} · stopped {age}',
  'home.excSos': '{name} · SOS',
  'home.joinTitle': 'Join with a code',
  'home.joinSub': '6 digits from the leader',
  'home.seeAllShort': 'See all',
  'home.firstTitle': 'Welcome, {name}',
  'home.firstTitleNoName': 'Welcome',
  'home.firstSub': 'Your first group ride is three steps away.',
  'home.step1Title': 'Start a ride',
  'home.step1Body': 'Name it and pick when to flag a stop.',
  'home.step2Title': 'Share the 6-digit code',
  'home.step2Body': 'Riders join from WhatsApp or the code. No sign-up.',
  'home.step3Title': 'Ride. Nobody gets lost.',
  'home.step3Body': 'Everyone sees who is ahead, behind or stopped.',
  'home.a11ySketch': 'Route shape',
  'summary.youRode': 'You rode',
  'summary.time': 'Time',
  'summary.average': 'Average',
  'summary.a11yStats': '{distance} you rode, {duration}, average {speed} kilometres per hour',
  'summary.logStarted': 'Started · {riders}',
  'summary.logStopped': '{name} stopped',
  'summary.logSos': '{name} sent SOS',
  'summary.logSosCleared': 'Cleared {time}',
  'summary.logSosNotCleared': 'Not cleared',
  'summary.logEnded': 'Ride ended',
  'summary.logEndedMeta': 'Location sharing stopped for everyone',
  'summary.logKm': 'km {n}',
  'summary.ridersAll': 'All finished together',
  'summary.ridersEarly': '{n} left early',
  'summary.a11yClose': 'Back to home',
  'summary.a11yFit': 'Fit route',
  'summary.a11yRouteMap': 'Map of the route you rode',
  'profile.styleLabel': 'Style',
  'profile.styleTribe': 'Tribe',
  'profile.styleMaps': 'Maps',
  'profile.styleHint': 'Changes the colours and the map. Alert colours never change.',
  'profile.styleTribeSub': 'Bold orange',
  'profile.styleMapsSub': 'Familiar blue',
  'profile.a11yStyleTribe': 'Tribe, bold orange',
  'profile.a11yStyleMaps': 'Maps, familiar blue map look',
  // --- end signature pass ---

  // --- next stop, search (docs/design/19) ---
  'search.pill': 'Search stops along the way',
  'search.pillNoStop': 'Set a destination to see the route ahead',
  'search.placeholder': 'Search cafes, fuel, places',
  'search.hintMin': 'Type at least 3 letters',
  'search.chipCoffee': 'Coffee',
  'search.chipFuel': 'Fuel',
  'search.chipFood': 'Food',
  'search.chipParking': 'Parking',
  'search.chipToilets': 'Toilets',
  'search.attribution': 'Search by OpenStreetMap contributors',
  'search.error': 'Search needs a connection',
  'search.retry': 'Try again',
  'search.empty': 'No places found',
  'search.away': '{km} away',
  'search.a11yClear': 'Clear search',
  'search.a11yBack': 'Back to the map',
  'stop.leaderBreak': 'Stop here for a break',
  'stop.leaderDestination': 'Make it the destination',
  'stop.riderBreak': 'Suggest a break here',
  'stop.riderDestination': 'Suggest as destination',
  'stop.toastSent': 'Sent to {name} for approval',
  'stop.toastSet': 'Next stop: {name}',
  'stop.toastAccepted': '{name} accepted your stop',
  'stop.toastDeclined': '{name} declined your stop',
  'stop.toastCleared': 'Next stop removed',
  'stop.cardLine': '{glyph} {name} · {km} · {eta}',
  'stop.cardLineApprox': '{glyph} {name} · ≈ {km}',
  'stop.cardLineNoDistance': '{glyph} {name}',
  'stop.arrived': "You've arrived",
  'stop.suggestedBy': 'Suggested by {name}',
  'stop.a11yCard': 'Next stop: {line}. Tap to see it on the map.',
  'stop.a11yClear': 'Remove the next stop',
  'stop.clearTitle': 'Remove the stop for everyone?',
  'stop.clearConfirm': 'Remove stop',
  'stop.clearCancel': 'Keep it',
  'stop.approvalBreak': '{name} suggests a break · {place} · {km}',
  'stop.approvalDestination': '{name} suggests a destination · {place} · {km}',
  'stop.accept': 'Accept',
  'stop.decline': 'Decline',
  'stop.more': '+{n} more',
  'stop.notifTitle': '{name} suggests a stop',
  'stop.notifBody': '{place} · tap to accept or decline',
  'errors.stop_invalid': "That place can't be used as a stop.",
  'errors.stop_leader_only': 'Only the leader can do that.',
  'errors.stop_ride_ended': 'This ride is already over.',
  'errors.proposal_not_found': 'That suggestion is no longer there.',
  'errors.proposal_already_decided': 'That suggestion was already handled.',
  // --- end next stop ---

  // Errors: one per RideErrorCode (ride-api.ts) plus screen errors
  'errors.not_authenticated': "Couldn't sign you in. Check your signal and try again.",
  'errors.profile_required': 'Add your riding name first.', // mkt
  'errors.ride_not_found': 'No ride found with that code. Check the 6 digits.', // mkt
  'errors.not_leader_or_not_in_lobby': "This ride has already started, or you're not the leader.",
  'errors.not_leader_or_already_ended': "This ride is already over, or you're not the leader.",
  'errors.leader_must_end_ride': "You're the leader. End the ride for everyone instead.", // mkt
  'errors.invalid_message_kind': "That message can't be sent. Update the app.",
  'errors.not_a_member': "You're no longer in this ride.",
  'errors.network': 'No connection. Check mobile data and try again.', // mkt
  'errors.unknown': 'Something went wrong. Try again.',
  'errors.loadRide': "Couldn't load the ride.",
} as const;

export type CopyKey = keyof typeof copy;

/** Fills `{placeholders}`. Unknown placeholders are left visible so a missing var is easy to spot. */
export function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** "1 rider", "3 riders". */
export function plural(n: number, one: string, other: string): string {
  return `${n} ${n === 1 ? one : other}`;
}

export function riderCount(n: number): string {
  return plural(n, 'rider', 'riders');
}

/** "1 minute", "5 minutes". */
export function minuteCount(n: number): string {
  return plural(n, 'minute', 'minutes');
}

/** "1 hour", "2 hours". */
export function hourCount(n: number): string {
  return plural(n, 'hour', 'hours');
}

/** Screen-reader duration: "less than a minute", "1 minute", "1 hour 5 minutes". Floors like formatDuration. */
export function spokenDuration(ms: number): string {
  if (Number.isNaN(ms) || ms < 60_000) return 'less than a minute';
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hours === 0) return minuteCount(min);
  return min === 0 ? hourCount(hours) : `${hourCount(hours)} ${minuteCount(min)}`;
}

/** "4.2 km" -> "4.2 kilometres", "1.0 km" -> "1 kilometre", "350 m" -> "350 metres". */
export function spokenDistance(text: string): string {
  return text.replace(/(\d+(?:\.\d+)?) (km|m)\b/g, (_m, num: string, unit: string) => {
    const one = Number(num) === 1;
    const word = unit === 'km' ? (one ? 'kilometre' : 'kilometres') : one ? 'metre' : 'metres';
    return `${one ? '1' : num} ${word}`;
  });
}

export function t(key: CopyKey, vars?: Record<string, string | number>): string {
  return fill(copy[key], vars);
}

/** The text of an `errors.*` key for a RideErrorCode (or screen error). */
export function errorText(code: string): string {
  const key = `errors.${code}` as CopyKey;
  return key in copy ? copy[key] : copy['errors.unknown'];
}

/** "483259" -> "483 259". Anything that is not 6 digits is returned unchanged. */
export function groupCode(code: string): string {
  return /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** "483259" -> "4 8 3 2 5 9", read digit by digit by screen readers. */
export function spokenCode(code: string): string {
  return code.split('').join(' ');
}

/** Text shown when the user shares the ride code. */
export function shareMessage(rideName: string, code: string): string {
  return t('lobby.shareMessage', {
    ride: rideName,
    code3a: code.slice(0, 3),
    code3b: code.slice(3),
    code,
  });
}

/** `status.*` chip text. Never-seen offline reads "No signal yet". */
export function statusText(
  status: 'moving' | 'stopped' | 'offline' | 'sos',
  duration: string | null,
  neverSeen = false,
): string {
  if (status === 'moving') return copy['status.moving'];
  if (status === 'offline' && neverSeen) return copy['status.noSignalYet'];
  const key = `status.${status}` as const;
  // Without a duration, drop the " · {duration}" tail instead of printing a placeholder.
  return duration ? t(key, { duration }) : copy[key].replace(/ · \{duration\}$/, '');
}
