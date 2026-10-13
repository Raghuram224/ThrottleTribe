-- Throttle Tribe: profiles, rides, membership, location samples, live positions, events,
-- plus realtime broadcast on a private channel per ride ("ride:<ride_id>").
-- Clients never write rides/members/positions/events directly: they call the RPCs below
-- (security definer) and insert their own GPS samples; triggers do the rest.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  bike text check (char_length(bike) <= 60),
  emergency_contact text check (char_length(emergency_contact) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.ride_status as enum ('lobby', 'active', 'ended');

create table public.rides (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[0-9]{6}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  leader_id uuid not null references auth.users (id) on delete cascade,
  status public.ride_status not null default 'lobby',
  -- How long a rider must stay below 3 km/h before counting as stopped.
  stop_threshold_s integer not null default 180 check (stop_threshold_s between 60 and 1800),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);
-- A code is unique only among rides that are not over, so codes can be reused.
create unique index rides_open_code_key on public.rides (code) where status <> 'ended';
create index rides_leader_id_idx on public.rides (leader_id);

create table public.ride_members (
  ride_id uuid not null references public.rides (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'rider' check (role in ('leader', 'rider')),
  color_index smallint not null default 0 check (color_index between 0 and 15),
  sos boolean not null default false,
  sos_at timestamptz,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (ride_id, user_id)
);
create index ride_members_user_id_idx on public.ride_members (user_id);

-- Every GPS sample (history, leader trail, summaries). Written by the phone's background task.
create table public.ride_samples (
  id bigint generated always as identity primary key,
  ride_id uuid not null,
  user_id uuid not null default auth.uid(),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m real,
  speed_mps real,
  heading real,
  app_state text check (app_state in ('active', 'background', 'inactive', 'unknown')),
  battery real check (battery is null or battery between -1 and 1),
  foreign key (ride_id, user_id) references public.ride_members (ride_id, user_id) on delete cascade,
  -- Natural key so the offline queue can retry a batch without duplicates.
  constraint ride_samples_natural_key unique (ride_id, user_id, recorded_at)
);

-- Latest known position per member, maintained by trigger. Broadcast to the ride channel.
create table public.rider_positions (
  ride_id uuid not null,
  user_id uuid not null,
  recorded_at timestamptz not null,
  lat double precision not null,
  lng double precision not null,
  accuracy_m real,
  speed_mps real,
  heading real,
  -- When speed first dropped below 3 km/h; null while moving. Unknown speed keeps the old value.
  slow_since timestamptz,
  stop_notified boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (ride_id, user_id),
  foreign key (ride_id, user_id) references public.ride_members (ride_id, user_id) on delete cascade
);

create table public.ride_events (
  id bigint generated always as identity primary key,
  ride_id uuid not null references public.rides (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  type text not null check (type in ('joined', 'left', 'started', 'ended', 'sos', 'sos_cleared', 'message', 'stopped')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ride_events_ride_id_created_at_idx on public.ride_events (ride_id, created_at);
create index ride_events_user_id_idx on public.ride_events (user_id);

-- ---------------------------------------------------------------- helpers (not exposed via the API)

create function private.is_ride_member(p_ride_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ride_members m
    where m.ride_id = p_ride_id and m.user_id = (select auth.uid()) and m.left_at is null
  );
$$;

create function private.shares_ride_with(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ride_members me
    join public.ride_members them on them.ride_id = me.ride_id
    where me.user_id = (select auth.uid()) and them.user_id = p_other
  );
$$;

create function private.ride_id_from_topic(p_topic text)
returns uuid language sql immutable set search_path = '' as $$
  select case when p_topic ~ '^ride:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then substr(p_topic, 6)::uuid end;
$$;

revoke execute on function private.is_ride_member(uuid), private.shares_ride_with(uuid),
  private.ride_id_from_topic(text) from public, anon;
grant execute on function private.is_ride_member(uuid), private.shares_ride_with(uuid),
  private.ride_id_from_topic(text) to authenticated;

create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- row level security

alter table public.profiles enable row level security;
alter table public.rides enable row level security;
alter table public.ride_members enable row level security;
alter table public.ride_samples enable row level security;
alter table public.rider_positions enable row level security;
alter table public.ride_events enable row level security;

revoke all on public.profiles, public.rides, public.ride_members, public.ride_samples,
  public.rider_positions, public.ride_events from anon;
grant select on public.profiles, public.rides, public.ride_members, public.ride_samples,
  public.rider_positions, public.ride_events to authenticated;
grant insert, update on public.profiles to authenticated;
grant insert on public.ride_samples to authenticated;

create policy "read own profile or ride mates" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_ride_with(id)));
create policy "insert own profile" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members read ride" on public.rides for select to authenticated
  using (leader_id = (select auth.uid()) or (select private.is_ride_member(id)));

create policy "members read members" on public.ride_members for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_ride_member(ride_id)));

create policy "members read samples" on public.ride_samples for select to authenticated
  using ((select private.is_ride_member(ride_id)));
create policy "members insert own samples while ride is open" on public.ride_samples for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_ride_member(ride_id))
    and exists (select 1 from public.rides r where r.id = ride_id and r.status <> 'ended')
  );

create policy "members read positions" on public.rider_positions for select to authenticated
  using ((select private.is_ride_member(ride_id)));

create policy "members read events" on public.ride_events for select to authenticated
  using ((select private.is_ride_member(ride_id)));

-- Realtime: only active members may join "ride:<id>" (broadcast receive + presence).
create policy "ride members receive ride channel" on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select private.is_ride_member(private.ride_id_from_topic((select realtime.topic()))))
  );
create policy "ride members track presence" on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and (select private.is_ride_member(private.ride_id_from_topic((select realtime.topic()))))
  );

-- ---------------------------------------------------------------- sample -> position (+ stop event)

create function private.on_ride_sample()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  slow_mps constant real := 3 / 3.6;
  prev public.rider_positions;
  v_threshold integer;
  v_slow_since timestamptz;
  v_notified boolean;
begin
  select * into prev from public.rider_positions
    where ride_id = new.ride_id and user_id = new.user_id for update;

  -- A late sample (offline queue replay) is kept as history but never moves the rider back.
  if found and prev.recorded_at >= new.recorded_at then
    return null;
  end if;

  if new.speed_mps is null then
    v_slow_since := prev.slow_since;
  elsif new.speed_mps < slow_mps then
    v_slow_since := coalesce(prev.slow_since, new.recorded_at);
  else
    v_slow_since := null;
  end if;
  v_notified := v_slow_since is not null and coalesce(prev.stop_notified, false);

  if v_slow_since is not null and not v_notified then
    select stop_threshold_s into v_threshold from public.rides where id = new.ride_id;
    if new.recorded_at - v_slow_since >= make_interval(secs => v_threshold) then
      insert into public.ride_events (ride_id, user_id, type, payload)
      values (new.ride_id, new.user_id, 'stopped',
              jsonb_build_object('since', v_slow_since, 'lat', new.lat, 'lng', new.lng));
      v_notified := true;
    end if;
  end if;

  insert into public.rider_positions as p
    (ride_id, user_id, recorded_at, lat, lng, accuracy_m, speed_mps, heading, slow_since, stop_notified, updated_at)
  values
    (new.ride_id, new.user_id, new.recorded_at, new.lat, new.lng, new.accuracy_m, new.speed_mps, new.heading,
     v_slow_since, v_notified, now())
  on conflict (ride_id, user_id) do update set
    recorded_at = excluded.recorded_at, lat = excluded.lat, lng = excluded.lng,
    accuracy_m = excluded.accuracy_m, speed_mps = excluded.speed_mps, heading = excluded.heading,
    slow_since = excluded.slow_since, stop_notified = excluded.stop_notified, updated_at = now();
  return null;
end;
$$;

create trigger ride_samples_update_position after insert on public.ride_samples
  for each row execute function private.on_ride_sample();

-- ---------------------------------------------------------------- broadcast to "ride:<id>"

create function private.broadcast_ride_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  -- One function serves several tables, so read columns via jsonb (NEW.id only exists on rides).
  v_row jsonb := to_jsonb(new);
  v_ride_id text := case when tg_table_name = 'rides' then v_row ->> 'id' else v_row ->> 'ride_id' end;
  v_event text := case tg_table_name
    when 'rider_positions' then 'position'
    when 'ride_members' then 'member'
    when 'rides' then 'ride'
    else 'event' end;
begin
  perform realtime.send(v_row, v_event, 'ride:' || v_ride_id, true);
  return null;
end;
$$;

create trigger rider_positions_broadcast after insert or update on public.rider_positions
  for each row execute function private.broadcast_ride_row();
create trigger ride_members_broadcast after insert or update on public.ride_members
  for each row execute function private.broadcast_ride_row();
create trigger rides_broadcast after update on public.rides
  for each row execute function private.broadcast_ride_row();
create trigger ride_events_broadcast after insert on public.ride_events
  for each row execute function private.broadcast_ride_row();

-- ---------------------------------------------------------------- RPCs (the only write path)

create function public.create_ride(p_name text, p_stop_threshold_s integer default 180)
returns public.rides language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text;
  v_ride public.rides;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  loop
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.rides where code = v_code and status <> 'ended');
  end loop;
  insert into public.rides (code, name, leader_id, stop_threshold_s)
  values (v_code, btrim(p_name), v_uid, p_stop_threshold_s)
  returning * into v_ride;
  insert into public.ride_members (ride_id, user_id, role, color_index) values (v_ride.id, v_uid, 'leader', 0);
  insert into public.ride_events (ride_id, user_id, type) values (v_ride.id, v_uid, 'joined');
  return v_ride;
end;
$$;

create function public.join_ride(p_code text)
returns public.rides language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_ride public.rides;
  v_color smallint;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  select * into v_ride from public.rides where code = btrim(p_code) and status <> 'ended';
  if not found then raise exception 'ride_not_found' using errcode = 'P0002'; end if;

  if exists (select 1 from public.ride_members where ride_id = v_ride.id and user_id = v_uid) then
    update public.ride_members set left_at = null where ride_id = v_ride.id and user_id = v_uid and left_at is not null;
  else
    select (count(*) % 16)::smallint into v_color from public.ride_members where ride_id = v_ride.id;
    insert into public.ride_members (ride_id, user_id, color_index) values (v_ride.id, v_uid, v_color);
    insert into public.ride_events (ride_id, user_id, type) values (v_ride.id, v_uid, 'joined');
  end if;
  return v_ride;
end;
$$;

create function public.start_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path = '' as $$
declare v_ride public.rides;
begin
  update public.rides set status = 'active', started_at = now()
    where id = p_ride_id and leader_id = (select auth.uid()) and status = 'lobby'
    returning * into v_ride;
  if not found then raise exception 'not_leader_or_not_in_lobby' using errcode = '42501'; end if;
  insert into public.ride_events (ride_id, user_id, type) values (p_ride_id, (select auth.uid()), 'started');
  return v_ride;
end;
$$;

create function public.end_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path = '' as $$
declare v_ride public.rides;
begin
  update public.rides set status = 'ended', ended_at = now()
    where id = p_ride_id and leader_id = (select auth.uid()) and status <> 'ended'
    returning * into v_ride;
  if not found then raise exception 'not_leader_or_already_ended' using errcode = '42501'; end if;
  insert into public.ride_events (ride_id, user_id, type) values (p_ride_id, (select auth.uid()), 'ended');
  return v_ride;
end;
$$;

create function public.leave_ride(p_ride_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.rides where id = p_ride_id and leader_id = (select auth.uid()) and status <> 'ended') then
    raise exception 'leader_must_end_ride' using errcode = 'P0001';
  end if;
  update public.ride_members set left_at = now(), sos = false, sos_at = null
    where ride_id = p_ride_id and user_id = (select auth.uid()) and left_at is null;
  if found then
    insert into public.ride_events (ride_id, user_id, type) values (p_ride_id, (select auth.uid()), 'left');
  end if;
end;
$$;

create function public.set_sos(p_ride_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pos public.rider_positions;
begin
  update public.ride_members set sos = p_on, sos_at = case when p_on then now() end
    where ride_id = p_ride_id and user_id = (select auth.uid()) and left_at is null and sos is distinct from p_on;
  if not found then return; end if;
  select * into v_pos from public.rider_positions where ride_id = p_ride_id and user_id = (select auth.uid());
  insert into public.ride_events (ride_id, user_id, type, payload)
  values (p_ride_id, (select auth.uid()), case when p_on then 'sos' else 'sos_cleared' end,
          case when v_pos.lat is null then '{}'::jsonb
               else jsonb_build_object('lat', v_pos.lat, 'lng', v_pos.lng, 'recorded_at', v_pos.recorded_at) end);
end;
$$;

create function public.send_ride_message(p_ride_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('fuel', 'puncture', 'slow_down', 'regroup', 'break', 'all_good') then
    raise exception 'invalid_message_kind' using errcode = '22023';
  end if;
  if not private.is_ride_member(p_ride_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  insert into public.ride_events (ride_id, user_id, type, payload)
  values (p_ride_id, (select auth.uid()), 'message', jsonb_build_object('kind', p_kind));
end;
$$;

revoke execute on function public.create_ride(text, integer), public.join_ride(text), public.start_ride(uuid),
  public.end_ride(uuid), public.leave_ride(uuid), public.set_sos(uuid, boolean),
  public.send_ride_message(uuid, text) from public, anon;
grant execute on function public.create_ride(text, integer), public.join_ride(text), public.start_ride(uuid),
  public.end_ride(uuid), public.leave_ride(uuid), public.set_sos(uuid, boolean),
  public.send_ride_message(uuid, text) to authenticated;
