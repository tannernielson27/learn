-- A class's progress (20261025000000_class_progress.sql): public.class_progress and
-- public.class_progress_steps answer only an author of the class's own workspace, list every
-- current member and every removed student who left something behind, never list a guest of a
-- class live session, and withhold an assignment's scores until it closes. Runs with
-- `pnpm test:db`. Uses its own fixture ids so it never counts the seed's rows.
--
-- Every call of a function that writes is made with scalar subqueries as its arguments rather
-- than through a LATERAL join, for the reason session_participants.test.sql gives.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  -- T teaches in workspace A, U in workspace B.
  ('00000000-0000-0000-0000-0000c1a50a01', 'progress-t@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000c1a50b01', 'progress-u@example.test', 'authenticated', 'authenticated'),
  -- M and G are members of class C. M attends; G never does. R attended and was taken off the
  -- class; Q was taken off it having done nothing. K is a student of workspace A in no class of
  -- it. Z has no role at all.
  ('00000000-0000-0000-0000-0000c1a50d01', 'progress-m@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000c1a50d02', 'progress-g@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000c1a50d03', 'progress-r@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000c1a50d04', 'progress-q@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000c1a50d05', 'progress-k@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000c1a50d06', 'progress-z@example.test', 'authenticated', 'authenticated');

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000c1a500a0', 'Progress A'),
  ('00000000-0000-0000-0000-0000c1a500b0', 'Progress B');

update public.profiles set org_id = '00000000-0000-0000-0000-0000c1a500a0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000c1a50a01';
update public.profiles set org_id = '00000000-0000-0000-0000-0000c1a500b0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000c1a50b01';
update public.profiles set org_id = '00000000-0000-0000-0000-0000c1a500a0', role = 'student'
 where id in ('00000000-0000-0000-0000-0000c1a50d01', '00000000-0000-0000-0000-0000c1a50d02',
              '00000000-0000-0000-0000-0000c1a50d03', '00000000-0000-0000-0000-0000c1a50d04',
              '00000000-0000-0000-0000-0000c1a50d05');
update public.profiles set display_name = 'Mia' where id = '00000000-0000-0000-0000-0000c1a50d01';

insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-0000c1a500e0', '00000000-0000-0000-0000-0000c1a500a0', 'Progress bank');
-- Two questions, one at step 1 and one at step 2.
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring) values
  ('00000000-0000-0000-0000-0000c1a500e1', '00000000-0000-0000-0000-0000c1a500e0',
   '00000000-0000-0000-0000-0000c1a500a0', 'multiple_choice', 1, 'published', '{}', '{}', '{}'),
  ('00000000-0000-0000-0000-0000c1a500e2', '00000000-0000-0000-0000-0000c1a500e0',
   '00000000-0000-0000-0000-0000c1a500a0', 'multiple_choice', 2, 'published', '{}', '{}', '{}');

insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-0000c1a50ca1', '00000000-0000-0000-0000-0000c1a500a0', 'NUR 330');

insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000c1a50ca1', '00000000-0000-0000-0000-0000c1a50d01'),
  ('00000000-0000-0000-0000-0000c1a50ca1', '00000000-0000-0000-0000-0000c1a50d02'),
  ('00000000-0000-0000-0000-0000c1a50ca1', '00000000-0000-0000-0000-0000c1a50d03'),
  ('00000000-0000-0000-0000-0000c1a50ca1', '00000000-0000-0000-0000-0000c1a50d04');

create temporary table fixture (label text primary key, id uuid);
grant select, insert, update on fixture to anon, authenticated, service_role;

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.progress_rows() returns integer
language sql as $$
  select count(*)::integer from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1');
$$;

create function pg_temp.step_rows() returns integer
language sql as $$
  select count(*)::integer
    from public.class_progress_steps('00000000-0000-0000-0000-0000c1a50ca1');
$$;

-- ---------------------------------------------------------------------------
-- Two live sessions for the class: s1 ends, s2 is still in its lobby
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000c1a50a01');
insert into fixture (label, id)
  select 's1', public.start_session(
    source_bank => '00000000-0000-0000-0000-0000c1a500e0'::uuid,
    target_class => '00000000-0000-0000-0000-0000c1a50ca1'::uuid);
insert into fixture (label, id)
  select 's2', public.start_session(
    source_bank => '00000000-0000-0000-0000-0000c1a500e0'::uuid,
    target_class => '00000000-0000-0000-0000-0000c1a50ca1'::uuid);
-- A quick session: no class, so it is nobody's progress even though M joins it.
insert into fixture (label, id)
  select 'quick', public.start_session(source_bank => '00000000-0000-0000-0000-0000c1a500e0'::uuid);

set local role service_role;
insert into fixture (label, id)
  select 'p-m', j.participant_id
  from public.join_session((select id from fixture where label = 's1'), 'Mia',
                           '00000000-0000-0000-0000-0000c1a50d01') as j;
insert into fixture (label, id)
  select 'p-r', j.participant_id
  from public.join_session((select id from fixture where label = 's1'), 'Rae',
                           '00000000-0000-0000-0000-0000c1a50d03') as j;
insert into fixture (label, id)
  select 'p-guest', j.participant_id
  from public.join_session((select id from fixture where label = 's1'), 'Guest') as j;
-- K is in no class of the workspace, so K joins anonymously, as a guest.
insert into fixture (label, id)
  select 'p-k', j.participant_id
  from public.join_session((select id from fixture where label = 's1'), 'Kai',
                           '00000000-0000-0000-0000-0000c1a50d05') as j;
insert into fixture (label, id)
  select 'p-m2', j.participant_id
  from public.join_session((select id from fixture where label = 's2'), 'Mia',
                           '00000000-0000-0000-0000-0000c1a50d01') as j;
insert into fixture (label, id)
  select 'p-mq', j.participant_id
  from public.join_session((select id from fixture where label = 'quick'), 'Mia',
                           '00000000-0000-0000-0000-0000c1a50d01') as j;

reset role;

-- Scored answers, written straight in as the superuser. In s1, M earns 1 of 1 and 0 of 1, R 1 of
-- 1 on the first question only, the guest 1 of 1 twice. Each question is worth 1, so possible is 2.
insert into public.session_responses
  (session_id, org_id, participant_id, item_id, item_position, response, points, max_points, model)
select (select id from fixture where label = v.s), '00000000-0000-0000-0000-0000c1a500a0',
       (select id from fixture where label = v.p), v.item::uuid, v.pos, '{}', v.pts, 1, 'test'
  from (values
    ('s1', 'p-m', '00000000-0000-0000-0000-0000c1a500e1', 1, 1),
    ('s1', 'p-m', '00000000-0000-0000-0000-0000c1a500e2', 2, 0),
    ('s1', 'p-r', '00000000-0000-0000-0000-0000c1a500e1', 1, 1),
    ('s1', 'p-guest', '00000000-0000-0000-0000-0000c1a500e1', 1, 1),
    ('s1', 'p-guest', '00000000-0000-0000-0000-0000c1a500e2', 2, 1),
    ('s2', 'p-m2', '00000000-0000-0000-0000-0000c1a500e1', 1, 1),
    ('quick', 'p-mq', '00000000-0000-0000-0000-0000c1a500e1', 1, 0)
  ) as v(s, p, item, pos, pts);

update public.sessions set status = 'ended' where id = (select id from fixture where label = 's1');

-- ---------------------------------------------------------------------------
-- Two assignments: a1 closes, a2 stays open
-- ---------------------------------------------------------------------------

insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
values
  ('00000000-0000-0000-0000-0000c1a500f1', '00000000-0000-0000-0000-0000c1a500a0',
   '00000000-0000-0000-0000-0000c1a50ca1', '00000000-0000-0000-0000-0000c1a500e0', 'Week 1',
   now() - interval '2 hours', now() + interval '1 day', 2),
  ('00000000-0000-0000-0000-0000c1a500f2', '00000000-0000-0000-0000-0000c1a500a0',
   '00000000-0000-0000-0000-0000c1a50ca1', '00000000-0000-0000-0000-0000c1a500e0', 'Week 2',
   now() - interval '2 hours', now() + interval '1 day', 1);

-- M submits a1 twice (2 of 2, then 1 of 2) and a2 once (2 of 2).
insert into public.assignment_attempts
  (id, org_id, assignment_id, student_id, number, submitted_at, score, max_score)
values
  ('00000000-0000-0000-0000-0000c1a5aa01', '00000000-0000-0000-0000-0000c1a500a0',
   '00000000-0000-0000-0000-0000c1a500f1', '00000000-0000-0000-0000-0000c1a50d01', 1,
   now() - interval '90 minutes', 2, 2),
  ('00000000-0000-0000-0000-0000c1a5aa02', '00000000-0000-0000-0000-0000c1a500a0',
   '00000000-0000-0000-0000-0000c1a500f1', '00000000-0000-0000-0000-0000c1a50d01', 2,
   now() - interval '80 minutes', 1, 2),
  ('00000000-0000-0000-0000-0000c1a5aa03', '00000000-0000-0000-0000-0000c1a500a0',
   '00000000-0000-0000-0000-0000c1a500f2', '00000000-0000-0000-0000-0000c1a50d01', 1,
   now() - interval '70 minutes', 2, 2);
insert into public.attempt_responses (attempt_id, org_id, item_id, response, points, max_points)
values
  ('00000000-0000-0000-0000-0000c1a5aa01', '00000000-0000-0000-0000-0000c1a500a0',
   '00000000-0000-0000-0000-0000c1a500e1', '{}', 1, 1),
  ('00000000-0000-0000-0000-0000c1a5aa01', '00000000-0000-0000-0000-0000c1a500a0',
   '00000000-0000-0000-0000-0000c1a500e2', '{}', 1, 1),
  ('00000000-0000-0000-0000-0000c1a5aa02', '00000000-0000-0000-0000-0000c1a500a0',
   '00000000-0000-0000-0000-0000c1a500e1', '{}', 0, 1),
  ('00000000-0000-0000-0000-0000c1a5aa02', '00000000-0000-0000-0000-0000c1a500a0',
   '00000000-0000-0000-0000-0000c1a500e2', '{}', 1, 1),
  ('00000000-0000-0000-0000-0000c1a5aa03', '00000000-0000-0000-0000-0000c1a500a0',
   '00000000-0000-0000-0000-0000c1a500e1', '{}', 0, 1),
  ('00000000-0000-0000-0000-0000c1a5aa03', '00000000-0000-0000-0000-0000c1a500a0',
   '00000000-0000-0000-0000-0000c1a500e2', '{}', 0, 1);

set local session_replication_role = replica;
update public.assignments set closes_at = now() - interval '1 hour'
 where id = '00000000-0000-0000-0000-0000c1a500f1';
set local session_replication_role = origin;

-- R and Q are taken off the class: the trigger records both removals.
delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000c1a50ca1'
   and profile_id in ('00000000-0000-0000-0000-0000c1a50d03', '00000000-0000-0000-0000-0000c1a50d04');

select ok(
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'participants_profile_id_idx') = 1,
  'participants are indexed by profile'
);

-- ---------------------------------------------------------------------------
-- As T, the class's teacher
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000c1a50a01');

select is(
  pg_temp.progress_rows(),
  12,
  'one row for each of three students in each of two live sessions and two assignments'
);

select results_eq(
  $$ select distinct profile_id, membership
       from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1') order by profile_id $$,
  $$ values ('00000000-0000-0000-0000-0000c1a50d01'::uuid, 'member'::text),
            ('00000000-0000-0000-0000-0000c1a50d02'::uuid, 'member'::text),
            ('00000000-0000-0000-0000-0000c1a50d03'::uuid, 'removed'::text) $$,
  'the two members, and the removed student who attended, flagged as removed'
);

select is(
  (select count(*)::integer from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1')
    where profile_id = '00000000-0000-0000-0000-0000c1a50d04'),
  0,
  'a removed student who left nothing behind is not listed'
);

select is(
  (select count(*)::integer from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1')
    where profile_id is null or profile_id = '00000000-0000-0000-0000-0000c1a50d05'),
  0,
  'a guest of a class session is nobody''s row, and nor is a student of no class who joined'
);

select is(
  (select count(distinct activity_id)::integer
     from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1')
    where activity_id = (select id from fixture where label = 'quick')),
  0,
  'a quick live session is not one of the class''s'
);

select is(
  (select row(attended, points, possible, percent, activity_state, display_name, email)::text
     from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1')
    where profile_id = '00000000-0000-0000-0000-0000c1a50d01'
      and activity_id = (select id from fixture where label = 's1')),
  row(true, 1.00, 2.00, 50.00, 'ended', 'Mia', 'progress-m@example.test')::text,
  'an ended session: attended, with the report''s points, possible and percent'
);

select is(
  (select row(attended, points, possible, percent)::text
     from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1')
    where profile_id = '00000000-0000-0000-0000-0000c1a50d02'
      and activity_id = (select id from fixture where label = 's1')),
  row(false, null::numeric, null::numeric, null::numeric)::text,
  'a member with no linked participant did not attend, and has no points rather than nought'
);

select is(
  (select row(attended, percent)::text
     from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1')
    where profile_id = '00000000-0000-0000-0000-0000c1a50d03'
      and activity_id = (select id from fixture where label = 's1')),
  row(true, 50.00)::text,
  'the removed student''s session still counts for them'
);

select is(
  (select row(attended, points, percent, activity_state)::text
     from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1')
    where profile_id = '00000000-0000-0000-0000-0000c1a50d01'
      and activity_id = (select id from fixture where label = 's2')),
  row(true, null::numeric, null::numeric, 'lobby')::text,
  'a session that has not ended says who is in it but has no score yet'
);

select is(
  (select row(activity_kind, activity_state, status, attempts_used, attempt_number, points,
              possible, percent, attended)::text
     from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1')
    where profile_id = '00000000-0000-0000-0000-0000c1a50d01'
      and activity_id = '00000000-0000-0000-0000-0000c1a500f1'),
  row('assignment', 'closed', 'submitted', 2, 1::smallint, 2.00, 2.00, 100.00, true)::text,
  'a closed assignment: the best attempt, its score and percent, and the attempts used'
);

select is(
  (select row(activity_state, status, attempt_number, points, percent)::text
     from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1')
    where profile_id = '00000000-0000-0000-0000-0000c1a50d01'
      and activity_id = '00000000-0000-0000-0000-0000c1a500f2'),
  row('open', 'submitted', null::smallint, null::numeric, null::numeric)::text,
  'an open assignment says it was submitted and withholds the score'
);

select is(
  (select row(status, attempts_used, attended, percent)::text
     from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1')
    where profile_id = '00000000-0000-0000-0000-0000c1a50d02'
      and activity_id = '00000000-0000-0000-0000-0000c1a500f1'),
  row('not_started', 0, false, null::numeric)::text,
  'a member who never started an assignment'
);

-- Steps. M: step 1 is 1 of 1 in s1 and 1 of 1 in a1's best attempt (100); step 2 is 0 of 1 in
-- s1 and 1 of 1 in a1 (50). Not s2 (still open), not the quick session, not a2 (still open), and
-- not a1's second attempt.
select results_eq(
  $$ select step, answered, points, possible, mean_percent
       from public.class_progress_steps('00000000-0000-0000-0000-0000c1a50ca1')
      where profile_id = '00000000-0000-0000-0000-0000c1a50d01' order by step $$,
  $$ values (1::smallint, 2, 2.00, 2.00, 100.00), (2::smallint, 2, 1.00, 2.00, 50.00) $$,
  'a student''s steps come from ended sessions and the best attempts at closed assignments'
);

select results_eq(
  $$ select profile_id, step, mean_percent
       from public.class_progress_steps('00000000-0000-0000-0000-0000c1a50ca1')
      where profile_id <> '00000000-0000-0000-0000-0000c1a50d01' order by profile_id, step $$,
  $$ values ('00000000-0000-0000-0000-0000c1a50d03'::uuid, 1::smallint, 100.00) $$,
  'the removed student has their own step; the guest and the student of no class have none'
);

-- ---------------------------------------------------------------------------
-- As everyone else
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000c1a50b01');
select is(pg_temp.progress_rows(), 0, 'a teacher of another workspace reads no progress');
select is(pg_temp.step_rows(), 0, 'and no steps');

select pg_temp.act_as('00000000-0000-0000-0000-0000c1a50d01');
select is(pg_temp.progress_rows(), 0, 'a student of the class reads no progress, not even their own');
select is(pg_temp.step_rows(), 0, 'and no steps');

select pg_temp.act_as('00000000-0000-0000-0000-0000c1a50d02');
select is(pg_temp.progress_rows(), 0, 'nor does a student who attended nothing');

select pg_temp.act_as('00000000-0000-0000-0000-0000c1a50d05');
select is(pg_temp.progress_rows(), 0, 'nor a student of the workspace in no class');

select pg_temp.act_as('00000000-0000-0000-0000-0000c1a50d06');
select is(pg_temp.progress_rows(), 0, 'nor an account with no role');
select is(pg_temp.step_rows(), 0, 'and no steps');

-- A class the teacher's workspace does not have reads like one that does not exist.
select pg_temp.act_as('00000000-0000-0000-0000-0000c1a50a01');
select is(
  (select count(*)::integer from public.class_progress('00000000-0000-0000-0000-0000c1a50fff')),
  0,
  'a class that does not exist reads as nothing'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.class_progress('00000000-0000-0000-0000-0000c1a50ca1') $$,
  '42501',
  null,
  'anon cannot call class_progress'
);
select throws_ok(
  $$ select * from public.class_progress_steps('00000000-0000-0000-0000-0000c1a50ca1') $$,
  '42501',
  null,
  'nor class_progress_steps'
);

reset role;
select ok(
  not has_function_privilege('authenticated', 'private.progress_class(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.progress_students(uuid)', 'EXECUTE'),
  'the private helpers are callable only by the functions that use them'
);
select ok(
  not has_function_privilege('anon', 'public.class_progress(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.class_progress(uuid)', 'EXECUTE'),
  'class_progress is granted to authenticated and not to anon'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.class_progress(uuid)'::regprocedure)
  and (select proconfig @> array['search_path=""'] from pg_proc
        where oid = 'public.class_progress(uuid)'::regprocedure),
  'class_progress is security definer with an empty search path'
);

-- The removal of a member who attended is the ADR 0013 line: the participant stays linked.
select is(
  (select profile_id from public.participants where id = (select id from fixture where label = 'p-r')),
  '00000000-0000-0000-0000-0000c1a50d03'::uuid,
  'control: the removed student''s participant is still linked'
);

select is(
  (select count(*)::integer from public.participants
    where id = (select id from fixture where label = 'p-k') and profile_id is null),
  1,
  'control: the student of no class joined the class session as a guest'
);

select * from finish();
rollback;
