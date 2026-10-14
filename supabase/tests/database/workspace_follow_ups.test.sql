-- Workspace follow-ups (20261010000000_workspace_follow_ups.sql).
--
-- What is held here:
--   1. Only an author reads a row of public.orgs, and only their own. A student reads none: not
--      one in classes of two workspaces, and not one taken off every class, whose profile still
--      names the first workspace they joined. They still get workspace names from my_classes().
--   2. An address is sent at most three invitations in 24 hours across every workspace, revoked
--      ones included. The fourth is `recipient_limited`, whoever asks; another address is not
--      refused; `already_member` and `already_invited` still win; a refusal writes nothing.
--
-- Not held here: two workspaces inviting one address at the same moment. create_org_invite takes
-- an advisory lock on the address for that; one transaction cannot show two sessions.
--
-- now() does not move inside a transaction, so "a day ago" is made by moving created_at.
-- Fixture ids of its own (…4100…).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  -- Four teachers who registered on their own, one workspace each.
  ('00000000-0000-0000-0000-0000004100a1', 't1@wfu.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000004100b1', 't2@wfu.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000004100c1', 't3@wfu.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000004100d1', 't4@wfu.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- A student in a class of each of two workspaces, a student who will be taken off their only
  -- class, and an account with no role.
  ('00000000-0000-0000-0000-0000004100e1', 'student-both@wfu.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000004100e2', 'student-removed@wfu.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000004100e3', 'nobody@wfu.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}');

select public.register_instructor('00000000-0000-0000-0000-0000004100a1', 'Workspace one 410');
select public.register_instructor('00000000-0000-0000-0000-0000004100b1', 'Workspace two 410');
select public.register_instructor('00000000-0000-0000-0000-0000004100c1', 'Workspace three 410');
select public.register_instructor('00000000-0000-0000-0000-0000004100d1', 'Workspace four 410');

create temporary table cast_orgs as
  select
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000004100a1') as org_1,
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000004100b1') as org_2;
grant select on cast_orgs to authenticated, anon, service_role;

insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000004100f1', org_1, 'NUR 410' from cast_orgs;
insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000004100f2', org_2, 'NUR 410' from cast_orgs;

-- Both students joined workspace one first, so that is the org their profiles name for good.
update public.profiles set org_id = (select org_1 from cast_orgs), role = 'student'
 where id in ('00000000-0000-0000-0000-0000004100e1', '00000000-0000-0000-0000-0000004100e2');
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000004100f1', '00000000-0000-0000-0000-0000004100e1'),
  ('00000000-0000-0000-0000-0000004100f2', '00000000-0000-0000-0000-0000004100e1'),
  ('00000000-0000-0000-0000-0000004100f1', '00000000-0000-0000-0000-0000004100e2');

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- The claims outlive `reset role`. Cleared after each signed-in block.
create function pg_temp.act_as_nobody() returns void
language sql as $$ select set_config('request.jwt.claims', '{}', true); $$;

-- ---------------------------------------------------------------------------
-- 1. Who reads a row of public.orgs
-- ---------------------------------------------------------------------------

select ok(
  (select count(*) from public.orgs o
    where o.id in (select org_1 from cast_orgs union all select org_2 from cast_orgs)) = 2,
  'control: as the superuser both workspaces are there to be read'
);
select is(
  (select array_agg(p.policyname::text order by p.policyname) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'orgs'),
  array['authors read their org'],
  'public.orgs has one policy, the authors'' one: "members read their org" is gone'
);

set local role authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-0000004100e1');
select is_empty(
  $$ select id from public.orgs $$,
  'a student in classes of two workspaces reads no org row, not even the first they joined'
);
select is(
  (select array_agg(workspace_name order by workspace_name) from public.my_classes()),
  array['Workspace one 410', 'Workspace two 410'],
  'and still gets the name of each class''s workspace from my_classes'
);

-- The teacher of workspace one takes the second student off their only class.
select pg_temp.act_as('00000000-0000-0000-0000-0000004100a1');
delete from public.class_members
 where class_id = '00000000-0000-0000-0000-0000004100f1'
   and profile_id = '00000000-0000-0000-0000-0000004100e2';

select pg_temp.act_as('00000000-0000-0000-0000-0000004100e2');
select is_empty(
  $$ select * from public.my_classes() $$,
  'a student taken off every class has no class left'
);
select is_empty(
  $$ select id from public.orgs $$,
  'and reads no org row, though their profile still names workspace one'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000004100e3');
select is_empty(
  $$ select id from public.orgs $$,
  'an account with no role reads no org row'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000004100a1');
select results_eq(
  $$ select id from public.orgs $$,
  $$ select org_1 from cast_orgs $$,
  'an instructor still reads exactly their own org'
);
select is(
  (select row(name, self_registered, ai_import_enabled)::text from public.orgs),
  row('Workspace one 410'::text, true, false)::text,
  'with the columns the workspace page and the welcome read'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000004100b1');
select results_eq(
  $$ select id from public.orgs $$,
  $$ select org_2 from cast_orgs $$,
  'and so does the instructor of the other workspace: their own and no other'
);

reset role;
select pg_temp.act_as_nobody();

select is(
  (select row(org_id, role)::text from public.profiles
    where id = '00000000-0000-0000-0000-0000004100e2'),
  (select row(org_1, 'student'::public.org_role)::text from cast_orgs),
  'control: the removed student''s profile does still name workspace one'
);

-- ---------------------------------------------------------------------------
-- 2. Three invitations to one address in 24 hours, across every workspace
-- ---------------------------------------------------------------------------

select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000004100a1', 'target@wfu.test')),
  'created',
  'workspace one invites an address'
);
-- Revoked at once. It still counts toward what the address was sent.
update public.org_invites set revoked_at = now() where email = 'target@wfu.test';
select is(
  array[
    (select status from public.create_org_invite(
       '00000000-0000-0000-0000-0000004100b1', ' Target@WFU.test ')),
    (select status from public.create_org_invite(
       '00000000-0000-0000-0000-0000004100c1', 'target@wfu.test'))
  ],
  array['created', 'created'],
  'and so do workspaces two and three: three invitations in the day'
);
select is(
  (select row(status, invite_id, token, expires_at)::text from public.create_org_invite(
     '00000000-0000-0000-0000-0000004100d1', 'target@wfu.test')),
  row('recipient_limited'::text, null::uuid, null::text, null::timestamptz)::text,
  'a fourth inviter, in a fourth workspace, is refused, with no token'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000004100a1', 'target@wfu.test')),
  'recipient_limited',
  'and so is the first inviter: revoking their invitation bought the address no fourth'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000004100b1', 'target@wfu.test')),
  'already_invited',
  'a workspace whose invitation is still pending is told that instead: the closer answer wins'
);
select is(
  (select count(*)::int from public.org_invites where email = 'target@wfu.test'),
  3,
  'no refusal wrote a row'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000004100d1', 'somebody-else@wfu.test')),
  'created',
  'the refused inviter can still invite a different address'
);

-- A member's own address, sent three invitations elsewhere (put in directly, already revoked).
insert into public.org_invites (org_id, email, token_hash, revoked_at)
  select (select org_1 from cast_orgs), 't4@wfu.test',
         encode(sha256(convert_to('wfu-member-' || n, 'UTF8')), 'hex'), now()
    from generate_series(1, 3) as n;
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000004100b1', 't4@wfu.test')),
  'recipient_limited',
  'control: that address is at its three'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000004100d1', 't4@wfu.test')),
  'already_member',
  'and its own workspace is still told it is a member already'
);

-- Once one of the three is more than a day old there is room again.
update public.org_invites set created_at = now() - interval '25 hours'
 where email = 'target@wfu.test' and revoked_at is not null;
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000004100d1', 'target@wfu.test')),
  'created',
  'an invitation older than 24 hours no longer counts, so the fourth workspace can invite'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000004100a1', 'target@wfu.test')),
  'recipient_limited',
  'which fills the three again'
);

-- ---------------------------------------------------------------------------
-- The catalog
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('service_role', 'public.create_org_invite(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_org_invite(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.create_org_invite(uuid, text)', 'execute'),
  'create_org_invite is still the service role''s alone'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     from pg_proc p where p.oid = 'public.create_org_invite(uuid, text)'::regprocedure),
  'and still runs with definer rights and an empty search_path'
);
select ok(
  exists (select 1 from pg_indexes i
           where i.schemaname = 'public' and i.tablename = 'org_invites'
             and i.indexname = 'org_invites_email_created_at_idx'),
  'the count by address has an index'
);

select * from finish();
rollback;
