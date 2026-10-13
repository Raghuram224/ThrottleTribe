# Throttle Tribe Privacy Policy

> **DRAFT. Needs legal review before publishing.** Written in plain English to match how the app and
> backend are built today. Items in [BRACKETS] are placeholders or open decisions (listed at the end).
> Do not publish until every bracket is resolved and the statements are re-checked against the release build.

**Effective date:** [DATE]
**Who we are:** [LEGAL ENTITY NAME], [ADDRESS], India ("we", "us"). We make Throttle Tribe, a group ride app.
**Contact:** [PRIVACY EMAIL, e.g. privacy@yourdomain]

## The short version

- We show your location to the other riders in your ride, only while the ride is open. Nobody else sees it.
- We do not sell your data. We do not show ads. We do not use third-party advertising or analytics SDKs.
- Your emergency contacts are private to you. Your ride members can see them only while you have an SOS active.
- We do not upload your phone's contact list. Only the contacts you choose to save or invite are used.
- You can delete your account and your data inside the app.

## What we collect and why

### 1. Your riding name and account
- **Riding name** (1 to 40 characters). Shown to riders in your rides. Needed to use the app.
- **Anonymous account ID.** Created when you first open the app. No email or phone is needed.
- **Email address or phone number (optional).** Only if you choose to save your account. We use it to send you
  a one-time code to sign in, and to let you get your rides back on a new phone. [Confirm: stored with our
  authentication provider, Supabase.]

### 2. Your location
- **Precise location** is collected only while a ride you are in is open. It runs in the foreground, and in the
  background (screen off) during the ride, with a persistent notification on Android.
- It is shared **only with the members of that ride**. It stops when the ride ends or you leave.
- We do not collect your location outside a ride.
- **Ride history:** the GPS points of a ride are kept on our servers so your group can see the ride and its
  summary. They are **deleted 30 days after the ride ends**.

### 3. Ride activity
- Rides you create or join (name, code, who was in it, start and end time).
- SOS alerts, and quick messages (Fuel stop, Puncture, Slow down, Regroup, Break, All good), and when they
  were sent. Shared with the members of that ride.
- We do not collect free-text messages. The quick messages are a fixed list.

### 4. Emergency contacts (optional)
- You can save up to 5 emergency contacts (name and phone number), for example family, an ambulance number
  or the police.
- They are **stored on our servers**, tied to your account. They are visible **only to you**.
- **When you send an SOS**, the members of your ride are always notified. While that SOS is active, the
  members of that ride can see your emergency contacts' names and numbers so they can help reach them. When
  the SOS ends, they no longer can.
- **We never call or message your emergency contacts for you.** The Call and "Text my location" buttons open
  your phone or messages app, filled in. Nothing is sent until you tap send or call. Messages you send this
  way go through your own SIM and carrier, not through us.
- The app does not contact emergency services and does not detect crashes.

### 5. Your phone's contacts
- If you use "Invite from contacts", the app asks permission to read your contacts so you can pick people.
- We **do not upload your contact list**. Contacts picked from your phone leave your device only in two cases:
  (a) a contact you save as an emergency contact, and (b) the number you invite, which goes into a text that
  you send from your own messages app (we do not see it).
- Share links and ride codes you send contain the ride code, not your contacts.

### 6. App usage and crash data
- To fix bugs and improve the app, we record simple events (for example "app opened", "ride created", "SOS
  sent") and JavaScript crash and error reports. These are stored in our own database. We do not use any
  third-party analytics or crash-reporting SDK.
- Each record has: a random session ID, your anonymous account ID, platform and OS version, app version,
  device model, the screen name, the current ride ID, and a timestamp. Error reports include the error text
  and technical stack trace.
- We do **not** put coordinates, rider names, ride codes, message text, or your contacts into this data, and
  we do not collect an advertising ID.
- Kept for **90 days**, then deleted.
- Native-level crashes (outside our app code) are not captured.

### 7. Notifications
- If you allow notifications, we send ride alerts (someone stopped, lost signal, SOS, quick messages) using
  your phone's push service [Confirm: Expo push / Firebase Cloud Messaging. A push token is stored with your
  account; Google delivers the notification to your phone.]

## Who sees your data

| Data | Who can see it |
|---|---|
| Riding name | Riders in your rides |
| Location and ride status | Riders in your current ride, only while it is open |
| SOS and quick messages | Riders in that ride |
| Emergency contacts | You. Riders in your ride, only while your SOS is active |
| Email or phone (if saved) | You and our authentication system |
| Usage and crash data | Our team, for maintenance and debugging only |

We do not sell personal data and we do not share it for advertising.

**Service providers.** We store data with [Supabase, hosted in REGION] and send notifications through
[PUSH PROVIDER]. SMS codes for phone sign-in are delivered by [SMS PROVIDER], which sees your phone number and
the code. Map tiles are loaded from OpenFreeMap / OpenStreetMap, which may see your IP address when the map
loads. We may also disclose data if required by law.

## How long we keep it

| Data | Kept |
|---|---|
| Ride GPS history | Deleted 30 days after the ride ends |
| Usage and crash data | 90 days |
| Account, riding name, emergency contacts, ride records | Until you delete your account [Confirm: whether inactive accounts are purged, and after how long] |
| SOS and quick message records | [Confirm: retention. Suggest same as ride GPS history, 30 days after ride end] |

## Your choices and rights

- **Delete my account:** in the app, go to Account and choose "Delete my account". This removes your profile,
  emergency contacts and ride history [Confirm against the deletion function]. It cannot be undone.
  [Provide a web link or email route for people who cannot open the app, as Google Play requires.]
- **Remove emergency contacts:** any time, on the Emergency contacts screen.
- **Location, contacts and notifications:** you can turn each off in your phone's settings. The app will
  not be able to show you to your group without location.
- **Access, correction, and other rights:** write to [PRIVACY EMAIL]. We will reply within [30 DAYS]. [Legal:
  align with the Digital Personal Data Protection Act, 2023, including consent, grievance officer and
  withdrawal of consent.]

## Security

Data is encrypted in transit (HTTPS/TLS). Access to our database is limited by rules so that, for example,
only ride members can read ride data. No system is perfectly secure. [Confirm: encryption at rest provided by
the hosting provider.]

## Children

Throttle Tribe is **not for children**. [Recommendation, legal to decide: set the minimum age at **18**.
India's DPDP Act 2023 treats anyone under 18 as a child and requires verifiable parental consent to process
their data, which we are not set up to collect. The default of 13 used for US/COPPA purposes is not enough
for India. If the minimum age is lower than 18, parental-consent handling is required.] If you believe a child
has given us data, contact [PRIVACY EMAIL] and we will delete it.

## Changes to this policy

If we change how we handle data, we will update this page and the date above, and tell you in the app for
material changes.

## Contact

[LEGAL ENTITY NAME], [ADDRESS]
Email: [PRIVACY EMAIL]
[Grievance Officer name and email, if required under Indian law]

---

## Open items for the owner and legal (not part of the published text)

1. Legal entity, address, privacy email, grievance officer, effective date.
2. **Minimum age:** 13 vs 18 (recommendation above). Affects the Play content rating and the Data safety form.
3. Retention of SOS and quick-message records and of inactive accounts is not defined in the code summary.
   Pick values and make the backend match, or remove the claim.
4. Exact scope of "Delete my account" (what happens to rides you led and to rows other riders still see).
5. Push provider, SMS provider, hosting region (cross-border transfer wording under DPDP).
6. Emergency contacts being visible to ride members during an SOS: this discloses a third party's phone number
   (for example someone's mother) to people the rider chose to ride with. Consider an in-app line telling the
   rider to inform their contacts, and legal to confirm this is covered by the rider's consent.
7. Hosting of the invite web page: any logging on that page needs to be in this policy.
8. Re-verify "no third-party SDKs" against the final build (Expo and Google libraries are still present).
