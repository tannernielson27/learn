-- Archiving (#107): archiving keeps content and version and remembers the status to restore; an
-- archived item or case study cannot be edited, published or placed as a step until restored; a
-- step item cannot be archived on its own; another org's content cannot be archived; and the bank
-- list shows archived items only in the Archived view.
-- Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000a07aa', 'arc-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a07bb', 'arc-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a07cc', 'arc-s@example.test', 'authenticated', 'authenticated');

-- B moves to a second org, to check isolation. S stays in A's org as a student.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000a07f2', 'Other archive');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000a07f2'
  where id = '00000000-0000-0000-0000-0000000a07bb';
update public.profiles set role = 'student'
  where id = '00000000-0000-0000-0000-0000000a07cc';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000a07b1', org_id, 'Archive bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000a07aa';

-- 01: published at version 3, with history. 02: a draft. 1n: six published step items.
insert into public.items (id, bank_id, org_id, type, version, status, content, answer_key, scoring)
select
  ids.id, b.id, b.org_id, 'multiple_choice', ids.version, ids.status::public.content_status,
  jsonb_build_object('id', ids.id::text,
    'stem', jsonb_build_object('kind', 'markdown', 'value', ids.stem)),
  jsonb_build_object('correctOptionId', 'a'),
  jsonb_build_object('model', 'zero_one', 'maxPoints', 1)
from public.item_banks b,
  (values
    ('00000000-0000-0000-0000-0000000a0701'::uuid, 3, 'published', 'Which comes first?'),
    ('00000000-0000-0000-0000-0000000a0702'::uuid, 1, 'draft', 'Half written'),
    ('00000000-0000-0000-0000-0000000a0711'::uuid, 1, 'published', 'Step 1'),
    ('00000000-0000-0000-0000-0000000a0712'::uuid, 1, 'published', 'Step 2'),
    ('00000000-0000-0000-0000-0000000a0713'::uuid, 1, 'published', 'Step 3'),
    ('00000000-0000-0000-0000-0000000a0714'::uuid, 1, 'published', 'Step 4'),
    ('00000000-0000-0000-0000-0000000a0715'::uuid, 1, 'published', 'Step 5'),
    ('00000000-0000-0000-0000-0000000a0716'::uuid, 1, 'published', 'Step 6')
  ) as ids (id, version, status, stem)
where b.id = '00000000-0000-0000-0000-0000000a07b1';

insert into public.item_versions (item_id, version, org_id, snapshot)
  select id, 3, org_id, '{}'::jsonb from public.items
  where id = '00000000-0000-0000-0000-0000000a0701';

-- c1: a published case study with the six step items. c2: a draft case study with no steps.
insert into public.case_studies (id, bank_id, org_id, title, ehr, status)
select ids.id, b.id, b.org_id, ids.title, '{"tabs": []}'::jsonb, ids.status::public.content_status
from public.item_banks b,
  (values
    ('00000000-0000-0000-0000-0000000a07c1'::uuid, 'Heart failure', 'published'),
    ('00000000-0000-0000-0000-0000000a07c2'::uuid, 'Sepsis', 'draft')
  ) as ids (id, title, status)
where b.id = '00000000-0000-0000-0000-0000000a07b1';

insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
select cs.id, cs.org_id, cs.bank_id, n, ('00000000-0000-0000-0000-0000000a071' || n)::uuid
from public.case_studies cs, generate_series(1, 6) as n
where cs.id = '00000000-0000-0000-0000-0000000a07c1';

create temporary table before_archive as
  select id, content, answer_key, rationale, scoring, version from public.items
  where id = '00000000-0000-0000-0000-0000000a0701';
grant select on before_archive to authenticated;

select is(
  (select bool_or(prosecdef) from pg_proc
    where oid in ('public.archive_item(uuid)'::regprocedure,
                  'public.restore_item(uuid)'::regprocedure,
                  'public.archive_case_study(uuid)'::regprocedure,
                  'public.restore_case_study(uuid)'::regprocedure)),
  false,
  'the archive and restore functions are security invoker, so RLS decides what can change'
);

select has_index('public', 'items', 'items_bank_id_status_idx', 'items are indexed by bank and status');

-- ---------------------------------------------------------------------------
-- As A: author in the bank's org
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a07aa","role":"authenticated"}', true);

select lives_ok(
  $$ select public.archive_item('00000000-0000-0000-0000-0000000a0701') $$,
  'A can archive a published item'
);

select results_eq(
  $$ select status::text, archived_from::text from public.items
      where id = '00000000-0000-0000-0000-0000000a0701' $$,
  $$ values ('archived', 'published') $$,
  'the item is archived and remembers it was published'
);

select results_eq(
  $$ select id, content, answer_key, rationale, scoring, version from public.items
      where id = '00000000-0000-0000-0000-0000000a0701' $$,
  $$ select id, content, answer_key, rationale, scoring, version from before_archive $$,
  'archiving never changes the content or the version'
);

select is(
  (select count(*)::int from public.item_versions
    where item_id = '00000000-0000-0000-0000-0000000a0701'),
  1,
  'archiving writes no version'
);

select lives_ok(
  $$ select public.archive_item('00000000-0000-0000-0000-0000000a0701') $$,
  'archiving an archived item again changes nothing'
);

select is(
  (select archived_from::text from public.items where id = '00000000-0000-0000-0000-0000000a0701'),
  'published',
  'and it still remembers it was published'
);

select throws_ok(
  $$ update public.items set status = 'published'
      where id = '00000000-0000-0000-0000-0000000a0701' $$,
  '55000', 'this item is archived; restore it first',
  'an archived item cannot be published'
);

select throws_ok(
  $$ update public.items
        set content = content || '{"stem": {"kind": "markdown", "value": "Changed"}}',
            status = 'draft'
      where id = '00000000-0000-0000-0000-0000000a0701' $$,
  '55000', 'this item is archived; restore it first',
  'an archived item cannot be saved as a draft'
);

select throws_ok(
  $$ update public.items set scoring = '{"model": "zero_one", "maxPoints": 2}'
      where id = '00000000-0000-0000-0000-0000000a0701' $$,
  '55000', 'this item is archived; restore it first',
  'an archived item''s content cannot change even while it stays archived'
);

select throws_ok(
  $$ update public.items set status = 'draft', archived_from = null
      where id = '00000000-0000-0000-0000-0000000a0701' $$,
  '55000', 'this item is archived; restore it first',
  'restoring by hand must return the status it had, not another'
);

select throws_ok(
  $$ select public.place_case_study_step('00000000-0000-0000-0000-0000000a07c2', 1::smallint,
       '00000000-0000-0000-0000-0000000a0701') $$,
  '55000', 'that item is archived; restore it before placing it as a step',
  'an archived item cannot be placed as a step'
);

-- The bank's list (#105) leaves archived items out unless the Archived view asks for them.
select is(
  (select count(*)::int from public.list_bank_items('00000000-0000-0000-0000-0000000a07b1')
    where id = '00000000-0000-0000-0000-0000000a0701'),
  0,
  'the bank list leaves an archived item out'
);

select is(
  (select count(*)::int from public.list_bank_items(
     '00000000-0000-0000-0000-0000000a07b1', item_status => 'archived')
    where id = '00000000-0000-0000-0000-0000000a0701'),
  1,
  'the Archived view lists it, and only it'
);

select is(
  (select count(*)::int from public.list_bank_items(
     '00000000-0000-0000-0000-0000000a07b1', item_status => 'archived')),
  1,
  'no current item shows in the Archived view'
);

select is(
  (select count(*)::int from public.list_bank_items(
     '00000000-0000-0000-0000-0000000a07b1', item_status => 'published')
    where id = '00000000-0000-0000-0000-0000000a0701'),
  0,
  'a published filter never shows an archived item'
);

select lives_ok(
  $$ select public.restore_item('00000000-0000-0000-0000-0000000a0701') $$,
  'A can restore the item'
);

select results_eq(
  $$ select status::text, archived_from::text, version from public.items
      where id = '00000000-0000-0000-0000-0000000a0701' $$,
  $$ values ('published', null::text, 3) $$,
  'restoring returns it to published at the same version'
);

select lives_ok(
  $$ select public.archive_item('00000000-0000-0000-0000-0000000a0702') $$,
  'A can archive a draft'
);

select lives_ok(
  $$ select public.restore_item('00000000-0000-0000-0000-0000000a0702') $$,
  'and restore it'
);

select is(
  (select status::text from public.items where id = '00000000-0000-0000-0000-0000000a0702'),
  'draft',
  'a restored draft is a draft again, not published'
);

select throws_ok(
  $$ update public.items set status = 'archived', archived_from = 'published'
      where id = '00000000-0000-0000-0000-0000000a0702' $$,
  '22023', 'archived_from must be the status the item had',
  'a draft cannot be archived as if it were published'
);

select throws_ok(
  $$ select public.archive_item('00000000-0000-0000-0000-0000000a0713') $$,
  '2BP01', 'this item is step 3 of the case study "Heart failure"',
  'a step item cannot be archived on its own, and the reason names the case study'
);

select throws_ok(
  $$ update public.items set status = 'archived', archived_from = 'published'
      where id = '00000000-0000-0000-0000-0000000a0713' $$,
  '2BP01', 'this item is step 3 of the case study "Heart failure"',
  'the step guard holds for a direct update too'
);

select lives_ok(
  $$ select public.archive_case_study('00000000-0000-0000-0000-0000000a07c1') $$,
  'A can archive a case study'
);

select results_eq(
  $$ select status::text, archived_from::text, title from public.case_studies
      where id = '00000000-0000-0000-0000-0000000a07c1' $$,
  $$ values ('archived', 'published', 'Heart failure') $$,
  'the case study is archived, remembers it was published and keeps its title'
);

select is(
  (select count(*)::int from public.case_study_items
    where case_study_id = '00000000-0000-0000-0000-0000000a07c1'),
  6,
  'archiving a case study keeps its steps'
);

select throws_ok(
  $$ update public.case_studies set ehr = '{"tabs": ["changed"]}', status = 'draft'
      where id = '00000000-0000-0000-0000-0000000a07c1' $$,
  '55000', 'this case study is archived; restore it first',
  'an archived case study''s record cannot be saved'
);

select throws_ok(
  $$ select public.start_case_study_step('00000000-0000-0000-0000-0000000a07c1', 2::smallint,
       'multiple_choice') $$,
  '55000', null,
  'an archived case study''s steps cannot change'
);

-- Reordering changes only positions, so the step guard must watch every write, not only the
-- columns that name the item or the case study.
select throws_ok(
  $$ select public.reorder_case_study_steps('00000000-0000-0000-0000-0000000a07c1', array[
       '00000000-0000-0000-0000-0000000a0716', '00000000-0000-0000-0000-0000000a0715',
       '00000000-0000-0000-0000-0000000a0714', '00000000-0000-0000-0000-0000000a0713',
       '00000000-0000-0000-0000-0000000a0712', '00000000-0000-0000-0000-0000000a0711']::uuid[]) $$,
  '55000', 'this case study is archived; restore it first',
  'an archived case study''s steps cannot be reordered'
);

select results_eq(
  $$ select item_id from public.case_study_items
      where case_study_id = '00000000-0000-0000-0000-0000000a07c1' order by position $$,
  $$ values ('00000000-0000-0000-0000-0000000a0711'::uuid),
            ('00000000-0000-0000-0000-0000000a0712'::uuid),
            ('00000000-0000-0000-0000-0000000a0713'::uuid),
            ('00000000-0000-0000-0000-0000000a0714'::uuid),
            ('00000000-0000-0000-0000-0000000a0715'::uuid),
            ('00000000-0000-0000-0000-0000000a0716'::uuid) $$,
  'and the refused reorder left every step where it was'
);

select lives_ok(
  $$ select public.restore_case_study('00000000-0000-0000-0000-0000000a07c1') $$,
  'A can restore the case study'
);

select results_eq(
  $$ select status::text, archived_from::text from public.case_studies
      where id = '00000000-0000-0000-0000-0000000a07c1' $$,
  $$ values ('published', null::text) $$,
  'restoring returns the case study to published'
);

select throws_ok(
  $$ select public.archive_item('00000000-0000-0000-0000-0000000a07c1') $$,
  '22023', 'that item does not exist',
  'a case study id is not an item'
);

-- ---------------------------------------------------------------------------
-- As S: a student in A's org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a07cc","role":"authenticated"}', true);

select throws_ok(
  $$ select public.archive_item('00000000-0000-0000-0000-0000000a0701') $$,
  '22023', 'that item does not exist',
  'a student cannot archive an item'
);

-- ---------------------------------------------------------------------------
-- As B: author in another org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a07bb","role":"authenticated"}', true);

select throws_ok(
  $$ select public.archive_item('00000000-0000-0000-0000-0000000a0701') $$,
  '22023', 'that item does not exist',
  'B cannot archive A''s item'
);

select throws_ok(
  $$ select public.archive_case_study('00000000-0000-0000-0000-0000000a07c1') $$,
  '22023', 'that case study does not exist',
  'B cannot archive A''s case study'
);

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.archive_item('00000000-0000-0000-0000-0000000a0701') $$,
  '42501', null,
  'anon cannot call archive_item'
);

select throws_ok(
  $$ select public.restore_case_study('00000000-0000-0000-0000-0000000a07c1') $$,
  '42501', null,
  'anon cannot call restore_case_study'
);

reset role;

select is(
  (select count(*)::int from public.items
    where bank_id = '00000000-0000-0000-0000-0000000a07b1' and status = 'archived')
  + (select count(*)::int from public.case_studies
    where bank_id = '00000000-0000-0000-0000-0000000a07b1' and status = 'archived'),
  0,
  'nothing was left archived: S, B and anon changed nothing'
);

select * from finish();
rollback;
