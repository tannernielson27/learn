-- The authoring limit at the write (#123): save, publish, step and import are all bounded by the
-- database itself, so a call that skips the Server Action and goes straight to the Data API is
-- refused the same way. Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it
-- never counts the seed's rows.
--
-- Everything here is one transaction, but the charge is once per transaction (that is what keeps
-- one import call to one import unit however many rows it writes). So each place this test wants
-- to stand for a separate Data API request clears the marker first, the way the end of a real
-- request would. A client cannot do this: set_config lives in pg_catalog, which the Data API does
-- not expose.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000123aa', 'limit-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000123bb', 'limit-b@example.test', 'authenticated', 'authenticated');

-- #204: the sign-up trigger grants no role, so make these accounts instructors in the seeded
-- org explicitly, where the trigger used to put them.
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-0000000123aa',
               '00000000-0000-0000-0000-0000000123bb');

-- B moves to a second org, so a counter can be seen to be per user and not per org.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000123f2', 'Other limits');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000123f2'
  where id = '00000000-0000-0000-0000-0000000123bb';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000123b1', org_id, 'Limit bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000123aa';
insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000123b2', org_id, 'Other limit bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000123bb';

insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
  select '00000000-0000-0000-0000-0000000123e1', '00000000-0000-0000-0000-0000000123b1', org_id,
    'multiple_choice', 'draft',
    '{"stem": {"kind": "markdown", "value": "Which comes first?"}}', '{}', '{}'
  from public.profiles where id = '00000000-0000-0000-0000-0000000123aa';

insert into public.case_studies (id, bank_id, org_id, title, ehr, status)
  select '00000000-0000-0000-0000-0000000123c1', '00000000-0000-0000-0000-0000000123b1', org_id,
    'Limit case', '{}', 'draft'
  from public.profiles where id = '00000000-0000-0000-0000-0000000123aa';

-- One item as the app sends it for import, and a whole six-step case study: ten rows across three
-- tables in a single import call, which is the shape the once-per-call proof needs.
create temporary table limit_fixtures as
  select
    jsonb_build_object(
      'type', 'multiple_choice',
      'tags', '[]'::jsonb,
      'content', jsonb_build_object(
        'stem', jsonb_build_object('kind', 'markdown', 'value', 'Imported?')),
      'answer_key', '{}'::jsonb,
      'rationale', '{}'::jsonb,
      'scoring', '{}'::jsonb
    ) as item;
grant select on limit_fixtures to authenticated;

create temporary table limit_case as
  select jsonb_build_object(
    'title', 'Imported case',
    'tags', '[]'::jsonb,
    'ehr', '{}'::jsonb,
    'items', (select jsonb_agg(item) from limit_fixtures, generate_series(1, 6))
  ) as case_study;
grant select on limit_case to authenticated;

-- The fixtures above were written by the superuser, which has no auth.uid(): nothing was charged.
select is(
  (select count(*)::int from private.rate_limits
    where user_id in ('00000000-0000-0000-0000-0000000123aa', '00000000-0000-0000-0000-0000000123bb')),
  0,
  'a caller with no auth.uid() — the seed, a migration, service_role — is not charged'
);

-- ---------------------------------------------------------------------------
-- The write itself is what counts
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000123aa","role":"authenticated"}', true);

select lives_ok(
  $$ update public.items set content = '{"stem": {"kind": "markdown", "value": "Edited"}}'
      where id = '00000000-0000-0000-0000-0000000123e1' $$,
  'A can save a draft straight through the Data API, with no Server Action above it'
);

reset role;

select is(
  (select calls from private.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000123aa' and action = 'save'),
  1,
  'that bare table write spent one save, although nothing called take_rate_limit'
);

-- A second request: the marker a real request would have dropped is cleared here by hand.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000123aa","role":"authenticated"}', true);
select set_config('learn.authoring_charge', '', true);

select lives_ok(
  $$ update public.items set status = 'published', version = 1
      where id = '00000000-0000-0000-0000-0000000123e1' $$,
  'A can publish straight through the Data API'
);

reset role;

select is(
  (select calls from private.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000123aa' and action = 'publish'),
  1,
  'a write that leaves the row published spends a publish, not a save'
);

select is(
  (select calls from private.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000123aa' and action = 'save'),
  1,
  'and it does not spend a save as well'
);

-- B writes its own bank; counters are keyed to the user, not the org or the table.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000123bb","role":"authenticated"}', true);
select set_config('learn.authoring_charge', '', true);

select lives_ok(
  $$ insert into public.items (bank_id, org_id, type, status, content, answer_key, scoring)
     select '00000000-0000-0000-0000-0000000123b2', org_id, 'multiple_choice', 'draft',
       '{"stem": {"kind": "markdown", "value": "B"}}', '{}', '{}'
     from public.profiles where id = '00000000-0000-0000-0000-0000000123bb' $$,
  'B can write its own bank'
);

reset role;

select is(
  (select calls from private.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000123bb' and action = 'save'),
  1,
  'B spends B''s own save budget'
);

select is(
  (select calls from private.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000123aa' and action = 'save'),
  1,
  'and leaves A''s alone'
);

-- ---------------------------------------------------------------------------
-- Past the limit, every one of the four actions is refused at the write
-- ---------------------------------------------------------------------------

-- Back to a draft, so the save below is charged as a save and not as a publish. Written by the
-- superuser, which is not charged.
update public.items set status = 'draft' where id = '00000000-0000-0000-0000-0000000123e1';

-- Each action's whole minute, used up. These are the limits 20260919110000 documents.
delete from private.rate_limits where user_id = '00000000-0000-0000-0000-0000000123aa';
insert into private.rate_limits (user_id, action, window_start, calls)
values
  ('00000000-0000-0000-0000-0000000123aa', 'save', now(), 60),
  ('00000000-0000-0000-0000-0000000123aa', 'publish', now(), 20),
  ('00000000-0000-0000-0000-0000000123aa', 'step', now(), 30),
  ('00000000-0000-0000-0000-0000000123aa', 'import', now(), 10);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000123aa","role":"authenticated"}', true);
select set_config('learn.authoring_charge', '', true);

select throws_ok(
  $$ update public.items set content = '{"stem": {"kind": "markdown", "value": "Again"}}'
      where id = '00000000-0000-0000-0000-0000000123e1' $$,
  '54000', null,
  'save: a direct table write past the limit is refused'
);

select throws_ok(
  $$ update public.items set status = 'published'
      where id = '00000000-0000-0000-0000-0000000123e1' $$,
  '54000', null,
  'publish: a direct table write past the limit is refused'
);

select throws_ok(
  $$ insert into public.item_versions (item_id, version, org_id, snapshot)
     select '00000000-0000-0000-0000-0000000123e1', 9, org_id, '{}'::jsonb
     from public.profiles where id = '00000000-0000-0000-0000-0000000123aa' $$,
  '54000', null,
  'the publish snapshot table is bounded too, against the save budget'
);

select throws_ok(
  $$ select public.start_case_study_step(
       '00000000-0000-0000-0000-0000000123c1', 1::smallint, 'multiple_choice') $$,
  '54000', null,
  'step: a direct RPC call past the limit is refused'
);

select throws_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000123b1',
       (select jsonb_build_array(item) from limit_fixtures),
       null) $$,
  '54000', null,
  'import: a direct RPC call past the limit is refused'
);

reset role;

select is(
  (select count(*)::int from public.case_study_items
    where case_study_id = '00000000-0000-0000-0000-0000000123c1'),
  0,
  'a refused step wrote nothing'
);

select is(
  (select count(*)::int from public.items where bank_id = '00000000-0000-0000-0000-0000000123b1'),
  1,
  'a refused import wrote nothing: the bank still holds only its fixture item'
);

-- ---------------------------------------------------------------------------
-- One import call is one import unit, however many rows the file holds
-- ---------------------------------------------------------------------------

delete from private.rate_limits where user_id = '00000000-0000-0000-0000-0000000123aa';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000123aa","role":"authenticated"}', true);
select set_config('learn.authoring_charge', '', true);

select lives_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000123b1',
       (select jsonb_build_array(item, item, item) from limit_fixtures),
       (select case_study from limit_case)) $$,
  'one file holding three items and a six-step case study imports'
);

reset role;

select is(
  (select count(*)::int from public.items where bank_id = '00000000-0000-0000-0000-0000000123b1'),
  10,
  'that one call wrote nine new rows in items, on top of the fixture'
);

select results_eq(
  $$ select action, calls from private.rate_limits
      where user_id = '00000000-0000-0000-0000-0000000123aa' order by action $$,
  $$ values ('import', 1) $$,
  'and spent exactly one import unit, and no save at all: per call, never per row'
);

-- Ten files in one batch, each its own request, is exactly the minute's import budget.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000123aa","role":"authenticated"}', true);

select lives_ok(
  $$ do $batch$
     declare file_number integer;
     begin
       -- The batch's first file is the import above; nine more make the documented ten.
       for file_number in 2..10 loop
         perform set_config('learn.authoring_charge', '', true);
         perform public.import_bank_content(
           '00000000-0000-0000-0000-0000000123b1',
           (select jsonb_build_array(item) from limit_fixtures),
           null);
       end loop;
     end $batch$ $$,
  'all ten files of a full batch import, one request each'
);

reset role;

select is(
  (select calls from private.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000123aa' and action = 'import'),
  10,
  'a ten-file batch spends exactly ten: IMPORT_MAX_FILES stays 10'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000123aa","role":"authenticated"}', true);
select set_config('learn.authoring_charge', '', true);

select throws_ok(
  $$ select public.import_bank_content(
       '00000000-0000-0000-0000-0000000123b1',
       (select jsonb_build_array(item) from limit_fixtures),
       null) $$,
  '54000', null,
  'the eleventh file in the same minute is refused'
);

-- ---------------------------------------------------------------------------
-- Asking spends nothing
-- ---------------------------------------------------------------------------

select is(
  public.take_rate_limit('import'), false,
  'the app''s question answers no once the budget is gone'
);

select is(
  (select count(*)::int from generate_series(1, 5) where public.take_rate_limit('save')),
  5,
  'and answers yes for an action with room, however often it is asked'
);

reset role;

select is(
  (select count(*)::int from private.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000123aa'),
  1,
  'asking never counted and never made a row: only the write does'
);

select * from finish();
rollback;
