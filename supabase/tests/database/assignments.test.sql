-- Assignments (#207): a bank or a case study given to a class, with a window and 1 to 3 attempts.
--
-- An author of the org assigns and manages; the items and the patient record are snapshotted on
-- insert, so editing the bank afterwards changes nothing; the window and attempts can change until
-- it opens and only the close time after; it can be deleted only before it opens. A student reads
-- the assignments of classes they are a current member of, once open, and the row carries no key.
-- now() is fixed for the whole transaction, so "open" and "not yet open" are set relative to it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000002070b0', 'Another school');

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002070a1', 'assign-teacher-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002070b1', 'assign-teacher-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002070d1', 'assign-student-in@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002070d2', 'assign-student-out@example.test', 'authenticated', 'authenticated');

select private.make_instructor('assign-teacher-a@example.test');
update public.profiles set org_id = '00000000-0000-0000-0000-0000002070b0', role = 'instructor'
  where id = '00000000-0000-0000-0000-0000002070b1';
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002070a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002070d1', '00000000-0000-0000-0000-0000002070d2');

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- Org A: two classes, a bank with two published items and a draft, an empty bank, a case study.
insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000002070c1', org_id, 'NUR 310'
    from public.profiles where id = '00000000-0000-0000-0000-0000002070a1';
insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000002070c2', org_id, 'NUR 320'
    from public.profiles where id = '00000000-0000-0000-0000-0000002070a1';
insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-0000002070cb', '00000000-0000-0000-0000-0000002070b0', 'Elsewhere');

insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070d1'),
  ('00000000-0000-0000-0000-0000002070c2', '00000000-0000-0000-0000-0000002070d2');

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000002070e0', org_id, 'Cardiac bank'
    from public.profiles where id = '00000000-0000-0000-0000-0000002070a1';
insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000002070e9', org_id, 'Empty bank'
    from public.profiles where id = '00000000-0000-0000-0000-0000002070a1';
insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-0000002070eb', '00000000-0000-0000-0000-0000002070b0', 'Their bank');

insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring, created_at)
  select v.id::uuid, '00000000-0000-0000-0000-0000002070e0', p.org_id, 'multiple_choice', 1,
         v.status::public.content_status, '{}', '{"correctOptionId":"secret_key_207"}', '{}',
         now() - v.age::interval
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002070f1', 'published', '3 hours'),
                 ('00000000-0000-0000-0000-0000002070f2', 'published', '2 hours'),
                 ('00000000-0000-0000-0000-0000002070f3', 'draft', '1 hour')) as v(id, status, age)
   where p.id = '00000000-0000-0000-0000-0000002070a1';

insert into public.case_studies (id, bank_id, org_id, title, ehr, status)
  select '00000000-0000-0000-0000-0000002070a5', '00000000-0000-0000-0000-0000002070e0', org_id,
         'Heart failure case', '{"patientHeader":{"age":74,"sex":"female","setting":"Ward"}}',
         'published'
    from public.profiles where id = '00000000-0000-0000-0000-0000002070a1';
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
  select '00000000-0000-0000-0000-0000002070a5', org_id, '00000000-0000-0000-0000-0000002070e0', 1,
         '00000000-0000-0000-0000-0000002070f2'
    from public.profiles where id = '00000000-0000-0000-0000-0000002070a1';

-- ---------------------------------------------------------------------------
-- An author assigns
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002070a1');

select lives_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             'Open 207', now() - interval '1 hour', now() + interval '1 day') $$,
  'an author assigns a bank to a class of their org'
);
select is(
  (select item_set from public.assignments where title = 'Open 207'),
  '["00000000-0000-0000-0000-0000002070f1", "00000000-0000-0000-0000-0000002070f2"]'::jsonb,
  'the item set is the bank''s published items, oldest first, snapshotted as ids'
);
select is(
  (select row(max_attempts, shuffle_options, patient_record is null)::text
     from public.assignments where title = 'Open 207'),
  row(1, true, true)::text,
  'one attempt and shuffled options by default, and a bank carries no patient record'
);
select is(
  (select row(org_id, created_by)::text from public.assignments where title = 'Open 207'),
  (select row(org_id, id)::text from public.profiles where id = '00000000-0000-0000-0000-0000002070a1'),
  'the assignment is in the author''s org and records who made it'
);
select lives_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at, max_attempts)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             'Future 207', now() + interval '1 day', now() + interval '2 days', 3) $$,
  'an author assigns one that opens tomorrow, with three attempts'
);
select lives_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             'Later 207', now() + interval '3 days', now() + interval '4 days') $$,
  'and another, to delete'
);
select lives_ok(
  $$ insert into public.assignments (class_id, case_study_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070a5',
             null, now() - interval '1 minute', now() + interval '1 day') $$,
  'an author assigns a case study, leaving the title blank'
);
select is(
  (select row(item_set, patient_record -> 'patientHeader' ->> 'setting')::text
     from public.assignments where case_study_id = '00000000-0000-0000-0000-0000002070a5'),
  row('["00000000-0000-0000-0000-0000002070f2"]'::jsonb, 'Ward')::text,
  'a case study snapshots its steps and its patient record'
);
select is(
  (select title from public.assignments where case_study_id = '00000000-0000-0000-0000-0000002070a5'),
  'Heart failure case',
  'a blank title becomes the source''s name'
);

-- ---------------------------------------------------------------------------
-- What nobody can write
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at, max_attempts)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             'Zero', now(), now() + interval '1 day', 0) $$,
  '23514', null,
  'max_attempts below 1 is refused'
);
select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at, max_attempts)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             'Four', now(), now() + interval '1 day', 4) $$,
  '23514', null,
  'max_attempts above 3 is refused'
);
select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             'Backwards', now() + interval '2 days', now() + interval '1 day') $$,
  '23514', null,
  'a window that closes before it opens is refused'
);
select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             'Same', now() + interval '1 day', now() + interval '1 day') $$,
  '23514', null,
  'and so is one that closes the moment it opens'
);
select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             'Past', now() - interval '2 days', now() - interval '1 day') $$,
  '22023', null,
  'an assignment cannot be created already closed'
);
select throws_ok(
  $$ insert into public.assignments (class_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070c1', 'Nothing', now(), now() + interval '1 day') $$,
  '22023', null,
  'an assignment needs a source'
);
select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, case_study_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             '00000000-0000-0000-0000-0000002070a5', 'Both', now(), now() + interval '1 day') $$,
  '22023', null,
  'and only one'
);
select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e9',
             'Empty', now(), now() + interval '1 day') $$,
  '22023', null,
  'a bank with nothing published cannot be assigned'
);
select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070eb',
             'Theirs', now(), now() + interval '1 day') $$,
  'P0002', null,
  'another org''s bank reads as gone'
);
select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070cb', '00000000-0000-0000-0000-0000002070e0',
             'Their class', now(), now() + interval '1 day') $$,
  '23503', null,
  'an author cannot assign to another org''s class'
);
select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at, item_set)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             'Chosen', now(), now() + interval '1 day', '["x"]') $$,
  '42501', null,
  'nobody chooses the item set'
);
select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at, org_id)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             'Moved', now(), now() + interval '1 day', '00000000-0000-0000-0000-0000002070b0') $$,
  '42501', null,
  'or the org'
);

-- ---------------------------------------------------------------------------
-- Editing the bank does not reach the assignment
-- ---------------------------------------------------------------------------

reset role;
update public.items set status = 'published' where id = '00000000-0000-0000-0000-0000002070f3';
update public.case_studies set ehr = '{"patientHeader":{"age":74,"sex":"female","setting":"ICU"}}'
 where id = '00000000-0000-0000-0000-0000002070a5';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002070a1');

select is(
  (select jsonb_array_length(item_set) from public.assignments where title = 'Open 207'),
  2,
  'publishing another item in the bank does not change an assignment''s items'
);
select is(
  (select patient_record -> 'patientHeader' ->> 'setting' from public.assignments
    where case_study_id = '00000000-0000-0000-0000-0000002070a5'),
  'Ward',
  'and editing the case study''s record does not change its snapshot'
);

-- ---------------------------------------------------------------------------
-- Editing: everything until it opens, only the close time after
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ update public.assignments
        set max_attempts = 2, shuffle_options = false,
            opens_at = now() + interval '2 hours', closes_at = now() + interval '3 days'
      where title = 'Future 207' $$,
  'before it opens, the window, the attempts and shuffling can all change'
);
select is(
  (select row(max_attempts, shuffle_options)::text from public.assignments where title = 'Future 207'),
  row(2, false)::text,
  'and they did'
);
select throws_ok(
  $$ update public.assignments set max_attempts = 5 where title = 'Future 207' $$,
  '23514', null,
  'nobody can edit max_attempts outside 1 to 3'
);
select throws_ok(
  $$ update public.assignments set closes_at = opens_at - interval '1 minute'
      where title = 'Future 207' $$,
  '23514', null,
  'or edit a window into closing before it opens'
);
select throws_ok(
  $$ update public.assignments set max_attempts = 2 where title = 'Open 207' $$,
  '22023', null,
  'once open, the attempts cannot change'
);
select throws_ok(
  $$ update public.assignments set opens_at = now() - interval '2 hours' where title = 'Open 207' $$,
  '22023', null,
  'nor the open time'
);
select throws_ok(
  $$ update public.assignments set shuffle_options = false where title = 'Open 207' $$,
  '22023', null,
  'nor shuffling'
);
select lives_ok(
  $$ update public.assignments set closes_at = now() + interval '5 days' where title = 'Open 207' $$,
  'but the close time can'
);
select throws_ok(
  $$ update public.assignments set closes_at = now() - interval '1 minute' where title = 'Open 207' $$,
  '22023', null,
  'though never into the past'
);
select throws_ok(
  $$ update public.assignments set title = 'Renamed' where title = 'Open 207' $$,
  '42501', null,
  'the title, class, source and snapshot are not editable'
);

-- A closed assignment: assigned normally, then moved into the past as the superuser with triggers
-- off, since no client can make one.
insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
  values ('00000000-0000-0000-0000-0000002070c2', '00000000-0000-0000-0000-0000002070e0',
          'Closed 207', now() + interval '1 day', now() + interval '2 days');
reset role;
set local session_replication_role = replica;
update public.assignments
   set opens_at = now() - interval '2 days', closes_at = now() - interval '1 day'
 where title = 'Closed 207';
set local session_replication_role = origin;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002070a1');
select throws_ok(
  $$ update public.assignments set closes_at = now() + interval '1 day' where title = 'Closed 207' $$,
  '22023', null,
  'once closed it stays closed: students may already have seen the keys'
);
-- Gone again, so the visibility counts below are unchanged.
reset role;
set local session_replication_role = replica;
delete from public.assignments where title = 'Closed 207';
set local session_replication_role = origin;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002070a1');

-- ---------------------------------------------------------------------------
-- Deleting: only before it opens
-- ---------------------------------------------------------------------------

delete from public.assignments where title = 'Open 207';
select is(
  (select count(*)::int from public.assignments where title = 'Open 207'),
  1,
  'an open assignment cannot be deleted'
);
select lives_ok(
  $$ delete from public.assignments where title = 'Later 207' $$,
  'one that has not opened'
);
select is(
  (select count(*)::int from public.assignments where title = 'Later 207'),
  0,
  'can'
);

-- The row carries no key: the items' keys are there to find (the control), the assignment's are not.
select ok(
  (select bool_or(answer_key::text like '%secret_key_207%') from public.items
    where bank_id = '00000000-0000-0000-0000-0000002070e0'),
  'control: the assigned items do carry the key'
);
select ok(
  (select not bool_or(to_jsonb(a)::text like '%secret_key_207%') from public.assignments a
    where a.class_id = '00000000-0000-0000-0000-0000002070c1'),
  'no assignment row carries an answer key'
);

-- ---------------------------------------------------------------------------
-- Another org's author
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000002070b1');
select is(
  (select count(*)::int from public.assignments where class_id = '00000000-0000-0000-0000-0000002070c1'),
  0,
  'an author of another org sees none of them'
);
update public.assignments set closes_at = now() + interval '9 days' where title = 'Future 207';
delete from public.assignments where title = 'Future 207';

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-0000002070d1');
select results_eq(
  $$ select title from public.assignments order by title $$,
  $$ values ('Heart failure case'), ('Open 207') $$,
  'a student in the class sees its open assignments, and not one before it opens'
);
select ok(
  (select not bool_or(to_jsonb(a)::text like '%secret_key_207%') from public.assignments a),
  'what a student reads carries no answer key'
);
select throws_ok(
  $$ insert into public.assignments (class_id, bank_id, title, opens_at, closes_at)
     values ('00000000-0000-0000-0000-0000002070c1', '00000000-0000-0000-0000-0000002070e0',
             'Mine', now(), now() + interval '1 day') $$,
  '42501', null,
  'a student cannot assign'
);
update public.assignments set closes_at = now() + interval '9 days' where title = 'Open 207';
delete from public.assignments where title = 'Open 207';

select pg_temp.act_as('00000000-0000-0000-0000-0000002070d2');
select is(
  (select count(*)::int from public.assignments),
  0,
  'a student of another class sees none of them'
);

reset role;
select is(
  (select row(closes_at, max_attempts)::text from public.assignments where title = 'Future 207'),
  row(now() + interval '3 days', 2)::text,
  'neither the other org''s author nor a student changed anything'
);
select is(
  (select count(*)::int from public.assignments where title in ('Open 207', 'Future 207')),
  2,
  'or deleted anything'
);

-- A student taken off the class stops seeing its assignments.
delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000002070c1'
   and profile_id = '00000000-0000-0000-0000-0000002070d1';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002070d1');
select is(
  (select count(*)::int from public.assignments),
  0,
  'a student removed from the class no longer sees its assignments'
);

set local role anon;
select throws_ok(
  $$ select 1 from public.assignments $$,
  '42501', null,
  'anon cannot read assignments at all'
);

-- ---------------------------------------------------------------------------
-- Deleting the source keeps the assignment and what it was given
-- ---------------------------------------------------------------------------

reset role;
-- The bank's case study goes first: its steps hold the bank's items, and the authoring schema
-- refuses to drop items a case study still uses. That rule is older than assignments.
select lives_ok(
  $$ delete from public.case_studies where id = '00000000-0000-0000-0000-0000002070a5';
     delete from public.item_banks where id = '00000000-0000-0000-0000-0000002070e0' $$,
  'the bank can still be deleted'
);
select is(
  (select row(bank_id is null, jsonb_array_length(item_set))::text
     from public.assignments where title = 'Open 207'),
  row(true, 2)::text,
  'the assignment stays, its pointer cleared and its items kept'
);
select is(
  (select row(case_study_id is null, jsonb_array_length(item_set), patient_record is not null)::text
     from public.assignments where title = 'Heart failure case'),
  row(true, 1, true)::text,
  'and so does a case study''s, with its steps and its patient record'
);

select * from finish();
rollback;
