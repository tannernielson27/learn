-- Reminder emails (#212): one when an assignment opens, one a day before it closes.
--
-- The scheduler is ADR 0007: pg_cron, every 15 minutes, calls the app's route
-- `/api/cron/assignment-reminders` through pg_net with a shared secret. The route does the work:
-- it submits attempts left open at close (#208), asks `enqueue_assignment_reminders` what is due,
-- claims a batch with `claim_assignment_reminders`, sends each through the app's Mailer (#206) and
-- records the outcome. The database only decides who is owed which email, and remembers it.
--
-- ---------------------------------------------------------------------------
-- Once, and never stale
-- ---------------------------------------------------------------------------
--
-- `private.email_outbox` holds one row per (assignment, student, kind), unique, so however often
-- the job runs a student is owed each email at most once. The row carries no address, no title and
-- no time: the claim reads all three from the live rows, so an edited close time goes out as it is
-- now, and a deleted assignment takes its rows with it (on delete cascade). Before claiming, the
-- claim drops any pending row that is no longer owed (the student left the class or submitted, the
-- window closed, or the close time moved more than a day away). A dropped `closing_soon` is
-- enqueued again if it becomes due again; a sent one never is.
--
-- A failed send is retried with backoff the app computes (respecting Resend's Retry-After), and
-- given up after five tries. `tries` counts claims, so a run that dies mid-batch cannot retry one
-- row for ever either.
--
-- ---------------------------------------------------------------------------
-- What this migration does not do
-- ---------------------------------------------------------------------------
--
-- It does not create pg_cron or pg_net, or schedule anything. The job needs two values no
-- migration can hold (the deployment's URL and the shared secret, both in Vault), and a job
-- scheduled on a project without them, or on a fresh replay (§7.3) or the local stack, would
-- only fail every 15 minutes. So scheduling is an owner step (docs/05 §7.8), and
-- `private.call_reminder_route()` is written to do nothing, without an error, when the extension
-- or either secret is missing. Every reference to `net` and `vault` is dynamic SQL for the same
-- reason: this file replays cleanly on a database that has neither.
--
-- Safe to replay on a fresh project: one new column with a default, one new table, new functions.

-- ---------------------------------------------------------------------------
-- A class's time zone, for the due time in the email
-- ---------------------------------------------------------------------------

-- A name Postgres knows (`America/Denver`, `Europe/London`, `UTC`), checked against the catalog so
-- that `at time zone` and the app's Intl.DateTimeFormat can both use it. Stable, not immutable:
-- the list comes from the server's tz database.
create function private.is_time_zone(zone text) returns boolean
language sql stable set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names t where t.name = zone);
$$;

revoke all on function private.is_time_zone(text) from public, anon;
-- The check runs as whoever writes the row, and authors create classes.
grant execute on function private.is_time_zone(text) to authenticated, service_role;

-- No grant: nothing in the app writes it yet, so every class is on America/Denver unless the
-- owner changes one in the SQL editor (docs/05 §7.8). The check still holds for that write.
alter table public.classes
  add column time_zone text not null default 'America/Denver'
    constraint classes_time_zone_valid check (private.is_time_zone(time_zone));

-- ---------------------------------------------------------------------------
-- The outbox
-- ---------------------------------------------------------------------------

create table private.email_outbox (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('opened', 'closing_soon')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  tries smallint not null default 0 check (tries >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_until timestamptz,
  -- An EmailError kind (or 'gave_up'), never a provider message: nothing here names a person.
  last_error text check (last_error is null or last_error ~ '^[a-z_]{1,32}$'),
  -- Resend's id for the sent message, for tracing a complaint.
  provider_id text check (provider_id is null or length(provider_id) <= 200),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint email_outbox_once unique (assignment_id, student_id, kind)
);

create index email_outbox_due_idx on private.email_outbox (next_attempt_at)
  where status = 'pending';
create index email_outbox_student_id_idx on private.email_outbox (student_id);

revoke all on private.email_outbox from public, anon, authenticated, service_role;
-- No policies: only the definer functions below read or write it, and RLS stays on as the second
-- layer every private table here has, in case a later grant forgets it.
alter table private.email_outbox enable row level security;

-- ---------------------------------------------------------------------------
-- Who is owed what
-- ---------------------------------------------------------------------------

-- The one definition of "owed", used by the enqueue and again by the claim, so the two cannot
-- drift apart.
--
--   opened        the window is open, it opened within the last day (a job that was down for
--                 longer does not send "is open" days late, and applying this migration does not
--                 mail every class about everything already open), and the student is a current
--                 member of the class.
--   closing_soon  the window is open and closes within 24 hours; it has been open for at least a
--                 day before that point (a shorter window's "is open" email already said when it
--                 closes); the assignment was created at least 24 hours before it closes (#212);
--                 the student is a current member; and they have no submitted attempt.
create function private.reminder_owed(
  kind text,
  target_class uuid,
  target_assignment uuid,
  student uuid,
  opens timestamptz,
  closes timestamptz,
  created timestamptz
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select opens <= now()
     and closes > now()
     and private.is_current_member(target_class, student)
     and case kind
       when 'opened' then opens > now() - interval '1 day'
       when 'closing_soon' then
         closes <= now() + interval '24 hours'
         and opens <= closes - interval '24 hours'
         and created <= closes - interval '24 hours'
         and not exists (
           select 1 from public.assignment_attempts t
            where t.assignment_id = target_assignment
              and t.student_id = student
              and t.submitted_at is not null
         )
       else false
     end;
$$;

revoke all on function private.reminder_owed(text, uuid, uuid, uuid, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;

-- Adds whatever is owed and not yet in the outbox, and says how many of each it added. Running it
-- twice adds nothing the second time. Service role only: the app's cron route calls it.
create function public.enqueue_assignment_reminders()
returns table (opened integer, closing_soon integer)
language plpgsql security definer set search_path = ''
as $$
declare
  added_opened integer;
  added_closing integer;
begin
  with owed as (
    select a.id as assignment_id, m.profile_id as student_id, k.kind
      from public.assignments a
      join public.class_members m on m.class_id = a.class_id
      cross join (values ('opened'), ('closing_soon')) as k(kind)
     where a.opens_at <= now()
       and a.closes_at > now()
       and private.reminder_owed(k.kind, a.class_id, a.id, m.profile_id,
                                 a.opens_at, a.closes_at, a.created_at)
  ),
  added as (
    insert into private.email_outbox (assignment_id, student_id, kind)
    select o.assignment_id, o.student_id, o.kind from owed o
    on conflict on constraint email_outbox_once do nothing
    returning kind
  )
  select count(*) filter (where added.kind = 'opened'),
         count(*) filter (where added.kind = 'closing_soon')
    into added_opened, added_closing
    from added;

  return query select added_opened, added_closing;
end;
$$;

revoke all on function public.enqueue_assignment_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_assignment_reminders() to service_role;

-- ---------------------------------------------------------------------------
-- Claiming a batch
-- ---------------------------------------------------------------------------

-- After this many claims a row is given up on.
create function private.reminder_max_tries() returns smallint
language sql immutable set search_path = ''
as $$ select 5::smallint $$;

revoke all on function private.reminder_max_tries() from public, anon, authenticated, service_role;

-- Up to `max_rows` due reminders, each leased for `lease_seconds` so a second run racing this one
-- skips them, with what the email needs read from the live rows. First it drops pending rows that
-- are no longer owed and gives up on any that have used every try.
--
-- The address comes from auth.users, which is why this is definer rights and service role only.
-- The route must not log it.
create function public.claim_assignment_reminders(
  max_rows integer default 20,
  lease_seconds integer default 300
)
returns table (
  outbox_id uuid,
  assignment_id uuid,
  student_id uuid,
  kind text,
  email text,
  title text,
  closes_at timestamptz,
  time_zone text,
  tries smallint
)
language plpgsql security definer set search_path = ''
as $$
begin
  delete from private.email_outbox o
   using public.assignments a
   where a.id = o.assignment_id
     and o.status = 'pending'
     and (o.claimed_until is null or o.claimed_until < now())
     and not private.reminder_owed(o.kind, a.class_id, a.id, o.student_id,
                                   a.opens_at, a.closes_at, a.created_at);

  update private.email_outbox o
     set status = 'failed', last_error = 'gave_up', claimed_until = null
   where o.status = 'pending'
     and o.tries >= private.reminder_max_tries()
     and (o.claimed_until is null or o.claimed_until < now());

  return query
  with due as (
    select o.id
      from private.email_outbox o
     where o.status = 'pending'
       and o.next_attempt_at <= now()
       and (o.claimed_until is null or o.claimed_until < now())
     order by o.next_attempt_at, o.id
     limit least(greatest(coalesce(max_rows, 20), 1), 100)
     for update skip locked
  ),
  claimed as (
    update private.email_outbox o
       set claimed_until = now()
             + make_interval(secs => least(greatest(coalesce(lease_seconds, 300), 30), 900)),
           tries = o.tries + 1
      from due
     where o.id = due.id
    returning o.id, o.assignment_id, o.student_id, o.kind, o.tries
  )
  select c.id, c.assignment_id, c.student_id, c.kind, u.email::text, a.title, a.closes_at,
         cl.time_zone, c.tries
    from claimed c
    join public.assignments a on a.id = c.assignment_id
    join public.classes cl on cl.id = a.class_id
    join auth.users u on u.id = c.student_id
   order by c.id;
end;
$$;

revoke all on function public.claim_assignment_reminders(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_assignment_reminders(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Recording the outcome
-- ---------------------------------------------------------------------------

-- Sent. Only a pending row changes, so a late duplicate call does nothing.
create function public.complete_assignment_reminder(target uuid, message_id text default null)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update private.email_outbox
     set status = 'sent', sent_at = now(), claimed_until = null, last_error = null,
         provider_id = left(message_id, 200)
   where id = target and status = 'pending';
  return found;
end;
$$;

revoke all on function public.complete_assignment_reminder(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_assignment_reminder(uuid, text) to service_role;

-- A send that failed. `retry_in_seconds` null means give up now (a failure retrying cannot fix);
-- otherwise it is tried again no sooner than that (at least a minute, at most a day), unless it
-- has used every try. `error_kind` is the EmailError kind, which names no one.
create function public.fail_assignment_reminder(
  target uuid,
  error_kind text,
  retry_in_seconds integer default null
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  kind_label text := case when coalesce(error_kind, '') ~ '^[a-z_]{1,32}$' then error_kind
                          else 'unknown' end;
  outcome text;
begin
  update private.email_outbox o
     set status = case
           when retry_in_seconds is null or o.tries >= private.reminder_max_tries() then 'failed'
           else 'pending'
         end,
         next_attempt_at = case
           when retry_in_seconds is null then o.next_attempt_at
           else now() + make_interval(secs => least(greatest(retry_in_seconds, 60), 86400))
         end,
         claimed_until = null,
         last_error = kind_label
   where o.id = target and o.status = 'pending'
  returning case when o.status = 'failed' then 'failed' else 'retrying' end into outcome;
  return coalesce(outcome, 'not_found');
end;
$$;

revoke all on function public.fail_assignment_reminder(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.fail_assignment_reminder(uuid, text, integer) to service_role;

-- Hands claimed rows back untried, for a batch the route stopped short (Resend said slow down):
-- the claim's try is returned and they are due again after `retry_in_seconds` (0 to a day).
create function public.release_assignment_reminders(targets uuid[], retry_in_seconds integer default 0)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  released integer;
begin
  update private.email_outbox o
     set claimed_until = null,
         tries = greatest(o.tries - 1, 0),
         next_attempt_at = now()
           + make_interval(secs => least(greatest(coalesce(retry_in_seconds, 0), 0), 86400))
   where o.id = any (coalesce(targets, '{}'::uuid[])) and o.status = 'pending';
  get diagnostics released = row_count;
  return released;
end;
$$;

revoke all on function public.release_assignment_reminders(uuid[], integer) from public, anon, authenticated;
grant execute on function public.release_assignment_reminders(uuid[], integer) to service_role;

-- ---------------------------------------------------------------------------
-- What pg_cron runs (scheduled by the owner, docs/05 §7.8)
-- ---------------------------------------------------------------------------

-- POSTs to the reminder route with the shared secret, both read from Vault at run time:
-- `learn_reminders_url` (the deployment's full route URL) and `learn_cron_secret` (the same value
-- as Vercel's CRON_SECRET). Returns what it did rather than raising, so a project that is not set
-- up yet logs a word in cron.job_run_details instead of an error every 15 minutes:
--   'no_pg_net'       the pg_net extension is not enabled
--   'no_vault'        Vault is not available
--   'not_configured'  one of the two secrets is missing, or the URL is not http(s)
--   'queued'          the request was handed to pg_net (which sends it after this commits)
-- Nobody but the superuser (pg_cron runs jobs as the role that scheduled them) may call it.
create function private.call_reminder_route() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  target_url text;
  secret text;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    return 'no_pg_net';
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    return 'no_vault';
  end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1'
    into target_url using 'learn_reminders_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1'
    into secret using 'learn_cron_secret';

  if target_url is null or target_url !~ '^https?://[^\s]+$'
     or secret is null or length(secret) < 32 then
    return 'not_configured';
  end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
    using target_url,
          '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json',
                             'Authorization', 'Bearer ' || secret),
          -- Longer than the route's maxDuration (60 s): a full run is not reported as a timeout.
          65000;
  return 'queued';
end;
$$;

revoke all on function private.call_reminder_route() from public, anon, authenticated, service_role;
