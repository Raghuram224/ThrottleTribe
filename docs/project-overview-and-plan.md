# Group Ride Tracking App — Project Overview and Plan

> **Note (2026-10-10):** This plan was carried over from the earlier `Ride` prototype. The product,
> design and backend decisions still apply. Sections 9 ("Implemented so far") and 13 ("Current
> blockers") describe that prototype, not this fresh `ThrottleTribe` project, which starts from a
> blank Expo SDK 57 app (Android + iOS only, no web) with Expo Router.
> App ID: `com.throttletribe.app` · scheme: `throttletribe://`

## 1. Product vision

A React Native app for group motorcycle rides that answers three questions at a glance:

1. Who is ahead?
2. Who is behind?
3. Who has stopped or lost signal?

Example insight:

> Arun: 4.2 km behind, stopped for 6 min

The app is designed for riders checking their phone briefly, often with gloves, bright sunlight, or a phone mounted on the bike.

## 2. Platform and technology decisions

- **Platform:** Native Android and iOS app from one React Native codebase
- **Framework:** Expo with Expo Router and TypeScript
- **Backend:** Supabase
- **Authentication:** Supabase Auth
- **Realtime location:** Supabase Realtime
- **State:** Zustand
- **Maps:** `react-native-maps`
- **Location:** `expo-location` and `expo-task-manager`
- **Notifications:** `expo-notifications`
- **Bottom sheet:** `@gorhom/bottom-sheet`
- **Styling:** Shared theme tokens in TypeScript
- **Navigation:** Expo Router routes under `src/app/`

The browser preview was used only for temporary UI checking. The target product is the native Android and iOS app.

## 3. Product decisions

### Authentication

The planned sign-in methods are:

- Phone number + OTP
- Email OTP
- Google sign-in
- Apple sign-in on iOS

Google and Apple require additional provider configuration and native application setup.

### Guest joining

Users who open a ride link or receive a ride code can join as guests using Supabase anonymous sign-in. They enter a name first and can upgrade to a permanent account later.

### Profile onboarding

- Required: display name
- Later options: profile photo, bike model, emergency contact

### Realtime architecture

Supabase Realtime is preferred over Firebase so authentication, database, access control, and realtime features use one backend.

Location updates should use Realtime Broadcast and Presence. Frequent location pings should not be stored permanently in the database unless needed for ride history or incident records.

## 4. User flow

```text
App launch
    |
    v
Splash: restore Supabase session
    |
    +-- signed in and profile complete --> Home
    |
    +-- not signed in --> Welcome
                              |
                              v
                         Sign in / Guest join
                              |
                              v
                         Verify OTP
                              |
                              v
                         Profile setup
                              |
                              v
                         Permission explanation
                              |
                              v
                         Home
```

### Home options

- Start a ride
- Join with code
- Resume an ongoing ride
- Open profile/settings

### Ride flow

```text
Home
  -> Create ride
  -> Lobby and share six-digit code
  -> Riders join
  -> Leader starts ride
  -> Live ride
  -> Leader ends ride
  -> Ride ended summary
```

## 5. MVP features

- Create a ride
- Join a ride with a six-digit code or link
- Lobby showing joined riders
- Live map with rider markers
- Rider list showing:
  - Name
  - Distance from the current rider
  - Ahead/behind position
  - Moving, stopped, offline, or SOS status
- Stop alerts after a configurable threshold
- Signal-lost state showing last-seen time
- One-tap SOS with location and loud alert
- Leader-controlled ride ending
- Background location updates
- Offline queue for location updates

## 6. Ahead/behind logic

Straight-line distance is not enough. Riders should eventually be snapped to the planned route or the lead rider's path.

Each rider should have an `alongRouteKm` value. Ahead/behind is calculated by comparing route distance, not only latitude and longitude.

## 7. Stop detection rules

Initial thresholds:

- Speed below `3 km/h` means a sample is slow.
- Slow speed must continue for at least `3 minutes` before the rider is considered stopped.
- No location sample for at least `60 seconds` means offline.
- SOS overrides every other state.

Important rule:

> No data is not the same as stopped.

The status function is located at:

`src/lib/rider-status.ts`

It should return:

```ts
{
  status: 'moving' | 'stopped' | 'offline' | 'sos';
  sinceMs: number | null;
}
```

## 8. Design system

### Status colours

| Token | Use | Colour |
|---|---|---|
| `status.moving` | Moving normally | `#22C55E` |
| `status.stopped` | Stopped beyond threshold | `#F59E0B` |
| `status.offline` | No recent signal | `#9CA3AF` |
| `status.sos` | Emergency | `#EF4444` |
| `brand.primary` | Buttons and highlights | `#F97316` |

Status must use colour, icon, and text together. Never rely on colour alone.

### Status icons

- Moving: `▶`
- Stopped: `⏸`
- Offline: `📶`
- SOS: `⚠`

### Layout rules

- Minimum touch target: 56 px
- Spacing grid: 4, 8, 12, 16, 24, 32 px
- Card/button radius: 12–16 px
- Typography scale: 12, 14, 16, 20, 28, 36 px
- High contrast for sunlight readability
- Dark theme supported from the beginning
- Primary actions placed near the bottom for thumb access

## 9. Implemented so far

### Expo project

- Expo project created with TypeScript
- Expo Router configured
- Expo development client dependency installed
- iOS simulator identified and booted during setup
- Supabase client configuration added
- `.env` is git-ignored

### Initial screens

- Home
- Join ride
- Lobby
- Live ride
- Ride ended

### Onboarding and authentication screens

- Splash/session restoration
- Welcome slides
- Sign-in screen
- OTP verification screen
- Profile setup screen
- Permissions explanation screen
- Home screen after onboarding
- Guest join path

### Supabase configuration in the app

The app expects:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never put a Supabase secret or service-role key in the app.

### Verification completed

- TypeScript check passes
- Expo lint passes
- Expo Doctor checks passed
- Initial navigation flow was checked with mock data

## 10. Supabase dashboard tasks

Follow the detailed checklist in:

`docs/supabase-todo.md`

Required now:

- Create the Supabase project
- Choose Mumbai (`ap-south-1`) for India-based testing
- Add the project URL and publishable key to `.env`
- Run `supabase/migrations/0001_profiles.sql`
- Confirm the `profiles` table exists and has RLS enabled
- Enable Email authentication
- Configure the email template to include `{{ .Token }}`
- Enable Phone authentication and configure an SMS provider
- Add a test phone number/OTP for development
- Enable anonymous sign-ins
- Add the app redirect scheme, currently `throttletribe://`

For production email delivery, configure custom SMTP. For Indian phone numbers, use an SMS provider and comply with TRAI/DLT requirements.

## 11. Database model so far

### `profiles`

- `id`: UUID referencing `auth.users.id`
- `display_name`: required, 1–40 characters
- `created_at`
- `updated_at`

RLS rules:

- Signed-in users can read profiles
- Users can insert only their own profile
- Users can update only their own profile

Future tables:

- `rides`
- `ride_members`
- `ride_events`
- Optional ride summaries and stop records

## 12. Next implementation milestones

### Milestone 2b — finish authentication

- Complete Google provider setup
- Complete Apple provider setup
- Test email OTP
- Test phone OTP
- Test anonymous guest join
- Add profile completion checks
- Add sign-out and session expiry handling

### Milestone 3 — real rides

- Add `rides` and `ride_members` tables
- Add create/join/start/end ride operations
- Add private Realtime channels per ride
- Add Presence for connected riders
- Add Broadcast for location updates
- Add RLS policies for ride membership

### Milestone 4 — native location

- Add `expo-location`
- Add `expo-task-manager`
- Configure foreground and background location permissions
- Add Android foreground service configuration
- Queue location updates when offline
- Reduce update frequency when stopped
- Test battery usage on real phones

### Milestone 5 — map and alerts

- Add `react-native-maps`
- Render rider markers with colours and status icons
- Implement route snapping
- Implement stop detection
- Add stop alerts
- Add SOS overlay and notifications
- Test on a real group ride

### Milestone 6 — ride summary and safety

- Ride distance and duration
- Stop history
- Regroup points
- Quick messages such as Fuel stop, Puncture, and Slow down
- Emergency contact support
- Crash detection research

## 13. Current blockers

### iOS local build

CocoaPods previously stopped because the local `~/.netrc` permissions were `644`. CocoaPods requires `600`.

Fix:

```bash
chmod 600 ~/.netrc
```

Then build the native iOS app with:

```bash
LANG=en_US.UTF-8 npx expo run:ios
```

### Android local build

Android Studio, Android SDK, and a compatible Java runtime still need to be installed/configured before running a local Android build.

Alternative: use an EAS development build once the Expo project configuration is ready.

### Intentional unfinished logic

`deriveRiderStatus` in `src/lib/rider-status.ts` is still a placeholder and must be implemented before the mock rider statuses are meaningful.

## 14. Commands

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

Start the native development server:

```bash
npx expo start
```

Build for iOS:

```bash
npx expo run:ios
```

Build for Android:

```bash
npx expo run:android
```

Restart Metro after changing `.env`:

```bash
npx expo start -c
```

## 15. Important safety and privacy requirements

- Explain location use before requesting permission.
- Request background location when the user starts a ride, not during the first app launch.
- Clearly distinguish stopped from offline.
- Do not expose Supabase secret/service-role keys in the mobile app.
- Use RLS on every exposed user-data table.
- Keep Realtime ride channels private.
- Add rate limits and CAPTCHA before public launch.
- Delete or expire stale anonymous accounts according to the product policy.
- Test SOS behavior carefully before using it in real rides.
