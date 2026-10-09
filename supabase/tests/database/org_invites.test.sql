-- A teacher invites a colleague into their own workspace (20261009010000_workspace_invites.sql).
--
-- What is held here: who may call what; that the emailed token is never stored; that an invitation
-- and a member list are read only inside their own workspace; that the shared workspace cannot
-- invite, nor an inviter who has not confirmed their address; every refusal on accepting (wrong
-- address, student, already teaches, expired, revoked, already accepted) and that a refusal writes
-- nothing; the member cap, the pending cap and the daily cap.
--
-- Not held here: the race between accept_org_invite and private.admit_to_class. Both take the
-- profile row `for update` and read the role under it; one transaction cannot show two sessions.
--
-- The test makes its own workspace that is not self-registered, so it does not lean on the seed.
-- now() does not move inside a transaction, so "expired" and "a day ago" are made by moving the
-- stored times.
begin;
create extension if not exists pgtap with schema extensions;
select plan(113);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  -- Teachers who registered on their own, one workspace each.
  ('00000000-0000-0000-0000-0000009100a1', 'ada@inv.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000009100b1', 'grace@inv.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000009100c0', 'carol@inv.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000009100d0', 'dora@inv.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- A teacher who registered and has not opened the welcome email.
  ('00000000-0000-0000-0000-0000009100e0', 'unconfirmed@inv.test', 'authenticated',
   'authenticated', '{"provider": "email", "learn_email_unconfirmed": true}', '{}'),
  -- An instructor of a workspace the owner made by hand, and a student of Ada's workspace.
  ('00000000-0000-0000-0000-0000009100f1', 'shared-teach@inv.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000009100a2', 'student@inv.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- Accounts with no role: the people who get invited.
  ('00000000-0000-0000-0000-000000910001', 'colleague@inv.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000910002', 'somebody-else@inv.test', 'authenticated',
   'authenticated', '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000910003', 'expired@inv.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000910004', 'revoked@inv.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000910005', 'late@inv.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-000000910006', 'd7@inv.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}');

-- Nine more accounts, to fill a workspace to its ten members.
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data)
  select ('00000000-0000-0000-0000-00000091f' || lpad(n::text, 3, '0'))::uuid,
         'filler-' || n || '@inv.test', 'authenticated', 'authenticated',
         '{"provider": "email"}'::jsonb, '{}'::jsonb
    from generate_series(1, 9) as n;

select public.register_instructor('00000000-0000-0000-0000-0000009100a1', 'Ada''s workspace');
select public.register_instructor('00000000-0000-0000-0000-0000009100b1', 'Grace''s workspace');
select public.register_instructor('00000000-0000-0000-0000-0000009100c0', 'Carol''s workspace');
select public.register_instructor('00000000-0000-0000-0000-0000009100d0', 'Dora''s workspace');
select public.register_instructor('00000000-0000-0000-0000-0000009100e0', 'Unconfirmed workspace');

insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000009100f0', 'Plain org');

create temporary table cast_orgs as
  select
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000009100a1') as org_a,
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000009100b1') as org_b,
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000009100c0') as org_c,
    (select org_id from public.profiles where id = '00000000-0000-0000-0000-0000009100d0') as org_d;
grant select on cast_orgs to authenticated, anon, service_role;

update public.profiles set display_name = 'Ada L'
 where id = '00000000-0000-0000-0000-0000009100a1';
update public.profiles
   set org_id = '00000000-0000-0000-0000-0000009100f0', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000009100f1';
update public.profiles set org_id = (select org_a from cast_orgs), role = 'student'
 where id = '00000000-0000-0000-0000-0000009100a2';

-- Every invitation this test makes through create_org_invite, by a name, with its raw token.
create temporary table made (
  name text primary key,
  status text,
  invite_id uuid,
  token text,
  expires_at timestamptz
);
grant select on made to authenticated, anon, service_role;

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

create function pg_temp.miss(times integer) returns void
language plpgsql as $$
begin
  for i in 1..times loop
    perform * from public.resolve_org_invite('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', '10.9.0.2');
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.create_org_invite(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_org_invite(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.resolve_org_invite(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.resolve_org_invite(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.accept_org_invite(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.accept_org_invite(uuid, text)', 'execute'),
  'neither anon nor authenticated holds EXECUTE on create, resolve or accept'
);
select ok(
  has_function_privilege('service_role', 'public.create_org_invite(uuid, text)', 'execute')
  and has_function_privilege('service_role', 'public.resolve_org_invite(text, text)', 'execute')
  and has_function_privilege('service_role', 'public.accept_org_invite(uuid, text)', 'execute'),
  'service_role holds all three'
);
select ok(
  has_function_privilege('authenticated', 'public.revoke_org_invite(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.org_members()', 'execute')
  and not has_function_privilege('anon', 'public.revoke_org_invite(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.org_members()', 'execute'),
  'revoking and the member list are for signed-in accounts, never anon'
);
select is(
  (select count(*)::int from pg_proc p
    where p.oid in (
            'public.create_org_invite(uuid, text)'::regprocedure,
            'public.revoke_org_invite(uuid)'::regprocedure,
            'public.resolve_org_invite(text, text)'::regprocedure,
            'public.accept_org_invite(uuid, text)'::regprocedure,
            'public.org_members()'::regprocedure)
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  5,
  'all five are security definer with an empty search_path'
);
select ok(
  not has_table_privilege('authenticated', 'public.org_invites', 'insert')
  and not has_table_privilege('authenticated', 'public.org_invites', 'update')
  and not has_table_privilege('authenticated', 'public.org_invites', 'delete')
  and not has_any_column_privilege('anon', 'public.org_invites', 'select'),
  'nobody signed in writes an invitation directly, and anon reads none'
);
select ok(
  has_column_privilege('authenticated', 'public.org_invites', 'email', 'select')
  and not has_column_privilege('authenticated', 'public.org_invites', 'token_hash', 'select'),
  'a signed-in account may read an invitation''s address but not its token digest'
);

set local role anon;
select throws_ok(
  $$ select public.accept_org_invite('00000000-0000-0000-0000-000000910001', 'x') $$,
  '42501', null,
  'anon cannot accept an invitation'
);
select throws_ok(
  $$ select * from public.resolve_org_invite('x', null) $$,
  '42501', null,
  'nor resolve a token'
);
reset role;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000009100a1');
select throws_ok(
  $$ select * from public.create_org_invite('00000000-0000-0000-0000-0000009100a1', 'x@inv.test') $$,
  '42501', null,
  'a signed-in teacher cannot make an invitation from a browser, so never holds its token'
);
select throws_ok(
  $$ select * from public.resolve_org_invite('x', null) $$,
  '42501', null,
  'nor resolve a token as the server does'
);
select pg_temp.act_as('00000000-0000-0000-0000-000000910001');
select throws_ok(
  $$ select public.accept_org_invite('00000000-0000-0000-0000-000000910001', 'x') $$,
  '42501', null,
  'and a signed-in account cannot accept for itself, or name another'
);
reset role;
select pg_temp.act_as_nobody();

-- ---------------------------------------------------------------------------
-- Inviting
-- ---------------------------------------------------------------------------

insert into made
  select 'colleague', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000009100a1', E' \t Colleague@Inv.Test \n') as c;

select is(
  (select status from made where name = 'colleague'),
  'created',
  'a teacher of a self-registered workspace invites a colleague'
);
select ok(
  (select token ~ '^[A-Za-z0-9_-]{32}$' and invite_id is not null
          and expires_at = now() + interval '7 days'
     from made where name = 'colleague'),
  'the call returns a 32-character token, the invitation''s id and an expiry seven days out'
);
select is(
  (select row(i.org_id, i.email, i.invited_by)::text
     from public.org_invites i join made m on m.invite_id = i.id where m.name = 'colleague'),
  (select row(org_a, 'colleague@inv.test'::text,
              '00000000-0000-0000-0000-0000009100a1'::uuid)::text from cast_orgs),
  'stored in the inviter''s workspace, under the address trimmed and in lower case'
);
select ok(
  (select i.token_hash = encode(sha256(convert_to(m.token, 'UTF8')), 'hex')
          and position(m.token in i::text) = 0
     from public.org_invites i join made m on m.invite_id = i.id where m.name = 'colleague'),
  'the row holds the SHA-256 of the token and the token itself nowhere'
);

select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100a1', 'colleague@inv.test')),
  'already_invited',
  'a second invitation to an address with one pending is refused'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100a1', 'ADA@inv.test')),
  'already_member',
  'an address that already belongs to a member is refused, the inviter''s own included'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100a1', 'not an address')),
  'invalid_email',
  'something that is not an address is refused'
);
select is(
  (select status from public.create_org_invite('00000000-0000-0000-0000-0000009100a1', null)),
  'invalid_email',
  'and so is no address at all'
);
-- Anything a mail provider could read as more than one bare address: a display name, a list, a
-- comment, a quoted part, a control character. One assertion per row, twelve in all.
select is(
  (select status from public.create_org_invite('00000000-0000-0000-0000-0000009100a1', v.address)),
  'invalid_email',
  'refused as not one bare address: ' || v.label
)
from (values
  (1, 'x<newcomer@inv.test>', 'a display name and angle brackets'),
  (2, 'new<comer@inv.test', 'a left angle bracket'),
  (3, 'new>comer@inv.test', 'a right angle bracket'),
  (4, 'new,comer@inv.test', 'a comma'),
  (5, 'new;comer@inv.test', 'a semicolon'),
  (6, '"new"comer@inv.test', 'a double quote'),
  (7, 'new(comer@inv.test', 'a left parenthesis'),
  (8, 'new)comer@inv.test', 'a right parenthesis'),
  (9, 'new\comer@inv.test', 'a backslash'),
  (10, E'new\x01comer@inv.test', 'a control character'),
  (11, E'new\x7Fcomer@inv.test', 'the delete character'),
  (12, repeat('a', 246) || '@inv.test', '255 characters')
) as v(ord, address, label)
order by v.ord;
select is(
  (select count(*)::integer from public.org_invites i
    where i.email ~ '[<>",;()\\[:cntrl:]]' or length(i.email) > 254),
  0,
  'and none of those refusals stored an invitation'
);
select is(
  (select row(status, invite_id, token, expires_at)::text from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100f1', 'newcomer@inv.test')),
  row('shared_workspace'::text, null::uuid, null::text, null::timestamptz)::text,
  'nobody invites into a workspace that is not self-registered, and a refusal returns no token'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100e0', 'newcomer@inv.test')),
  'unconfirmed',
  'an inviter who has not confirmed their own address is refused'
);
select throws_ok(
  $$ select * from public.create_org_invite(
       '00000000-0000-0000-0000-0000009100a2', 'newcomer@inv.test') $$,
  '42501', null,
  'a student cannot invite'
);
select throws_ok(
  $$ select * from public.create_org_invite(
       '00000000-0000-0000-0000-000000910002', 'newcomer@inv.test') $$,
  '42501', null,
  'nor an account with no role'
);
select throws_ok(
  $$ select * from public.create_org_invite(
       '00000000-0000-0000-0000-0000009100ff', 'newcomer@inv.test') $$,
  'P0002', null,
  'and an id with no account is an error'
);
select is(
  (select count(*)::int from public.org_invites),
  1,
  'not one of those refusals made an invitation'
);

-- Confirming is what lifts the refusal: the key is removed from app_metadata.
update auth.users set raw_app_meta_data = raw_app_meta_data - 'learn_email_unconfirmed'
 where id = '00000000-0000-0000-0000-0000009100e0';
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100e0', 'newcomer@inv.test')),
  'created',
  'once that inviter has confirmed, they invite like anyone else'
);

-- ---------------------------------------------------------------------------
-- Reading: one workspace only
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000009100a1');

select results_eq(
  $$ select email from public.org_invites $$,
  $$ values ('colleague@inv.test'::text) $$,
  'teacher A reads the invitations of their own workspace and no other'
);
select throws_ok(
  $$ select * from public.org_invites $$,
  '42501', null,
  'but not every column: the token digest has no grant'
);
select throws_ok(
  $$ insert into public.org_invites (org_id, email, token_hash)
     select org_a, 'forged@inv.test', repeat('a', 64) from cast_orgs $$,
  '42501', null,
  'teacher A cannot insert an invitation'
);
select throws_ok(
  $$ update public.org_invites set email = 'moved@inv.test' $$,
  '42501', null,
  'or change one'
);
select throws_ok(
  $$ delete from public.org_invites $$,
  '42501', null,
  'or delete one'
);
select results_eq(
  $$ select email, role::text from public.org_members() $$,
  $$ values ('ada@inv.test'::text, 'instructor'::text) $$,
  'the member list is the workspace''s teachers: not its student, not anybody else''s teacher'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000009100b1');
select is_empty(
  $$ select id from public.org_invites $$,
  'teacher B reads none of teacher A''s invitations'
);
select is(
  public.revoke_org_invite((select invite_id from made where name = 'colleague')),
  'not_found',
  'and cannot revoke one: to teacher B it does not exist'
);
select results_eq(
  $$ select email from public.org_members() $$,
  $$ values ('grace@inv.test'::text) $$,
  'teacher B''s member list is teacher B'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000009100a2');
select is_empty(
  $$ select id from public.org_invites $$,
  'a student of the workspace reads no invitation'
);
select is_empty(
  $$ select * from public.org_members() $$,
  'and no member list'
);
select throws_ok(
  $$ select public.revoke_org_invite((select invite_id from made where name = 'colleague')) $$,
  '42501', null,
  'and cannot revoke'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000910002');
select is_empty(
  $$ select * from public.org_members() $$,
  'an account with no role gets no member list'
);

reset role;
select pg_temp.act_as_nobody();
select ok(
  (select i.revoked_at is null from public.org_invites i
     join made m on m.invite_id = i.id where m.name = 'colleague'),
  'control: the invitation nobody was allowed to revoke is still open'
);

-- ---------------------------------------------------------------------------
-- Resolving a token, as the app's server
-- ---------------------------------------------------------------------------

set local role service_role;
select results_eq(
  $$ select state, workspace_name, inviter_name, inviter_email, invited_email
       from public.resolve_org_invite((select token from made where name = 'colleague'), '10.9.0.1') $$,
  $$ values ('pending'::text, 'Ada''s workspace'::text, 'Ada L'::text, 'ada@inv.test'::text,
             'colleague@inv.test'::text) $$,
  'the token resolves to the workspace, who invited, and the address it is for'
);
select is_empty(
  $$ select * from public.resolve_org_invite('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', '10.9.0.1') $$,
  'an unknown token resolves to nothing'
);
select is_empty(
  $$ select * from public.resolve_org_invite('not a token', '10.9.0.1') $$,
  'a malformed token gets the same nothing'
);
select is_empty(
  $$ select * from public.resolve_org_invite(null, '10.9.0.1') $$,
  'as does no token at all'
);
reset role;

select is(
  (select calls from private.code_lookups where client_key = 'org-invite|10.9.0.1'),
  3,
  'the three misses were counted under an org-invite key; the hit was not'
);
select lives_ok($$ select pg_temp.miss(60) $$, 'sixty misses from one address are answered');
select throws_ok(
  $$ select pg_temp.miss(1) $$,
  'PT429', null,
  'the sixty-first is refused'
);
select is(
  (select state from public.resolve_org_invite(
     (select token from made where name = 'colleague'), '10.9.0.2')),
  'pending',
  'but a real token is never refused'
);

-- ---------------------------------------------------------------------------
-- Accepting: who is refused
-- ---------------------------------------------------------------------------

insert into made
  select 'student', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000009100a1', 'student@inv.test') as c;
insert into made
  select 'grace', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000009100a1', 'grace@inv.test') as c;
insert into made
  select 'shared-teach', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000009100a1', 'shared-teach@inv.test') as c;
select is(
  (select array_agg(status order by name) from made
    where name in ('student', 'grace', 'shared-teach')),
  array['created', 'created', 'created'],
  'an invitation can be made for any address: making one says nothing about who has an account'
);

create temporary table before_refusals as
  select string_agg(p::text, '|' order by p.id) as snapshot from public.profiles p;

select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000910002',
    (select token from made where name = 'colleague')),
  'wrong_address',
  'the link works only for the invited address'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000009100a2',
    (select token from made where name = 'student')),
  'student',
  'a student is refused: accepting never promotes one'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000009100b1',
    (select token from made where name = 'grace')),
  'already_teaches',
  'a teacher with a workspace of their own is refused'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-0000009100f1',
    (select token from made where name = 'shared-teach')),
  'already_teaches',
  'and so is an instructor of a workspace the owner made'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000910001',
    'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'),
  'invalid',
  'an unknown token is invalid'
);
select throws_ok(
  $$ select public.accept_org_invite('00000000-0000-0000-0000-0000009100ff',
       (select token from made where name = 'colleague')) $$,
  'P0002', null,
  'an id with no account is an error'
);
select is(
  (select string_agg(p::text, '|' order by p.id) from public.profiles p),
  (select snapshot from before_refusals),
  'not one profile changed across every refusal'
);
select is(
  (select count(*)::int from public.org_invites where accepted_at is not null),
  0,
  'and no invitation was marked accepted'
);

-- ---------------------------------------------------------------------------
-- Accepting
-- ---------------------------------------------------------------------------

set local role service_role;
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000910001',
    (select token from made where name = 'colleague')),
  'accepted',
  'the server accepts for the invited account, which had no role'
);
reset role;

select is(
  pg_temp.account('00000000-0000-0000-0000-000000910001'),
  (select row(org_a, 'instructor'::public.org_role)::text from cast_orgs),
  'that account is now an instructor of the inviting workspace'
);
select ok(
  (select i.accepted_at is not null
          and i.accepted_by = '00000000-0000-0000-0000-000000910001' and i.revoked_at is null
     from public.org_invites i join made m on m.invite_id = i.id where m.name = 'colleague'),
  'and the invitation records when and by whom'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000910001',
    (select token from made where name = 'colleague')),
  'already_accepted',
  'accepting twice is answered already_accepted, not already_teaches'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000910002',
    (select token from made where name = 'colleague')),
  'already_accepted',
  'whoever asks'
);
select is(
  (select state from public.resolve_org_invite(
     (select token from made where name = 'colleague'), '10.9.0.1')),
  'accepted',
  'and the token now resolves as accepted'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100a1', 'colleague@inv.test')),
  'already_member',
  'the new colleague cannot be invited again'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000910001');
select ok(
  private.is_author() and private.current_org_id() = (select org_a from cast_orgs),
  'the colleague is an author in teacher A''s workspace'
);
select results_eq(
  $$ select email from public.org_members() order by email $$,
  $$ values ('ada@inv.test'::text), ('colleague@inv.test'::text) $$,
  'and reads its two members'
);
select pg_temp.act_as('00000000-0000-0000-0000-0000009100a1');
select is(
  public.revoke_org_invite((select invite_id from made where name = 'colleague')),
  'already_accepted',
  'an accepted invitation cannot be revoked'
);
select pg_temp.act_as('00000000-0000-0000-0000-0000009100b1');
select results_eq(
  $$ select email from public.org_members() $$,
  $$ values ('grace@inv.test'::text) $$,
  'teacher B''s member list did not grow'
);
reset role;
select pg_temp.act_as_nobody();

-- ---------------------------------------------------------------------------
-- Expired
-- ---------------------------------------------------------------------------

insert into made
  select 'expired', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000009100a1', 'expired@inv.test') as c;
-- Eight days old: past its seven, and outside teacher A's last 24 hours.
update public.org_invites
   set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
 where id = (select invite_id from made where name = 'expired');

select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000910003',
    (select token from made where name = 'expired')),
  'expired',
  'an invitation past its seven days is refused'
);
select is(
  (select state from public.resolve_org_invite(
     (select token from made where name = 'expired'), '10.9.0.1')),
  'expired',
  'and resolves as expired'
);
select is(
  pg_temp.account('00000000-0000-0000-0000-000000910003'),
  row(null::uuid, null::public.org_role)::text,
  'the account it was for still has no role'
);

insert into made
  select 'expired-again', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000009100a1', 'expired@inv.test') as c;
select is(
  (select status from made where name = 'expired-again'),
  'created',
  'an expired invitation does not stop a new one to the same address'
);
select ok(
  (select i.revoked_at is not null from public.org_invites i
     join made m on m.invite_id = i.id where m.name = 'expired'),
  'the expired one is closed when the new one is made'
);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000910003',
    (select token from made where name = 'expired-again')),
  'accepted',
  'and the new one works'
);

-- ---------------------------------------------------------------------------
-- Revoked
-- ---------------------------------------------------------------------------

insert into made
  select 'revoked', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000009100b1', 'revoked@inv.test') as c;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000009100a1');
select is(
  public.revoke_org_invite((select invite_id from made where name = 'revoked')),
  'not_found',
  'teacher A cannot revoke teacher B''s invitation'
);
select pg_temp.act_as('00000000-0000-0000-0000-0000009100b1');
select is(
  public.revoke_org_invite((select invite_id from made where name = 'revoked')),
  'revoked',
  'teacher B revokes their own'
);
select is(
  public.revoke_org_invite((select invite_id from made where name = 'revoked')),
  'revoked',
  'revoking twice is the same answer'
);
select is(
  public.revoke_org_invite('00000000-0000-0000-0000-0000009100ff'),
  'not_found',
  'an id that is no invitation is not_found'
);
reset role;
select pg_temp.act_as_nobody();

select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000910004',
    (select token from made where name = 'revoked')),
  'revoked',
  'a revoked invitation is refused'
);
select is(
  (select state from public.resolve_org_invite(
     (select token from made where name = 'revoked'), '10.9.0.1')),
  'revoked',
  'and resolves as revoked'
);
select is(
  pg_temp.account('00000000-0000-0000-0000-000000910004'),
  row(null::uuid, null::public.org_role)::text,
  'the account it was for still has no role'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100b1', 'revoked@inv.test')),
  'created',
  'a revoked invitation does not stop a new one to the same address'
);

-- ---------------------------------------------------------------------------
-- The member cap: ten
-- ---------------------------------------------------------------------------

insert into made
  select 'late', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000009100b1', 'late@inv.test') as c;

update public.profiles set org_id = (select org_b from cast_orgs), role = 'instructor'
 where id::text like '00000000-0000-0000-0000-00000091f%';
select is(
  (select count(*)::int from public.profiles p join cast_orgs c on p.org_id = c.org_b
    where p.role in ('instructor', 'admin')),
  10,
  'control: teacher B''s workspace has ten members'
);

select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000910005',
    (select token from made where name = 'late')),
  'members_full',
  'an invitation made before the workspace filled cannot take an eleventh seat'
);
select is(
  pg_temp.account('00000000-0000-0000-0000-000000910005'),
  row(null::uuid, null::public.org_role)::text,
  'the account still has no role'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100b1', 'eleventh@inv.test')),
  'members_full',
  'and a full workspace makes no new invitation'
);

update public.profiles set org_id = null, role = null
 where id = '00000000-0000-0000-0000-00000091f009';
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000910005',
    (select token from made where name = 'late')),
  'accepted',
  'with nine members the same invitation is accepted'
);

-- ---------------------------------------------------------------------------
-- The pending cap: ten
-- ---------------------------------------------------------------------------

-- Put in directly: one inviter may make only five in a day, which is the next section.
insert into public.org_invites (org_id, email, token_hash)
  select (select org_c from cast_orgs), 'pending-' || n || '@inv.test',
         encode(sha256(convert_to('pending-' || n, 'UTF8')), 'hex')
    from generate_series(1, 10) as n;

select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100c0', 'one-more@inv.test')),
  'invites_full',
  'a workspace with ten pending invitations makes no eleventh'
);
update public.org_invites set expires_at = now() - interval '1 minute'
 where email = 'pending-1@inv.test';
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100c0', 'one-more@inv.test')),
  'created',
  'an expired invitation is not pending, so there is room for one'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100c0', 'and-another@inv.test')),
  'invites_full',
  'and then the workspace is at ten again'
);

-- ---------------------------------------------------------------------------
-- The daily cap: five per person
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(c.status order by n)
     from generate_series(1, 5) as n
     cross join lateral public.create_org_invite(
       '00000000-0000-0000-0000-0000009100d0', 'd' || n || '@inv.test') as c),
  array['created', 'created', 'created', 'created', 'created'],
  'one person makes five invitations in a day'
);
select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100d0', 'd6@inv.test')),
  'rate_limited',
  'the sixth is refused'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000009100d0');
select is(
  public.revoke_org_invite((select id from public.org_invites where email = 'd1@inv.test')),
  'revoked',
  'teacher D revokes one of the five'
);
reset role;
select pg_temp.act_as_nobody();

select is(
  (select status from public.create_org_invite(
     '00000000-0000-0000-0000-0000009100d0', 'd6@inv.test')),
  'rate_limited',
  'which does not buy another: a revoked invitation still counts toward the day'
);

update public.org_invites set created_at = now() - interval '25 hours'
 where email = 'd2@inv.test';
insert into made
  select 'd7', c.* from public.create_org_invite(
    '00000000-0000-0000-0000-0000009100d0', 'd7@inv.test') as c;
select is(
  (select status from made where name = 'd7'),
  'created',
  'once one of the five is more than a day old there is room again'
);

-- ---------------------------------------------------------------------------
-- A workspace that stopped being self-registered
-- ---------------------------------------------------------------------------

update public.orgs set self_registered = false where id = (select org_d from cast_orgs);
select is(
  public.accept_org_invite('00000000-0000-0000-0000-000000910006',
    (select token from made where name = 'd7')),
  'shared_workspace',
  'an invitation into a workspace the owner has since taken over is refused'
);
select is(
  pg_temp.account('00000000-0000-0000-0000-000000910006'),
  row(null::uuid, null::public.org_role)::text,
  'and the account still has no role'
);

-- ---------------------------------------------------------------------------
-- The whole table, at the end
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.org_invites i join made m on position(m.token in i::text) > 0),
  0,
  'no row holds any token this test was given'
);
select is(
  (select count(*)::int from public.profiles p
    where p.role = 'student' and p.id <> '00000000-0000-0000-0000-0000009100a2'
      and p.id::text like '00000000-0000-0000-0000-00000091%'),
  0,
  'nobody here became a student, and the one student stayed one'
);
select is(
  pg_temp.account('00000000-0000-0000-0000-0000009100a2'),
  (select row(org_a, 'student'::public.org_role)::text from cast_orgs),
  'the student of teacher A''s workspace is still its student'
);

select * from finish();
rollback;
