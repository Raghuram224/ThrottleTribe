-- Usage counters for the `geo` Edge Function (docs/design/24-free-osm-stack.md section 5.2).
-- The function proxies Geoapify (search) and LocationIQ (routes) and must stay inside their free quotas, app-wide and
-- per rider. One row per (bucket, time window); a bucket is e.g. 'geoapify:day' or 'u:<hash>:route:min'. Rider ids are
-- hashed by the function before they get here, and rows older than two days are deleted.
--
-- Only the service role (the Edge Function) can call geo_take; clients cannot read or write the table.

create schema if not exists private;

create table if not exists private.geo_usage (
  bucket text not null check (char_length(bucket) between 1 and 80),
  window_start timestamptz not null,
  used int not null default 0 check (used >= 0),
  primary key (bucket, window_start)
);

alter table private.geo_usage enable row level security;
-- No policies: nobody but the owner / service role reaches the table.
revoke all on private.geo_usage from public, anon, authenticated;

-- Takes `p_cost` from every bucket in one transaction, or from none of them.
--   returns 0      = all buckets had room and were charged
--   returns n > 0  = the n-th bucket (1-based, in array order) is full; nothing was charged
-- Atomic: each bucket is one `insert ... on conflict do update ... where used + cost <= limit`, so two concurrent
-- requests can never both take the last unit. A refusal raises inside a sub-block so earlier buckets roll back.
create or replace function public.geo_take(
  p_buckets text[],
  p_windows timestamptz[],
  p_limits int[],
  p_cost int default 1
) returns int language plpgsql security definer set search_path = '' as $$
declare
  n int := coalesce(array_length(p_buckets, 1), 0);
  i int;
  -- The bucket that refused, kept in its own variable: the `for i` loop variable below is a NEW variable that shadows
  -- any outer `i`, so the handler could never read it (it would return the outer value, "charged OK").
  v_full int := 0;
  v_used int;
begin
  if n = 0 or n > 8
     or n is distinct from array_length(p_windows, 1)
     or n is distinct from array_length(p_limits, 1)
     or p_cost not between 1 and 20 then
    raise exception 'geo_take_invalid' using errcode = '22023';
  end if;

  -- Cheap retention, no cron needed: about 1 call in 50 sweeps rows older than two days.
  if random() < 0.02 then
    delete from private.geo_usage where window_start < now() - interval '2 days';
  end if;

  begin
    for i in 1..n loop
      v_used := null;
      insert into private.geo_usage as u (bucket, window_start, used)
      values (p_buckets[i], p_windows[i], p_cost)
      on conflict (bucket, window_start)
        do update set used = u.used + p_cost where u.used + p_cost <= p_limits[i]
      returning u.used into v_used;
      -- No row came back: the update's `where` refused it (the bucket is full).
      if v_used is null then
        v_full := i;
        raise exception 'geo_full' using errcode = 'P0001';
      end if;
    end loop;
    return 0;
  exception when sqlstate 'P0001' then
    -- Plpgsql variables survive the rollback of the block, so `v_full` still names the full bucket.
    return v_full;
  end;
end;
$$;

revoke execute on function public.geo_take(text[], timestamptz[], int[], int) from public, anon, authenticated;
grant execute on function public.geo_take(text[], timestamptz[], int[], int) to service_role;
