-- A student's history (#238): public.my_assignment_history.
--
-- A student reads the closed assignments of their current classes with their own attempts, and
-- nothing else: no assignment that is still open (or within its two seconds of grace), no other
-- student's attempt, no class they are not in now. An author, an account with no role and anon
-- read nothing. now() is fixed for the transaction, so "closed" is made by moving closes_at into
-- the past with the guard trigger switched off, as the superuser.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002380a1', 'history-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002380a2', 'history-elsewhere@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002380d1', 'history-ada@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002380d2', 'history-grace@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002380d3', 'history-hal@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002380d4', 'history-removed@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002380d5', 'history-outsider@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002380d6', 'history-norole@example.test', 'authenticated', 'authenticated');

select private.make_instructor('history-teacher@example.test');
select private.make_instructor('history-elsewhere@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002380a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002380d1', '00000000-0000-0000-0000-0000002380d2',
              '00000000-0000-0000-0000-0000002380d3', '00000000-0000-0000-0000-0000002380d4',
              '00000000-0000-0000-0000-0000002380d5');
-- 2380d6 keeps what sign-up gives since #204: no org and no role.

insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000002380f0', 'Another school 238');
update public.profiles set org_id = '00000000-0000-0000-0000-0000002380f0'
 where id = '00000000-0000-0000-0000-0000002380a2';

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- How many rows the caller reads, in all or for one assignment.
create function pg_temp.rows_read(target uuid default null) returns integer
language sql as $$
  select count(*)::integer
    from public.my_assignment_history() h
   where target is null or h.assignment_id = target;
$$;

-- Two classes: NUR 340 (c1) with everyone but the outsider, and NUR 350 (c2) with the outsider.
insert into public.classes (id, org_id, name)
  select v.id::uuid, p.org_id, v.name
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002380c1', 'NUR 340'),
                 ('00000000-0000-0000-0000-0000002380c2', 'NUR 350')) as v(id, name)
   where p.id = '00000000-0000-0000-0000-0000002380a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002380c1', '00000000-0000-0000-0000-0000002380d1'),
  ('00000000-0000-0000-0000-0000002380c1', '00000000-0000-0000-0000-0000002380d2'),
  ('00000000-0000-0000-0000-0000002380c1', '00000000-0000-0000-0000-0000002380d3'),
  ('00000000-0000-0000-0000-0000002380c1', '00000000-0000-0000-0000-0000002380d4'),
  ('00000000-0000-0000-0000-0000002380c2', '00000000-0000-0000-0000-0000002380d5');

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000002380e0', org_id, 'History bank 238'
    from public.profiles where id = '00000000-0000-0000-0000-0000002380a1';
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, rationale, scoring)
  select '00000000-0000-0000-0000-0000002380e1', '00000000-0000-0000-0000-0000002380e0', org_id,
         'multiple_choice', 1, 'published', '{}', '{"correctOptionId":"secret_key_238"}',
         '{"general":{"value":"secret_rationale_238"}}', '{}'
    from public.profiles where id = '00000000-0000-0000-0000-0000002380a1';

-- b1 and b2 close first and second in c1; b3 stays open in c1; b4 closes in c2. All are made open
-- now and closed below, after the attempts are in.
insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
  select v.id::uuid, p.org_id, v.class::uuid, '00000000-0000-0000-0000-0000002380e0', v.title,
         now() - interval '2 hours', now() + interval '1 day', 2
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002380b1', '00000000-0000-0000-0000-0000002380c1', 'Week 1 238'),
                 ('00000000-0000-0000-0000-0000002380b2', '00000000-0000-0000-0000-0000002380c1', 'Week 2 238'),
                 ('00000000-0000-0000-0000-0000002380b3', '00000000-0000-0000-0000-0000002380c1', 'Week 3 238'),
                 ('00000000-0000-0000-0000-0000002380b4', '00000000-0000-0000-0000-0000002380c2', 'Other 238'))
           as v(id, class, title)
   where p.id = '00000000-0000-0000-0000-0000002380a1';

-- Attempts, written directly as the superuser: Ada submitted b1 twice and b3 (still open) once,
-- Hal left b1 open, the removed student submitted b1, and the outsider submitted b4.
insert into public.assignment_attempts
  (id, org_id, assignment_id, student_id, number, submitted_at, score, max_score)
  select v.id::uuid, p.org_id, v.assignment::uuid, v.student::uuid, v.number,
         v.submitted::timestamptz, v.score, v.max_score
    from public.profiles p,
         (values ('00000000-0000-0000-0000-000000238a01', '00000000-0000-0000-0000-0000002380b1',
                  '00000000-0000-0000-0000-0000002380d1', 1, now() - interval '90 minutes', 1.50, 2.00),
                 ('00000000-0000-0000-0000-000000238a02', '00000000-0000-0000-0000-0000002380b1',
                  '00000000-0000-0000-0000-0000002380d1', 2, now() - interval '80 minutes', 1.00, 2.00),
                 ('00000000-0000-0000-0000-000000238a03', '00000000-0000-0000-0000-0000002380b3',
                  '00000000-0000-0000-0000-0000002380d1', 1, now() - interval '70 minutes', 2.00, 2.00),
                 ('00000000-0000-0000-0000-000000238a04', '00000000-0000-0000-0000-0000002380b1',
                  '00000000-0000-0000-0000-0000002380d3', 1, null, null, null),
                 ('00000000-0000-0000-0000-000000238a05', '00000000-0000-0000-0000-0000002380b1',
                  '00000000-0000-0000-0000-0000002380d4', 1, now() - interval '60 minutes', 0.50, 2.00),
                 ('00000000-0000-0000-0000-000000238a06', '00000000-0000-0000-0000-0000002380b4',
                  '00000000-0000-0000-0000-0000002380d5', 1, now() - interval '50 minutes', 1.00, 2.00))
           as v(id, assignment, student, number, submitted, score, max_score)
   where p.id = '00000000-0000-0000-0000-0000002380a1';

-- The removed student is taken off the class (the trigger records the removal).
delete from public.class_members where profile_id = '00000000-0000-0000-0000-0000002380d4';

-- The control: the open assignment's score exists, and so does the removed student's.
select is(
  (select row(score, max_score)::text from public.assignment_attempts
    where id = '00000000-0000-0000-0000-000000238a03'),
  row(2.00, 2.00)::text,
  'control: the attempt at the open assignment holds a score'
);

-- ---------------------------------------------------------------------------
-- Before anything closes, and within the grace
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002380d1');
select is(pg_temp.rows_read(), 0, 'while everything is open a student reads nothing');

reset role;
set local session_replication_role = replica;
update public.assignments set closes_at = now() - interval '1 second'
 where id = '00000000-0000-0000-0000-0000002380b1';
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002380d1');
select is(pg_temp.rows_read(), 0, 'within the two seconds of grace a student still reads nothing');

-- ---------------------------------------------------------------------------
-- Once b1, b2 and b4 have closed
-- ---------------------------------------------------------------------------

reset role;
set local session_replication_role = replica;
update public.assignments set closes_at = now() - interval '1 hour'
 where id = '00000000-0000-0000-0000-0000002380b1';
update public.assignments set closes_at = now() - interval '10 minutes'
 where id in ('00000000-0000-0000-0000-0000002380b2', '00000000-0000-0000-0000-0000002380b4');
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002380d1');

select is(pg_temp.rows_read(), 3, 'a student reads their two attempts at b1 and one row for b2');
select is(
  (select array_agg(row(assignment_id, attempt_id)::text order by ordinality)
     from public.my_assignment_history() with ordinality),
  array[
    row('00000000-0000-0000-0000-0000002380b2'::uuid, null::uuid)::text,
    row('00000000-0000-0000-0000-0000002380b1'::uuid, '00000000-0000-0000-0000-000000238a01'::uuid)::text,
    row('00000000-0000-0000-0000-0000002380b1'::uuid, '00000000-0000-0000-0000-000000238a02'::uuid)::text
  ],
  'most recently closed first, oldest attempt first, and an empty row for one never started'
);
select is(
  (select row(class_id, title, max_attempts, attempt_number, score, max_score)::text
     from public.my_assignment_history()
    where attempt_id = '00000000-0000-0000-0000-000000238a01'),
  row('00000000-0000-0000-0000-0000002380c1'::uuid, 'Week 1 238', 2::smallint, 1::smallint,
      1.50, 2.00)::text,
  'a submitted attempt carries its class, title, attempts, number, score and maximum'
);
select is(
  pg_temp.rows_read('00000000-0000-0000-0000-0000002380b3'),
  0,
  'the assignment still open is not in it, so its score is not either'
);
select is(
  (select count(*)::integer from public.my_assignment_history()
    where attempt_id is not null
      and attempt_id not in ('00000000-0000-0000-0000-000000238a01',
                             '00000000-0000-0000-0000-000000238a02')),
  0,
  'no other student''s attempt is in what they read'
);
select is(
  pg_temp.rows_read('00000000-0000-0000-0000-0000002380b4'),
  0,
  'nor a closed assignment of a class they are not in'
);
select is(
  (select count(*)::integer from public.my_assignment_history() h
    where h::text like '%secret_key_238%' or h::text like '%secret_rationale_238%'),
  0,
  'and no key or rationale'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002380d2');
select is(
  (select array_agg(row(assignment_id, attempt_id, attempt_number, submitted_at, score, max_score)::text
                    order by closes_at desc)
     from public.my_assignment_history()),
  array[
    row('00000000-0000-0000-0000-0000002380b2'::uuid, null::uuid, null::smallint,
        null::timestamptz, null::numeric, null::numeric)::text,
    row('00000000-0000-0000-0000-0000002380b1'::uuid, null::uuid, null::smallint,
        null::timestamptz, null::numeric, null::numeric)::text
  ],
  'a member who never started reads each closed assignment once, with empty attempt columns'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002380d3');
select is(
  (select row(attempt_id, submitted_at, score, max_score)::text
     from public.my_assignment_history()
    where assignment_id = '00000000-0000-0000-0000-0000002380b1'),
  row('00000000-0000-0000-0000-000000238a04'::uuid, null::timestamptz, null::numeric,
      null::numeric)::text,
  'an attempt still open (not yet submitted at close) carries no score'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002380d4');
select is(pg_temp.rows_read(), 0, 'a student taken off the class reads none of its history');

select pg_temp.act_as('00000000-0000-0000-0000-0000002380d5');
select is(
  (select row(assignment_id, attempt_id, score)::text from public.my_assignment_history()),
  row('00000000-0000-0000-0000-0000002380b4'::uuid, '00000000-0000-0000-0000-000000238a06'::uuid,
      1.00)::text,
  'a student of another class reads that class''s closed assignment'
);
select is(pg_temp.rows_read(), 1, 'and only that');

select pg_temp.act_as('00000000-0000-0000-0000-0000002380a1');
select is(pg_temp.rows_read(), 0, 'the author reads nothing through a student''s function');

select pg_temp.act_as('00000000-0000-0000-0000-0000002380a2');
select is(pg_temp.rows_read(), 0, 'an author of another org reads nothing');

select pg_temp.act_as('00000000-0000-0000-0000-0000002380d6');
select is(pg_temp.rows_read(), 0, 'an account with no role reads nothing');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(pg_temp.rows_read(), 0, 'a call with no subject reads nothing');

reset role;
select ok(
  not has_function_privilege('anon', 'public.my_assignment_history()', 'execute'),
  'anon cannot call it'
);
select ok(
  has_function_privilege('authenticated', 'public.my_assignment_history()', 'execute'),
  'a signed-in account can'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.my_assignment_history()'::regprocedure),
  'it runs with definer rights, so the column grant can stay closed'
);
select ok(
  (select proconfig @> array['search_path=""']
     from pg_proc where oid = 'public.my_assignment_history()'::regprocedure),
  'with an empty search_path'
);
select ok(
  (select pg_get_function_result(p.oid) not similar to '%(marks|item_set|patient_record|response)%'
     from pg_proc p where p.oid = 'public.my_assignment_history()'::regprocedure),
  'it returns no answers, marks, item set or patient record: a score and its maximum at most'
);

select * from finish();
rollback;
