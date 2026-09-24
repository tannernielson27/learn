-- A student's own results (#210): public.my_assignment_result.
--
-- Before the close (and within its two seconds of grace) nobody reads anything. After it, a student
-- reads their own attempts' scores and marks and nobody else's; a member who made no attempt reads
-- the assignment with empty attempt columns; a student taken off the class reads the attempts they
-- made; an author (of this org or another), a student outside the class, an account with no role
-- and anon read nothing. now() is fixed for the transaction, so "closed" is made by moving
-- closes_at into the past with the guard trigger switched off, as the superuser.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002100a1', 'result-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002100a2', 'result-elsewhere@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002100d1', 'result-ada@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002100d2', 'result-grace@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002100d3', 'result-hal@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002100d4', 'result-removed@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002100d5', 'result-removed-none@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002100d6', 'result-outsider@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002100d7', 'result-norole@example.test', 'authenticated', 'authenticated');

select private.make_instructor('result-teacher@example.test');
select private.make_instructor('result-elsewhere@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002100a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002100d1', '00000000-0000-0000-0000-0000002100d2',
              '00000000-0000-0000-0000-0000002100d3', '00000000-0000-0000-0000-0000002100d4',
              '00000000-0000-0000-0000-0000002100d5', '00000000-0000-0000-0000-0000002100d6');
-- 2100d7 keeps what sign-up gives since #204: no org and no role.

insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000002100f0', 'Another school 210');
update public.profiles set org_id = '00000000-0000-0000-0000-0000002100f0'
 where id = '00000000-0000-0000-0000-0000002100a2';

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- How many rows the caller reads for the assignment.
create function pg_temp.rows_read() returns integer
language sql as $$
  select count(*)::integer
    from public.my_assignment_result('00000000-0000-0000-0000-0000002100b1');
$$;

insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000002100c1', org_id, 'NUR 340'
    from public.profiles where id = '00000000-0000-0000-0000-0000002100a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002100c1', '00000000-0000-0000-0000-0000002100d1'),
  ('00000000-0000-0000-0000-0000002100c1', '00000000-0000-0000-0000-0000002100d2'),
  ('00000000-0000-0000-0000-0000002100c1', '00000000-0000-0000-0000-0000002100d3'),
  ('00000000-0000-0000-0000-0000002100c1', '00000000-0000-0000-0000-0000002100d4'),
  ('00000000-0000-0000-0000-0000002100c1', '00000000-0000-0000-0000-0000002100d5');

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000002100e0', org_id, 'Result bank 210'
    from public.profiles where id = '00000000-0000-0000-0000-0000002100a1';
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, rationale, scoring, created_at)
  select v.id::uuid, '00000000-0000-0000-0000-0000002100e0', p.org_id, 'multiple_choice', 1,
         'published', '{}', '{"correctOptionId":"secret_key_210"}',
         '{"general":{"value":"secret_rationale_210"}}', '{}', now() - v.age::interval
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002100f1', '2 hours'),
                 ('00000000-0000-0000-0000-0000002100f2', '1 hour')) as v(id, age)
   where p.id = '00000000-0000-0000-0000-0000002100a1';

insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
  select '00000000-0000-0000-0000-0000002100b1', org_id, '00000000-0000-0000-0000-0000002100c1',
         '00000000-0000-0000-0000-0000002100e0', 'Results 210', now() - interval '1 hour',
         now() + interval '1 day', 2
    from public.profiles where id = '00000000-0000-0000-0000-0000002100a1';

-- Attempts, written directly as the superuser: Ada submitted twice, Hal has one still open, the
-- removed student submitted before being taken off the class, and Grace has not started.
insert into public.assignment_attempts
  (id, org_id, assignment_id, student_id, number, submitted_at, score, max_score)
  select v.id::uuid, a.org_id, a.id, v.student::uuid, v.number, v.submitted::timestamptz,
         v.score, v.max_score
    from public.assignments a,
         (values ('00000000-0000-0000-0000-000000210a01', '00000000-0000-0000-0000-0000002100d1', 1,
                  now() - interval '30 minutes', 1.00, 2.00),
                 ('00000000-0000-0000-0000-000000210a02', '00000000-0000-0000-0000-0000002100d1', 2,
                  now() - interval '10 minutes', 2.00, 2.00),
                 ('00000000-0000-0000-0000-000000210a03', '00000000-0000-0000-0000-0000002100d3', 1,
                  null, null, null),
                 ('00000000-0000-0000-0000-000000210a04', '00000000-0000-0000-0000-0000002100d4', 1,
                  now() - interval '20 minutes', 0.00, 2.00))
           as v(id, student, number, submitted, score, max_score)
   where a.id = '00000000-0000-0000-0000-0000002100b1';
insert into public.attempt_responses
  (attempt_id, org_id, item_id, response, points, max_points, model, breakdown)
  select v.attempt::uuid, a.org_id, v.item::uuid, v.response::jsonb, v.points,
         v.max_points, v.model, v.breakdown::jsonb
    from public.assignments a,
         (values ('00000000-0000-0000-0000-000000210a01', '00000000-0000-0000-0000-0000002100f1',
                  '{"type":"multiple_choice","optionId":"ada_first"}', 1.00, 1.00, 'zero_one', '[]'),
                 ('00000000-0000-0000-0000-000000210a02', '00000000-0000-0000-0000-0000002100f1',
                  '{"type":"multiple_choice","optionId":"ada_second"}', 1.00, 1.00, 'zero_one', '[]'),
                 ('00000000-0000-0000-0000-000000210a03', '00000000-0000-0000-0000-0000002100f1',
                  '{"type":"multiple_choice","optionId":"hal_open"}', null, null, null, null),
                 ('00000000-0000-0000-0000-000000210a04', '00000000-0000-0000-0000-0000002100f1',
                  '{"type":"multiple_choice","optionId":"removed_answer"}', 0.00, 1.00, 'zero_one', '[]'))
           as v(attempt, item, response, points, max_points, model, breakdown)
   where a.id = '00000000-0000-0000-0000-0000002100b1';

-- Both removed students are taken off the class (the trigger records the removal).
delete from public.class_members
 where profile_id in ('00000000-0000-0000-0000-0000002100d4', '00000000-0000-0000-0000-0000002100d5');

-- The control: the scores exist.
select is(
  (select count(*)::integer from public.assignment_attempts
    where assignment_id = '00000000-0000-0000-0000-0000002100b1' and score is not null),
  3,
  'control: three attempts hold a score'
);

-- ---------------------------------------------------------------------------
-- While it is open
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002100d1');
select is(pg_temp.rows_read(), 0, 'while it is open a student with submitted attempts reads nothing');
select pg_temp.act_as('00000000-0000-0000-0000-0000002100d2');
select is(pg_temp.rows_read(), 0, 'nor does a member who has not started');
select pg_temp.act_as('00000000-0000-0000-0000-0000002100a1');
select is(pg_temp.rows_read(), 0, 'nor the author');

-- Within the two seconds of grace after closes_at, still nothing.
reset role;
set local session_replication_role = replica;
update public.assignments
   set closes_at = now() - interval '1 second'
 where id = '00000000-0000-0000-0000-0000002100b1';
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002100d1');
select is(pg_temp.rows_read(), 0, 'within the two seconds of grace a student still reads nothing');

-- ---------------------------------------------------------------------------
-- Once it has closed
-- ---------------------------------------------------------------------------

reset role;
set local session_replication_role = replica;
update public.assignments
   set closes_at = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-0000002100b1';
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002100d1');

select is(pg_temp.rows_read(), 2, 'a student reads one row per attempt of their own');
select is(
  (select array_agg(attempt_id order by attempt_number)
     from public.my_assignment_result('00000000-0000-0000-0000-0000002100b1')),
  array['00000000-0000-0000-0000-000000210a01', '00000000-0000-0000-0000-000000210a02']::uuid[],
  'and exactly their own attempts, oldest first'
);
select is(
  (select row(title, max_attempts, item_set)::text
     from public.my_assignment_result('00000000-0000-0000-0000-0000002100b1') limit 1),
  row('Results 210', 2::smallint,
      '["00000000-0000-0000-0000-0000002100f1", "00000000-0000-0000-0000-0000002100f2"]'::jsonb)::text,
  'each row carries the assignment''s title, attempts and item set'
);
select is(
  (select row(score, max_score, auto_submitted)::text
     from public.my_assignment_result('00000000-0000-0000-0000-0000002100b1')
    where attempt_id = '00000000-0000-0000-0000-000000210a02'),
  row(2.00, 2.00, false)::text,
  'a submitted attempt carries its score and maximum'
);
select is(
  (select marks from public.my_assignment_result('00000000-0000-0000-0000-0000002100b1')
    where attempt_id = '00000000-0000-0000-0000-000000210a01'),
  jsonb_build_array(jsonb_build_object(
    'item_id', '00000000-0000-0000-0000-0000002100f1',
    'response', '{"type":"multiple_choice","optionId":"ada_first"}'::jsonb,
    'points', 1.00, 'max_points', 1.00, 'model', 'zero_one',
    'breakdown', '[]'::jsonb, 'groups', null)),
  'and its saved answers with their marks'
);
select is(
  (select count(*)::integer
     from public.my_assignment_result('00000000-0000-0000-0000-0000002100b1') r
    where r::text like '%hal_open%' or r::text like '%removed_answer%'),
  0,
  'no other student''s answer is in what they read'
);
select is(
  (select count(*)::integer
     from public.my_assignment_result('00000000-0000-0000-0000-0000002100b1') r
    where r::text like '%secret_key_210%' or r::text like '%secret_rationale_210%'),
  0,
  'and no key or rationale: the app reads those on the server'
);
select throws_ok(
  $$ select score from public.assignment_attempts $$,
  '42501', null,
  'the column grant still keeps the score column itself from them'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002100d2');
select is(
  (select row(attempt_id, attempt_number, score, max_score, marks, title)::text
     from public.my_assignment_result('00000000-0000-0000-0000-0000002100b1')),
  row(null::uuid, null::smallint, null::numeric, null::numeric, null::jsonb, 'Results 210')::text,
  'a member who made no attempt reads the assignment once, with empty attempt columns'
);
select is(pg_temp.rows_read(), 1, 'and only that one row');

select pg_temp.act_as('00000000-0000-0000-0000-0000002100d3');
select is(
  (select row(attempt_id, submitted_at, score, max_score, marks)::text
     from public.my_assignment_result('00000000-0000-0000-0000-0000002100b1')),
  row('00000000-0000-0000-0000-000000210a03'::uuid, null::timestamptz, null::numeric,
      null::numeric, null::jsonb)::text,
  'an attempt still open (not yet submitted at close) carries no score and no marks'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002100d4');
select is(
  (select row(attempt_id, score, max_score)::text
     from public.my_assignment_result('00000000-0000-0000-0000-0000002100b1')),
  row('00000000-0000-0000-0000-000000210a04'::uuid, 0.00, 2.00)::text,
  'a student taken off the class still reads the attempt they made'
);
select is(pg_temp.rows_read(), 1, 'and only that attempt');

select pg_temp.act_as('00000000-0000-0000-0000-0000002100d5');
select is(pg_temp.rows_read(), 0, 'a removed student who made no attempt reads nothing');

select pg_temp.act_as('00000000-0000-0000-0000-0000002100d6');
select is(pg_temp.rows_read(), 0, 'a student of the org outside the class reads nothing');

select pg_temp.act_as('00000000-0000-0000-0000-0000002100a1');
select is(pg_temp.rows_read(), 0, 'the author reads nothing through a student''s function');

select pg_temp.act_as('00000000-0000-0000-0000-0000002100a2');
select is(pg_temp.rows_read(), 0, 'an author of another org reads nothing');

select pg_temp.act_as('00000000-0000-0000-0000-0000002100d7');
select is(pg_temp.rows_read(), 0, 'an account with no role reads nothing');

select pg_temp.act_as('00000000-0000-0000-0000-0000002100d1');
select is(
  (select count(*)::integer
     from public.my_assignment_result('00000000-0000-0000-0000-0000002100ff')),
  0,
  'an assignment that does not exist reads as nothing'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.my_assignment_result(uuid)', 'execute'),
  'anon cannot call it'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.my_assignment_result(uuid)'::regprocedure),
  'it runs with definer rights, so the column grant can stay closed'
);
select ok(
  (select proconfig @> array['search_path=""']
     from pg_proc where oid = 'public.my_assignment_result(uuid)'::regprocedure),
  'with an empty search_path'
);

select * from finish();
rollback;
