-- A whole-quiz assignment plays each case study in place (#470).
--
-- What is held here:
--   1. The item set follows the quiz order, each ready case study expanded in place into its
--      steps; a draft question and a case study with a draft step are skipped.
--   2. Each case study played gets its own record, snapshotted on insert beside its place in the
--      set; the assignment has no single patient_record, and no step's key is in the records.
--   3. Neither a student nor an author can read the records with their own client (the column is
--      not granted, as patient_record is not), nor write them on insert, nor change them after.
--   4. A later edit to the case study does not reach the assignment.
--   5. A quiz with nothing ready is refused; a case study assigned on its own is as it was.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (…470xxx); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

create function pg_temp.u(suffix text) returns uuid
language sql immutable as $$ select ('00000000-0000-0000-0000-000000470' || suffix)::uuid $$;

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.steps(letter text) returns jsonb
language sql immutable as $$
  select jsonb_agg(pg_temp.u(letter || lpad(n::text, 2, '0')) order by n)
    from generate_series(1, 6) n
$$;

-- The records are not granted to authenticated, so they are read as the superuser who owns these.
create function pg_temp.runs(target_title text) returns jsonb
language sql stable security definer as $$
  select coalesce(jsonb_agg(r - 'record' order by (r ->> 'first_position')::integer), '[]'::jsonb)
    from public.assignments a, jsonb_array_elements(a.case_study_records) r
   where a.title = target_title
$$;
create function pg_temp.settings(target_title text) returns text[]
language sql stable security definer as $$
  select array_agg(r #>> '{record,patientHeader,setting}' order by (r ->> 'first_position')::integer)
    from public.assignments a, jsonb_array_elements(a.case_study_records) r
   where a.title = target_title
$$;
create function pg_temp.row_of(target_title text) returns public.assignments
language sql stable security definer as $$
  select * from public.assignments where title = target_title
$$;

insert into auth.users (id, email, aud, role) values
  (pg_temp.u('aaa'), 'quiz-assign-a@example.test', 'authenticated', 'authenticated'),
  (pg_temp.u('ddd'), 'quiz-assign-s@example.test', 'authenticated', 'authenticated');
insert into public.orgs (id, name) values (pg_temp.u('f01'), 'Quiz assign workspace');
update public.profiles set org_id = pg_temp.u('f01'), role = 'instructor'
 where id = pg_temp.u('aaa');
update public.profiles set org_id = pg_temp.u('f01'), role = 'student'
 where id = pg_temp.u('ddd');

insert into public.classes (id, org_id, name) values (pg_temp.u('c01'), pg_temp.u('f01'), 'NUR 470');
insert into public.class_members (class_id, profile_id) values (pg_temp.u('c01'), pg_temp.u('ddd'));

insert into public.item_banks (id, org_id, name) values
  (pg_temp.u('b01'), pg_temp.u('f01'), 'Mixed quiz'),
  (pg_temp.u('b02'), pg_temp.u('f01'), 'Nothing ready');

insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
values
  (pg_temp.u('101'), pg_temp.u('b01'), pg_temp.u('f01'), 'multiple_choice', 'published',
   '{}', '{"correctOptionId":"secret_key"}', '{}'),
  (pg_temp.u('102'), pg_temp.u('b01'), pg_temp.u('f01'), 'multiple_choice', 'draft',
   '{}', '{"correctOptionId":"secret_key"}', '{}');

-- A and D ready; B with a draft step; E alone in a quiz of its own, with a draft step.
insert into public.case_studies (id, bank_id, org_id, title, ehr, status) values
  (pg_temp.u('ca0'), pg_temp.u('b01'), pg_temp.u('f01'), 'Case A',
   '{"patientHeader":{"age":61,"sex":"male","setting":"Ward A"}}', 'published'),
  (pg_temp.u('cb0'), pg_temp.u('b01'), pg_temp.u('f01'), 'Case B',
   '{"patientHeader":{"age":62,"sex":"male","setting":"Ward B"}}', 'published'),
  (pg_temp.u('cd0'), pg_temp.u('b01'), pg_temp.u('f01'), 'Case D',
   '{"patientHeader":{"age":64,"sex":"female","setting":"Ward D"}}', 'published'),
  (pg_temp.u('ce0'), pg_temp.u('b02'), pg_temp.u('f01'), 'Case E',
   '{"patientHeader":{"age":65,"sex":"female","setting":"Ward E"}}', 'published');

insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
select pg_temp.u(c.letter || lpad(n::text, 2, '0')), c.bank, pg_temp.u('f01'), 'multiple_choice', n,
       case when (c.letter, n) in (('b', 3), ('e', 6)) then 'draft' else 'published' end::public.content_status,
       '{}', '{"correctOptionId":"secret_key"}', '{}'
  from (values ('a', pg_temp.u('b01')), ('b', pg_temp.u('b01')), ('d', pg_temp.u('b01')),
               ('e', pg_temp.u('b02'))) as c(letter, bank),
       generate_series(1, 6) n;
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
select pg_temp.u('c' || c.letter || '0'), pg_temp.u('f01'), c.bank, n,
       pg_temp.u(c.letter || lpad(n::text, 2, '0'))
  from (values ('a', pg_temp.u('b01')), ('b', pg_temp.u('b01')), ('d', pg_temp.u('b01')),
               ('e', pg_temp.u('b02'))) as c(letter, bank),
       generate_series(1, 6) n;

-- The quiz order: A, the draft question, B, the question, D.
update public.case_studies set quiz_position = 1 where id = pg_temp.u('ca0');
update public.items set quiz_position = 2 where id = pg_temp.u('102');
update public.case_studies set quiz_position = 3 where id = pg_temp.u('cb0');
update public.items set quiz_position = 4 where id = pg_temp.u('101');
update public.case_studies set quiz_position = 5 where id = pg_temp.u('cd0');

-- ---------------------------------------------------------------------------
-- 1 and 2. The set and its records
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(pg_temp.u('aaa'));

select lives_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
     values (pg_temp.u('c01'), pg_temp.u('b01'), 'Whole 470',
             now() - interval '1 hour', now() + interval '1 day') $$,
  'a teacher assigns a whole quiz with case studies in it'
);

select is(
  (select item_set from public.assignments where title = 'Whole 470'),
  pg_temp.steps('a') || jsonb_build_array(pg_temp.u('101')) || pg_temp.steps('d'),
  'the set follows the quiz order, each ready case study in place as its six steps; the draft '
  'question and the case study with a draft step are left out'
);

select is(
  pg_temp.runs('Whole 470'),
  jsonb_build_array(
    jsonb_build_object('case_study_id', pg_temp.u('ca0'), 'title', 'Case A',
                       'first_position', 1, 'step_count', 6),
    jsonb_build_object('case_study_id', pg_temp.u('cd0'), 'title', 'Case D',
                       'first_position', 8, 'step_count', 6)),
  'each case study played is named with where its steps sit in the set'
);

select is(
  pg_temp.settings('Whole 470'),
  array['Ward A', 'Ward D'],
  'and carries its own patient record'
);

select is(
  (select row((pg_temp.row_of('Whole 470')).patient_record is null,
              (pg_temp.row_of('Whole 470')).case_study_records::text like '%secret_key%')::text),
  row(true, false)::text,
  'the assignment has no single record, and its records hold no step''s answer key'
);

-- ---------------------------------------------------------------------------
-- 3. Nobody's own client reads, writes or changes the records
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select case_study_records from public.assignments where title = 'Whole 470' $$,
  '42501',
  null,
  'an author''s own client cannot read the records'
);

select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at, case_study_records)
     values (pg_temp.u('c01'), pg_temp.u('b01'), 'Forged 470',
             now() - interval '1 hour', now() + interval '1 day', '[{"forged":true}]') $$,
  '42501',
  null,
  'nor write records of their own on insert'
);

select throws_ok(
  $$ update public.assignments set case_study_records = '[]' where title = 'Whole 470' $$,
  '42501',
  null,
  'nor change them after'
);

select pg_temp.act_as(pg_temp.u('ddd'));

select is(
  (select jsonb_array_length(item_set) from public.assignments where title = 'Whole 470'),
  13,
  'a student of the class reads the assignment and its set'
);

select throws_ok(
  $$ select case_study_records from public.assignments where title = 'Whole 470' $$,
  '42501',
  null,
  'but not the records: no step''s chart before the student has reached it'
);

reset role;

select throws_ok(
  $$ update public.assignments set case_study_records = '[]' where title = 'Whole 470' $$,
  '22023',
  'an assignment''s class, source, items and title cannot change',
  'and even a write that passes the grants cannot change the records'
);

-- ---------------------------------------------------------------------------
-- 4 and 5. A later edit, nothing ready, a case study on its own
-- ---------------------------------------------------------------------------

update public.case_studies
   set ehr = '{"patientHeader":{"age":61,"sex":"male","setting":"Changed"}}'
 where id = pg_temp.u('ca0');

select is(
  pg_temp.settings('Whole 470'),
  array['Ward A', 'Ward D'],
  'a later edit to the case study does not reach the assignment'
);

set local role authenticated;
select pg_temp.act_as(pg_temp.u('aaa'));

select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
     values (pg_temp.u('c01'), pg_temp.u('b02'), 'Nothing 470',
             now() - interval '1 hour', now() + interval '1 day') $$,
  '22023',
  'that source has no published items to assign',
  'a quiz whose only case study has a draft step has nothing to assign'
);

insert into public.assignments (class_id, case_study_id, title, opens_at, closes_at)
values (pg_temp.u('c01'), pg_temp.u('cd0'), 'Case 470',
        now() - interval '1 hour', now() + interval '1 day');

reset role;

select is(
  (select row((pg_temp.row_of('Case 470')).item_set,
              (pg_temp.row_of('Case 470')).case_study_records is null,
              (pg_temp.row_of('Case 470')).patient_record #>> '{patientHeader,setting}')::text),
  row(pg_temp.steps('d'), true, 'Ward D')::text,
  'a case study assigned on its own is as before: its six steps and its one record'
);

select * from finish();
rollback;
