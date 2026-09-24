-- A student's clinical judgment steps (#239): public.my_step_marks.
--
-- A student reads the per-item marks of their own submitted attempts at the closed assignments of
-- their current classes, each with the item's step, and nothing else: no assignment still open (or
-- within its two seconds of grace), no other student's marks, no attempt left open, no class they
-- are not in now, and no item id, key or rationale. An author, an account with no role and anon read
-- nothing. now() is fixed for the transaction, so "closed" is made by moving closes_at into the past
-- with the guard trigger switched off, as the superuser.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002390a1', 'steps-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002390d1', 'steps-ada@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002390d2', 'steps-grace@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002390d3', 'steps-hal@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002390d4', 'steps-removed@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002390d5', 'steps-outsider@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002390d6', 'steps-norole@example.test', 'authenticated', 'authenticated');

select private.make_instructor('steps-teacher@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002390a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002390d1', '00000000-0000-0000-0000-0000002390d2',
              '00000000-0000-0000-0000-0000002390d3', '00000000-0000-0000-0000-0000002390d4',
              '00000000-0000-0000-0000-0000002390d5');
-- 2390d6 keeps what sign-up gives since #204: no org and no role.

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- How many attempts the caller reads, in all or for one assignment.
create function pg_temp.rows_read(target uuid default null) returns integer
language sql as $$
  select count(*)::integer
    from public.my_step_marks() s
   where target is null or s.assignment_id = target;
$$;

-- Two classes: NUR 340 (c1) with everyone but the outsider, and NUR 350 (c2) with the outsider.
insert into public.classes (id, org_id, name)
  select v.id::uuid, p.org_id, v.name
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002390c1', 'NUR 340'),
                 ('00000000-0000-0000-0000-0000002390c2', 'NUR 350')) as v(id, name)
   where p.id = '00000000-0000-0000-0000-0000002390a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002390c1', '00000000-0000-0000-0000-0000002390d1'),
  ('00000000-0000-0000-0000-0000002390c1', '00000000-0000-0000-0000-0000002390d2'),
  ('00000000-0000-0000-0000-0000002390c1', '00000000-0000-0000-0000-0000002390d3'),
  ('00000000-0000-0000-0000-0000002390c1', '00000000-0000-0000-0000-0000002390d4'),
  ('00000000-0000-0000-0000-0000002390c2', '00000000-0000-0000-0000-0000002390d5');

-- Two items: e1 is a Recognize Cues item, e2 has no step.
insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000002390e0', org_id, 'Steps bank 239'
    from public.profiles where id = '00000000-0000-0000-0000-0000002390a1';
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, rationale, scoring)
  select v.id::uuid, '00000000-0000-0000-0000-0000002390e0', p.org_id,
         'multiple_choice', v.step, 'published', '{}', '{"correctOptionId":"secret_key_239"}',
         '{"general":{"value":"secret_rationale_239"}}', '{}'
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002390e1', 1),
                 ('00000000-0000-0000-0000-0000002390e2', null::smallint)) as v(id, step)
   where p.id = '00000000-0000-0000-0000-0000002390a1';

-- b1 and b2 close in c1; b3 stays open in c1; b4 closes in c2. All are made open now and closed
-- below, after the attempts are in.
insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
  select v.id::uuid, p.org_id, v.class::uuid, '00000000-0000-0000-0000-0000002390e0', v.title,
         now() - interval '2 hours', now() + interval '1 day', 2
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002390b1', '00000000-0000-0000-0000-0000002390c1', 'Week 1 239'),
                 ('00000000-0000-0000-0000-0000002390b2', '00000000-0000-0000-0000-0000002390c1', 'Week 2 239'),
                 ('00000000-0000-0000-0000-0000002390b3', '00000000-0000-0000-0000-0000002390c1', 'Week 3 239'),
                 ('00000000-0000-0000-0000-0000002390b4', '00000000-0000-0000-0000-0000002390c2', 'Other 239'))
           as v(id, class, title)
   where p.id = '00000000-0000-0000-0000-0000002390a1';

-- Attempts, written directly as the superuser: Ada submitted b1 twice and b3 (still open) once,
-- Grace submitted b1, Hal left b1 open, the removed student submitted b1, and the outsider b4.
insert into public.assignment_attempts
  (id, org_id, assignment_id, student_id, number, submitted_at, score, max_score)
  select v.id::uuid, p.org_id, v.assignment::uuid, v.student::uuid, v.number,
         v.submitted::timestamptz, v.score, v.max_score
    from public.profiles p,
         (values ('00000000-0000-0000-0000-000000239a01', '00000000-0000-0000-0000-0000002390b1',
                  '00000000-0000-0000-0000-0000002390d1', 1, now() - interval '90 minutes', 1.00, 2.00),
                 ('00000000-0000-0000-0000-000000239a02', '00000000-0000-0000-0000-0000002390b1',
                  '00000000-0000-0000-0000-0000002390d1', 2, now() - interval '80 minutes', 2.00, 2.00),
                 ('00000000-0000-0000-0000-000000239a03', '00000000-0000-0000-0000-0000002390b3',
                  '00000000-0000-0000-0000-0000002390d1', 1, now() - interval '70 minutes', 0.25, 2.00),
                 ('00000000-0000-0000-0000-000000239a04', '00000000-0000-0000-0000-0000002390b1',
                  '00000000-0000-0000-0000-0000002390d3', 1, null, null, null),
                 ('00000000-0000-0000-0000-000000239a05', '00000000-0000-0000-0000-0000002390b1',
                  '00000000-0000-0000-0000-0000002390d4', 1, now() - interval '60 minutes', 0.50, 2.00),
                 ('00000000-0000-0000-0000-000000239a06', '00000000-0000-0000-0000-0000002390b4',
                  '00000000-0000-0000-0000-0000002390d5', 1, now() - interval '50 minutes', 1.00, 2.00),
                 ('00000000-0000-0000-0000-000000239a07', '00000000-0000-0000-0000-0000002390b1',
                  '00000000-0000-0000-0000-0000002390d2', 1, now() - interval '40 minutes', 0.75, 2.00))
           as v(id, assignment, student, number, submitted, score, max_score)
   where p.id = '00000000-0000-0000-0000-0000002390a1';

-- Each attempt's answers: one to e1 and one to e2, with its mark (Hal's has none: still open).
insert into public.attempt_responses (attempt_id, org_id, item_id, response, points, max_points)
  select a.id, a.org_id, v.item::uuid, '{"type":"multiple_choice","optionId":"o1"}',
         case when a.submitted_at is null then null else v.points end,
         case when a.submitted_at is null then null else 1.00 end
    from public.assignment_attempts a,
         (values ('00000000-0000-0000-0000-0000002390e1', 0.00),
                 ('00000000-0000-0000-0000-0000002390e2', 1.00)) as v(item, points)
   where a.id::text like '00000000-0000-0000-0000-000000239a0%';
update public.attempt_responses set points = 1.00
 where attempt_id = '00000000-0000-0000-0000-000000239a02'
   and item_id = '00000000-0000-0000-0000-0000002390e1';
update public.attempt_responses set points = 0.25
 where attempt_id = '00000000-0000-0000-0000-000000239a03';

-- The removed student is taken off the class (the trigger records the removal).
delete from public.class_members where profile_id = '00000000-0000-0000-0000-0000002390d4';

-- The control: the open assignment's attempt holds marks.
select is(
  (select count(*)::integer from public.attempt_responses
    where attempt_id = '00000000-0000-0000-0000-000000239a03' and points is not null),
  2,
  'control: the attempt at the open assignment holds marks'
);

-- ---------------------------------------------------------------------------
-- Before anything closes, and within the grace
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002390d1');
select is(pg_temp.rows_read(), 0, 'while everything is open a student reads nothing');

reset role;
set local session_replication_role = replica;
update public.assignments set closes_at = now() - interval '1 second'
 where id = '00000000-0000-0000-0000-0000002390b1';
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002390d1');
select is(pg_temp.rows_read(), 0, 'within the two seconds of grace a student still reads nothing');

-- ---------------------------------------------------------------------------
-- Once b1, b2 and b4 have closed
-- ---------------------------------------------------------------------------

reset role;
set local session_replication_role = replica;
update public.assignments set closes_at = now() - interval '1 hour'
 where id = '00000000-0000-0000-0000-0000002390b1';
update public.assignments set closes_at = now() - interval '10 minutes'
 where id in ('00000000-0000-0000-0000-0000002390b2', '00000000-0000-0000-0000-0000002390b4');
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002390d1');

select is(pg_temp.rows_read(), 2, 'a student reads their two submitted attempts at b1, and nothing for b2');
select is(
  (select array_agg(row(assignment_id, attempt_number, score, max_score)::text order by attempt_number)
     from public.my_step_marks()),
  array[
    row('00000000-0000-0000-0000-0000002390b1'::uuid, 1::smallint, 1.00, 2.00)::text,
    row('00000000-0000-0000-0000-0000002390b1'::uuid, 2::smallint, 2.00, 2.00)::text
  ],
  'each attempt carries its number and total, so the app can choose the best'
);
select is(
  (select marks from public.my_step_marks() where attempt_number = 2),
  '[{"cjmm_step": 1, "points": 1.00, "max_points": 1.00},
    {"cjmm_step": null, "points": 1.00, "max_points": 1.00}]'::jsonb,
  'its marks carry the item''s step (null for an untagged item) and the points, one per item'
);
select is(
  pg_temp.rows_read('00000000-0000-0000-0000-0000002390b3'),
  0,
  'the assignment still open contributes nothing, though its attempt holds marks'
);
select is(
  (select count(*)::integer from public.my_step_marks() s
    where s.marks::text like '%0.25%'),
  0,
  'not even one of its marks'
);
select is(
  (select count(*)::integer from public.my_step_marks() s
    where s::text like '%secret_key_239%' or s::text like '%secret_rationale_239%'
       or s::text like '%2390e1%' or s::text like '%2390e2%' or s::text like '%optionId%'),
  0,
  'and no key, rationale, item id or answer'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002390d2');
select is(
  (select array_agg(row(attempt_number, score)::text) from public.my_step_marks()),
  array[row(1::smallint, 0.75)::text],
  'another member reads only their own attempt'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002390d3');
select is(pg_temp.rows_read(), 0, 'an attempt still open (not yet submitted at close) is not read');

select pg_temp.act_as('00000000-0000-0000-0000-0000002390d4');
select is(pg_temp.rows_read(), 0, 'a student taken off the class reads none of its marks');

select pg_temp.act_as('00000000-0000-0000-0000-0000002390d5');
select is(
  (select array_agg(row(assignment_id, score)::text) from public.my_step_marks()),
  array[row('00000000-0000-0000-0000-0000002390b4'::uuid, 1.00)::text],
  'a student of another class reads only that class''s closed assignment'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002390a1');
select is(pg_temp.rows_read(), 0, 'the author reads nothing through a student''s function');

select pg_temp.act_as('00000000-0000-0000-0000-0000002390d6');
select is(pg_temp.rows_read(), 0, 'an account with no role reads nothing');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(pg_temp.rows_read(), 0, 'a call with no subject reads nothing');

reset role;
select ok(
  not has_function_privilege('anon', 'public.my_step_marks()', 'execute'),
  'anon cannot call it'
);
select ok(
  has_function_privilege('authenticated', 'public.my_step_marks()', 'execute'),
  'a signed-in account can'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.my_step_marks()'::regprocedure),
  'it runs with definer rights, so the column grant can stay closed'
);
select ok(
  (select proconfig @> array['search_path=""']
     from pg_proc where oid = 'public.my_step_marks()'::regprocedure),
  'with an empty search_path'
);
select ok(
  (select pg_get_function_result(p.oid) not similar to '%(item_id|item_set|patient_record|response|answer)%'
     from pg_proc p where p.oid = 'public.my_step_marks()'::regprocedure),
  'it returns no item ids, item set, patient record or answers'
);
select ok(
  not has_table_privilege('authenticated', 'public.attempt_responses', 'select')
    and not has_column_privilege('authenticated', 'public.attempt_responses', 'points', 'select'),
  'the marks themselves stay out of a student''s direct reach'
);

select * from finish();
rollback;
