-- Rename ride (docs/design/22-map-home.md section 3.6): the leader can change the ride's name from the menu.
-- Clients only have `select` on rides, so the write is an RPC like every other ride change. The existing
-- `rides_broadcast` update trigger (0003) sends the new row to everyone in the ride, so no realtime change is needed.
-- No ride_events row: a rename is not an event any screen shows, and a new event type would have to be added to
-- ride_events_type_check and to every client that reads the log.

create function public.rename_ride(p_ride_id uuid, p_name text)
returns public.rides language plpgsql security definer set search_path = '' as $$
declare
  v_ride public.rides;
  v_name text := btrim(coalesce(p_name, ''));
begin
  select * into v_ride from public.rides where id = p_ride_id for update;
  -- Riders, strangers, a missing session and a ride id that does not exist all get the same answer: nothing is
  -- leaked about the ride, not even whether it exists.
  if not found or v_ride.leader_id is distinct from (select auth.uid()) or not private.is_ride_member(p_ride_id) then
    raise exception 'rename_leader_only' using errcode = '42501';
  end if;
  if v_ride.status = 'ended' then raise exception 'rename_ride_ended' using errcode = '42501'; end if;
  -- Same limit as rides.name (0003): 1 to 60 characters after trimming.
  if char_length(v_name) not between 1 and 60 then
    raise exception 'rename_invalid' using errcode = '22023';
  end if;

  update public.rides set name = v_name where id = p_ride_id returning * into v_ride;
  return v_ride;
end;
$$;

revoke execute on function public.rename_ride(uuid, text) from public, anon;
grant execute on function public.rename_ride(uuid, text) to authenticated;
