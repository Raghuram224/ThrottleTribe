-- Phase 1 background-location test. Temporary: drop after the spike.
-- Applied to project aqzpdxyckwbxlvqnsnye on 2026-10-10 (remote name: 0001_spike_location_samples).
create table public.spike_location_samples (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  run_id text not null check (char_length(run_id) between 1 and 64),
  device_label text not null check (char_length(device_label) between 1 and 40),
  platform text not null check (platform in ('ios', 'android')),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  accuracy_m real,
  speed_mps real,
  heading real,
  app_state text check (app_state in ('active', 'background', 'inactive', 'unknown')),
  battery real check (battery is null or battery between -1 and 1),
  is_mocked boolean,
  -- Natural key: lets the client retry a batch without creating duplicates.
  constraint spike_samples_unique unique (user_id, run_id, recorded_at)
);

alter table public.spike_location_samples enable row level security;

revoke all on public.spike_location_samples from anon;
grant select, insert on public.spike_location_samples to authenticated;

create policy "insert own samples"
  on public.spike_location_samples for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "read own samples"
  on public.spike_location_samples for select to authenticated
  using (user_id = (select auth.uid()));
