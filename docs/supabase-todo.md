# Supabase — everything you need to do

Everything here is done by **you** in the Supabase dashboard (and Google / Apple consoles).
The app code is written for you; this is the setup it depends on.

Legend: 🔴 needed now (Milestone 2a) · 🟡 Milestone 2b (Google/Apple) · 🔵 later (live location) · 🟢 before launch

---

## 0. Decide first 🔴

- [x] **Pick the app name and a bundle ID**: **Throttle Tribe**, `com.throttletribe.app` (iOS bundle ID and
      Android package), scheme `throttletribe://`. Google and Apple sign-in are registered against this ID,
      so changing it later means redoing step 5.
- [ ] **Pick the region**: choose **Mumbai (ap-south-1)** when creating the project — lowest latency for riders in India.

---

## 1. Create the project 🔴

- [ ] Sign up at <https://supabase.com/dashboard> and create a new project (Free plan is fine for testing).
- [ ] Save the **database password** in a password manager.
- [ ] Open **Connect** (top bar) or **Project Settings → API Keys** and copy:
  - **Project URL** → `https://<project-ref>.supabase.co`
  - **Publishable key** (starts with `sb_publishable_…`)
- [ ] In the app folder:
  ```bash
  cp .env.example .env
  ```
  then fill in:
  ```
  EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
  ```
- [ ] ⚠️ Never put the **secret / service_role key** in the app or in `.env` — anything with `EXPO_PUBLIC_` ships inside the app.

---

## 2. Database 🔴

- [ ] **SQL Editor → New query** → paste `supabase/migrations/0001_profiles.sql` → **Run**.
- [ ] Check **Table Editor → profiles** exists and shows **RLS enabled**.

What it creates: a `profiles` table (id, display_name). Any signed-in rider can read names
(the group needs to see who's who); only you can create/edit your own row.

- [x] **Run `supabase/migrations/0010_rename_ride.sql`** (applied 2026-10-15 to Throttle Tribe `aqzpdxyckwbxlvqnsnye`; verified: authenticated-only, a non-leader is refused) (SQL Editor → New query → paste → **Run**, after 0001 to 0009 are applied).
      It adds the `rename_ride` function the leader's **Rename ride** menu row calls. Until it runs, renaming shows
      "Renaming isn't available yet". Check: **Database → Functions** lists `rename_ride`.

---

## 3. Email sign-in (OTP code) 🔴

- [ ] **Authentication → Sign In / Providers → Email** → enabled.
- [ ] **Authentication → Emails → Templates → Magic Link** — replace the body so it sends a **code**, not a link:
  ```html
  <h2>Your sign-in code</h2>
  <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
  ```
  Without `{{ .Token }}` users get a link and no code.
- [ ] ⚠️ **Custom SMTP (needed to test with friends)** — Supabase's built-in email only delivers to
      **members of your Supabase team** and is heavily rate-limited. To let other riders sign in by email:
  - Create a free account at an email service (e.g. Resend, Brevo, AWS SES)
  - **Authentication → Emails → SMTP Settings** → enable custom SMTP and enter its host/port/user/password
  - Then raise the email limit under **Authentication → Rate Limits**

---

## 4. Phone sign-in (SMS OTP) 🔴

- [ ] **Authentication → Sign In / Providers → Phone** → enable.
- [ ] Choose an SMS provider and paste its credentials: **Twilio**, **Twilio Verify**, MessageBird, Vonage or TextLocal.
- [ ] ⚠️ **India rule (TRAI DLT):** SMS to Indian numbers must come from a DLT-registered sender ID and
      template, otherwise messages are silently dropped. Options:
  - **Twilio Verify** — easiest; handles OTP templates for you (costs more per SMS), or
  - **TextLocal / an Indian provider** — cheaper, but you register your business + template on a DLT portal first (takes days).
- [ ] **For development, skip SMS costs:** on the same Phone page add **Test phone numbers**, e.g.
  `919999999999=123456` — that number always accepts that code and no SMS is sent.

---

## 5. Guest join (anonymous sign-in) 🔴

- [ ] **Authentication → Sign In / Providers → "Allow anonymous sign-ins"** → on.
- [ ] Note: guests count as `authenticated`, so they can read profiles — intended, since they ride with the group.

---

## 6. Redirect URL 🔴

- [ ] **Authentication → URL Configuration → Redirect URLs** → add the app scheme: `throttletribe://`
      (will change to the new name's scheme, e.g. `sweep://`, after renaming).

---

## 7. Google sign-in 🟡

In **Google Cloud Console** (<https://console.cloud.google.com>):
- [ ] Create a project → **APIs & Services → OAuth consent screen** → fill in app name, support email, logo.
- [ ] **Credentials → Create OAuth client ID**, three times:
  - **Web application** → copy *Client ID* and *Client secret* (Supabase uses this one)
  - **iOS** → bundle ID = your bundle ID from step 0
  - **Android** → package name = your bundle ID, plus the **SHA-1** of your signing key
    (debug key now; add the release / Play App Signing SHA-1 before launch)

In **Supabase → Authentication → Sign In / Providers → Google**:
- [ ] Enable, paste the **Web** client ID + secret.
- [ ] In **Client IDs**, list all three client IDs (web, iOS, Android) comma-separated.
- [ ] Turn on **Skip nonce check** (needed for native iOS Google sign-in).

---

## 8. Apple sign-in 🟡

Needs a paid **Apple Developer account** ($99/year) — also required to publish on the App Store anyway.
- [ ] **Apple Developer → Certificates, IDs & Profiles → Identifiers** → your App ID → enable **Sign in with Apple**.
- [ ] **Supabase → Authentication → Sign In / Providers → Apple** → enable, add your **bundle ID** under **Client IDs**.
      (Native sign-in does not need the secret key; that's only for web OAuth.)

---

## 9. Live location — Supabase Realtime 🔵

The migrations will be written in the live-location milestone; you'll only need to run them. What they'll set up, so you know what to expect:
- [ ] Run `0002_rides.sql` — tables `rides` (code, leader, status) and `ride_members` (who's in which ride), with RLS so you only see rides you've joined.
- [ ] Run `0003_realtime.sql` — policies on `realtime.messages` so each ride's live channel is **private** to its members.
- [ ] **Project Settings → Realtime** → turn **off** "Allow public access" so only authorized channels work.

How it works: location pings go over **Broadcast** (fast, not stored in the database), and **Presence** shows who's connected. The database only stores ride membership and stop/SOS events.

---

## 10. Before launch 🟢

- [ ] **Authentication → Rate Limits** — check limits on OTP sends, anonymous sign-ins and token refreshes.
- [ ] **CAPTCHA** (Authentication → Attack Protection) — hCaptcha or Turnstile, to stop bots creating anonymous users.
- [ ] **Authentication → Users** — set up a periodic cleanup of old anonymous users (they pile up).
- [ ] Remove the **test phone numbers** from step 4.
- [ ] Add release **SHA-1** fingerprints to the Google Android client (step 7).
- [ ] Upgrade to the **Pro plan** — Free-plan projects **pause after 7 days of inactivity**, which would break a ride.
- [ ] **Database → Backups** — confirm daily backups (Pro plan).
- [ ] Review the **Advisors** (Security + Performance) tab in the dashboard and fix anything red.

---

## Quick checklist (Milestone 2a)

- [ ] App name + bundle ID decided
- [ ] Project created in Mumbai region
- [ ] `.env` filled with URL + publishable key
- [ ] `0001_profiles.sql` run
- [x] `0010_rename_ride.sql` run (Rename ride), 2026-10-15
- [ ] Email provider on + template has `{{ .Token }}`
- [ ] Custom SMTP set up (or test only with your own email)
- [ ] Phone provider on + test phone number added
- [ ] Anonymous sign-ins on
- [ ] Redirect URL added
