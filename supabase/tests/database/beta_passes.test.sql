-- Beta passes (#520): issued, listed and revoked by the owner's script with the secret key,
-- redeemed once on /b/<token> by the teacher the pass was sent to.
--
-- What is held here:
--   1. Structure and privileges: RLS on private.beta_passes and no client privilege on it; the
--      four functions are the server's (service_role) and nobody else's.
--   2. Issuing: a pass is stored under the trimmed, lower-case address with the digest it was
--      given; one open pass per address; a bad address, digest or note is refused.
--   3. Redeeming: every refusal is the same error (PT403, one message), for another address, a
--      teacher who did not start their workspace, a student, an account with no role, an
--      expired, revoked, unknown, malformed or missing token, an account that does not exist, and
--      a pass used once already. The founder it was sent to redeems it once, and their workspace
--      gets a beta grant with no expiry, the pass's note as its reason and the pass as granted_by.
--      A workspace that already has an open beta grant keeps that one.
--   4. Listing: every pass with its state, never the digest.
--   5. Revoking: a redeemed pass and its grant are revoked; running it again revokes nothing; an
--      expired unused pass makes way for a new one.
--   6. Clients: a teacher and anon can neither read the table nor call any of the functions.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (…520…); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  -- Fay started workspace A; Tom teaches there too; Sue is a student there.
  ('00000000-0000-0000-0000-0000005200a1', 'fay@beta.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000005200a2', 'tom@beta.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000005200a3', 'sue@beta.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- Oli started workspace B, which already has an open beta grant.
  ('00000000-0000-0000-0000-0000005200b1', 'oli@beta.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- Ann started workspace C; her passes are expired or revoked.
  ('00000000-0000-0000-0000-0000005200c1', 'ann@beta.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- Ray has no role.
  ('00000000-0000-0000-0000-0000005200d1', 'ray@beta.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}');

insert into public.orgs (id, name, self_registered) values
  ('00000000-0000-0000-0000-000000520f0a', 'Beta A 520', true),
  ('00000000-0000-0000-0000-000000520f0b', 'Beta B 520', true),
  ('00000000-0000-0000-0000-000000520f0c', 'Beta C 520', true);

update public.profiles set org_id = '00000000-0000-0000-0000-000000520f0a', role = 'instructor'
 where id in ('00000000-0000-0000-0000-0000005200a1', '00000000-0000-0000-0000-0000005200a2');
update public.profiles set org_id = '00000000-0000-0000-0000-000000520f0a', role = 'student'
 where id = '00000000-0000-0000-0000-0000005200a3';
update public.profiles set org_id = '00000000-0000-0000-0000-000000520f0b', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000005200b1';
update public.profiles set org_id = '00000000-0000-0000-0000-000000520f0c', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000005200c1';

update public.orgs set founder_id = '00000000-0000-0000-0000-0000005200a1'
 where id = '00000000-0000-0000-0000-000000520f0a';
update public.orgs set founder_id = '00000000-0000-0000-0000-0000005200b1'
 where id = '00000000-0000-0000-0000-000000520f0b';
update public.orgs set founder_id = '00000000-0000-0000-0000-0000005200c1'
 where id = '00000000-0000-0000-0000-000000520f0c';

insert into public.access_grants (org_id, kind, reason, granted_by) values
  ('00000000-0000-0000-0000-000000520f0b', 'beta', 'an earlier pass', 'owner');

-- Passes the script did not make, each with a token of its own: Ann's expired one and her revoked
-- one, and one each for Tom, Sue and Ray, who may not redeem.
insert into private.beta_passes (email, token_hash, note, created_by, created_at, expires_at)
values
  ('ann@beta.test', private.org_invite_token_hash('expiredexpiredexpiredexpired0001'), null,
   'pgtap', now() - interval '31 days', now() - interval '1 day');
insert into private.beta_passes (email, token_hash, note, created_by, revoked_at) values
  ('ann@beta.test', private.org_invite_token_hash('revokedrevokedrevokedrevoked0001'), null,
   'pgtap', now());
insert into private.beta_passes (email, token_hash, note, created_by) values
  ('tom@beta.test', private.org_invite_token_hash('tomtomtomtomtomtomtomtomtomtom01'), null,
   'pgtap'),
  ('sue@beta.test', private.org_invite_token_hash('studentstudentstudentstudent0001'), null,
   'pgtap'),
  ('ray@beta.test', private.org_invite_token_hash('rayrayrayrayrayrayrayrayrayray01'), null,
   'pgtap');

-- ---------------------------------------------------------------------------
-- 1. Structure and privileges
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'private.beta_passes'::regclass),
  'RLS is on for private.beta_passes'
);

select ok(
  (select bool_and(not has_table_privilege(r, 'private.beta_passes', p))
     from unnest(array['anon', 'authenticated', 'service_role']) as r,
          unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p),
  'no client role, the server''s included, holds any privilege on private.beta_passes'
);

select ok(
  (select bool_and(not has_function_privilege(r, f, 'execute'))
     from unnest(array['public.issue_beta_pass(text, text, text, text)',
                       'public.list_beta_passes()',
                       'public.revoke_beta_pass(text)',
                       'public.redeem_beta_pass(uuid, text)']) as f,
          unnest(array['anon', 'authenticated']) as r),
  'anon and a signed-in user cannot call any beta pass function'
);

select ok(
  (select bool_and(has_function_privilege('service_role', f, 'execute'))
     from unnest(array['public.issue_beta_pass(text, text, text, text)',
                       'public.list_beta_passes()',
                       'public.revoke_beta_pass(text)',
                       'public.redeem_beta_pass(uuid, text)']) as f),
  'the server (service_role) may call every beta pass function'
);

select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
     from pg_proc p
    where p.oid in ('public.issue_beta_pass(text, text, text, text)'::regprocedure,
                    'public.list_beta_passes()'::regprocedure,
                    'public.revoke_beta_pass(text)'::regprocedure,
                    'public.redeem_beta_pass(uuid, text)'::regprocedure)),
  'every beta pass function is security definer with an empty search_path'
);

-- The digests below are written out, because the server's role cannot call the hash: each is
-- what scripts/beta-pass/token.mjs computes for its token, and this is the database's own.
select is(
  private.org_invite_token_hash('fayfayfayfayfayfayfayfayfayfay01'),
  'e63faa31a58187e41d83eda9a4ac1786109dc2e9e9efd31981572b9d79844560',
  'the database digests a token exactly as the script does'
);

-- ---------------------------------------------------------------------------
-- 2. Issuing, as the server
-- ---------------------------------------------------------------------------

set local role service_role;

select is(
  (select status from public.issue_beta_pass(
     '  Fay@Beta.Test ', 'e63faa31a58187e41d83eda9a4ac1786109dc2e9e9efd31981572b9d79844560',
     'spring cohort', 'pgtap')),
  'issued',
  'a pass is issued for a bare address'
);

select is(
  (select status from public.issue_beta_pass(
     'fay@beta.test', '368cede4809dfba9b54fd429ec37f4a2872403aa5ade14e961183448de55a050', null,
     'pgtap')),
  'already_issued',
  'an address has one open pass at a time'
);

select is(
  (select status from public.issue_beta_pass(
     'Fay <fay@beta.test>', '0a0acfb088de66bd55d0bdd77481c0f2dd25f6942fe4c68a61504c12a90f035c',
     null, 'pgtap')),
  'invalid_email',
  'a display name around the address is refused'
);

select throws_ok(
  $$ select * from public.issue_beta_pass('new@beta.test', 'not-a-digest', null, 'pgtap') $$,
  '22023', null,
  'a token digest that is not 64 hex digits is refused'
);

select throws_ok(
  $$ select * from public.issue_beta_pass(
       'new@beta.test', 'f789d0445742e21dc0b1fd884ca6e2932045d743a44e15abd33e8903d72780c9',
       repeat('x', 501), 'pgtap') $$,
  '22023', null,
  'a note over 500 characters is refused'
);

select is(
  (select (email, note, expires_at > now() + interval '29 days', redeemed_at is null)::text
     from public.list_beta_passes() where email = 'fay@beta.test'),
  '(fay@beta.test,"spring cohort",t,t)',
  'the pass is stored lower case and trimmed, with its note, for 30 days'
);

-- ---------------------------------------------------------------------------
-- 3. Redeeming, as the server, for the account it verified
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200a2',
                                    'fayfayfayfayfayfayfayfayfayfay01') $$,
  'PT403', 'this link cannot be used',
  'another address is refused'
);

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200a2',
                                    'tomtomtomtomtomtomtomtomtomtom01') $$,
  'PT403', 'this link cannot be used',
  'a teacher who did not start their workspace is refused, with the same error'
);

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200a3',
                                    'studentstudentstudentstudent0001') $$,
  'PT403', 'this link cannot be used',
  'a student is refused, with the same error'
);

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200d1',
                                    'rayrayrayrayrayrayrayrayrayray01') $$,
  'PT403', 'this link cannot be used',
  'an account with no role is refused, with the same error'
);

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200c1',
                                    'expiredexpiredexpiredexpired0001') $$,
  'PT403', 'this link cannot be used',
  'an expired pass is refused, with the same error'
);

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200c1',
                                    'revokedrevokedrevokedrevoked0001') $$,
  'PT403', 'this link cannot be used',
  'a revoked pass is refused, with the same error'
);

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200a1',
                                    'unknownunknownunknownunknown0001') $$,
  'PT403', 'this link cannot be used',
  'an unknown token is refused, with the same error'
);

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200a1', 'short') $$,
  'PT403', 'this link cannot be used',
  'a malformed token is refused, with the same error'
);

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200a1', null) $$,
  'PT403', 'this link cannot be used',
  'no token is refused, with the same error'
);

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-00000052ffff',
                                    'fayfayfayfayfayfayfayfayfayfay01') $$,
  'PT403', 'this link cannot be used',
  'an account that does not exist is refused, with the same error'
);

reset role;
select is_empty(
  $$ select 1 from private.beta_passes where redeemed_at is not null $$,
  'no refusal marked any pass used'
);
select is_empty(
  $$ select 1 from public.access_grants where granted_by like 'beta_pass:%' $$,
  'no refusal made a grant'
);
set local role service_role;

select lives_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200a1',
                                    'fayfayfayfayfayfayfayfayfayfay01') $$,
  'the founder the pass was sent to redeems it'
);

reset role;

select is(
  (select (g.kind, g.expires_at is null, g.revoked_at is null, g.reason)::text
     from public.access_grants g
    where g.org_id = '00000000-0000-0000-0000-000000520f0a'),
  '(beta,t,t,"spring cohort")',
  'their workspace has a beta grant with no expiry and the pass''s note as its reason'
);

select is(
  (select g.granted_by from public.access_grants g
    where g.org_id = '00000000-0000-0000-0000-000000520f0a'),
  (select 'beta_pass:' || b.id::text from private.beta_passes b
    where b.email = 'fay@beta.test'),
  'the grant names the pass that made it'
);

select is(
  (select (redeemed_at is not null, redeemed_by, redeemed_org)::text
     from private.beta_passes where email = 'fay@beta.test'),
  '(t,00000000-0000-0000-0000-0000005200a1,00000000-0000-0000-0000-000000520f0a)',
  'the pass is marked used, by whom and for which workspace'
);

select ok(
  private.org_has_access('00000000-0000-0000-0000-000000520f0a'),
  'the workspace has access'
);

set local role service_role;

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200a1',
                                    'fayfayfayfayfayfayfayfayfayfay01') $$,
  'PT403', 'this link cannot be used',
  'a used pass is refused, with the same error, even for the account that used it'
);

-- Oli's workspace already has an open beta grant.
reset role;
insert into private.beta_passes (email, token_hash, note, created_by) values
  ('oli@beta.test', private.org_invite_token_hash('olioliolioliolioliolioliolioli01'), 'again',
   'pgtap');
set local role service_role;

select lives_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200b1',
                                    'olioliolioliolioliolioliolioli01') $$,
  'a founder whose workspace already has a beta grant may redeem'
);

reset role;
select is(
  (select (count(*), min(granted_by))::text from public.access_grants
    where org_id = '00000000-0000-0000-0000-000000520f0b' and kind = 'beta'
      and revoked_at is null),
  '(1,owner)',
  'and the workspace keeps the one beta grant it had'
);
set local role service_role;

-- ---------------------------------------------------------------------------
-- 4. Listing
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select email, state, grant_active from public.list_beta_passes()
      where email like '%@beta.test' order by email, state $$,
  $$ values ('ann@beta.test'::text, 'expired'::text, false),
            ('ann@beta.test', 'revoked', false),
            ('fay@beta.test', 'redeemed', true),
            ('oli@beta.test', 'redeemed', false),
            ('ray@beta.test', 'pending', false),
            ('sue@beta.test', 'pending', false),
            ('tom@beta.test', 'pending', false) $$,
  'list shows every pass, its state and whether its grant is active'
);

select is(
  (select (select workspace_name from public.list_beta_passes()
            where email = 'fay@beta.test')),
  'Beta A 520',
  'list names the workspace a pass was redeemed for'
);

select ok(
  not exists (
    select 1 from pg_proc p, unnest(p.proargnames) as a
     where p.oid = 'public.list_beta_passes()'::regprocedure and a like '%token%'
  ),
  'list never returns the token digest'
);

-- ---------------------------------------------------------------------------
-- 5. Revoking
-- ---------------------------------------------------------------------------

select is(
  (select (passes_revoked, grants_revoked)::text from public.revoke_beta_pass(' FAY@beta.test')),
  '(1,1)',
  'revoking a redeemed pass revokes it and its grant'
);

reset role;
select ok(
  (select revoked_at is not null from public.access_grants
    where org_id = '00000000-0000-0000-0000-000000520f0a' and kind = 'beta')
  and not private.org_has_access('00000000-0000-0000-0000-000000520f0a'),
  'the workspace''s beta grant is revoked, so it has no access'
);
set local role service_role;

select is(
  (select (passes_revoked, grants_revoked)::text from public.revoke_beta_pass('fay@beta.test')),
  '(0,0)',
  'revoking again revokes nothing'
);

select is(
  (select status from public.issue_beta_pass(
     'ann@beta.test', 'd4943025e0e9249973e8cb45738f6690c156b611161ddae8d05708ae976ba271', null,
     'pgtap')),
  'issued',
  'an expired unused pass makes way for a new one'
);

reset role;
select is(
  (select count(*)::integer from private.beta_passes
    where email = 'ann@beta.test' and revoked_at is null),
  1,
  'and the expired one is revoked'
);

-- ---------------------------------------------------------------------------
-- 6. Clients
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000005200c1","role":"authenticated"}', true);

select throws_ok(
  $$ select id from private.beta_passes $$,
  '42501', null,
  'a teacher cannot read private.beta_passes'
);

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200c1',
                                    'annannannannannannannannannann01') $$,
  '42501', null,
  'a teacher cannot redeem through the Data API, even their own pass'
);

select throws_ok(
  $$ select * from public.issue_beta_pass(
       'ann2@beta.test', 'c2f624b2c33d06e4f3daab05be4361fcf922de438f1873db8eddcae0120b0ae5',
       null, 'pgtap') $$,
  '42501', null,
  'a teacher cannot issue a pass'
);

select throws_ok(
  $$ select * from public.list_beta_passes() $$,
  '42501', null,
  'a teacher cannot list passes'
);

select throws_ok(
  $$ select * from public.revoke_beta_pass('ann@beta.test') $$,
  '42501', null,
  'a teacher cannot revoke a pass'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.redeem_beta_pass('00000000-0000-0000-0000-0000005200c1',
                                    'annannannannannannannannannann01') $$,
  '42501', null,
  'anon cannot redeem'
);

reset role;

select * from finish();
rollback;
