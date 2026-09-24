-- Sharing a bank with a class for practice (#240).
--
-- Only an author of the org shares one of the org's banks with one of the org's classes, and only
-- an author of the org stops it. Across orgs the database refuses, whatever the client sends. A
-- student sees that a share exists for their own class (the bank id, the class id, when) and
-- nothing else about the bank: not its name, its items or who shared it. practice_exposure counts
-- what an assignment would expose, in one statement, for the assign form's warning.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000002400b0', 'Another school');

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000002400a1', 'share-teacher-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002400a2', 'share-teacher-a2@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002400b1', 'share-teacher-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002400d1', 'share-student-in@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002400d2', 'share-student-other@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000002400d3', 'share-student-none@example.test', 'authenticated', 'authenticated');

select private.make_instructor('share-teacher-a@example.test');
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002400a1'),
       role = 'instructor'
 where id = '00000000-0000-0000-0000-0000002400a2';
update public.profiles set org_id = '00000000-0000-0000-0000-0000002400b0', role = 'instructor'
  where id = '00000000-0000-0000-0000-0000002400b1';
update public.profiles
   set org_id = (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002400a1'),
       role = 'student'
 where id in ('00000000-0000-0000-0000-0000002400d1', '00000000-0000-0000-0000-0000002400d2',
              '00000000-0000-0000-0000-0000002400d3');

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- Org A: two classes; "Cardiac week" with two published items, a draft and a one-step case study;
-- a second bank with one published item. Org B: a class and a bank.
insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000002400c1', org_id, 'NUR 310'
    from public.profiles where id = '00000000-0000-0000-0000-0000002400a1';
insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000002400c2', org_id, 'NUR 205'
    from public.profiles where id = '00000000-0000-0000-0000-0000002400a1';
insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-0000002400cb', '00000000-0000-0000-0000-0000002400b0', 'Elsewhere');

insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000002400c1', '00000000-0000-0000-0000-0000002400d1'),
  ('00000000-0000-0000-0000-0000002400c2', '00000000-0000-0000-0000-0000002400d2');

insert into public.item_banks (id, org_id, name)
  select v.id::uuid, p.org_id, v.name
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002400e0', 'Cardiac week'),
                 ('00000000-0000-0000-0000-0000002400e1', 'Renal week')) as v(id, name)
   where p.id = '00000000-0000-0000-0000-0000002400a1';
insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-0000002400eb', '00000000-0000-0000-0000-0000002400b0', 'Their bank');

insert into public.items (id, bank_id, org_id, type, cjmm_step, status, content, answer_key, scoring)
  select v.id::uuid, v.bank::uuid, p.org_id, 'multiple_choice', 1, v.status::public.content_status,
         '{}', '{"correctOptionId":"secret_key_240"}', '{}'
    from public.profiles p,
         (values ('00000000-0000-0000-0000-0000002400f1', '00000000-0000-0000-0000-0000002400e0', 'published'),
                 ('00000000-0000-0000-0000-0000002400f2', '00000000-0000-0000-0000-0000002400e0', 'published'),
                 ('00000000-0000-0000-0000-0000002400f3', '00000000-0000-0000-0000-0000002400e0', 'draft'),
                 ('00000000-0000-0000-0000-0000002400f4', '00000000-0000-0000-0000-0000002400e1', 'published'))
           as v(id, bank, status)
   where p.id = '00000000-0000-0000-0000-0000002400a1';

insert into public.case_studies (id, bank_id, org_id, title, ehr, status)
  select '00000000-0000-0000-0000-0000002400a5', '00000000-0000-0000-0000-0000002400e0', org_id,
         'Heart failure case', '{}', 'published'
    from public.profiles where id = '00000000-0000-0000-0000-0000002400a1';
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
  select '00000000-0000-0000-0000-0000002400a5', org_id, '00000000-0000-0000-0000-0000002400e0', 1,
         '00000000-0000-0000-0000-0000002400f2'
    from public.profiles where id = '00000000-0000-0000-0000-0000002400a1';

-- ---------------------------------------------------------------------------
-- The catalog
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.bank_practice_shares'::regclass),
  'bank_practice_shares has row level security on'
);
select ok(
  not has_table_privilege('anon', 'public.bank_practice_shares', 'select')
  and not has_table_privilege('anon', 'public.bank_practice_shares', 'insert')
  and not has_table_privilege('anon', 'public.bank_practice_shares', 'delete'),
  'anon holds no privilege on bank_practice_shares'
);
select ok(
  not has_column_privilege('authenticated', 'public.bank_practice_shares', 'shared_by', 'select'),
  'who shared a bank is not readable through the Data API'
);
select ok(
  not has_function_privilege('anon', 'public.practice_exposure(uuid, uuid)', 'execute'),
  'anon cannot call practice_exposure'
);

-- ---------------------------------------------------------------------------
-- An author of the org shares
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002400a1');

select lives_ok(
  $$ insert into public.bank_practice_shares (bank_id, class_id)
     values ('00000000-0000-0000-0000-0000002400e0', '00000000-0000-0000-0000-0000002400c1') $$,
  'an author shares a bank of their org with a class of their org'
);
select results_eq(
  $$ select bank_id, class_id from public.bank_practice_shares $$,
  $$ values ('00000000-0000-0000-0000-0000002400e0'::uuid, '00000000-0000-0000-0000-0000002400c1'::uuid) $$,
  'the author reads the share back'
);
select throws_ok(
  $$ insert into public.bank_practice_shares (bank_id, class_id)
     values ('00000000-0000-0000-0000-0000002400e0', '00000000-0000-0000-0000-0000002400c1') $$,
  '23505', null,
  'the same bank cannot be shared with the same class twice'
);
select throws_ok(
  $$ insert into public.bank_practice_shares (bank_id, class_id)
     values ('00000000-0000-0000-0000-0000002400e0', '00000000-0000-0000-0000-0000002400cb') $$,
  '23503', null,
  'an author cannot share their bank with another org''s class'
);
select throws_ok(
  $$ insert into public.bank_practice_shares (bank_id, class_id)
     values ('00000000-0000-0000-0000-0000002400eb', '00000000-0000-0000-0000-0000002400c1') $$,
  '23503', null,
  'an author cannot share another org''s bank with their class'
);
select throws_ok(
  $$ insert into public.bank_practice_shares (org_id, bank_id, class_id)
     values ('00000000-0000-0000-0000-0000002400b0', '00000000-0000-0000-0000-0000002400eb',
             '00000000-0000-0000-0000-0000002400cb') $$,
  '42501', null,
  'a client cannot choose the org of a share'
);
select throws_ok(
  $$ insert into public.bank_practice_shares (bank_id, class_id, shared_by)
     values ('00000000-0000-0000-0000-0000002400e1', '00000000-0000-0000-0000-0000002400c1',
             '00000000-0000-0000-0000-0000002400a2') $$,
  '42501', null,
  'a client cannot choose who shared it'
);
select throws_ok(
  $$ update public.bank_practice_shares set class_id = '00000000-0000-0000-0000-0000002400c2' $$,
  '42501', null,
  'a share cannot be updated; stopping it is a delete'
);

reset role;
select is(
  (select row(s.org_id, s.shared_by)::text from public.bank_practice_shares s),
  (select row(p.org_id, p.id)::text from public.profiles p
    where p.id = '00000000-0000-0000-0000-0000002400a1'),
  'the share is in the author''s org and records who shared it'
);

-- ---------------------------------------------------------------------------
-- An author of another org
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002400b1');

select is_empty(
  $$ select id from public.bank_practice_shares $$,
  'an author of another org sees no share'
);
select lives_ok(
  $$ delete from public.bank_practice_shares $$,
  'an author of another org may try to delete'
);
select throws_ok(
  $$ insert into public.bank_practice_shares (bank_id, class_id)
     values ('00000000-0000-0000-0000-0000002400e0', '00000000-0000-0000-0000-0000002400c1') $$,
  '23503', null,
  'an author of another org cannot share org A''s bank with org A''s class, nor learn the share exists'
);
select is_empty(
  $$ select * from public.practice_exposure('00000000-0000-0000-0000-0000002400e0', null) $$,
  'practice_exposure tells an author of another org nothing'
);

reset role;
select is(
  (select count(*)::integer from public.bank_practice_shares),
  1,
  'and the share is still there'
);

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002400d1');

select results_eq(
  $$ select bank_id, class_id from public.bank_practice_shares $$,
  $$ values ('00000000-0000-0000-0000-0000002400e0'::uuid, '00000000-0000-0000-0000-0000002400c1'::uuid) $$,
  'a student sees that a bank is shared with their own class'
);
select throws_ok(
  $$ select shared_by from public.bank_practice_shares $$,
  '42501', null,
  'but not who shared it'
);
select is_empty(
  $$ select id from public.item_banks where id = '00000000-0000-0000-0000-0000002400e0' $$,
  'a student cannot read the shared bank'
);
select is_empty(
  $$ select answer_key from public.items where bank_id = '00000000-0000-0000-0000-0000002400e0' $$,
  'a student cannot read the shared bank''s items or keys'
);
select is_empty(
  $$ select item_id from public.case_study_items
      where bank_id = '00000000-0000-0000-0000-0000002400e0' $$,
  'or its case study steps'
);
select is_empty(
  $$ select * from public.practice_exposure('00000000-0000-0000-0000-0000002400e0', null) $$,
  'practice_exposure tells a student nothing'
);
select throws_ok(
  $$ insert into public.bank_practice_shares (bank_id, class_id)
     values ('00000000-0000-0000-0000-0000002400e1', '00000000-0000-0000-0000-0000002400c1') $$,
  '42501', null,
  'a student cannot share a bank'
);
select lives_ok(
  $$ delete from public.bank_practice_shares $$,
  'a student may try to stop a share'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002400d2');
select is_empty(
  $$ select id from public.bank_practice_shares $$,
  'a student of another class in the same org sees no share'
);
select pg_temp.act_as('00000000-0000-0000-0000-0000002400d3');
select is_empty(
  $$ select id from public.bank_practice_shares $$,
  'a student in no class sees no share'
);

reset role;
select is(
  (select count(*)::integer from public.bank_practice_shares),
  1,
  'no student stopped the share'
);

-- ---------------------------------------------------------------------------
-- The graded-reuse warning
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002400a1');

select results_eq(
  $$ select class_id, class_name, exposed_items
       from public.practice_exposure('00000000-0000-0000-0000-0000002400e0', null) $$,
  $$ values ('00000000-0000-0000-0000-0000002400c1'::uuid, 'NUR 310', 2) $$,
  'a shared bank exposes its published items, not its draft, to the class it is shared with'
);
select is_empty(
  $$ select * from public.practice_exposure('00000000-0000-0000-0000-0000002400e1', null) $$,
  'a bank shared with nobody exposes nothing'
);
select results_eq(
  $$ select class_id, class_name, exposed_items
       from public.practice_exposure(null, '00000000-0000-0000-0000-0000002400a5') $$,
  $$ values ('00000000-0000-0000-0000-0000002400c1'::uuid, 'NUR 310', 1) $$,
  'a case study in a shared bank exposes its steps'
);
select is_empty(
  $$ select * from public.practice_exposure(null, null) $$,
  'no source exposes nothing'
);

select lives_ok(
  $$ insert into public.bank_practice_shares (bank_id, class_id)
     values ('00000000-0000-0000-0000-0000002400e0', '00000000-0000-0000-0000-0000002400c2') $$,
  'the same bank is shared with a second class'
);
select results_eq(
  $$ select class_name, exposed_items
       from public.practice_exposure('00000000-0000-0000-0000-0000002400e0', null) $$,
  $$ values ('NUR 205', 2), ('NUR 310', 2) $$,
  'the warning names every class, by name, with the same item count'
);

-- ---------------------------------------------------------------------------
-- Stopping, removal and cascades
-- ---------------------------------------------------------------------------

-- Another author of the same org stops a share someone else made (#205: authors share classes).
select pg_temp.act_as('00000000-0000-0000-0000-0000002400a2');
select results_eq(
  $$ delete from public.bank_practice_shares
      where class_id = '00000000-0000-0000-0000-0000002400c1' returning class_id $$,
  $$ values ('00000000-0000-0000-0000-0000002400c1'::uuid) $$,
  'an author of the org stops a share'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000002400d1');
select is_empty(
  $$ select id from public.bank_practice_shares $$,
  'once stopped, the student no longer sees it'
);

reset role;
delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000002400c2'
   and profile_id = '00000000-0000-0000-0000-0000002400d2';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002400d2');
select is_empty(
  $$ select id from public.bank_practice_shares $$,
  'a student taken off the class no longer sees its share'
);

reset role;
delete from public.classes where id = '00000000-0000-0000-0000-0000002400c2';
select is(
  (select count(*)::integer from public.bank_practice_shares),
  0,
  'deleting a class deletes its shares'
);

insert into public.bank_practice_shares (org_id, bank_id, class_id)
  select org_id, '00000000-0000-0000-0000-0000002400e1', '00000000-0000-0000-0000-0000002400c1'
    from public.profiles where id = '00000000-0000-0000-0000-0000002400a1';
delete from public.item_banks where id = '00000000-0000-0000-0000-0000002400e1';
select is(
  (select count(*)::integer from public.bank_practice_shares),
  0,
  'deleting a bank deletes its shares'
);

select * from finish();
rollback;
