-- The next stop remembers what kind of place it is (docs/design/27-ux-audit.md finding 9), so a fuel stop does not
-- show a coffee cup. Nullable: rides and old app versions without a category keep today's icons.
-- Independent of 0011.

alter table public.rides
  add column stop_category text,
  add constraint rides_stop_category_check check (
    stop_category is null
    or stop_category in ('cafe', 'fuel', 'restaurant', 'parking', 'toilets', 'other')
  );

-- A 7-arg version replaces the 6-arg one: both would make a call without `p_category` ambiguous for PostgREST.
drop function public.propose_stop(uuid, text, text, double precision, double precision, text);

create function public.propose_stop(p_ride_id uuid, p_name text, p_address text, p_lat double precision,
                                    p_lng double precision, p_kind text, p_category text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_ride public.rides;
  v_name text;
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_event_id bigint;
begin
  v_name := private.check_stop_input(p_name, p_address, p_lat, p_lng, p_kind);
  if p_category is not null and p_category not in ('cafe', 'fuel', 'restaurant', 'parking', 'toilets', 'other') then
    raise exception 'stop_invalid' using errcode = '22023';
  end if;
  if not private.is_ride_member(p_ride_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'ride_not_found' using errcode = 'P0002'; end if;
  if v_ride.status = 'ended' then raise exception 'stop_ride_ended' using errcode = '42501'; end if;

  if v_ride.leader_id = v_uid then
    update public.rides set stop_name = v_name, stop_address = v_address, stop_lat = p_lat, stop_lng = p_lng,
      stop_kind = p_kind, stop_category = p_category, stop_set_by = v_uid, stop_set_at = now()
      where id = p_ride_id;
    insert into public.ride_events (ride_id, user_id, type, payload)
    values (p_ride_id, v_uid, 'stop_set',
            jsonb_build_object('name', v_name, 'address', v_address, 'lat', p_lat, 'lng', p_lng,
                               'kind', p_kind, 'category', p_category, 'proposal_id', null, 'proposed_by', v_uid))
    returning id into v_event_id;
    return jsonb_build_object('applied', true, 'event_id', v_event_id);
  end if;

  -- A newer proposal from the same rider supersedes the old one (clients show only the newest).
  insert into public.ride_events (ride_id, user_id, type, payload)
  values (p_ride_id, v_uid, 'stop_proposed',
          jsonb_build_object('name', v_name, 'address', v_address, 'lat', p_lat, 'lng', p_lng, 'kind', p_kind,
                             'category', p_category))
  returning id into v_event_id;
  return jsonb_build_object('applied', false, 'event_id', v_event_id);
end;
$$;

-- Same as 0009, plus the proposal's category (null for proposals made by an old app).
create or replace function public.decide_stop(p_ride_id uuid, p_proposal_id bigint, p_accept boolean)
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
      stop_category = v_prop.payload ->> 'category',
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

-- Same as 0009, plus the category goes with the rest of the stop.
create or replace function public.clear_stop(p_ride_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ride public.rides;
begin
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'ride_not_found' using errcode = 'P0002'; end if;
  if v_ride.leader_id <> (select auth.uid()) or not private.is_ride_member(p_ride_id) then
    raise exception 'stop_leader_only' using errcode = '42501';
  end if;
  update public.rides set stop_name = null, stop_address = null, stop_lat = null, stop_lng = null,
    stop_kind = null, stop_category = null, stop_set_by = null, stop_set_at = null
    where id = p_ride_id;
  insert into public.ride_events (ride_id, user_id, type)
  values (p_ride_id, (select auth.uid()), 'stop_cleared');
end;
$$;

-- Same grants as 0009 (create or replace keeps them on decide_stop / clear_stop; the new propose_stop starts bare).
revoke execute on function public.propose_stop(uuid, text, text, double precision, double precision, text, text)
  from public, anon;
grant execute on function public.propose_stop(uuid, text, text, double precision, double precision, text, text)
  to authenticated;
