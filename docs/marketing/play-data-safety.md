# Google Play Data safety form: answers

**DRAFT. Verify against the final build and the final privacy policy (`privacy-policy.md`) before submitting.**
Google compares this form with the policy and with the app's behaviour. If they differ, the app can be rejected.
Items marked CHECK are open decisions.

## Section 1: Data collection and security

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS/TLS to Supabase) |
| Do you provide a way for users to request that their data is deleted? | Yes. In-app "Delete my account" (CHECK: Play also requires a web link for deletion; add a page or email route and enter the URL) |
| Does the app comply with the Families Policy? | No. Not a children's app (CHECK: minimum age, see policy) |
| Independent security review | No |

"Collected" = leaves the device to us. "Shared" = transferred to a third party. Sharing with other riders in
the user's ride is app functionality among users, but Play counts the transfer to other users as **shared** only
if it goes to a third party; we declare it in the notes below for transparency. Our own backend provider
(Supabase) acts as a service provider for us, which Play does **not** count as "sharing".
CHECK with legal whether to declare the rider-to-rider disclosures as "shared"; the conservative answer is Yes
for location, name and emergency contacts.

## Section 2: Data types

### Location
| Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| Approximate location | Yes (part of precise) | Yes, to riders in the same ride | Required for the app's core function | App functionality |
| Precise location | Yes. Foreground, and background during an open ride only | Yes, to riders in the same ride | Required to share your position (the app can be opened without it, but not used for a ride) | App functionality |

Retention note: ride GPS history deleted 30 days after the ride ends.

### Personal info
| Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| Name (riding name, user-chosen) | Yes | Yes, to riders in the same ride | Required | App functionality |
| Email address | Yes, only if the user saves their account with email | No | Optional | Account management |
| Phone number | Yes, if the user saves their account with phone, and for each emergency contact they save | Emergency contact numbers: shown to ride members during the user's active SOS (declare as Yes). Sign-in phone: No | Optional | App functionality, Account management |
| User IDs | Yes (anonymous account ID) | Yes (other riders see rider rows keyed to it, not displayed) | Required | App functionality, Account management |
| Other info (emergency contact names) | Yes | Yes, to ride members during the user's active SOS | Optional | App functionality |

### Contacts
| Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| Contacts | **Collected only for contacts the user saves as an emergency contact.** The phone's contact list is read on-device to let the user pick people; it is not uploaded. | See above | Optional | App functionality |

CHECK: Google's "Contacts" type covers "info about the user's contacts". If a picked contact's number is
stored as an emergency contact it is collected, so declare Contacts as collected, optional, App functionality,
and explain in the data-use description that the list is not uploaded. Invited numbers go into an SMS the user
sends from their own messages app; we do not receive them.

### App activity and messages
| Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| App interactions (events like app opened, ride created, SOS sent) | Yes, to our own Supabase, 90-day retention | No | Required (no opt-out today; CHECK: consider an analytics toggle) | Analytics, App functionality |
| Other user-generated content (SOS and quick messages from a fixed list, ride name) | Yes | Yes, to riders in the same ride | Required for those features | App functionality |
| Other actions | Not collected | | | |

### App info and performance
| Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| Crash logs | Yes (JavaScript errors and stack traces), 90-day retention | No | Required | Analytics (app performance) |
| Diagnostics | Yes (app version, OS version, device model, screen name) | No | Required | Analytics |
| Other app performance data | No | | | |

### Device or other IDs
| Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| Device or other IDs | Yes: push notification token (if notifications allowed) and a random per-launch session ID. **No advertising ID.** | No (push delivery uses the push service as a processor) | Push token optional | App functionality |

CHECK: confirm which push service is used and declare accordingly.

### Not collected (answer No)
Health and fitness; Financial info; Messages (SMS/email/in-app free text; the app has no free-text chat);
Photos and videos; Audio; Files and docs; Calendar; Web browsing; Race/ethnicity and other sensitive personal
info; Advertising ID.

## Section 3: Data usage and handling summary

- **Sold:** never. **Used for advertising or marketing:** no. **Third-party analytics or ad SDKs:** none.
- **Encryption in transit:** yes.
- **Deletion:** in-app "Delete my account" (profile, emergency contacts, ride history). Ride GPS history auto-deleted
  30 days after a ride ends. Analytics and crash data auto-deleted after 90 days.
- **Optional data:** email or phone for account saving; emergency contacts; push token; contacts permission.

## Permissions declarations that go with this form

| Item | Answer |
|---|---|
| Background location | Required declaration. Use text: "Share your position with your riding group while the phone is locked, only during an active ride." Provide a demo video; the persistent Android notification is shown. |
| Contacts (READ_CONTACTS) | Use: "Pick riders to invite by SMS and pick emergency contacts. The contact list is not uploaded." Consider the system contact picker (no permission) to avoid the declaration entirely, if engineering agrees. |
| SEND_SMS | **Do not request.** SMS is opened pre-filled in the user's SMS app; the user taps send. Requesting SEND_SMS would trigger Play's restricted SMS policy. |
| CALL_PHONE | **Do not request.** Use the dialer intent (user taps call). |
| Notifications | Standard runtime permission. |

## Sync with the store-listing content rating

Questionnaire: user-to-user location sharing is a disclosure point; the app has no UGC free text.
If the minimum age becomes 18, state "not designed for children".
