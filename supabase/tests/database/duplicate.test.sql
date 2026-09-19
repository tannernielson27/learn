-- Duplicating (#106): a copy is a new draft at version 1 with a "(copy)" marker, in the same bank
-- and folder; a case study copies its record and step items in one call; the original is untouched;
-- another org's content cannot be duplicated.
-- Runs with `pnpm exec supabase test db`. Uses its own fixture ids so it never counts the seed's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000006aa', 'dup-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000006bb', 'dup-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000006cc', 'dup-s@example.test', 'authenticated', 'authenticated');

-- B moves to a second org, to check isolation. S stays in A's org as a student.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000006f2', 'Other duplicate');
update public.profiles set org_id = '00000000-0000-0000-0000-0000000006f2'
  where id = '00000000-0000-0000-0000-0000000006bb';
update public.profiles set role = 'student'
  where id = '00000000-0000-0000-0000-0000000006cc';

insert into public.item_banks (id, org_id, name)
  select '00000000-0000-0000-0000-0000000006b1', org_id, 'Duplicate bank'
  from public.profiles where id = '00000000-0000-0000-0000-0000000006aa';

insert into public.bank_folders (id, bank_id, org_id, name)
  select '00000000-0000-0000-0000-0000000006d1', id, org_id, 'Cardiac'
  from public.item_banks where id = '00000000-0000-0000-0000-0000000006b1';

-- A published item at version 3, filed and tagged.
insert into public.items (
  id, bank_id, org_id, folder_id, type, cjmm_step, tags, version, status,
  content, answer_key, rationale, scoring)
select
  '00000000-0000-0000-0000-000000000601', b.id, b.org_id, '00000000-0000-0000-0000-0000000006d1',
  'multiple_choice', 2, '{cardiac,week-3}', 3, 'published',
  jsonb_build_object(
    'id', '00000000-0000-0000-0000-000000000601',
    'stem', jsonb_build_object('kind', 'markdown', 'value', 'Which comes first?'),
    'options', jsonb_build_array(jsonb_build_object('id', 'a', 'label', 'Airway'))),
  jsonb_build_object('correctOptionId', 'a'),
  jsonb_build_object('general', jsonb_build_object('kind', 'markdown', 'value', 'Airway first.')),
  jsonb_build_object('model', 'zero_one', 'maxPoints', 1)
from public.item_banks b where b.id = '00000000-0000-0000-0000-0000000006b1';

insert into public.item_versions (item_id, version, org_id, snapshot)
  select id, 3, org_id, '{}'::jsonb from public.items
  where id = '00000000-0000-0000-0000-000000000601';

-- A published case study with six published step items, filed and tagged.
insert into public.case_studies (id, bank_id, org_id, folder_id, title, ehr, tags, status)
select
  '00000000-0000-0000-0000-0000000006c1', b.id, b.org_id, '00000000-0000-0000-0000-0000000006d1',
  'Heart failure', jsonb_build_object('tabs', jsonb_build_array('record')), '{cardiac}', 'published'
from public.item_banks b where b.id = '00000000-0000-0000-0000-0000000006b1';

insert into public.items (
  id, bank_id, org_id, folder_id, type, cjmm_step, tags, version, status,
  content, answer_key, rationale, scoring)
select
  ('00000000-0000-0000-0000-00000000061' || n)::uuid, b.id, b.org_id, null,
  'multiple_choice', n, '{step}', 2, 'published',
  jsonb_build_object(
    'id', '00000000-0000-0000-0000-00000000061' || n,
    'stem', jsonb_build_object('kind', 'markdown', 'value', 'Step ' || n)),
  jsonb_build_object('correctOptionId', 'a'), '{}'::jsonb,
  jsonb_build_object('model', 'zero_one', 'maxPoints', 1)
from public.item_banks b, generate_series(1, 6) as n
where b.id = '00000000-0000-0000-0000-0000000006b1';

insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
select cs.id, cs.org_id, cs.bank_id, n, ('00000000-0000-0000-0000-00000000061' || n)::uuid
from public.case_studies cs, generate_series(1, 6) as n
where cs.id = '00000000-0000-0000-0000-0000000006c1';

-- A draft case study with the longest title and no steps yet.
insert into public.case_studies (id, bank_id, org_id, title, ehr)
select '00000000-0000-0000-0000-0000000006c2', b.id, b.org_id, repeat('t', 200), '{}'::jsonb
from public.item_banks b where b.id = '00000000-0000-0000-0000-0000000006b1';

create temporary table dup_ids (kind text primary key, id uuid);
grant select, insert on dup_ids to authenticated, anon;

select is(
  (select bool_or(prosecdef) from pg_proc
    where oid in ('public.duplicate_item(uuid)'::regprocedure,
                  'public.duplicate_case_study(uuid)'::regprocedure)),
  false,
  'both duplicate functions are security invoker, so RLS decides what can be copied'
);

-- ---------------------------------------------------------------------------
-- As A: author in the bank's org
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000006aa","role":"authenticated"}', true);

select lives_ok(
  $$ insert into dup_ids
     values ('item', public.duplicate_item('00000000-0000-0000-0000-000000000601')) $$,
  'A can duplicate an item in their own org'
);

select results_eq(
  $$ select c.bank_id, c.folder_id, c.type, c.cjmm_step::int, c.tags, c.answer_key, c.rationale,
            c.scoring
       from public.items c where c.id = (select id from dup_ids where kind = 'item') $$,
  $$ select o.bank_id, o.folder_id, o.type, o.cjmm_step::int, o.tags, o.answer_key, o.rationale,
            o.scoring
       from public.items o where o.id = '00000000-0000-0000-0000-000000000601' $$,
  'the copy has the same bank, folder, type, step, tags, key, rationale and scoring'
);

select results_eq(
  $$ select c.version, c.status::text, c.created_by, c.content->>'id' = c.id::text,
            c.content->'stem'->>'value', c.content->'options'
       from public.items c where c.id = (select id from dup_ids where kind = 'item') $$,
  $$ values (1, 'draft', '00000000-0000-0000-0000-0000000006aa'::uuid, true,
             '(copy) Which comes first?',
             jsonb_build_array(jsonb_build_object('id', 'a', 'label', 'Airway'))) $$,
  'the copy is a draft at version 1 by A, with its own id in content and "(copy)" before the stem'
);

select is(
  (select count(*)::int from public.item_versions
    where item_id = (select id from dup_ids where kind = 'item')),
  0,
  'the copy starts with no version history'
);

select results_eq(
  $$ select version, status::text, content->'stem'->>'value', content->>'id'
       from public.items where id = '00000000-0000-0000-0000-000000000601' $$,
  $$ values (3, 'published', 'Which comes first?', '00000000-0000-0000-0000-000000000601') $$,
  'the original item is untouched'
);

select lives_ok(
  $$ insert into dup_ids
     values ('case', public.duplicate_case_study('00000000-0000-0000-0000-0000000006c1')) $$,
  'A can duplicate a case study in their own org'
);

select results_eq(
  $$ select c.bank_id, c.folder_id, c.title, c.ehr, c.tags, c.status::text, c.created_by
       from public.case_studies c where c.id = (select id from dup_ids where kind = 'case') $$,
  $$ select o.bank_id, o.folder_id, 'Heart failure (copy)'::text, o.ehr, o.tags, 'draft'::text,
            '00000000-0000-0000-0000-0000000006aa'::uuid
       from public.case_studies o where o.id = '00000000-0000-0000-0000-0000000006c1' $$,
  'the case study copy has the same bank, folder, record and tags, a draft titled "(copy)"'
);

select results_eq(
  $$ select csi.position::int, i.cjmm_step::int, i.version, i.status::text,
            i.content->'stem'->>'value', i.content->>'id' = i.id::text, i.bank_id = csi.bank_id
       from public.case_study_items csi
       join public.items i on i.id = csi.item_id
      where csi.case_study_id = (select id from dup_ids where kind = 'case')
      order by csi.position $$,
  $$ select n, n, 1, 'draft', 'Step ' || n, true, true from generate_series(1, 6) as n $$,
  'the copy has six new draft steps at version 1, pinned to their positions, in the same bank'
);

select is(
  (select count(*)::int
     from public.case_study_items c
     join public.case_study_items o on o.item_id = c.item_id
    where c.case_study_id = (select id from dup_ids where kind = 'case')
      and o.case_study_id = '00000000-0000-0000-0000-0000000006c1'),
  0,
  'no step item is shared between the copy and the original'
);

select results_eq(
  $$ select c.type, c.tags, c.answer_key, c.rationale, c.scoring, c.content - 'id'
       from public.case_study_items cc
       join public.items c on c.id = cc.item_id
      where cc.case_study_id = (select id from dup_ids where kind = 'case')
      order by cc.position $$,
  $$ select o.type, o.tags, o.answer_key, o.rationale, o.scoring, o.content - 'id'
       from public.case_study_items oc
       join public.items o on o.id = oc.item_id
      where oc.case_study_id = '00000000-0000-0000-0000-0000000006c1'
      order by oc.position $$,
  'each step copy matches its original apart from id, version and status'
);

-- The demo step: change step 3 in the copy; the original's step 3 is unchanged.
update public.items
   set content = jsonb_set(content, '{stem,value}', '"Changed in the copy"')
 where id = (select item_id from public.case_study_items
              where case_study_id = (select id from dup_ids where kind = 'case') and position = 3);

select results_eq(
  $$ select csi.item_id, i.content->'stem'->>'value', i.status::text, i.version,
            cs.title, cs.status::text
       from public.case_study_items csi
       join public.items i on i.id = csi.item_id
       join public.case_studies cs on cs.id = csi.case_study_id
      where csi.case_study_id = '00000000-0000-0000-0000-0000000006c1' and csi.position = 3 $$,
  $$ values ('00000000-0000-0000-0000-000000000613'::uuid, 'Step 3', 'published', 2,
             'Heart failure', 'published') $$,
  'changing step 3 in the copy leaves the original case study and its step 3 untouched'
);

select is(
  (select count(*)::int from public.case_study_items
    where case_study_id = '00000000-0000-0000-0000-0000000006c1'),
  6,
  'the original still has its six steps'
);

select lives_ok(
  $$ insert into dup_ids
     values ('long', public.duplicate_case_study('00000000-0000-0000-0000-0000000006c2')) $$,
  'a case study with no steps and the longest title can be duplicated'
);

select results_eq(
  $$ select length(title), right(title, 7),
            (select count(*)::int from public.case_study_items where case_study_id = c.id)
       from public.case_studies c where c.id = (select id from dup_ids where kind = 'long') $$,
  $$ values (200, ' (copy)', 0) $$,
  'the longest title is shortened to make room for the marker, and no steps are made up'
);

select throws_ok(
  $$ select public.duplicate_item('00000000-0000-0000-0000-0000000006c1') $$,
  '22023', null,
  'an id that is not an item reads as not found'
);

select throws_ok(
  $$ select public.duplicate_case_study('00000000-0000-0000-0000-000000000601') $$,
  '22023', null,
  'an id that is not a case study reads as not found'
);

-- ---------------------------------------------------------------------------
-- As S: a student in the same org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000006cc","role":"authenticated"}', true);

select throws_ok(
  $$ select public.duplicate_item('00000000-0000-0000-0000-000000000601') $$,
  '22023', null,
  'a student cannot duplicate an item, which reads as not found'
);

select throws_ok(
  $$ select public.duplicate_case_study('00000000-0000-0000-0000-0000000006c1') $$,
  '22023', null,
  'a student cannot duplicate a case study, which reads as not found'
);

-- ---------------------------------------------------------------------------
-- As B: author in another org
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000006bb","role":"authenticated"}', true);

select throws_ok(
  $$ select public.duplicate_item('00000000-0000-0000-0000-000000000601') $$,
  '22023', null,
  'B cannot duplicate an item in another org, which reads as not found'
);

select throws_ok(
  $$ select public.duplicate_case_study('00000000-0000-0000-0000-0000000006c1') $$,
  '22023', null,
  'B cannot duplicate a case study in another org, which reads as not found'
);

-- ---------------------------------------------------------------------------
-- As anon, then back as the superuser
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$ select public.duplicate_item('00000000-0000-0000-0000-000000000601') $$,
  '42501', null,
  'anon cannot call duplicate_item'
);

select throws_ok(
  $$ select public.duplicate_case_study('00000000-0000-0000-0000-0000000006c1') $$,
  '42501', null,
  'anon cannot call duplicate_case_study'
);

reset role;

-- Originals 1 + 6, the item copy 1, the case study copy's 6 steps.
select is(
  (select count(*)::int from public.items where bank_id = '00000000-0000-0000-0000-0000000006b1'),
  14,
  'only A''s copies reached the bank: nothing from S, B or anon'
);

select is(
  (select count(*)::int from public.case_studies
    where bank_id = '00000000-0000-0000-0000-0000000006b1'),
  4,
  'two original case studies and A''s two copies'
);

select is(
  (select count(*)::int from public.case_studies where org_id = '00000000-0000-0000-0000-0000000006f2')
  + (select count(*)::int from public.items where org_id = '00000000-0000-0000-0000-0000000006f2'),
  0,
  'nothing was written into B''s org'
);

select * from finish();
rollback;
