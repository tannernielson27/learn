-- AI import, the database half (#340): batches, files, chunks, staged entries, usage, the cap and
-- the private upload bucket.
--
-- What is held here:
--   1. Structure and privileges: RLS on every table; anon holds nothing; a teacher writes only a
--      batch's workspace and target, discards a batch, and edits an entry's type, draft, item and
--      status; files, chunks, usage and the ledger are never a client's to write; the caps on orgs
--      are not either; the bucket is private, 25 MB; the two cap functions are the server's only.
--   2. Across workspaces: a teacher sees and edits their own workspace's batches, files, chunks,
--      entries, usage and objects, and nothing of another workspace's; another workspace's teacher
--      sees none of theirs; a student sees nothing; anon reads nothing.
--   3. The limits: 5 files and 100 pages per batch, files only while uploading, 150 entries per
--      batch, 20 open batches per workspace; an entry's version goes up on every edit.
--   4. The cap, one call after another: a reservation that fits passes, one that does not is
--      refused and reserves nothing, settling moves reserved to used once, a page cap applies when
--      set, a workspace with AI import off is refused. Two at once: ai_import_cap_concurrency.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (...340xxx); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-000000340aaa', 'imp-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000340bbb', 'imp-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000340ccc', 'imp-c@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000340ddd', 'imp-d@example.test', 'authenticated', 'authenticated');

-- A is a teacher in the seeded workspace and C a student beside A; B a teacher in a second
-- workspace; D a teacher in a third, which has AI import off.
insert into public.orgs (id, name, ai_import_enabled) values
  ('00000000-0000-0000-0000-000000340f02', 'Other import', true),
  ('00000000-0000-0000-0000-000000340f03', 'Import off', false);
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-000000340aaa', '00000000-0000-0000-0000-000000340ccc');
update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-000000340ccc';
update public.profiles set org_id = '00000000-0000-0000-0000-000000340f02', role = 'instructor'
  where id = '00000000-0000-0000-0000-000000340bbb';
update public.profiles set org_id = '00000000-0000-0000-0000-000000340f03', role = 'instructor'
  where id = '00000000-0000-0000-0000-000000340ddd';

create temporary table imp_ids as
  select org_id as org_a from public.profiles where id = '00000000-0000-0000-0000-000000340aaa';
grant select on imp_ids to authenticated, anon, service_role;
update public.orgs set ai_import_enabled = true where id = (select org_a from imp_ids);

insert into public.ai_import_batches (id, org_id, created_by)
  select '00000000-0000-0000-0000-000000340ba1', org_a, '00000000-0000-0000-0000-000000340aaa'
    from imp_ids;
-- A second batch of A's, already parsed and in review: the one A edits entries in.
insert into public.ai_import_batches (id, org_id, created_by, status)
  select '00000000-0000-0000-0000-000000340ba2', org_a, '00000000-0000-0000-0000-000000340aaa',
         'review'
    from imp_ids;
insert into public.ai_import_batches (id, org_id, created_by) values
  ('00000000-0000-0000-0000-000000340bb1', '00000000-0000-0000-0000-000000340f02',
   '00000000-0000-0000-0000-000000340bbb');

insert into public.ai_import_files (id, batch_id, org_id, original_name, kind, pages)
  select '00000000-0000-0000-0000-000000340fa1', '00000000-0000-0000-0000-000000340ba1', org_a,
         'cardiac.pdf', 'pdf', 10
    from imp_ids;
-- A file the server has already checked.
insert into public.ai_import_files (id, batch_id, org_id, original_name, kind, status)
  select '00000000-0000-0000-0000-000000340fa2', '00000000-0000-0000-0000-000000340ba1', org_a,
         'checked.md', 'md', 'ready'
    from imp_ids;
insert into public.ai_import_files (id, batch_id, org_id, original_name, kind, pages) values
  ('00000000-0000-0000-0000-000000340fb1', '00000000-0000-0000-0000-000000340bb1',
   '00000000-0000-0000-0000-000000340f02', 'renal.pdf', 'pdf', 4);

insert into public.ai_import_chunks (id, file_id, batch_id, org_id, position, page_from, page_to)
  select '00000000-0000-0000-0000-000000340ca1', '00000000-0000-0000-0000-000000340fa1',
         '00000000-0000-0000-0000-000000340ba1', org_a, 0, 1, 8
    from imp_ids;
insert into public.ai_import_chunks (id, file_id, batch_id, org_id, position, page_from, page_to)
values
  ('00000000-0000-0000-0000-000000340cb1', '00000000-0000-0000-0000-000000340fb1',
   '00000000-0000-0000-0000-000000340bb1', '00000000-0000-0000-0000-000000340f02', 0, 1, 4);

insert into public.ai_import_entries
  (id, batch_id, org_id, chunk_id, position, type, status, draft, source_excerpt)
  select '00000000-0000-0000-0000-000000340ea1', '00000000-0000-0000-0000-000000340ba2', org_a,
         null, 0, 'multiple_choice', 'ready',
         '{"stem":"Which first?","key":"B"}', 'Which first? *B'
    from imp_ids;
-- An entry in the batch still uploading, which no teacher may edit yet.
insert into public.ai_import_entries
  (id, batch_id, org_id, chunk_id, position, type, status, draft, source_excerpt)
  select '00000000-0000-0000-0000-000000340ea2', '00000000-0000-0000-0000-000000340ba1', org_a,
         '00000000-0000-0000-0000-000000340ca1', 0, 'multiple_choice', 'needs_answer',
         '{"stem":"Which next?"}', 'Which next?'
    from imp_ids;
insert into public.ai_import_entries
  (id, batch_id, org_id, chunk_id, position, type, status, draft, source_excerpt)
values
  ('00000000-0000-0000-0000-000000340eb1', '00000000-0000-0000-0000-000000340bb1',
   '00000000-0000-0000-0000-000000340f02', '00000000-0000-0000-0000-000000340cb1', 0,
   'multiple_choice', 'ready', '{"stem":"Which renal?","key":"C"}', 'Which renal? *C');

insert into public.ai_usage (org_id, month, cost_used_usd, calls)
  select org_a, date_trunc('month', now() at time zone 'utc')::date, 2.5, 3 from imp_ids;

-- ---------------------------------------------------------------------------
-- 1. Structure and privileges
-- ---------------------------------------------------------------------------

select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.ai_import_batches'::regclass, 'public.ai_import_files'::regclass,
                  'public.ai_import_chunks'::regclass, 'public.ai_import_entries'::regclass,
                  'public.ai_usage'::regclass, 'private.ai_usage_reservations'::regclass)),
  'RLS is on for every AI import table and the ledger'
);

select ok(
  (select bool_and(not has_table_privilege('anon', t, 'SELECT')
                   and not has_table_privilege('anon', t, 'INSERT')
                   and not has_table_privilege('anon', t, 'UPDATE')
                   and not has_table_privilege('anon', t, 'DELETE'))
     from unnest(array['public.ai_import_batches', 'public.ai_import_files',
                       'public.ai_import_chunks', 'public.ai_import_entries',
                       'public.ai_usage', 'private.ai_usage_reservations']) as t),
  'anon holds no privilege on any AI import table'
);

select ok(
  (select bool_and(not has_any_column_privilege('authenticated', t, 'INSERT')
                   and not has_any_column_privilege('authenticated', t, 'UPDATE')
                   and not has_table_privilege('authenticated', t, 'DELETE')
                   and not has_table_privilege('authenticated', t, 'TRUNCATE'))
     from unnest(array['public.ai_import_files', 'public.ai_import_chunks',
                       'public.ai_usage']) as t),
  'a signed-in user cannot write files, chunks or usage'
);

select ok(
  not has_table_privilege('authenticated', 'private.ai_usage_reservations', 'SELECT')
  and not has_table_privilege('service_role', 'private.ai_usage_reservations', 'SELECT'),
  'the ledger is read by nobody but its owner and the two cap functions'
);

select ok(
  not has_any_column_privilege('authenticated', 'public.ai_import_entries', 'INSERT')
  and not has_table_privilege('authenticated', 'public.ai_import_entries', 'DELETE')
  and has_column_privilege('authenticated', 'public.ai_import_entries', 'draft', 'UPDATE')
  and has_column_privilege('authenticated', 'public.ai_import_entries', 'item', 'UPDATE')
  and has_column_privilege('authenticated', 'public.ai_import_entries', 'type', 'UPDATE')
  and has_column_privilege('authenticated', 'public.ai_import_entries', 'status', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.ai_import_entries', 'reasons', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.ai_import_entries', 'version', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.ai_import_entries', 'batch_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.ai_import_entries', 'org_id', 'UPDATE'),
  'a teacher edits an entry''s type, draft, item and status, and nothing else'
);

select ok(
  has_column_privilege('authenticated', 'public.ai_import_batches', 'org_id', 'INSERT')
  and not has_column_privilege('authenticated', 'public.ai_import_batches', 'status', 'INSERT')
  and not has_column_privilege('authenticated', 'public.ai_import_batches', 'created_by', 'INSERT')
  and not has_column_privilege('authenticated', 'public.ai_import_batches',
                               'rights_confirmed_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.ai_import_batches', 'status', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.ai_import_batches', 'org_id', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.ai_import_batches', 'TRUNCATE'),
  'a batch''s status, maker and rights time are never the caller''s to write'
);

select ok(
  not has_column_privilege('authenticated', 'public.orgs', 'ai_import_monthly_cap_usd', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.orgs', 'ai_import_monthly_page_cap',
                               'UPDATE')
  and not has_column_privilege('anon', 'public.orgs', 'ai_import_monthly_cap_usd', 'UPDATE'),
  'nobody but the owner changes a workspace''s caps'
);

select is(
  (select (o.ai_import_monthly_cap_usd, o.ai_import_monthly_page_cap)::text
     from public.orgs o where o.id = '00000000-0000-0000-0000-000000340f03'),
  '(10.00,)',
  'a workspace''s cap is $10 a month by default, with no page cap'
);

select is(
  (select (b.public, b.file_size_limit)::text from storage.buckets b where b.id = 'ai-imports'),
  '(f,26214400)',
  'the ai-imports bucket is private, at most 25 MB an object'
);

select is_empty(
  $$ select policyname from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and (coalesce(qual, '') || coalesce(with_check, '')) like '%ai-imports%'
        and roles <> '{authenticated}' $$,
  'every ai-imports storage policy is for signed-in users only'
);

select is_empty(
  $$ select policyname from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and (coalesce(qual, '') || coalesce(with_check, '')) like '%ai-imports%'
        and cmd in ('UPDATE', 'ALL') $$,
  'no policy lets anyone overwrite an uploaded file'
);

select ok(
  not has_function_privilege('anon', 'public.reserve_ai_usage(uuid, integer, numeric, uuid)',
                             'execute')
  and not has_function_privilege('authenticated',
                                 'public.reserve_ai_usage(uuid, integer, numeric, uuid)', 'execute')
  and not has_function_privilege('anon',
    'public.settle_ai_usage(uuid, integer, integer, integer, numeric)', 'execute')
  and not has_function_privilege('authenticated',
    'public.settle_ai_usage(uuid, integer, integer, integer, numeric)', 'execute')
  and has_function_privilege('service_role',
                             'public.reserve_ai_usage(uuid, integer, numeric, uuid)', 'execute')
  and has_function_privilege('service_role',
    'public.settle_ai_usage(uuid, integer, integer, integer, numeric)', 'execute'),
  'only the server (service_role) can reserve or settle usage'
);

select is(
  (select storage_path from public.ai_import_files
    where id = '00000000-0000-0000-0000-000000340fa1'),
  (select org_a::text || '/00000000-0000-0000-0000-000000340ba1/'
          || '00000000-0000-0000-0000-000000340fa1' from imp_ids),
  'a file''s object name is its workspace, its batch and its own id'
);

-- ---------------------------------------------------------------------------
-- 2. As A, a teacher in the batch's workspace
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000340aaa","role":"authenticated"}', true);

select results_eq(
  $$ select id from public.ai_import_batches
      where id in ('00000000-0000-0000-0000-000000340ba1',
                   '00000000-0000-0000-0000-000000340bb1') $$,
  $$ values ('00000000-0000-0000-0000-000000340ba1'::uuid) $$,
  'A sees their own workspace''s batch and not another''s'
);

select results_eq(
  $$ select id from public.ai_import_entries
      where id in ('00000000-0000-0000-0000-000000340ea1',
                   '00000000-0000-0000-0000-000000340eb1') $$,
  $$ values ('00000000-0000-0000-0000-000000340ea1'::uuid) $$,
  'A sees their own workspace''s staged entries, keys included, and not another''s'
);

select is(
  (select count(*)::int from public.ai_import_files
    where id in ('00000000-0000-0000-0000-000000340fa1', '00000000-0000-0000-0000-000000340fb1'))
  + (select count(*)::int from public.ai_import_chunks
    where id in ('00000000-0000-0000-0000-000000340ca1', '00000000-0000-0000-0000-000000340cb1')),
  2,
  'A sees their own file and chunk, and not another workspace''s'
);

select results_eq(
  $$ select org_id, calls from public.ai_usage $$,
  $$ select org_a, 3 from imp_ids $$,
  'A reads their own workspace''s usage and no other'
);

select lives_ok(
  $$ insert into public.ai_import_batches (org_id) select org_a from imp_ids $$,
  'A can start a batch in their own workspace'
);

select is(
  (select count(*)::int from public.ai_import_batches
    where created_by = '00000000-0000-0000-0000-000000340aaa'
      and id <> '00000000-0000-0000-0000-000000340ba1'
      and status = 'uploading'
      and rights_confirmed_at is not null),
  1,
  'the new batch is A''s, uploading, with the rights time set by the insert'
);

select throws_ok(
  $$ insert into public.ai_import_batches (org_id)
     values ('00000000-0000-0000-0000-000000340f02') $$,
  '42501', null,
  'A cannot start a batch in another workspace'
);

select throws_ok(
  $$ insert into public.ai_import_batches (org_id, status) select org_a, 'review' from imp_ids $$,
  '42501', null,
  'A cannot choose a batch''s status'
);

select lives_ok(
  $$ update public.ai_import_entries set draft = '{"stem":"Which first?","key":"A"}'
      where id = '00000000-0000-0000-0000-000000340ea1' and version = 1 $$,
  'A can edit a staged entry at the version they read'
);

select is(
  (select version from public.ai_import_entries where id = '00000000-0000-0000-0000-000000340ea1'),
  2,
  'an edit moves the entry to the next version'
);

update public.ai_import_entries set draft = '{"stale":true}'
 where id = '00000000-0000-0000-0000-000000340ea1' and version = 1;

select is(
  (select draft->>'key' from public.ai_import_entries
    where id = '00000000-0000-0000-0000-000000340ea1'),
  'A',
  'an edit made at a stale version changes nothing'
);

update public.ai_import_entries set draft = '{"early":true}'
 where id = '00000000-0000-0000-0000-000000340ea2';

select is(
  (select draft->>'stem' from public.ai_import_entries
    where id = '00000000-0000-0000-0000-000000340ea2'),
  'Which next?',
  'an entry cannot be edited until its batch is in review'
);

select throws_ok(
  $$ update public.ai_import_entries set reasons = '{}'
      where id = '00000000-0000-0000-0000-000000340ea1' $$,
  '42501', null,
  'A cannot rewrite the reasons the pipeline gave'
);

select throws_ok(
  $$ update public.ai_import_chunks set input_tokens = 0
      where id = '00000000-0000-0000-0000-000000340ca1' $$,
  '42501', null,
  'A cannot rewrite a chunk''s token count'
);

select throws_ok(
  $$ insert into public.ai_import_files (batch_id, org_id, original_name)
     select '00000000-0000-0000-0000-000000340ba1', org_a, 'mine.pdf' from imp_ids $$,
  '42501', null,
  'A cannot register a file; the server does'
);

-- A discard of another workspace's batch finds nothing to delete (checked as the owner below).
delete from public.ai_import_batches where id = '00000000-0000-0000-0000-000000340bb1';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     select 'ai-imports', storage_path from public.ai_import_files
      where id = '00000000-0000-0000-0000-000000340fa1' $$,
  'A can upload to the path of a file registered in their uploading batch'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     select 'ai-imports', org_a::text || '/00000000-0000-0000-0000-000000340ba1/unregistered'
       from imp_ids $$,
  '42501', null,
  'A cannot upload to a path the server did not register'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     select 'ai-imports', storage_path from public.ai_import_files
      where id = '00000000-0000-0000-0000-000000340fa2' $$,
  '42501', null,
  'A cannot upload again to a file the server has already checked'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('ai-imports', '00000000-0000-0000-0000-000000340f02/'
             || '00000000-0000-0000-0000-000000340bb1/00000000-0000-0000-0000-000000340fb1') $$,
  '42501', null,
  'A cannot upload into another workspace''s batch'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'ai-imports'),
  1,
  'A reads the object they uploaded'
);

-- ---------------------------------------------------------------------------
-- 3. As B, a teacher in another workspace
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000340bbb","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.ai_import_batches b, imp_ids i where b.org_id = i.org_a)
  + (select count(*)::int from public.ai_import_files f, imp_ids i where f.org_id = i.org_a)
  + (select count(*)::int from public.ai_import_chunks c, imp_ids i where c.org_id = i.org_a)
  + (select count(*)::int from public.ai_import_entries e, imp_ids i where e.org_id = i.org_a)
  + (select count(*)::int from public.ai_usage u, imp_ids i where u.org_id = i.org_a),
  0,
  'B reads none of A''s workspace''s batches, files, chunks, entries or usage'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'ai-imports'),
  0,
  'B cannot read A''s uploaded file'
);

update public.ai_import_entries set draft = '{"taken":true}'
 where id = '00000000-0000-0000-0000-000000340ea1';

-- ---------------------------------------------------------------------------
-- 4. As C, a student in A's workspace; D, a teacher where AI import is off; and anon
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000340ccc","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.ai_import_batches)
  + (select count(*)::int from public.ai_import_files)
  + (select count(*)::int from public.ai_import_chunks)
  + (select count(*)::int from public.ai_import_entries)
  + (select count(*)::int from public.ai_usage)
  + (select count(*)::int from storage.objects where bucket_id = 'ai-imports'),
  0,
  'a student reads no batch, file, chunk, entry, usage row or uploaded file'
);

select throws_ok(
  $$ insert into public.ai_import_batches (org_id) select org_a from imp_ids $$,
  '42501', null,
  'a student cannot start a batch'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000340ddd","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.ai_import_batches (org_id)
     values ('00000000-0000-0000-0000-000000340f03') $$,
  '42501', null,
  'a teacher cannot start a batch where AI import is off'
);

select throws_ok(
  $$ select public.reserve_ai_usage('00000000-0000-0000-0000-000000340f02', 1, 0.01) $$,
  '42501', null,
  'a signed-in user cannot reserve usage'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select count(*) from public.ai_import_entries $$,
  '42501', null,
  'a signed-out visitor cannot read staged entries'
);

select throws_ok(
  $$ select public.settle_ai_usage('00000000-0000-0000-0000-000000340999', 0, 0, 0, 0) $$,
  '42501', null,
  'a signed-out visitor cannot settle usage'
);

reset role;

select ok(
  exists (select 1 from public.ai_import_batches where id = '00000000-0000-0000-0000-000000340bb1')
  and (select draft->>'key' from public.ai_import_entries
        where id = '00000000-0000-0000-0000-000000340ea1') = 'A',
  'A''s discard did not reach B''s batch, and B''s edit did not reach A''s entry'
);

-- ---------------------------------------------------------------------------
-- 5. The limits, as the owner (the server's path)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.ai_import_files (batch_id, org_id, original_name, pages)
     select '00000000-0000-0000-0000-000000340ba1', org_a, 'part-' || n, 20
       from imp_ids, generate_series(3, 5) as n $$,
  'a batch takes five files and 70 pages'
);

select throws_ok(
  $$ update public.ai_import_files set pages = 51 where original_name = 'part-3' $$,
  '23514', null,
  'a batch holds at most 100 pages'
);

select throws_ok(
  $$ insert into public.ai_import_files (batch_id, org_id, original_name)
     select '00000000-0000-0000-0000-000000340ba1', org_a, 'part-6' from imp_ids $$,
  '23514', null,
  'a batch holds at most 5 files'
);

update public.ai_import_batches set status = 'review'
 where id = '00000000-0000-0000-0000-000000340bb1';

select throws_ok(
  $$ insert into public.ai_import_files (batch_id, org_id, original_name)
     values ('00000000-0000-0000-0000-000000340bb1', '00000000-0000-0000-0000-000000340f02',
             'late.pdf') $$,
  '23514', null,
  'no file is added once a batch has left uploading'
);

select lives_ok(
  $$ insert into public.ai_import_entries (batch_id, org_id, position, status)
     select '00000000-0000-0000-0000-000000340ba1', org_a, n, 'needs_fix'
       from imp_ids, generate_series(1, 149) as n $$,
  'a batch takes 150 staged entries'
);

select throws_ok(
  $$ insert into public.ai_import_entries (batch_id, org_id, position, status)
     select '00000000-0000-0000-0000-000000340ba1', org_a, 150, 'needs_fix' from imp_ids $$,
  '23514', null,
  'a batch holds at most 150 staged entries'
);

select lives_ok(
  $$ insert into public.ai_import_batches (org_id)
     select '00000000-0000-0000-0000-000000340f02' from generate_series(1, 19) $$,
  'a workspace may have 20 open batches'
);

select throws_ok(
  $$ insert into public.ai_import_batches (org_id)
     values ('00000000-0000-0000-0000-000000340f02') $$,
  '23514', null,
  'a workspace has at most 20 open batches'
);

-- ---------------------------------------------------------------------------
-- 6. The cap, one call after another, as the server
-- ---------------------------------------------------------------------------

update public.orgs set ai_import_monthly_cap_usd = 1.00
 where id = '00000000-0000-0000-0000-000000340f02';

create temporary table cap_calls (
  label text primary key,
  allowed boolean,
  reason text,
  reservation_id uuid,
  remaining_usd numeric,
  remaining_pages integer
);
grant all on cap_calls to service_role;

set local role service_role;
insert into cap_calls
  select 'first', * from public.reserve_ai_usage(
    '00000000-0000-0000-0000-000000340f02', 2, 0.60, '00000000-0000-0000-0000-000000340bb1');
insert into cap_calls
  select 'over', * from public.reserve_ai_usage('00000000-0000-0000-0000-000000340f02', 1, 0.50);
reset role;

select ok(
  (select allowed and reason = 'ok' and reservation_id is not null and remaining_usd = 0.40
          and remaining_pages is null
     from cap_calls where label = 'first'),
  'a reservation that fits under the cap is allowed, and says what is left'
);

select ok(
  (select not allowed and reason = 'cap_reached' and reservation_id is null
          and remaining_usd = 0.40
     from cap_calls where label = 'over'),
  'a reservation past the cap is refused'
);

select is(
  (select (cost_reserved_usd::numeric(6, 2), pages_reserved, cost_used_usd::numeric(6, 2))::text
     from public.ai_usage where org_id = '00000000-0000-0000-0000-000000340f02'),
  '(0.60,2,0.00)',
  'a refused reservation reserved nothing'
);

set local role service_role;
insert into cap_calls (label, allowed)
  select 'settle', public.settle_ai_usage(
    (select reservation_id from cap_calls where label = 'first'), 2, 12000, 3000, 0.10);
insert into cap_calls (label, allowed)
  select 'settle again', public.settle_ai_usage(
    (select reservation_id from cap_calls where label = 'first'), 2, 12000, 3000, 0.10);
reset role;

select ok(
  (select allowed from cap_calls where label = 'settle')
  and not (select allowed from cap_calls where label = 'settle again'),
  'a reservation is settled once; settling it again answers false'
);

select is(
  (select (cost_reserved_usd::numeric(6, 2), pages_reserved, cost_used_usd::numeric(6, 2),
           pages_used, input_tokens, output_tokens, calls)::text
     from public.ai_usage where org_id = '00000000-0000-0000-0000-000000340f02'),
  '(0.00,0,0.10,2,12000,3000,1)',
  'settling moves the reservation to used, with the real tokens and cost, exactly once'
);

select ok(
  (select settled_at is not null and cost_used_usd = 0.10 and batch_id is not null
     from private.ai_usage_reservations
    where id = (select reservation_id from cap_calls where label = 'first')),
  'the ledger records the call, its batch and its real cost'
);

set local role service_role;
insert into cap_calls
  select 'after settle', * from public.reserve_ai_usage(
    '00000000-0000-0000-0000-000000340f02', 1, 0.50);
reset role;

select ok(
  (select allowed from cap_calls where label = 'after settle'),
  'what a settled call did not spend is free again'
);

update public.orgs set ai_import_monthly_page_cap = 3
 where id = '00000000-0000-0000-0000-000000340f02';

set local role service_role;
insert into cap_calls
  select 'pages', * from public.reserve_ai_usage('00000000-0000-0000-0000-000000340f02', 1, 0.01);
insert into cap_calls
  select 'off', * from public.reserve_ai_usage('00000000-0000-0000-0000-000000340f03', 1, 0.01);
reset role;

select ok(
  (select not allowed and reason = 'cap_reached' and remaining_pages = 0
     from cap_calls where label = 'pages'),
  'a page cap, when set, refuses a reservation past it whatever the cost'
);

select ok(
  (select not allowed and reason = 'disabled' and reservation_id is null
     from cap_calls where label = 'off')
  and not exists (select 1 from public.ai_usage
                   where org_id = '00000000-0000-0000-0000-000000340f03'),
  'a workspace with AI import off is refused, and nothing is recorded for it'
);

set local role service_role;

select throws_ok(
  $$ select public.reserve_ai_usage('00000000-0000-0000-0000-000000340f02', -1, 0.01) $$,
  '22023', null,
  'a negative page count is refused'
);

select throws_ok(
  $$ select public.reserve_ai_usage('00000000-0000-0000-0000-000000340999', 1, 0.01) $$,
  'P0002', null,
  'a workspace that does not exist is refused'
);

select throws_ok(
  $$ select public.reserve_ai_usage('00000000-0000-0000-0000-000000340f02', 1, 0.01,
                                    '00000000-0000-0000-0000-000000340ba1') $$,
  '22023', null,
  'a reservation cannot be charged to another workspace''s batch'
);

select throws_ok(
  $$ select public.settle_ai_usage('00000000-0000-0000-0000-000000340999', 0, 0, 0, 0) $$,
  'P0002', null,
  'settling a reservation that does not exist is refused'
);

reset role;

-- ---------------------------------------------------------------------------
-- 7. The abandoned-workspace sweep
-- ---------------------------------------------------------------------------

-- D's only content anywhere is a batch in B's workspace, as if D had moved since.
insert into public.ai_import_batches (org_id, created_by, status) values
  ('00000000-0000-0000-0000-000000340f02', '00000000-0000-0000-0000-000000340ddd', 'imported');

select ok(
  private.sweep_account_tied_elsewhere('00000000-0000-0000-0000-000000340ddd',
                                       '00000000-0000-0000-0000-000000340f03'),
  'a batch in another workspace stops the account''s sweep'
);

select * from finish();
rollback;
