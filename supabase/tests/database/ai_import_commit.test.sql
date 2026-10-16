-- AI import, the last step (#348): import a reviewed batch into its quiz, or discard it, and the
-- sweep of batches left open.
--
-- What is held here:
--   1. Shape and privileges: import_ai_batch runs as its owner with an empty search_path, signed-in
--      users only; the object queue is the server's alone; the sweep is nobody's but its owner's.
--   2. Refusals that write nothing: another workspace's batch, entries changed since the server
--      read them, a kept entry that needs an answer, a batch whose quiz is gone.
--   3. A batch imports whole: its question and its case study's six steps land in its quiz as
--      drafts by the caller, the batch is imported with its counts, its staging rows are gone and
--      its object is queued for removal. A second run is refused.
--   4. Or not at all: a payload that breaks mid-way leaves no question and the batch in review.
--   5. A student, another workspace's teacher and anon are refused.
--   6. Discard and the sweep: a deleted batch queues its objects; the sweep removes open batches
--      untouched for 7 days, and keeps one with a recent edit.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (...348xxx); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-000000348aaa', 'cmt-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000348bbb', 'cmt-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000348ccc', 'cmt-c@example.test', 'authenticated', 'authenticated');

-- A is a teacher in a workspace with AI import on, C a student beside A, B a teacher elsewhere.
insert into public.orgs (id, name, ai_import_enabled) values
  ('00000000-0000-0000-0000-000000348f01', 'Commit A', true),
  ('00000000-0000-0000-0000-000000348f02', 'Commit B', true);
update public.profiles set org_id = '00000000-0000-0000-0000-000000348f01', role = 'instructor'
  where id = '00000000-0000-0000-0000-000000348aaa';
update public.profiles set org_id = '00000000-0000-0000-0000-000000348f01', role = 'student'
  where id = '00000000-0000-0000-0000-000000348ccc';
update public.profiles set org_id = '00000000-0000-0000-0000-000000348f02', role = 'instructor'
  where id = '00000000-0000-0000-0000-000000348bbb';

insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-000000348b01', '00000000-0000-0000-0000-000000348f01', 'Cardiac'),
  ('00000000-0000-0000-0000-000000348b02', '00000000-0000-0000-0000-000000348f02', 'Renal');

-- R1: the batch A imports. One ready question, one ready case study, one dropped, one not
-- importable. R2: a kept entry still needs an answer. R3: imports a broken case study. R4: its
-- quiz is gone. RB: B's. Made uploading, so files can be added, then moved to review below.
insert into public.ai_import_batches (id, org_id, bank_id, status, created_by) values
  ('00000000-0000-0000-0000-000000348a01', '00000000-0000-0000-0000-000000348f01',
   '00000000-0000-0000-0000-000000348b01', 'uploading', '00000000-0000-0000-0000-000000348aaa'),
  ('00000000-0000-0000-0000-000000348a02', '00000000-0000-0000-0000-000000348f01',
   '00000000-0000-0000-0000-000000348b01', 'uploading', '00000000-0000-0000-0000-000000348aaa'),
  ('00000000-0000-0000-0000-000000348a03', '00000000-0000-0000-0000-000000348f01',
   '00000000-0000-0000-0000-000000348b01', 'uploading', '00000000-0000-0000-0000-000000348aaa'),
  ('00000000-0000-0000-0000-000000348a04', '00000000-0000-0000-0000-000000348f01',
   null, 'uploading', '00000000-0000-0000-0000-000000348aaa'),
  ('00000000-0000-0000-0000-000000348ab1', '00000000-0000-0000-0000-000000348f02',
   '00000000-0000-0000-0000-000000348b02', 'uploading', '00000000-0000-0000-0000-000000348bbb');

insert into public.ai_import_files (id, batch_id, org_id, original_name, kind, status) values
  ('00000000-0000-0000-0000-000000348fa1', '00000000-0000-0000-0000-000000348a01',
   '00000000-0000-0000-0000-000000348f01', 'cardiac.md', 'md', 'ready'),
  ('00000000-0000-0000-0000-000000348fa4', '00000000-0000-0000-0000-000000348a04',
   '00000000-0000-0000-0000-000000348f01', 'gone.md', 'md', 'ready');
insert into storage.objects (bucket_id, name)
  select 'ai-imports', storage_path from public.ai_import_files
   where id in ('00000000-0000-0000-0000-000000348fa1', '00000000-0000-0000-0000-000000348fa4');
insert into public.ai_import_chunks (id, file_id, batch_id, org_id, position, page_from, page_to)
values
  ('00000000-0000-0000-0000-000000348ca1', '00000000-0000-0000-0000-000000348fa1',
   '00000000-0000-0000-0000-000000348a01', '00000000-0000-0000-0000-000000348f01', 0, 1, 2);
update public.ai_import_batches set status = 'review'
 where id in ('00000000-0000-0000-0000-000000348a01', '00000000-0000-0000-0000-000000348a02',
              '00000000-0000-0000-0000-000000348a03', '00000000-0000-0000-0000-000000348a04',
              '00000000-0000-0000-0000-000000348ab1');

insert into public.ai_import_entries
  (id, batch_id, org_id, position, kind, type, status, item, source_excerpt) values
  ('00000000-0000-0000-0000-000000348e11', '00000000-0000-0000-0000-000000348a01',
   '00000000-0000-0000-0000-000000348f01', 0, 'item', 'multiple_choice', 'ready', '{}', 'Q1 *B'),
  ('00000000-0000-0000-0000-000000348e12', '00000000-0000-0000-0000-000000348a01',
   '00000000-0000-0000-0000-000000348f01', 1, 'case_study', null, 'ready', '{}', 'Case'),
  ('00000000-0000-0000-0000-000000348e13', '00000000-0000-0000-0000-000000348a01',
   '00000000-0000-0000-0000-000000348f01', 2, 'item', 'multiple_choice', 'dropped', '{}', 'Q3'),
  ('00000000-0000-0000-0000-000000348e14', '00000000-0000-0000-0000-000000348a01',
   '00000000-0000-0000-0000-000000348f01', 3, 'item', null, 'not_importable', null, 'Discuss'),
  ('00000000-0000-0000-0000-000000348e21', '00000000-0000-0000-0000-000000348a02',
   '00000000-0000-0000-0000-000000348f01', 0, 'item', 'multiple_choice', 'ready', '{}', 'R2 Q1'),
  ('00000000-0000-0000-0000-000000348e22', '00000000-0000-0000-0000-000000348a02',
   '00000000-0000-0000-0000-000000348f01', 1, 'item', 'multiple_choice', 'needs_answer', '{}',
   'R2 Q2'),
  ('00000000-0000-0000-0000-000000348e31', '00000000-0000-0000-0000-000000348a03',
   '00000000-0000-0000-0000-000000348f01', 0, 'item', 'multiple_choice', 'ready', '{}', 'R3 Q1'),
  ('00000000-0000-0000-0000-000000348e32', '00000000-0000-0000-0000-000000348a03',
   '00000000-0000-0000-0000-000000348f01', 1, 'case_study', null, 'ready', '{}', 'R3 case'),
  ('00000000-0000-0000-0000-000000348e41', '00000000-0000-0000-0000-000000348a04',
   '00000000-0000-0000-0000-000000348f01', 0, 'item', 'multiple_choice', 'ready', '{}', 'R4 Q1'),
  ('00000000-0000-0000-0000-000000348eb1', '00000000-0000-0000-0000-000000348ab1',
   '00000000-0000-0000-0000-000000348f02', 0, 'item', 'multiple_choice', 'ready', '{}', 'RB Q1');

-- What the server sends: a question row, and a case study with six steps (or five).
create temporary table cmt as
  select
    q.question,
    jsonb_build_object(
      'title', 'Fictional case', 'tags', jsonb_build_array('ai-import'),
      'ehr', jsonb_build_object('tabs', jsonb_build_array()),
      -- The step number names the inner query, so the aggregate is evaluated there; each step's
      -- cjmm_step is 1 here and the import pins it to the step's position.
      'items', (select jsonb_agg(q.question || jsonb_build_object('cjmm_step', g.n - g.n + 1))
                  from generate_series(1, 6) as g(n))) as case_study
  from (
    select jsonb_build_object(
      'type', 'multiple_choice', 'cjmm_step', 3, 'tags', jsonb_build_array('ai-import'),
      'content', jsonb_build_object('stem', 'Which first?', 'id', 'ignored'),
      'answer_key', jsonb_build_object('correct', 'b'),
      'rationale', jsonb_build_object('general', 'Because.'),
      'scoring', jsonb_build_object('rule', 'zero_one')) as question
  ) as q;
grant select on cmt to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Shape and privileges
-- ---------------------------------------------------------------------------

select has_function('public', 'import_ai_batch', array['uuid', 'jsonb'],
  'the import function exists');

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     from pg_proc p where p.oid = 'public.import_ai_batch(uuid, jsonb)'::regprocedure),
  'the import runs as its owner with an empty search_path'
);

select ok(
  not has_function_privilege('anon', 'public.import_ai_batch(uuid, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.import_ai_batch(uuid, jsonb)', 'execute'),
  'signed-in users may call the import (it checks them itself); anon may not'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_import_object_deletes'::regclass)
  and not has_table_privilege('anon', 'public.ai_import_object_deletes', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ai_import_object_deletes', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ai_import_object_deletes', 'DELETE')
  and not has_table_privilege('service_role', 'public.ai_import_object_deletes', 'INSERT')
  and has_table_privilege('service_role', 'public.ai_import_object_deletes', 'SELECT')
  and has_table_privilege('service_role', 'public.ai_import_object_deletes', 'DELETE'),
  'the object queue is read and cleared by the server only, and filled only by the trigger'
);

select ok(
  not has_function_privilege('authenticated', 'private.sweep_ai_imports()', 'execute')
  and not has_function_privilege('service_role', 'private.sweep_ai_imports()', 'execute')
  and not has_function_privilege('authenticated', 'private.schedule_ai_import_sweep()', 'execute')
  and not has_function_privilege('authenticated',
    'private.insert_ai_import_item(uuid, uuid, uuid, jsonb, smallint)', 'execute'),
  'nobody but the owner runs the sweep, schedules it, or writes a question through the helper'
);

select is(
  private.schedule_ai_import_sweep(),
  'no_pg_cron',
  'without pg_cron, scheduling the sweep answers no_pg_cron and does nothing'
);

-- ---------------------------------------------------------------------------
-- 2. Refusals that write nothing, as A
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000348aaa","role":"authenticated"}', true);

select is(
  public.import_ai_batch('00000000-0000-0000-0000-000000348ab1', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348eb1', 'version', 1,
                       'item', (select question from cmt)))) ->> 'reason',
  'not_found',
  'another workspace''s batch reads as not found'
);

select is(
  public.import_ai_batch('00000000-0000-0000-0000-000000348a01', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e11', 'version', 2,
                       'item', (select question from cmt)),
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e12', 'version', 1,
                       'case_study', (select case_study from cmt)))) ->> 'reason',
  'entry_changed',
  'an entry at another version than the server read is refused'
);

select is(
  public.import_ai_batch('00000000-0000-0000-0000-000000348a01', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e11', 'version', 1,
                       'item', (select question from cmt)))) ->> 'reason',
  'entry_changed',
  'leaving out a kept entry is refused'
);

select is(
  public.import_ai_batch('00000000-0000-0000-0000-000000348a01', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e11', 'version', 1,
                       'item', (select question from cmt)),
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e12', 'version', 1,
                       'case_study', (select case_study from cmt)),
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e13', 'version', 1,
                       'item', (select question from cmt)))) ->> 'reason',
  'entry_changed',
  'a dropped entry handed in is refused'
);

select is(
  public.import_ai_batch('00000000-0000-0000-0000-000000348a02', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e21', 'version', 1,
                       'item', (select question from cmt)),
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e22', 'version', 1,
                       'item', (select question from cmt)))) ->> 'reason',
  'not_ready',
  'a kept entry that needs an answer is refused, whatever the server sends'
);

select is(
  public.import_ai_batch('00000000-0000-0000-0000-000000348a04', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e41', 'version', 1,
                       'item', (select question from cmt)))) ->> 'reason',
  'quiz_gone',
  'a batch whose quiz was deleted is refused'
);

select throws_ok(
  $$ select public.import_ai_batch('00000000-0000-0000-0000-000000348a01', '{}'::jsonb) $$,
  '22023', null,
  'a payload that is not a list is refused'
);

select is(
  (select count(*)::int from public.items where bank_id = '00000000-0000-0000-0000-000000348b01'),
  0,
  'no refusal wrote a question'
);

-- ---------------------------------------------------------------------------
-- 3. A batch imports whole
-- ---------------------------------------------------------------------------

select is(
  public.import_ai_batch('00000000-0000-0000-0000-000000348a01', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e12', 'version', 1,
                       'case_study', (select case_study from cmt)),
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e11', 'version', 1,
                       'item', (select question from cmt)))),
  '{"ok": true, "questions": 1, "case_studies": 1}'::jsonb,
  'A imports the batch: one question and one case study'
);

select is(
  (select count(*)::int from public.items
    where bank_id = '00000000-0000-0000-0000-000000348b01' and status = 'draft'
      and folder_id is null and version = 1
      and created_by = '00000000-0000-0000-0000-000000348aaa'
      and content ->> 'id' = id::text and answer_key ->> 'correct' = 'b'),
  7,
  'seven drafts in the batch''s quiz, by A, in no folder, each with its own new id'
);

select results_eq(
  $$ select ci.position::int, i.cjmm_step::int
       from public.case_study_items ci
       join public.case_studies cs on cs.id = ci.case_study_id
       join public.items i on i.id = ci.item_id
      where cs.bank_id = '00000000-0000-0000-0000-000000348b01'
        and cs.title = 'Fictional case' and cs.status = 'draft'
      order by ci.position $$,
  $$ values (1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (6, 6) $$,
  'the case study holds its six steps, each pinned to its position'
);

select is(
  (select (status, imported_questions, imported_case_studies, imported_at is not null)::text
     from public.ai_import_batches where id = '00000000-0000-0000-0000-000000348a01'),
  '(imported,1,1,t)',
  'the batch says imported, with what it brought in'
);

select is(
  public.import_ai_batch('00000000-0000-0000-0000-000000348a01', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e11', 'version', 1,
                       'item', (select question from cmt)))) ->> 'reason',
  'already_imported',
  'a second run is refused'
);

reset role;

select is(
  (select count(*)::int from public.ai_import_entries
    where batch_id = '00000000-0000-0000-0000-000000348a01')
  + (select count(*)::int from public.ai_import_files
      where batch_id = '00000000-0000-0000-0000-000000348a01')
  + (select count(*)::int from public.ai_import_chunks
      where batch_id = '00000000-0000-0000-0000-000000348a01'),
  0,
  'the imported batch''s entries, files and chunks (the document and its keys) are gone'
);

select results_eq(
  $$ select storage_path from public.ai_import_object_deletes
      where batch_id = '00000000-0000-0000-0000-000000348a01' $$,
  $$ select '00000000-0000-0000-0000-000000348f01/00000000-0000-0000-0000-000000348a01/'
            || '00000000-0000-0000-0000-000000348fa1' $$,
  'its uploaded file is queued for removal from Storage'
);

select is(
  (select count(*)::int from public.ai_import_batches
    where org_id = '00000000-0000-0000-0000-000000348f01'
      and status in ('uploading', 'parsing', 'review')),
  3,
  'an imported batch no longer counts toward the workspace''s open batches'
);

-- ---------------------------------------------------------------------------
-- 4. Or not at all
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000348aaa","role":"authenticated"}', true);

select throws_ok(
  $$ select public.import_ai_batch('00000000-0000-0000-0000-000000348a03', jsonb_build_array(
       jsonb_build_object('id', '00000000-0000-0000-0000-000000348e31', 'version', 1,
                          'item', (select question from cmt)),
       jsonb_build_object('id', '00000000-0000-0000-0000-000000348e32', 'version', 1,
                          'case_study', (select case_study
                                           || jsonb_build_object('items',
                                                (case_study -> 'items') - 0) from cmt)))) $$,
  '22023', null,
  'a case study with five steps fails the call, after the question before it was written'
);

select is(
  (select count(*)::int from public.items where bank_id = '00000000-0000-0000-0000-000000348b01'),
  7,
  'the failed call left no question behind'
);

reset role;

select is(
  (select status from public.ai_import_batches where id = '00000000-0000-0000-0000-000000348a03')
  || '/' || (select count(*) from public.ai_import_entries
              where batch_id = '00000000-0000-0000-0000-000000348a03')::text,
  'review/2',
  'and the batch is still in review with its entries'
);

-- ---------------------------------------------------------------------------
-- 5. A student, another workspace's teacher, anon
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000348ccc","role":"authenticated"}', true);

select throws_ok(
  $$ select public.import_ai_batch('00000000-0000-0000-0000-000000348a03', '[]'::jsonb) $$,
  '42501', null,
  'a student cannot import'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000348bbb","role":"authenticated"}', true);

select is(
  public.import_ai_batch('00000000-0000-0000-0000-000000348a03', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-000000348e31', 'version', 1,
                       'item', (select question from cmt)))) ->> 'reason',
  'not_found',
  'B cannot import A''s batch'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.import_ai_batch('00000000-0000-0000-0000-000000348a03', '[]'::jsonb) $$,
  '42501', null,
  'a signed-out visitor cannot call the import'
);

reset role;

-- ---------------------------------------------------------------------------
-- 6. Discard and the sweep
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000348aaa","role":"authenticated"}', true);

delete from public.ai_import_batches where id = '00000000-0000-0000-0000-000000348a04';

reset role;

select ok(
  not exists (select 1 from public.ai_import_batches
               where id = '00000000-0000-0000-0000-000000348a04')
  and not exists (select 1 from public.ai_import_entries
                   where batch_id = '00000000-0000-0000-0000-000000348a04')
  and exists (select 1 from public.ai_import_object_deletes
               where batch_id = '00000000-0000-0000-0000-000000348a04'),
  'A discards a batch: it and its entries are gone, and its file is queued for removal'
);

-- Two open batches untouched for 8 days; one has an entry edited today.
insert into public.ai_import_batches (id, org_id, bank_id, status, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000348a05', '00000000-0000-0000-0000-000000348f01',
   '00000000-0000-0000-0000-000000348b01', 'review', now() - interval '8 days',
   now() - interval '8 days'),
  ('00000000-0000-0000-0000-000000348a06', '00000000-0000-0000-0000-000000348f01',
   '00000000-0000-0000-0000-000000348b01', 'review', now() - interval '8 days',
   now() - interval '8 days');
insert into public.ai_import_entries
  (batch_id, org_id, position, kind, type, status, item, source_excerpt, updated_at) values
  ('00000000-0000-0000-0000-000000348a05', '00000000-0000-0000-0000-000000348f01', 0, 'item',
   'multiple_choice', 'ready', '{}', 'old', now() - interval '8 days'),
  ('00000000-0000-0000-0000-000000348a06', '00000000-0000-0000-0000-000000348f01', 0, 'item',
   'multiple_choice', 'ready', '{}', 'edited', now());
select ok(private.sweep_ai_imports() >= 1, 'the sweep removes at least the abandoned batch');

select results_eq(
  $$ select id from public.ai_import_batches
      where id in ('00000000-0000-0000-0000-000000348a01', '00000000-0000-0000-0000-000000348a05',
                   '00000000-0000-0000-0000-000000348a06')
      order by id $$,
  $$ values ('00000000-0000-0000-0000-000000348a01'::uuid),
            ('00000000-0000-0000-0000-000000348a06'::uuid) $$,
  'it removed the batch untouched for 7 days, and kept the edited one and the imported one'
);

select is(
  (select count(*)::int from public.ai_import_batches
    where id = '00000000-0000-0000-0000-000000348ab1'),
  1,
  'B''s batch was untouched by all of A''s calls'
);

select * from finish();
rollback;
