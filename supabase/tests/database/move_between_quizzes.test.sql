-- Moving questions between quizzes, and turning an in-quiz folder into a quiz (#417).
--
-- What is held here:
--   1. Privileges: anon cannot call either function; a signed-in user can.
--   2. Across workspaces: a move or a folder in another workspace matches nothing, from either
--      side, and a student in the same workspace moves nothing.
--   3. Refusals leave both quizzes as they were: more than 200, the same quiz, content that is not
--      in the source quiz (all or nothing), a step without its case study, an empty folder.
--   4. A move: the question keeps its id, its version history and its tags, leaves its folder, and
--      is charged one `save`. A case study moves whole, with its steps, archived or not.
--   5. A folder with a folder inside it becomes a quiz: named after it (with a number when the name
--      is taken), filed beside the original, flattened, its folders gone; a step whose case study
--      stays behind stays too.
--   6. An assignment made before a move still opens, saves and hands the server the moved
--      question to score, with its key.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (…417xxx); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000417aaa', 'move-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000417bbb', 'move-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000417ccc', 'move-s@example.test', 'authenticated', 'authenticated');

-- A teaches in a workspace of its own (so no seeded quiz shares a name), B in another, and S is
-- a student in A's workspace and class.
insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-000000417f01', 'Move workspace'),
  ('00000000-0000-0000-0000-000000417f02', 'Other workspace');
update public.profiles set org_id = '00000000-0000-0000-0000-000000417f01', role = 'instructor'
 where id = '00000000-0000-0000-0000-000000417aaa';
update public.profiles set org_id = '00000000-0000-0000-0000-000000417f02', role = 'instructor'
 where id = '00000000-0000-0000-0000-000000417bbb';
update public.profiles set org_id = '00000000-0000-0000-0000-000000417f01', role = 'student'
 where id = '00000000-0000-0000-0000-000000417ccc';

create function pg_temp.act_as(account uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- The source quiz sits in a library folder; the target and a "Cardiac" quiz sit at the top.
insert into public.library_folders (id, org_id, name) values
  ('00000000-0000-0000-0000-000000417e01', '00000000-0000-0000-0000-000000417f01', 'Med-Surg');
insert into public.item_banks (id, org_id, name, library_folder_id) values
  ('00000000-0000-0000-0000-000000417b01', '00000000-0000-0000-0000-000000417f01', 'Everything',
   '00000000-0000-0000-0000-000000417e01'),
  ('00000000-0000-0000-0000-000000417b02', '00000000-0000-0000-0000-000000417f01', 'Renal week', null),
  ('00000000-0000-0000-0000-000000417b03', '00000000-0000-0000-0000-000000417f01', 'cardiac', null),
  ('00000000-0000-0000-0000-000000417b09', '00000000-0000-0000-0000-000000417f02', 'Theirs', null);

-- In the source quiz: Cardiac, with Heart failure inside it; Renal; and an empty folder.
insert into public.bank_folders (id, bank_id, org_id, parent_id, name) values
  ('00000000-0000-0000-0000-000000417d01', '00000000-0000-0000-0000-000000417b01',
   '00000000-0000-0000-0000-000000417f01', null, 'Cardiac'),
  ('00000000-0000-0000-0000-000000417d03', '00000000-0000-0000-0000-000000417b01',
   '00000000-0000-0000-0000-000000417f01', null, 'Renal'),
  ('00000000-0000-0000-0000-000000417d04', '00000000-0000-0000-0000-000000417b01',
   '00000000-0000-0000-0000-000000417f01', null, 'Nothing here');
insert into public.bank_folders (id, bank_id, org_id, parent_id, name) values
  ('00000000-0000-0000-0000-000000417d02', '00000000-0000-0000-0000-000000417b01',
   '00000000-0000-0000-0000-000000417f01', '00000000-0000-0000-0000-000000417d01', 'Heart failure');

-- Questions: i1 in Cardiac (two versions, tagged), i2 in Heart failure, i3 in Renal (tagged, two
-- versions), i4 in no folder, i5 in Renal; s1 and s2 are steps of c1, filed in Renal; s3 is a step of c2, filed
-- in Cardiac; s4 is the step of the archived c3. Then one in the other workspace.
insert into public.items
    (id, bank_id, org_id, folder_id, type, status, tags, version, content, answer_key, scoring)
  select v.id::uuid, '00000000-0000-0000-0000-000000417b01', '00000000-0000-0000-0000-000000417f01',
         v.folder::uuid, 'multiple_choice', 'published', v.tags::text[], v.version, '{}',
         '{"correctOptionId":"key_417"}', '{}'
    from (values
      ('00000000-0000-0000-0000-000000417101', '00000000-0000-0000-0000-000000417d01', '{cardiac}', 2),
      ('00000000-0000-0000-0000-000000417102', '00000000-0000-0000-0000-000000417d02', '{}', 1),
      ('00000000-0000-0000-0000-000000417103', '00000000-0000-0000-0000-000000417d03', '{renal,lab values}', 2),
      ('00000000-0000-0000-0000-000000417104', null, '{}', 1),
      ('00000000-0000-0000-0000-000000417105', '00000000-0000-0000-0000-000000417d03', '{}', 1),
      ('00000000-0000-0000-0000-000000417111', '00000000-0000-0000-0000-000000417d03', '{}', 1),
      ('00000000-0000-0000-0000-000000417112', '00000000-0000-0000-0000-000000417d03', '{}', 1),
      ('00000000-0000-0000-0000-000000417113', '00000000-0000-0000-0000-000000417d01', '{}', 1),
      ('00000000-0000-0000-0000-000000417114', '00000000-0000-0000-0000-000000417d02', '{}', 1))
      as v(id, folder, tags, version);
insert into public.items (id, bank_id, org_id, type, status, content, answer_key, scoring) values
  ('00000000-0000-0000-0000-000000417109', '00000000-0000-0000-0000-000000417b09',
   '00000000-0000-0000-0000-000000417f02', 'multiple_choice', 'draft', '{}', '{}', '{}');
insert into public.item_versions (item_id, version, org_id, snapshot)
  select v.id::uuid, v.version, '00000000-0000-0000-0000-000000417f01', '{}'
    from (values ('00000000-0000-0000-0000-000000417101', 1), ('00000000-0000-0000-0000-000000417101', 2),
                 ('00000000-0000-0000-0000-000000417103', 1), ('00000000-0000-0000-0000-000000417103', 2))
      as v(id, version);

-- c1 in Cardiac with steps s1, s2; c2 in no folder with step s3; c3 in Heart failure with step s4,
-- archived once its step is placed.
insert into public.case_studies (id, bank_id, org_id, folder_id, title, ehr, status) values
  ('00000000-0000-0000-0000-000000417c01', '00000000-0000-0000-0000-000000417b01',
   '00000000-0000-0000-0000-000000417f01', '00000000-0000-0000-0000-000000417d01', 'Chest pain', '{}', 'draft'),
  ('00000000-0000-0000-0000-000000417c02', '00000000-0000-0000-0000-000000417b01',
   '00000000-0000-0000-0000-000000417f01', null, 'Sepsis', '{}', 'draft'),
  ('00000000-0000-0000-0000-000000417c03', '00000000-0000-0000-0000-000000417b01',
   '00000000-0000-0000-0000-000000417f01', '00000000-0000-0000-0000-000000417d02', 'Old heart failure', '{}', 'draft');
insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id) values
  ('00000000-0000-0000-0000-000000417c01', '00000000-0000-0000-0000-000000417f01',
   '00000000-0000-0000-0000-000000417b01', 1, '00000000-0000-0000-0000-000000417111'),
  ('00000000-0000-0000-0000-000000417c01', '00000000-0000-0000-0000-000000417f01',
   '00000000-0000-0000-0000-000000417b01', 2, '00000000-0000-0000-0000-000000417112'),
  ('00000000-0000-0000-0000-000000417c02', '00000000-0000-0000-0000-000000417f01',
   '00000000-0000-0000-0000-000000417b01', 1, '00000000-0000-0000-0000-000000417113'),
  ('00000000-0000-0000-0000-000000417c03', '00000000-0000-0000-0000-000000417f01',
   '00000000-0000-0000-0000-000000417b01', 1, '00000000-0000-0000-0000-000000417114');
update public.case_studies set status = 'archived', archived_from = 'draft'
 where id = '00000000-0000-0000-0000-000000417c03';

-- An assignment of the source quiz, made before any move: its snapshot holds every published
-- question there, i4 among them.
insert into public.classes (id, org_id, name) values
  ('00000000-0000-0000-0000-000000417a01', '00000000-0000-0000-0000-000000417f01', 'NUR 310');
insert into public.class_members (class_id, profile_id) values
  ('00000000-0000-0000-0000-000000417a01', '00000000-0000-0000-0000-000000417ccc');
insert into public.assignments (id, org_id, class_id, bank_id, title, opens_at, closes_at, max_attempts)
values ('00000000-0000-0000-0000-000000417a02', '00000000-0000-0000-0000-000000417f01',
        '00000000-0000-0000-0000-000000417a01', '00000000-0000-0000-0000-000000417b01', 'Everything',
        now() - interval '1 hour', now() + interval '1 day', 1);

create temporary table ids (name text primary key, id uuid, result jsonb);
grant all on ids to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Privileges
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.move_to_quiz(uuid, uuid, uuid[], uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.turn_folder_into_quiz(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.move_quiz_content(uuid, uuid, uuid[], uuid[])', 'EXECUTE'),
  'anon cannot move anything'
);
select ok(
  has_function_privilege('authenticated', 'public.move_to_quiz(uuid, uuid, uuid[], uuid[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.turn_folder_into_quiz(uuid)', 'EXECUTE'),
  'a signed-in user can call both'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.move_to_quiz(uuid, uuid, uuid[], uuid[])'::regprocedure)
  and not (select prosecdef from pg_proc where oid = 'public.turn_folder_into_quiz(uuid)'::regprocedure)
  and not (select prosecdef from pg_proc
            where oid = 'private.move_quiz_content(uuid, uuid, uuid[], uuid[])'::regprocedure),
  'all three are security invoker, so RLS decides what a caller can move'
);

-- ---------------------------------------------------------------------------
-- 2. Across workspaces, and a student
-- ---------------------------------------------------------------------------

set local role authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-000000417bbb');
select throws_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b01',
       '00000000-0000-0000-0000-000000417b09', '{00000000-0000-0000-0000-000000417104}', '{}') $$,
  'P0002', null,
  'another workspace''s teacher cannot move a question out of this workspace'
);
select throws_ok(
  $$ select public.turn_folder_into_quiz('00000000-0000-0000-0000-000000417d03') $$,
  'P0002', null,
  'nor turn its folder into a quiz'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000417aaa');
select throws_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b01',
       '00000000-0000-0000-0000-000000417b09', '{00000000-0000-0000-0000-000000417104}', '{}') $$,
  'P0002', null,
  'a teacher cannot move a question into another workspace''s quiz'
);
select throws_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b09',
       '00000000-0000-0000-0000-000000417b02', '{00000000-0000-0000-0000-000000417109}', '{}') $$,
  'P0002', null,
  'nor take one from another workspace''s quiz'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000417ccc');
select throws_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b01',
       '00000000-0000-0000-0000-000000417b02', '{00000000-0000-0000-0000-000000417104}', '{}') $$,
  'P0002', null,
  'a student in the workspace moves nothing'
);

reset role;
select is(
  (select array_agg(bank_id::text order by id) from public.items
    where id in ('00000000-0000-0000-0000-000000417104', '00000000-0000-0000-0000-000000417109')),
  array['00000000-0000-0000-0000-000000417b01', '00000000-0000-0000-0000-000000417b09']::text[],
  'after all of that, both questions are where they were'
);
select is(
  (select count(*)::int from public.bank_folders where id = '00000000-0000-0000-0000-000000417d03'),
  1,
  'and the folder is still there'
);

-- ---------------------------------------------------------------------------
-- 3. Refusals leave both quizzes as they were
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000417aaa');

select throws_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b01',
       '00000000-0000-0000-0000-000000417b02',
       array(select gen_random_uuid() from generate_series(1, 201)), '{}') $$,
  '22023', null,
  'a move carries at most 200'
);
select lives_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b01',
       '00000000-0000-0000-0000-000000417b02', '{00000000-0000-0000-0000-000000417104}',
       array(select gen_random_uuid() from generate_series(1, 0))) $$,
  'the cap counts what is chosen, so one question is fine'
);
-- Put it back for the tests that follow.
select lives_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b02',
       '00000000-0000-0000-0000-000000417b01', '{00000000-0000-0000-0000-000000417104}', '{}') $$,
  'and it moves back'
);
select throws_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b01',
       '00000000-0000-0000-0000-000000417b01', '{00000000-0000-0000-0000-000000417104}', '{}') $$,
  '22023', null,
  'a quiz cannot be moved into itself'
);
select throws_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b01',
       '00000000-0000-0000-0000-000000417b02',
       '{00000000-0000-0000-0000-000000417104, 00000000-0000-0000-0000-000000417999}', '{}') $$,
  'P0002', null,
  'a move naming one question that is not in the quiz is refused whole'
);
select throws_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b01',
       '00000000-0000-0000-0000-000000417b02', '{00000000-0000-0000-0000-000000417104}',
       '{00000000-0000-0000-0000-000000417c99}') $$,
  'P0002', null,
  'and so is one naming a case study that is not'
);
select throws_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b01',
       '00000000-0000-0000-0000-000000417b02',
       '{00000000-0000-0000-0000-000000417104, 00000000-0000-0000-0000-000000417113}', '{}') $$,
  '2BP01', 'this question is step 1 of the case study "Sepsis"',
  'a step without its case study is refused, naming the case study'
);
select is(
  (select array_agg(bank_id::text) from public.items
    where id in ('00000000-0000-0000-0000-000000417104', '00000000-0000-0000-0000-000000417113')),
  array['00000000-0000-0000-0000-000000417b01', '00000000-0000-0000-0000-000000417b01']::text[],
  'after every refusal, nothing chosen has left the source quiz'
);
select is(
  (select count(*)::int from public.items where bank_id = '00000000-0000-0000-0000-000000417b02'),
  0,
  'and nothing has reached the target'
);
select throws_ok(
  $$ select public.turn_folder_into_quiz('00000000-0000-0000-0000-000000417d04') $$,
  '22023', null,
  'an empty folder does not become a quiz'
);
select is(
  (select count(*)::int from public.bank_folders where id = '00000000-0000-0000-0000-000000417d04'),
  1,
  'and it is still there'
);

-- ---------------------------------------------------------------------------
-- 4. Moving questions and a case study
-- ---------------------------------------------------------------------------

reset role;
-- The limit charges once per transaction, and this file is one transaction: start the count over.
delete from private.rate_limits where user_id = '00000000-0000-0000-0000-000000417aaa';
select set_config('learn.authoring_charge', '', true);
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000417aaa');

insert into ids
  select 'two questions', null, public.move_to_quiz('00000000-0000-0000-0000-000000417b01',
    '00000000-0000-0000-0000-000000417b02',
    '{00000000-0000-0000-0000-000000417103, 00000000-0000-0000-0000-000000417104}', '{}');
select is(
  (select result from ids where name = 'two questions'),
  '{"items": 2, "case_studies": 0, "steps": 0}'::jsonb,
  'two questions move to another quiz'
);
select is(
  (select array_agg(bank_id::text) from public.items
    where id in ('00000000-0000-0000-0000-000000417103', '00000000-0000-0000-0000-000000417104')),
  array['00000000-0000-0000-0000-000000417b02', '00000000-0000-0000-0000-000000417b02']::text[],
  'both are in the target quiz, under the ids they had'
);
select is(
  (select folder_id from public.items where id = '00000000-0000-0000-0000-000000417103'),
  null,
  'the one that was in a folder of the source quiz is in no folder now'
);
select is(
  (select array_agg(version order by version) from public.item_versions
    where item_id = '00000000-0000-0000-0000-000000417103'),
  array[1, 2],
  'its version history follows it'
);
select is(
  (select (tags, version) from public.items where id = '00000000-0000-0000-0000-000000417103')::text,
  ('{renal,"lab values"}'::text[], 2)::text,
  'its tags and version are unchanged'
);
select is(
  (select bank_id from public.items where id = '00000000-0000-0000-0000-000000417101'),
  '00000000-0000-0000-0000-000000417b01'::uuid,
  'a question not chosen stays where it was'
);
reset role;
select is(
  (select calls from private.rate_limits
    where user_id = '00000000-0000-0000-0000-000000417aaa' and action = 'save'),
  1,
  'a move spends one save on the authoring limit'
);
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000417aaa');

-- ---------------------------------------------------------------------------
-- 5. Turning Cardiac, with Heart failure inside it, into a quiz
-- ---------------------------------------------------------------------------

insert into ids
  select 'cardiac', null, public.turn_folder_into_quiz('00000000-0000-0000-0000-000000417d01');
update ids set id = (result ->> 'quiz')::uuid where name = 'cardiac';

select is(
  (select result - 'quiz' from ids where name = 'cardiac'),
  '{"items": 2, "case_studies": 2, "steps": 3, "name": "Cardiac (2)"}'::jsonb,
  'the folder becomes a quiz with its two questions and two case studies, and their three steps'
);
select is(
  (select name from public.item_banks where id = (select id from ids where name = 'cardiac')),
  'Cardiac (2)',
  'named after the folder, with a number because a quiz is called "cardiac" already'
);
select is(
  (select library_folder_id from public.item_banks where id = (select id from ids where name = 'cardiac')),
  '00000000-0000-0000-0000-000000417e01'::uuid,
  'filed beside the original, in the same library folder'
);
select is(
  (select created_by from public.item_banks where id = (select id from ids where name = 'cardiac')),
  '00000000-0000-0000-0000-000000417aaa'::uuid,
  'made by the teacher who asked'
);
select is(
  (select array_agg(id::text order by id) from public.items
    where bank_id = (select id from ids where name = 'cardiac')),
  array['00000000-0000-0000-0000-000000417101', '00000000-0000-0000-0000-000000417102',
        '00000000-0000-0000-0000-000000417111', '00000000-0000-0000-0000-000000417112',
        '00000000-0000-0000-0000-000000417114']::text[],
  'it holds the folder''s question, its subfolder''s question, and the steps of its case studies'
);
select is(
  (select count(*)::int from public.items
    where bank_id = (select id from ids where name = 'cardiac') and folder_id is not null),
  0,
  'everything in it is in no folder: subfolders are flattened'
);
select is(
  (select count(*)::int from public.bank_folders
    where bank_id = (select id from ids where name = 'cardiac')),
  0,
  'and the new quiz has no folders inside it'
);
select is(
  (select array_agg(id::text order by id) from public.case_studies
    where bank_id = (select id from ids where name = 'cardiac')),
  array['00000000-0000-0000-0000-000000417c01', '00000000-0000-0000-0000-000000417c03']::text[],
  'both case studies moved, the archived one too'
);
select is(
  (select status::text from public.case_studies where id = '00000000-0000-0000-0000-000000417c03'),
  'archived',
  'the archived case study is still archived'
);
select is(
  (select array_agg(item_id::text order by position) from public.case_study_items
    where case_study_id = '00000000-0000-0000-0000-000000417c01'
      and bank_id = (select id from ids where name = 'cardiac')),
  array['00000000-0000-0000-0000-000000417111', '00000000-0000-0000-0000-000000417112']::text[],
  'a case study keeps its steps, in order, though they were filed in another folder'
);
select is(
  (select (bank_id, folder_id)::text from public.items where id = '00000000-0000-0000-0000-000000417113'),
  ('00000000-0000-0000-0000-000000417b01'::uuid, null::uuid)::text,
  'a step filed in the folder whose case study stays behind stays too, in no folder'
);
select is(
  (select array_agg(name order by name) from public.bank_folders
    where bank_id = '00000000-0000-0000-0000-000000417b01'),
  array['Nothing here', 'Renal'],
  'the folder and the folder inside it are gone; the others are not'
);
select is(
  (select array_agg(version order by version) from public.item_versions
    where item_id = '00000000-0000-0000-0000-000000417101'),
  array[1, 2],
  'version history follows a question into the new quiz'
);
select is(
  (select tags from public.items where id = '00000000-0000-0000-0000-000000417101'),
  array['cardiac'],
  'and so do its tags'
);

-- ---------------------------------------------------------------------------
-- 4, continued. A case study moves whole
-- ---------------------------------------------------------------------------

insert into ids
  select 'sepsis', null, public.move_to_quiz('00000000-0000-0000-0000-000000417b01',
    '00000000-0000-0000-0000-000000417b02', '{}', '{00000000-0000-0000-0000-000000417c02}');
select is(
  (select result from ids where name = 'sepsis'),
  '{"items": 0, "case_studies": 1, "steps": 1}'::jsonb,
  'a case study moves to another quiz'
);
select is(
  (select array[cs.bank_id, i.bank_id, csi.bank_id]::text[]
     from public.case_studies cs
     join public.case_study_items csi on csi.case_study_id = cs.id
     join public.items i on i.id = csi.item_id
    where cs.id = '00000000-0000-0000-0000-000000417c02'),
  array['00000000-0000-0000-0000-000000417b02', '00000000-0000-0000-0000-000000417b02',
        '00000000-0000-0000-0000-000000417b02']::text[],
  'with its step, in one move'
);
select lives_ok(
  $$ select public.move_to_quiz('00000000-0000-0000-0000-000000417b02',
       '00000000-0000-0000-0000-000000417b01', '{00000000-0000-0000-0000-000000417113}',
       '{00000000-0000-0000-0000-000000417c02}') $$,
  'choosing a case study and its step together is the same as choosing the case study'
);
select is(
  (select bank_id from public.case_studies where id = '00000000-0000-0000-0000-000000417c02'),
  '00000000-0000-0000-0000-000000417b01'::uuid,
  'and it is back'
);

-- The last folders go: the source quiz then has none left inside it.
select lives_ok(
  $$ select public.turn_folder_into_quiz('00000000-0000-0000-0000-000000417d03') $$,
  'Renal becomes a quiz too'
);
select is(
  (select name from public.item_banks where id = (
     select bank_id from public.items where id = '00000000-0000-0000-0000-000000417111')),
  'Cardiac (2)',
  'the steps it held went with their case study earlier, not with Renal'
);
reset role;
delete from public.bank_folders where id = '00000000-0000-0000-0000-000000417d04';
select is(
  (select count(*)::int from public.bank_folders where bank_id = '00000000-0000-0000-0000-000000417b01'),
  0,
  'the source quiz has no folders left inside it'
);

-- ---------------------------------------------------------------------------
-- 6. An assignment made before the move
-- ---------------------------------------------------------------------------

select ok(
  (select item_set ? '00000000-0000-0000-0000-000000417104'
     from public.assignments where id = '00000000-0000-0000-0000-000000417a02'),
  'the assignment''s snapshot still names the moved question'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000417ccc');
insert into ids
  select 'attempt', attempt_id, null
    from public.start_assignment_attempt('00000000-0000-0000-0000-000000417a02');
select isnt((select id from ids where name = 'attempt'), null, 'the student still opens it');
select is(
  (select refusal from public.save_attempt_response(
     (select id from ids where name = 'attempt'), '00000000-0000-0000-0000-000000417104',
     '{"type":"multiple_choice","selectedOptionId":"key_417"}')),
  null,
  'and saves an answer to the moved question'
);
select is(
  (select item_set ? '00000000-0000-0000-0000-000000417104'
     from public.begin_attempt_submission((select id from ids where name = 'attempt'))),
  true,
  'the submit hands the server the moved question to score'
);

reset role;
set local role service_role;
select is(
  (select answer_key ->> 'correctOptionId' from public.items
    where id = '00000000-0000-0000-0000-000000417104'),
  'key_417',
  'and the server reads it, with its key, by the same id'
);
reset role;

select * from finish();
rollback;
