-- Membership changes (20261011000000_workspace_remove_and_move.sql, ADR 0011).
--
-- What is held here:
--   1. A workspace records its founder. Only the founder removes a colleague, only from a
--      self-registered workspace, never themselves, and never anyone outside it. A removed
--      teacher is at once the founder of a new, empty workspace; what they authored stays; the
--      session they were hosting is ended; the invitations they had sent are revoked; and under
--      row level security they no longer see anything of the workspace they left.
--   2. A teacher may accept an invitation, moving, only when: they are not in the shared
--      workspace, are not a founder with other members, would not leave students without a
--      teacher, and the caller passes the confirmation. Without it nothing is written.
--      org_invite_move_preview says the same things and counts what would be lost.
--   3. A move deletes nothing. A workspace that lost its last teacher gets `emptied_at` and has
--      its pending invitations revoked; no other path sets `emptied_at`.
--
-- Not held here: the backfill of `founder_id` for workspaces that existed before the migration
-- (it runs once, in the statement that adds the column, before any test fixture exists), and two
-- of these calls racing (one transaction cannot show two sessions; see "Locks" in the migration).
--
-- now() does not move inside a transaction, so "two days ago" is made by moving created_at.
-- Fixture ids of its own (…4200…).
begin;
create extension if not exists pgtap with schema extensions;
select plan(100);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  -- Five teachers who registered on their own, one workspace each.
  ('00000000-0000-0000-0000-0000004200a1', 'ada@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000004200b1', 'ben@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000004200c1', 'cy@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000004200d1', 'dee@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000004200e1', 'pat@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- An instructor of a workspace the owner made by hand.
  ('00000000-0000-0000-0000-0000004200f1', 'eve@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- Two accounts with no role, who join Ada's workspace by invitation.
  ('00000000-0000-0000-0000-000000420001', 'mia@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000420002', 'max@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- A student in a class of Cy's, and a student whose profile names Ada's workspace.
  ('00000000-0000-0000-0000-000000420003', 'stu@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000420004', 'sta@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- Two accounts with no role: one Mia invites, one Ben invites.
  ('00000000-0000-0000-0000-000000420005', 'nobody@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000420006', 'newbie@rm.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}');

select public.register_instructor('00000000-0000-0000-0000-0000004200a1', 'Ada workspace 420');
select public.register_instructor('00000000-0000-0000-0000-0000004200b1', 'Ben workspace 420');
select public.register_instructor('00000000-0000-0000-0000-0000004200c1', 'Cy workspace 420');
select public.register_instructor('00000000-0000-0000-0000-0000004200d1', 'Dee workspace 420');
select public.register_instructor('00000000-0000-0000-0000-0000004200e1', 'Pat workspace 420');

insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000004200f0', 'Plain org 420');

create temporary table cast_orgs as
  select
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000004200a1') as org_a,
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000004200b1') as org_b,
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000004200c1') as org_c,
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000004200d1') as org_d,
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000004200e1') as org_p;
grant select on cast_orgs to authenticated, anon, service_role;

update public.profiles set display_name = 'Mia Chen'
 where id = '00000000-0000-0000-0000-000000420001';
update public.profiles
   set org_id = '00000000-0000-0000-0000-0000004200f0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000004200f1';
update public.profiles set org_id = (select org_c from cast_orgs), role = 'student'
 where id = '00000000-0000-0000-0000-000000420003';
update public.profiles set org_id = (select org_a from cast_orgs), role = 'student'
 where id = '00000000-0000-0000-0000-000000420004';

-- Ada's workspace: a bank with one published item, to run a session from.
insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000004200aa', org_a, 'A live bank' from cast_orgs;
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000004200ab', '00000000-0000-0000-0000-0000004200aa', org_a,
         'multiple_choice', 'published', '{}', '{}', '{}'
    from cast_orgs;

-- Cy's workspace: a bank with one published item, and a class with one student in it.
insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000004200ca', org_c, 'C bank' from cast_orgs;
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000004200cb', '00000000-0000-0000-0000-0000004200ca', org_c,
         'multiple_choice', 'published', '{}', '{}', '{}'
    from cast_orgs;
insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000004200cc', org_c, 'NUR 420' from cast_orgs;
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-0000004200cc', '00000000-0000-0000-0000-000000420003');

-- Dee's workspace: two banks and a class nobody has joined.
insert into public.item_banks (id, org_id, name)
  select v.id, org_d, v.name
    from cast_orgs,
         (values ('00000000-0000-0000-0000-0000004200da'::uuid, 'D bank one'),
                 ('00000000-0000-0000-0000-0000004200db'::uuid, 'D bank two')) as v (id, name);
insert into public.classes (id, org_id, name)
  select '00000000-0000-0000-0000-0000004200dc', org_d, 'NUR 421' from cast_orgs;

-- Every invitation this test makes through create_org_invite, by a name, with its raw token.
create temporary table made (
  name text primary key,
  status text,
  invite_id uuid,
  token text,
  expires_at timestamptz
);
grant select on made to authenticated, anon, service_role;

-- Every session this test starts, by a name.
create temporary table started (name text primary key, session_id uuid);
grant select, insert on started to authenticated;

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- The claims outlive `reset role`. Cleared after each signed-in block.
create function pg_temp.act_as_nobody() returns void
language sql as $$ select set_config('request.jwt.claims', '{}', true); $$;

create function pg_temp.account(account uuid) returns text
language sql as $$
  select row(p.org_id, p.role)::text from public.profiles p where p.id = account;
$$;

-- Who is where, and which workspaces are marked emptied: compared across a run of refusals.
create function pg_temp.snapshot() returns text
language sql as $$
  select coalesce((select string_agg(row(p.id, p.org_id, p.role)::text, '|' order by p.id)
                     from public.profiles p), '')
      || '#'
      || coalesce((select string_agg(row(o.id, o.founder_id, o.emptied_at)::text, '|' order by o.id)
                     from public.orgs o), '')
      || '#'
      || (select count(*) from public.org_invites i where i.accepted_at is not null)::text
      || '#'
      || (select count(*) from public.org_invites i where i.revoked_at is not null)::text;
$$;

-- Mia and Max join Ada's workspace by invitation, as accounts with no role.
insert into made
  select 'mia', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000004200a1', 'mia@rm.test') as c;
insert into made
  select 'max', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000004200a1', 'max@rm.test') as c;

-- ---------------------------------------------------------------------------
-- The columns and who may call what
-- ---------------------------------------------------------------------------

select is(
  (select array[
     public.accept_org_invite('00000000-0000-0000-0000-000000420001',
       (select token from made where name = 'mia')),
     public.accept_org_invite('00000000-0000-0000-0000-000000420002',
       (select token from made where name = 'max'))]),
  array['accepted', 'accepted'],
  'an account with no role is accepted by a call that names two arguments, as before'
);
select is(
  (select array_agg(o.founder_id order by o.name) from public.orgs o
    where o.id in (select org_a from cast_orgs union all select org_b from cast_orgs)),
  array['00000000-0000-0000-0000-0000004200a1'::uuid, '00000000-0000-0000-0000-0000004200b1'::uuid],
  'register_instructor records the founder of the workspace it makes'
);
select is(
  (select row(o.founder_id, o.emptied_at)::text from public.orgs o
    where o.id = '00000000-0000-0000-0000-0000004200f0'),
  row(null::uuid, null::timestamptz)::text,
  'a workspace made by hand has no founder'
);
select is(
  (select o.founder_id from public.orgs o where o.id = (select org_a from cast_orgs)),
  '00000000-0000-0000-0000-0000004200a1'::uuid,
  'and a colleague joining by invitation does not change who the founder is'
);
select is(
  (select count(*)::int from public.orgs where emptied_at is not null),
  0,
  'no workspace starts out emptied'
);
select ok(
  not has_column_privilege('authenticated', 'public.orgs', 'founder_id', 'update')
  and not has_column_privilege('authenticated', 'public.orgs', 'emptied_at', 'update')
  and not has_column_privilege('authenticated', 'public.orgs', 'founder_id', 'insert')
  and not has_column_privilege('anon', 'public.orgs', 'founder_id', 'select'),
  'nobody signed in writes founder_id or emptied_at, and anon reads neither'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'accept_org_invite'),
  1,
  'there is one accept_org_invite: the two-argument function is gone'
);
select ok(
  not has_function_privilege('anon', 'public.accept_org_invite(uuid, text, boolean)', 'execute')
  and not has_function_privilege(
    'authenticated', 'public.accept_org_invite(uuid, text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.org_invite_move_preview(uuid, text)', 'execute')
  and not has_function_privilege(
    'authenticated', 'public.org_invite_move_preview(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.register_instructor(uuid, text)', 'execute')
  and not has_function_privilege(
    'authenticated', 'public.register_instructor(uuid, text)', 'execute'),
  'neither anon nor authenticated holds EXECUTE on accept, the move preview or register'
);
select ok(
  has_function_privilege('service_role', 'public.accept_org_invite(uuid, text, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.org_invite_move_preview(uuid, text)', 'execute')
  and has_function_privilege('service_role', 'public.register_instructor(uuid, text)', 'execute'),
  'service_role holds all three'
);
select ok(
  has_function_privilege('authenticated', 'public.remove_org_member(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.remove_org_member(uuid)', 'execute'),
  'removing a colleague is for signed-in accounts, never anon'
);
select ok(
  not has_function_privilege('authenticated', 'private.found_workspace(uuid, text)', 'execute')
  and not has_function_privilege('service_role', 'private.found_workspace(uuid, text)', 'execute')
  and not has_function_privilege(
    'authenticated', 'private.close_departed_teacher(uuid, uuid)', 'execute')
  and not has_function_privilege(
    'authenticated', 'private.org_move_refusal(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege(
    'authenticated', 'private.default_workspace_name(text)', 'execute'),
  'the private helpers are nobody''s to call'
);
select is(
  (select count(*)::int from pg_proc p
    where p.oid in (
            'public.remove_org_member(uuid)'::regprocedure,
            'public.accept_org_invite(uuid, text, boolean)'::regprocedure,
            'public.org_invite_move_preview(uuid, text)'::regprocedure,
            'public.register_instructor(uuid, text)'::regprocedure,
            'private.found_workspace(uuid, text)'::regprocedure,
            'private.close_departed_teacher(uuid, uuid)'::regprocedure,
            'private.org_move_refusal(uuid, uuid, uuid)'::regprocedure)
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  7,
  'all seven are security definer with an empty search_path'
);

-- ---------------------------------------------------------------------------
-- The name of a removed teacher's new workspace
-- ---------------------------------------------------------------------------

select is(
  private.default_workspace_name('  Mia Chen  '),
  'Mia Chen' || chr(8217) || 's workspace',
  'a workspace is named after its teacher, as sign-up names one'
);
select is(
  array[private.default_workspace_name(null), private.default_workspace_name('   ')],
  array['My workspace', 'My workspace'],
  'an account nobody has named gets a plain name'
);
select is(
  length(private.default_workspace_name(repeat('n', 80))),
  80,
  'a long name is cut so the whole fits in 80 characters'
);

-- ---------------------------------------------------------------------------
-- Removing: who is refused
-- ---------------------------------------------------------------------------

create temporary table before_refused_removals as select pg_temp.snapshot() as snapshot;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000420001');
select is(
  public.remove_org_member('00000000-0000-0000-0000-000000420002'),
  'not_founder',
  'a colleague who did not start the workspace cannot remove another'
);
select is(
  public.remove_org_member('00000000-0000-0000-0000-0000004200a1'),
  'not_founder',
  'nor the founder'
);
select pg_temp.act_as('00000000-0000-0000-0000-0000004200a1');
select is(
  public.remove_org_member('00000000-0000-0000-0000-0000004200a1'),
  'is_founder',
  'the founder cannot remove themselves'
);
select is(
  public.remove_org_member('00000000-0000-0000-0000-0000004200b1'),
  'not_found',
  'a teacher of another workspace is not found, not "not yours"'
);
select is(
  public.remove_org_member('00000000-0000-0000-0000-000000420004'),
  'not_found',
  'a student whose profile names the workspace is not a member of it'
);
select is(
  public.remove_org_member('00000000-0000-0000-0000-000000420005'),
  'not_found',
  'nor is an account with no role'
);
select is(
  public.remove_org_member('00000000-0000-0000-0000-0000004200ff'),
  'not_found',
  'an id with no account is not found'
);
select is(
  public.remove_org_member(null),
  'not_found',
  'and neither is no id at all'
);
select pg_temp.act_as('00000000-0000-0000-0000-0000004200f1');
select is(
  public.remove_org_member('00000000-0000-0000-0000-0000004200a1'),
  'shared_workspace',
  'nobody removes anyone in a workspace that is not self-registered'
);
select pg_temp.act_as('00000000-0000-0000-0000-000000420003');
select throws_ok(
  $$ select public.remove_org_member('00000000-0000-0000-0000-000000420002') $$,
  '42501', null,
  'a student cannot call it'
);
select pg_temp.act_as('00000000-0000-0000-0000-000000420005');
select throws_ok(
  $$ select public.remove_org_member('00000000-0000-0000-0000-000000420002') $$,
  '42501', null,
  'nor can an account with no role'
);
reset role;
select pg_temp.act_as_nobody();

-- A workspace whose founder's account is gone has nobody who can remove.
update public.orgs set founder_id = null where id = (select org_a from cast_orgs);
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000004200a1');
select is(
  public.remove_org_member('00000000-0000-0000-0000-000000420002'),
  'not_founder',
  'with no founder on record, nobody can remove'
);
reset role;
select pg_temp.act_as_nobody();
update public.orgs set founder_id = '00000000-0000-0000-0000-0000004200a1'
 where id = (select org_a from cast_orgs);

select is(
  pg_temp.snapshot(),
  (select snapshot from before_refused_removals),
  'not one profile, workspace or invitation changed across every refusal'
);

-- ---------------------------------------------------------------------------
-- Removing
-- ---------------------------------------------------------------------------

-- Mia has made a bank, is hosting a session, and has invited somebody. Ada has invited somebody.
insert into public.item_banks (id, org_id, name, created_by)
  select '00000000-0000-0000-0000-0000004200ac', org_a, 'Mia bank',
         '00000000-0000-0000-0000-000000420001'
    from cast_orgs;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000420001');
insert into started
  select 'mia', public.start_session('00000000-0000-0000-0000-0000004200aa'::uuid, null);
reset role;
select pg_temp.act_as_nobody();
insert into made
  select 'by-mia', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-000000420001', 'nobody@rm.test') as c;
insert into made
  select 'by-ada', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000004200a1', 'pending-by-ada@rm.test') as c;
select is(
  (select array_agg(status order by name) from made where name in ('by-mia', 'by-ada')),
  array['created', 'created'],
  'any member may invite, the founder and a colleague alike'
);
select is(
  (select s.status::text from public.sessions s join started t on t.session_id = s.id
    where t.name = 'mia'),
  'lobby',
  'the colleague is hosting a session that has not ended'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000004200a1');
select is(
  public.remove_org_member('00000000-0000-0000-0000-000000420001'),
  'removed',
  'the founder removes a colleague'
);
reset role;
select pg_temp.act_as_nobody();

select ok(
  (select p.role = 'instructor' and p.org_id <> (select org_a from cast_orgs)
     from public.profiles p where p.id = '00000000-0000-0000-0000-000000420001'),
  'the removed teacher is still a teacher, and no longer in that workspace'
);
select is(
  (select row(o.name, o.self_registered, o.ai_import_enabled, o.founder_id, o.emptied_at)::text
     from public.orgs o
     join public.profiles p on p.org_id = o.id
    where p.id = '00000000-0000-0000-0000-000000420001'),
  row('Mia Chen' || chr(8217) || 's workspace', true, false,
      '00000000-0000-0000-0000-000000420001'::uuid, null::timestamptz)::text,
  'they founded a new self-registered workspace named after them, with no AI import'
);
select is(
  (select (select count(*) from public.item_banks b where b.org_id = p.org_id)
        + (select count(*) from public.classes c where c.org_id = p.org_id)
        + (select count(*) from public.sessions s where s.org_id = p.org_id)
        + (select count(*) from public.profiles q where q.org_id = p.org_id and q.id <> p.id)
     from public.profiles p where p.id = '00000000-0000-0000-0000-000000420001')::int,
  0,
  'the new workspace is empty, and theirs alone'
);
select is(
  (select row(b.org_id, b.created_by)::text from public.item_banks b
    where b.id = '00000000-0000-0000-0000-0000004200ac'),
  (select row(org_a, '00000000-0000-0000-0000-000000420001'::uuid)::text from cast_orgs),
  'what they authored stays in the workspace they were removed from'
);
select ok(
  (select s.status = 'ended' and s.closed_at is not null
          and s.org_id = (select org_a from cast_orgs)
     from public.sessions s join started t on t.session_id = s.id where t.name = 'mia'),
  'the session they were hosting is ended, and stays in that workspace'
);
select is(
  (select array_agg(i.revoked_at is not null order by m.name)
     from public.org_invites i join made m on m.invite_id = i.id
    where m.name in ('by-ada', 'by-mia')),
  array[false, true],
  'the invitation they had sent is revoked; the founder''s is not'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000420005',
    (select token from made where name = 'by-mia'), true),
  'revoked',
  'so nobody joins on the removed teacher''s invitation'
);
select is(
  (select row(o.founder_id, o.emptied_at)::text from public.orgs o
    where o.id = (select org_a from cast_orgs)),
  row('00000000-0000-0000-0000-0000004200a1'::uuid, null::timestamptz)::text,
  'a removal does not mark the workspace emptied, and its founder is who it was'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000004200a1');
select results_eq(
  $$ select email from public.org_members() order by email $$,
  $$ values ('ada@rm.test'::text), ('max@rm.test'::text) $$,
  'the founder''s member list no longer has them'
);
select is(
  public.remove_org_member('00000000-0000-0000-0000-000000420001'),
  'not_found',
  'removing them again finds nobody'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000420001');
select ok(
  private.is_author() and private.current_org_id() <> (select org_a from cast_orgs),
  'the removed teacher is an author of their own workspace, on the same session'
);
select is(
  (select count(*)::int from public.item_banks)
    + (select count(*)::int from public.sessions)
    + (select count(*)::int from public.org_invites),
  0,
  'and reads no bank, session or invitation of the workspace they left'
);
select results_eq(
  $$ select email from public.org_members() $$,
  $$ values ('mia@rm.test'::text) $$,
  'their member list is themselves'
);
select throws_ok(
  $$ select public.end_session((select session_id from started where name = 'mia')) $$,
  'P0002', null,
  'the session they hosted is gone to them'
);
select is(
  public.remove_org_member('00000000-0000-0000-0000-000000420002'),
  'not_found',
  'founding a workspace of their own gives them no reach back into the old one'
);
reset role;
select pg_temp.act_as_nobody();

-- ---------------------------------------------------------------------------
-- Moving: what the preview says
-- ---------------------------------------------------------------------------

-- Ben invites five teachers. An inviter makes five invitations a day, so these are then aged.
insert into made
  select v.name, c.*
    from (values ('dee', 'dee@rm.test'), ('cy', 'cy@rm.test'), ('ada', 'ada@rm.test'),
                 ('max-b', 'max@rm.test'), ('eve', 'eve@rm.test')) as v (name, email),
         lateral public.create_org_invite('00000000-0000-0000-0000-0000004200b1', v.email) as c;
update public.org_invites set created_at = now() - interval '2 days'
 where invited_by = '00000000-0000-0000-0000-0000004200b1';
insert into made
  select v.name, c.*
    from (values ('stu', 'stu@rm.test'), ('pat', 'pat@rm.test'),
                 ('newbie', 'newbie@rm.test')) as v (name, email),
         lateral public.create_org_invite('00000000-0000-0000-0000-0000004200b1', v.email) as c;
select is(
  (select count(*)::int from made
    where name in ('dee', 'cy', 'ada', 'max-b', 'eve', 'stu', 'pat', 'newbie')
      and status = 'created'),
  8,
  'an invitation can be made for any address, a teacher''s included'
);

-- Pat is put in Ben's workspace by hand, with an invitation into it still pending.
update public.profiles set org_id = (select org_b from cast_orgs)
 where id = '00000000-0000-0000-0000-0000004200e1';

create temporary table before_refused_moves as select pg_temp.snapshot() as snapshot;

set local role service_role;
select is(
  (select row(p.*)::text from public.org_invite_move_preview(
     '00000000-0000-0000-0000-0000004200d1', (select token from made where name = 'dee')) as p),
  row('move_needs_confirmation'::text, 'Dee workspace 420'::text, 2, 1)::text,
  'a teacher alone in an empty workspace may move: its name, its banks and its classes'
);
select is(
  (select row(p.*)::text from public.org_invite_move_preview(
     '00000000-0000-0000-0000-000000420002', (select token from made where name = 'max-b')) as p),
  row('move_needs_confirmation'::text, 'Ada workspace 420'::text, 2, 0)::text,
  'a colleague who did not found the workspace may move while others stay'
);
select is(
  (select row(p.*)::text from public.org_invite_move_preview(
     '00000000-0000-0000-0000-0000004200c1', (select token from made where name = 'cy')) as p),
  row('students_depend'::text, null::text, null::integer, null::integer)::text,
  'the only teacher of a workspace with a student in a class may not, and nothing is counted'
);
select is(
  (select p.status from public.org_invite_move_preview(
     '00000000-0000-0000-0000-0000004200a1', (select token from made where name = 'ada')) as p),
  'founder_with_members',
  'a founder with a colleague still in the workspace may not'
);
select is(
  (select p.status from public.org_invite_move_preview(
     '00000000-0000-0000-0000-0000004200f1', (select token from made where name = 'eve')) as p),
  'teaches_shared',
  'a teacher of a workspace that is not self-registered may not'
);
select is(
  (select p.status from public.org_invite_move_preview(
     '00000000-0000-0000-0000-0000004200e1', (select token from made where name = 'pat')) as p),
  'already_member',
  'a teacher already in the inviting workspace has nothing to accept'
);
select is(
  (select array[
     (select p.status from public.org_invite_move_preview(
        '00000000-0000-0000-0000-000000420003', (select token from made where name = 'stu')) as p),
     (select p.status from public.org_invite_move_preview(
        '00000000-0000-0000-0000-000000420006',
        (select token from made where name = 'newbie')) as p)]),
  array['not_teaching', 'not_teaching'],
  'a student and an account with no role are not a move'
);
select is(
  (select row(p.*)::text from public.org_invite_move_preview(
     '00000000-0000-0000-0000-0000004200d1', (select token from made where name = 'cy')) as p),
  row('wrong_address'::text, null::text, null::integer, null::integer)::text,
  'somebody else''s invitation says nothing about the caller''s workspace'
);
select is(
  (select array[
     (select p.status from public.org_invite_move_preview(
        '00000000-0000-0000-0000-0000004200d1', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz') as p),
     (select p.status from public.org_invite_move_preview(
        '00000000-0000-0000-0000-0000004200d1', null) as p),
     (select p.status from public.org_invite_move_preview(
        '00000000-0000-0000-0000-0000004200ff', (select token from made where name = 'dee')) as p)]),
  array['invalid', 'invalid', 'invalid'],
  'an unknown token, no token and an id with no account are all invalid'
);
reset role;

-- ---------------------------------------------------------------------------
-- Moving: who is refused, confirmed or not
-- ---------------------------------------------------------------------------

set local role service_role;
select is(
  (select array[
     public.accept_org_invite('00000000-0000-0000-0000-0000004200d1',
       (select token from made where name = 'dee')),
     public.accept_org_invite('00000000-0000-0000-0000-0000004200d1',
       (select token from made where name = 'dee'), false),
     public.accept_org_invite('00000000-0000-0000-0000-0000004200d1',
       (select token from made where name = 'dee'), null)]),
  array['move_needs_confirmation', 'move_needs_confirmation', 'move_needs_confirmation'],
  'a teacher who may move is not moved by a call that does not say it is confirmed'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000004200c1',
    (select token from made where name = 'cy'), true),
  'students_depend',
  'confirming does not move the only teacher of a class with a student in it'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000004200a1',
    (select token from made where name = 'ada'), true),
  'founder_with_members',
  'nor a founder away from the colleagues they invited'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000004200f1',
    (select token from made where name = 'eve'), true),
  'teaches_shared',
  'nor a teacher out of the shared workspace'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000004200e1',
    (select token from made where name = 'pat'), true),
  'already_member',
  'nor a teacher into the workspace they are in'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000420003',
    (select token from made where name = 'stu'), true),
  'student',
  'and a student is still refused as a student'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000004200d1',
    (select token from made where name = 'cy'), true),
  'wrong_address',
  'the link still works only for the invited address'
);
reset role;

-- The other two things that hold the last teacher: an assignment that has not closed, and a
-- session that has not ended. Each is put in place alone.
delete from public.class_members where class_id = '00000000-0000-0000-0000-0000004200cc';
select is(
  (select p.status from public.org_invite_move_preview(
     '00000000-0000-0000-0000-0000004200c1', (select token from made where name = 'cy')) as p),
  'move_needs_confirmation',
  'with the student gone, a class with nobody in it does not hold its teacher'
);
insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at)
  select '00000000-0000-0000-0000-0000004200cd', org_c, '00000000-0000-0000-0000-0000004200cc',
         '00000000-0000-0000-0000-0000004200ca', 'Open 420', now() + interval '1 day',
         now() + interval '2 days'
    from cast_orgs;
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000004200c1',
    (select token from made where name = 'cy'), true),
  'students_depend',
  'an assignment that has not closed holds them, one not yet open included'
);
delete from public.assignments where id = '00000000-0000-0000-0000-0000004200cd';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000004200c1');
insert into started
  select 'cy', public.start_session('00000000-0000-0000-0000-0000004200ca'::uuid, null);
reset role;
select pg_temp.act_as_nobody();
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000004200c1',
    (select token from made where name = 'cy'), true),
  'students_depend',
  'and so does a live session that has not ended'
);
update public.sessions set status = 'ended'
 where id = (select session_id from started where name = 'cy');
select is(
  (select p.status from public.org_invite_move_preview(
     '00000000-0000-0000-0000-0000004200c1', (select token from made where name = 'cy')) as p),
  'move_needs_confirmation',
  'once it has ended, nothing holds them'
);

select is(
  pg_temp.snapshot(),
  (select snapshot from before_refused_moves),
  'not one profile, workspace or invitation changed across every refusal and every preview'
);

-- ---------------------------------------------------------------------------
-- Moving: a colleague leaves a workspace that others stay in
-- ---------------------------------------------------------------------------

-- Max is hosting a session in Ada's workspace and has sent an invitation from it.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000420002');
insert into started
  select 'max', public.start_session('00000000-0000-0000-0000-0000004200aa'::uuid, null);
reset role;
select pg_temp.act_as_nobody();
insert into made
  select 'by-max', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-000000420002', 'pending-by-max@rm.test') as c;

set local role service_role;
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000420002',
    (select token from made where name = 'max-b'), true),
  'accepted',
  'a colleague who confirms is moved'
);
reset role;
select is(
  pg_temp.account('00000000-0000-0000-0000-000000420002'),
  (select row(org_b, 'instructor'::public.org_role)::text from cast_orgs),
  'they are an instructor of the inviting workspace'
);
select ok(
  (select i.accepted_at is not null and i.accepted_by = '00000000-0000-0000-0000-000000420002'
     from public.org_invites i join made m on m.invite_id = i.id where m.name = 'max-b'),
  'and the invitation records when and by whom'
);
select is(
  (select row(o.founder_id, o.emptied_at)::text from public.orgs o
    where o.id = (select org_a from cast_orgs)),
  row('00000000-0000-0000-0000-0000004200a1'::uuid, null::timestamptz)::text,
  'the workspace they left still has a teacher, and is not marked emptied'
);
select ok(
  (select s.status = 'ended' from public.sessions s
     join started t on t.session_id = s.id where t.name = 'max'),
  'the session they were hosting there is ended'
);
select is(
  (select array_agg(i.revoked_at is not null order by m.name)
     from public.org_invites i join made m on m.invite_id = i.id
    where m.name in ('by-ada', 'by-max')),
  array[false, true],
  'the invitation they had sent from there is revoked; the founder''s is not'
);
select is(
  (select count(*)::int from public.item_banks b where b.org_id = (select org_a from cast_orgs)),
  2,
  'nothing in the workspace they left was deleted'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000420002',
    (select token from made where name = 'max-b'), true),
  'already_accepted',
  'accepting twice is answered already_accepted'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000420002');
select ok(
  private.is_author() and private.current_org_id() = (select org_b from cast_orgs),
  'on the same session they are an author of the workspace they joined'
);
select is(
  (select count(*)::int from public.item_banks
    where org_id = (select org_a from cast_orgs)),
  0,
  'and read no bank of the one they left'
);
select results_eq(
  $$ select email from public.org_members() order by email $$,
  $$ values ('ben@rm.test'::text), ('max@rm.test'::text), ('pat@rm.test'::text) $$,
  'they are listed with the members of the workspace they joined'
);
select is(
  public.remove_org_member('00000000-0000-0000-0000-0000004200b1'),
  'not_founder',
  'where they did not start the workspace and cannot remove its founder'
);
select pg_temp.act_as('00000000-0000-0000-0000-0000004200a1');
select results_eq(
  $$ select email from public.org_members() $$,
  $$ values ('ada@rm.test'::text) $$,
  'the founder they left is alone in their workspace'
);
reset role;
select pg_temp.act_as_nobody();

-- ---------------------------------------------------------------------------
-- Moving: the last teacher leaves
-- ---------------------------------------------------------------------------

-- An invitation into Dee's workspace whose inviter is gone, so it is not one Dee sent.
insert into made
  select 'into-d', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000004200d1', 'pending-into-d@rm.test') as c;
update public.org_invites set invited_by = null
 where id = (select invite_id from made where name = 'into-d');

set local role service_role;
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000004200d1',
    (select token from made where name = 'dee'), true),
  'accepted',
  'the only teacher of an empty workspace, confirming, is moved'
);
reset role;
select is(
  pg_temp.account('00000000-0000-0000-0000-0000004200d1'),
  (select row(org_b, 'instructor'::public.org_role)::text from cast_orgs),
  'they are an instructor of the inviting workspace'
);
select ok(
  (select o.emptied_at is not null and o.founder_id = '00000000-0000-0000-0000-0000004200d1'
          and o.self_registered and o.name = 'Dee workspace 420'
     from public.orgs o where o.id = (select org_d from cast_orgs)),
  'the workspace they left is marked emptied, and is otherwise as it was'
);
select is(
  (select row(
     (select count(*) from public.item_banks b where b.org_id = org_d),
     (select count(*) from public.classes c where c.org_id = org_d))::text
     from cast_orgs),
  row(2::bigint, 1::bigint)::text,
  'its banks and its class are still there: nothing is deleted or moved'
);
select ok(
  (select i.revoked_at is not null from public.org_invites i
     join made m on m.invite_id = i.id where m.name = 'into-d'),
  'every pending invitation into it is revoked, whoever sent it'
);
select is(
  (select state from public.resolve_org_invite(
     (select token from made where name = 'into-d'), '10.42.0.1')),
  'revoked',
  'so nobody can join a workspace with no teacher in it'
);
select is(
  (select count(*)::int from public.profiles p
    where p.org_id = (select org_d from cast_orgs) and p.role in ('instructor', 'admin')),
  0,
  'and nobody teaches there'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000004200d1');
select is(
  (select count(*)::int from public.item_banks) + (select count(*)::int from public.classes),
  0,
  'the teacher who left reads none of its banks or classes'
);
select is(
  (select count(*)::int from public.orgs),
  1,
  'and reads one workspace row, the one they joined'
);
reset role;
select pg_temp.act_as_nobody();

-- Ada is alone now: Mia was removed and Max moved. Nothing holds her, and she is still invited.
set local role service_role;
select is(
  (select row(p.*)::text from public.org_invite_move_preview(
     '00000000-0000-0000-0000-0000004200a1', (select token from made where name = 'ada')) as p),
  row('move_needs_confirmation'::text, 'Ada workspace 420'::text, 2, 0)::text,
  'a founder whose colleagues have all gone may move'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000004200a1',
    (select token from made where name = 'ada'), true),
  'accepted',
  'and, confirming, is moved'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000420006',
    (select token from made where name = 'newbie'), true),
  'accepted',
  'the confirmation changes nothing for an account with no role'
);
reset role;
select ok(
  (select o.emptied_at is not null from public.orgs o where o.id = (select org_a from cast_orgs))
  and (select i.revoked_at is not null from public.org_invites i
         join made m on m.invite_id = i.id where m.name = 'by-ada'),
  'her workspace is marked emptied and the invitation she had sent from it is revoked'
);
select is(
  (select array_agg(o.name order by o.name) from public.orgs o where o.emptied_at is not null),
  array['Ada workspace 420', 'Dee workspace 420'],
  'only a workspace whose last teacher moved away is ever marked emptied'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000004200b1');
select results_eq(
  $$ select email from public.org_members() order by email $$,
  $$ values ('ada@rm.test'::text), ('ben@rm.test'::text), ('dee@rm.test'::text),
            ('max@rm.test'::text), ('newbie@rm.test'::text), ('pat@rm.test'::text) $$,
  'the inviting founder lists everyone who came'
);
select is(
  public.remove_org_member('00000000-0000-0000-0000-0000004200a1'),
  'removed',
  'and can remove one of them, a founder of somewhere else or not'
);
reset role;
select pg_temp.act_as_nobody();
select ok(
  (select p.role = 'instructor'
          and p.org_id not in (select org_a from cast_orgs union all select org_b from cast_orgs)
          and (select o.founder_id = p.id and o.emptied_at is null
                 from public.orgs o where o.id = p.org_id)
     from public.profiles p where p.id = '00000000-0000-0000-0000-0000004200a1'),
  'who gets a new workspace of their own, not the emptied one they once founded'
);

-- ---------------------------------------------------------------------------
-- The whole table, at the end
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.profiles p
    where p.id::text like '00000000-0000-0000-0000-00000042%'
      and ((p.org_id is null) <> (p.role is null))),
  0,
  'no account was ever left with a role and no workspace, or the reverse'
);
select is(
  (select array_agg(pg_temp.account(v.id) order by v.id)
     from (values ('00000000-0000-0000-0000-000000420003'::uuid),
                  ('00000000-0000-0000-0000-000000420004'::uuid)) as v (id)),
  (select array[row(org_c, 'student'::public.org_role)::text,
                row(org_a, 'student'::public.org_role)::text] from cast_orgs),
  'and the two students are students still, where they were'
);

select * from finish();
rollback;
