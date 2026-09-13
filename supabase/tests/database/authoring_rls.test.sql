-- Row level security for the authoring schema (#65). Runs with `pnpm exec supabase test db`.
-- The local seed adds a Samples bank to the first org, so assertions for users in that org
-- name the fixture rows below instead of counting whole tables.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.test', 'authenticated', 'authenticated');

select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'instructor',
  'a new account joins as an instructor'
);
select is(
  (select count(distinct org_id)::int from public.profiles),
  1,
  'every new account joins the same org'
);

-- Move B to a second org, and make C a student, to exercise isolation and role checks.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000000f2', 'Other');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000000f2'
  where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set role = 'student'
  where id = '00000000-0000-0000-0000-00000000000c';

create temporary table ids as
  select (select org_id from public.profiles where id = '00000000-0000-0000-0000-00000000000a') as org_a;
grant select on ids to authenticated, anon;

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000000b1', org_a, 'Cardiac' from ids;
insert into public.items (id, bank_id, org_id, type, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', org_a,
    'multiple_choice', '{"stem":"x"}', '{"correctOptionId":"a"}', '{"model":"zero_one","maxPoints":1}'
  from ids;
insert into public.item_versions (item_id, version, org_id, snapshot)
  select '00000000-0000-0000-0000-0000000000e1', 1, org_a, '{}' from ids;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'RLS is enabled on every public table'
);

select throws_ok(
  $$ insert into public.items (bank_id, org_id, type, content, answer_key, scoring)
     values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2',
             'multiple_choice', '{}', '{}', '{}') $$,
  '23503', null,
  'an item cannot claim a different org from its bank'
);

select throws_ok(
  $$ insert into public.items (bank_id, org_id, type, content, answer_key, scoring)
     select '00000000-0000-0000-0000-0000000000b1', org_a, 'essay', '{}', '{}', '{}' from ids $$,
  '23514', null,
  'an unknown item type is rejected'
);

-- A third org's item, and a case study in A's org, to check that children cannot cross orgs.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000000f3', 'Third');
insert into public.item_banks (id, org_id, name)
  values ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000f3', 'Theirs');
insert into public.items (id, bank_id, org_id, type, content, answer_key, scoring)
  values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b3',
          '00000000-0000-0000-0000-0000000000f3', 'multiple_choice', '{}', '{}', '{}');
insert into public.case_studies (id, bank_id, org_id, title, ehr)
  select '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', org_a,
    'Case', '{}' from ids;

select throws_ok(
  $$ insert into public.item_versions (item_id, version, org_id, snapshot)
     select '00000000-0000-0000-0000-0000000000e3', 1, org_a, '{}' from ids $$,
  '23503', null,
  'a version cannot attach to another org''s item'
);
select throws_ok(
  $$ insert into public.case_study_items (case_study_id, org_id, position, item_id)
     select '00000000-0000-0000-0000-0000000000c1', org_a, 1, '00000000-0000-0000-0000-0000000000e3' from ids $$,
  '23503', null,
  'a case study cannot slot in another org''s item'
);

-- ---------------------------------------------------------------------------
-- As A: instructor in the org that owns the bank
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.item_banks where id = '00000000-0000-0000-0000-0000000000b1'),
  1,
  'A sees the bank in their org'
);
select is(
  (select answer_key from public.items where id = '00000000-0000-0000-0000-0000000000e1'),
  '{"correctOptionId":"a"}'::jsonb,
  'A, an author, can read the key of an item in their org'
);
select lives_ok(
  $$ insert into public.item_banks (org_id, name) select org_a, 'Respiratory' from ids $$,
  'A can create a bank in their org'
);
select throws_ok(
  $$ insert into public.item_banks (org_id, name) values ('00000000-0000-0000-0000-0000000000f2', 'Sneaky') $$,
  '42501', null,
  'A cannot create a bank in another org'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501', null,
  'A cannot change their own role'
);
select throws_ok(
  $$ update public.profiles set org_id = '00000000-0000-0000-0000-0000000000f2'
     where id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501', null,
  'A cannot move themselves to another org'
);
select lives_ok(
  $$ update public.profiles set display_name = 'Alex' where id = '00000000-0000-0000-0000-00000000000a' $$,
  'A can set their display name'
);
select throws_ok(
  $$ update public.item_versions set snapshot = '{"tampered":true}'
     where item_id = '00000000-0000-0000-0000-0000000000e1' $$,
  '42501', null,
  'item versions are append-only, even for their author'
);
select throws_ok(
  $$ insert into public.orgs (name) values ('Mine') $$,
  '42501', null,
  'A cannot create an org'
);

-- ---------------------------------------------------------------------------
-- As B: instructor in a different org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select is((select count(*)::int from public.item_banks), 0, 'B cannot see banks in another org');
select is((select count(*)::int from public.items), 0, 'B cannot see items or keys in another org');
select is((select count(*)::int from public.item_versions), 0, 'B cannot see versions in another org');
select lives_ok(
  $$ update public.item_banks set name = 'Hijacked' where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'B renaming a bank in another org matches no rows'
);
select lives_ok(
  $$ delete from public.items where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'B deleting an item in another org matches no rows'
);

-- ---------------------------------------------------------------------------
-- As C: student in the same org as A
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.items),
  0,
  'a student cannot read items, so never an answer key or rationale'
);
select is((select count(*)::int from public.item_banks), 0, 'a student cannot read banks');

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select count(*) from public.items $$,
  '42501', null,
  'anon has no access to items'
);

-- ---------------------------------------------------------------------------
-- Back as the superuser: B's attempts changed nothing
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select name from public.item_banks where id = '00000000-0000-0000-0000-0000000000b1'),
  'Cardiac',
  'the bank B tried to rename is unchanged'
);
select is(
  (select count(*)::int from public.items where id = '00000000-0000-0000-0000-0000000000e1'),
  1,
  'the item B tried to delete still exists'
);

-- Last, because a TRUNCATE that wrongly succeeds would empty the tables for any later test.
-- RLS does not apply to TRUNCATE, so only the privilege stands in the way.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok(
  $$ truncate public.items cascade $$,
  '42501', null,
  'a signed-in user cannot truncate a table'
);
reset role;

select * from finish();
rollback;
