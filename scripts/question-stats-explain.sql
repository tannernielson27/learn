-- #616: the plan and the time of the question statistics reads on a seeded quiz of 50 questions
-- and 20,000 counted answers, with 100,000 answers to another workspace's questions beside them so
-- an unindexed read would show. Never run against a hosted database: it writes, and it is meant
-- for the local stack only. Everything happens in one transaction that is rolled back.
--
--     pnpm exec supabase start   # or supabase db reset
--     psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f scripts/question-stats-explain.sql
--
-- What to look for (#616's acceptance criterion): index scans on session_responses_item_id_idx
-- and attempt_responses_item_id_idx, no sequential scan of either table, and the timed
-- quiz_question_marks read under 300 ms. The function bodies are SQL, so the plans of their
-- bodies are printed with auto_explain (log_nested_statements) into the server log, and the same
-- queries are also explained inline below, as the teacher, with the functions' joins written out.
\set ON_ERROR_STOP on
\timing off
begin;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000616e00a0', 'Explain A'),
  ('00000000-0000-0000-0000-0000616e00b0', 'Explain B');

insert into auth.users (id, email, aud, role)
select ('00000000-0000-0000-0000-0000616e' || lpad(to_hex(n), 4, '0'))::uuid,
       'explain-' || n || '@example.test', 'authenticated', 'authenticated'
  from generate_series(1, 401) as n;

-- 1 is the teacher; 2..401 are students of workspace A.
update public.profiles set org_id = '00000000-0000-0000-0000-0000616e00a0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000616e0001';
update public.profiles set org_id = '00000000-0000-0000-0000-0000616e00a0', role = 'student'
 where id in (select ('00000000-0000-0000-0000-0000616e' || lpad(to_hex(n), 4, '0'))::uuid
                from generate_series(2, 401) as n);

-- The authoring triggers charge the caller's rate limit, so the seed runs with the teacher's claims.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000616e0001', 'role', 'authenticated')::text,
  true);

insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-0000616eb0a0', '00000000-0000-0000-0000-0000616e00a0', 'Explain quiz'),
  ('00000000-0000-0000-0000-0000616eb0b0', '00000000-0000-0000-0000-0000616e00b0', 'Noise quiz');

create temporary table q (n integer primary key, id uuid not null);
insert into q select n, gen_random_uuid() from generate_series(1, 50) as n;
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
select q.id, '00000000-0000-0000-0000-0000616eb0a0', '00000000-0000-0000-0000-0000616e00a0',
       'multiple_choice', 'published', '{}', '{"correctOptionId":"a"}',
       '{"model":"zero_one","maxPoints":1}'
  from q;

create temporary table noise_q (n integer primary key, id uuid not null);
insert into noise_q select n, gen_random_uuid() from generate_series(1, 50) as n;
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
select id, '00000000-0000-0000-0000-0000616eb0b0', '00000000-0000-0000-0000-0000616e00b0',
       'multiple_choice', 'published', '{}', '{"correctOptionId":"a"}',
       '{"model":"zero_one","maxPoints":1}'
  from noise_q;

-- 8 ended live sessions of 25 participants: 10,000 live answers.
create temporary table s (n integer primary key, id uuid not null);
insert into s select n, gen_random_uuid() from generate_series(1, 8) as n;
insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
select s.id, '00000000-0000-0000-0000-0000616e00a0', '00000000-0000-0000-0000-0000616e0001',
       '00000000-0000-0000-0000-0000616eb0a0', 'Explain ' || s.n, private.new_session_code(),
       (select jsonb_agg(q.id order by q.n) from q)
  from s;
update public.sessions set status = 'running', current_position = 1 where id in (select id from s);
update public.sessions set status = 'ended' where id in (select id from s);

insert into public.session_responses
  (session_id, org_id, participant_id, item_id, item_position, response, points, max_points, model,
   reveal)
select s.id, '00000000-0000-0000-0000-0000616e00a0', p.participant, q.id, q.n,
       '{"selectedOptionId":"a"}', (random() < 0.6)::int, 1, 'zero_one',
       '{"answerKey":{"correctOptionId":"a"},"rationale":{"general":"A rationale of a realistic length, a sentence or two about why the answer is right and why the others are not."},"scoring":{"model":"zero_one","maxPoints":1}}'
  from s
  cross join lateral (select gen_random_uuid() as participant from generate_series(1, 25)) p
  cross join q;

-- 5 closed assignments of 40 students, each with a first and a second attempt: 10,000 counted
-- attempt answers and 10,000 that are not.
insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-0000616ec1a0', '00000000-0000-0000-0000-0000616e00a0', 'Explain class');
create temporary table a (n integer primary key, id uuid not null);
insert into a select n, gen_random_uuid() from generate_series(1, 5) as n;
insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
select a.id, '00000000-0000-0000-0000-0000616e00a0', '00000000-0000-0000-0000-0000616ec1a0',
       '00000000-0000-0000-0000-0000616eb0a0', 'Explain ' || a.n,
       now() - interval '3 days', now() + interval '1 day', 2
  from a;
set local session_replication_role = replica;
update public.assignments set closes_at = now() - interval '1 day' where id in (select id from a);
set local session_replication_role = origin;

create temporary table x (id uuid primary key, assignment uuid, student uuid, number smallint);
insert into x
select gen_random_uuid(), a.id,
       ('00000000-0000-0000-0000-0000616e' || lpad(to_hex(st), 4, '0'))::uuid, k::smallint
  from a, generate_series(2, 41) as st, generate_series(1, 2) as k;
insert into public.assignment_attempts
  (id, org_id, assignment_id, student_id, number, submitted_at, score, max_score)
select id, '00000000-0000-0000-0000-0000616e00a0', assignment, student, number,
       now() - interval '2 days' + number * interval '1 hour', 25, 50
  from x;
insert into public.attempt_responses
  (attempt_id, org_id, item_id, response, points, max_points, reveal)
select x.id, '00000000-0000-0000-0000-0000616e00a0', q.id, '{"selectedOptionId":"a"}',
       (random() < 0.5)::int, 1,
       '{"answerKey":{"correctOptionId":"a"},"rationale":{"general":"A rationale."},"scoring":{"model":"zero_one","maxPoints":1}}'
  from x cross join q;

-- Noise: 100,000 answers in workspace B, in one ended session.
insert into public.sessions (id, org_id, host_id, bank_id, title, code, item_set)
values ('00000000-0000-0000-0000-0000616e5b00', '00000000-0000-0000-0000-0000616e00b0',
        '00000000-0000-0000-0000-0000616e0001', '00000000-0000-0000-0000-0000616eb0b0', 'Noise',
        private.new_session_code(), (select jsonb_agg(id order by n) from noise_q));
update public.sessions set status = 'running', current_position = 1
 where id = '00000000-0000-0000-0000-0000616e5b00';
update public.sessions set status = 'ended' where id = '00000000-0000-0000-0000-0000616e5b00';
insert into public.session_responses
  (session_id, org_id, participant_id, item_id, item_position, response, points, max_points, model)
select '00000000-0000-0000-0000-0000616e5b00', '00000000-0000-0000-0000-0000616e00b0',
       gen_random_uuid(), noise_q.id, noise_q.n, '{}', 1, 1, 'zero_one'
  from generate_series(1, 2000), noise_q;

analyze public.items, public.sessions, public.session_responses, public.assignments,
        public.assignment_attempts, public.attempt_responses;

-- ---------------------------------------------------------------------------
-- As the teacher
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000616e0001', 'role', 'authenticated')::text,
  true);

\echo 'Rows the quiz read returns (expect 20000):'
select count(*) from public.quiz_question_marks('00000000-0000-0000-0000-0000616eb0a0');

\echo 'Average row size of the quiz read, in bytes:'
select round(avg(pg_column_size(m.*))) as avg_row_bytes,
       pg_size_pretty(sum(pg_column_size(m.*))) as total
  from public.quiz_question_marks('00000000-0000-0000-0000-0000616eb0a0') m;

-- The function bodies' plans, nested, into the server log (docker logs supabase_db_learn).
load 'auto_explain';
set local auto_explain.log_min_duration = 0;
set local auto_explain.log_analyze = on;
set local auto_explain.log_nested_statements = on;

\echo 'The quiz read, three times (expect each under 300 ms):'
\timing on
select count(*) from public.quiz_question_marks('00000000-0000-0000-0000-0000616eb0a0');
select count(*) from public.quiz_question_marks('00000000-0000-0000-0000-0000616eb0a0');
select count(*) from public.quiz_question_marks('00000000-0000-0000-0000-0000616eb0a0');
\echo 'One question''s answers:'
select count(*) from public.question_answers((select id from q where n = 1));
\timing off

-- The same joins written out, explained inline, so the index use shows here as well as in the log.
reset role;
\echo 'Live side of the quiz read:'
explain (analyze, buffers, costs off)
select r.item_id, r.points
  from public.items i
  join public.session_responses r on r.item_id = i.id and r.org_id = i.org_id
  join public.sessions s on s.id = r.session_id and s.org_id = r.org_id
 where i.bank_id = '00000000-0000-0000-0000-0000616eb0a0'
   and i.org_id = '00000000-0000-0000-0000-0000616e00a0'
   and s.status = 'ended';

\echo 'Assignment side of the quiz read:'
explain (analyze, buffers, costs off)
select r.item_id, r.points
  from public.items i
  join public.attempt_responses r on r.item_id = i.id and r.org_id = i.org_id
  join public.assignment_attempts x on x.id = r.attempt_id and x.org_id = r.org_id
  join public.assignments a on a.id = x.assignment_id and a.org_id = x.org_id
 where i.bank_id = '00000000-0000-0000-0000-0000616eb0a0'
   and i.org_id = '00000000-0000-0000-0000-0000616e00a0'
   and r.points is not null and r.max_points is not null
   and x.submitted_at is not null
   and private.assignment_refusal(a.opens_at, a.closes_at) is not distinct from 'closed'
   and not exists (
     select 1 from public.assignment_attempts y
      where y.assignment_id = x.assignment_id and y.student_id = x.student_id
        and y.submitted_at is not null and y.number < x.number);

rollback;
