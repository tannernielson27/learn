-- A take-home case study's patient record is not readable by a student's own client (#335).
--
-- The record is staged by step (#334), and the take-home page is handed only the chart at each
-- step the student has reached. `authenticated` keeps `select` on every other column of
-- `public.assignments`, so a student still reads their assignments; the record column itself is
-- refused, to a student and an author alike. The control: the snapshot is there, read as the
-- superuser, and the column the student is refused does hold the record.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000003350a1', 'record-teacher@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000003350d1', 'record-student@example.test', 'authenticated', 'authenticated');

select private.make_instructor('record-teacher@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000003350a1'),
       role = 'student'
 where id = '00000000-0000-0000-0000-0000003350d1';

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000003350c1', org_id, 'NUR 335'
    from public.profiles where id = '00000000-0000-0000-0000-0000003350a1';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000003350c1', '00000000-0000-0000-0000-0000003350d1');

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000003350e0', org_id, 'Ectopic bank'
    from public.profiles where id = '00000000-0000-0000-0000-0000003350a1';
insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000003350f1', '00000000-0000-0000-0000-0000003350e0', org_id,
         'multiple_choice', 1, 'published', '{}', '{"correctOptionId":"opt_a"}', '{}'
    from public.profiles where id = '00000000-0000-0000-0000-0000003350a1';
-- A record whose step 4 note must not reach a student's client before step 4.
insert into public.case_studies (id, bank_id, org_id, title, ehr, status)
  select '00000000-0000-0000-0000-0000003350a5', '00000000-0000-0000-0000-0000003350e0', org_id,
         'Ectopic case',
         '{"patientHeader":{"age":29,"sex":"female","setting":"Emergency department"},'
         '"timePoints":[{"id":"tp_0100","label":"0100"}],'
         '"tabs":[{"id":"notes","kind":"nurses_notes","title":"Nurses'' Notes","blocks":['
         '{"kind":"markdown","fromStep":4,"value":"0200: Second large-bore IV placed."}]}]}',
         'published'
    from public.profiles where id = '00000000-0000-0000-0000-0000003350a1';
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
  select '00000000-0000-0000-0000-0000003350a5', org_id, '00000000-0000-0000-0000-0000003350e0', 1,
         '00000000-0000-0000-0000-0000003350f1'
    from public.profiles where id = '00000000-0000-0000-0000-0000003350a1';

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003350a1');
insert into public.assignments (class_id, case_study_id, title, opens_at, closes_at)
  values ('00000000-0000-0000-0000-0000003350c1', '00000000-0000-0000-0000-0000003350a5',
          'Ectopic take-home', now() - interval '1 minute', now() + interval '1 day');

-- ---------------------------------------------------------------------------
-- The student
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000003350d1');
select is(
  (select row(title, jsonb_array_length(item_set))::text from public.assignments),
  row('Ectopic take-home', 1)::text,
  'control: the student still reads their assignment, its title and its steps'
);
select throws_ok(
  $$ select patient_record from public.assignments $$,
  '42501', null,
  'a student selecting assignments.patient_record gets nothing: the column is refused'
);
select throws_ok(
  $$ select * from public.assignments $$,
  '42501', null,
  'and so does a select of the whole row'
);
select throws_ok(
  $$ select 1 from public.assignments where patient_record::text like '%0200%' $$,
  '42501', null,
  'nor can the column be read through a filter'
);

-- ---------------------------------------------------------------------------
-- The author
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000003350a1');
select throws_ok(
  $$ select patient_record from public.assignments $$,
  '42501', null,
  'an author''s client is not granted the column either'
);
select is(
  (select count(*)::int from public.assignments where title = 'Ectopic take-home'),
  1,
  'and still reads the row'
);

-- ---------------------------------------------------------------------------
-- The grant, and the control
-- ---------------------------------------------------------------------------

reset role;
select ok(
  not has_column_privilege('authenticated', 'public.assignments', 'patient_record', 'select')
  and has_column_privilege('authenticated', 'public.assignments', 'item_set', 'select'),
  'authenticated has select on every column but patient_record'
);
select ok(
  not has_column_privilege('anon', 'public.assignments', 'patient_record', 'select'),
  'anon has none'
);
select ok(
  (select patient_record::text like '%0200: Second large-bore IV%' from public.assignments
    where title = 'Ectopic take-home'),
  'control: the snapshot holds the record, step 4 note and all, for the server to cut'
);

select * from finish();
rollback;
