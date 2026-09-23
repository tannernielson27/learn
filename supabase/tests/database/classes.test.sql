-- Classes and their invite links (#205).
--
-- A class belongs to one org. Its authors manage it and see its invite token; a student reads the
-- id and name of the classes they belong to and nothing else; an author of another org sees
-- nothing at all. The invite reaches the database two ways: `private.handle_new_user` and the
-- update trigger read `app_metadata.learn_invite` (the admin API writes it in an UPDATE after the
-- INSERT, which is why the update path exists), and `join_class` serves a signed-in account.
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000002050b0', 'Another school');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000002050a1', 'teacher-a@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000002050b1', 'teacher-b@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}');

select private.make_instructor('teacher-a@example.test');
update public.profiles set org_id = '00000000-0000-0000-0000-0000002050b0', role = 'instructor'
  where id = '00000000-0000-0000-0000-0000002050b1';

create function pg_temp.miss(times integer) returns void
language plpgsql as $$
begin
  for i in 1..times loop
    perform * from public.resolve_class_invite('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', '10.0.0.2');
  end loop;
end
$$;

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- ---------------------------------------------------------------------------
-- An author makes a class
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002050a1');

select lives_ok(
  $$ insert into public.classes (name) values ('NUR 310 — Fall') $$,
  'an author creates a class by naming it'
);
select lives_ok(
  $$ insert into public.classes (name) values ('NUR 320 — Spring') $$,
  'and a second one'
);
select throws_ok(
  $$ insert into public.classes (id, name) values
       ('00000000-0000-0000-0000-0000002050cf', 'Chosen id') $$,
  '42501', null,
  'the name is the only column an author writes'
);

-- Fixed ids for the rest of this file, set as the superuser (no member rows point at them yet).
reset role;
update public.classes set id = '00000000-0000-0000-0000-0000002050c1' where name = 'NUR 310 — Fall';
update public.classes set id = '00000000-0000-0000-0000-0000002050c2' where name = 'NUR 320 — Spring';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002050a1');
select is(
  (select org_id from public.classes where id = '00000000-0000-0000-0000-0000002050c1'),
  (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000002050a1'),
  'the class is in the author''s org'
);
select is(
  (select created_by from public.classes where id = '00000000-0000-0000-0000-0000002050c1'),
  '00000000-0000-0000-0000-0000002050a1'::uuid,
  'and records who made it'
);
select ok(
  (select invite_token ~ '^[A-Za-z0-9_-]{32}$' from public.classes
    where id = '00000000-0000-0000-0000-0000002050c1'),
  'its invite token is 32 url-safe characters: 24 random bytes, 192 bits'
);
select isnt(
  (select invite_token from public.classes where id = '00000000-0000-0000-0000-0000002050c1'),
  (select invite_token from public.classes where id = '00000000-0000-0000-0000-0000002050c2'),
  'two classes get two different tokens'
);
select throws_ok(
  $$ insert into public.classes (name, invite_token) values ('Mine', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$,
  '42501', null,
  'an author cannot choose a token'
);
select throws_ok(
  $$ update public.classes set invite_token = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      where id = '00000000-0000-0000-0000-0000002050c1' $$,
  '42501', null,
  'or set one'
);
select throws_ok(
  $$ insert into public.classes (name, org_id) values
       ('Elsewhere', '00000000-0000-0000-0000-0000002050b0') $$,
  '42501', null,
  'or put a class in another org'
);
select lives_ok(
  $$ update public.classes set name = 'NUR 310 — Fall 2026'
      where id = '00000000-0000-0000-0000-0000002050c1' $$,
  'an author renames a class'
);
select throws_ok(
  $$ insert into public.class_members (class_id, profile_id) values
       ('00000000-0000-0000-0000-0000002050c1', '00000000-0000-0000-0000-0000002050a1') $$,
  '42501', null,
  'nobody adds a member by hand: the invite is the only way in'
);

reset role;

-- ---------------------------------------------------------------------------
-- The invite seam in the sign-up trigger
-- ---------------------------------------------------------------------------

-- The admin API's real shape: INSERT with only the provider, then an UPDATE adds learn_invite.
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000002050d1', 'student-one@example.test', 'authenticated',
   'authenticated', '{"provider": "email", "providers": ["email"]}', '{}');
update auth.users
   set raw_app_meta_data = raw_app_meta_data
         || '{"learn_invite": {"class_id": "00000000-0000-0000-0000-0000002050c1"}}'
 where id = '00000000-0000-0000-0000-0000002050d1';

select is(
  (select row(org_id, role)::text from public.profiles where id = '00000000-0000-0000-0000-0000002050d1'),
  (select row(org_id, 'student'::public.org_role)::text from public.classes
    where id = '00000000-0000-0000-0000-0000002050c1'),
  'an account the admin API invites becomes a student in the class''s org'
);
select ok(
  exists (select 1 from public.class_members
           where class_id = '00000000-0000-0000-0000-0000002050c1'
             and profile_id = '00000000-0000-0000-0000-0000002050d1'),
  'and a member of that class'
);

-- The same invite present at INSERT, which is how a direct insert would carry it.
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000002050d2', 'student-two@example.test', 'authenticated',
   'authenticated',
   '{"provider": "email", "learn_invite": {"class_id": "00000000-0000-0000-0000-0000002050c2"}}', '{}'),
  -- A class that does not exist, a class id that is not a uuid, and an invite in user_metadata.
  ('00000000-0000-0000-0000-0000002050d3', 'nowhere@example.test', 'authenticated',
   'authenticated',
   '{"provider": "email", "learn_invite": {"class_id": "00000000-0000-0000-0000-0000002050ff"}}', '{}'),
  ('00000000-0000-0000-0000-0000002050d4', 'garbled@example.test', 'authenticated',
   'authenticated', '{"provider": "email", "learn_invite": {"class_id": "not a uuid"}}', '{}'),
  ('00000000-0000-0000-0000-0000002050d5', 'claims@example.test', 'authenticated',
   'authenticated', '{"provider": "email"}',
   '{"learn_invite": {"class_id": "00000000-0000-0000-0000-0000002050c1"}}');

select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000002050d2'),
  'student',
  'an invite present at insert works too'
);
select is(
  (select count(*)::int from public.profiles
    where id in ('00000000-0000-0000-0000-0000002050d3', '00000000-0000-0000-0000-0000002050d4',
                 '00000000-0000-0000-0000-0000002050d5')
      and role is null and org_id is null),
  3,
  'an invite to no class, a garbled class id, or one claimed in user_metadata grants nothing'
);
select is(
  (select count(*)::int from public.class_members
    where profile_id in ('00000000-0000-0000-0000-0000002050d3',
                         '00000000-0000-0000-0000-0000002050d4',
                         '00000000-0000-0000-0000-0000002050d5')),
  0,
  'and joins nothing'
);

-- An instructor whose app_metadata is later given an invite is never demoted.
update auth.users
   set raw_app_meta_data = raw_app_meta_data
         || '{"learn_invite": {"class_id": "00000000-0000-0000-0000-0000002050c1"}}'
 where id = '00000000-0000-0000-0000-0000002050a1';
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000002050a1'),
  'instructor',
  'an invite never turns an instructor into a student'
);
select ok(
  not exists (select 1 from public.class_members
               where profile_id = '00000000-0000-0000-0000-0000002050a1'),
  'or puts one on a roster'
);

-- A student of another org is not moved across by an invite.
update public.profiles set org_id = '00000000-0000-0000-0000-0000002050b0'
  where id = '00000000-0000-0000-0000-0000002050d2';
update auth.users
   set raw_app_meta_data = raw_app_meta_data
         || '{"learn_invite": {"class_id": "00000000-0000-0000-0000-0000002050c1"}}'
 where id = '00000000-0000-0000-0000-0000002050d2';
select is(
  (select count(*)::int from public.class_members
    where profile_id = '00000000-0000-0000-0000-0000002050d2'
      and class_id = '00000000-0000-0000-0000-0000002050c1'),
  0,
  'a student of another org is not added to this org''s class'
);
delete from public.class_members where profile_id = '00000000-0000-0000-0000-0000002050d2';
update public.profiles set org_id = (select org_id from public.classes
                                       where id = '00000000-0000-0000-0000-0000002050c1')
  where id = '00000000-0000-0000-0000-0000002050d2';

-- ---------------------------------------------------------------------------
-- As a student
-- ---------------------------------------------------------------------------

create function pg_temp.visible_rows() returns bigint
language plpgsql as $$
declare
  t record;
  n bigint;
  total bigint := 0;
begin
  for t in
    select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
      -- Their own profile, their own memberships and their own org's name are theirs to read.
      and c.relname not in ('profiles', 'class_members', 'orgs')
  loop
    if has_table_privilege(format('public.%I', t.relname), 'select') then
      execute format('select count(*) from public.%I', t.relname) into n;
      total := total + n;
    end if;
  end loop;
  return total;
end
$$;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002050d1');

select results_eq(
  $$ select class_id, class_name from public.my_classes() $$,
  $$ values ('00000000-0000-0000-0000-0000002050c1'::uuid, 'NUR 310 — Fall 2026'::text) $$,
  'a student lists the id and name of their own class, and only that'
);
select is((select count(*)::int from public.classes), 0,
  'a student reads no class row directly, so never a token');
select is(
  (select count(*)::int from public.class_members),
  1,
  'a student sees their own membership and nobody else''s'
);
select is(pg_temp.visible_rows(), 0::bigint,
  'a student reads zero rows from every content table');
select is((select count(*)::int from public.items), 0, 'not one item, so not one answer key');
select is_empty(
  $$ select * from public.class_roster('00000000-0000-0000-0000-0000002050c1') $$,
  'a student cannot read the roster'
);
select throws_ok(
  $$ select public.rotate_class_invite('00000000-0000-0000-0000-0000002050c1') $$,
  '42501', null,
  'a student cannot rotate a token'
);
delete from public.class_members where profile_id = '00000000-0000-0000-0000-0000002050d1';
update public.classes set name = 'Mine now';
select throws_ok(
  $$ insert into public.classes (name) values ('A class of my own') $$,
  '42501', null,
  'a student cannot create a class'
);
select throws_ok(
  $$ select private.admit_to_class('00000000-0000-0000-0000-0000002050d1',
                                   '00000000-0000-0000-0000-0000002050c2') $$,
  '42501', null,
  'nor call the admission helper'
);
select throws_ok(
  $$ select * from public.resolve_class_invite('x', null) $$,
  '42501', null,
  'nor resolve a token as the server does'
);

reset role;
select is(
  (select count(*)::int from public.class_members where profile_id = '00000000-0000-0000-0000-0000002050d1'),
  1,
  'a student''s delete removed nothing'
);
select is(
  (select name from public.classes where id = '00000000-0000-0000-0000-0000002050c1'),
  'NUR 310 — Fall 2026',
  'and a student''s rename changed nothing'
);

-- ---------------------------------------------------------------------------
-- As an author of another org
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002050b1');

select is((select count(*)::int from public.classes), 0, 'another org''s author sees no class');
select is((select count(*)::int from public.class_members), 0, 'and no membership');
select is_empty(
  $$ select * from public.class_roster('00000000-0000-0000-0000-0000002050c1') $$,
  'and no roster'
);
select throws_ok(
  $$ select public.rotate_class_invite('00000000-0000-0000-0000-0000002050c1') $$,
  'P0002', null,
  'and cannot rotate the token of a class it cannot see'
);
delete from public.class_members;
update public.classes set name = 'Taken over';

reset role;
select is(
  (select count(*)::int from public.class_members
    where class_id = '00000000-0000-0000-0000-0000002050c1'),
  1,
  'another org''s author removed nobody'
);

-- ---------------------------------------------------------------------------
-- As the class's author: roster, rotate, remove
-- ---------------------------------------------------------------------------

create temporary table old_token as
  select invite_token from public.classes where id = '00000000-0000-0000-0000-0000002050c1';
grant select on old_token to authenticated, service_role;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002050a1');

select results_eq(
  $$ select profile_id, email, signed_in
       from public.class_roster('00000000-0000-0000-0000-0000002050c1') $$,
  $$ values ('00000000-0000-0000-0000-0000002050d1'::uuid, 'student-one@example.test'::text, false) $$,
  'the author reads the roster: who, their address, and that they have not signed in yet'
);

create temporary table new_token (token text);
grant all on new_token to authenticated, service_role;
insert into new_token
  select public.rotate_class_invite('00000000-0000-0000-0000-0000002050c1');

select isnt((select token from new_token), (select invite_token from old_token),
  'rotating gives a new token');
select is(
  (select invite_token from public.classes where id = '00000000-0000-0000-0000-0000002050c1'),
  (select token from new_token),
  'and it is the one the class now has'
);

-- ---------------------------------------------------------------------------
-- Resolving a token, as the app's server
-- ---------------------------------------------------------------------------

set local role service_role;

select is_empty(
  $$ select * from public.resolve_class_invite((select invite_token from old_token), '10.0.0.1') $$,
  'a rotated token stops working at once'
);
select results_eq(
  $$ select class_id, class_name
       from public.resolve_class_invite((select token from new_token), '10.0.0.1') $$,
  $$ values ('00000000-0000-0000-0000-0000002050c1'::uuid, 'NUR 310 — Fall 2026'::text) $$,
  'the new token resolves to the class id and name, and nothing else'
);
select is_empty(
  $$ select * from public.resolve_class_invite('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', '10.0.0.1') $$,
  'an unknown token resolves to nothing'
);
select is_empty(
  $$ select * from public.resolve_class_invite('not a token', '10.0.0.1') $$,
  'a malformed token gets the same nothing'
);
select is_empty(
  $$ select * from public.resolve_class_invite(null, null) $$,
  'as does no token at all'
);

reset role;
select is(
  (select calls from private.code_lookups where client_key = 'invite|10.0.0.1'),
  3,
  'the rotated, unknown and malformed tokens were each counted as one miss; the hit was not'
);
set local role service_role;

select lives_ok($$ select pg_temp.miss(60) $$, 'sixty misses from one address are answered');
select throws_ok(
  $$ select pg_temp.miss(1) $$,
  'PT429', null,
  'the sixty-first is refused'
);
select results_eq(
  $$ select class_id from public.resolve_class_invite((select token from new_token), '10.0.0.2') $$,
  $$ values ('00000000-0000-0000-0000-0000002050c1'::uuid) $$,
  'but a real token is never refused, so a script cannot lock a classroom''s network out'
);

reset role;
select ok(
  has_function_privilege('service_role', 'public.resolve_class_invite(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.resolve_class_invite(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.resolve_class_invite(text, text)', 'execute'),
  'only the app''s server resolves a token, so the address it passes can be trusted'
);

-- ---------------------------------------------------------------------------
-- Joining while signed in
-- ---------------------------------------------------------------------------

-- An account with no role yet (Add user, never promoted) joining from the link.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002050d3');

select is(public.join_class('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'), 'invalid',
  'an unknown token joins nothing');
select is(public.join_class('not a token'), 'invalid', 'and a malformed one says the same');
select is(public.join_class((select token from new_token)), 'joined',
  'an account with no role joins with one tap');
select is(public.join_class((select token from new_token)), 'joined',
  'joining twice is harmless');

select pg_temp.act_as('00000000-0000-0000-0000-0000002050a1');
select is(public.join_class((select token from new_token)), 'instructor',
  'an instructor opening the link is told so');

reset role;
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000002050d3'),
  'student',
  'the account that joined is now a student'
);
select is(
  (select count(*)::int from public.class_members
    where class_id = '00000000-0000-0000-0000-0000002050c1'
      and profile_id = '00000000-0000-0000-0000-0000002050d3'),
  1,
  'with one membership'
);
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000002050a1'),
  'instructor',
  'and the instructor is still an instructor'
);

-- ---------------------------------------------------------------------------
-- Removing a student
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000002050a1');
delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000002050c1'
   and profile_id = '00000000-0000-0000-0000-0000002050d1';

select pg_temp.act_as('00000000-0000-0000-0000-0000002050d1');
select is_empty($$ select * from public.my_classes() $$,
  'a removed student no longer has the class');
select is(public.join_class((select token from new_token)), 'invalid',
  'and the link they still hold does not let them back in');
select is_empty($$ select * from public.my_classes() $$,
  'so the removal holds');

reset role;
select ok(
  exists (select 1 from private.class_removals
          where class_id = '00000000-0000-0000-0000-0000002050c1'
            and profile_id = '00000000-0000-0000-0000-0000002050d1'),
  'the removal is recorded where no client can reach it'
);
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000002050d1'),
  'student',
  'but keeps their account'
);

select * from finish();
rollback;
