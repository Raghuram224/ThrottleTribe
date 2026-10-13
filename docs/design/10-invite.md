# 10 — Invite riders (`ride/[id]/invite.tsx`)

**Purpose:** get the group into the ride before they reach the meeting point, with a text to chosen
contacts or a link in WhatsApp, while the 6-digit code stays visible as the fallback that always works.
**One-second glance:** the code (`482 913`), two large invite actions, and "3 invited · 1 joined".

Owner decisions (2026-10-10): pick contacts and open the SMS app pre-filled (we never send
automatically); share an https link through the system share sheet; link =
`https://aqzpdxyckwbxlvqnsnye.supabase.co/functions/v1/join?c=<code>`. Android only for now.

Native modules (Expo SDK 57): `expo-contacts` → `Contact.presentPicker()` (system picker, one
contact per call, `null` on cancel); `expo-sms` → `SMS.sendSMSAsync(addresses, message)` +
`SMS.isAvailableAsync()`. **Android always returns `{ result: 'unknown' }`**: we cannot know whether
the text was sent. The design never claims it was. Both need a new dev build (not in Expo Go).
Engineer: confirm on a device that `presentPicker()` works without `READ_CONTACTS`. If it does not,
show the pre-permission sheet in §6 before the OS prompt (rule 8: explain before asking).

## 1. Where it lives and how riders reach it

| Entry | Who | Gesture | Result |
|---|---|---|---|
| New ride → **Create ride** | leader | tap | `replace('/ride/<id>/invite?first=1')` (replaces 02's direct route to lobby) |
| Lobby → **Invite riders** (secondary BigButton under the code, replaces "Share code") | anyone in the ride | tap | `push('/ride/<id>/invite')` |
| Lobby / Live ride menu `⋯` → **Invite riders** (replaces "Share code") | anyone | tap | same push |
| Live "alone" hint (06 §6) → button `invite.cta` | anyone | tap | same push |
| Long-press the code in the lobby | anyone | long-press | system share sheet with the link (unchanged shortcut) |

Route `src/app/(app)/ride/[id]/invite.tsx` sits inside the ride layout, so the member list is live
and "joined" updates while the screen is open. **Ride layout redirect change (00 §1):** `invite`
is allowed while the ride is `lobby` or `active`. `ended` → summary, as for the other children.
`first=1` changes only the footer (§3). After invite: `first=1` → `[permissions]` → lobby (the
permission check moves from new-ride to here). Otherwise → `back()`.

## 2. Layout

```
┌──────────────────────────────────────┐
│ ‹  Invite riders                     │ TopBar 56
│                                      │
│  Sunday Run                  (20/600)│ ride name, 1 line
│ ┌──────────────────────────────────┐ │ CodeCard: surface, radius 16, padding 16
│ │ RIDE CODE                  (12b) │ │
│ │ 482 913               (36/700)   │ │ RideCodeDisplay, tabular
│ │ Anyone with this code can join.  │ │ 14 muted
│ └──────────────────────────────────┘ │
│                                      │  gap 16
│ ┌──────────────────────────────────┐ │ ActionCard 72 (new): surface, border 1,
│ │ [▤] Text people          (16/700)│ │ radius 16, icon tile 40 brandTint +
│ │     Pick from your contacts (14m)│›│ icon 24 text, chevron-right 20
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ [⇪] Share link           (16/700)│ │
│ │     WhatsApp, Telegram and more  │›│
│ └──────────────────────────────────┘ │
│                                      │  gap 24
│  Invited (3) · 1 joined     (16/700) │ section, only when list not empty
│ ┌──────────────────────────────────┐ │
│ │(PK) Priya          ✓ Joined      │ │ InviteeRow 64
│ │(SM) Sam Mehta      ◷ Invited     │ │
│ │(JO) Jo             ◷ Invited     │ │
│ └──────────────────────────────────┘ │
│  We can't see if a text was sent.    │ 14 muted (invite.honestNote)
│  "Joined" shows when someone with    │
│  that name joins.                    │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │        Continue to lobby         │ │ primary (first=1) / "Done" (otherwise)
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

Tokens: body padding `space.lg`, section gap `space.xl`, card internal gap `space.sm`.
`ActionCard` icon tile = 40×40 radius 12, `brandTint` fill, glyph 24 `text` (`contacts`,
`share-variant`). The orange tint marks these as actions without being a second primary button.

**InviteeRow** (64, padding 12/16, divider 1 `border`):
- Avatar 40 **neutral**: `surface` fill + 1 `border` ring, initials 14/700 `textMuted`. Invitees
  are not riders yet; rider colours start when they join. When matched → swaps to their
  `RiderAvatar` (rider colour) with a 150 ms crossfade.
- Name 16/600 (contact display name, truncate). Line 2 (14 muted): phone, formatted for display
  (`+91 98450 12210`) and the invite time (`invite.sentAt` "Texted 5:12 PM").
- Right: invite state chip (icon + text, never colour alone):

| State | Rule | Chip |
|---|---|---|
| Invited | SMS composer opened for this number | `clock-outline` + `invite.stateInvited`, `surface` pill, border 1, `textMuted` |
| Joined | a matched member is in the ride (§5) | `check` + `invite.stateJoined` on `status.moving`, `onStatus.moving` text |
| Left | matched member has `left_at` | `invite.stateLeft` text only, `textMuted` |

  When joined, line 2 becomes `invite.joinedAs` ("Joined as Priya K"), so a wrong match is visible.
- Row tap: opens the row sheet (§4).

## 3. Footer
- `first=1`: primary `invite.continue` ("Continue to lobby"). Body above the button: nothing else.
  The leader can skip inviting by tapping it. There is no separate Skip.
- Otherwise: primary `invite.done` ("Done") → `back()`.
- Only one primary. The two ActionCards are body controls.

## 4. Flows

### 4.1 Text people (SMS)
1. Tap **Text people** → `SMS.isAvailableAsync()`. If false → toast `invite.smsUnavailable`, and
   the Share link card gets a 2 px `brand.primary` border (points to the alternative).
2. `Contact.presentPicker()` opens. Cancel → back to the screen, nothing changes.
3. Contact with **one mobile number** → added to the **Text tray** sheet. With **several numbers** →
   sheet `invite.pickNumberTitle` ("Which number for Sam?") listing each number + its label (Mobile,
   Work) as 56-tall rows. Contact with **no number** → toast `invite.noNumber`.
4. **Text tray** (`Sheet`): title `invite.trayTitle` ("Text an invite"), list of picked people
   (56 rows: name + number + `close` 56×56 to remove), then:
   - secondary `invite.addAnother` ("Add another") → picker again (max 10 in the tray);
   - text button `invite.typeNumber` ("Type a number") → inline `PhoneInput` (§7) + Add;
   - primary `invite.openSms` ("Open messages") for 1 person, `invite.openSmsN` ("Text 3 people") for more.
5. **One composer per person, in sequence** (decision). On Android, many SMS apps turn a
   multi-recipient text into a group MMS (reply-all, MMS charges). The leader is at rest, so a few
   extra taps are fine. For each person: `sendSMSAsync([number], invite.smsBody)` → on return to the
   app the person moves to the Invited list (state Invited) and the tray shows
   `invite.nextPerson` ("Next: Jo · 2 of 3") as the primary button. The tray closes after the last
   one, with toast `invite.trayDone` ("3 invites opened in Messages").
6. Duplicate number (already invited for this ride) → it is not added again; the tray row shows
   `invite.alreadyInvited` muted, and the leader can still text again from the row sheet (§4.3).

### 4.2 Share link
`Share.share({ message: invite.shareMessage })`. RN `Share` on Android shows the system chooser
(WhatsApp, Telegram, SMS, copy). The result is not tracked as an invitee (we don't know who).
Haptic `selection`. Same text for lobby long-press and the menu.

### 4.3 Row sheet (tap an invitee)
Title = name. Actions (stacked BigButtons, 56): `invite.textAgain` ("Text again", secondary) ·
`invite.remove` ("Remove from list", secondary; local only, no confirm, toast `invite.removed`
with no undo) · `common.close`. Joined rows show only Close (plus the matched rider name).

## 5. Invited vs joined — the simple, honest rule (decision)
- The invited list is **local to this phone** (`storage.ts` key `invites:<rideId>`: `{ id, name,
  phone, invitedAt, matchedUserId? }[]`). Phone numbers are never uploaded and never shown to other
  riders. Other riders' invites are not visible (each phone sees its own). Purge 24 h after the ride ends.
- **"Invited"** = we opened the SMS app for that number. We do not say "Sent" or "Delivered".
- **"Joined"** = auto-match: when a member joins after `invitedAt`, compare the normalised first word
  of their `display_name` with the normalised first word of the contact name (lowercase, strip
  accents/punctuation; "Priya K." → `priya`). If exactly one unmatched invitee matches, that invitee
  becomes Joined and stores `matchedUserId`. If two invitees match, take the earliest invite. Show
  "Joined as <rider name>" so a wrong guess is easy to spot. No match → stays Invited. That is
  honest, because Invited never claimed they would come.
- Header count `invite.listTitle` ("Invited (3) · 1 joined"). The honest note (`invite.honestNote`)
  is always under the list.
- Later (P2, needs backend): add `&i=<inviteId>` to the link and pass it to `join_ride` for exact
  matching. Do not build it now.

## 6. Contacts permission (only if the picker needs it)
Pre-permission `Sheet`: icon `contacts` 28, title `invite.permTitle` ("Pick people from your
contacts"), body `invite.permBody` ("We only read the person you pick. Nothing is uploaded."),
primary `invite.permCta` ("Continue") → OS prompt. Denied → toast `invite.permDenied` and open the
tray with Type a number. Permanently denied → the same sheet with `perm.openSettings` → `Linking.openSettings()`.

## 7. `PhoneInput` (new component, shared with 11 and 12)
56 tall, radius 12, border 2 `border` (focus `brand.primary`). Left: a fixed prefix box `+91`
(16/700, `surface`, 56 wide, divider 1). Tapping it opens a sheet with common codes (+91 India
selected ✓, +971, +65, +44, +1, "Other: type with +"). Field: `keyboardType="phone-pad"`,
`textContentType="telephoneNumber"`, `autoComplete="tel"`, 20 font tabular, groups as typed
`98450 12210`. Normalise on submit (11-sos-contacts.md §3, same function `normalisePhone`):
strip spaces/dashes; a leading `+` keeps the typed country; a 10-digit number starting 6–9 →
`+91…`; `0` + 10 digits → `+91` + 10 digits. Valid = 8–15 digits for invites. (Short codes are
allowed only in emergency contacts.) Invalid → error line `phone.invalid`.

## 8. Message text (SMS must be GSM-7)
`invite.smsBody`: `Join my ride "{ride}" on Throttle Tribe. Code {code3a} {code3b}: {link}`
- `{ride}` truncated to 24 characters with `...`. `{link}` is 67 characters. Total ≤ 160, so it
  fits in one SMS segment.
- **Plain ASCII only:** straight quotes, no em dash, no emoji. One non-GSM character switches the
  whole text to UCS-2 (70 characters per segment) and splits it into 3 SMS. Unit test: the
  formatted body matches `/^[\x20-\x7E]*$/` and is ≤ 160 for a 60-character ride name.
- `invite.shareMessage` (share sheet, no limit to worry about, still plain):
  `Join my ride "{ride}" on Throttle Tribe.\nCode: {code3a} {code3b}\n{link}`

## 9. Hosted join page (edge function `join`) — what the link shows
Android App Links need `/.well-known/assetlinks.json` on the link's domain. We can't host that on
`supabase.co`, so the https link **will open the browser page, not the app**. The page must work
as the bridge:
```
┌──────────────────────────────┐ bg #FFFFFF, max-width 420, system font
│ ▓▓ Throttle Tribe ▓▓▓▓▓▓▓▓▓▓ │ 56 bar brand #F97316, title #111827 20/700
│ You're invited to a ride     │ 28/700
│ RIDE CODE                    │ 12/700 uppercase #374151
│ 482 913                      │ 36/700 tabular, letter-spacing 4
│ ┌──────────────────────────┐ │
│ │   Open in Throttle Tribe │ │ 56, #F97316 bg, #111827 text 16/700
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │   Get it on Google Play  │ │ 56, white bg, 2px #111827 border
│ └──────────────────────────┘ │
│ New here? Install the app,   │ 16 #374151
│ then tap "Open" again or     │
│ enter the code.              │
└──────────────────────────────┘
```
- Open button href: `intent://join?code=<c>#Intent;scheme=throttletribe;package=com.throttletribe.app;S.browser_fallback_url=<play-url-encoded>;end`.
  Not installed → Chrome follows the fallback to the Play Store.
- Play button: `https://play.google.com/store/apps/details?id=com.throttletribe.app&referrer=code%3D<c>`
  (P2: read the install referrer on first launch and store it as `pendingJoinCode`).
- Invalid `c` (not 6 digits) → page shows "This invite link is broken. Ask for the 6-digit code."
  and only the Play button. The page shows **no ride name or members**: anyone with the URL can
  open it, so it reveals nothing beyond the code.
- `<title>Join a ride · Throttle Tribe</title>`, `og:title` same, `og:description` "Tap to open the
  ride in Throttle Tribe." (WhatsApp preview). No tracking scripts.
- App side: `join.tsx` already accepts `throttletribe://join?code=`. Also accept `?c=` (strip non-digits) for the future App Links switch.

## 10. States
| State | Behaviour |
|---|---|
| No invites yet | Section hidden. Under the cards: `invite.emptyHint` ("Text a few riders or share the link. They join with one tap.") 14 muted |
| Ride code not loaded | CodeCard skeleton (surface block 36 tall). Both actions disabled for that moment |
| Offline (viewer) | offline banner (00 §2.5). SMS and Share still work (they're local). Joined updates resume later |
| SMS unavailable | §4.1 step 1 |
| Ride ended while open | layout → summary |
| Mid-ride (`active`) | same screen. CodeCard note becomes `invite.midRideNote` ("They can join while you ride.") |
| Dark | tokens only. `brandTint` dark `#2A1709` |

## 11. Accessibility
- ActionCards: role button, labels `invite.a11yText` ("Text people. Pick from your contacts"),
  `invite.a11yShare`.
- Code read digit by digit (`lobby.a11yCode`).
- InviteeRow: "Sam Mehta, invited, texted 5:12 PM" / "Priya, joined as Priya K".
- Tray remove buttons: "Remove Sam".
- Joined state change is announced politely ("Priya joined").

## 12. Haptics & motion
`selection` on every tap. `Success` once when an invitee flips to Joined (only while this screen
or the lobby is visible). New invitee row: fade + 8 dp slide-in, 150 ms (`motion.fast`). With
Reduce Motion: no slide, opacity only.

## Acceptance checklist
- [ ] Create ride lands on Invite. Continue → permissions (if needed) → lobby.
- [ ] Lobby button + both menus open Invite. Long-press code shares the https link.
- [ ] Contact picker → number choice → tray. One composer per person. Never sent automatically.
- [ ] SMS body ASCII-only and ≤ 160 chars (unit test). Share message has the https link.
- [ ] Invitees stored locally per ride. No phone number leaves the device.
- [ ] States: Invited / Joined (as name) / Left, each icon + text. Honest note always visible under the list.
- [ ] Hosted page: code visible, intent link opens the app, falls back to Play Store.
- [ ] `join.tsx` accepts `code` and `c`.
