-- A case study run live (#184): the session snapshots the case study's patient record when it
-- starts, a bank session has none, a client cannot choose or change it, and editing the case
-- study afterwards does not reach a room already running. Uses its own fixture ids.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000184aa', 'record-a@example.test', 'authenticated', 'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000000184aa');

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000184b1', org_id, 'Record bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000184aa';

insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000000184e1', '00000000-0000-0000-0000-0000000184b1', org_id,
         'multiple_choice', 1, 'published', '{}', '{"correctOptionId":"secret_key"}', '{}'
  from public.profiles where id = '00000000-0000-0000-0000-0000000184aa';

insert into public.case_studies (id, bank_id, org_id, title, ehr, status)
  select '00000000-0000-0000-0000-0000000184c1', '00000000-0000-0000-0000-0000000184b1', org_id,
         'Record case', '{"patientHeader":{"age":74,"sex":"female","setting":"Ward"}}', 'published'
  from public.profiles where id = '00000000-0000-0000-0000-0000000184aa';
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
  select '00000000-0000-0000-0000-0000000184c1', org_id, '00000000-0000-0000-0000-0000000184b1', 1,
         '00000000-0000-0000-0000-0000000184e1'
  from public.profiles where id = '00000000-0000-0000-0000-0000000184aa';

create temporary table started (label text primary key, session_id uuid);
grant select, insert on started to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- As A: the host
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000184aa","role":"authenticated"}', true);

select lives_ok(
  $$ insert into started
     select 'case', public.start_session(null, '00000000-0000-0000-0000-0000000184c1'::uuid) $$,
  'A can start a session from the case study'
);

select results_eq(
  $$ select s.patient_record -> 'patientHeader' ->> 'setting'
     from public.sessions s join started t on t.session_id = s.id where t.label = 'case' $$,
  $$ values ('Ward') $$,
  'the case study''s record is snapshotted onto the session when it starts'
);

select is(
  (select s.patient_record::text like '%secret_key%'
     from public.sessions s join started t on t.session_id = s.id where t.label = 'case'),
  false,
  'the snapshot is the record only: no step''s answer key is in it'
);

select lives_ok(
  $$ insert into started
     select 'bank', public.start_session('00000000-0000-0000-0000-0000000184b1'::uuid, null) $$,
  'A can start a session from the bank'
);

select results_eq(
  $$ select s.patient_record is null
     from public.sessions s join started t on t.session_id = s.id where t.label = 'bank' $$,
  $$ values (true) $$,
  'a session started from a bank has no record'
);

select throws_ok(
  $$ update public.sessions set patient_record = '{"forged":true}'
     where id = (select session_id from started where label = 'case') $$,
  '42501',
  null,
  'a host cannot rewrite the record a room is shown'
);

-- A row written straight at the table, carrying a record of its own choosing, gets the case
-- study's instead: the trigger overwrites whatever the insert said.
select lives_ok(
  $$ insert into public.sessions (org_id, host_id, case_study_id, title, code, item_set, patient_record)
     select p.org_id, p.id, '00000000-0000-0000-0000-0000000184c1', 'Direct', 'ZZZZ22',
            '["00000000-0000-0000-0000-0000000184e1"]', '{"forged":true}'
       from public.profiles p where p.id = '00000000-0000-0000-0000-0000000184aa' $$,
  'A may insert a session row directly under the host policy'
);

reset role;

-- The author edits the record while the room runs: the room keeps the chart it started with.
update public.case_studies set ehr = '{"patientHeader":{"age":74,"sex":"female","setting":"Changed"}}'
  where id = '00000000-0000-0000-0000-0000000184c1';

select results_eq(
  $$ select s.patient_record -> 'patientHeader' ->> 'setting'
     from public.sessions s
    where s.case_study_id = '00000000-0000-0000-0000-0000000184c1'
    order by s.title $$,
  $$ values ('Ward'), ('Ward') $$,
  'the direct insert got the case study''s record, not its own, and neither follows a later edit'
);

select * from finish();
rollback;
