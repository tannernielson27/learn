-- Billing state, access grants and the access check (#517). Nothing here is enforced yet; this
-- holds the tables, the reads and the check that #518-#521 build on.
--
-- What is held here:
--   1. Structure and privileges: RLS on every billing table; anon holds nothing; a signed-in user
--      writes neither public table, reads only the granted columns, and cannot call the server's
--      functions; the private tables are no client's; the config row starts in the sandbox, off.
--   2. Reading, by who is asking: a teacher reads their own workspace's billing row and grants,
--      only the granted columns; a teacher of another workspace, a student and anon read nothing.
--   3. workspace_access(): a founder, a teacher who did not found the workspace, a workspace on
--      a grant, a student and an account with no role.
--   4. org_has_access: each grant kind, an expired grant, a revoked one, one that expires later,
--      every Stripe status, no status, a livemode mismatch, and nothing at all.
--   5. Trials: one per person, per sign-in address and per workspace.
--   6. Stripe events: claimed once.
--   7. The backfill: a self-registered workspace that existed is grandfathered, a shared one is
--      exempt, one made after gets nothing, and running it again adds nothing. The migration's
--      own run happened before any fixture here, so none of them has a grant from it.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (…517…); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(81);

-- ---------------------------------------------------------------------------
-- Cast, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  -- Fay founded workspace A; Tom teaches there too; Sue is a student there.
  ('00000000-0000-0000-0000-0000005170a1', 'fay@bill.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000005170a2', 'tom@bill.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  ('00000000-0000-0000-0000-0000005170a3', 'sue@bill.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- Oli founded workspace B, which is on a beta grant.
  ('00000000-0000-0000-0000-0000005170b1', 'oli@bill.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- Ray has no role.
  ('00000000-0000-0000-0000-0000005170c1', 'ray@bill.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}'),
  -- Eve starts a trial and deletes her account.
  ('00000000-0000-0000-0000-0000005170e1', 'eve@bill.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}');

insert into public.orgs (id, name, self_registered) values
  ('00000000-0000-0000-0000-000000517f0a', 'Billing A 517', true),
  ('00000000-0000-0000-0000-000000517f0b', 'Billing B 517', true);

update public.profiles set org_id = '00000000-0000-0000-0000-000000517f0a', role = 'instructor'
 where id in ('00000000-0000-0000-0000-0000005170a1', '00000000-0000-0000-0000-0000005170a2');
update public.profiles set org_id = '00000000-0000-0000-0000-000000517f0a', role = 'student'
 where id = '00000000-0000-0000-0000-0000005170a3';
update public.profiles set org_id = '00000000-0000-0000-0000-000000517f0b', role = 'instructor'
 where id = '00000000-0000-0000-0000-0000005170b1';

update public.orgs set founder_id = '00000000-0000-0000-0000-0000005170a1'
 where id = '00000000-0000-0000-0000-000000517f0a';
update public.orgs set founder_id = '00000000-0000-0000-0000-0000005170b1'
 where id = '00000000-0000-0000-0000-000000517f0b';

-- A is in a sandbox trial; B has a customer and no subscription, and a beta grant. A also has a
-- revoked grant, so a teacher of A has a grant row to read that does not count.
insert into public.workspace_billing
  (org_id, stripe_customer_id, stripe_subscription_id, status, price_lookup_key,
   current_period_end, trial_end, billing_email, livemode)
values
  ('00000000-0000-0000-0000-000000517f0a', 'cus_517a', 'sub_517a', 'trialing', 'learn_monthly_v1',
   '2026-11-03 00:00:00+00', '2026-11-03 00:00:00+00', 'fay@bill.test', false),
  ('00000000-0000-0000-0000-000000517f0b', 'cus_517b', null, null, null, null, null,
   'oli@bill.test', false);

insert into public.access_grants (org_id, kind, reason, granted_by, revoked_at) values
  ('00000000-0000-0000-0000-000000517f0a', 'beta', 'a tester', 'pass_517a', now());
insert into public.access_grants (org_id, kind, reason, granted_by) values
  ('00000000-0000-0000-0000-000000517f0b', 'beta', 'a tester', 'pass_517b');

-- ---------------------------------------------------------------------------
-- 1. Structure and privileges
-- ---------------------------------------------------------------------------

select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.workspace_billing'::regclass, 'public.access_grants'::regclass,
                  'private.trial_uses'::regclass, 'private.stripe_events'::regclass,
                  'private.billing_config'::regclass)),
  'RLS is on for every billing table'
);

select ok(
  (select bool_and(not has_any_column_privilege('anon', t, 'SELECT')
                   and not has_any_column_privilege('anon', t, 'INSERT')
                   and not has_any_column_privilege('anon', t, 'UPDATE')
                   and not has_table_privilege('anon', t, 'DELETE')
                   and not has_table_privilege('anon', t, 'TRUNCATE'))
     from unnest(array['public.workspace_billing', 'public.access_grants']) as t),
  'anon holds no privilege on workspace_billing or access_grants'
);

select ok(
  (select bool_and(not has_any_column_privilege('authenticated', t, 'INSERT')
                   and not has_any_column_privilege('authenticated', t, 'UPDATE')
                   and not has_table_privilege('authenticated', t, 'DELETE')
                   and not has_table_privilege('authenticated', t, 'TRUNCATE'))
     from unnest(array['public.workspace_billing', 'public.access_grants']) as t),
  'a signed-in user cannot write workspace_billing or access_grants'
);

select ok(
  has_column_privilege('authenticated', 'public.workspace_billing', 'status', 'SELECT')
  and has_column_privilege('authenticated', 'public.workspace_billing', 'trial_end', 'SELECT')
  and has_column_privilege('authenticated', 'public.workspace_billing', 'current_period_end',
                           'SELECT')
  and has_column_privilege('authenticated', 'public.workspace_billing', 'livemode', 'SELECT')
  and not has_column_privilege('authenticated', 'public.workspace_billing', 'stripe_customer_id',
                               'SELECT')
  and not has_column_privilege('authenticated', 'public.workspace_billing',
                               'stripe_subscription_id', 'SELECT')
  and not has_column_privilege('authenticated', 'public.workspace_billing', 'billing_email',
                               'SELECT')
  and not has_column_privilege('authenticated', 'public.workspace_billing', 'created_at',
                               'SELECT'),
  'a signed-in user may read billing status columns, never Stripe ids or the billing email'
);

select ok(
  has_column_privilege('authenticated', 'public.access_grants', 'kind', 'SELECT')
  and has_column_privilege('authenticated', 'public.access_grants', 'expires_at', 'SELECT')
  and has_column_privilege('authenticated', 'public.access_grants', 'revoked_at', 'SELECT')
  and not has_column_privilege('authenticated', 'public.access_grants', 'reason', 'SELECT')
  and not has_column_privilege('authenticated', 'public.access_grants', 'granted_by', 'SELECT')
  and not has_column_privilege('authenticated', 'public.access_grants', 'id', 'SELECT'),
  'a signed-in user may read a grant''s kind and dates, never its reason or who granted it'
);

select ok(
  (select bool_and(not has_table_privilege(r, t, 'SELECT')
                   and not has_table_privilege(r, t, 'INSERT'))
     from unnest(array['private.trial_uses', 'private.stripe_events',
                       'private.billing_config']) as t,
          unnest(array['anon', 'authenticated', 'service_role']) as r),
  'the private billing tables are read and written by their functions only'
);

select ok(
  (select bool_and(not has_function_privilege(r, f, 'execute'))
     from unnest(array['public.may_start_trial(uuid, uuid)',
                       'public.record_trial_use(uuid, uuid, text)',
                       'public.claim_stripe_event(text, text, boolean)']) as f,
          unnest(array['anon', 'authenticated']) as r)
  and has_function_privilege('service_role', 'public.may_start_trial(uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.record_trial_use(uuid, uuid, text)',
                             'execute')
  and has_function_privilege('service_role', 'public.claim_stripe_event(text, text, boolean)',
                             'execute'),
  'only the server (service_role) may check or record a trial, or claim a Stripe event'
);

select ok(
  not has_function_privilege('authenticated', 'private.org_has_access(uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.org_has_access(uuid)', 'execute')
  and not has_function_privilege('service_role',
                                 'private.grant_existing_workspaces(timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
                                 'private.grant_existing_workspaces(timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'private.current_org_has_access()', 'execute')
  and not has_function_privilege('anon', 'private.current_org_has_access()', 'execute'),
  'org_has_access and the backfill are the owner''s; a signed-in user asks about their own'
);

select ok(
  has_function_privilege('authenticated', 'public.workspace_access()', 'execute')
  and not has_function_privilege('anon', 'public.workspace_access()', 'execute'),
  'workspace_access is for signed-in users only'
);

select is(
  (select (count(*), bool_and(not livemode), bool_and(not enforced))::text
     from private.billing_config),
  '(1,t,t)',
  'billing_config is one row, in the sandbox, not enforced'
);

select throws_ok(
  $$ insert into private.billing_config (id) values (false) $$,
  '23514', null,
  'billing_config cannot hold a second row'
);

select throws_ok(
  $$ insert into public.access_grants (org_id, kind, granted_by)
     values ('00000000-0000-0000-0000-000000517f0b', 'beta', 'pass_517b2') $$,
  '23505', null,
  'a workspace has at most one unrevoked grant of a kind'
);

select throws_ok(
  $$ insert into public.workspace_billing (org_id, stripe_customer_id, status, livemode)
     values ('00000000-0000-0000-0000-000000517f0b', 'cus_517x', 'lapsed', false) $$,
  '23514', null,
  'a billing status is one Stripe knows'
);

-- The migration's own backfill ran before any fixture here existed.
select is_empty(
  $$ select 1 from public.access_grants
      where granted_by = 'migration'
        and org_id in ('00000000-0000-0000-0000-000000517f0a',
                       '00000000-0000-0000-0000-000000517f0b') $$,
  'a workspace made after the migration was not grandfathered'
);

-- ---------------------------------------------------------------------------
-- 2. Reading: Fay, a teacher of A
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000005170a1","role":"authenticated"}', true);

select results_eq(
  $$ select org_id, status from public.workspace_billing $$,
  $$ values ('00000000-0000-0000-0000-000000517f0a'::uuid, 'trialing'::text) $$,
  'a teacher reads their own workspace''s billing status and no other'
);

select throws_ok(
  $$ select stripe_customer_id from public.workspace_billing $$,
  '42501', null,
  'a teacher cannot read the Stripe customer id'
);

select throws_ok(
  $$ select billing_email from public.workspace_billing $$,
  '42501', null,
  'a teacher cannot read the billing email'
);

select throws_ok(
  $$ select stripe_subscription_id from public.workspace_billing $$,
  '42501', null,
  'a teacher cannot read the Stripe subscription id'
);

select results_eq(
  $$ select org_id, kind, revoked_at is not null from public.access_grants $$,
  $$ values ('00000000-0000-0000-0000-000000517f0a'::uuid, 'beta'::text, true) $$,
  'a teacher reads their own workspace''s grants and no other'
);

select throws_ok(
  $$ select reason from public.access_grants $$,
  '42501', null,
  'a teacher cannot read a grant''s reason'
);

select throws_ok(
  $$ select granted_by from public.access_grants $$,
  '42501', null,
  'a teacher cannot read who granted it'
);

select throws_ok(
  $$ insert into public.workspace_billing (org_id, stripe_customer_id, status, livemode)
     values ('00000000-0000-0000-0000-000000517f0a', 'cus_517z', 'active', false) $$,
  '42501', null,
  'a teacher cannot make a billing row'
);

select throws_ok(
  $$ update public.workspace_billing set status = 'active' $$,
  '42501', null,
  'a teacher cannot change a billing status'
);

select throws_ok(
  $$ delete from public.workspace_billing $$,
  '42501', null,
  'a teacher cannot delete a billing row'
);

select throws_ok(
  $$ insert into public.access_grants (org_id, kind, granted_by)
     values ('00000000-0000-0000-0000-000000517f0a', 'exempt', 'me') $$,
  '42501', null,
  'a teacher cannot grant their workspace free access'
);

select throws_ok(
  $$ update public.access_grants set revoked_at = null $$,
  '42501', null,
  'a teacher cannot restore a revoked grant'
);

select throws_ok(
  $$ delete from public.access_grants $$,
  '42501', null,
  'a teacher cannot delete a grant'
);

select throws_ok(
  $$ select public.may_start_trial('00000000-0000-0000-0000-0000005170a1',
                                   '00000000-0000-0000-0000-000000517f0a') $$,
  '42501', null,
  'a teacher cannot ask whether a trial may start'
);

select throws_ok(
  $$ select public.record_trial_use('00000000-0000-0000-0000-0000005170a1',
                                    '00000000-0000-0000-0000-000000517f0a', 'sub_fake') $$,
  '42501', null,
  'a teacher cannot record a trial'
);

select throws_ok(
  $$ select public.claim_stripe_event('evt_517fake', 'customer.subscription.updated', false) $$,
  '42501', null,
  'a teacher cannot claim a Stripe event'
);

select throws_ok(
  $$ select private.org_has_access('00000000-0000-0000-0000-000000517f0b') $$,
  '42501', null,
  'a teacher cannot ask about another workspace''s access'
);

select ok(
  private.current_org_has_access(),
  'a teacher of a workspace in its trial has access'
);

select is(
  (select row(has_access, source, grant_kind, status, trial_end, current_period_end,
              cancel_at_period_end, is_founder)::text
     from public.workspace_access()),
  row(true, 'subscription', null::text, 'trialing', '2026-11-03 00:00:00+00'::timestamptz,
      '2026-11-03 00:00:00+00'::timestamptz, false, true)::text,
  'workspace_access, for the founder: a trial, its end, and that they manage it'
);

-- ---------------------------------------------------------------------------
-- 3. Tom, a teacher of A who did not found it
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000005170a2","role":"authenticated"}', true);

select is(
  (select row(has_access, source, status, is_founder)::text from public.workspace_access()),
  row(true, 'subscription', 'trialing', false)::text,
  'workspace_access, for another teacher: the same state, and that they do not manage it'
);

select is(
  (select count(*)::int from public.workspace_access()),
  1,
  'workspace_access is one row'
);

-- ---------------------------------------------------------------------------
-- Oli, a teacher of B, on a beta grant
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000005170b1","role":"authenticated"}', true);

select is_empty(
  $$ select 1 from public.workspace_billing
      where org_id = '00000000-0000-0000-0000-000000517f0a' $$,
  'a teacher of another workspace reads none of A''s billing'
);

select is_empty(
  $$ select 1 from public.access_grants
      where org_id = '00000000-0000-0000-0000-000000517f0a' $$,
  'a teacher of another workspace reads none of A''s grants'
);

select is(
  (select row(has_access, source, grant_kind, status, is_founder)::text
     from public.workspace_access()),
  row(true, 'grant', 'beta', null::text, true)::text,
  'workspace_access, on a beta grant with a customer and no subscription'
);

-- ---------------------------------------------------------------------------
-- Sue, a student of A, and Ray, with no role
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000005170a3","role":"authenticated"}', true);

select is_empty(
  $$ select org_id from public.workspace_billing $$,
  'a student reads no billing row, not even their workspace''s'
);

select is_empty(
  $$ select org_id from public.access_grants $$,
  'a student reads no grant'
);

select is_empty(
  $$ select * from public.workspace_access() $$,
  'a student gets no row from workspace_access'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000005170c1","role":"authenticated"}', true);

select is_empty(
  $$ select * from public.workspace_access() $$,
  'an account with no role gets no row from workspace_access'
);

select ok(
  not private.current_org_has_access(),
  'an account with no workspace has no access'
);

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select org_id from public.workspace_billing $$,
  '42501', null,
  'a signed-out visitor cannot read billing'
);

select throws_ok(
  $$ select org_id from public.access_grants $$,
  '42501', null,
  'a signed-out visitor cannot read grants'
);

select throws_ok(
  $$ select * from public.workspace_access() $$,
  '42501', null,
  'a signed-out visitor cannot call workspace_access'
);

reset role;

-- ---------------------------------------------------------------------------
-- 4. org_has_access, one workspace per case, as the owner
-- ---------------------------------------------------------------------------

create temporary table access_cases (
  n int primary key,
  label text not null,
  org_id uuid not null,
  expected boolean not null
);

insert into access_cases (n, label, org_id, expected) values
  (1, 'an exempt grant gives access', '00000000-0000-0000-0000-000000517c01', true),
  (2, 'a grandfathered grant gives access', '00000000-0000-0000-0000-000000517c02', true),
  (3, 'a beta grant gives access', '00000000-0000-0000-0000-000000517c03', true),
  (4, 'an expired grant gives none', '00000000-0000-0000-0000-000000517c04', false),
  (5, 'a revoked grant gives none', '00000000-0000-0000-0000-000000517c05', false),
  (6, 'a grant that expires later gives access', '00000000-0000-0000-0000-000000517c06', true),
  (7, 'trialing gives access', '00000000-0000-0000-0000-000000517c07', true),
  (8, 'active gives access', '00000000-0000-0000-0000-000000517c08', true),
  (9, 'past_due gives access', '00000000-0000-0000-0000-000000517c09', true),
  (10, 'unpaid gives none', '00000000-0000-0000-0000-000000517c10', false),
  (11, 'canceled gives none', '00000000-0000-0000-0000-000000517c11', false),
  (12, 'incomplete gives none', '00000000-0000-0000-0000-000000517c12', false),
  (13, 'incomplete_expired gives none', '00000000-0000-0000-0000-000000517c13', false),
  (14, 'paused gives none', '00000000-0000-0000-0000-000000517c14', false),
  (15, 'a customer with no subscription gives none', '00000000-0000-0000-0000-000000517c15',
   false),
  (16, 'an active live-mode subscription on a sandbox database gives none',
   '00000000-0000-0000-0000-000000517c16', false),
  (17, 'no grant and no billing row gives none', '00000000-0000-0000-0000-000000517c17', false);

insert into public.orgs (id, name, self_registered)
  select org_id, 'Access case ' || n, true from access_cases;

insert into public.access_grants (org_id, kind, granted_by, expires_at, revoked_at) values
  ('00000000-0000-0000-0000-000000517c01', 'exempt', 'owner', null, null),
  ('00000000-0000-0000-0000-000000517c02', 'grandfathered', 'owner', null, null),
  ('00000000-0000-0000-0000-000000517c03', 'beta', 'pass_517c03', null, null),
  ('00000000-0000-0000-0000-000000517c04', 'beta', 'pass_517c04', now() - interval '1 day', null),
  ('00000000-0000-0000-0000-000000517c05', 'grandfathered', 'owner', null, now()),
  ('00000000-0000-0000-0000-000000517c06', 'beta', 'pass_517c06', now() + interval '1 day', null);

insert into public.workspace_billing (org_id, stripe_customer_id, status, livemode)
  select org_id, 'cus_517c' || n,
         (array['trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete',
                'incomplete_expired', 'paused'])[n - 6],
         false
    from access_cases where n between 7 and 14;
insert into public.workspace_billing (org_id, stripe_customer_id, status, livemode) values
  ('00000000-0000-0000-0000-000000517c15', 'cus_517c15', null, false),
  ('00000000-0000-0000-0000-000000517c16', 'cus_517c16', 'active', true);

select is(private.org_has_access(org_id), expected, label) from access_cases order by n;

update private.billing_config set livemode = true;

select ok(
  private.org_has_access('00000000-0000-0000-0000-000000517c16')
  and not private.org_has_access('00000000-0000-0000-0000-000000517c08')
  and private.org_has_access('00000000-0000-0000-0000-000000517c01'),
  'on a live-mode database, a live subscription counts, a sandbox one does not, grants still do'
);

update private.billing_config set livemode = false;

-- ---------------------------------------------------------------------------
-- 5. Trials, as the server
-- ---------------------------------------------------------------------------

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select ok(
  public.may_start_trial('00000000-0000-0000-0000-0000005170a1',
                         '00000000-0000-0000-0000-000000517f0a'),
  'a person who never had a trial, in a workspace that never had one, may start one'
);

select lives_ok(
  $$ select public.record_trial_use('00000000-0000-0000-0000-0000005170a1',
                                    '00000000-0000-0000-0000-000000517f0a', 'sub_517a') $$,
  'the server records Fay''s trial in A'
);

select ok(
  not public.may_start_trial('00000000-0000-0000-0000-0000005170a1',
                             '00000000-0000-0000-0000-000000517f0b'),
  'the same person may not start a second trial in another workspace'
);

select ok(
  not public.may_start_trial('00000000-0000-0000-0000-0000005170a2',
                             '00000000-0000-0000-0000-000000517f0a'),
  'another person may not start a second trial for the same workspace'
);

select ok(
  public.may_start_trial('00000000-0000-0000-0000-0000005170b1',
                         '00000000-0000-0000-0000-000000517f0b'),
  'someone else, for a workspace with no trial, still may'
);

select lives_ok(
  $$ select public.record_trial_use('00000000-0000-0000-0000-0000005170e1',
                                    '00000000-0000-0000-0000-000000517c17', 'sub_517e') $$,
  'the server records Eve''s trial'
);

select throws_ok(
  $$ select public.record_trial_use('00000000-0000-0000-0000-000000517999',
                                    '00000000-0000-0000-0000-000000517f0b', 'sub_517x') $$,
  'P0002', null,
  'a trial for an account that does not exist is refused'
);

reset role;

-- Eve deletes her account and signs up again with the same address, written differently.
delete from auth.users where id = '00000000-0000-0000-0000-0000005170e1';
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000005170e2', 'Eve@Bill.TEST', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}');

select is(
  (select profile_id from private.trial_uses where stripe_subscription_id = 'sub_517e'),
  null::uuid,
  'a trial outlives the account that started it'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select ok(
  not public.may_start_trial('00000000-0000-0000-0000-0000005170e2',
                             '00000000-0000-0000-0000-000000517c16'),
  'a new account at an address that had a trial may not start another'
);

-- ---------------------------------------------------------------------------
-- 6. Stripe events, as the server
-- ---------------------------------------------------------------------------

select ok(
  public.claim_stripe_event('evt_517one', 'customer.subscription.created', false),
  'a new Stripe event is claimed'
);

select ok(
  not public.claim_stripe_event('evt_517one', 'customer.subscription.created', false),
  'the same Stripe event again is not'
);

reset role;

select is(
  (select (type, livemode)::text from private.stripe_events where id = 'evt_517one'),
  '(customer.subscription.created,f)',
  'a claimed event keeps its type and mode'
);

-- ---------------------------------------------------------------------------
-- 7. The backfill, as the owner, with a cutoff in the past
-- ---------------------------------------------------------------------------

insert into public.orgs (id, name, self_registered, created_at) values
  ('00000000-0000-0000-0000-000000517d01', 'Before, self-registered', true, '2026-10-01'),
  ('00000000-0000-0000-0000-000000517d02', 'Before, shared', false, '2026-10-01'),
  ('00000000-0000-0000-0000-000000517d03', 'After', true, '2026-11-01');

select private.grant_existing_workspaces('2026-10-27');

select is(
  (select (kind, reason, granted_by, expires_at, revoked_at)::text from public.access_grants
    where org_id = '00000000-0000-0000-0000-000000517d01'),
  '(grandfathered,"existed before billing, 2026-10-27",migration,,)',
  'a self-registered workspace that existed is grandfathered until revoked'
);

select is(
  (select (kind, reason, granted_by, expires_at, revoked_at)::text from public.access_grants
    where org_id = '00000000-0000-0000-0000-000000517d02'),
  '(exempt,"shared workspace",migration,,)',
  'a shared workspace that existed is exempt'
);

select is_empty(
  $$ select 1 from public.access_grants where org_id = '00000000-0000-0000-0000-000000517d03' $$,
  'a workspace made after the cutoff gets no grant'
);

select private.grant_existing_workspaces('2026-10-27');

select is(
  (select count(*)::int from public.access_grants
    where org_id in ('00000000-0000-0000-0000-000000517d01',
                     '00000000-0000-0000-0000-000000517d02')),
  2,
  'running the backfill again adds nothing'
);

select ok(
  private.org_has_access('00000000-0000-0000-0000-000000517d01')
  and private.org_has_access('00000000-0000-0000-0000-000000517d02')
  and not private.org_has_access('00000000-0000-0000-0000-000000517d03'),
  'the backfilled workspaces have access and the later one has none'
);

select * from finish();
rollback;
