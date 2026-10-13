# Analytics and crash reporting

Throttle Tribe records product events and JavaScript errors into Supabase (`public.app_events`, `public.app_errors`). Code: `src/lib/telemetry/`. Schema and views: `supabase/migrations/0004_telemetry.sql`.

## What is collected

- Events: a fixed list of names (`app.opened`, `ride.created`, `sos.triggered`, ...; see `src/lib/telemetry/events.ts`) with tiny props such as `kind` or `code_error`.
- Context on every row: random per-launch session id, platform, OS version, app version, device model, current screen path, current ride id, client timestamp, and the anonymous Supabase user id (set by the server).
- Errors: kind (`js_fatal`, `js_error`, `unhandled_rejection`, `render`, `background_task`), message, stack, React component stack for render errors.

## What is NOT collected

- No coordinates or location trail, no rider names, no ride codes, no message text or any other text typed by a user, no contacts, no advertising id.
- Props and extra data must only hold fixed enums, booleans and counts. Do not add free text.
- Rows are insert-only from the app; nobody can read them through the API.

## Delivery

Rows are buffered on the device (max 500 events and 500 errors, oldest dropped) and sent in batches of 50 every 30 s and when the app goes to the background. Sending only happens when a Supabase session already exists; telemetry never signs a user in. A fatal crash is written to storage synchronously and sent on the next launch.

## Reading the data

Open the Supabase dashboard, SQL editor, and run:

```sql
select * from analytics.error_summary_7d;        -- errors grouped by message, version, platform
select * from analytics.crash_free_sessions_7d;  -- crash-free session % per version
select * from analytics.daily_active_users;      -- users, sessions, events per day
select * from analytics.event_counts_7d;         -- what people do
select * from analytics.ride_funnel_30d;         -- onboarded -> created/joined -> started -> ended, SOS count
```

## Limitation

Native crashes (Java, Kotlin, Swift, Objective-C, out-of-memory kills, OS-level kills) are not captured because no JavaScript runs when they happen. They show up only indirectly as sessions that stop abruptly with no `app.backgrounded` event. If native crash data is needed, add Sentry (or similar) later.
