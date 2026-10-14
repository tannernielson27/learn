-- Moving questions between quizzes, and turning an in-quiz folder into a quiz (#417).
--
-- Before #411, a teacher's only way to organise was folders inside one quiz (bank_folders). Those
-- quizzes are really several quizzes. Two calls let a teacher split them, and nothing runs unless
-- the teacher asks:
--
--   * public.move_to_quiz: selected questions and case studies move to another quiz in the same
--     workspace, at most 200 at a time (move_to_folder's line).
--   * public.turn_folder_into_quiz: an in-quiz folder becomes a new quiz with the folder's name,
--     filed beside the original in the library, holding the folder's content and its subfolders'.
--
-- ---------------------------------------------------------------------------
-- What a move changes, and what it leaves alone
-- ---------------------------------------------------------------------------
--
-- A move rewrites bank_id and clears folder_id, and nothing else. The question keeps its id, and
-- everything that refers to a question refers to it by id:
--   * item_versions (item_id, org_id), so version history follows;
--   * items.tags is a column of the row, so tags follow;
--   * assignments.item_set and sessions.item_set are arrays of ids taken when they were made, and
--     attempts, reports and live answers read items by id (attempt_responses, session_responses,
--     src/lib/supabase/attempts.ts readSetItems). An assignment or a live session made before a move
--     keeps the questions it was given and still scores them;
--   * a practice run opened since #271 recorded its items (practice_item_snapshots, keyed by item
--     and org), so it is unchanged. A practice share points at a quiz, so it stays with the
--     original quiz; an older, unfrozen run reads the quiz's current questions, and a moved one
--     leaves it.
-- folder_id is cleared because it names a folder of the source quiz (items_folder_bank_fkey keeps
-- folder_id and bank_id together), and a moved question lands in the target's "Not in a folder".
--
-- ---------------------------------------------------------------------------
-- Case studies and their steps
-- ---------------------------------------------------------------------------
--
-- A case study's steps are questions in the same quiz, held there by case_study_items' composite
-- keys (item_id, bank_id) and (case_study_id, bank_id). So:
--   * moving a case study moves its steps with it, in the same statement;
--   * moving a step on its own is refused (2BP01, naming the case study, as archiving a step is).
--     Moving the whole case study instead would move more than the teacher chose, and a step on
--     its own in another quiz cannot exist.
-- The three tables are updated by one statement (data-modifying CTEs), because the composite keys
-- are not deferrable: a key is checked when its statement ends, and only at the end of the one
-- statement do the case study, its steps and the step rows all name the new quiz.
-- private.guard_archived_step is relaxed for that one update: a row whose step, position, case
-- study and workspace are unchanged is not a placement, so an archived case study moves too.
--
-- ---------------------------------------------------------------------------
-- Turning a folder into a quiz
-- ---------------------------------------------------------------------------
--
--   * The new quiz takes the folder's name. If a quiz in the workspace already has that name
--     (whatever its case), " (2)", " (3)", ... is added, so the library never shows two quizzes
--     that read the same.
--   * It is filed where the original quiz is filed (item_banks.library_folder_id, #411), or in no
--     folder when the original is in none.
--   * Subfolders are flattened: everything in the folder and the folders inside it lands in the new
--     quiz's "Not in a folder". #411 decided a new quiz has no folders inside it.
--   * Content follows its case study: a case study in the folder takes its steps wherever they are
--     filed, and a step filed in the folder whose case study is elsewhere stays with its case
--     study, now in no folder.
--   * The folder and its subfolders are then deleted; they are empty. When a quiz's last folder
--     goes, its page stops offering folder controls (src/lib/authoring/folders.ts
--     offersInQuizFolders).
--   * A folder that holds no questions or case studies of its own is refused (22023): there is
--     nothing to make a quiz of, and deleting an empty folder is already offered.
--   * There is no count limit: the work is bounded by what one quiz holds.
--
-- ---------------------------------------------------------------------------
-- All or nothing, security and the authoring limit
-- ---------------------------------------------------------------------------
--
-- Each is one call, so one transaction: a refusal or an error anywhere leaves both quizzes as
-- they were. Content that is not where the caller said it is (gone, moved, another quiz) refuses
-- the whole call rather than moving part of it.
--
-- Security invoker, as move_to_folder: RLS decides what the caller can see and change. Another
-- workspace's quiz, folder or content reads as not found (P0002), and a student sees none. The
-- composite key items_bank_org_fkey (bank_id, org_id) also refuses a quiz in another workspace,
-- whatever RLS shows. private.move_quiz_content is in the private schema, which the Data API does
-- not expose; it is granted to authenticated only because the two invoker functions call it.
--
-- Each call spends one `save` on the authoring limit (#123), taken first, the way
-- start_case_study_step takes `step`. Without it, the per-row triggers would charge `publish` when
-- the first row moved is published, and a move is not a publish.
--
-- Deploy order: the app may reach a database without this migration. src/lib/authoring/quizMove.ts
-- reads a missing function as "not ready yet" and says so; nothing else on the page calls it.
-- Safe to replay on a fresh project: one function replaced with the same signature, three new.

-- ---------------------------------------------------------------------------
-- A step whose placement is unchanged is not a placement
-- ---------------------------------------------------------------------------

-- 20260919160000's function, with the first test added. Every other write is checked as before.
create or replace function private.guard_archived_step() returns trigger
language plpgsql set search_path = ''
as $$
declare
  item_status public.content_status;
  case_status public.content_status;
begin
  -- #417: a move to another quiz rewrites only bank_id. The case study keeps the same steps in the
  -- same order, so neither "placing an archived item" nor "changing an archived case study" is
  -- happening, and the lookups below would only read rows the same statement is moving.
  if tg_op = 'UPDATE'
     and new.bank_id is distinct from old.bank_id
     and (new.case_study_id, new.position, new.item_id, new.org_id)
         is not distinct from (old.case_study_id, old.position, old.item_id, old.org_id) then
    return new;
  end if;

  select i.status into item_status from public.items i where i.id = new.item_id for share;
  if item_status = 'archived' then
    raise exception 'that item is archived; restore it before placing it as a step'
      using errcode = '55000';
  end if;
  select cs.status into case_status from public.case_studies cs where cs.id = new.case_study_id;
  if case_status = 'archived' then
    raise exception 'this case study is archived; restore it first' using errcode = '55000';
  end if;
  return new;
end
$$;

revoke all on function private.guard_archived_step() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The move itself, shared by both calls
-- ---------------------------------------------------------------------------

-- Moves questions and case studies (with their steps) from one quiz to another, all or nothing.
-- The callers have checked both quizzes. Locks are taken steps first, then case studies, then
-- questions, each in id order: place_case_study_step and reorder_case_study_steps lock steps
-- before anything else, and two overlapping moves take rows in the same order.
-- Granted to authenticated only because the two invoker functions call it as the caller. The Data
-- API does not expose `private`; a direct SQL caller would skip the 200 line and the charge, which
-- is why the same-quiz check is restated here.
create function private.move_quiz_content(
  source_bank uuid,
  target_bank uuid,
  item_ids uuid[],
  case_study_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  wanted_items uuid[] := array(
    select distinct x from unnest(coalesce(item_ids, '{}')) x where x is not null
  );
  wanted_cases uuid[] := array(
    select distinct x from unnest(coalesce(case_study_ids, '{}')) x where x is not null
  );
  step_ids uuid[];
  all_items uuid[];
  found_count integer;
  lone_position smallint;
  lone_title text;
  moved_cases integer;
  moved_items integer;
  chosen_items integer;
begin
  if source_bank is not distinct from target_bank then
    raise exception 'choose another quiz to move to' using errcode = '22023', hint = 'same';
  end if;

  perform 1 from public.case_study_items csi
   where csi.case_study_id = any (wanted_cases) and csi.bank_id = source_bank
   order by csi.case_study_id, csi.position
     for update of csi;

  select count(*) into found_count
    from (select cs.id from public.case_studies cs
           where cs.bank_id = source_bank and cs.id = any (wanted_cases)
           order by cs.id
             for update of cs) locked;
  if found_count <> cardinality(wanted_cases) then
    raise exception 'a case study chosen is no longer in this quiz'
      using errcode = 'P0002', hint = 'content';
  end if;

  select coalesce(array_agg(csi.item_id), '{}') into step_ids
    from public.case_study_items csi
   where csi.case_study_id = any (wanted_cases);

  -- A step moves only with its case study, and so does a step a moving case study shares with one
  -- that stays.
  select csi.position, cs.title into lone_position, lone_title
    from public.case_study_items csi
    join public.case_studies cs on cs.id = csi.case_study_id
   where csi.item_id = any (wanted_items || step_ids)
     and not (csi.case_study_id = any (wanted_cases))
   order by cs.title, cs.id
   limit 1;
  if found then
    raise exception 'this question is step % of the case study "%"', lone_position, lone_title
      using errcode = '2BP01', detail = lone_title, hint = lone_position::text;
  end if;

  all_items := array(select distinct x from unnest(wanted_items || step_ids) x);
  select count(*) into found_count
    from (select i.id from public.items i
           where i.bank_id = source_bank and i.id = any (all_items)
           order by i.id
             for update of i) locked;
  if found_count <> cardinality(all_items) then
    raise exception 'a question chosen is no longer in this quiz'
      using errcode = 'P0002', hint = 'content';
  end if;

  -- One statement, so the composite keys between the three tables are checked once, at its end,
  -- when every row names the target quiz. See the header.
  with moved_case_rows as (
    update public.case_studies
       set bank_id = target_bank, folder_id = null
     where bank_id = source_bank and id = any (wanted_cases)
    returning 1
  ),
  moved_item_rows as (
    update public.items
       set bank_id = target_bank, folder_id = null
     where bank_id = source_bank and id = any (all_items)
    returning 1
  ),
  moved_step_rows as (
    update public.case_study_items
       set bank_id = target_bank
     where bank_id = source_bank and case_study_id = any (wanted_cases)
    returning 1
  )
  select (select count(*) from moved_case_rows), (select count(*) from moved_item_rows)
    into moved_cases, moved_items
    from (select count(*) from moved_step_rows) steps_written;

  -- Questions chosen on their own, as against the steps their case studies carried.
  chosen_items := cardinality(array(select unnest(wanted_items) except select unnest(step_ids)));
  return jsonb_build_object(
    'items', chosen_items,
    'case_studies', moved_cases,
    'steps', moved_items - chosen_items
  );
end;
$$;

revoke all on function private.move_quiz_content(uuid, uuid, uuid[], uuid[]) from public, anon;
grant execute on function private.move_quiz_content(uuid, uuid, uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Move to another quiz
-- ---------------------------------------------------------------------------

-- Refusals: 22023 (more than 200, nothing chosen, or the same quiz; hint 'limit', 'empty',
-- 'same'), P0002 (a quiz the caller cannot see, hint 'quiz'; content not in the source quiz, hint
-- 'content'), 2BP01 (a step without its case study), 54000 (the authoring limit).
create function public.move_to_quiz(
  source_bank uuid,
  target_bank uuid,
  item_ids uuid[],
  case_study_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  chosen integer := coalesce(cardinality(item_ids), 0) + coalesce(cardinality(case_study_ids), 0);
  source_org uuid;
  target_org uuid;
begin
  -- The app moves at most 200 at a time; the function holds the same line for any caller.
  if chosen > 200 then
    raise exception 'a move carries at most 200 questions and case studies'
      using errcode = '22023', hint = 'limit';
  end if;
  if chosen = 0 then
    raise exception 'choose a question or case study to move' using errcode = '22023', hint = 'empty';
  end if;
  if source_bank is null or target_bank is null or source_bank = target_bank then
    raise exception 'choose another quiz to move to' using errcode = '22023', hint = 'same';
  end if;

  perform private.charge_authoring_action('save');

  select b.org_id into source_org from public.item_banks b where b.id = source_bank;
  select b.org_id into target_org from public.item_banks b where b.id = target_bank;
  if source_org is null or target_org is null or source_org <> target_org then
    raise exception 'that quiz does not exist in this workspace' using errcode = 'P0002', hint = 'quiz';
  end if;

  return private.move_quiz_content(source_bank, target_bank, item_ids, case_study_ids);
end;
$$;

revoke all on function public.move_to_quiz(uuid, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.move_to_quiz(uuid, uuid, uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Turn this folder into a quiz
-- ---------------------------------------------------------------------------

-- Returns the moved counts, with the new quiz's id and name. Refusals: P0002 (a folder the caller
-- cannot see, hint 'folder'), 22023 (nothing of its own in it, hint 'empty'), 54000.
create function public.turn_folder_into_quiz(target_folder uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_bank uuid;
  source_org uuid;
  folder_name text;
  filed_in uuid;
  tree uuid[];
  cases uuid[];
  loose uuid[];
  new_name text;
  suffix integer := 1;
  new_bank uuid;
  moved jsonb;
begin
  perform private.charge_authoring_action('save');

  select f.bank_id, f.org_id, f.name into source_bank, source_org, folder_name
    from public.bank_folders f
   where f.id = target_folder;
  if source_bank is null then
    raise exception 'that folder does not exist' using errcode = 'P0002', hint = 'folder';
  end if;

  -- The folder first, so no folder can be made inside it while the tree is read; then every folder
  -- inside it, in id order. Nothing can be filed in them, and no folder made inside them, until
  -- this commits (both take a key share on the folder row).
  perform 1 from public.bank_folders f where f.id = target_folder for update of f;
  with recursive inside (id) as (
    select target_folder
    union all
    select f.id from public.bank_folders f join inside on f.parent_id = inside.id
     where f.bank_id = source_bank
  )
  select array_agg(id) into tree from inside;
  perform 1 from public.bank_folders f where f.id = any (tree) order by f.id for update of f;

  select b.library_folder_id into filed_in from public.item_banks b where b.id = source_bank;

  select coalesce(array_agg(cs.id), '{}') into cases
    from public.case_studies cs
   where cs.bank_id = source_bank and cs.folder_id = any (tree);
  -- Questions of its own: a step goes with its case study, wherever that is.
  select coalesce(array_agg(i.id), '{}') into loose
    from public.items i
   where i.bank_id = source_bank and i.folder_id = any (tree)
     and not exists (select 1 from public.case_study_items csi where csi.item_id = i.id);
  if cardinality(cases) + cardinality(loose) = 0 then
    raise exception 'that folder holds no questions or case studies of its own'
      using errcode = '22023', hint = 'empty';
  end if;

  new_name := folder_name;
  while exists (
    select 1 from public.item_banks b where b.org_id = source_org and lower(b.name) = lower(new_name)
  ) loop
    suffix := suffix + 1;
    new_name := folder_name || ' (' || suffix || ')';
  end loop;

  insert into public.item_banks (org_id, name, created_by, library_folder_id)
  values (source_org, new_name, (select auth.uid()), filed_in)
  returning id into new_bank;

  moved := private.move_quiz_content(source_bank, new_bank, loose, cases);

  -- Steps filed here whose case study stays behind: in no folder now, so the folders can go.
  update public.items set folder_id = null
   where bank_id = source_bank and folder_id = any (tree);
  delete from public.bank_folders where bank_id = source_bank and id = any (tree);

  return moved || jsonb_build_object('quiz', new_bank, 'name', new_name);
end;
$$;

revoke all on function public.turn_folder_into_quiz(uuid) from public, anon;
grant execute on function public.turn_folder_into_quiz(uuid) to authenticated;
