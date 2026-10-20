-- pgTAP test for public.geo_take (migration 0011). Run with: supabase test db
-- Checks the cap really blocks (returns the 1-based index of the full bucket) and that earlier buckets are rolled back.
begin;
select plan(8);

truncate private.geo_usage;
select is(public.geo_take(array['a','b'], array[now(), now()], array[2, 1], 1), 0, 'first take charges both buckets');
select is(public.geo_take(array['a','b'], array[now(), now()], array[2, 1], 1), 2, 'bucket b (limit 1) is full: returns its index 2, not 0');
select is((select used from private.geo_usage where bucket = 'a'), 1, 'bucket a was rolled back, still 1 (not 2)');
select is((select used from private.geo_usage where bucket = 'b'), 1, 'bucket b unchanged');
select is(public.geo_take(array['a'], array[now()], array[2], 1), 0, 'a still has room after the refused call');
select is(public.geo_take(array['a'], array[now()], array[2], 1), 1, 'a is now full: returns 1');
select throws_ok($$select public.geo_take(array[]::text[], array[]::timestamptz[], array[]::int[], 1)$$, '22023', null, 'empty input is invalid');
select is((select has_function_privilege('anon', 'public.geo_take(text[], timestamptz[], int[], int)', 'execute')), false, 'anon cannot call it');

select * from finish();
rollback;
