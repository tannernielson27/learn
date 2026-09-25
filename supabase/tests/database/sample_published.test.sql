-- #283: the sample bank arrives published. public.import_sample_bank imports into an empty bank
-- and publishes exactly the rows it wrote, all or nothing, for one import unit. A normal import
-- still writes drafts; another org's rows are untouched; a student or role-less account cannot
-- call it; anon cannot execute it. Runs with `pnpm exec supabase test db`. Uses its own fixture ids
-- so it never counts the seed's rows.
--
-- Everything here is one transaction, and the authoring charge is once per transaction, so each
-- place that stands for a separate Data API request clears the marker first, as
-- authoring_write_limits.test.sql does.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000283aa', 'sample-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000283bb', 'sample-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000283cc', 'sample-s@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000283dd', 'sample-n@example.test', 'authenticated', 'authenticated');

-- A is an instructor in org 1; B an instructor in org 2; S a student in org 1; N has no role.
insert into public.orgs (id, name)
values ('00000000-0000-0000-0000-0000000283f1', 'Sample org'),
       ('00000000-0000-0000-0000-0000000283f2', 'Other sample org');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000283f1', role = 'instructor'
  where id = '00000000-0000-0000-0000-0000000283aa';
update public.profiles set org_id = '00000000-0000-0000-0000-0000000283f2', role = 'instructor'
  where id = '00000000-0000-0000-0000-0000000283bb';
update public.profiles set org_id = '00000000-0000-0000-0000-0000000283f1', role = 'student'
  where id = '00000000-0000-0000-0000-0000000283cc';

insert into public.item_banks (id, org_id, name)
values
  ('00000000-0000-0000-0000-0000000283b1', '00000000-0000-0000-0000-0000000283f1', 'Sample bank'),
  ('00000000-0000-0000-0000-0000000283b2', '00000000-0000-0000-0000-0000000283f1', 'Own bank'),
  ('00000000-0000-0000-0000-0000000283b3', '00000000-0000-0000-0000-0000000283f2', 'Other bank'),
  ('00000000-0000-0000-0000-0000000283b4', '00000000-0000-0000-0000-0000000283f1', 'Full bank');

-- A draft already in A's org (another bank) and one in B's org: neither may change.
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring)
values
  ('00000000-0000-0000-0000-0000000283e1', '00000000-0000-0000-0000-0000000283b4',
   '00000000-0000-0000-0000-0000000283f1', 'multiple_choice', 'draft',
   '{"stem": {"kind": "markdown", "value": "Already here"}}', '{}', '{}'),
  ('00000000-0000-0000-0000-0000000283e2', '00000000-0000-0000-0000-0000000283b3',
   '00000000-0000-0000-0000-0000000283f2', 'multiple_choice', 'draft',
   '{"stem": {"kind": "markdown", "value": "Other org"}}', '{}', '{}');

-- One item row as the app sends it, tagged `sample` as the fixtures are.
create temporary table sample_fixtures as
  select jsonb_build_object(
    'type', 'multiple_choice',
    'cjmm_step', null,
    'tags', jsonb_build_array('sample'),
    'content', jsonb_build_object(
      'stem', jsonb_build_object('kind', 'markdown', 'value', 'Which comes first?')),
    'answer_key', jsonb_build_object('correctOptionId', 'a'),
    'rationale', jsonb_build_object('general', 'Because.'),
    'scoring', jsonb_build_object('model', 'zero_one', 'maxPoints', 1)
  ) as item;
create temporary table sample_case as
  select jsonb_build_object(
    'title', 'Sample case',
    'tags', jsonb_build_array('sample'),
    'ehr', jsonb_build_object('tabs', '[]'::jsonb),
    'items', (select jsonb_agg(item) from sample_fixtures, generate_series(1, 6))
  ) as case_study;
grant select on sample_fixtures, sample_case to authenticated, anon;

-- ---------------------------------------------------------------------------
-- The catalog: invoker, pinned search_path, anon executes nothing
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.import_sample_bank(uuid, jsonb, jsonb)', 'execute'),
  'anon cannot execute import_sample_bank'
);
select ok(
  has_function_privilege('authenticated', 'public.import_sample_bank(uuid, jsonb, jsonb)', 'execute'),
  'authenticated can execute it; RLS and the role check decide the rest'
);
select is(
  (select array[p.prosecdef::text, array_to_string(p.proconfig, ',')]
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'import_sample_bank'),
  array['false', 'search_path=""'],
  'it is security invoker with search_path pinned to empty'
);

-- ---------------------------------------------------------------------------
-- A student and a role-less account cannot call it
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000283cc","role":"authenticated"}', true);
select throws_ok(
  $$ select public.import_sample_bank('00000000-0000-0000-0000-0000000283b1',
       (select jsonb_build_array(item) from sample_fixtures), (select case_study from sample_case)) $$,
  '42501', null,
  'a student cannot call it'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000283dd","role":"authenticated"}', true);
select throws_ok(
  $$ select public.import_sample_bank('00000000-0000-0000-0000-0000000283b1',
       (select jsonb_build_array(item) from sample_fixtures), (select case_study from sample_case)) $$,
  '42501', null,
  'an account with no role cannot call it'
);

-- ---------------------------------------------------------------------------
-- B, an instructor in another org, cannot reach A's bank
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000283bb","role":"authenticated"}', true);
select set_config('learn.authoring_charge', '', true);
select throws_ok(
  $$ select public.import_sample_bank('00000000-0000-0000-0000-0000000283b1',
       (select jsonb_build_array(item) from sample_fixtures), (select case_study from sample_case)) $$,
  '22023', 'that bank does not exist',
  'B cannot import into a bank in another org, which reads as not found'
);

-- ---------------------------------------------------------------------------
-- A: the refusals first, each writing nothing
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000283aa","role":"authenticated"}', true);
select set_config('learn.authoring_charge', '', true);
select throws_ok(
  $$ select public.import_sample_bank('00000000-0000-0000-0000-0000000283b4',
       (select jsonb_build_array(item) from sample_fixtures), (select case_study from sample_case)) $$,
  '22023', 'the sample only imports into an empty bank',
  'a bank that already holds anything is refused, so nothing in it changes'
);

select set_config('learn.authoring_charge', '', true);
select throws_ok(
  $$ select public.import_sample_bank('00000000-0000-0000-0000-0000000283b1',
       (select jsonb_build_array(jsonb_set(item, '{tags}', '["mine"]')) from sample_fixtures),
       (select case_study from sample_case)) $$,
  '22023', 'only the sample imports published',
  'an item without the sample tag is refused: this is not a general publish-on-import'
);

select set_config('learn.authoring_charge', '', true);
select throws_ok(
  $$ select public.import_sample_bank('00000000-0000-0000-0000-0000000283b1',
       (select jsonb_build_array(item) from sample_fixtures), null) $$,
  '22023', 'the sample is items and a case study',
  'the sample without its case study is refused'
);

-- A case study with five steps fails inside import_bank_content, after the items were written.
select set_config('learn.authoring_charge', '', true);
select throws_ok(
  $$ select public.import_sample_bank('00000000-0000-0000-0000-0000000283b1',
       (select jsonb_build_array(item, item) from sample_fixtures),
       (select jsonb_set(case_study, '{items}', (case_study->'items') - 0) from sample_case)) $$,
  '22023', null,
  'a bad case study is refused'
);
select is(
  (select count(*)::int from public.items where bank_id = '00000000-0000-0000-0000-0000000283b1'),
  0,
  'and nothing it wrote before the refusal survives: all or nothing'
);

-- ---------------------------------------------------------------------------
-- A imports the sample: everything it wrote is published, for one import unit
-- ---------------------------------------------------------------------------

select set_config('learn.authoring_charge', '', true);
reset role;
delete from private.rate_limits where user_id = '00000000-0000-0000-0000-0000000283aa';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000283aa","role":"authenticated"}', true);

select lives_ok(
  $$ select public.import_sample_bank('00000000-0000-0000-0000-0000000283b1',
       (select jsonb_build_array(item, item, item) from sample_fixtures),
       (select case_study from sample_case)) $$,
  'A imports the sample into the empty Sample bank'
);

reset role;

select is(
  (select count(*)::int from public.items
    where bank_id = '00000000-0000-0000-0000-0000000283b1'
      and status = 'published' and version = 1
      and org_id = '00000000-0000-0000-0000-0000000283f1'),
  9,
  'every item and step it wrote is published at version 1 in A''s org'
);
select is(
  (select count(*)::int from public.items
    where bank_id = '00000000-0000-0000-0000-0000000283b1' and status <> 'published'),
  0,
  'no draft is left in the Sample bank'
);
select is(
  (select status from public.case_studies where bank_id = '00000000-0000-0000-0000-0000000283b1'),
  'published',
  'the case study is published'
);
select is(
  (select count(*)::int from public.item_versions v
     join public.items i on i.id = v.item_id
    where i.bank_id = '00000000-0000-0000-0000-0000000283b1'
      and v.version = 1 and v.org_id = i.org_id
      and v.snapshot->>'id' = i.id::text
      and v.snapshot->>'type' = i.type
      and v.snapshot->'answerKey' = i.answer_key
      and v.snapshot->'rationale'->>'general' = 'Because.'
      and v.snapshot->'stem' = i.content->'stem'),
  9,
  'each has its version 1 snapshot, the item with its columns folded back in'
);
select is(
  (select count(*)::int from public.item_versions v
     join public.items i on i.id = v.item_id
    where i.bank_id = '00000000-0000-0000-0000-0000000283b1'
      and (v.snapshot->>'cjmmStep')::int = i.cjmm_step),
  6,
  'the six steps carry their pinned clinical judgment step in the snapshot'
);
select results_eq(
  $$ select action, calls from private.rate_limits
      where user_id = '00000000-0000-0000-0000-0000000283aa' order by action $$,
  $$ values ('import'::text, 1) $$,
  'the whole sample, published, cost one import unit and no publish or save'
);

-- ---------------------------------------------------------------------------
-- Nothing else changed, and a normal import still writes drafts
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select id, status::text from public.items
      where id in ('00000000-0000-0000-0000-0000000283e1', '00000000-0000-0000-0000-0000000283e2')
      order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000283e1'::uuid, 'draft'::text),
            ('00000000-0000-0000-0000-0000000283e2'::uuid, 'draft'::text) $$,
  'the draft in A''s other bank and the one in B''s org are untouched'
);
select is(
  (select count(*)::int from public.items where org_id = '00000000-0000-0000-0000-0000000283f2'),
  1,
  'nothing was written into B''s org'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000283aa","role":"authenticated"}', true);
select set_config('learn.authoring_charge', '', true);
select lives_ok(
  $$ select public.import_bank_content('00000000-0000-0000-0000-0000000283b2',
       (select jsonb_build_array(item) from sample_fixtures), (select case_study from sample_case)) $$,
  'A can still import normally into another bank'
);
reset role;
select is(
  (select count(*)::int from public.items
    where bank_id = '00000000-0000-0000-0000-0000000283b2' and status = 'draft'),
  7,
  'a normal import still writes drafts'
);
select is(
  (select status from public.case_studies where bank_id = '00000000-0000-0000-0000-0000000283b2'),
  'draft',
  'and its case study is a draft'
);

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$ select public.import_sample_bank('00000000-0000-0000-0000-0000000283b2', '[]'::jsonb, '{}'::jsonb) $$,
  '42501', null,
  'anon cannot call it'
);
reset role;

select * from finish();
rollback;
