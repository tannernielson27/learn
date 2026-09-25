-- A scheduled sweep of the shared rate-limit table (#248).
--
-- private.hit_rate_limit (#234) removes up to 20 expired rows per call. That keeps the table near
-- the number of windows open at once while traffic is ordinary, but each call can also add a row
-- with a new key, so a flood from many addresses grows the table faster than it cleans, and the
-- rows stay after the flood ends until later calls get round to them. This job clears them every
-- five minutes regardless of traffic.
--
-- ---------------------------------------------------------------------------
-- The sweep
-- ---------------------------------------------------------------------------
--
-- One run deletes at most 5000 expired rows, oldest first, so a run stays a few milliseconds of
-- work and a short transaction however large a flood was; a backlog clears at 60,000 rows an hour.
-- It never touches a live window, so it cannot reset anyone's budget early. SKIP LOCKED means it
-- never waits on a row a hit_rate_limit call holds, so it takes no part in a lock cycle; at worst a
-- call hitting an expired key at the same instant waits for the sweep to commit, then inserts.
--
-- ---------------------------------------------------------------------------
-- Scheduling, with or without pg_cron (ADR 0007, docs/05 §7.8)
-- ---------------------------------------------------------------------------
--
-- The hosted project may not have pg_cron yet, and a fresh replay (§7.3), the local stack and CI
-- do not, so this file must apply without it. Unlike the reminder job, the sweep needs no URL and
-- no secret, so there is nothing an owner must supply: `private.schedule_rate_limit_sweep()`
-- schedules it when pg_cron is there and answers 'no_pg_cron' (without an error) when it is not.
-- This migration calls it once; the owner calls it again after enabling pg_cron (§7.8 step 4).
-- Every reference to `cron` is dynamic SQL, so the file replays on a database without the schema.
--
-- It is idempotent: a job already named `learn-rate-limit-sweep` is updated in place (schedule,
-- command, and switched back on) rather than scheduled twice. pg_cron runs a job as the role that
-- scheduled it, and cron.job shows each role only its own jobs, so call it as the same role every
-- time: `postgres`, which is what `db push` and the SQL editor use.
--
-- Safe to replay on a fresh project: two new functions and one call that does nothing there.

create function private.sweep_shared_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from private.shared_rate_limits s
   where (s.bucket, s.key_hash) in (
     select e.bucket, e.key_hash
       from private.shared_rate_limits e
      where e.expires_at <= now()
      order by e.expires_at
      limit 5000
        for update skip locked
   );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- pg_cron runs the job as its owner (postgres), who needs no grant. Nobody else may call it.
revoke all on function private.sweep_shared_rate_limits()
  from public, anon, authenticated, service_role;

-- Returns what it did rather than raising:
--   'no_pg_cron'  the pg_cron extension is not enabled; nothing was scheduled
--   'scheduled'   the job was created
--   'updated'     the job already existed; its schedule and command were reset and it is active
-- Security invoker on purpose: it grants nobody the use of pg_cron, it only saves typing for a
-- caller who already has it.
create function private.schedule_rate_limit_sweep()
returns text
language plpgsql
set search_path = ''
as $$
declare
  job_name constant text := 'learn-rate-limit-sweep';
  job_schedule constant text := '*/5 * * * *';
  job_command constant text := 'select private.sweep_shared_rate_limits()';
  existing bigint;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    return 'no_pg_cron';
  end if;

  -- Serialises two callers racing here, so neither schedules a second job.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(job_name));

  execute 'select jobid from cron.job where jobname = $1 order by jobid limit 1'
    into existing using job_name;

  if existing is null then
    execute 'select cron.schedule($1, $2, $3)' using job_name, job_schedule, job_command;
    return 'scheduled';
  end if;

  execute 'select cron.alter_job(job_id := $1, schedule := $2, command := $3, active := true)'
    using existing, job_schedule, job_command;
  return 'updated';
end;
$$;

revoke all on function private.schedule_rate_limit_sweep()
  from public, anon, authenticated, service_role;

-- Schedules it now where pg_cron is already on; elsewhere this answers 'no_pg_cron'.
select private.schedule_rate_limit_sweep();
