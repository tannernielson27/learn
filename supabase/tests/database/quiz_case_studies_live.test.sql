-- A whole-quiz live session plays each case study in place (#469).
--
-- What is held here:
--   1. The item set follows the quiz order, each ready case study expanded in place into its
--      steps in step order. A draft question, a case study that is a draft, archived, has a draft
--      step or has no steps are all skipped.
--   2. Each case study played gets its own record, snapshotted at the start beside its place in
--      the set; a loose question has none, and the session has no single patient_record.
--   3. The snapshot does not follow a later edit, a host cannot change it, and a row written
--      straight at the table gets the records of the case studies its set really plays, whatever
--      it carried: none for a partial or reordered run, or another quiz's case study.
--   4. A quiz holding only a ready case study runs it; one with nothing ready is refused.
--   5. A student-paced room of the quiz carries the records too; a case study run on its own is
--      as it was, with its one patient_record.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (…469xxx); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

create function pg_temp.u(suffix text) returns uuid
language sql immutable as $$ select ('00000000-0000-0000-0000-000000469' || suffix)::uuid $$;

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- A case study's six step ids, step 1 first: its letter, then 01 to 06.
create function pg_temp.steps(letter text) returns jsonb
language sql immutable as $$
  select jsonb_agg(pg_temp.u(letter || lpad(n::text, 2, '0')) order by n)
    from generate_series(1, 6) n
$$;

-- A session's case studies without their records: who, where and how long.
create function pg_temp.runs(target uuid) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(r - 'record' order by (r ->> 'first_position')::integer), '[]'::jsonb)
    from public.sessions s, jsonb_array_elements(s.case_study_records) r
   where s.id = target
$$;

-- The setting each of a session's case-study records names, in set order.
create function pg_temp.settings(target uuid) returns text[]
language sql stable as $$
  select array_agg(r #>> '{record,patientHeader,setting}' order by (r ->> 'first_position')::integer)
    from public.sessions s, jsonb_array_elements(s.case_study_records) r
   where s.id = target
$$;

insert into auth.users (id, email, aud, role) values
  (pg_temp.u('aaa'), 'quiz-cases-a@example.test', 'authenticated', 'authenticated');
insert into public.orgs (id, name) values (pg_temp.u('f01'), 'Quiz cases workspace');
update public.profiles set org_id = pg_temp.u('f01'), role = 'instructor'
 where id = pg_temp.u('aaa');

insert into public.item_banks (id, org_id, name) values
  (pg_temp.u('b01'), pg_temp.u('f01'), 'Mixed quiz'),
  (pg_temp.u('b02'), pg_temp.u('f01'), 'Nothing ready'),
  (pg_temp.u('b03'), pg_temp.u('f01'), 'One case study');

-- Loose questions: two published, one draft.
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
values
  (pg_temp.u('101'), pg_temp.u('b01'), pg_temp.u('f01'), 'multiple_choice', 'published',
   '{}', '{"correctOptionId":"secret_key"}', '{}'),
  (pg_temp.u('102'), pg_temp.u('b01'), pg_temp.u('f01'), 'multiple_choice', 'draft',
   '{}', '{"correctOptionId":"secret_key"}', '{}'),
  (pg_temp.u('103'), pg_temp.u('b01'), pg_temp.u('f01'), 'multiple_choice', 'published',
   '{}', '{"correctOptionId":"secret_key"}', '{}');

-- Case studies: A and D ready; B with a draft step; C a draft; F archived; G with no steps; H (in
-- a quiz of its own) with a draft step; I alone in its quiz, ready.
insert into public.case_studies (id, bank_id, org_id, title, ehr, status) values
  (pg_temp.u('ca0'), pg_temp.u('b01'), pg_temp.u('f01'), 'Case A',
   '{"patientHeader":{"age":61,"sex":"male","setting":"Ward A"}}', 'published'),
  (pg_temp.u('cb0'), pg_temp.u('b01'), pg_temp.u('f01'), 'Case B',
   '{"patientHeader":{"age":62,"sex":"male","setting":"Ward B"}}', 'published'),
  (pg_temp.u('cc0'), pg_temp.u('b01'), pg_temp.u('f01'), 'Case C',
   '{"patientHeader":{"age":63,"sex":"male","setting":"Ward C"}}', 'draft'),
  (pg_temp.u('cd0'), pg_temp.u('b01'), pg_temp.u('f01'), 'Case D',
   '{"patientHeader":{"age":64,"sex":"female","setting":"Ward D"}}', 'published'),
  (pg_temp.u('cf0'), pg_temp.u('b01'), pg_temp.u('f01'), 'Case F',
   '{"patientHeader":{"age":65,"sex":"female","setting":"Ward F"}}', 'published'),
  (pg_temp.u('c80'), pg_temp.u('b01'), pg_temp.u('f01'), 'Case G',
   '{"patientHeader":{"age":66,"sex":"female","setting":"Ward G"}}', 'published'),
  (pg_temp.u('ce0'), pg_temp.u('b02'), pg_temp.u('f01'), 'Case H',
   '{"patientHeader":{"age":67,"sex":"female","setting":"Ward H"}}', 'published'),
  (pg_temp.u('c90'), pg_temp.u('b03'), pg_temp.u('f01'), 'Case I',
   '{"patientHeader":{"age":68,"sex":"female","setting":"Ward I"}}', 'published');

-- Six steps each, published but for B's step 3 and H's step 6.
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
select pg_temp.u(c.letter || lpad(n::text, 2, '0')), c.bank, pg_temp.u('f01'), 'multiple_choice', n,
       case when (c.letter, n) in (('b', 3), ('e', 6)) then 'draft' else 'published' end::public.content_status,
       '{}', '{"correctOptionId":"secret_key"}', '{}'
  from (values ('a', pg_temp.u('b01')), ('b', pg_temp.u('b01')), ('c', pg_temp.u('b01')),
               ('d', pg_temp.u('b01')), ('f', pg_temp.u('b01')), ('e', pg_temp.u('b02')),
               ('9', pg_temp.u('b03'))) as c(letter, bank),
       generate_series(1, 6) n;
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
select pg_temp.u('c' || c.letter || '0'), pg_temp.u('f01'), c.bank, n,
       pg_temp.u(c.letter || lpad(n::text, 2, '0'))
  from (values ('a', pg_temp.u('b01')), ('b', pg_temp.u('b01')), ('c', pg_temp.u('b01')),
               ('d', pg_temp.u('b01')), ('f', pg_temp.u('b01')), ('e', pg_temp.u('b02')),
               ('9', pg_temp.u('b03'))) as c(letter, bank),
       generate_series(1, 6) n;

-- F is archived once it has its steps, as an author archives one.
update public.case_studies set status = 'archived', archived_from = 'published'
 where id = pg_temp.u('cf0');

-- The quiz order: D, q01, A, q02, B, C, F, G, q03. Written straight, as reorder_quiz would.
update public.case_studies set quiz_position = 1 where id = pg_temp.u('cd0');
update public.items set quiz_position = 2 where id = pg_temp.u('101');
update public.case_studies set quiz_position = 3 where id = pg_temp.u('ca0');
update public.items set quiz_position = 4 where id = pg_temp.u('102');
update public.case_studies set quiz_position = 5 where id = pg_temp.u('cb0');
update public.case_studies set quiz_position = 6 where id = pg_temp.u('cc0');
update public.case_studies set quiz_position = 7 where id = pg_temp.u('cf0');
update public.case_studies set quiz_position = 8 where id = pg_temp.u('c80');
update public.items set quiz_position = 9 where id = pg_temp.u('103');

create temporary table started (label text primary key, session_id uuid);
grant select, insert on started to authenticated;

-- ---------------------------------------------------------------------------
-- 1 and 2. The set and its records
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(pg_temp.u('aaa'));

select lives_ok(
  $$ insert into started select 'quiz', public.start_session(pg_temp.u('b01'), null) $$,
  'a teacher starts a live session of the whole quiz'
);

select is(
  (select s.item_set from public.sessions s join started t on t.session_id = s.id
    where t.label = 'quiz'),
  pg_temp.steps('d') || jsonb_build_array(pg_temp.u('101')) || pg_temp.steps('a')
    || jsonb_build_array(pg_temp.u('103')),
  'the set follows the quiz order, each ready case study in place as its six steps; the draft '
  'question and the case studies not ready (draft step, draft, archived, no steps) are left out'
);

select is(
  pg_temp.runs((select session_id from started where label = 'quiz')),
  jsonb_build_array(
    jsonb_build_object('case_study_id', pg_temp.u('cd0'), 'title', 'Case D',
                       'first_position', 1, 'step_count', 6),
    jsonb_build_object('case_study_id', pg_temp.u('ca0'), 'title', 'Case A',
                       'first_position', 8, 'step_count', 6)),
  'each case study played is named with where its steps sit in the set'
);

select is(
  pg_temp.settings((select session_id from started where label = 'quiz')),
  array['Ward D', 'Ward A'],
  'and carries its own patient record'
);

select is(
  (select row(s.patient_record is null,
              s.case_study_records::text like '%secret_key%')::text
     from public.sessions s join started t on t.session_id = s.id where t.label = 'quiz'),
  row(true, false)::text,
  'a quiz session has no single record, and its records hold no step''s answer key'
);

-- ---------------------------------------------------------------------------
-- 3. Nobody chooses or changes a record
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.sessions set case_study_records = '[]'
      where id = (select session_id from started where label = 'quiz') $$,
  '42501',
  null,
  'a host cannot rewrite the records a room is shown'
);

-- Rows written straight at the table under the host policy, each carrying records of its own.
select lives_ok(
  $$ insert into public.sessions
       (org_id, host_id, bank_id, title, code, item_set, case_study_records, patient_record)
     values
       (pg_temp.u('f01'), pg_temp.u('aaa'), pg_temp.u('b01'), 'Direct whole', 'QQQQ22',
        jsonb_build_array(pg_temp.u('101')) || pg_temp.steps('a'),
        '[{"forged":true}]', '{"forged":true}'),
       (pg_temp.u('f01'), pg_temp.u('aaa'), pg_temp.u('b01'), 'Direct partial', 'QQQQ23',
        jsonb_build_array(pg_temp.u('a01'), pg_temp.u('a02'), pg_temp.u('a03')),
        '[{"forged":true}]', null),
       (pg_temp.u('f01'), pg_temp.u('aaa'), pg_temp.u('b01'), 'Direct reordered', 'QQQQ24',
        jsonb_build_array(pg_temp.u('a02'), pg_temp.u('a01'), pg_temp.u('a03'), pg_temp.u('a04'),
                          pg_temp.u('a05'), pg_temp.u('a06')),
        '[{"forged":true}]', null),
       (pg_temp.u('f01'), pg_temp.u('aaa'), pg_temp.u('b01'), 'Direct elsewhere', 'QQQQ25',
        pg_temp.steps('9'), '[{"forged":true}]', null) $$,
  'a host may insert session rows directly'
);

select is(
  pg_temp.runs((select id from public.sessions where title = 'Direct whole')),
  jsonb_build_array(
    jsonb_build_object('case_study_id', pg_temp.u('ca0'), 'title', 'Case A',
                       'first_position', 2, 'step_count', 6)),
  'a direct insert gets the record of the case study its set plays, not the one it carried'
);

select results_eq(
  $$ select title, case_study_records is null, patient_record is null
       from public.sessions
      where title in ('Direct partial', 'Direct reordered', 'Direct elsewhere')
      order by title $$,
  $$ values ('Direct elsewhere', true, true), ('Direct partial', true, true),
            ('Direct reordered', true, true) $$,
  'and none for part of a case study, its steps out of order, or another quiz''s case study'
);

reset role;

-- The author edits a case study while the rooms run: they keep the chart they started with.
update public.case_studies
   set ehr = '{"patientHeader":{"age":61,"sex":"male","setting":"Changed"}}', title = 'Renamed'
 where id = pg_temp.u('ca0');

select results_eq(
  $$ select (r ->> 'title'), r #>> '{record,patientHeader,setting}'
       from public.sessions s, jsonb_array_elements(s.case_study_records) r
      where s.id in ((select session_id from started where label = 'quiz'),
                     (select id from public.sessions where title = 'Direct whole'))
        and r ->> 'case_study_id' = pg_temp.u('ca0')::text $$,
  $$ values ('Case A', 'Ward A'), ('Case A', 'Ward A') $$,
  'a later edit to the case study does not reach a room already started'
);

-- ---------------------------------------------------------------------------
-- 4. A quiz of one case study, and a quiz with nothing ready
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(pg_temp.u('aaa'));

select lives_ok(
  $$ insert into started select 'only case', public.start_session(pg_temp.u('b03'), null) $$,
  'a quiz holding only a ready case study can be run'
);

select is(
  (select row(s.item_set, pg_temp.runs(s.id), pg_temp.settings(s.id))::text
     from public.sessions s join started t on t.session_id = s.id where t.label = 'only case'),
  row(pg_temp.steps('9'),
      jsonb_build_array(jsonb_build_object('case_study_id', pg_temp.u('c90'), 'title', 'Case I',
                                           'first_position', 1, 'step_count', 6)),
      array['Ward I'])::text,
  'and runs its six steps with its record'
);

select throws_ok(
  $$ select public.start_session(pg_temp.u('b02'), null) $$,
  '22023',
  'that source has no published items to run',
  'a quiz whose only case study has a draft step has nothing to run, and says so'
);

select is(
  (select count(*)::integer from public.sessions where bank_id = pg_temp.u('b02')),
  0,
  'and no session is made for it'
);

-- ---------------------------------------------------------------------------
-- 5. Student-paced, and a case study on its own
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into started
     select 'paced', public.start_session(pg_temp.u('b01'), null, 'student_paced') $$,
  'a whole quiz with case studies may run student-paced'
);

select is(
  (select row(s.mode, s.item_set = (select item_set from public.sessions x join started y
                                      on y.session_id = x.id where y.label = 'quiz'),
              pg_temp.settings(s.id))::text
     from public.sessions s join started t on t.session_id = s.id where t.label = 'paced'),
  row('student_paced'::public.session_mode, true, array['Ward D', 'Changed'])::text,
  'with the same set, and the records as they are when it starts'
);

select lives_ok(
  $$ insert into started select 'case', public.start_session(null, pg_temp.u('cd0')) $$,
  'a case study can still be run on its own'
);

select is(
  (select row(s.item_set, s.case_study_records is null,
              s.patient_record #>> '{patientHeader,setting}')::text
     from public.sessions s join started t on t.session_id = s.id where t.label = 'case'),
  row(pg_temp.steps('d'), true, 'Ward D')::text,
  'as before: its six steps and its one record, with no list of case studies'
);

select throws_ok(
  $$ select public.start_session(null, pg_temp.u('cb0')) $$,
  '22023',
  'that case study has a step that is not published',
  'and one with a draft step is still refused on its own, rather than skipped'
);

reset role;

select * from finish();
rollback;
