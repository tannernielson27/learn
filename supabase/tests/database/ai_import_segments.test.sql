-- AI import: each chunk's segment answer, and one staged entry per place (#343).
--
-- What is held here:
--   1. `ai_import_chunks.segments` is jsonb; the server (service role) writes it, a signed-in
--      user cannot, and anon holds nothing on it.
--   2. Its shape: null, or an object with a `questions` and an `answers` array; at most 256 KB.
--   3. A teacher reads their own workspace's segments, keys and all, as they read staged entries;
--      another workspace's teacher and a student read none.
--   4. `ai_import_entries (batch_id, position)` is unique, so one question is staged once.
--   5. `ai_import_batches.source` (#344's source matter): the server writes it, in shape; a
--      teacher reads it with the batch and cannot write it.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (...343xxx); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-000000343aaa', 'seg-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000343bbb', 'seg-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000343ccc', 'seg-c@example.test', 'authenticated', 'authenticated');

insert into public.orgs (id, name, ai_import_enabled) values
  ('00000000-0000-0000-0000-000000343f01', 'Segments A', true),
  ('00000000-0000-0000-0000-000000343f02', 'Segments B', true);
update public.profiles set org_id = '00000000-0000-0000-0000-000000343f01', role = 'instructor'
  where id = '00000000-0000-0000-0000-000000343aaa';
update public.profiles set org_id = '00000000-0000-0000-0000-000000343f02', role = 'instructor'
  where id = '00000000-0000-0000-0000-000000343bbb';
update public.profiles set org_id = '00000000-0000-0000-0000-000000343f01', role = 'student'
  where id = '00000000-0000-0000-0000-000000343ccc';

insert into public.ai_import_batches (id, org_id, created_by) values
  ('00000000-0000-0000-0000-000000343ba1', '00000000-0000-0000-0000-000000343f01',
   '00000000-0000-0000-0000-000000343aaa');
insert into public.ai_import_files (id, batch_id, org_id, original_name, kind, status) values
  ('00000000-0000-0000-0000-000000343fa1', '00000000-0000-0000-0000-000000343ba1',
   '00000000-0000-0000-0000-000000343f01', 'quiz.md', 'md', 'ready');
insert into public.ai_import_chunks (id, file_id, batch_id, org_id, position) values
  ('00000000-0000-0000-0000-000000343ca1', '00000000-0000-0000-0000-000000343fa1',
   '00000000-0000-0000-0000-000000343ba1', '00000000-0000-0000-0000-000000343f01', 0);

-- ---------------------------------------------------------------------------
-- 1. Privileges
-- ---------------------------------------------------------------------------

select col_type_is('public', 'ai_import_chunks', 'segments', 'jsonb',
  'a chunk''s segment answer is jsonb');

select ok(
  not has_column_privilege('authenticated', 'public.ai_import_chunks', 'segments', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.ai_import_chunks', 'segments', 'INSERT')
  and not has_column_privilege('anon', 'public.ai_import_chunks', 'segments', 'SELECT')
  and not has_column_privilege('anon', 'public.ai_import_chunks', 'segments', 'UPDATE'),
  'a signed-in user cannot write segments, and anon holds nothing on them'
);

select ok(
  has_column_privilege('service_role', 'public.ai_import_chunks', 'segments', 'UPDATE')
  and has_column_privilege('authenticated', 'public.ai_import_chunks', 'segments', 'SELECT'),
  'the server writes segments; authors read them through the table''s policy'
);

-- ---------------------------------------------------------------------------
-- 2. Shape, as the service role
-- ---------------------------------------------------------------------------

set local role service_role;

select lives_ok(
  $$ update public.ai_import_chunks
       set segments = '{"position":0,"questions":[{"excerpt":"Which first?","answer":"*B"}],"answers":[]}'
     where id = '00000000-0000-0000-0000-000000343ca1' $$,
  'the server stores a chunk''s questions and answers'
);

select throws_ok(
  $$ update public.ai_import_chunks set segments = '[]'
     where id = '00000000-0000-0000-0000-000000343ca1' $$,
  '23514', null,
  'segments that are not an object are refused'
);

select throws_ok(
  $$ update public.ai_import_chunks set segments = '{"questions":[]}'
     where id = '00000000-0000-0000-0000-000000343ca1' $$,
  '23514', null,
  'segments without an answers list are refused'
);

select throws_ok(
  $$ update public.ai_import_chunks set segments = '{"questions":{},"answers":[]}'
     where id = '00000000-0000-0000-0000-000000343ca1' $$,
  '23514', null,
  'segments whose questions are not a list are refused'
);

select throws_ok(
  $$ update public.ai_import_chunks
       set segments = jsonb_build_object(
         'questions', jsonb_build_array(
           (select string_agg(md5(i::text), '') from generate_series(1, 30000) as i)),
         'answers', '[]'::jsonb)
     where id = '00000000-0000-0000-0000-000000343ca1' $$,
  '23514', null,
  'segments over 256 KB are refused'
);

-- ---------------------------------------------------------------------------
-- 4. One entry per place, as the service role
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.ai_import_entries (batch_id, org_id, position, status, source_excerpt)
     values ('00000000-0000-0000-0000-000000343ba1', '00000000-0000-0000-0000-000000343f01', 7,
             'needs_answer', 'Which first?') $$,
  'the server stages a question at its place'
);

select throws_ok(
  $$ insert into public.ai_import_entries (batch_id, org_id, position, status, source_excerpt)
     values ('00000000-0000-0000-0000-000000343ba1', '00000000-0000-0000-0000-000000343f01', 7,
             'needs_answer', 'Which first?') $$,
  '23505', null,
  'the same place in a batch is staged once'
);

-- 5. A batch's source matter
select lives_ok(
  $$ update public.ai_import_batches
       set source = '{"author":"Pine Hollow faculty","objectives":["Assess intake"],"references":[]}'
     where id = '00000000-0000-0000-0000-000000343ba1' $$,
  'the server stores a batch''s source matter'
);

select throws_ok(
  $$ update public.ai_import_batches set source = '{"author":"x","objectives":"one"}'
     where id = '00000000-0000-0000-0000-000000343ba1' $$,
  '23514', null,
  'source matter whose objectives are not a list is refused'
);

reset role;

select ok(
  has_column_privilege('authenticated', 'public.ai_import_batches', 'source', 'SELECT')
  and not has_column_privilege('authenticated', 'public.ai_import_batches', 'source', 'INSERT')
  and not has_column_privilege('authenticated', 'public.ai_import_batches', 'source', 'UPDATE')
  and not has_column_privilege('anon', 'public.ai_import_batches', 'source', 'SELECT'),
  'a teacher reads a batch''s source matter and never writes it; anon holds nothing on it'
);

-- ---------------------------------------------------------------------------
-- 3. Who reads them
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000343aaa","role":"authenticated"}', true);

select is(
  (select segments -> 'questions' -> 0 ->> 'answer' from public.ai_import_chunks
    where id = '00000000-0000-0000-0000-000000343ca1'),
  '*B',
  'A reads their own workspace''s segments, keys included'
);

select throws_ok(
  $$ update public.ai_import_chunks set segments = '{"questions":[],"answers":[]}'
     where id = '00000000-0000-0000-0000-000000343ca1' $$,
  '42501', null,
  'A cannot write segments'
);

select is(
  (select source ->> 'author' from public.ai_import_batches
    where id = '00000000-0000-0000-0000-000000343ba1'),
  'Pine Hollow faculty',
  'A reads their own batch''s source matter'
);

select throws_ok(
  $$ update public.ai_import_batches set source = null
     where id = '00000000-0000-0000-0000-000000343ba1' $$,
  '42501', null,
  'A cannot write a batch''s source matter'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000343bbb","role":"authenticated"}', true);

select is_empty(
  $$ select segments from public.ai_import_chunks
      where id = '00000000-0000-0000-0000-000000343ca1' $$,
  'another workspace''s teacher reads none of them'
);

select is_empty(
  $$ select source from public.ai_import_batches
      where id = '00000000-0000-0000-0000-000000343ba1' $$,
  'another workspace''s teacher reads none of a batch''s source matter'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000343ccc","role":"authenticated"}', true);

select is_empty(
  $$ select segments from public.ai_import_chunks
      where id = '00000000-0000-0000-0000-000000343ca1' $$,
  'a student in the same workspace reads none of them'
);

reset role;

select * from finish();
rollback;
