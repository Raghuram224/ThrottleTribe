-- Adds the "on_my_way" quick message (reply to an SOS). Reusing "all_good" would tell the group
-- everything is fine during an emergency.
create or replace function public.send_ride_message(p_ride_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('fuel', 'puncture', 'slow_down', 'regroup', 'break', 'all_good', 'on_my_way') then
    raise exception 'invalid_message_kind' using errcode = '22023';
  end if;
  if not private.is_ride_member(p_ride_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  insert into public.ride_events (ride_id, user_id, type, payload)
  values (p_ride_id, (select auth.uid()), 'message', jsonb_build_object('kind', p_kind));
end;
$$;
