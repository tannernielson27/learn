-- The sweep of abandoned workspaces (20261012000000_workspace_sweep.sql, ADR 0012).
--
-- What is held here:
--   1. Grants: only the service role calls the sweep; nobody calls its parts.
--   2. Each rule at its edges: emptied 29 days ago against 31; made 89 days ago against 91; a
--      teacher who confirmed against one who did not; a sign-in 89 days ago against 91; a
--      sign-in session still in use; an assignment, a live session, a student in a class, a bank
--      touched lately; a student who practised, a bank shared for practice, a student taken
--      off a class. A workspace that is not self-registered matches neither rule.
--   3. A dry run reports and changes nothing, whatever the limit; `p_delete` null is a dry run.
--   4. The limit counts deletions, not skips, oldest first.
--   5. A deletion: the workspace and every row of it are gone; a student whose profile named it
--      is pointed at the workspace of a class they are in, or has no role when they are in none;
--      no student account is deleted; a never-used workspace's teacher account is; a teacher who
--      only used to be in an emptied workspace is not.
--   6. Skips: a class with a student in it; a student who could be pointed nowhere; a teacher
--      named by another workspace's rows; a deletion that raises, which is rolled back
--      whole while the workspaces after it are still deleted; and one that raises 55P03, as a
--      wait past `lock_timeout` does, which is reported 'locked'.
--
-- Not held here: two sweeps at once, or a sweep against someone joining (one transaction cannot
-- show two sessions; see "Locks" in the migration), so 'locked' and 'changed' are never answered
-- in this file.
--
-- now() does not move inside a transaction, so every age is made by writing the time.
-- Fixture ids of its own (…43xxxx).
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

create function pg_temp.u(suffix text) returns uuid
language sql immutable as $$
  select ('00000000-0000-0000-0000-00000043' || suffix)::uuid;
$$;

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- The claims outlive `reset role`. Cleared after each signed-in block.
create function pg_temp.act_as_nobody() returns void
language sql as $$ select set_config('request.jwt.claims', '{}', true); $$;

create function pg_temp.account(account uuid) returns text
language sql as $$
  select row(p.org_id, p.role)::text from public.profiles p where p.id = account;
$$;

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

-- Teachers. Unless said otherwise: never confirmed, made 100 days ago, last signed in 95 days
-- ago.
insert into auth.users
  (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, last_sign_in_at)
select pg_temp.u(v.suffix), v.suffix || '@sweep.test', 'authenticated', 'authenticated',
       v.meta::jsonb, '{}'::jsonb, now() - interval '100 days',
       now() - make_interval(days => v.signed_in_days)
  from (values
    ('1a01', '{"provider": "email", "learn_email_unconfirmed": true}', 91),
    ('1a02', '{"provider": "email", "learn_email_unconfirmed": true}', 95),
    -- Cora and the teacher of N4 confirmed their addresses: the mark is gone.
    ('1a03', '{"provider": "email"}', 95),
    ('1a04', '{"provider": "email"}', 95),
    -- Signed in 89 days ago.
    ('1a05', '{"provider": "email", "learn_email_unconfirmed": true}', 89),
    ('1a07', '{"provider": "email", "learn_email_unconfirmed": true}', 95),
    ('1a08', '{"provider": "email", "learn_email_unconfirmed": true}', 95),
    ('1a09', '{"provider": "email", "learn_email_unconfirmed": true}', 95),
    ('1a10', '{"provider": "email", "learn_email_unconfirmed": true}', 95),
    ('1a12', '{"provider": "email", "learn_email_unconfirmed": true}', 95),
    ('1a13', '{"provider": "email", "learn_email_unconfirmed": true}', 95),
    -- Mona taught in M1 and left it; a teacher still in M3; a teacher of a hand-made org.
    ('1b01', '{"provider": "email", "learn_email_unconfirmed": true}', 95),
    ('1b03', '{"provider": "email", "learn_email_unconfirmed": true}', 95),
    ('1c02', '{"provider": "email", "learn_email_unconfirmed": true}', 95)
  ) as v (suffix, meta, signed_in_days);

-- Students.
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data)
select pg_temp.u(v.suffix), v.suffix || '@sweep.test', 'authenticated', 'authenticated',
       '{"provider": "email"}'::jsonb, '{}'::jsonb
  from (values ('2001'), ('2002'), ('2003'), ('2004'), ('2005'), ('2006'), ('2007')) as v (suffix);

-- Workspaces. N*: one teacher each, for the never-used rule. M*: emptied, for the memberless
-- rule. C*: not self-registered.
create temporary table cast_orgs (label text primary key, id uuid not null unique);
insert into cast_orgs (label, id)
select v.label, pg_temp.u(v.suffix)
  from (values
    ('n1', '0a01'), ('n2', '0a02'), ('n3', '0a03'), ('n4', '0a04'), ('n5', '0a05'),
    ('n7', '0a07'),
    ('n8', '0a08'), ('n9', '0a09'), ('n10', '0a10'), ('n12', '0a12'), ('n13', '0a13'),
    ('m1', '0b01'), ('m2', '0b02'), ('m3', '0b03'), ('m4', '0b04'), ('m5', '0b05'),
    ('m6', '0b06'), ('m7', '0b07'), ('m8', '0b08'), ('m9', '0b09'),
    ('c1', '0c01'), ('c2', '0c02')
  ) as v (label, suffix);
grant select on cast_orgs to authenticated, anon, service_role;

create function pg_temp.org(org_label text) returns uuid
language sql stable as $$ select c.id from cast_orgs c where c.label = org_label; $$;

insert into public.orgs (id, name, self_registered, created_at, emptied_at)
select pg_temp.org(v.label), 'Sweep ' || v.label, v.is_open,
       now() - make_interval(days => v.made_days),
       case when v.emptied_days is not null then now() - make_interval(days => v.emptied_days) end
  from (values
    ('n1', true, 91, null),
    ('n2', true, 89, null),
    ('n3', true, 91, null),
    ('n4', true, 91, null),
    ('n5', true, 91, null),
    ('n7', true, 91, null),
    ('n8', true, 91, null),
    ('n9', true, 91, null),
    ('n10', true, 91, null),
    ('n12', true, 95, null),
    ('n13', true, 91, null),
    ('m1', true, 200, 31),
    ('m2', true, 200, 29),
    ('m3', true, 200, 31),
    ('m4', true, 200, 45),
    ('m5', true, 200, 44),
    ('m6', true, 200, 60),
    ('m7', true, 200, 50),
    ('m8', true, 200, 70),
    -- Emptied at the same moment as M1; its id sorts after M1's.
    ('m9', true, 200, 31),
    -- Not self-registered: one emptied and teacherless, one with a teacher who never confirmed.
    ('c1', false, 200, 100),
    ('c2', false, 200, null)
  ) as v (label, is_open, made_days, emptied_days);

-- Who teaches where. Mona starts in M1 and leaves it below.
update public.profiles p
   set org_id = pg_temp.org(v.label), role = 'instructor'
  from (values
    ('1a01', 'n1'), ('1a02', 'n2'), ('1a03', 'n3'), ('1a04', 'n4'), ('1a05', 'n5'),
    ('1a07', 'n7'),
    ('1a08', 'n8'), ('1a09', 'n9'), ('1a10', 'n10'), ('1a12', 'n12'), ('1a13', 'n13'),
    ('1b01', 'm1'), ('1b03', 'm3'), ('1c02', 'c2')
  ) as v (suffix, label)
 where p.id = pg_temp.u(v.suffix);
update public.orgs o
   set founder_id = p.id
  from public.profiles p
 where p.org_id = o.id and p.role = 'instructor' and o.self_registered
   and o.id in (select c.id from cast_orgs c);

-- Sign-in sessions: an old one for N1's teacher, which stops nothing, and one still in use for
-- N7's, which does.
insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at) values
  (pg_temp.u('9a01'), pg_temp.u('1a01'), now() - interval '95 days', now() - interval '95 days',
   (now() - interval '95 days') at time zone 'utc'),
  (pg_temp.u('9a07'), pg_temp.u('1a07'), now() - interval '95 days', now() - interval '1 day',
   (now() - interval '1 day') at time zone 'utc');

-- N1, never used: a bank, an item with a version, a case study with a step, an empty class and
-- a pending invitation, all untouched for 120 days.
insert into public.item_banks (id, org_id, name, created_by, created_at, updated_at) values
  (pg_temp.u('3a01'), pg_temp.org('n1'), 'N1 bank', pg_temp.u('1a01'),
   now() - interval '120 days', now() - interval '120 days');
insert into public.items
  (id, bank_id, org_id, type, status, content, answer_key, scoring, created_at, updated_at)
values
  (pg_temp.u('4a01'), pg_temp.u('3a01'), pg_temp.org('n1'), 'multiple_choice', 'draft',
   '{}', '{}', '{}', now() - interval '120 days', now() - interval '120 days');
insert into public.item_versions (item_id, version, org_id, snapshot) values
  (pg_temp.u('4a01'), 1, pg_temp.org('n1'), '{}');
insert into public.case_studies (id, bank_id, org_id, title, ehr, created_at, updated_at) values
  (pg_temp.u('5a01'), pg_temp.u('3a01'), pg_temp.org('n1'), 'N1 case', '{}',
   now() - interval '120 days', now() - interval '120 days');
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id) values
  (pg_temp.u('5a01'), pg_temp.org('n1'), pg_temp.u('3a01'), 1, pg_temp.u('4a01'));
insert into public.classes (id, org_id, name, created_at, updated_at) values
  (pg_temp.u('6a01'), pg_temp.org('n1'), 'N1 class', now() - interval '120 days',
   now() - interval '120 days');
insert into public.org_invites (id, org_id, email, token_hash, invited_by) values
  (pg_temp.u('8a01'), pg_temp.org('n1'), 'friend@sweep.test', repeat('1', 64), pg_temp.u('1a01'));

-- N3, Cora's, in use: a class with two students in it whose profiles name other workspaces.
insert into public.classes (id, org_id, name) values
  (pg_temp.u('6a03'), pg_temp.org('n3'), 'N3 class');

-- N8: an assignment, in a class nobody joined.
insert into public.item_banks (id, org_id, name, created_at, updated_at) values
  (pg_temp.u('3a08'), pg_temp.org('n8'), 'N8 bank', now() - interval '120 days',
   now() - interval '120 days');
insert into public.items
  (id, bank_id, org_id, type, status, content, answer_key, scoring, created_at, updated_at)
values
  (pg_temp.u('4a08'), pg_temp.u('3a08'), pg_temp.org('n8'), 'multiple_choice', 'published',
   '{}', '{}', '{}', now() - interval '120 days', now() - interval '120 days');
insert into public.classes (id, org_id, name, created_at, updated_at) values
  (pg_temp.u('6a08'), pg_temp.org('n8'), 'N8 class', now() - interval '120 days',
   now() - interval '120 days');
insert into public.assignments
  (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
values
  (pg_temp.u('7a08'), pg_temp.org('n8'), pg_temp.u('6a08'), pg_temp.u('3a08'), 'N8 work',
   now() - interval '1 hour', now() + interval '1 day', 1);

-- N9: a bank to run a live session from (started below, as its teacher).
insert into public.item_banks (id, org_id, name, created_at, updated_at) values
  (pg_temp.u('3a09'), pg_temp.org('n9'), 'N9 bank', now() - interval '120 days',
   now() - interval '120 days');
insert into public.items
  (id, bank_id, org_id, type, status, content, answer_key, scoring, created_at, updated_at)
values
  (pg_temp.u('4a09'), pg_temp.u('3a09'), pg_temp.org('n9'), 'multiple_choice', 'published',
   '{}', '{}', '{}', now() - interval '120 days', now() - interval '120 days');

-- N10: a class with a student in it.
insert into public.classes (id, org_id, name, created_at, updated_at) values
  (pg_temp.u('6a10'), pg_temp.org('n10'), 'N10 class', now() - interval '120 days',
   now() - interval '120 days');

-- N12: its teacher is named by a bank in Cora's workspace.
insert into public.item_banks (id, org_id, name, created_by) values
  (pg_temp.u('3a99'), pg_temp.org('n3'), 'Made by N12''s teacher', pg_temp.u('1a12'));

-- N13: a bank made today.
insert into public.item_banks (id, org_id, name) values
  (pg_temp.u('3a13'), pg_temp.org('n13'), 'N13 bank');

-- M1, emptied 31 days ago, with everything a used workspace holds.
insert into public.item_banks (id, org_id, name) values
  (pg_temp.u('3b01'), pg_temp.org('m1'), 'M1 bank');
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring) values
  (pg_temp.u('4b01'), pg_temp.u('3b01'), pg_temp.org('m1'), 'multiple_choice', 'published',
   '{}', '{}', '{}'),
  (pg_temp.u('4b02'), pg_temp.u('3b01'), pg_temp.org('m1'), 'multiple_choice', 'draft',
   '{}', '{}', '{}');
insert into public.item_versions (item_id, version, org_id, snapshot) values
  (pg_temp.u('4b01'), 1, pg_temp.org('m1'), '{}');
insert into public.case_studies (id, bank_id, org_id, title, ehr) values
  (pg_temp.u('5b01'), pg_temp.u('3b01'), pg_temp.org('m1'), 'M1 case', '{}');
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id) values
  (pg_temp.u('5b01'), pg_temp.org('m1'), pg_temp.u('3b01'), 1, pg_temp.u('4b02'));
insert into public.classes (id, org_id, name) values
  (pg_temp.u('6b01'), pg_temp.org('m1'), 'M1 class');
insert into public.assignments
  (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
values
  (pg_temp.u('7b01'), pg_temp.org('m1'), pg_temp.u('6b01'), pg_temp.u('3b01'), 'M1 work',
   now() - interval '1 hour', now() + interval '1 day', 1);
insert into public.bank_practice_shares (org_id, bank_id, class_id) values
  (pg_temp.org('m1'), pg_temp.u('3b01'), pg_temp.u('6b01'));
insert into public.org_invites (id, org_id, email, token_hash, invited_by, revoked_at) values
  (pg_temp.u('8b01'), pg_temp.org('m1'), 'late@sweep.test', repeat('2', 64), pg_temp.u('1b01'),
   now());

-- M4: a class with students in it. M8 and M9: a class whose deletion raises (the trigger
-- below).
insert into public.classes (id, org_id, name) values
  (pg_temp.u('6b04'), pg_temp.org('m4'), 'M4 class'),
  (pg_temp.u('6b08'), pg_temp.org('m8'), 'M8 class'),
  (pg_temp.u('6b09'), pg_temp.org('m9'), 'M9 class');
insert into public.item_banks (id, org_id, name) values
  (pg_temp.u('3b08'), pg_temp.org('m8'), 'M8 bank');

-- Students: which workspace each profile names, and which classes each is in.
--   2001  names M1; in Cora's class               -> pointed at N3 when M1 goes
--   2002  names M1; in no class (taken off M1's)  -> no role when M1 goes
--   2003  names M4; in M4's class                 -> M4 is never deleted
--   2004  names M5; only in M4's class, and M4 is emptied -> M5 is skipped
--   2005  names N1; in Cora's class               -> pointed at N3 when N1 goes
--   2006  names N10; in N10's class               -> N10 is not a candidate
--   2007  names M8; in no class                   -> M8's deletion is rolled back
update public.profiles p
   set org_id = pg_temp.org(v.label), role = 'student'
  from (values
    ('2001', 'm1'), ('2002', 'm1'), ('2003', 'm4'), ('2004', 'm5'), ('2005', 'n1'),
    ('2006', 'n10'), ('2007', 'm8')
  ) as v (suffix, label)
 where p.id = pg_temp.u(v.suffix);
insert into public.class_members (class_id, profile_id) values
  (pg_temp.u('6a03'), pg_temp.u('2001')),
  (pg_temp.u('6a03'), pg_temp.u('2005')),
  (pg_temp.u('6b04'), pg_temp.u('2003')),
  (pg_temp.u('6b04'), pg_temp.u('2004')),
  (pg_temp.u('6a10'), pg_temp.u('2006'));
-- 2002 was taken off M1's class, with one attempt on record.
insert into private.class_removals (class_id, profile_id) values
  (pg_temp.u('6b01'), pg_temp.u('2002'));
insert into public.assignment_attempts (org_id, assignment_id, student_id, number) values
  (pg_temp.org('m1'), pg_temp.u('7b01'), pg_temp.u('2002'), 1);

-- Live sessions, started the way the app starts them: one in N9, one in M1 by Mona.
create temporary table started (name text primary key, session_id uuid);
grant select, insert on started to authenticated;

set local role authenticated;
select pg_temp.act_as(pg_temp.u('1a09'));
insert into started (name, session_id)
  select 'n9', public.start_session(pg_temp.u('3a09'), null);
select pg_temp.act_as(pg_temp.u('1b01'));
insert into started (name, session_id)
  select 'm1', public.start_session(pg_temp.u('3b01'), null);
reset role;
select pg_temp.act_as_nobody();

-- One person in Mona's room, with one answer. `session_responses.item_id` is ON DELETE RESTRICT.
insert into public.participants (id, session_id, org_id, display_name, rejoin_hash)
  select pg_temp.u('9b01'), s.session_id, pg_temp.org('m1'), 'Guest', '\x00'::bytea
    from started s where s.name = 'm1';
insert into public.session_responses
  (session_id, org_id, participant_id, item_id, item_position, response, points, max_points, model)
  select s.session_id, pg_temp.org('m1'), pg_temp.u('9b01'), pg_temp.u('4b01'), 1, '{}', 1, 1,
         'dichotomous'
    from started s where s.name = 'm1';

-- Mona leaves M1, which is what marked it emptied.
update public.profiles set org_id = null, role = null where id = pg_temp.u('1b01');

-- M8's class cannot be deleted: a failure in the middle of one workspace's deletion. M9's
-- raises what a wait past `lock_timeout` raises (55P03), which one session cannot make happen.
create function public.sweep_test_refuse_delete() returns trigger
language plpgsql as $$
begin
  if old.id = '00000000-0000-0000-0000-000000436b09'::uuid then
    raise exception 'canceling statement due to lock timeout' using errcode = '55P03';
  end if;
  raise exception 'this class is not deleted in this test' using errcode = 'P0001';
end;
$$;
create trigger sweep_test_refuse_delete before delete on public.classes
  for each row
  when (old.id in ('00000000-0000-0000-0000-000000436b08'::uuid,
                   '00000000-0000-0000-0000-000000436b09'::uuid))
  execute function public.sweep_test_refuse_delete();

-- Every run of the sweep this file makes, in the order the rows came back.
create temporary table runs (
  seq bigint generated always as identity primary key,
  run text not null,
  org_id uuid,
  rule text,
  outcome text,
  reason text
);
grant select, insert on runs to service_role;

-- One run as words, for this file's workspaces only: "label rule outcome[ reason]".
create function pg_temp.run_rows(run_name text) returns text[]
language sql as $$
  select coalesce(
    array_agg(c.label || ' ' || r.rule || ' ' || r.outcome || coalesce(' ' || r.reason, '')
              order by r.seq),
    '{}'
  )
    from runs r
    join cast_orgs c on c.id = r.org_id
   where r.run = run_name;
$$;

-- Everything a sweep could change, as one value.
create function pg_temp.snapshot() returns text
language sql as $$
  select md5(concat_ws('|',
    (select string_agg(o.id::text || coalesce(o.emptied_at::text, '-'), ',' order by o.id)
       from public.orgs o),
    (select string_agg(p.id::text || coalesce(p.org_id::text, '-') || coalesce(p.role::text, '-'),
                       ',' order by p.id)
       from public.profiles p),
    (select count(*) from auth.users),
    (select count(*) from auth.sessions),
    (select count(*) from public.item_banks),
    (select count(*) from public.items),
    (select count(*) from public.item_versions),
    (select count(*) from public.case_studies),
    (select count(*) from public.case_study_items),
    (select count(*) from public.classes),
    (select count(*) from public.class_members),
    (select count(*) from private.class_removals),
    (select count(*) from public.assignments),
    (select count(*) from public.assignment_attempts),
    (select count(*) from public.sessions),
    (select count(*) from public.participants),
    (select count(*) from public.session_responses),
    (select count(*) from public.bank_practice_shares),
    (select count(*) from public.org_invites)
  ));
$$;

-- ---------------------------------------------------------------------------
-- 1. Grants
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege(
    'service_role', 'public.sweep_abandoned_workspaces(boolean, integer)', 'execute')
  and not has_function_privilege(
    'authenticated', 'public.sweep_abandoned_workspaces(boolean, integer)', 'execute')
  and not has_function_privilege(
    'anon', 'public.sweep_abandoned_workspaces(boolean, integer)', 'execute'),
  'only the service role may run the sweep'
);
select ok(
  not exists (
    select 1
      from (values
        ('private.workspace_sweep_rule(uuid)'),
        ('private.workspace_sweep_blocker(uuid, text)'),
        ('private.sweep_account_tied_elsewhere(uuid, uuid)'),
        ('private.sweep_one_workspace(uuid, text)'),
        ('private.call_workspace_sweep_route()')
      ) as f (signature),
      (values ('anon'), ('authenticated'), ('service_role')) as r (name)
     where has_function_privilege(r.name, f.signature, 'execute')
  ),
  'and no API role may call any of its parts, or the function pg_cron runs'
);

set local role authenticated;
select pg_temp.act_as(pg_temp.u('1a03'));
select throws_ok(
  $$ select * from public.sweep_abandoned_workspaces(true, 20) $$,
  '42501', null,
  'a signed-in teacher is refused'
);
reset role;
select pg_temp.act_as_nobody();

-- ---------------------------------------------------------------------------
-- 2. The rules, at their edges
-- ---------------------------------------------------------------------------

select is(private.workspace_sweep_rule(pg_temp.org('n1')), 'never_used',
  'never used: made 91 days ago, its teacher never confirmed and last signed in 91 days ago');
select is(private.workspace_sweep_rule(pg_temp.org('n2')), null,
  'made 89 days ago: not yet');
update public.orgs set created_at = now() - interval '91 days' where id = pg_temp.org('n2');
select is(private.workspace_sweep_rule(pg_temp.org('n2')), 'never_used',
  'the same workspace made 91 days ago: never used');

-- Still N2 at 91 days: never used by a student either. Each row is taken away again.
insert into public.item_banks (id, org_id, name, created_at, updated_at) values
  (pg_temp.u('3a02'), pg_temp.org('n2'), 'N2 bank', now() - interval '120 days',
   now() - interval '120 days');
insert into public.classes (id, org_id, name, created_at, updated_at) values
  (pg_temp.u('6a02'), pg_temp.org('n2'), 'N2 class', now() - interval '120 days',
   now() - interval '120 days');
insert into private.class_removals (class_id, profile_id, removed_at) values
  (pg_temp.u('6a02'), pg_temp.u('2002'), now() - interval '110 days');
select is(private.workspace_sweep_rule(pg_temp.org('n2')), null,
  'a student who joined a class and was taken off it used the workspace');
delete from private.class_removals where class_id = pg_temp.u('6a02');

insert into public.bank_practice_shares (id, org_id, bank_id, class_id, shared_at) values
  (pg_temp.u('aa02'), pg_temp.org('n2'), pg_temp.u('3a02'), pg_temp.u('6a02'),
   now() - interval '110 days');
select is(private.workspace_sweep_rule(pg_temp.org('n2')), null,
  'a bank shared with a class for practice is use');
delete from public.bank_practice_shares where id = pg_temp.u('aa02');

insert into public.practice_runs (id, org_id, student_id, bank_id, started_at) values
  (pg_temp.u('ab02'), pg_temp.org('n2'), pg_temp.u('2002'), pg_temp.u('3a02'),
   now() - interval '110 days');
select is(private.workspace_sweep_rule(pg_temp.org('n2')), null,
  'a student''s practice run is use, however long ago and whether or not they are in a class now');
delete from public.practice_runs where id = pg_temp.u('ab02');
delete from public.classes where id = pg_temp.u('6a02');
delete from public.item_banks where id = pg_temp.u('3a02');

update public.orgs set created_at = now() - interval '89 days' where id = pg_temp.org('n2');

select is(private.workspace_sweep_rule(pg_temp.org('n4')), null,
  'a teacher who confirmed their address: not never used');
update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"learn_email_unconfirmed": true}'::jsonb
 where id = pg_temp.u('1a04');
select is(private.workspace_sweep_rule(pg_temp.org('n4')), 'never_used',
  'the same teacher still carrying the mark: never used');
update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"learn_email_unconfirmed": "true"}'::jsonb
 where id = pg_temp.u('1a04');
select is(private.workspace_sweep_rule(pg_temp.org('n4')), null,
  'the mark is the boolean the app writes, not a word that looks like it');
update auth.users
   set raw_app_meta_data = raw_app_meta_data - 'learn_email_unconfirmed'
 where id = pg_temp.u('1a04');

select is(private.workspace_sweep_rule(pg_temp.org('n5')), null,
  'a teacher who signed in 89 days ago: not never used');
update auth.users set last_sign_in_at = now() - interval '91 days' where id = pg_temp.u('1a05');
select is(private.workspace_sweep_rule(pg_temp.org('n5')), 'never_used',
  'the same teacher last seen 91 days ago: never used');
update public.profiles set role = 'admin' where id = pg_temp.u('1a05');
select is(private.workspace_sweep_rule(pg_temp.org('n5')), null,
  'an admin, who is only ever made by hand, is not an abandoned sign-up');
update public.profiles set role = 'instructor' where id = pg_temp.u('1a05');
update auth.users set last_sign_in_at = now() - interval '89 days' where id = pg_temp.u('1a05');

select is(private.workspace_sweep_rule(pg_temp.org('n7')), null,
  'a sign-in session refreshed yesterday counts as signed in, however old the sign-in');
select is(private.workspace_sweep_rule(pg_temp.org('n8')), null,
  'a workspace with an assignment was used');
select is(private.workspace_sweep_rule(pg_temp.org('n9')), null,
  'a workspace that ran a live session was used');
select is(private.workspace_sweep_rule(pg_temp.org('n10')), null,
  'a workspace with a student in a class was used');
select is(private.workspace_sweep_rule(pg_temp.org('n13')), null,
  'a workspace with a bank made today is not abandoned');

select is(private.workspace_sweep_rule(pg_temp.org('m1')), 'memberless',
  'memberless: emptied 31 days ago and nobody teaches in it');
select is(private.workspace_sweep_rule(pg_temp.org('m2')), null,
  'emptied 29 days ago: not yet');
update public.orgs set emptied_at = now() - interval '31 days' where id = pg_temp.org('m2');
select is(private.workspace_sweep_rule(pg_temp.org('m2')), 'memberless',
  'the same workspace emptied 31 days ago: memberless');
update public.orgs set emptied_at = now() - interval '29 days' where id = pg_temp.org('m2');
select is(private.workspace_sweep_rule(pg_temp.org('m3')), null,
  'a workspace marked emptied that has a teacher again matches neither rule');

select is(private.workspace_sweep_rule(pg_temp.org('c1')), null,
  'a workspace that is not self-registered is never memberless, however long it has been empty');
select is(private.workspace_sweep_rule(pg_temp.org('c2')), null,
  'nor never used, whoever teaches in it');

-- ---------------------------------------------------------------------------
-- 3. A dry run
-- ---------------------------------------------------------------------------

create temporary table before_dry as select pg_temp.snapshot() as snapshot;

set local role service_role;
insert into runs (run, org_id, rule, outcome, reason)
  select 'dry', s.* from public.sweep_abandoned_workspaces(false, 20) as s;
insert into runs (run, org_id, rule, outcome, reason)
  select 'dry-null', s.* from public.sweep_abandoned_workspaces(null, 20) as s;
insert into runs (run, org_id, rule, outcome, reason)
  select 'dry-default', s.* from public.sweep_abandoned_workspaces() as s;
insert into runs (run, org_id, rule, outcome, reason)
  select 'dry-2', s.* from public.sweep_abandoned_workspaces(false, 2) as s;
insert into runs (run, org_id, rule, outcome, reason)
  select 'dry-4', s.* from public.sweep_abandoned_workspaces(false, 4) as s;
insert into runs (run, org_id, rule, outcome, reason)
  select 'dry-0', s.* from public.sweep_abandoned_workspaces(false, 0) as s;
insert into runs (run, org_id, rule, outcome, reason)
  select 'dry-null-limit', s.* from public.sweep_abandoned_workspaces(false, null) as s;
reset role;

select is(
  pg_temp.run_rows('dry'),
  array[
    'm8 memberless would_delete',
    'm6 memberless would_delete',
    'm7 memberless would_delete',
    'm4 memberless skipped enrolled_students',
    'm5 memberless skipped student_unsafe',
    'm1 memberless would_delete',
    'm9 memberless would_delete',
    'n12 never_used skipped teacher_tied_elsewhere',
    'n1 never_used would_delete'
  ],
  'a dry run names each candidate, its rule and what would happen, oldest first'
);
select is(
  (select snapshot from before_dry),
  pg_temp.snapshot(),
  'and changes nothing: no workspace, profile, account or row'
);
select is(pg_temp.run_rows('dry-null'), pg_temp.run_rows('dry'),
  'p_delete null is a dry run');
select is(pg_temp.run_rows('dry-default'), pg_temp.run_rows('dry'),
  'and so is a call with no arguments');
select is(
  (select count(*)::int from runs r where r.outcome = 'deleted'),
  0,
  'no dry run answered deleted'
);

-- ---------------------------------------------------------------------------
-- 4. The limit
-- ---------------------------------------------------------------------------

select is(
  pg_temp.run_rows('dry-2'),
  array['m8 memberless would_delete', 'm6 memberless would_delete'],
  'a limit of 2 stops after the two oldest'
);
select is(
  pg_temp.run_rows('dry-4'),
  array[
    'm8 memberless would_delete',
    'm6 memberless would_delete',
    'm7 memberless would_delete',
    'm4 memberless skipped enrolled_students',
    'm5 memberless skipped student_unsafe',
    'm1 memberless would_delete'
  ],
  'a skipped workspace does not count against the limit, so it holds up nothing behind it'
);
select is(
  (select count(*)::int from runs r where r.run = 'dry-0'),
  0,
  'a limit of 0 looks at nothing'
);
select is(pg_temp.run_rows('dry-null-limit'), pg_temp.run_rows('dry'),
  'a null limit is the default of 20');

-- ---------------------------------------------------------------------------
-- 5. Deleting, one at a time: a failure is rolled back and the next one still goes
-- ---------------------------------------------------------------------------

set local role service_role;
insert into runs (run, org_id, rule, outcome, reason)
  select 'delete-1', s.* from public.sweep_abandoned_workspaces(true, 1) as s;
reset role;

select is(
  pg_temp.run_rows('delete-1'),
  array['m8 memberless skipped error_P0001', 'm6 memberless deleted'],
  'a deletion that raises is skipped with its SQLSTATE, and the next workspace is deleted'
);
select ok(
  exists (select 1 from public.orgs o where o.id = pg_temp.org('m8'))
  and exists (select 1 from public.item_banks b where b.id = pg_temp.u('3b08'))
  and exists (select 1 from public.classes c where c.id = pg_temp.u('6b08'))
  and pg_temp.account(pg_temp.u('2007'))
      = row(pg_temp.org('m8'), 'student'::public.org_role)::text,
  'the failed deletion left its workspace whole: its bank, its class, and its student''s profile'
);
select ok(
  not exists (select 1 from public.orgs o where o.id = pg_temp.org('m6'))
  and exists (select 1 from public.orgs o where o.id = pg_temp.org('m7')),
  'a limit of 1 deleted one workspace and left the next'
);

-- ---------------------------------------------------------------------------
-- 6. Deleting the rest
-- ---------------------------------------------------------------------------

set local role service_role;
insert into runs (run, org_id, rule, outcome, reason)
  select 'delete', s.* from public.sweep_abandoned_workspaces(true, 20) as s;
reset role;

select is(
  pg_temp.run_rows('delete'),
  array[
    'm8 memberless skipped error_P0001',
    'm7 memberless deleted',
    'm4 memberless skipped enrolled_students',
    'm5 memberless skipped student_unsafe',
    'm1 memberless deleted',
    'm9 memberless skipped locked',
    'n12 never_used skipped teacher_tied_elsewhere',
    'n1 never_used deleted'
  ],
  'a deleting run deletes what the dry run said it would and skips what it said it would; a write that gives up waiting for a lock (55P03) is reported locked'
);
select is(
  (select array_agg(c.label order by c.label)
     from cast_orgs c where not exists (select 1 from public.orgs o where o.id = c.id)),
  array['m1', 'm6', 'm7', 'n1'],
  'exactly those workspaces are gone, and no other of this file''s'
);

-- M1: every row of it.
select is(
  (select count(*) from public.item_banks x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.items x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.item_versions x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.case_studies x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.case_study_items x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.classes x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.assignments x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.assignment_attempts x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.bank_practice_shares x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.sessions x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.participants x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.session_responses x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from public.org_invites x where x.org_id = pg_temp.org('m1'))
  + (select count(*) from private.class_removals x where x.class_id = pg_temp.u('6b01')),
  0::bigint,
  'a used workspace goes with its banks, items, versions, case studies, classes, assignments, attempts, shares, sessions, participants, answers, invitations and removal records'
);
select is(
  pg_temp.account(pg_temp.u('2001')),
  row(pg_temp.org('n3'), 'student'::public.org_role)::text,
  'a student whose profile named it is pointed at the workspace of a class they are in'
);
select is(
  pg_temp.account(pg_temp.u('2002')),
  row(null::uuid, null::public.org_role)::text,
  'a student in no class anywhere has no role and no workspace, as before they joined one'
);
select is(
  (select count(*)::int from public.class_members m where m.class_id = pg_temp.u('6a03')),
  2,
  'the class those students are in still has them'
);
select ok(
  exists (select 1 from auth.users u where u.id = pg_temp.u('1b01'))
  and pg_temp.account(pg_temp.u('1b01')) = row(null::uuid, null::public.org_role)::text,
  'the teacher who left a memberless workspace keeps their account'
);

-- N1: the workspace and the account that never confirmed.
select is(
  (select count(*) from public.item_banks x where x.org_id = pg_temp.org('n1'))
  + (select count(*) from public.items x where x.org_id = pg_temp.org('n1'))
  + (select count(*) from public.item_versions x where x.org_id = pg_temp.org('n1'))
  + (select count(*) from public.case_studies x where x.org_id = pg_temp.org('n1'))
  + (select count(*) from public.case_study_items x where x.org_id = pg_temp.org('n1'))
  + (select count(*) from public.classes x where x.org_id = pg_temp.org('n1'))
  + (select count(*) from public.org_invites x where x.org_id = pg_temp.org('n1')),
  0::bigint,
  'a never-used workspace goes with its bank, item, version, case study, class and invitation'
);
select ok(
  not exists (select 1 from auth.users u where u.id = pg_temp.u('1a01'))
  and not exists (select 1 from public.profiles p where p.id = pg_temp.u('1a01'))
  and not exists (select 1 from auth.sessions s where s.user_id = pg_temp.u('1a01')),
  'and with its teacher''s account, profile and sign-in sessions'
);
select is(
  pg_temp.account(pg_temp.u('2005')),
  row(pg_temp.org('n3'), 'student'::public.org_role)::text,
  'a student whose profile named a never-used workspace is pointed at their class''s'
);

-- Nobody else.
select is(
  (select count(*)::int from auth.users u
    where u.id in (pg_temp.u('2001'), pg_temp.u('2002'), pg_temp.u('2003'), pg_temp.u('2004'),
                   pg_temp.u('2005'), pg_temp.u('2006'), pg_temp.u('2007'))),
  7,
  'no student account was deleted'
);
select is(
  (select count(*)::int from auth.users u where u.id::text like '00000000-0000-0000-0000-000000431%'),
  13,
  'and of fourteen teacher accounts only the never-used workspace''s is gone'
);
select is(
  pg_temp.account(pg_temp.u('1a12')),
  row(pg_temp.org('n12'), 'instructor'::public.org_role)::text,
  'a teacher named by another workspace''s bank is where they were'
);
select ok(
  (select b.created_by = pg_temp.u('1a12') from public.item_banks b where b.id = pg_temp.u('3a99')),
  'and that bank still names them'
);
select is(
  array[pg_temp.account(pg_temp.u('2003')), pg_temp.account(pg_temp.u('2004')),
        pg_temp.account(pg_temp.u('2006'))],
  array[row(pg_temp.org('m4'), 'student'::public.org_role)::text,
        row(pg_temp.org('m5'), 'student'::public.org_role)::text,
        row(pg_temp.org('n10'), 'student'::public.org_role)::text],
  'the students of the skipped workspaces are where they were'
);
select ok(
  (select o.emptied_at is not null from public.orgs o where o.id = pg_temp.org('c1'))
  and pg_temp.account(pg_temp.u('1c02'))
      = row(pg_temp.org('c2'), 'instructor'::public.org_role)::text,
  'the workspaces that are not self-registered are untouched, and so is the teacher of one'
);
select is(
  (select count(*)::int from public.profiles p
    where p.id::text like '00000000-0000-0000-0000-00000043%'
      and ((p.org_id is null) <> (p.role is null))),
  0,
  'no account was left with a role and no workspace, or the reverse'
);

-- ---------------------------------------------------------------------------
-- 7. Running it again
-- ---------------------------------------------------------------------------

set local role service_role;
insert into runs (run, org_id, rule, outcome, reason)
  select 'again', s.* from public.sweep_abandoned_workspaces(true, 20) as s;
reset role;

select is(
  pg_temp.run_rows('again'),
  array[
    'm8 memberless skipped error_P0001',
    'm4 memberless skipped enrolled_students',
    'm5 memberless skipped student_unsafe',
    'm9 memberless skipped locked',
    'n12 never_used skipped teacher_tied_elsewhere'
  ],
  'a second run finds nothing more to delete and skips the same workspaces for the same reasons'
);

-- A workspace that stops being skipped is deleted by the next run: M4's students leave its class.
delete from public.class_members where class_id = pg_temp.u('6b04');
set local role service_role;
insert into runs (run, org_id, rule, outcome, reason)
  select 'after-leaving', s.* from public.sweep_abandoned_workspaces(true, 20) as s;
reset role;

select is(
  pg_temp.run_rows('after-leaving'),
  array[
    'm8 memberless skipped error_P0001',
    'm4 memberless deleted',
    'm5 memberless deleted',
    'm9 memberless skipped locked',
    'n12 never_used skipped teacher_tied_elsewhere'
  ],
  'once nobody is in its class a memberless workspace goes, and so does the one that waited on it'
);
select is(
  array[pg_temp.account(pg_temp.u('2003')), pg_temp.account(pg_temp.u('2004'))],
  array[row(null::uuid, null::public.org_role)::text, row(null::uuid, null::public.org_role)::text],
  'and both students, now in no class, have no role'
);

-- N12's teacher stops being named elsewhere: the bank in Cora's workspace is deleted.
delete from public.item_banks where id = pg_temp.u('3a99');
select is(private.workspace_sweep_blocker(pg_temp.org('n12'), 'never_used'), null,
  'a teacher no other workspace names no longer stops the deletion');
select is(private.sweep_account_tied_elsewhere(pg_temp.u('1a03'), pg_temp.org('n3')), false,
  'what a teacher made in their own workspace does not tie them elsewhere');
select is(private.sweep_account_tied_elsewhere(pg_temp.u('1b01'), pg_temp.org('n3')), false,
  'and neither does a session that went with its workspace');
select is(private.sweep_account_tied_elsewhere(pg_temp.u('1a09'), pg_temp.org('n3')), true,
  'a session hosted in another workspace does');

-- ---------------------------------------------------------------------------
-- 8. The function pg_cron runs
-- ---------------------------------------------------------------------------

select ok(
  private.call_workspace_sweep_route() in ('no_pg_net', 'no_vault', 'not_configured'),
  'without pg_net or the Vault secrets, the cron function does nothing and raises nothing'
);

select * from finish();
rollback;
