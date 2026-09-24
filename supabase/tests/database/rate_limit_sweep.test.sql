-- The scheduled sweep of private.shared_rate_limits (#248).
--
-- The stack this runs on has pg_cron available but not enabled, which is how a fresh replay (§7.3)
-- and CI find it. So the first half proves the migration applied and scheduled nothing, and the
-- second half enables pg_cron inside this transaction (rolled back at the end, so no job outlives
-- the test and the launcher never runs one) and proves the job, its idempotence and its command.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---------------------------------------------------------------------------
-- Shape and privileges
-- ---------------------------------------------------------------------------

select has_function('private', 'sweep_shared_rate_limits', array[]::text[],
  'the sweep function exists');
select has_function('private', 'schedule_rate_limit_sweep', array[]::text[],
  'the function that schedules it exists');

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     from pg_proc p where p.oid = 'private.sweep_shared_rate_limits()'::regprocedure),
  'the sweep runs as its owner with an empty search_path'
);

select ok(
  not (select p.prosecdef from pg_proc p
        where p.oid = 'private.schedule_rate_limit_sweep()'::regprocedure),
  'scheduling runs as the caller, so it grants nobody pg_cron'
);

select ok(
  not has_function_privilege('anon', 'private.sweep_shared_rate_limits()', 'execute')
    and not has_function_privilege('authenticated', 'private.sweep_shared_rate_limits()', 'execute')
    and not has_function_privilege('service_role', 'private.sweep_shared_rate_limits()', 'execute'),
  'nobody but its owner can run the sweep'
);

select ok(
  not has_function_privilege('anon', 'private.schedule_rate_limit_sweep()', 'execute')
    and not has_function_privilege('authenticated', 'private.schedule_rate_limit_sweep()', 'execute')
    and not has_function_privilege('service_role', 'private.schedule_rate_limit_sweep()', 'execute'),
  'nobody but its owner can schedule it'
);

set local role authenticated;
select throws_ok(
  $$ select private.sweep_shared_rate_limits() $$,
  '42501',
  null,
  'a signed-in user is refused at the call'
);
reset role;

-- ---------------------------------------------------------------------------
-- Without pg_cron: the migration applied and nothing is scheduled
-- ---------------------------------------------------------------------------

select ok(
  not exists (select 1 from pg_extension where extname = 'pg_cron'),
  'this stack starts without pg_cron, as a fresh replay does'
);

select is(
  private.schedule_rate_limit_sweep(),
  'no_pg_cron',
  'without pg_cron, scheduling does nothing and raises nothing'
);

select ok(
  to_regclass('cron.job') is null,
  'and it did not create pg_cron either'
);

-- ---------------------------------------------------------------------------
-- With pg_cron: exactly one job, however often it is scheduled
-- ---------------------------------------------------------------------------

create extension pg_cron with schema pg_catalog;

select is(private.schedule_rate_limit_sweep(), 'scheduled', 'with pg_cron, the first call schedules');
select is(private.schedule_rate_limit_sweep(), 'updated', 'a second call updates the same job');

select is(
  (select count(*)::int from cron.job where jobname = 'learn-rate-limit-sweep'),
  1,
  'exactly one sweep job exists after scheduling twice'
);

select is(
  (select row(j.schedule, j.command, j.active)::text
     from cron.job j where j.jobname = 'learn-rate-limit-sweep'),
  row('*/5 * * * *', 'select private.sweep_shared_rate_limits()', true)::text,
  'it runs the sweep every five minutes, and is active'
);

-- A job someone paused is switched back on by scheduling again, not duplicated.
do $$
begin
  perform cron.alter_job(
    (select jobid from cron.job where jobname = 'learn-rate-limit-sweep'), active := false);
  perform private.schedule_rate_limit_sweep();
end;
$$;
select is(
  (select array_agg(active) from cron.job where jobname = 'learn-rate-limit-sweep'),
  array[true],
  'scheduling again re-activates a paused job and still leaves one'
);

-- ---------------------------------------------------------------------------
-- The job's command: every expired row goes, no live one does
-- ---------------------------------------------------------------------------

delete from private.shared_rate_limits;

insert into private.shared_rate_limits (bucket, key_hash, expires_at, calls)
select 'pgtap_sweep', encode(sha256(('expired' || g)::bytea), 'hex'),
       now() - make_interval(secs => g), 1
  from generate_series(1, 40) as g;

insert into private.shared_rate_limits (bucket, key_hash, expires_at, calls)
select 'pgtap_sweep', encode(sha256(('live' || g)::bytea), 'hex'),
       now() + make_interval(secs => g), 3
  from generate_series(1, 7) as g;

do $$
begin
  execute (select command from cron.job where jobname = 'learn-rate-limit-sweep');
end;
$$;

select is(
  (select count(*)::int from private.shared_rate_limits where expires_at <= now()),
  0,
  'running the job''s command removes every expired row'
);

select is(
  (select count(*)::int from private.shared_rate_limits where expires_at > now() and calls = 3),
  7,
  'and leaves every live window, with its count, untouched'
);

-- ---------------------------------------------------------------------------
-- Bounded: one run removes at most 5000 rows
-- ---------------------------------------------------------------------------

insert into private.shared_rate_limits (bucket, key_hash, expires_at, calls)
select 'pgtap_bulk', encode(sha256(('bulk' || g)::bytea), 'hex'),
       now() - interval '2 hours' + make_interval(secs => g), 1
  from generate_series(1, 5003) as g;

select is(private.sweep_shared_rate_limits(), 5000, 'one run removes at most 5000 rows, and says so');

select is(
  (select array_agg(key_hash order by key_hash) from private.shared_rate_limits
    where bucket = 'pgtap_bulk'),
  (select array_agg(h order by h)
     from generate_series(5001, 5003) as g,
          lateral (select encode(sha256(('bulk' || g)::bytea), 'hex') as h) as d),
  'oldest first: the three newest expired rows wait for the next run'
);

select * from finish();
rollback;
