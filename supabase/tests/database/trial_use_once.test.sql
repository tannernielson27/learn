-- One trial record per Stripe subscription (20261102000000_trial_use_once.sql).
--
-- What is held here:
--   1. The index: a second row for the same subscription is refused, rows with no subscription
--      id are not constrained.
--   2. record_trial_use: a second call for the same subscription (another webhook delivery of the
--      same Checkout) writes nothing and does not fail; a new subscription still records.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (…1102…); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000011020a1', 'ida@once.test', 'authenticated', 'authenticated',
   '{"provider": "email"}', '{}');

insert into public.orgs (id, name, self_registered) values
  ('00000000-0000-0000-0000-000001102f0a', 'Once A 1102', true);

-- ---------------------------------------------------------------------------
-- 1. The index, as the superuser
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_indexes
    where schemaname = 'private' and indexname = 'trial_uses_subscription_once'),
  1,
  'trial_uses has a unique index on the subscription'
);

insert into private.trial_uses (profile_id, email_normalized, org_id, stripe_subscription_id)
values (null, 'none@once.test', null, null), (null, 'none@once.test', null, null);

select is(
  (select count(*)::int from private.trial_uses where email_normalized = 'none@once.test'),
  2,
  'rows with no subscription id are not constrained'
);

-- ---------------------------------------------------------------------------
-- 2. record_trial_use, as the server
-- ---------------------------------------------------------------------------

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$ select public.record_trial_use('00000000-0000-0000-0000-0000011020a1',
                                    '00000000-0000-0000-0000-000001102f0a', 'sub_1102a') $$,
  'the first delivery records the trial'
);

select lives_ok(
  $$ select public.record_trial_use('00000000-0000-0000-0000-0000011020a1',
                                    '00000000-0000-0000-0000-000001102f0a', 'sub_1102a') $$,
  'a second delivery for the same subscription does not fail'
);

reset role;

select is(
  (select count(*)::int from private.trial_uses where stripe_subscription_id = 'sub_1102a'),
  1,
  'and records nothing more: one row for the subscription'
);

select throws_ok(
  $$ insert into private.trial_uses (profile_id, email_normalized, org_id, stripe_subscription_id)
     values (null, 'ida@once.test', null, 'sub_1102a') $$,
  '23505', null,
  'a direct second row for the same subscription is refused'
);

select * from finish();
rollback;
