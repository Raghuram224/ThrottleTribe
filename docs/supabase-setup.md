# Supabase setup (Milestone 2a)

The app compiles without any of this, but sign-in and profiles only work once you
have done the steps below. Nothing here is automated; do it in the Supabase dashboard.

## 1. Create the project
1. Create a project at https://supabase.com/dashboard.
2. Open the project's **Connect** dialog (or **Project Settings > API Keys**) and copy the
   **Project URL** and the **publishable key**.
3. In the app root: `cp .env.example .env` and set
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
   ```
   `.env` is git-ignored. Restart Metro after editing it (`npx expo start -c`).
   Never put the secret / service-role key in the app.

## 2. Auth providers (Authentication > Sign In / Providers)
- **Email**: enable the Email provider. For one-time codes instead of links, edit the
  **Magic Link** email template (Authentication > Emails) so it contains the code:
  ```html
  <h2>Your Ride sign-in code</h2>
  <p>Enter this code: {{ .Token }}</p>
  ```
  The template must include `{{ .Token }}`, otherwise users receive a link and no code.
- **Phone**: enable the Phone provider and pick an SMS provider (Twilio, MessageBird,
  Vonage or TextLocal) and enter its credentials. Phone numbers are sent in E.164
  (default country +91). OTPs can be requested once per 60 seconds by default.
  For testing without SMS you can add test phone numbers/OTPs on the same page.
- **Anonymous sign-ins**: enable "Allow anonymous sign-ins". Used for guests joining via a
  ride code or link. Consider enabling CAPTCHA / rate limits before launch.
- **Google / Apple**: not needed yet. Milestone 2b. The buttons show "Coming soon".

## 3. Redirect URL (Authentication > URL Configuration)
Add `throttletribe://` to **Redirect URLs** (the app scheme from `app.json`).

## 4. Database
Open **SQL Editor**, paste the contents of `supabase/migrations/0001_profiles.sql`, and run it.
It creates `public.profiles` with row level security:
- any signed-in user (including guests) can read profiles;
- a user can insert/update only their own row.

## Checklist
- [ ] `.env` has URL + publishable key
- [ ] Email provider on, template contains `{{ .Token }}`
- [ ] Phone provider on + SMS provider configured
- [ ] Anonymous sign-ins on
- [ ] Redirect URL `throttletribe://` added
- [ ] `0001_profiles.sql` executed
