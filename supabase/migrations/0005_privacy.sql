-- Privacy: self-service account deletion + automatic data retention.
-- Retention policy (proposed, confirm before launch): ride GPS samples 30 days after the ride ends;
-- analytics events and error reports 90 days.

-- Deletes the caller's account and, by cascade, their profile, memberships, samples, positions,
-- telemetry, and any rides they led. Open rides they lead are ended first so riders get the event.
create function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  update public.rides set status = 'ended', ended_at = now()
    where leader_id = v_uid and status <> 'ended';
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

create extension if not exists pg_cron;

create function private.apply_retention()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.ride_samples s
    using public.rides r
    where r.id = s.ride_id and r.status = 'ended' and r.ended_at < now() - interval '30 days';
  delete from public.app_events where created_at < now() - interval '90 days';
  delete from public.app_errors where created_at < now() - interval '90 days';
end;
$$;

revoke execute on function private.apply_retention() from public, anon, authenticated;

select cron.schedule('throttle-tribe-retention', '30 21 * * *', 'select private.apply_retention()');
