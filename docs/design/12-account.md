# 12 — Account: save a guest account, sign in on a new phone

**Purpose:** guests keep riding with zero friction, and anyone who wants to keep their name,
rides and emergency contacts across phones can attach an email or phone number in under a minute.
**One-second glance:** Profile shows "Guest · on this phone only" or "Saved · arun@mail.com ✓".

Owner decisions: guest stays the default (01 unchanged: "Get started" = anonymous). Upgrade =
same account, same history. Sign in on a new phone = email or phone + 6-digit code. Phone defaults to +91.

Supabase mapping (engineer to confirm against current supabase-js docs before building):
| Flow | Request code | Verify |
|---|---|---|
| Save (guest → permanent), email | `auth.updateUser({ email })` | `auth.verifyOtp({ email, token, type: 'email_change' })` |
| Save, phone | `auth.updateUser({ phone })` | `auth.verifyOtp({ phone, token, type: 'phone_change' })` |
| Sign in, email | `auth.signInWithOtp({ email, options: { shouldCreateUser: false } })` | `verifyOtp({ email, token, type: 'email' })` |
| Sign in, phone | `signInWithOtp({ phone, options: { shouldCreateUser: false } })` | `verifyOtp({ phone, token, type: 'sms' })` |
- `updateUser` keeps the same `user.id`, so rides, profile and contacts carry over.
- Email template must send the **6-digit code** (`{{ .Token }}`), not only a magic link. Set
  OTP length to 6. Default email OTP resend limit is 60 s → resend timer 60 s.
- Phone needs an SMS provider (cost). Ship behind flag `EXPO_PUBLIC_PHONE_OTP=1`. When off, the
  method switch is hidden and only email shows. Add to `docs/supabase-todo.md`.

## 1. Routes
```
src/app/auth/
  identify.tsx   ?mode=save|signin              email / phone entry
  verify.tsx     ?mode=save|signin&via=email|phone&to=<value>   6-digit code
```
At the root (like `join.tsx`) because both the onboarding group (sign in) and the app group
(save) use them. Guard: `mode=save` needs a session (else → `/welcome`). `mode=signin` with an
existing **saved** session → `/home`.

## 2. Identify screen
```
┌──────────────────────────────────┐
│ ‹                                │
│  Save your account         (28)  │  signin: "Sign in"
│  Keep your rides and contacts if │  16 muted (account.saveSub / signinSub)
│  you change phones.              │
│ ┌───────────────┬──────────────┐ │
│ │ ▣ Email       │   Phone      │ │  SegmentedControl 56 (hidden when phone flag off)
│ └───────────────┴──────────────┘ │
│  Email                     (16b) │
│ ┌──────────────────────────────┐ │
│ │ arun@mail.com            (20)│ │  AppTextInput, keyboard email-address,
│ └──────────────────────────────┘ │  autoComplete email, autoCapitalize none
│  We'll send a 6-digit code.(14m) │
│  ⚠ error line                    │
│ ┌──────────────────────────────┐ │
│ │        Send code             │ │  primary, enabled when valid
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```
- Phone tab: `PhoneInput` (10 §7), default `+91`. Valid = mobile 8–15 digits after normalising (no short codes).
- Email valid = simple check `^[^\s@]+@[^\s@]+\.[^\s@]+$`, trimmed, lowercased.
- Send code → button loading → `verify` with params. Keep the last method per device.
- **Sign in on a phone that already has a guest with history** (rides or contacts, not saved):
  before sending, `ConfirmSheet` `account.replaceGuestTitle` ("Sign in instead of this guest?") /
  body `account.replaceGuestBody` ("Rides and contacts from this guest stay with this guest and
  you'll lose them on this phone. Save this guest first if you want to keep them.") / confirm
  `account.replaceGuestConfirm` ("Sign in anyway"), secondary `account.saveGuestFirst` → switch to `mode=save`.
- **In an open ride** (any mode): block. Inline `account.inRide` ("Finish or leave your ride
  first.") and the button disabled. Changing identity mid-ride would drop the rider from the map.

## 3. Verify screen (reuses `CodeInput` from 03)
```
┌──────────────────────────────────┐
│ ‹                                │
│  Enter the code            (28)  │
│  Sent to arun@mail.com     (16m) │  phone: "+91 98450 12210"; tabular
│  Change                          │  text button 56 → back()
│ ┌──┐┌──┐┌──┐ ┌──┐┌──┐┌──┐        │  CodeInput 48×64, autoFocus,
│ └──┘└──┘└──┘ └──┘└──┘└──┘        │  oneTimeCode autofill (SMS on Android)
│  ⚠ That code didn't work.        │  error line, red boxes (as 03)
│  Resend code in 0:42      (16m)  │  tabular countdown → then text button "Resend code"
│ ┌──────────────────────────────┐ │
│ │           Verify             │ │  primary; auto-submits on 6th digit
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```
- Same CodeInput behaviour as 03: paste strips non-digits, auto-submit on 6, error keeps digits,
  next keystroke restarts. Hint (email): `otp.checkSpam` ("Not there? Check spam.") shown after 20 s.
- **Resend:** disabled with countdown `otp.resendIn` ("Resend code in {m:ss}") for 60 s, then text
  button `otp.resend` (56 tall). After resend: toast `otp.resent`, countdown restarts. After 5
  resends: `otp.tooMany` and resend stays disabled for 10 min.
- **Success:**
  - save → toast `account.saved` ("Account saved"), haptic `Success`, `back()` twice to Profile
    (`router.dismissTo('/profile')`). Profile shows the saved state.
  - signin → load profile → `replace('/home')` with toast `account.welcomeBack` ("Welcome back, {name}").
    No profile row (account exists but never named) → `/name`.
- **Errors** (map Supabase errors to keys, inline under the boxes, haptic `Error`):
| Case | Key | Extra |
|---|---|---|
| wrong code | `otp.wrong` | red boxes |
| expired | `otp.expired` | Resend becomes available now |
| rate limited (429) | `otp.rateLimited` ({n} min) | countdown shows the wait |
| sign in: no account for that email/phone | `account.noAccount` | text button `account.tryOther` → back |
| save: email/phone already used by another account | `account.taken` | text button `account.signInInstead` → identify `mode=signin` (with the replace-guest confirm) |
| network | `errors.network` | Verify becomes Try again |
- Back from verify → identify (keeps the typed value).

## 4. Entry points
**Welcome (01):** footer becomes secondary `welcome.signIn` ("I have an account") above the
primary `welcome.cta`. The note `welcome.noSignup` stays above both. Sign-in → `/auth/identify?mode=signin`.
Ensure `ensureSignedIn()` is **not** called on this path (signing in creates the session).

**Profile → Account section** (13 §Profile):
- Guest: card `AccountCard` (surface, radius 16, padding 16): icon `cloud-upload-outline` 24,
  title `account.guestTitle` ("Guest account") 16/700, body `account.guestBody` ("Only on this phone.
  Save it to keep your rides and contacts if you change phones.") 14 muted, secondary BigButton
  `account.saveCta` ("Save your account").
- Saved: row `account.savedTitle` ("Account saved") with icon `cloud-check` + `check` chip on
  `status.moving`, line 2 = email or phone (tabular). Row action `account.signOut` ("Sign out", text button).
  Sign-out → ConfirmSheet `account.signOutTitle` ("Sign out on this phone?") / `account.signOutBody`
  ("Your rides stay in your account. Sign in again with your email or phone.") / confirm
  `account.signOutConfirm`. Then stop tracking, reset stores → `/welcome`. Not allowed in an open
  ride (same `account.inRide` message).
- The old `profile.guestNote` is removed (the card replaces it).

**Home nudge** (13 §Home): after a guest's **first completed ride** (summary seen once), home shows
`AccountNudge`: `nudge.saveTitle` ("Keep your rides") / `nudge.saveBody` / `nudge.saveCta` ("Save
account") + `nudge.later`. Max one nudge card at a time on home: the contacts nudge wins (safety first).

## 5. States
| State | Behaviour |
|---|---|
| Offline | identify: Send code shows `errors.network`; offline banner on top |
| Phone flag off | no SegmentedControl; email only; no phone wording anywhere |
| Already saved (deep link to save) | identify shows the saved card text and only Back |
| Dark | tokens only |

## 6. Accessibility
- Code input labelled `otp.a11yInput` ("Verification code, 6 digits"), value read as digits.
- Countdown is not announced every second. Announce once when Resend becomes available.
- Error line `accessibilityLiveRegion="assertive"`.
- Email/phone fields have visible labels (not placeholder-only).

## Acceptance checklist
- [ ] Get started still creates a guest with no email/phone asked.
- [ ] Save keeps the same user id: rides, profile and contacts are still there after verify.
- [ ] Sign in on a fresh install restores the profile and goes home.
- [ ] Resend countdown 60 s, error mapping as table, auto-submit on 6th digit, SMS autofill works on Android.
- [ ] Replace-guest confirm shows only when the guest has history. Blocked during an open ride.
- [ ] Phone tab hidden unless the flag is on. +91 default.
