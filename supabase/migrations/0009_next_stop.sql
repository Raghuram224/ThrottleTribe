-- Shared "next stop" (docs/design/19-maps-search-stops.md section A).
-- The stop lives on the ride row (the existing rides broadcast carries it to every phone);
-- proposals and decisions are ride_events.

alter table public.rides
  add column stop_name text,
  add column stop_address text,
  add column stop_lat double precision,
  add column stop_lng double precision,
  add column stop_kind text,
  add column stop_set_by uuid references auth.users (id) on delete set null,
  add column stop_set_at timestamptz,
  add constraint rides_stop_name_check check (stop_name is null or char_length(stop_name) between 1 and 80),
  add constraint rides_stop_address_check check (stop_address is null or char_length(stop_address) <= 160),
  add constraint rides_stop_lat_check check (stop_lat is null or stop_lat between -90 and 90),
  add constraint rides_stop_lng_check check (stop_lng is null or stop_lng between -180 and 180),
  add constraint rides_stop_kind_check check (stop_kind is null or stop_kind in ('break', 'destination')),
  -- The columns are set and cleared together (set_by may become null if the proposer's account goes).
  add constraint rides_stop_together_check check (
    (stop_name is null and stop_lat is null and stop_lng is null and stop_kind is null and stop_set_at is null)
    or (stop_name is not null and stop_lat is not null and stop_lng is not null
        and stop_kind is not null and stop_set_at is not null)
  );

alter table public.ride_events drop constraint ride_events_type_check;
alter table public.ride_events add constraint ride_events_type_check check (type in (
  'joined', 'left', 'started', 'ended', 'sos', 'sos_cleared', 'message', 'stopped',
  'stop_proposed', 'stop_set', 'stop_declined', 'stop_cleared'
));

-- Validates the inputs of propose_stop; returns the trimmed name.
create function private.check_stop_input(p_name text, p_address text, p_lat double precision,
                                         p_lng double precision, p_kind text)
returns text language plpgsql immutable set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 80
     or char_length(coalesce(p_address, '')) > 160
     or p_lat is null or p_lat not between -90 and 90
     or p_lng is null or p_lng not between -180 and 180
     or p_kind is null or p_kind not in ('break', 'destination') then
    raise exception 'stop_invalid' using errcode = '22023';
  end if;
  return v_name;
end;
$$;

create function public.propose_stop(p_ride_id uuid, p_name text, p_address text, p_lat double precision,
                                    p_lng double precision, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_ride public.rides;
  v_name text;
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_event_id bigint;
begin
  v_name := private.check_stop_input(p_name, p_address, p_lat, p_lng, p_kind);
  if not private.is_ride_member(p_ride_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'ride_not_found' using errcode = 'P0002'; end if;
  if v_ride.status = 'ended' then raise exception 'stop_ride_ended' using errcode = '42501'; end if;

  if v_ride.leader_id = v_uid then
    update public.rides set stop_name = v_name, stop_address = v_address, stop_lat = p_lat, stop_lng = p_lng,
      stop_kind = p_kind, stop_set_by = v_uid, stop_set_at = now()
      where id = p_ride_id;
    insert into public.ride_events (ride_id, user_id, type, payload)
    values (p_ride_id, v_uid, 'stop_set',
            jsonb_build_object('name', v_name, 'address', v_address, 'lat', p_lat, 'lng', p_lng,
                               'kind', p_kind, 'proposal_id', null, 'proposed_by', v_uid))
    returning id into v_event_id;
    return jsonb_build_object('applied', true, 'event_id', v_event_id);
  end if;

  -- A newer proposal from the same rider supersedes the old one (clients show only the newest).
  insert into public.ride_events (ride_id, user_id, type, payload)
  values (p_ride_id, v_uid, 'stop_proposed',
          jsonb_build_object('name', v_name, 'address', v_address, 'lat', p_lat, 'lng', p_lng, 'kind', p_kind))
  returning id into v_event_id;
  return jsonb_build_object('applied', false, 'event_id', v_event_id);
end;
$$;

create function public.decide_stop(p_ride_id uuid, p_proposal_id bigint, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_ride public.rides;
  v_prop public.ride_events;
begin
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'ride_not_found' using errcode = 'P0002'; end if;
  if v_ride.leader_id <> v_uid or not private.is_ride_member(p_ride_id) then
    raise exception 'stop_leader_only' using errcode = '42501';
  end if;
  if v_ride.status = 'ended' then raise exception 'stop_ride_ended' using errcode = '42501'; end if;

  select * into v_prop from public.ride_events
    where id = p_proposal_id and ride_id = p_ride_id and type = 'stop_proposed';
  if not found then raise exception 'proposal_not_found' using errcode = 'P0002'; end if;

  -- Decided already, or superseded by a newer proposal from the same rider.
  if exists (
    select 1 from public.ride_events e
    where e.ride_id = p_ride_id
      and ((e.type in ('stop_set', 'stop_declined') and e.payload ->> 'proposal_id' = p_proposal_id::text)
        or (e.type = 'stop_proposed' and e.user_id is not distinct from v_prop.user_id and e.id > v_prop.id))
  ) then
    raise exception 'proposal_already_decided' using errcode = 'P0001';
  end if;

  if p_accept then
    update public.rides set
      stop_name = v_prop.payload ->> 'name',
      stop_address = v_prop.payload ->> 'address',
      stop_lat = (v_prop.payload ->> 'lat')::double precision,
      stop_lng = (v_prop.payload ->> 'lng')::double precision,
      stop_kind = v_prop.payload ->> 'kind',
      stop_set_by = v_prop.user_id,
      stop_set_at = now()
      where id = p_ride_id;
    insert into public.ride_events (ride_id, user_id, type, payload)
    values (p_ride_id, v_uid, 'stop_set', v_prop.payload || jsonb_build_object(
      'proposal_id', p_proposal_id, 'proposed_by', v_prop.user_id));
  else
    insert into public.ride_events (ride_id, user_id, type, payload)
    values (p_ride_id, v_uid, 'stop_declined', jsonb_build_object(
      'proposal_id', p_proposal_id, 'proposed_by', v_prop.user_id));
  end if;
end;
$$;

create function public.clear_stop(p_ride_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ride public.rides;
begin
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'ride_not_found' using errcode = 'P0002'; end if;
  if v_ride.leader_id <> (select auth.uid()) or not private.is_ride_member(p_ride_id) then
    raise exception 'stop_leader_only' using errcode = '42501';
  end if;
  update public.rides set stop_name = null, stop_address = null, stop_lat = null, stop_lng = null,
    stop_kind = null, stop_set_by = null, stop_set_at = null
    where id = p_ride_id;
  insert into public.ride_events (ride_id, user_id, type)
  values (p_ride_id, (select auth.uid()), 'stop_cleared');
end;
$$;

-- Only called from the security definer RPCs below (run as owner): nobody else needs it.
revoke execute on function private.check_stop_input(text, text, double precision, double precision, text)
  from public, anon, authenticated;
revoke execute on function public.propose_stop(uuid, text, text, double precision, double precision, text),
  public.decide_stop(uuid, bigint, boolean), public.clear_stop(uuid) from public, anon;
grant execute on function public.propose_stop(uuid, text, text, double precision, double precision, text),
  public.decide_stop(uuid, bigint, boolean), public.clear_stop(uuid) to authenticated;
