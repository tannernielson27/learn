-- Question statistics reads (20261126000100_question_stats_reads.sql): public.quiz_question_marks
-- and public.question_answers answer only an author of the quiz's own workspace; count a live
-- session only once it has ended, guests included, and an assignment only once it has closed, the
-- first submitted attempt only; never count practice; and follow a question by item_id into uses
-- of the quiz it was moved from. Runs with `pnpm test:db`. Uses its own fixture ids so it never
-- counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  -- T teaches in workspace A, U in workspace B. M and N are students of A's class. Z has no role.
  ('00000000-0000-0000-0000-000000616a01', 'qstats-t@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000616b01', 'qstats-u@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000616d01', 'qstats-m@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000616d02', 'qstats-n@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000616d03', 'qstats-z@example.test', 'authenticated', 'authenticated');

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000006160a0', 'Question stats A'),
  ('00000000-0000-0000-0000-0000006160b0', 'Question stats B');

update public.profiles set org_id = '00000000-0000-0000-0000-0000006160a0', role = 'instructor'
 where id = '00000000-0000-0000-0000-000000616a01';
update public.profiles set org_id = '00000000-0000-0000-0000-0000006160b0', role = 'instructor'
 where id = '00000000-0000-0000-0000-000000616b01';
update public.profiles set org_id = '00000000-0000-0000-0000-0000006160a0', role = 'student'
 where id in ('00000000-0000-0000-0000-000000616d01', '00000000-0000-0000-0000-000000616d02');
update public.profiles set role = null where id = '00000000-0000-0000-0000-000000616d03';

-- Quiz Q holds q1 and q2. Quiz P holds p1. q2 is treated as moved from P to Q: a session of P
-- answered it, and it now sits in Q.
insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-0000006160e0', '00000000-0000-0000-0000-0000006160a0', 'Quiz Q'),
  ('00000000-0000-0000-0000-0000006160e9', '00000000-0000-0000-0000-0000006160a0', 'Quiz P');
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring) values
  ('00000000-0000-0000-0000-0000006160e1', '00000000-0000-0000-0000-0000006160e0',
   '00000000-0000-0000-0000-0000006160a0', 'multiple_choice', 'published', '{}',
   '{"correctOptionId":"a"}', '{"model":"zero_one","maxPoints":1}'),
  ('00000000-0000-0000-0000-0000006160e2', '00000000-0000-0000-0000-0000006160e0',
   '00000000-0000-0000-0000-0000006160a0', 'multiple_choice', 'published', '{}',
   '{"correctOptionId":"b"}', '{"model":"zero_one","maxPoints":1}'),
  ('00000000-0000-0000-0000-0000006160ea', '00000000-0000-0000-0000-0000006160e9',
   '00000000-0000-0000-0000-0000006160a0', 'multiple_choice', 'published', '{}',
   '{"correctOptionId":"c"}', '{"model":"zero_one","maxPoints":1}');

insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-000000616ca1', '00000000-0000-0000-0000-0000006160a0', 'NUR 340');
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-000000616ca1', '00000000-0000-0000-0000-000000616d01'),
  ('00000000-0000-0000-0000-000000616ca1', '00000000-0000-0000-0000-000000616d02');

create temporary table fixture (label text primary key, id uuid);
grant select, insert on fixture to anon, authenticated, service_role;

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.fx(name text) returns uuid
language sql as $$ select id from fixture where label = name $$;

create function pg_temp.marks(target uuid) returns integer
language sql as $$ select count(*)::integer from public.quiz_question_marks(target) $$;

create function pg_temp.answers(target uuid) returns integer
language sql as $$ select count(*)::integer from public.question_answers(target) $$;

-- ---------------------------------------------------------------------------
-- Live sessions: s1 of quiz Q for the class, sP of quiz P with no class
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000616a01');
insert into fixture (label, id) select 's1', public.start_session(
  source_bank => '00000000-0000-0000-0000-0000006160e0'::uuid,
  target_class => '00000000-0000-0000-0000-000000616ca1'::uuid);
insert into fixture (label, id) select 'sP', public.start_session(
  source_bank => '00000000-0000-0000-0000-0000006160e9'::uuid);
reset role;

insert into fixture (label, id)
  select 'p-m', (select participant_id from public.join_session(pg_temp.fx('s1'), 'Mia',
    '00000000-0000-0000-0000-000000616d01'));
insert into fixture (label, id)
  select 'p-guest', (select participant_id from public.join_session(pg_temp.fx('s1'), 'Guest'));
insert into fixture (label, id)
  select 'p-sp', (select participant_id from public.join_session(pg_temp.fx('sP'), 'Mia'));

update public.sessions set status = 'running', current_position = 1 where id = pg_temp.fx('s1');
update public.sessions set status = 'running', current_position = 1 where id = pg_temp.fx('sP');

insert into public.session_responses
  (session_id, org_id, participant_id, item_id, item_position, response, points, max_points, model,
   reveal)
select pg_temp.fx(v.s), '00000000-0000-0000-0000-0000006160a0', pg_temp.fx(v.p), v.item::uuid,
       v.pos, v.response::jsonb, v.pts, 1, 'zero_one', v.reveal::jsonb
  from (values
    -- M in s1: right on q1 (with a stored reveal), wrong on q2.
    ('s1', 'p-m', '00000000-0000-0000-0000-0000006160e1', 1, '{"selectedOptionId":"a"}', 1,
     '{"answerKey":{"correctOptionId":"a"},"rationale":{"general":"Because a."},"scoring":{"model":"zero_one","maxPoints":1}}'),
    ('s1', 'p-m', '00000000-0000-0000-0000-0000006160e2', 2, '{"selectedOptionId":"a"}', 0, null),
    -- The guest in s1: right on both.
    ('s1', 'p-guest', '00000000-0000-0000-0000-0000006160e1', 1, '{"selectedOptionId":"a"}', 1, null),
    ('s1', 'p-guest', '00000000-0000-0000-0000-0000006160e2', 2, '{"selectedOptionId":"b"}', 1, null),
    -- sP, of quiz P: p1, and q2 before it moved to Q.
    ('sP', 'p-sp', '00000000-0000-0000-0000-0000006160e2', 1, '{"selectedOptionId":"b"}', 1, null),
    ('sP', 'p-sp', '00000000-0000-0000-0000-0000006160ea', 2, '{"selectedOptionId":"c"}', 1, null)
  ) as v(s, p, item, pos, response, pts, reveal);

-- sP ends now; s1 stays running for the first checks.
update public.sessions set status = 'ended' where id = pg_temp.fx('sP');

-- ---------------------------------------------------------------------------
-- An assignment of quiz Q, open for now
-- ---------------------------------------------------------------------------

insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
values
  ('00000000-0000-0000-0000-0000006160f1', '00000000-0000-0000-0000-0000006160a0',
   '00000000-0000-0000-0000-000000616ca1', '00000000-0000-0000-0000-0000006160e0', 'Week 1',
   now() - interval '2 hours', now() + interval '1 day', 2);

-- M submits twice at the same instant: attempt 1 at nothing, attempt 2 at full marks. N has one
-- attempt still open, with marks on it, to show the attempt's state decides and not the marks.
insert into public.assignment_attempts
  (id, org_id, assignment_id, student_id, number, submitted_at, score, max_score)
values
  ('00000000-0000-0000-0000-000000616aa1', '00000000-0000-0000-0000-0000006160a0',
   '00000000-0000-0000-0000-0000006160f1', '00000000-0000-0000-0000-000000616d01', 1,
   now() - interval '90 minutes', 0, 2),
  ('00000000-0000-0000-0000-000000616aa2', '00000000-0000-0000-0000-0000006160a0',
   '00000000-0000-0000-0000-0000006160f1', '00000000-0000-0000-0000-000000616d01', 2,
   now() - interval '90 minutes', 2, 2),
  ('00000000-0000-0000-0000-000000616aa3', '00000000-0000-0000-0000-0000006160a0',
   '00000000-0000-0000-0000-0000006160f1', '00000000-0000-0000-0000-000000616d02', 1,
   null, null, null);
insert into public.attempt_responses (attempt_id, org_id, item_id, response, points, max_points)
values
  ('00000000-0000-0000-0000-000000616aa1', '00000000-0000-0000-0000-0000006160a0',
   '00000000-0000-0000-0000-0000006160e1', '{"selectedOptionId":"b"}', 0, 1),
  ('00000000-0000-0000-0000-000000616aa1', '00000000-0000-0000-0000-0000006160a0',
   '00000000-0000-0000-0000-0000006160e2', '{"selectedOptionId":"a"}', 0, 1),
  ('00000000-0000-0000-0000-000000616aa2', '00000000-0000-0000-0000-0000006160a0',
   '00000000-0000-0000-0000-0000006160e1', '{"selectedOptionId":"a"}', 1, 1),
  ('00000000-0000-0000-0000-000000616aa2', '00000000-0000-0000-0000-0000006160a0',
   '00000000-0000-0000-0000-0000006160e2', '{"selectedOptionId":"b"}', 1, 1),
  ('00000000-0000-0000-0000-000000616aa3', '00000000-0000-0000-0000-0000006160a0',
   '00000000-0000-0000-0000-0000006160e1', '{"selectedOptionId":"a"}', 1, 1);

-- ---------------------------------------------------------------------------
-- Practice: M answers q1 in a practice run of quiz Q
-- ---------------------------------------------------------------------------

insert into public.practice_runs (id, org_id, student_id, bank_id) values
  ('00000000-0000-0000-0000-000000616ab1', '00000000-0000-0000-0000-0000006160a0',
   '00000000-0000-0000-0000-000000616d01', '00000000-0000-0000-0000-0000006160e0');
insert into public.practice_responses (run_id, org_id, item_id, response, points, max_points, score)
values
  ('00000000-0000-0000-0000-000000616ab1', '00000000-0000-0000-0000-0000006160a0',
   '00000000-0000-0000-0000-0000006160e1', '{"selectedOptionId":"a"}', 1, 1, '{}');

select ok(
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname in ('attempt_responses_item_id_idx', 'session_responses_item_id_idx')) = 2,
  'attempt and live answers are both indexed by question'
);

-- ---------------------------------------------------------------------------
-- As T, before the session ends and the assignment closes
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000616a01');

select is(
  (select count(*)::integer from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where use_id = pg_temp.fx('s1')),
  0,
  'a running live session adds no rows'
);
select is(
  (select count(*)::integer from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where use_id = '00000000-0000-0000-0000-0000006160f1'),
  0,
  'an open assignment adds no rows'
);
select is(
  pg_temp.answers('00000000-0000-0000-0000-0000006160e1'),
  0,
  'and question_answers has nothing for a question answered only there'
);

-- s1 ends, and the assignment closes.
reset role;
update public.sessions set status = 'ended' where id = pg_temp.fx('s1');
set local session_replication_role = replica;
update public.assignments set closes_at = now() - interval '1 hour'
 where id = '00000000-0000-0000-0000-0000006160f1';
set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- As T, after
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000616a01');

select is(
  pg_temp.marks('00000000-0000-0000-0000-0000006160e0'),
  7,
  'the same data after the end and the close: four live answers, one moved, two from the assignment'
);
select is(
  (select count(*)::integer from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where use_id = pg_temp.fx('s1')),
  4,
  'the ended session adds every participant''s answers, guests included'
);
select is(
  (select count(distinct answerer)::integer
     from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where use_id = pg_temp.fx('s1')),
  2,
  'the linked student and the guest are two answerers'
);
select results_eq(
  $$ select item_id, points, max_points
       from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
      where use_kind = 'assignment' order by item_id $$,
  $$ values ('00000000-0000-0000-0000-0000006160e1'::uuid, 0.00, 1.00),
            ('00000000-0000-0000-0000-0000006160e2'::uuid, 0.00, 1.00) $$,
  'only the first submitted attempt counts: attempt 1, though attempt 2 was submitted at the same instant and scored higher'
);
select is(
  (select count(*)::integer from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where answerer = md5('00000000-0000-0000-0000-0000006160f1:00000000-0000-0000-0000-000000616d02')),
  0,
  'an unsubmitted attempt adds nothing, though its answer carries marks'
);
select is(
  (select count(*)::integer from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where use_id = pg_temp.fx('sP') and item_id = '00000000-0000-0000-0000-0000006160e2'),
  1,
  'a question moved into the quiz keeps its answer from a session of its old quiz'
);
select is(
  (select count(*)::integer from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where item_id = '00000000-0000-0000-0000-0000006160ea'),
  0,
  'a question of another quiz answered in the same session is not this quiz''s'
);
select ok(
  exists (select 1 from public.practice_responses
           where item_id = '00000000-0000-0000-0000-0000006160e1'
             and run_id = '00000000-0000-0000-0000-000000616ab1'),
  'control: the practice answer to q1 is there'
);
select is(
  (select count(*)::integer from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where item_id = '00000000-0000-0000-0000-0000006160e1'),
  3,
  'practice answers to the same question add nothing: q1 has M and the guest live, and M''s attempt'
);
select is(
  (select answerer from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where use_id = pg_temp.fx('s1') and item_id = '00000000-0000-0000-0000-0000006160e1'
      and points = 1 and scored_key is not null),
  md5(pg_temp.fx('s1')::text || ':' || pg_temp.fx('p-m')::text),
  'a live answerer is md5 of the session and the participant'
);
select is(
  (select array_agg(distinct answerer)
     from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where use_kind = 'assignment'),
  array[md5('00000000-0000-0000-0000-0000006160f1:00000000-0000-0000-0000-000000616d01')],
  'an assignment answerer is md5 of the assignment and the student, one per student'
);
select is(
  (select scored_key from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where answerer = md5(pg_temp.fx('s1')::text || ':' || pg_temp.fx('p-m')::text)
      and item_id = '00000000-0000-0000-0000-0000006160e1'),
  '{"answerKey":{"correctOptionId":"a"},"scoring":{"model":"zero_one","maxPoints":1}}'::jsonb,
  'scored_key is the stored key and scoring, without the rationale'
);
select ok(
  (select scored_key is null from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where answerer = md5(pg_temp.fx('s1')::text || ':' || pg_temp.fx('p-guest')::text)
      and item_id = '00000000-0000-0000-0000-0000006160e1'),
  'and null for an answer stored with no reveal'
);
select is(
  pg_get_function_result('public.quiz_question_marks(uuid)'::regprocedure),
  'TABLE(use_kind text, use_id uuid, used_at timestamp with time zone, answerer text, item_id uuid, points numeric, max_points numeric, scored_key jsonb)',
  'the quiz read carries no answer content'
);

select is(
  pg_temp.answers('00000000-0000-0000-0000-0000006160e1'),
  3,
  'question_answers counts the same answers to q1'
);
select is(
  pg_temp.answers('00000000-0000-0000-0000-0000006160e2'),
  4,
  'and to q2, the moved one included'
);
select is(
  (select row(response, reveal)::text from public.question_answers('00000000-0000-0000-0000-0000006160e1')
    where answerer = md5(pg_temp.fx('s1')::text || ':' || pg_temp.fx('p-m')::text)),
  row('{"selectedOptionId":"a"}'::jsonb,
      '{"answerKey":{"correctOptionId":"a"},"rationale":{"general":"Because a."},"scoring":{"model":"zero_one","maxPoints":1}}'::jsonb)::text,
  'with the response and the whole stored reveal'
);
select ok(
  (select array_agg(answerer order by answerer)
     from public.question_answers('00000000-0000-0000-0000-0000006160e1'))
  = (select array_agg(answerer order by answerer)
       from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
      where item_id = '00000000-0000-0000-0000-0000006160e1'),
  'the two reads give the same answerer keys'
);
-- The sessions opened in this transaction, so now(); the assignment closed an hour ago.
select is(
  (select array_agg(use_kind) from public.question_answers('00000000-0000-0000-0000-0000006160e2')),
  array['live', 'live', 'live', 'assignment'],
  'newest first'
);
select is(
  pg_temp.marks('00000000-0000-0000-0000-0000006160e9'),
  1,
  'quiz P now has only p1, answered once'
);
select is(
  pg_temp.marks('00000000-0000-0000-0000-000000616fff'),
  0,
  'a quiz that does not exist reads as nothing'
);

-- ---------------------------------------------------------------------------
-- As everyone else
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-000000616b01');
select is(pg_temp.marks('00000000-0000-0000-0000-0000006160e0'), 0,
  'a teacher of another workspace reads no marks');
select is(pg_temp.answers('00000000-0000-0000-0000-0000006160e1'), 0, 'and no answers');

select pg_temp.act_as('00000000-0000-0000-0000-000000616d01');
select is(pg_temp.marks('00000000-0000-0000-0000-0000006160e0'), 0,
  'a student reads no marks, not even their own');
select is(pg_temp.answers('00000000-0000-0000-0000-0000006160e1'), 0, 'and no answers');

select pg_temp.act_as('00000000-0000-0000-0000-000000616d03');
select is(pg_temp.marks('00000000-0000-0000-0000-0000006160e0'), 0,
  'an account with no role reads no marks');
select is(pg_temp.answers('00000000-0000-0000-0000-0000006160e1'), 0, 'and no answers');

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0') $$,
  '42501', null, 'anon cannot call quiz_question_marks'
);
select throws_ok(
  $$ select * from public.question_answers('00000000-0000-0000-0000-0000006160e1') $$,
  '42501', null, 'nor question_answers'
);

reset role;
select ok(
  has_function_privilege('authenticated', 'public.quiz_question_marks(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.question_answers(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.quiz_question_marks(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.question_answers(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.quiz_question_marks(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.question_answers(uuid)', 'EXECUTE'),
  'both are granted to authenticated only: not anon, not the service role'
);
select ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=""'])
     from pg_proc
    where oid in ('public.quiz_question_marks(uuid)'::regprocedure,
                  'public.question_answers(uuid)'::regprocedure)),
  'both are security definer with an empty search path'
);

-- ---------------------------------------------------------------------------
-- The cap: 2,001 more answers to q1 in the ended session sP
-- ---------------------------------------------------------------------------

insert into public.session_responses
  (session_id, org_id, participant_id, item_id, item_position, response, points, max_points, model)
select pg_temp.fx('sP'), '00000000-0000-0000-0000-0000006160a0', gen_random_uuid(),
       '00000000-0000-0000-0000-0000006160e1', 3, '{"selectedOptionId":"a"}', 1, 1, 'zero_one'
  from generate_series(1, 2001);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000616a01');
select is(
  pg_temp.answers('00000000-0000-0000-0000-0000006160e1'),
  2000,
  'question_answers stops at 2,000'
);
select is(
  (select count(*)::integer from public.quiz_question_marks('00000000-0000-0000-0000-0000006160e0')
    where item_id = '00000000-0000-0000-0000-0000006160e1'),
  2004,
  'the quiz read is not capped'
);

reset role;
select * from finish();
rollback;
