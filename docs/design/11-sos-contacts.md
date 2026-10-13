# 11 — SOS emergency contacts

**Purpose:** when I send SOS, I can call or text the people who matter in one tap, and a rider who
comes to help can call them for me. My group is always alerted.
**One-second glance (sender):** "SOS on · group alerted", then big **Call Mom** / **Call 112** buttons.
**One-second glance (helper):** the takeover gains **Call Arun's contacts: Mom · Ambulance 108**.

Backend exists: `supabase/migrations/0008_emergency_contacts.sql`. Table `emergency_contacts`
(`name` 1–40, `phone` `^\+?[0-9]{3,15}$`, `relation` ≤ 30, `position` 0–4, max 5 per user
→ error `contact_limit_reached`). RLS: owner only, **plus** ride mates while the owner has an
active SOS in an active ride they share. Group SOS alert (`set_sos`) is unchanged and unconditional.

Owner decisions: up to 5 contacts. Name + phone + optional relation. Pick from contacts or type
them. The ride group is **always** notified and that can't be turned off (the UI says so). Contacts
are private and are shown to ride mates only while my SOS is active. India: 112 is the national
emergency number and 108 is ambulance.

## 1. Settings screen — `(app)/emergency-contacts.tsx`
Reached from Profile → Safety → **Emergency contacts** (13 §Profile), the home nudge, the lobby
nudge, and the SOS sender panel empty state.

```
┌──────────────────────────────────────┐
│ ‹  Emergency contacts                │ TopBar
│ ┌──────────────────────────────────┐ │ GroupNotice card: surface, radius 16,
│ │ [👥] Your ride group is always   │ │ 4 px left bar status.sosStrong,
│ │      alerted when you send SOS.  │ │ icon account-group 24 text,
│ │      This can't be turned off.   │ │ text 16/600; lock 16 muted at end
│ └──────────────────────────────────┘ │
│  Who else should we help you reach?  │ 20/600
│  We show one-tap call buttons on     │ 14 muted
│  your SOS screen.                    │
│                                      │
│  YOUR CONTACTS · 2 OF 5     (12b)    │
│ ┌──────────────────────────────────┐ │ ContactRow 72
│ │ 1 (MO) Mom              ⋮        │ │ position no. 14/700 muted, avatar 40 neutral,
│ │        +91 98450 12210           │ │ name 16/600 + relation pill,
│ ├──────────────────────────────────┤ │ phone 16 tabular muted; ⋮ 56×56 row menu
│ │ 2 (AM) Ambulance · 108  ⋮        │ │
│ └──────────────────────────────────┘ │
│  The first one is the biggest button │ 14 muted
│  on your SOS screen.                 │
│                                      │
│  ALWAYS AVAILABLE           (12b)    │
│ │ 📞 Emergency · 112    (built in)   │ 56 row, not editable, icon phone, text 16/600
│                                      │
│  🔒 Only you can see these. While    │ privacy note, 14 muted, icon lock 16
│  your SOS is on, riders in your ride │
│  can see them so they can call for   │
│  you. They're hidden again after.    │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │      Add from contacts           │ │ secondary (icon contacts)
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │      Add a contact               │ │ primary (icon phone-plus) → edit sheet
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```
- At 5 contacts both footer buttons are replaced by the note `contacts.full` ("5 of 5. Remove one
  to add another.") 14 muted, centred.
- **Row menu (⋮)** sheet, title = name: `contacts.edit` · `contacts.moveUp` (hidden on the first) ·
  `contacts.moveDown` (hidden on the last) · `contacts.remove` (danger, ConfirmSheet
  `contacts.removeTitle` "Remove Mom?" / confirm `contacts.removeConfirm`) · Close. Up/down buttons
  instead of drag (gloves, and drag is hard to make accessible). Moving rewrites `position`.
- Tap the row body = Edit.
- Avatar = neutral (surface + border, initials 14/700 `textMuted`). Short-code numbers (3–5 digits)
  get icon `ambulance` (108/102) or `phone` instead of initials.
- **Quick add** (shown only while the list has 0 contacts, above the footer): a chip row,
  56-tall `surface` pills with border 1: `contacts.quickAmbulance` ("+ Ambulance 108"). Tap → saved
  immediately as `{ name: 'Ambulance', phone: '108', relation: null }` with toast `contacts.added`.
  112 is not offered because it is built in.

### Empty state (0 contacts)
GroupNotice stays. Instead of the list: icon `shield-account` 48 `textMuted`, title
`contacts.emptyTitle` ("No emergency contacts yet") 20/600, body `contacts.emptyBody` ("Add family or
a friend. If you send SOS you can call them in one tap, and so can the riders helping you.") 16
muted. Then the quick-add chip. The ALWAYS AVAILABLE 112 row still shows, so riders see they are
never without a number.

## 2. Add / edit sheet (`ContactEditSheet`, full-height `Sheet`)
```
  Add a contact                (20/700)
  Name                         (16b)
  [ Mom                        ]  AppTextInput, maxLength 40, autoCapitalize words
  Phone                        (16b)
  [+91][ 98450 12210           ]  PhoneInput (10 §7), short codes allowed
  Relation (optional)          (16b)
  [Mom] [Dad] [Partner] [Friend] [Doctor] [Other…]   chips 48 tall, single select
  ⚠ error line (if any)
  [ Save ]      primary
  [ Cancel ]    secondary (below, per 00 §2.8 sloppy-thumb rule)
```
- "Add from contacts" path: `Contact.presentPicker()` → pick number (same "which number" sheet as
  10 §4.1) → this sheet opens **prefilled**, with focus on Relation. One tap on Save finishes.
- Relation chips fill `relation` with the chip label. `Other…` shows a 56 text field (max 30).
  Relation is shown as a pill after the name everywhere and is used in button labels when it
  exists: **Call Mom** reads better than "Call Lakshmi R" for a rider in shock. Rule for the
  label `{who}`: relation if set, else first name.
- Save: insert/update (`position` = next free). Loading on the button. Errors:
  `contact_limit_reached` → `contacts.errFull`; check violation → `phone.invalid`; network → `errors.network`.
- Unsaved changes + Cancel → no confirm (small form; Cancel is explicit).

## 3. Phone rules (`normalisePhone`, shared with 10 and 12)
1. Strip everything except digits and a leading `+`.
2. 3–5 digits → keep as a **short code** (108, 112, 102, 1091). Emergency contacts only.
3. Leading `+` → keep (`+971501234567`).
4. 10 digits starting 6–9 → `+91` + digits. `0` + 10 digits → `+91` + 10 digits.
5. Else, with the selected prefix → prefix + digits.
6. Result must match `^\+?[0-9]{3,15}$` (DB check). Display format: `+91 98450 12210`, short codes as is.

## 4. Nudges to add contacts (gentle, never blocking)
| Where | When | UI |
|---|---|---|
| Home | 0 contacts, not dismissed | `SafetyCard` (13 §Home): icon `shield-account`, title `nudge.contactsTitle` ("Add an emergency contact"), body `nudge.contactsBody`, secondary 56 `nudge.contactsCta` (not primary: Start a ride keeps the one primary) ("Add contact") + text button `nudge.later` ("Later"). Later hides it until the next ride ends |
| Name step → home (first run) | always for new riders | no extra screen. The home SafetyCard is the first card under the hero (one fewer screen in onboarding, per 01) |
| Lobby (me) | 0 contacts, once per ride | `Banner` variant `info` (review P1-1): icon `shield-account`, text `nudge.lobbyBanner` ("Add an SOS contact before you ride"), action `nudge.lobbyAdd` ("Add"), closable. Lowest banner priority |
| SOS sender panel | 0 contacts | §5 empty state (adds after the emergency, for next time) |
Never nudge during an active ride on the live screen (glance zone).

## 5. Sender — SOS active panel (`SosSenderPanel`, overlay in the ride layout)
Today the sender sees only the pinned banner + the live screen (07 §4). New: when **my** SOS turns on
(`setSos` succeeded **or** is retrying) a full-screen panel opens over the live screen.
It can be minimised to the pinned banner (07). Tap the banner → panel reopens.

```
┌──────────────────────────────────────┐ top band status.sosStrong 
│ ⚠ SOS on                    (36/700) │ white
│ Your group was alerted      (20/600) │ white. Retrying: "Sending to your group… retrying"
│ 🔒 Always on. Your group is told     │ 14 white 90 %
│    first, every time.                │
├──────────────────────────────────────┤ body bg (theme), padding 16, gap 12, ScrollView
│ ┌──────────────────────────────────┐ │ 72, sosStrong fill, white 20/700, icon phone 24
│ │ 📞 Call Mom                      │ │   (first contact = strongest button)
│ │    +91 98450 12210          (14) │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │ 72, bg, 2 px sosStrong border, text sosStrong-on-bg*
│ │ 📞 Call Ambulance · 108          │ │   (contacts 2..5, same style)
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │ 72, same outline style
│ │ 📞 Call 112 · Emergency          │ │   always last of the call list
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │ 72, surface, border 1, text 20/700
│ │ 💬 Text my location to contacts  │ │ icon message-text; sub 14 muted "Mom, Dad"
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤ action area (00 §2.6)
│ ┌────────┐ ┌──────────────────────┐  │
│ │ ‹ Map  │ │ Hold to cancel SOS   │  │ Map = minimise (secondary 72); HoldButton cancel
│ └────────┘ └──────────────────────┘  │
└──────────────────────────────────────┘
```
\* Outline-button text on `bg`: light uses `status.sosStrong` (#B91C1C on #FFF = 6.5:1). In dark,
`status.sosStrong` on `#0B0F14` fails, so use new token `sosOnBg` (light `#B91C1C`, dark `#FCA5A5`,
8.9:1 on dark bg). The 2 px border uses `sosOnBg` too.

- **Call** → `Linking.openURL('tel:<phone>')` opens the dialer with the number filled in (no
  `CALL_PHONE` permission. The rider taps the green call button there). Haptic `impact Medium`.
  Label `sosMe.call` "Call {who}". The second line shows the number (so the rider can read it out
  if needed). A11y: "Call Mom, plus 9 1 9 8 4 5 0 …".
- **Text my location** (shown when ≥ 1 contact has a textable number, i.e. not a short code)
  → `SMS.sendSMSAsync(<all textable contact numbers>, sosMe.smsBody)`. One composer with every
  contact. In an emergency, speed beats the group-MMS concern in 10. Short codes (108/112) are
  left out (you can't text an ambulance), and the sub-line lists who is included. Body
  (ASCII, ≤ 160): `SOS from {name} (Throttle Tribe). I need help. Location: https://maps.google.com/?q={lat},{lng} at {time}`
  with lat/lng to 5 decimals from my latest fix. No fix → `sosMe.smsBodyNoFix` ("SOS from {name}
  (Throttle Tribe). I need help. My location is unknown. Please call me."). The rider taps Send in
  their SMS app. On return, a toast `sosMe.smsOpened` ("Messages opened. Tap send if you haven't.").
  SMS unavailable → button disabled, with sub-line `invite.smsUnavailable`.
- **Order** is fixed and predictable: contacts by `position`, then 112, then Text. The first
  contact is the only filled red button (one strongest action). With **0 contacts**, 112 becomes the filled
  button, Text is hidden, and a card `sosMe.emptyTitle` ("No emergency contacts") + text button
  `sosMe.emptyAdd` ("Add for next time") → `push('/emergency-contacts')` is shown **below** 112.
- **Minimise** (`‹ Map`, label `sosMe.minimise`) and Android back → panel closes. The pinned
  banner (07 §4) remains and gains a tap target: tap = reopen the panel. The banner keeps
  `Call 112` and adds nothing else (one line).
- **Cancel SOS**: unchanged 2 s HoldButton. Panel closes when SOS clears, with the `sos.cancelled` banner.
- Contacts load: fetched at ride-layout mount and cached in memory for the ride, so the panel
  renders instantly even offline. Calls/SMS work offline (cellular voice/SMS ≠ data). The
  panel never shows a spinner in front of 112.
- Haptics: `notification Error` on open (already fired by the hold completing, do not repeat).
  Motion: the band slides down 200 ms. Reduce Motion: no slide.
- Status bar `light` while open.

## 6. Receiver — takeover additions (07 §3)
Under "I'm on my way", and above Dismiss, add a section inside the takeover's ScrollView:
```
│  CALL ARUN'S EMERGENCY CONTACTS (12b, white 90 %) │
│ ┌──────────────────────────────────┐ │ 64, transparent, 2 px white border, radius 16
│ │ 📞 Call Mom              (20/700)│ │ white text; line 2 14 white 90 %: "Arun's Mom · +91 98450 12210"
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 📞 Call Ambulance · 108          │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 📞 Call 112 · Emergency          │ │ always present
│ └──────────────────────────────────┘ │
│  Visible only while Arun's SOS is on.│ 14 white 90 %, icon lock
```
- Title `sos.contactsTitle` ("Call {name}'s emergency contacts"), `{name}` = first name.
- Button label for helpers: `sos.callContact` "Call {who}" where `{who}` = relation if set
  ("Call Mom" is clear in the context of "Arun's"), with line 2 `sos.contactMeta` "{name}'s {relation} · {phone}"
  (no relation → "{contactName} · {phone}").
- Data: on SOS appear, `select * from emergency_contacts where user_id = <sosUser> order by position`
  (RLS allows it only now). Loading → one 64 row skeleton + 112 row is already real. Error/offline →
  `sos.contactsUnavailable` ("Couldn't load Arun's contacts. Try again.") with a Try again text button.
  112 still shows.
- **None set** → text `sos.contactsNone` ("Arun hasn't added emergency contacts.") + the 112 row.
- **Privacy:** keep contacts in component state only. Never persist, never log to telemetry, never put
  them in notifications. Clear them when the SOS clears, the takeover unmounts, or the ride ends. If a
  re-fetch returns 0 rows because the SOS just cleared, remove the section.
- Navigate stays the first (strongest) button. Calling is for the helper who can't reach the
  rider or has arrived and needs an ambulance.
- Minimised SOS banner unchanged.

## 7. Copy
Keys `contacts.*`, `nudge.*`, `sosMe.*`, `sos.contacts*`, `sos.callContact`, `phone.*` in 09.

## 8. Accessibility
- GroupNotice is one element, read first on the contacts screen.
- ContactRow: "1, Mom, mother, plus 9 1 9 8 4 5 …, actions". The row menu has an a11y action list
  (Edit, Move up, Move down, Remove) so screen-reader users can reorder without the sheet.
- Sender panel `accessibilityViewIsModal`. Focus starts on "SOS on. Your group was alerted".
- Phone numbers are read digit by digit (`spokenCode`-style helper `spokenPhone`).
- `maxFontSizeMultiplier` 1.3 on panel buttons (fixed 72 height). Text truncates on line 2 first.

## Acceptance checklist
- [ ] Profile → Emergency contacts. Add (typed / picked), edit, reorder (up/down), remove (confirmed). Max 5.
- [ ] GroupNotice "always alerted, can't be turned off" visible on the contacts screen and the sender panel.
- [ ] 112 row always shown (settings, sender, receiver), even with 0 contacts.
- [ ] Short codes (108) accepted. 10-digit Indian mobiles become +91. DB check never rejects a valid UI value.
- [ ] Sender panel opens on SOS (sending or active), minimises to the banner, and reopens from it.
- [ ] Call opens the dialer pre-filled. Text opens one composer, includes a maps link, and leaves out short codes.
- [ ] Receivers see the contact list only during that SOS. It disappears on clear and is not persisted.
- [ ] Home / lobby nudges show only at 0 contacts. They never appear on the live screen.
