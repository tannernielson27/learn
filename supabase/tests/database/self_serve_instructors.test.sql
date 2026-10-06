-- A workspace for each self-registered teacher, and a per-account onboarding record (#355).
--
-- `public.register_instructor` is the one way a sign-up becomes a teacher: the app's server calls
-- it with the service role, it makes a new org and puts the account in it as an instructor. The
-- org-scoped policies written for one org then keep every such teacher apart from every other and
-- from the shared org, with no policy changed. `public.mark_onboarded` stamps the caller's own
-- `profiles.onboarded_at` once; the column is not otherwise writable.
--
-- The local seed puts the shared org and its Samples bank in first, so "sees nothing of the shared
-- org" is checked next to rows that are really there.
begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  -- Two teachers who will sign up on their own.
  ('00000000-0000-0000-0000-0000003550a1', 'teacher-a@example.test', 'authenticated',
   'authenticated', '{"provider": "email", "providers": ["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000003550b1', 'teacher-b@example.test', 'authenticated',
   'authenticated', '{"provider": "email", "providers": ["email"]}', '{}'),
  -- An account nobody registers. user_metadata is the client's to write: claiming a role, an org
  -- or a workspace there gets nothing.
  ('00000000-0000-0000-0000-0000003550c1', 'claims@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}',
   '{"role": "instructor", "self_registered": true, "workspace": "Claimed", "org_id": "00000000-0000-4000-8000-000000000001"}'),
  -- A student and an instructor of the shared org, and one student for each teacher's class.
  ('00000000-0000-0000-0000-0000003550d1', 'shared-student@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000003550e1', 'shared-teacher@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000003550a2', 'student-of-a@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000003550b2', 'student-of-b@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  -- An account used only to try workspace names that must be refused.
  ('00000000-0000-0000-0000-0000003550f1', 'bad-names@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}');

-- The owner's way of adding a colleague to the shared org still works, unchanged.
select lives_ok(
  $$ select private.make_instructor('shared-teacher@example.test') $$,
  'make_instructor still adds a colleague'
);
select is(
  (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000003550e1'),
  (select id from public.orgs order by created_at, id limit 1),
  'to the shared org, the first one'
);
update public.profiles
   set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'student'
 where id = '00000000-0000-0000-0000-0000003550d1';

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- Every profile and org as text, to show that a refused call changed nothing at all.
create function pg_temp.accounts_and_orgs() returns text
language sql as $$
  select coalesce((select string_agg(p::text, '|' order by p.id) from public.profiles p), '')
      || '#'
      || coalesce((select string_agg(o::text, '|' order by o.id) from public.orgs o), '');
$$;

-- ---------------------------------------------------------------------------
-- The new columns
-- ---------------------------------------------------------------------------

-- Dated later than anything else here, so it can never be taken for "the first org".
insert into public.orgs (id, name, created_at)
  values ('00000000-0000-0000-0000-0000003550f0', 'Plain org', now() + interval '1 hour');
select is(
  (select row(self_registered, ai_import_enabled)::text from public.orgs
    where id = '00000000-0000-0000-0000-0000003550f0'),
  row(false, false)::text,
  'an org is not self-registered and has no AI import unless something says so'
);
select is(
  (select count(*)::int from public.orgs where self_registered),
  0,
  'no org is self-registered before anyone registers'
);
select is(
  (select count(*)::int from public.profiles
    where id::text like '00000000-0000-0000-0000-0000003550%' and onboarded_at is not null),
  0,
  'a new account has not been welcomed'
);

-- ---------------------------------------------------------------------------
-- Who may call register_instructor
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.register_instructor(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.register_instructor(uuid, text)', 'execute'),
  'neither anon nor authenticated holds EXECUTE on register_instructor'
);
select ok(
  has_function_privilege('service_role', 'public.register_instructor(uuid, text)', 'execute'),
  'service_role does'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     from pg_proc p where p.oid = 'public.register_instructor(uuid, text)'::regprocedure),
  'it is security definer with an empty search_path'
);

set local role anon;
select throws_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550a1', 'Mine') $$,
  '42501', null,
  'anon cannot register an instructor'
);
reset role;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003550a1');
select throws_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550a1', 'Mine') $$,
  '42501', null,
  'a signed-in account cannot make itself an instructor'
);
select throws_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550c1', 'Theirs') $$,
  '42501', null,
  'or anybody else'
);
reset role;

select is(
  (select count(*)::int from public.profiles
    where id in ('00000000-0000-0000-0000-0000003550a1', '00000000-0000-0000-0000-0000003550c1')
      and role is null and org_id is null),
  2,
  'those refused calls gave nobody a role'
);

-- ---------------------------------------------------------------------------
-- Registering, as the app's server
-- ---------------------------------------------------------------------------

set local role service_role;
select lives_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550a1', E'  \t Ada''s workspace \n ') $$,
  'the server registers teacher A'
);
select lives_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550b1', 'Grace''s workspace') $$,
  'and teacher B'
);
reset role;

create temporary table cast_orgs as
  select
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000003550a1') as org_a,
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000003550b1') as org_b,
    (select id from public.orgs order by created_at, id limit 1) as org_shared;
grant select on cast_orgs to authenticated, anon, service_role;

select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000003550a1'),
  'instructor',
  'teacher A is an instructor'
);
select ok(
  (select org_a is not null and org_b is not null from cast_orgs),
  'each teacher has an org'
);
select ok(
  (select org_a <> org_b from cast_orgs),
  'the two teachers are in two different orgs'
);
select ok(
  (select org_a <> org_shared and org_b <> org_shared from cast_orgs),
  'and neither is the shared org'
);
select is(
  (select row(o.name, o.self_registered, o.ai_import_enabled)::text
     from public.orgs o join cast_orgs c on c.org_a = o.id),
  row('Ada''s workspace'::text, true, false)::text,
  'the workspace has the trimmed name, is marked self-registered, and has no AI import'
);
select is(
  (select count(*)::int from public.orgs where self_registered),
  2,
  'two registrations made exactly two orgs'
);
select is(
  (select count(*)::int from public.profiles p join cast_orgs c on p.org_id in (c.org_a, c.org_b)),
  2,
  'and each holds one account, its teacher'
);
select is(
  (select row(org_id, role)::text from public.profiles where id = '00000000-0000-0000-0000-0000003550c1'),
  row(null::uuid, null::public.org_role)::text,
  'an account nobody registered still has no role, whatever its user_metadata claims'
);

-- ---------------------------------------------------------------------------
-- Refusals change nothing
-- ---------------------------------------------------------------------------

create temporary table before_refusals as select pg_temp.accounts_and_orgs() as snapshot;
grant select on before_refusals to authenticated, anon, service_role;

set local role service_role;
select throws_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550d1', 'Promoted') $$,
  '23514', null,
  'a student is refused: registering never promotes one'
);
select throws_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550e1', 'Second home') $$,
  '23514', null,
  'an instructor of the shared org is refused'
);
select throws_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550a1', 'Again') $$,
  '23514', null,
  'a teacher who already registered is refused, so nobody gets a second workspace'
);
select throws_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550ff', 'Nobody') $$,
  'P0002', null,
  'an id with no account is an error, not a silent no-op'
);
select throws_ok(
  $$ select public.register_instructor(null, 'Nobody') $$,
  'P0002', null,
  'and so is no id at all'
);
select throws_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550f1', '') $$,
  '22023', null,
  'an empty workspace name is refused'
);
select throws_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550f1', E' \t\n ') $$,
  '22023', null,
  'and one that is only white space'
);
select throws_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550f1', null) $$,
  '22023', null,
  'and none at all'
);
select throws_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550f1', repeat('x', 81)) $$,
  '22023', null,
  'and one longer than 80 characters'
);
reset role;

select is(
  pg_temp.accounts_and_orgs(),
  (select snapshot from before_refusals),
  'not one profile or org changed across every refusal: no half-made org'
);

-- 80 characters is allowed, and the limit counts what is left after trimming.
set local role service_role;
select lives_ok(
  $$ select public.register_instructor('00000000-0000-0000-0000-0000003550f1', '  ' || repeat('x', 80) || '  ') $$,
  'a name of exactly 80 characters after trimming is accepted'
);
reset role;
select is(
  (select length(o.name) from public.orgs o
     join public.profiles p on p.org_id = o.id
    where p.id = '00000000-0000-0000-0000-0000003550f1'),
  80,
  'and stored trimmed'
);

-- ---------------------------------------------------------------------------
-- Content in each org, as the superuser
-- ---------------------------------------------------------------------------

-- The claims set by act_as outlive `reset role`. Clear them, so these rows are the superuser's and
-- not teacher A's.
select set_config('request.jwt.claims', '{}', true);

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000003551a0', org_a, 'A bank' from cast_orgs;
insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000003551b0', org_b, 'B bank' from cast_orgs;
insert into public.items (id, bank_id, org_id, type, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000003552a0', '00000000-0000-0000-0000-0000003551a0', org_a,
    'multiple_choice', '{"stem":"a"}', '{"correctOptionId":"a"}', '{"model":"zero_one","maxPoints":1}'
  from cast_orgs;
insert into public.items (id, bank_id, org_id, type, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000003552b0', '00000000-0000-0000-0000-0000003551b0', org_b,
    'multiple_choice', '{"stem":"b"}', '{"correctOptionId":"b"}', '{"model":"zero_one","maxPoints":1}'
  from cast_orgs;
insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000003553a0', org_a, 'A class' from cast_orgs;
insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000003553b0', org_b, 'B class' from cast_orgs;
insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000003553e0', org_shared, 'Shared class' from cast_orgs;

update public.profiles set org_id = (select org_a from cast_orgs), role = 'student'
 where id = '00000000-0000-0000-0000-0000003550a2';
update public.profiles set org_id = (select org_b from cast_orgs), role = 'student'
 where id = '00000000-0000-0000-0000-0000003550b2';
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000003553a0', '00000000-0000-0000-0000-0000003550a2'),
  ('00000000-0000-0000-0000-0000003553b0', '00000000-0000-0000-0000-0000003550b2'),
  ('00000000-0000-0000-0000-0000003553e0', '00000000-0000-0000-0000-0000003550d1');

select ok(
  (select count(*) from public.item_banks) >= 3
  and (select count(*) from public.items i join cast_orgs c on i.org_id = c.org_shared) > 0
  and (select count(*) from public.classes) >= 3
  and (select count(*) from public.class_members) >= 3,
  'control: as the superuser there are banks, items, classes and rosters in all three orgs'
);

-- ---------------------------------------------------------------------------
-- As teacher A
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003550a1');

select ok(private.is_author(), 'teacher A is an author');
select is(
  private.current_org_id(),
  (select org_a from cast_orgs),
  'whose org is the workspace made for them'
);
select results_eq(
  $$ select id from public.orgs $$,
  $$ select org_a from cast_orgs $$,
  'teacher A reads their own org and no other'
);
select results_eq(
  $$ select id from public.item_banks $$,
  $$ values ('00000000-0000-0000-0000-0000003551a0'::uuid) $$,
  'teacher A reads their own bank and no other: not B''s, not the shared org''s'
);
select results_eq(
  $$ select id from public.items $$,
  $$ values ('00000000-0000-0000-0000-0000003552a0'::uuid) $$,
  'and their own item and no other, so not one answer key from anywhere else'
);
select results_eq(
  $$ select id from public.classes $$,
  $$ values ('00000000-0000-0000-0000-0000003553a0'::uuid) $$,
  'and their own class and no other'
);
select results_eq(
  $$ select class_id, profile_id from public.class_members $$,
  $$ values ('00000000-0000-0000-0000-0000003553a0'::uuid,
             '00000000-0000-0000-0000-0000003550a2'::uuid) $$,
  'and their own roster and no other'
);
select results_eq(
  $$ select profile_id, email from public.class_roster('00000000-0000-0000-0000-0000003553a0') $$,
  $$ values ('00000000-0000-0000-0000-0000003550a2'::uuid, 'student-of-a@example.test'::text) $$,
  'control: class_roster returns teacher A''s own roster'
);
select is_empty(
  $$ select * from public.class_roster('00000000-0000-0000-0000-0000003553b0') $$,
  'but nothing of teacher B''s roster'
);
select is_empty(
  $$ select * from public.class_roster('00000000-0000-0000-0000-0000003553e0') $$,
  'and nothing of the shared org''s'
);
select throws_ok(
  $$ select public.rotate_class_invite('00000000-0000-0000-0000-0000003553b0') $$,
  'P0002', null,
  'teacher A cannot rotate the invite of a class they cannot see'
);
select is(
  (select count(*)::int from public.profiles),
  1,
  'teacher A reads their own profile and nobody else''s'
);
select lives_ok(
  $$ insert into public.classes (name) values ('A second class') $$,
  'teacher A creates a class by naming it'
);
select is(
  (select org_id from public.classes where name = 'A second class'),
  (select org_a from cast_orgs),
  'and it lands in their own workspace'
);

reset role;

-- ---------------------------------------------------------------------------
-- As teacher B, and as the shared org's instructor
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003550b1');

select results_eq(
  $$ select id from public.item_banks $$,
  $$ values ('00000000-0000-0000-0000-0000003551b0'::uuid) $$,
  'teacher B reads their own bank and no other'
);
select results_eq(
  $$ select id from public.items $$,
  $$ values ('00000000-0000-0000-0000-0000003552b0'::uuid) $$,
  'and their own item and no other'
);
select results_eq(
  $$ select id from public.classes $$,
  $$ values ('00000000-0000-0000-0000-0000003553b0'::uuid) $$,
  'and their own class and no other, not the one teacher A just made'
);
select results_eq(
  $$ select class_id, profile_id from public.class_members $$,
  $$ values ('00000000-0000-0000-0000-0000003553b0'::uuid,
             '00000000-0000-0000-0000-0000003550b2'::uuid) $$,
  'and their own roster and no other'
);
select is_empty(
  $$ select * from public.class_roster('00000000-0000-0000-0000-0000003553a0') $$,
  'and nothing of teacher A''s roster'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000003550e1');
select is(
  (select count(*)::int from public.item_banks
    where id in ('00000000-0000-0000-0000-0000003551a0', '00000000-0000-0000-0000-0000003551b0'))
  + (select count(*)::int from public.items
      where id in ('00000000-0000-0000-0000-0000003552a0', '00000000-0000-0000-0000-0000003552b0'))
  + (select count(*)::int from public.classes
      where id in ('00000000-0000-0000-0000-0000003553a0', '00000000-0000-0000-0000-0000003553b0'))
  + (select count(*)::int from public.class_members
      where class_id in ('00000000-0000-0000-0000-0000003553a0', '00000000-0000-0000-0000-0000003553b0')),
  0,
  'an instructor of the shared org reads nothing of either workspace'
);
select ok(
  (select count(*) from public.items) > 0
  and exists (select 1 from public.classes where id = '00000000-0000-0000-0000-0000003553e0'),
  'control: that instructor does read the shared org''s own items and class'
);

reset role;

-- ---------------------------------------------------------------------------
-- The onboarding record
-- ---------------------------------------------------------------------------

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'onboarded_at', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'onboarded_at', 'insert')
  and not has_column_privilege('anon', 'public.profiles', 'onboarded_at', 'update'),
  'no API role may write profiles.onboarded_at directly'
);
select ok(
  has_function_privilege('authenticated', 'public.mark_onboarded()', 'execute')
  and not has_function_privilege('anon', 'public.mark_onboarded()', 'execute'),
  'mark_onboarded is for signed-in accounts, never anon'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003550a1');

select throws_ok(
  $$ update public.profiles set onboarded_at = now()
      where id = '00000000-0000-0000-0000-0000003550a1' $$,
  '42501', null,
  'an account cannot stamp its own onboarded_at with an update'
);
select lives_ok(
  $$ update public.profiles set display_name = 'Ada'
      where id = '00000000-0000-0000-0000-0000003550a1' $$,
  'control: the same account can still rename itself'
);
select isnt(
  public.mark_onboarded(),
  null::timestamptz,
  'mark_onboarded returns the time it stamped'
);

reset role;
select results_eq(
  $$ select id from public.profiles where onboarded_at is not null $$,
  $$ values ('00000000-0000-0000-0000-0000003550a1'::uuid) $$,
  'it stamped the caller and nobody else'
);

-- now() does not move inside this transaction, so a second call that restamped would look the
-- same as one that did not. Move the stored time into the past, then call again.
update public.profiles set onboarded_at = '2026-01-02 03:04:05+00'
 where id = '00000000-0000-0000-0000-0000003550a1';

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000003550a1');
select is(
  public.mark_onboarded(),
  '2026-01-02 03:04:05+00'::timestamptz,
  'a second call returns the first time'
);
-- A signed-in request that names no account stamps nobody.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(
  public.mark_onboarded(),
  null::timestamptz,
  'with no caller there is nothing to stamp'
);
reset role;

select is(
  (select onboarded_at from public.profiles where id = '00000000-0000-0000-0000-0000003550a1'),
  '2026-01-02 03:04:05+00'::timestamptz,
  'and the stored time did not move'
);
select is(
  (select count(*)::int from public.profiles where onboarded_at is not null),
  1,
  'still nobody else is stamped'
);

set local role anon;
select throws_ok(
  $$ select public.mark_onboarded() $$,
  '42501', null,
  'anon cannot call mark_onboarded'
);
reset role;

select * from finish();
rollback;
