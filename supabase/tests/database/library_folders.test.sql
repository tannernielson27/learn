-- Library folders (#411): folders that hold quizzes, one tree per workspace.
--
-- What is held here:
--   1. Structure and privileges: RLS on; no truncate, references or trigger; a folder is inserted
--      with its workspace, parent and name only, and only its name is updated; anon has nothing.
--   2. As a teacher: create, nest two deep and no deeper, sibling names unique whatever their case,
--      rename; file a quiz, move it between folders and out of every folder; a folder holding a
--      quiz or a folder cannot be deleted, and the quiz is still there; an empty one can.
--   3. Across workspaces: another workspace's teacher sees neither the folders nor their quizzes,
--      cannot write to them, cannot file a quiz of theirs in them, and cannot nest under them.
--      A student in the same workspace sees nothing.
--   4. The workspace's end: deleting a workspace with filed quizzes deletes its folders too, and a
--      folder left in a workspace by a teacher who moved away stops that account's sweep.
--
-- Runs with `pnpm test:db`. Fixture ids of its own (…411xxx); the closing rollback removes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- ---------------------------------------------------------------------------
-- Fixtures, as the superuser
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-000000411aaa', 'lib-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000411bbb', 'lib-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000411ccc', 'lib-c@example.test', 'authenticated', 'authenticated');

-- A is a teacher in the seeded workspace; B a teacher in a second one; C a student beside A.
insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-000000411f02', 'Other library'),
  ('00000000-0000-0000-0000-000000411f03', 'Library to delete');
update public.profiles
  set org_id = (select id from public.orgs order by created_at, id limit 1), role = 'instructor'
  where id in ('00000000-0000-0000-0000-000000411aaa', '00000000-0000-0000-0000-000000411ccc');
update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-000000411ccc';
update public.profiles set org_id = '00000000-0000-0000-0000-000000411f02', role = 'instructor'
  where id = '00000000-0000-0000-0000-000000411bbb';

create temporary table lib_ids as
  select org_id as org_a from public.profiles where id = '00000000-0000-0000-0000-000000411aaa';
grant select on lib_ids to authenticated, anon;

insert into public.item_banks (id, org_id, name)
  select q.id, l.org_a, q.name
    from lib_ids l,
         (values ('00000000-0000-0000-0000-000000411b01'::uuid, 'Cardiac week'),
                 ('00000000-0000-0000-0000-000000411b02'::uuid, 'Renal week')) as q(id, name);
insert into public.item_banks (id, org_id, name) values
  ('00000000-0000-0000-0000-000000411b03', '00000000-0000-0000-0000-000000411f02', 'Other quiz');

-- ---------------------------------------------------------------------------
-- 1. Structure and privileges
-- ---------------------------------------------------------------------------

select has_table('public', 'library_folders', 'library_folders exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.library_folders'::regclass),
  'RLS is enabled on library_folders'
);
select ok(
  not has_table_privilege('authenticated', 'public.library_folders', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.library_folders', 'REFERENCES')
  and not has_table_privilege('authenticated', 'public.library_folders', 'TRIGGER'),
  'signed-in users have no truncate, references or trigger privilege on library_folders'
);
select ok(
  not has_column_privilege('authenticated', 'public.library_folders', 'depth', 'INSERT')
  and not has_column_privilege('authenticated', 'public.library_folders', 'created_by', 'INSERT')
  and not has_column_privilege('authenticated', 'public.library_folders', 'id', 'INSERT'),
  'a folder''s depth, maker and id are never the caller''s to write'
);
select ok(
  has_column_privilege('authenticated', 'public.library_folders', 'name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.library_folders', 'parent_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.library_folders', 'org_id', 'UPDATE'),
  'only a folder''s name can be updated'
);
select ok(
  not has_table_privilege('anon', 'public.library_folders', 'SELECT')
  and not has_table_privilege('anon', 'public.library_folders', 'INSERT'),
  'anon has no privilege on library_folders'
);
select has_index('public', 'item_banks', 'item_banks_library_folder_idx',
  array['library_folder_id', 'org_id'], 'quizzes are indexed by folder and workspace');

-- ---------------------------------------------------------------------------
-- 2. As A, a teacher in the folders' workspace
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000411aaa","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.library_folders (org_id, name) select org_a, 'Med-Surg' from lib_ids $$,
  'A can create a folder at the top of the library'
);
-- Ids are not the caller's to write, so fixtures are found by name from here on.
select is(
  (select created_by from public.library_folders where name = 'Med-Surg'),
  '00000000-0000-0000-0000-000000411aaa'::uuid,
  'a folder is made by the caller, without the caller saying so'
);
select lives_ok(
  $$ insert into public.library_folders (org_id, parent_id, name)
     select org_a, (select id from public.library_folders where name = 'Med-Surg'), 'Week 1'
       from lib_ids $$,
  'A can create a folder inside a folder'
);
select is(
  (select depth::int from public.library_folders where name = 'Week 1'),
  2,
  'a folder inside a folder is two deep'
);
select throws_ok(
  $$ insert into public.library_folders (org_id, parent_id, name)
     select org_a, (select id from public.library_folders where name = 'Week 1'), 'Monday'
       from lib_ids $$,
  '23514', null,
  'folders go at most two deep'
);
select throws_ok(
  $$ insert into public.library_folders (org_id, name) select org_a, 'med-SURG' from lib_ids $$,
  '23505', null,
  'two folders side by side cannot share a name, whatever its case'
);
select lives_ok(
  $$ insert into public.library_folders (org_id, name) select org_a, 'Pediatrics' from lib_ids $$,
  'A can create a second top-level folder'
);
select lives_ok(
  $$ insert into public.library_folders (org_id, parent_id, name)
     select org_a, (select id from public.library_folders where name = 'Pediatrics'), 'week 1'
       from lib_ids $$,
  'folders in different places can share a name'
);
select throws_ok(
  $$ insert into public.library_folders (org_id, name) select org_a, 'Med/Surg' from lib_ids $$,
  '23514', null,
  'a folder name cannot contain a slash'
);
select throws_ok(
  $$ insert into public.library_folders (org_id, name, depth) select org_a, 'Deep', 2 from lib_ids $$,
  '42501', null,
  'a caller cannot set a folder''s depth'
);
select throws_ok(
  $$ update public.library_folders
        set parent_id = (select id from public.library_folders where name = 'Pediatrics')
      where name = 'Week 1' $$,
  '42501', null,
  'a folder cannot be moved'
);
select lives_ok(
  $$ update public.library_folders set name = 'Medical-Surgical' where name = 'Med-Surg' $$,
  'A can rename a folder'
);

-- Filing quizzes.
select lives_ok(
  $$ update public.item_banks set library_folder_id = (select id from public.library_folders where name = 'Medical-Surgical')
      where id = '00000000-0000-0000-0000-000000411b01' $$,
  'A can put a quiz in a folder'
);
select lives_ok(
  $$ update public.item_banks
        set library_folder_id = (select id from public.library_folders where name = 'Week 1')
      where id = '00000000-0000-0000-0000-000000411b02' $$,
  'A can put a quiz in a folder inside a folder'
);
select lives_ok(
  $$ update public.item_banks
        set library_folder_id = (select id from public.library_folders where name = 'Pediatrics')
      where id = '00000000-0000-0000-0000-000000411b01' $$,
  'A can move a quiz from one folder to another'
);
select is(
  (select f.name from public.item_banks b join public.library_folders f on f.id = b.library_folder_id
    where b.id = '00000000-0000-0000-0000-000000411b01'),
  'Pediatrics',
  'the moved quiz is in its new folder, and in no other'
);
select lives_ok(
  $$ update public.item_banks set library_folder_id = null
      where id = '00000000-0000-0000-0000-000000411b01' $$,
  'A can take a quiz out of every folder'
);

-- Deleting.
select throws_ok(
  $$ delete from public.library_folders where name = 'Week 1' $$,
  '23503', null,
  'a folder holding a quiz cannot be deleted'
);
select is(
  (select library_folder_id from public.item_banks where id = '00000000-0000-0000-0000-000000411b02'),
  (select id from public.library_folders where name = 'Week 1'),
  'the refused delete left the quiz where it was'
);
select throws_ok(
  $$ delete from public.library_folders where name = 'Medical-Surgical' $$,
  '23503', null,
  'a folder holding a folder cannot be deleted'
);
select lives_ok(
  $$ insert into public.library_folders (org_id, name) select org_a, 'Spare' from lib_ids $$,
  'A can create an empty folder'
);
with gone as (delete from public.library_folders where name = 'Spare' returning 1)
select is(count(*)::int, 1, 'an empty folder can be deleted') from gone;

-- ---------------------------------------------------------------------------
-- 3. Across workspaces
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000411bbb","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.library_folders f join lib_ids l on f.org_id = l.org_a),
  0,
  'a teacher in another workspace sees none of its folders'
);
select is(
  (select count(*)::int from public.item_banks
    where id in ('00000000-0000-0000-0000-000000411b01', '00000000-0000-0000-0000-000000411b02')),
  0,
  'a teacher in another workspace sees none of its quizzes'
);
select throws_ok(
  $$ insert into public.library_folders (org_id, name) select org_a, 'Planted' from lib_ids $$,
  '42501', null,
  'a teacher cannot create a folder in another workspace'
);
with renamed as (
  update public.library_folders set name = 'Taken' where name = 'Pediatrics' returning 1
)
select is(count(*)::int, 0, 'a teacher cannot rename another workspace''s folder') from renamed;
with gone as (delete from public.library_folders where name = 'Pediatrics' returning 1)
select is(count(*)::int, 0, 'a teacher cannot delete another workspace''s folder') from gone;
select lives_ok(
  $$ insert into public.library_folders (org_id, name)
     values ('00000000-0000-0000-0000-000000411f02', 'Own folder') $$,
  'a teacher in the other workspace has a library of their own'
);
reset role;
create temporary table lib_other as
  select id from public.library_folders where name = 'Pediatrics';
grant select on lib_other to authenticated;
set local role authenticated;
select throws_ok(
  $$ update public.item_banks set library_folder_id = (select id from lib_other)
      where id = '00000000-0000-0000-0000-000000411b03' $$,
  '23503', null,
  'a quiz cannot be put in another workspace''s folder'
);
select throws_ok(
  $$ insert into public.library_folders (org_id, parent_id, name)
     select '00000000-0000-0000-0000-000000411f02', id, 'Nested' from lib_other $$,
  '23503', null,
  'a folder cannot be made inside another workspace''s folder'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000411aaa","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.library_folders where name = 'Own folder'),
  0,
  'nor does A see the other workspace''s folders'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000411ccc","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.library_folders),
  0,
  'a student sees no folders, even in their own workspace'
);
select throws_ok(
  $$ insert into public.library_folders (org_id, name) select org_a, 'Student folder' from lib_ids $$,
  '42501', null,
  'a student cannot create a folder'
);
select set_config('request.jwt.claims', '{}', true);

set local role anon;
select throws_ok(
  $$ select 1 from public.library_folders $$,
  '42501', null,
  'anon cannot read library folders'
);
reset role;

select is(
  (select name from public.library_folders where id = (select id from lib_other)),
  'Pediatrics',
  'the other teacher''s rename changed nothing'
);
select is(
  (select library_folder_id from public.item_banks where id = '00000000-0000-0000-0000-000000411b03'),
  null::uuid,
  'the other workspace''s quiz is still in no folder'
);

-- ---------------------------------------------------------------------------
-- 4. The workspace's end, as the superuser
-- ---------------------------------------------------------------------------

insert into public.library_folders (id, org_id, name) values
  ('00000000-0000-0000-0000-000000411d01', '00000000-0000-0000-0000-000000411f03', 'Term 1');
insert into public.library_folders (id, org_id, parent_id, name) values
  ('00000000-0000-0000-0000-000000411d02', '00000000-0000-0000-0000-000000411f03',
   '00000000-0000-0000-0000-000000411d01', 'Week 1');
insert into public.item_banks (id, org_id, name, library_folder_id) values
  ('00000000-0000-0000-0000-000000411b04', '00000000-0000-0000-0000-000000411f03', 'Filed',
   '00000000-0000-0000-0000-000000411d02');

-- In the sweep's order (sweep_one_workspace): the quizzes, then the workspace. Deleting the org
-- alone would rely on which of its two cascades fires first.
delete from public.item_banks where org_id = '00000000-0000-0000-0000-000000411f03';
select lives_ok(
  $$ delete from public.orgs where id = '00000000-0000-0000-0000-000000411f03' $$,
  'a workspace with folders and filed quizzes can be deleted'
);
select is(
  (select count(*)::int from public.library_folders
    where org_id = '00000000-0000-0000-0000-000000411f03'),
  0,
  'its folders went with it'
);

select is(
  private.sweep_account_tied_elsewhere('00000000-0000-0000-0000-000000411bbb',
    '00000000-0000-0000-0000-000000411f02'),
  false,
  'before: B is named by no row outside their workspace'
);
-- B made a folder in A's workspace, then moved away (ADR 0011).
insert into public.library_folders (org_id, name, created_by)
  select org_a, 'Left behind', '00000000-0000-0000-0000-000000411bbb' from lib_ids;
select is(
  private.sweep_account_tied_elsewhere('00000000-0000-0000-0000-000000411bbb',
    '00000000-0000-0000-0000-000000411f02'),
  true,
  'a folder B made in another workspace stops the sweep deleting B''s account'
);

select * from finish();
rollback;
