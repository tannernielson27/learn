-- Reminder emails (#212): who is owed which email, once, and nothing stale.
--
-- The enqueue adds an `opened` row for every current member when an assignment opens and a
-- `closing_soon` row a day before it closes for members with nothing submitted; running it twice
-- adds nothing. A deleted assignment takes its rows with it and enqueues nothing. A student taken
-- off the class gets nothing, and a pending row that stopped being owed is dropped at the claim.
-- Only the service role may call any of it. now() is fixed for the transaction, so "earlier" is
-- made by moving created_at (and, once, closes_at) with triggers off, as the superuser.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002120a1', 'remind-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002120d1', 'remind-ada@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002120d2', 'remind-grace@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002120d3', 'remind-removed@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002120d4', 'remind-hal@example.test', 'authenticated', 'authenticated');

select private.make_instructor('remind-teacher@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002120a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002120d1', '00000000-0000-0000-0000-0000002120d2',
              '00000000-0000-0000-0000-0000002120d3', '00000000-0000-0000-0000-0000002120d4');

insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000002120c1', org_id, 'NUR 320'
    from public.profiles where id = '00000000-0000-0000-0000-0000002120a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002120c1', '00000000-0000-0000-0000-0000002120d1'),
  ('00000000-0000-0000-0000-0000002120c1', '00000000-0000-0000-0000-0000002120d2'),
  ('00000000-0000-0000-0000-0000002120c1', '00000000-0000-0000-0000-0000002120d3'),
  ('00000000-0000-0000-0000-0000002120c1', '00000000-0000-0000-0000-0000002120d4');
-- Taken off the class before anything opened.
delete from public.class_members where profile_id = '00000000-0000-0000-0000-0000002120d3';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000002120e0', org_id, 'Renal bank'
    from public.profiles where id = '00000000-0000-0000-0000-0000002120a1';
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000002120f1', '00000000-0000-0000-0000-0000002120e0', org_id,
         'multiple_choice', 1, 'published', '{}', '{"correctOptionId":"a"}', '{}'
    from public.profiles where id = '00000000-0000-0000-0000-0000002120a1';

--   b1 Week 5   opened an hour ago, closes in 25 hours: "is open" now, "closes" not yet.
--   b2 Week 6   opened two days ago, closes in 20 hours, created three days ago: "closes" only.
--   b3 Short    opened 5 hours ago, closes in 20 hours, created just now: "is open" only.
--   b4 Future   opens tomorrow: nothing.
--   b5 Doomed   opened half an hour ago: "is open", then deleted.
--   b6 Late     created two days before a close 20 hours away, but opened only 2 hours ago:
--               "is open" only, since its window is shorter than a day.
insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at)
  select v.id::uuid, p.org_id, '00000000-0000-0000-0000-0000002120c1',
         '00000000-0000-0000-0000-0000002120e0', v.title, now() + v.opens::interval,
         now() + v.closes::interval
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002120b1', 'Week 5', '-1 hour', '25 hours'),
                 ('00000000-0000-0000-0000-0000002120b2', 'Week 6', '-2 days', '20 hours'),
                 ('00000000-0000-0000-0000-0000002120b3', 'Short', '-5 hours', '20 hours'),
                 ('00000000-0000-0000-0000-0000002120b4', 'Future', '1 day', '3 days'),
                 ('00000000-0000-0000-0000-0000002120b5', 'Doomed', '-30 minutes', '2 days'),
                 ('00000000-0000-0000-0000-0000002120b6', 'Late', '-2 hours', '20 hours'))
           as v(id, title, opens, closes)
   where p.id = '00000000-0000-0000-0000-0000002120a1';

set local session_replication_role = replica;
update public.assignments set created_at = now() - interval '3 days'
 where id = '00000000-0000-0000-0000-0000002120b2';
update public.assignments set created_at = now() - interval '2 days'
 where id = '00000000-0000-0000-0000-0000002120b6';
set local session_replication_role = origin;

-- Ada has submitted Week 6 already; Hal has one open (not submitted) attempt at it.
insert into public.assignment_attempts
  (org_id, assignment_id, student_id, number, submitted_at, score, max_score)
  select a.org_id, a.id, v.student::uuid, 1, v.submitted::timestamptz, v.score, v.max_score
    from public.assignments a,
         (values ('00000000-0000-0000-0000-0000002120d1', now()::text, 1, 1),
                 ('00000000-0000-0000-0000-0000002120d4', null, null, null))
           as v(student, submitted, score, max_score)
   where a.id = '00000000-0000-0000-0000-0000002120b2';

create temporary table claimed (
  outbox_id uuid, assignment_id uuid, student_id uuid, kind text, email text, title text,
  closes_at timestamptz, time_zone text, tries smallint
);
grant all on claimed to service_role;

create function pg_temp.outbox(target_kind text) returns text
language sql as $$
  select coalesce(string_agg(a.title || ':' || split_part(u.email::text, '@', 1), ','
                             order by a.title, u.email), '')
    from private.email_outbox o
    join public.assignments a on a.id = o.assignment_id
    join auth.users u on u.id = o.student_id
   where o.kind = target_kind;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the service role, and nobody else
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'public.enqueue_assignment_reminders()', 'execute')
  and not has_function_privilege('anon', 'public.enqueue_assignment_reminders()', 'execute'),
  'a signed-in user cannot enqueue reminders, nor can anon'
);
select ok(
  has_function_privilege('service_role', 'public.enqueue_assignment_reminders()', 'execute'),
  'the service role can'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_assignment_reminders(integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.claim_assignment_reminders(integer, integer)', 'execute')
  and has_function_privilege('service_role', 'public.claim_assignment_reminders(integer, integer)', 'execute'),
  'only the service role claims a batch, which carries addresses'
);
select ok(
  not has_function_privilege('authenticated', 'public.complete_assignment_reminder(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.fail_assignment_reminder(uuid, text, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.release_assignment_reminders(uuid[], integer)', 'execute')
  and not has_function_privilege('anon', 'public.complete_assignment_reminder(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.fail_assignment_reminder(uuid, text, integer)', 'execute')
  and not has_function_privilege('anon', 'public.release_assignment_reminders(uuid[], integer)', 'execute'),
  'nor records an outcome'
);
select ok(
  has_function_privilege('service_role', 'public.complete_assignment_reminder(uuid, text)', 'execute')
  and has_function_privilege('service_role', 'public.fail_assignment_reminder(uuid, text, integer)', 'execute')
  and has_function_privilege('service_role', 'public.release_assignment_reminders(uuid[], integer)', 'execute'),
  'which the service role does'
);
select ok(
  not has_table_privilege('authenticated', 'private.email_outbox', 'select')
  and not has_table_privilege('service_role', 'private.email_outbox', 'select')
  and not has_table_privilege('service_role', 'private.email_outbox', 'insert'),
  'nobody reads or writes the outbox table directly'
);
select ok(
  not has_function_privilege('service_role', 'private.call_reminder_route()', 'execute')
  and not has_function_privilege('authenticated', 'private.call_reminder_route()', 'execute'),
  'and only the superuser (pg_cron) calls the route from the database'
);

-- ---------------------------------------------------------------------------
-- Enqueue
-- ---------------------------------------------------------------------------

set local role service_role;
select is(
  (select row(opened, closing_soon)::text from public.enqueue_assignment_reminders()),
  row(12, 2)::text,
  'the first run adds an opened row per member of four open assignments, and two closing_soon'
);
select is(
  (select row(opened, closing_soon)::text from public.enqueue_assignment_reminders()),
  row(0, 0)::text,
  'running it again adds nothing'
);
reset role;

select is(
  (select count(*)::integer from private.email_outbox
    where assignment_id between '00000000-0000-0000-0000-0000002120b1'
                            and '00000000-0000-0000-0000-0000002120b6'),
  14,
  'fourteen rows in all, with no duplicate'
);
select is(
  pg_temp.outbox('opened'),
  'Doomed:remind-ada,Doomed:remind-grace,Doomed:remind-hal,Late:remind-ada,Late:remind-grace,Late:remind-hal,'
  || 'Short:remind-ada,Short:remind-grace,Short:remind-hal,Week 5:remind-ada,Week 5:remind-grace,Week 5:remind-hal',
  'opened: every current member of what opened within the day; not Week 6 (opened two days ago), not Future'
);
select is(
  pg_temp.outbox('closing_soon'),
  'Week 6:remind-grace,Week 6:remind-hal',
  'closing_soon: Week 6 only, and not Ada, who has submitted (Hal''s open attempt does not count)'
);
select is(
  (select count(*)::integer from private.email_outbox
    where student_id = '00000000-0000-0000-0000-0000002120d3'),
  0,
  'a student taken off the class gets nothing'
);
select is(
  (select count(*)::integer from private.email_outbox
    where student_id = '00000000-0000-0000-0000-0000002120a1'),
  0,
  'nor does the instructor, who is not a member'
);
select is(
  (select count(*)::integer from private.email_outbox
    where assignment_id = '00000000-0000-0000-0000-0000002120b3' and kind = 'closing_soon'),
  0,
  'an assignment created less than a day before it closes gets no closing_soon'
);
select is(
  (select count(*)::integer from private.email_outbox
    where assignment_id = '00000000-0000-0000-0000-0000002120b6' and kind = 'closing_soon'),
  0,
  'nor does one whose window is shorter than a day, however early it was created'
);
select is(
  (select count(*)::integer from private.email_outbox where status = 'pending' and tries = 0
     and next_attempt_at <= now() and claimed_until is null
     and student_id::text like '00000000-0000-0000-0000-0000002120d%'),
  14,
  'every new row is pending, untried and due now'
);

-- ---------------------------------------------------------------------------
-- A deleted assignment
-- ---------------------------------------------------------------------------

delete from public.assignments where id = '00000000-0000-0000-0000-0000002120b5';
select is(
  (select count(*)::integer from private.email_outbox
    where assignment_id = '00000000-0000-0000-0000-0000002120b5'),
  0,
  'deleting an assignment deletes its pending reminders'
);
set local role service_role;
select is(
  (select row(opened, closing_soon)::text from public.enqueue_assignment_reminders()),
  row(0, 0)::text,
  'and a deleted assignment enqueues nothing'
);
reset role;

-- ---------------------------------------------------------------------------
-- A class's time zone
-- ---------------------------------------------------------------------------

select is(
  (select time_zone from public.classes where id = '00000000-0000-0000-0000-0000002120c1'),
  'America/Denver',
  'a class is on America/Denver unless someone changes it'
);
select lives_ok(
  $$update public.classes set time_zone = 'Europe/London'
     where id = '00000000-0000-0000-0000-0000002120c1'$$,
  'a real IANA zone is accepted'
);
select throws_ok(
  $$update public.classes set time_zone = 'Mars/Olympus_Mons'
     where id = '00000000-0000-0000-0000-0000002120c1'$$,
  '23514', null,
  'a zone Postgres does not know is refused'
);
select ok(
  not has_column_privilege('authenticated', 'public.classes', 'time_zone', 'update'),
  'and no client can write it yet'
);

-- ---------------------------------------------------------------------------
-- Staleness, checked at the claim
-- ---------------------------------------------------------------------------

-- Grace leaves the class; Week 6's close moves three days out.
delete from public.class_members where profile_id = '00000000-0000-0000-0000-0000002120d2';
set local session_replication_role = replica;
update public.assignments set closes_at = now() + interval '3 days'
 where id = '00000000-0000-0000-0000-0000002120b2';
set local session_replication_role = origin;

set local role service_role;
insert into claimed select * from public.claim_assignment_reminders(50, 300);
reset role;

select is(
  (select string_agg(title || ':' || kind || ':' || split_part(email, '@', 1), ','
                     order by title, email)
     from claimed),
  'Late:opened:remind-ada,Late:opened:remind-hal,Short:opened:remind-ada,Short:opened:remind-hal,'
  || 'Week 5:opened:remind-ada,Week 5:opened:remind-hal',
  'the claim hands over what is still owed, with the address and the live title'
);
select is(
  (select count(*)::integer from private.email_outbox
    where student_id = '00000000-0000-0000-0000-0000002120d2'),
  0,
  'a student who left the class after the enqueue loses their pending rows'
);
select is(
  (select count(*)::integer from private.email_outbox
    where assignment_id = '00000000-0000-0000-0000-0000002120b2'),
  0,
  'a closing_soon whose close moved more than a day away is dropped rather than sent stale'
);
select is(
  (select row(bool_and(c.time_zone = 'Europe/London'), bool_and(c.tries = 1),
              bool_and(c.closes_at = a.closes_at))::text
     from claimed c join public.assignments a on a.id = c.assignment_id),
  row(true, true, true)::text,
  'each claimed row carries the class''s zone and the live close time, and counts one try'
);
select is(
  (select count(*)::integer from private.email_outbox
    where claimed_until > now() and status = 'pending'),
  6,
  'every claimed row is leased'
);

set local role service_role;
select is(
  (select count(*)::integer from public.claim_assignment_reminders(50, 300)),
  0,
  'so a second run racing the first claims nothing'
);
select is(
  (select row(opened, closing_soon)::text from public.enqueue_assignment_reminders()),
  row(0, 0)::text,
  'and the enqueue does not bring back what was dropped while it is not owed'
);
reset role;

-- ---------------------------------------------------------------------------
-- Outcomes
-- ---------------------------------------------------------------------------

create temporary table picked as
  select row_number() over (order by title, email) as n, outbox_id from claimed;
grant select on picked to service_role;

set local role service_role;
select ok(
  public.complete_assignment_reminder((select outbox_id from picked where n = 1), 'msg_1'),
  'a sent reminder is marked sent'
);
select ok(
  not public.complete_assignment_reminder((select outbox_id from picked where n = 1), 'msg_1'),
  'and marking it again changes nothing'
);
select is(
  public.fail_assignment_reminder((select outbox_id from picked where n = 2), 'rate_limited', 600),
  'retrying',
  'a retryable failure is scheduled again'
);
select is(
  public.fail_assignment_reminder((select outbox_id from picked where n = 3), 'rejected', null),
  'failed',
  'a failure retrying cannot fix is given up at once'
);
select is(
  public.release_assignment_reminders(array[(select outbox_id from picked where n = 4)], 0),
  1,
  'a claimed row can be handed back untried'
);
reset role;

select is(
  (select row(o.status, o.sent_at = now(), o.provider_id, o.claimed_until)::text
     from private.email_outbox o where o.id = (select outbox_id from picked where n = 1)),
  row('sent', true, 'msg_1', null::timestamptz)::text,
  'the sent row records when and Resend''s id'
);
select is(
  (select row(o.status, o.next_attempt_at = now() + interval '600 seconds', o.last_error, o.claimed_until)::text
     from private.email_outbox o where o.id = (select outbox_id from picked where n = 2)),
  row('pending', true, 'rate_limited', null::timestamptz)::text,
  'the retry waits as long as it was told, and records only the kind of error'
);
select is(
  (select row(o.status, o.last_error)::text
     from private.email_outbox o where o.id = (select outbox_id from picked where n = 3)),
  row('failed', 'rejected')::text,
  'the given-up row stays, so it is never enqueued again'
);
select is(
  (select row(o.tries, o.claimed_until)::text
     from private.email_outbox o where o.id = (select outbox_id from picked where n = 4)),
  row(0, null::timestamptz)::text,
  'the handed-back row gets its try back'
);

-- A row that has used every try: the next failure gives up, whatever it asks for, and a claim
-- gives up on one left pending that way rather than trying a sixth time.
update private.email_outbox set tries = 5
 where id in ((select outbox_id from picked where n = 5), (select outbox_id from picked where n = 4));
set local role service_role;
select is(
  public.fail_assignment_reminder((select outbox_id from picked where n = 5), 'unavailable', 600),
  'failed',
  'the fifth failure gives up even when it asks to retry'
);
select is(
  (select count(*)::integer from public.claim_assignment_reminders(50, 300)
    where outbox_id = (select outbox_id from picked where n = 4)),
  0,
  'and a claim will not take a row that has used every try'
);
reset role;
select is(
  (select row(o.status, o.last_error)::text
     from private.email_outbox o where o.id = (select outbox_id from picked where n = 4)),
  row('failed', 'gave_up')::text,
  'it marks it given up instead'
);

-- ---------------------------------------------------------------------------
-- The pg_cron entry point, on a project that is not set up
-- ---------------------------------------------------------------------------

select ok(
  private.call_reminder_route() in ('no_pg_net', 'no_vault', 'not_configured'),
  'without pg_net or the Vault secrets, the cron function does nothing and raises nothing'
);

select * from finish();
rollback;
