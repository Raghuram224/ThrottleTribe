-- Product analytics + JS crash/error reports, stored in Supabase.
-- Clients may only INSERT their own rows; nobody reads them through the API.
-- Read them in the dashboard (SQL editor) via the views in the non-exposed `analytics` schema.

create table public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_.]{0,63}$'),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 4096),
  screen text check (char_length(screen) <= 120),
  ride_id uuid,
  session_id text not null check (char_length(session_id) between 1 and 64),
  platform text not null check (platform in ('ios', 'android')),
  os_version text check (char_length(os_version) <= 40),
  app_version text check (char_length(app_version) <= 40),
  device_model text check (char_length(device_model) <= 80),
  client_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index app_events_created_at_idx on public.app_events (created_at);
create index app_events_name_created_at_idx on public.app_events (name, created_at);
create index app_events_user_id_idx on public.app_events (user_id);

create table public.app_errors (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('js_fatal', 'js_error', 'unhandled_rejection', 'render', 'background_task')),
  is_fatal boolean not null default false,
  message text not null check (char_length(message) <= 2000),
  stack text check (char_length(stack) <= 20000),
  component_stack text check (char_length(component_stack) <= 20000),
  screen text check (char_length(screen) <= 120),
  ride_id uuid,
  session_id text not null check (char_length(session_id) between 1 and 64),
  platform text not null check (platform in ('ios', 'android')),
  os_version text check (char_length(os_version) <= 40),
  app_version text check (char_length(app_version) <= 40),
  device_model text check (char_length(device_model) <= 80),
  extra jsonb not null default '{}'::jsonb check (pg_column_size(extra) <= 4096),
  client_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index app_errors_created_at_idx on public.app_errors (created_at);
create index app_errors_user_id_idx on public.app_errors (user_id);

alter table public.app_events enable row level security;
alter table public.app_errors enable row level security;

revoke all on public.app_events, public.app_errors from anon, authenticated;
grant insert on public.app_events, public.app_errors to authenticated;

create policy "insert own events" on public.app_events for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "insert own errors" on public.app_errors for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- dashboard views (not exposed via the API)

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

create view analytics.daily_active_users as
  select date_trunc('day', created_at)::date as day, count(distinct user_id) as users,
         count(distinct session_id) as sessions, count(*) as events
  from public.app_events group by 1 order by 1 desc;

create view analytics.event_counts_7d as
  select name, count(*) as events, count(distinct user_id) as users
  from public.app_events where created_at > now() - interval '7 days'
  group by 1 order by 2 desc;

-- Groups errors by their first line + app version so repeats collapse into one row.
create view analytics.error_summary_7d as
  select kind, is_fatal, split_part(message, E'\n', 1) as message, app_version, platform,
         count(*) as occurrences, count(distinct user_id) as users,
         min(created_at) as first_seen, max(created_at) as last_seen
  from public.app_errors where created_at > now() - interval '7 days'
  group by 1, 2, 3, 4, 5 order by occurrences desc;

create view analytics.crash_free_sessions_7d as
  with s as (
    select distinct session_id, platform, app_version from public.app_events
    where created_at > now() - interval '7 days'
  ), c as (
    select distinct session_id from public.app_errors
    where is_fatal and created_at > now() - interval '7 days'
  )
  select s.platform, s.app_version, count(*) as sessions,
         count(*) filter (where c.session_id is null) as crash_free,
         round(100.0 * count(*) filter (where c.session_id is null) / nullif(count(*), 0), 2) as crash_free_pct
  from s left join c using (session_id) group by 1, 2 order by 2 desc, 1;

create view analytics.ride_funnel_30d as
  select count(distinct user_id) filter (where name = 'onboarding.completed') as onboarded,
         count(distinct user_id) filter (where name = 'ride.created') as created_ride,
         count(distinct user_id) filter (where name = 'ride.joined') as joined_ride,
         count(distinct user_id) filter (where name = 'ride.started') as started_ride,
         count(distinct user_id) filter (where name = 'ride.ended') as finished_ride,
         count(*) filter (where name = 'sos.triggered') as sos_triggered
  from public.app_events where created_at > now() - interval '30 days';
