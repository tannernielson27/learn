-- The AI import cap under real concurrency (#340): two reservations at once cannot pass the cap
-- together.
--
-- Six dblink sessions each ask public.reserve_ai_usage for $0.40 against a $1.00 cap, all parked
-- behind an advisory lock this session holds and released together, as six chunks of one upload
-- would arrive from six Vercel instances. The month's row lock serializes them, so exactly two
-- fit. As in shared_rate_limits.test.sql, the burst sessions commit on their own, so the workspace
-- they reserve against is made and deleted over dblink (deleting it cascades to its usage row and
-- the ledger), never in this file's own transaction.
--
-- dblink connects back over TCP, to the address this session reached the server on, as `postgres`
-- with the local stack's default password: the local and CI stack only.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(5);

select ok(inet_server_addr() is not null, 'this session reached the server over TCP, as dblink needs');

create temporary table burst_results (allowed boolean, reason text) on commit drop;

do $$ begin perform pg_advisory_lock(340340); end; $$;

do $$
declare
  conn text;
begin
  for i in 1..6 loop
    conn := 'capburst' || i;
    perform extensions.dblink_connect(
      conn,
      format(
        'host=%s port=%s dbname=postgres user=postgres password=postgres',
        host(inet_server_addr()),
        inet_server_port()
      )
    );
  end loop;
  -- A workspace of the burst's own, committed so the other sessions see it. A leftover from a run
  -- that stopped part-way is removed first.
  perform extensions.dblink_exec('capburst1', $q$
    delete from public.orgs where id = '00000000-0000-0000-0000-000000340c0c'
  $q$);
  perform extensions.dblink_exec('capburst1', $q$
    insert into public.orgs (id, name, ai_import_enabled, ai_import_monthly_cap_usd)
    values ('00000000-0000-0000-0000-000000340c0c', 'Cap burst', true, 1.00)
  $q$);
  for i in 1..6 loop
    perform extensions.dblink_send_query(
      'capburst' || i,
      -- The call is in the select list, so it runs only once the gate row exists; OFFSET 0 keeps
      -- (r).allowed and (r).reason from expanding into two calls.
      $q$select (s.r).allowed, (s.r).reason
           from (select public.reserve_ai_usage('00000000-0000-0000-0000-000000340c0c', 1, 0.40) as r
                   from (select pg_advisory_lock_shared(340340)) as gate
                 offset 0) as s$q$
    );
  end loop;
end;
$$;

do $$ begin perform pg_advisory_unlock(340340); end; $$;

do $$
begin
  for i in 1..6 loop
    insert into burst_results
      select * from extensions.dblink_get_result('capburst' || i)
        as r(allowed boolean, reason text);
  end loop;
end;
$$;

select is(
  (select count(*) from burst_results),
  6::bigint,
  'all six concurrent reservations answered'
);

select is(
  (select count(*) from burst_results where allowed),
  2::bigint,
  'six concurrent $0.40 reservations against a $1.00 cap allow exactly two'
);

select is(
  (select count(*) from burst_results where not allowed and reason = 'cap_reached'),
  4::bigint,
  'the other four are refused as past the cap'
);

select is(
  (select cost_reserved_usd::numeric(6, 2)::text from public.ai_usage
    where org_id = '00000000-0000-0000-0000-000000340c0c'),
  '0.80',
  'the month''s row reserves exactly what was allowed'
);

-- Delete the committed workspace over dblink, then hang up. capburst2..6 hang up with their
-- result read; capburst1 is drained (dblink wants one more, empty, read after an async query)
-- and reused for the delete.
do $$
begin
  for i in 2..6 loop
    perform extensions.dblink_disconnect('capburst' || i);
  end loop;
  perform * from extensions.dblink_get_result('capburst1') as r(allowed boolean, reason text);
  perform extensions.dblink_exec('capburst1', $q$
    delete from public.orgs where id = '00000000-0000-0000-0000-000000340c0c'
  $q$);
  perform extensions.dblink_disconnect('capburst1');
end;
$$;

select * from finish();
rollback;
