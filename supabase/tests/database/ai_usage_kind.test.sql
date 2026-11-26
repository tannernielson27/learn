-- One monthly AI cap for import and drafting (#621, ADR 0018 decision 1): a reservation's kind.
--
-- What is held here:
--   1. Structure: `private.ai_usage_reservations.kind` is required, reads 'import' when a row is
--      written without one (as every row before the migration was), and holds only 'import',
--      'draft_rationale' or 'draft_variant'; a drafting row has no batch.
--   2. The function: one `reserve_ai_usage` and no stale four-argument overload; security
--      definer with an empty search_path; executable by service_role only, not by public, anon
--      or authenticated.
--   3. Existing calls: three and four arguments, by position and by name, still work and record
--      'import'.
--   4. One cap: draft and import reservations draw on the same `public.ai_usage` row; a draft is
--      refused with cap_reached once import has spent the month, and import once drafts have;
--      a draft is refused with disabled where the workspace switch is off, and nothing is
--      recorded; a draft reservation settles like any other.
--   5. Bad input: an unknown or null kind, and a drafting call charged to a batch, are refused.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (...621xxx); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

-- F1: AI on, a $1.00 cap. F2: AI off. F3: AI on, a $0.50 cap, which import spends.
insert into public.orgs (id, name, ai_import_enabled, ai_import_monthly_cap_usd) values
  ('00000000-0000-0000-0000-000000621f01', 'Kind shared cap', true, 1.00),
  ('00000000-0000-0000-0000-000000621f02', 'Kind off', false, 1.00),
  ('00000000-0000-0000-0000-000000621f03', 'Kind spent', true, 0.50);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000621aaa', 'kind-a@example.test', 'authenticated',
   'authenticated');
update public.profiles set org_id = '00000000-0000-0000-0000-000000621f01', role = 'instructor'
  where id = '00000000-0000-0000-0000-000000621aaa';

insert into public.ai_import_batches (id, org_id, created_by) values
  ('00000000-0000-0000-0000-000000621ba1', '00000000-0000-0000-0000-000000621f01',
   '00000000-0000-0000-0000-000000621aaa');

create temporary table kind_calls (
  label text primary key,
  allowed boolean,
  reason text,
  reservation_id uuid,
  remaining_usd numeric,
  remaining_pages integer
);
grant all on kind_calls to service_role;

-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------

select has_column('private', 'ai_usage_reservations', 'kind', 'a reservation records its kind');
select col_not_null('private', 'ai_usage_reservations', 'kind', 'every reservation has a kind');

-- A row written without a kind, as every row before this migration was.
insert into public.ai_usage (org_id, month)
  values ('00000000-0000-0000-0000-000000621f02', date_trunc('month', now() at time zone 'utc'));
insert into private.ai_usage_reservations
  (id, org_id, month, pages_reserved, cost_reserved_usd)
  values ('00000000-0000-0000-0000-000000621e01', '00000000-0000-0000-0000-000000621f02',
          date_trunc('month', now() at time zone 'utc'), 0, 0);

select is(
  (select kind from private.ai_usage_reservations
    where id = '00000000-0000-0000-0000-000000621e01'),
  'import',
  'a reservation written without a kind is an import, as every earlier one was'
);

select throws_ok(
  $$ insert into private.ai_usage_reservations
       (org_id, month, pages_reserved, cost_reserved_usd, kind)
     values ('00000000-0000-0000-0000-000000621f02',
             date_trunc('month', now() at time zone 'utc'), 0, 0, 'draft_case_study') $$,
  '23514', null,
  'the ledger holds no kind but import, draft_rationale and draft_variant'
);

select throws_ok(
  $$ insert into private.ai_usage_reservations
       (org_id, month, batch_id, pages_reserved, cost_reserved_usd, kind)
     values ('00000000-0000-0000-0000-000000621f02',
             date_trunc('month', now() at time zone 'utc'),
             '00000000-0000-0000-0000-000000621ba1', 0, 0, 'draft_variant') $$,
  '23514', null,
  'a drafting reservation belongs to no import batch'
);

-- The fixture rows above are not part of what follows.
delete from private.ai_usage_reservations where org_id = '00000000-0000-0000-0000-000000621f02';
delete from public.ai_usage where org_id = '00000000-0000-0000-0000-000000621f02';

-- ---------------------------------------------------------------------------
-- 2. The function: one of it, definer, server only
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'reserve_ai_usage'),
  1,
  'there is one reserve_ai_usage'
);

select ok(
  to_regprocedure('public.reserve_ai_usage(uuid, integer, numeric, uuid)') is null,
  'the four-argument reserve_ai_usage is gone, so no stale overload is left to call'
);

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     from pg_proc p
    where p.oid = 'public.reserve_ai_usage(uuid, integer, numeric, uuid, text)'::regprocedure),
  'reserve_ai_usage is security definer with an empty search_path'
);

select ok(
  not has_function_privilege('anon',
    'public.reserve_ai_usage(uuid, integer, numeric, uuid, text)', 'execute')
  and not has_function_privilege('authenticated',
    'public.reserve_ai_usage(uuid, integer, numeric, uuid, text)', 'execute')
  and has_function_privilege('service_role',
    'public.reserve_ai_usage(uuid, integer, numeric, uuid, text)', 'execute')
  and not exists (
    select 1
      from pg_proc p, aclexplode(p.proacl) a
     where p.oid = 'public.reserve_ai_usage(uuid, integer, numeric, uuid, text)'::regprocedure
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'only the server (service_role) can reserve usage: not public, anon or authenticated'
);

set local role authenticated;
select throws_ok(
  $$ select public.reserve_ai_usage('00000000-0000-0000-0000-000000621f01', 0, 0.01, null,
                                    'draft_rationale') $$,
  '42501', null,
  'a signed-in user cannot reserve a draft either'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3 and 4. Existing calls, and one cap for every kind (F1, $1.00)
-- ---------------------------------------------------------------------------

set local role service_role;
-- As import has always called it: three arguments, four with a batch, and by name.
insert into kind_calls
  select 'import', * from public.reserve_ai_usage('00000000-0000-0000-0000-000000621f01', 2, 0.60);
insert into kind_calls
  select 'import batch', * from public.reserve_ai_usage(
    '00000000-0000-0000-0000-000000621f01', 1, 0.10, '00000000-0000-0000-0000-000000621ba1');
insert into kind_calls
  select 'import named', * from public.reserve_ai_usage(
    p_org => '00000000-0000-0000-0000-000000621f01', p_pages => 0, p_cost_usd => 0.05,
    p_batch => null);
-- $0.75 committed. A rationale of $0.20 fits; a variant of $0.10 then does not.
insert into kind_calls
  select 'rationale', * from public.reserve_ai_usage(
    '00000000-0000-0000-0000-000000621f01', 0, 0.20, null, 'draft_rationale');
insert into kind_calls
  select 'variant over', * from public.reserve_ai_usage(
    p_org => '00000000-0000-0000-0000-000000621f01', p_pages => 0, p_cost_usd => 0.10,
    p_kind => 'draft_variant');
-- Import is refused by what drafting reserved.
insert into kind_calls
  select 'import over', * from public.reserve_ai_usage(
    '00000000-0000-0000-0000-000000621f01', 1, 0.10);
reset role;

select ok(
  (select allowed and reason = 'ok' and remaining_usd = 0.40 from kind_calls
    where label = 'import'),
  'a three-argument call still reserves'
);

select ok(
  (select r.kind = 'import' and r.batch_id is null
     from private.ai_usage_reservations r
    where r.id = (select reservation_id from kind_calls where label = 'import')),
  'a call without a kind records import'
);

select ok(
  (select c.allowed and r.kind = 'import' and r.batch_id = '00000000-0000-0000-0000-000000621ba1'
     from kind_calls c join private.ai_usage_reservations r on r.id = c.reservation_id
    where c.label = 'import batch'),
  'a four-argument call with a batch still reserves, as import, on that batch'
);

select ok(
  (select c.allowed and r.kind = 'import'
     from kind_calls c join private.ai_usage_reservations r on r.id = c.reservation_id
    where c.label = 'import named'),
  'a call by name, as the server''s client makes it, still reserves as import'
);

select ok(
  (select allowed and reason = 'ok' and remaining_usd = 0.05 from kind_calls
    where label = 'rationale'),
  'a draft reservation that fits under what import left is allowed, and says what is left'
);

select ok(
  (select r.kind = 'draft_rationale' and r.batch_id is null and r.pages_reserved = 0
     from private.ai_usage_reservations r
    where r.id = (select reservation_id from kind_calls where label = 'rationale')),
  'the ledger records the draft''s kind, with no batch and no pages'
);

select ok(
  (select not allowed and reason = 'cap_reached' and reservation_id is null
          and remaining_usd = 0.05
     from kind_calls where label = 'variant over'),
  'a draft past what import and drafting have reserved together is refused'
);

select ok(
  (select not allowed and reason = 'cap_reached' and remaining_usd = 0.05
     from kind_calls where label = 'import over'),
  'an import past what drafting has reserved is refused: one cap, both ways'
);

select is(
  (select (count(*), sum(cost_reserved_usd)::numeric(6, 2), sum(pages_reserved))::text
     from public.ai_usage where org_id = '00000000-0000-0000-0000-000000621f01'),
  '(1,0.95,3)',
  'import and drafting share one ai_usage row for the workspace and month'
);

select is(
  (select array_agg(kind order by kind)::text from private.ai_usage_reservations
    where org_id = '00000000-0000-0000-0000-000000621f01'),
  '{draft_rationale,import,import,import}',
  'a refused reservation records nothing, of either kind'
);

set local role service_role;
insert into kind_calls (label, allowed)
  select 'settle rationale', public.settle_ai_usage(
    (select reservation_id from kind_calls where label = 'rationale'), 0, 1500, 400, 0.01);
reset role;

select ok(
  (select allowed from kind_calls where label = 'settle rationale')
  and (select settled_at is not null and cost_used_usd = 0.01 and kind = 'draft_rationale'
         from private.ai_usage_reservations
        where id = (select reservation_id from kind_calls where label = 'rationale')),
  'a draft reservation settles like an import one, and keeps its kind'
);

select is(
  (select (cost_reserved_usd::numeric(6, 2), cost_used_usd::numeric(6, 2), calls)::text
     from public.ai_usage where org_id = '00000000-0000-0000-0000-000000621f01'),
  '(0.75,0.01,1)',
  'settling a draft moves it from reserved to used on the shared row'
);

-- ---------------------------------------------------------------------------
-- 4. Import spends the month (F3, $0.50); the workspace switch (F2)
-- ---------------------------------------------------------------------------

set local role service_role;
insert into kind_calls
  select 'spend', * from public.reserve_ai_usage('00000000-0000-0000-0000-000000621f03', 4, 0.50);
insert into kind_calls
  select 'draft after spend', * from public.reserve_ai_usage(
    '00000000-0000-0000-0000-000000621f03', 0, 0.01, null, 'draft_rationale');
insert into kind_calls (label, allowed)
  select 'settle spend', public.settle_ai_usage(
    (select reservation_id from kind_calls where label = 'spend'), 4, 90000, 16000, 0.50);
insert into kind_calls
  select 'draft after settle', * from public.reserve_ai_usage(
    '00000000-0000-0000-0000-000000621f03', 0, 0.01, null, 'draft_variant');
insert into kind_calls
  select 'off', * from public.reserve_ai_usage(
    '00000000-0000-0000-0000-000000621f02', 0, 0.01, null, 'draft_variant');
reset role;

select ok(
  (select allowed and remaining_usd = 0 from kind_calls where label = 'spend'),
  'import may reserve the whole month'
);

select ok(
  (select not allowed and reason = 'cap_reached' and reservation_id is null
          and remaining_usd = 0
     from kind_calls where label = 'draft after spend'),
  'a draft is refused with cap_reached once import has reserved the month'
);

select ok(
  (select allowed from kind_calls where label = 'settle spend')
  and (select not allowed and reason = 'cap_reached' and remaining_usd = 0
         from kind_calls where label = 'draft after settle'),
  'and still once import has spent it'
);

select is(
  (select count(*)::integer from private.ai_usage_reservations
    where org_id = '00000000-0000-0000-0000-000000621f03' and kind <> 'import'),
  0,
  'a refused draft records nothing'
);

select ok(
  (select not allowed and reason = 'disabled' and reservation_id is null
     from kind_calls where label = 'off')
  and not exists (select 1 from public.ai_usage
                   where org_id = '00000000-0000-0000-0000-000000621f02'),
  'a draft is refused with disabled where the workspace switch is off, and nothing is recorded'
);

-- ---------------------------------------------------------------------------
-- 5. Bad input
-- ---------------------------------------------------------------------------

set local role service_role;

select throws_ok(
  $$ select public.reserve_ai_usage('00000000-0000-0000-0000-000000621f01', 0, 0.01, null,
                                    'draft_case_study') $$,
  '22023', null,
  'a kind the ledger does not know is refused'
);

select throws_ok(
  $$ select public.reserve_ai_usage('00000000-0000-0000-0000-000000621f01', 0, 0.01, null,
                                    null) $$,
  '22023', null,
  'a null kind is refused'
);

select throws_ok(
  $$ select public.reserve_ai_usage('00000000-0000-0000-0000-000000621f01', 0, 0.01,
                                    '00000000-0000-0000-0000-000000621ba1', 'draft_rationale') $$,
  '22023', null,
  'a drafting call cannot be charged to an import batch'
);

select throws_ok(
  $$ select public.reserve_ai_usage('00000000-0000-0000-0000-000000621999', 0, 0.01, null,
                                    'draft_variant') $$,
  'P0002', null,
  'a draft for a workspace that does not exist is refused'
);

reset role;

select is(
  (select count(*)::integer from private.ai_usage_reservations
    where org_id in ('00000000-0000-0000-0000-000000621f01',
                     '00000000-0000-0000-0000-000000621f02',
                     '00000000-0000-0000-0000-000000621f03')),
  5,
  'refused and failed calls left the ledger as it was'
);

select * from finish();
rollback;
