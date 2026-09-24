-- The assignment report (#211): public.assignment_report_rows.
--
-- An author of the assignment's org reads a row per attempt of every current member (and one empty
-- row for a member who has not started); no score or mark while the assignment is open, and the
-- scores and per-item marks once it has closed. A student (even one in the class, even for their
-- own attempt), an author of another org, an account with no role and anon read nothing, before or
-- after the close. now() is fixed for the transaction, so "closed" is made by moving closes_at into
-- the past with the guard trigger switched off, as the superuser.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002110a1', 'report-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002110a2', 'report-elsewhere@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002110d1', 'report-ada@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002110d2', 'report-grace@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002110d3', 'report-hal@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002110d4', 'report-removed@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002110d5', 'report-norole@example.test', 'authenticated', 'authenticated');

select private.make_instructor('report-teacher@example.test');
select private.make_instructor('report-elsewhere@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002110a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002110d1', '00000000-0000-0000-0000-0000002110d2',
              '00000000-0000-0000-0000-0000002110d3', '00000000-0000-0000-0000-0000002110d4');
-- 2110d5 keeps what sign-up gives since #204: no org and no role.
update public.profiles set display_name = 'Ada' where id = '00000000-0000-0000-0000-0000002110d1';

-- The second instructor belongs to another org.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000002110f0', 'Another school 211');
update public.profiles set org_id = '00000000-0000-0000-0000-0000002110f0'
 where id = '00000000-0000-0000-0000-0000002110a2';

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000002110c1', org_id, 'NUR 320'
    from public.profiles where id = '00000000-0000-0000-0000-0000002110a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002110c1', '00000000-0000-0000-0000-0000002110d1'),
  ('00000000-0000-0000-0000-0000002110c1', '00000000-0000-0000-0000-0000002110d2'),
  ('00000000-0000-0000-0000-0000002110c1', '00000000-0000-0000-0000-0000002110d3'),
  ('00000000-0000-0000-0000-0000002110c1', '00000000-0000-0000-0000-0000002110d4');

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000002110e0', org_id, 'Report bank 211'
    from public.profiles where id = '00000000-0000-0000-0000-0000002110a1';
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring, created_at)
  select v.id::uuid, '00000000-0000-0000-0000-0000002110e0', p.org_id, 'multiple_choice', 1,
         'published', '{}', '{"correctOptionId":"secret_key_211"}', '{}', now() - v.age::interval
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002110f1', '2 hours'),
                 ('00000000-0000-0000-0000-0000002110f2', '1 hour')) as v(id, age)
   where p.id = '00000000-0000-0000-0000-0000002110a1';

insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
  select '00000000-0000-0000-0000-0000002110b1', org_id, '00000000-0000-0000-0000-0000002110c1',
         '00000000-0000-0000-0000-0000002110e0', 'Report 211', now() - interval '1 hour',
         now() + interval '1 day', 2
    from public.profiles where id = '00000000-0000-0000-0000-0000002110a1';

-- Attempts, written directly as the superuser: Ada submitted twice, Grace has one open, Hal has
-- not started, and the removed student submitted before being taken off the class.
insert into public.assignment_attempts
  (id, org_id, assignment_id, student_id, number, submitted_at, score, max_score)
  select v.id::uuid, a.org_id, a.id, v.student::uuid, v.number, v.submitted::timestamptz,
         v.score, v.max_score
    from public.assignments a,
         (values ('00000000-0000-0000-0000-000000211a01', '00000000-0000-0000-0000-0000002110d1', 1,
                  now() - interval '30 minutes', 2.00, 2.00),
                 ('00000000-0000-0000-0000-000000211a02', '00000000-0000-0000-0000-0000002110d1', 2,
                  now() - interval '10 minutes', 1.00, 2.00),
                 ('00000000-0000-0000-0000-000000211a03', '00000000-0000-0000-0000-0000002110d2', 1,
                  null, null, null),
                 ('00000000-0000-0000-0000-000000211a04', '00000000-0000-0000-0000-0000002110d4', 1,
                  now() - interval '20 minutes', 0.00, 2.00))
           as v(id, student, number, submitted, score, max_score)
   where a.id = '00000000-0000-0000-0000-0000002110b1';
insert into public.attempt_responses
  (attempt_id, org_id, item_id, response, points, max_points, model, breakdown)
  select v.attempt::uuid, a.org_id, v.item::uuid, '{"type":"multiple_choice"}', v.points,
         v.max_points, v.model, v.breakdown::jsonb
    from public.assignments a,
         (values ('00000000-0000-0000-0000-000000211a01', '00000000-0000-0000-0000-0000002110f1', 1.00, 1.00, 'zero_one', '[]'),
                 ('00000000-0000-0000-0000-000000211a01', '00000000-0000-0000-0000-0000002110f2', 1.00, 1.00, 'zero_one', '[]'),
                 ('00000000-0000-0000-0000-000000211a02', '00000000-0000-0000-0000-0000002110f1', 1.00, 1.00, 'zero_one', '[]'),
                 ('00000000-0000-0000-0000-000000211a03', '00000000-0000-0000-0000-0000002110f1', null, null, null, null))
           as v(attempt, item, points, max_points, model, breakdown)
   where a.id = '00000000-0000-0000-0000-0000002110b1';

delete from public.class_members where profile_id = '00000000-0000-0000-0000-0000002110d4';

-- The control: the scores exist.
select is(
  (select count(*)::integer from public.assignment_attempts
    where assignment_id = '00000000-0000-0000-0000-0000002110b1' and score is not null),
  3,
  'control: three attempts hold a score'
);

-- ---------------------------------------------------------------------------
-- While it is open
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002110a1');

select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')),
  4,
  'the author reads a row per attempt of each current member, and one for a member not started'
);
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')
    where student_id = '00000000-0000-0000-0000-0000002110d3' and attempt_id is null),
  1,
  'a member who has not started has a row with no attempt'
);
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')
    where student_id = '00000000-0000-0000-0000-0000002110d4'),
  0,
  'a student taken off the class is not listed'
);
select is(
  (select row(display_name, email, attempt_number, submitted_at is not null)::text
     from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')
    where attempt_id = '00000000-0000-0000-0000-000000211a02'),
  row('Ada', 'report-ada@example.test', 2, true)::text,
  'each row names the student and says how the attempt stands'
);
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')
    where scores_released or score is not null or max_score is not null or marks is not null),
  0,
  'while it is open no row carries a score, a maximum or a mark'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002110d1');
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')),
  0,
  'a student in the class reads nothing'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002110a2');
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')),
  0,
  'an author of another org reads nothing'
);

-- ---------------------------------------------------------------------------
-- Once it has closed
-- ---------------------------------------------------------------------------

reset role;
set local session_replication_role = replica;
update public.assignments
   set closes_at = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-0000002110b1';
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002110a1');

select is(
  (select bool_and(scores_released)
     from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')),
  true,
  'once closed, the rows say the scores are released'
);
select is(
  (select row(score, max_score)::text
     from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')
    where attempt_id = '00000000-0000-0000-0000-000000211a01'),
  row(2.00, 2.00)::text,
  'the author reads a submitted attempt''s score and maximum'
);
select is(
  (select marks from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')
    where attempt_id = '00000000-0000-0000-0000-000000211a01'),
  jsonb_build_array(
    jsonb_build_object('item_id', '00000000-0000-0000-0000-0000002110f1', 'points', 1.00, 'max_points', 1.00),
    jsonb_build_object('item_id', '00000000-0000-0000-0000-0000002110f2', 'points', 1.00, 'max_points', 1.00)
  ),
  'and its per-item marks'
);
select is(
  (select row(score, max_score, marks)::text
     from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')
    where attempt_id = '00000000-0000-0000-0000-000000211a03'),
  row(null::numeric, null::numeric, null::jsonb)::text,
  'an attempt still open carries no score and no marks'
);
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')),
  4,
  'the same rows as before the close'
);
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110ff')),
  0,
  'an assignment that does not exist reads as nothing'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002110d1');
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')),
  0,
  'after the close a student still reads nothing, not even their own attempt'
);
select throws_ok(
  $$ select score from public.assignment_attempts $$,
  '42501', null,
  'and the column grant still keeps a score from them'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002110d4');
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')),
  0,
  'a removed student reads nothing'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002110a2');
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')),
  0,
  'an author of another org reads nothing after the close either'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002110d5');
select is(
  (select count(*)::integer from public.assignment_report_rows('00000000-0000-0000-0000-0000002110b1')),
  0,
  'an account with no role reads nothing'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.assignment_report_rows(uuid)', 'execute'),
  'anon cannot call it'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.assignment_report_rows(uuid)'::regprocedure),
  'it runs with definer rights, so the column grant can stay closed'
);
select ok(
  (select proconfig @> array['search_path=""']
     from pg_proc where oid = 'public.assignment_report_rows(uuid)'::regprocedure),
  'with an empty search_path'
);

select * from finish();
rollback;
