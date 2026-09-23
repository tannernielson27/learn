-- Invite-only sign-up (#204): `private.handle_new_user` grants nothing, whatever the new account
-- claims, and `private.make_instructor` is the one line that turns an account into an author.
--
-- The local seed puts an org, the Samples bank and the demo account in first (seed-demo.sql
-- promotes the demo account explicitly), so an account that can see nothing is shown to see
-- nothing next to rows that are really there.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------------------------------------------------------------------------
-- New accounts, as the superuser (the dashboard's Add user and the admin API both insert here)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data)
values
  -- A plain new account, as Add user makes one.
  ('00000000-0000-0000-0000-0000002040aa', 'new-plain@example.test', 'authenticated',
   'authenticated', '{"provider": "email", "providers": ["email"]}', '{}'),
  -- user_metadata is the client's to write: claiming a role or an invite there gets nothing.
  ('00000000-0000-0000-0000-0000002040bb', 'new-claims@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}',
   '{"role": "instructor", "org_role": "admin", "learn_invite": {"class_id": "00000000-0000-0000-0000-0000002040c1"}}'),
  -- The seam #205 completes: an app_metadata invite (service role only) grants nothing YET.
  ('00000000-0000-0000-0000-0000002040cc', 'new-invited@example.test', 'authenticated',
   'authenticated',
   '{"provider": "email", "learn_invite": {"class_id": "00000000-0000-0000-0000-0000002040c1"}}', '{}'),
  -- app_metadata naming a role directly is not a thing the trigger reads either.
  ('00000000-0000-0000-0000-0000002040dd', 'new-approle@example.test', 'authenticated',
   'authenticated', '{"provider": "email", "role": "instructor"}', '{}'),
  -- An instructor made the supported way, to check promotion and that nothing later undoes it.
  ('00000000-0000-0000-0000-0000002040ee', 'New-Teacher@Example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}');

select is(
  (select row(org_id, role)::text from public.profiles where id = '00000000-0000-0000-0000-0000002040aa'),
  row(null::uuid, null::public.org_role)::text,
  'a new account gets a profile with no org and no role'
);
select is(
  (select row(org_id, role)::text from public.profiles where id = '00000000-0000-0000-0000-0000002040bb'),
  row(null::uuid, null::public.org_role)::text,
  'a role or an invite claimed in user_metadata grants nothing'
);
select is(
  (select row(org_id, role)::text from public.profiles where id = '00000000-0000-0000-0000-0000002040cc'),
  row(null::uuid, null::public.org_role)::text,
  'an app_metadata class invite grants nothing until #205 gives it a class to join'
);
select is(
  (select row(org_id, role)::text from public.profiles where id = '00000000-0000-0000-0000-0000002040dd'),
  row(null::uuid, null::public.org_role)::text,
  'a role named in app_metadata grants nothing'
);
select is(
  (select count(*)::int from public.profiles
   where id::text like '00000000-0000-0000-0000-0000002040%' and role is not null),
  0,
  'no new account became anything'
);

-- ---------------------------------------------------------------------------
-- Existing authors are untouched
-- ---------------------------------------------------------------------------

select is(
  (select role::text from public.profiles p join auth.users u on u.id = p.id
   where u.email = 'demo@learn.test'),
  'instructor',
  'the local demo account is still an instructor'
);

select lives_ok(
  $$ select private.make_instructor('new-teacher@example.test') $$,
  'make_instructor promotes an account by its address, in any letter case'
);
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000002040ee'),
  'instructor',
  'the promoted account is an instructor'
);
select is(
  (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002040ee'),
  (select id from public.orgs order by created_at, id limit 1),
  'and it joins the first org, the one the trigger used to use'
);

update auth.users
  set raw_app_meta_data = '{"provider": "email", "role": null}',
      raw_user_meta_data = '{"role": "student"}',
      email = 'teacher-renamed@example.test'
  where id = '00000000-0000-0000-0000-0000002040ee';
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000002040ee'),
  'instructor',
  'an existing instructor keeps its role when its auth row changes'
);

select lives_ok(
  $$ select private.make_instructor('teacher-renamed@example.test') $$,
  'promoting an instructor again is harmless'
);
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000002040ee';
select lives_ok(
  $$ select private.make_instructor('teacher-renamed@example.test') $$,
  'promoting an admin runs'
);
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000002040ee'),
  'admin',
  'but never demotes the admin'
);

select throws_ok(
  $$ select private.make_instructor('nobody@example.test') $$,
  'P0002', null,
  'an address with no account is an error, not a silent no-op'
);

-- ---------------------------------------------------------------------------
-- Nobody signed in can grant a role
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'private.make_instructor(text)', 'execute')
  and not has_function_privilege('anon', 'private.make_instructor(text)', 'execute')
  and not has_function_privilege('service_role', 'private.make_instructor(text)', 'execute'),
  'make_instructor is for the owner in the SQL editor, not for any API role'
);

-- ---------------------------------------------------------------------------
-- As the account with no role
-- ---------------------------------------------------------------------------

-- Counts every public table the role may select from at all, as the caller, so RLS applies.
-- A table the role cannot select from is refused outright, which is also zero rows.
create function pg_temp.visible_rows() returns bigint
language plpgsql as $$
declare
  t record;
  n bigint;
  total bigint := 0;
begin
  for t in
    select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') and c.relname <> 'profiles'
  loop
    if has_table_privilege(format('public.%I', t.relname), 'select') then
      execute format('select count(*) from public.%I', t.relname) into n;
      total := total + n;
    end if;
  end loop;
  return total;
end
$$;

select ok(
  (select count(*) from public.items) > 0 and pg_temp.visible_rows() > 0,
  'control: as the superuser the content tables hold rows'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000002040cc","role":"authenticated"}', true);

select is(pg_temp.visible_rows(), 0::bigint,
  'an account with no role reads zero rows from every content table');
select is((select count(*)::int from public.items), 0, 'not one item, so not one answer key');
select is(
  (select count(*)::int from public.profiles),
  1,
  'it can read its own profile and nobody else''s'
);
select ok(not private.is_author(), 'it is not an author');

select throws_ok(
  $$ update public.profiles set role = 'instructor' where id = '00000000-0000-0000-0000-0000002040cc' $$,
  '42501', null,
  'authenticated cannot give itself a role'
);
select throws_ok(
  $$ update public.profiles set org_id = (select id from public.orgs limit 1)
     where id = '00000000-0000-0000-0000-0000002040cc' $$,
  '42501', null,
  'authenticated cannot give itself an org'
);
select throws_ok(
  $$ select private.make_instructor('new-invited@example.test') $$,
  '42501', null,
  'authenticated cannot call make_instructor'
);

reset role;
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000002040cc'),
  null::public.org_role,
  'after all that, it still has no role'
);

select * from finish();
rollback;
