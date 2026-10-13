-- QA round 1 (simulated group ride, 2026-10-10):
-- 1. Stop detection fired in the lobby (everyone stands still before the start). Only track
--    slowness while the ride is active; in the lobby slow_since stays null.
-- 2. leave_ride on an already-ended ride stamped left_at, so the summary said "left early".

create or replace function private.on_ride_sample()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  slow_mps constant real := 3 / 3.6;
  prev public.rider_positions;
  v_ride public.rides;
  v_slow_since timestamptz;
  v_notified boolean;
begin
  select * into prev from public.rider_positions
    where ride_id = new.ride_id and user_id = new.user_id for update;
  if found and prev.recorded_at >= new.recorded_at then
    return null;
  end if;

  select * into v_ride from public.rides where id = new.ride_id;

  if v_ride.status <> 'active' or new.recorded_at < v_ride.started_at then
    v_slow_since := null;
  elsif new.speed_mps is null then
    v_slow_since := prev.slow_since;
  elsif new.speed_mps < slow_mps then
    v_slow_since := coalesce(prev.slow_since, new.recorded_at);
  else
    v_slow_since := null;
  end if;
  v_notified := v_slow_since is not null and coalesce(prev.stop_notified, false);

  if v_slow_since is not null and not v_notified
     and new.recorded_at - v_slow_since >= make_interval(secs => v_ride.stop_threshold_s) then
    insert into public.ride_events (ride_id, user_id, type, payload)
    values (new.ride_id, new.user_id, 'stopped',
            jsonb_build_object('since', v_slow_since, 'lat', new.lat, 'lng', new.lng));
    v_notified := true;
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

create or replace function public.leave_ride(p_ride_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.ride_status;
begin
  select status into v_status from public.rides where id = p_ride_id;
  if v_status is null or v_status = 'ended' then return; end if;
  if exists (select 1 from public.rides where id = p_ride_id and leader_id = (select auth.uid())) then
    raise exception 'leader_must_end_ride' using errcode = 'P0001';
  end if;
  update public.ride_members set left_at = now(), sos = false, sos_at = null
    where ride_id = p_ride_id and user_id = (select auth.uid()) and left_at is null;
  if found then
    insert into public.ride_events (ride_id, user_id, type) values (p_ride_id, (select auth.uid()), 'left');
  end if;
end;
$$;
