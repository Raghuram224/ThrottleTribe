-- Personal SOS emergency contacts (owner decision 2026-10-10):
--  * private to the owner;
--  * readable by the owner's ride mates ONLY while the owner has an active SOS in an active ride
--    they share, so a helper can call family / ambulance; hidden again when the SOS clears;
--  * max 5 per rider. The ride group is always alerted on SOS regardless (set_sos, unchanged).

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- E.164-ish: optional +, 3-15 digits (short codes like 108 / 112 allowed).
  phone text not null check (phone ~ '^\+?[0-9]{3,15}$'),
  relation text check (char_length(relation) <= 30),
  position smallint not null default 0 check (position between 0 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index emergency_contacts_user_id_idx on public.emergency_contacts (user_id, position);

create trigger emergency_contacts_touch_updated_at before update on public.emergency_contacts
  for each row execute function private.touch_updated_at();

create function private.enforce_contact_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.emergency_contacts where user_id = new.user_id) >= 5 then
    raise exception 'contact_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger emergency_contacts_limit before insert on public.emergency_contacts
  for each row execute function private.enforce_contact_limit();

-- True when p_owner has an active SOS in an active ride that the caller is an active member of.
create function private.can_see_sos_contacts(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.ride_members owner_m
    join public.rides r on r.id = owner_m.ride_id and r.status = 'active'
    join public.ride_members me on me.ride_id = owner_m.ride_id
      and me.user_id = (select auth.uid()) and me.left_at is null
    where owner_m.user_id = p_owner and owner_m.sos and owner_m.left_at is null
  );
$$;

revoke execute on function private.can_see_sos_contacts(uuid), private.enforce_contact_limit() from public, anon;
grant execute on function private.can_see_sos_contacts(uuid) to authenticated;

alter table public.emergency_contacts enable row level security;
revoke all on public.emergency_contacts from anon;
grant select, insert, update, delete on public.emergency_contacts to authenticated;

create policy "owner manages own contacts" on public.emergency_contacts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "ride mates read contacts during owner's SOS" on public.emergency_contacts
  for select to authenticated
  using ((select private.can_see_sos_contacts(user_id)));
