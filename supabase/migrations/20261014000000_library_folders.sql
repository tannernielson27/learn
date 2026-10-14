-- Library folders (#411): folders that hold quizzes, one tree per workspace, shown on the teacher
-- home (the Library). docs/glossary.md: a folder is "a named place in the library that holds
-- quizzes".
--
-- Why a table, and not item_banks.folder_path (#65, never used):
--   * A path is text on every quiz. Renaming a folder would rewrite every quiz under it, an empty
--     folder could not exist at all, and nothing would stop two spellings of one folder.
--   * A row per folder is guarded the way bank_folders (#103) is: org_id on every row, composite
--     keys that keep a folder, its parent and its quizzes in one workspace, a trigger that sets the
--     depth, sibling names unique whatever their case, and RLS on org_id without a join.
--   * A folder that still holds quizzes or folders cannot be deleted: the keys refuse it. Nothing
--     is ever deleted with it, which is what the glossary's "Delete only an empty folder" needs.
-- folder_path is left as it is; dropping it is not this story's business.
--
-- Depth is capped at two (a folder, and folders inside it). The owner asked for two unless a
-- reason for more turned up, and none did: a workspace sorts quizzes by course and then by week or
-- topic, and anything deeper is what in-quiz folders were, which #417 retires.
--
-- Nothing existing moves. Every quiz starts in no folder (library_folder_id null), so a workspace
-- that makes no folders looks exactly as it did. In-quiz folders (bank_folders) are untouched.
--
-- Deploy order: the app may reach a database without this migration. It reads the table and the
-- column only through src/lib/authoring/libraryData.ts, which treats a missing table or column as
-- "no folders yet" and refuses folder writes with a plain message.

create table public.library_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  parent_id uuid,
  name text not null,
  -- Set by a trigger from the parent; a caller's value is ignored.
  depth smallint not null default 1,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- As bank_folders: trimmed, at most 80 characters, and no "/", since names join into paths.
  constraint library_folders_name_check
    check (name = btrim(name) and length(name) between 1 and 80 and strpos(name, '/') = 0),
  constraint library_folders_depth_check check (depth between 1 and 2),
  constraint library_folders_id_org_key unique (id, org_id),
  -- A parent is in the same workspace. No action (not restrict): deleting a workspace removes a
  -- folder and the folders inside it in one statement, while deleting only a parent is refused.
  constraint library_folders_parent_fkey foreign key (parent_id, org_id)
    references public.library_folders (id, org_id)
);

-- Sibling names are unique whatever their case; top-level folders are siblings of each other.
create unique index library_folders_sibling_name_key on public.library_folders
  (org_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
-- The parent key's columns, and how the library reads one level of the tree.
create index library_folders_parent_org_idx on public.library_folders (parent_id, org_id);
create index library_folders_created_by_idx on public.library_folders (created_by);

create function private.guard_library_folder_placement() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_depth smallint;
begin
  if tg_op = 'UPDATE' then
    -- A folder never moves, for any role: its depth, and every path through it, would go stale.
    if new.parent_id is distinct from old.parent_id or new.org_id is distinct from old.org_id then
      raise exception 'a folder cannot move to another parent or workspace' using errcode = '22023';
    end if;
    new.depth := old.depth;
    return new;
  end if;

  if new.parent_id is null then
    new.depth := 1;
    return new;
  end if;

  -- Locked, so the parent cannot change or go away between reading its depth and this row landing.
  -- Security invoker: a parent the caller cannot see, or one in another workspace, is refused here
  -- rather than given a made-up depth. A depth past two fails library_folders_depth_check (23514).
  select f.depth into parent_depth
    from public.library_folders f
   where f.id = new.parent_id and f.org_id = new.org_id
     for share;
  if parent_depth is null then
    raise exception 'that parent folder does not exist in this workspace' using errcode = '23503';
  end if;
  new.depth := parent_depth + 1;
  return new;
end
$$;
revoke all on function private.guard_library_folder_placement() from public;

create trigger library_folders_placement before insert or update on public.library_folders
  for each row execute function private.guard_library_folder_placement();

-- ---------------------------------------------------------------------------
-- Filing a quiz. Only library_folder_id changes; the folder must be in the quiz's own workspace
-- (the composite key), and a folder that still holds a quiz cannot be deleted (no action, checked
-- at the end of a statement, so deleting a whole workspace still works).
-- ---------------------------------------------------------------------------

alter table public.item_banks
  add column library_folder_id uuid,
  add constraint item_banks_library_folder_fkey foreign key (library_folder_id, org_id)
    references public.library_folders (id, org_id);
-- The key's columns: a folder's delete looks its quizzes up here, and so does opening a folder.
create index item_banks_library_folder_idx on public.item_banks (library_folder_id, org_id);

-- ---------------------------------------------------------------------------
-- Privileges and RLS, as for bank_folders: teachers work inside their own workspace.
-- ---------------------------------------------------------------------------

revoke all on public.library_folders from anon;
revoke truncate, references, trigger on public.library_folders from authenticated;
-- A folder is made with a workspace, a parent and a name; the depth comes from the trigger and
-- created_by from the caller's own id, so neither is the caller's to write. Only the name changes
-- afterwards: a folder never moves, so it can never end up inside itself.
revoke insert, update on public.library_folders from authenticated;
grant insert (org_id, parent_id, name) on public.library_folders to authenticated;
grant update (name) on public.library_folders to authenticated;

alter table public.library_folders enable row level security;

create policy "authors manage library folders" on public.library_folders
  for all to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()))
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

-- ---------------------------------------------------------------------------
-- The abandoned-workspace sweep (ADR 0012). A workspace's folders go with its row in orgs (on
-- delete cascade), after its quizzes, so the sweep's deletion is unchanged. A folder made by a
-- teacher who has since moved to another workspace (ADR 0011) names that account, so it stops the
-- account's deletion as a bank folder does. The function is as 20261012000000 left it, with one
-- line added for library_folders.
-- ---------------------------------------------------------------------------

create or replace function private.sweep_account_tied_elsewhere(p_user uuid, p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.sessions s where s.host_id = p_user and s.org_id <> p_org)
      or exists (select 1 from public.participants t
                  where t.profile_id = p_user and t.org_id <> p_org)
      or exists (select 1 from public.item_banks b
                  where b.created_by = p_user and b.org_id <> p_org)
      or exists (select 1 from public.items i where i.created_by = p_user and i.org_id <> p_org)
      or exists (select 1 from public.case_studies cs
                  where cs.created_by = p_user and cs.org_id <> p_org)
      or exists (select 1 from public.bank_folders f
                  where f.created_by = p_user and f.org_id <> p_org)
      or exists (select 1 from public.library_folders lf
                  where lf.created_by = p_user and lf.org_id <> p_org)
      or exists (select 1 from public.classes c where c.created_by = p_user and c.org_id <> p_org)
      or exists (select 1 from public.assignments a
                  where a.created_by = p_user and a.org_id <> p_org)
      or exists (select 1 from public.bank_practice_shares bs
                  where bs.shared_by = p_user and bs.org_id <> p_org)
      or exists (select 1 from public.org_invites v
                  where (v.invited_by = p_user or v.accepted_by = p_user) and v.org_id <> p_org)
      or exists (select 1 from public.orgs o where o.founder_id = p_user and o.id <> p_org)
      -- A teacher is never a student, so any of these is unexpected, and stops the deletion.
      or exists (select 1 from public.class_members m where m.profile_id = p_user)
      or exists (select 1 from private.class_removals r where r.profile_id = p_user)
      or exists (select 1 from public.assignment_attempts t where t.student_id = p_user)
      or exists (select 1 from public.practice_runs r where r.student_id = p_user)
      or exists (select 1 from private.email_outbox e where e.student_id = p_user);
$$;

revoke all on function private.sweep_account_tied_elsewhere(uuid, uuid)
  from public, anon, authenticated, service_role;
