-- Bank folders (#103): nested folders per bank, and items and case studies filed in them.
-- A folder's content is identified by folder_id; null means Unfiled. (item_banks.folder_path, from
-- #65, would file banks themselves and is left alone.)

create table public.bank_folders (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null,
  org_id uuid not null,
  parent_id uuid,
  name text not null,
  -- Set by a trigger from the parent; a caller's value is ignored.
  depth smallint not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Names join into paths with "/", so a name never holds one; the app trims and closes up spaces.
  constraint bank_folders_name_check
    check (name = btrim(name) and length(name) between 1 and 80 and strpos(name, '/') = 0),
  constraint bank_folders_depth_check check (depth between 1 and 4),
  constraint bank_folders_id_bank_key unique (id, bank_id),
  -- A folder's org is always its bank's org, so RLS can filter on org_id without a join.
  constraint bank_folders_bank_org_fkey foreign key (bank_id, org_id)
    references public.item_banks (id, org_id) on delete cascade,
  -- A parent is in the same bank. No action (not restrict): deleting a bank removes a folder and its
  -- children in one statement, while deleting only a parent is refused.
  constraint bank_folders_parent_fkey foreign key (parent_id, bank_id)
    references public.bank_folders (id, bank_id)
);

-- Sibling names are unique whatever their case; top-level folders are siblings of each other.
create unique index bank_folders_sibling_name_key on public.bank_folders
  (bank_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index bank_folders_bank_parent_idx on public.bank_folders (bank_id, parent_id);
create index bank_folders_org_id_idx on public.bank_folders (org_id);
create index bank_folders_created_by_idx on public.bank_folders (created_by);

create function private.guard_folder_placement() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_depth smallint;
begin
  if tg_op = 'UPDATE' then
    -- A folder never moves, for any role: its depth, and every path through it, would go stale.
    if new.parent_id is distinct from old.parent_id or new.bank_id is distinct from old.bank_id then
      raise exception 'a folder cannot move to another parent or bank' using errcode = '22023';
    end if;
    new.depth := old.depth;
    return new;
  end if;

  if new.parent_id is null then
    new.depth := 1;
    return new;
  end if;

  -- Locked, so the parent cannot change or go away between reading its depth and this row landing.
  -- Security invoker: a parent the caller cannot see, or one in another bank, is refused here
  -- rather than given a made-up depth.
  select f.depth into parent_depth
    from public.bank_folders f
   where f.id = new.parent_id and f.bank_id = new.bank_id
     for share;
  if parent_depth is null then
    raise exception 'that parent folder does not exist in this bank' using errcode = '23503';
  end if;
  new.depth := parent_depth + 1;
  return new;
end
$$;
revoke all on function private.guard_folder_placement() from public;

create trigger bank_folders_placement before insert or update on public.bank_folders
  for each row execute function private.guard_folder_placement();

-- ---------------------------------------------------------------------------
-- Filing. Moving changes only folder_id; the folder must be in the content's own bank, and a
-- folder that still holds content cannot be deleted (no action, checked at the end of a statement,
-- so deleting a whole bank still works).
-- ---------------------------------------------------------------------------

alter table public.items
  add column folder_id uuid,
  add constraint items_folder_bank_fkey foreign key (folder_id, bank_id)
    references public.bank_folders (id, bank_id);
create index items_bank_folder_idx on public.items (bank_id, folder_id);

alter table public.case_studies
  add column folder_id uuid,
  add constraint case_studies_folder_bank_fkey foreign key (folder_id, bank_id)
    references public.bank_folders (id, bank_id);
create index case_studies_bank_folder_idx on public.case_studies (bank_id, folder_id);

-- One move is one call, so items and case studies either all move or none do.
-- Security invoker: RLS decides which rows the caller can see, so another org's ids match nothing,
-- and a folder the caller cannot see in this bank reads as not found.
create function public.move_to_folder(
  target_bank uuid,
  item_ids uuid[],
  case_study_ids uuid[],
  target_folder uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  moved_items integer;
  moved_case_studies integer;
begin
  -- The app moves at most 200 at a time; the function holds the same line for any caller.
  if coalesce(cardinality(item_ids), 0) + coalesce(cardinality(case_study_ids), 0) > 200 then
    raise exception 'a move carries at most 200 items and case studies' using errcode = '22023';
  end if;

  if target_folder is not null and not exists (
    select 1 from public.bank_folders f where f.id = target_folder and f.bank_id = target_bank
  ) then
    raise exception 'that folder does not exist in this bank' using errcode = '22023';
  end if;

  update public.items
     set folder_id = target_folder
   where bank_id = target_bank and id = any (coalesce(item_ids, '{}'));
  get diagnostics moved_items = row_count;

  update public.case_studies
     set folder_id = target_folder
   where bank_id = target_bank and id = any (coalesce(case_study_ids, '{}'));
  get diagnostics moved_case_studies = row_count;

  return jsonb_build_object('items', moved_items, 'case_studies', moved_case_studies);
end;
$$;

revoke all on function public.move_to_folder(uuid, uuid[], uuid[], uuid) from public, anon;
grant execute on function public.move_to_folder(uuid, uuid[], uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges and RLS, as for banks: authors work inside their own org.
-- ---------------------------------------------------------------------------

revoke all on public.bank_folders from anon;
revoke truncate, references, trigger on public.bank_folders from authenticated;
-- Only a name changes after creation: a folder never moves to another parent or bank, so it can
-- never end up inside itself.
revoke update on public.bank_folders from authenticated;
grant update (name) on public.bank_folders to authenticated;

alter table public.bank_folders enable row level security;

create policy "authors manage folders" on public.bank_folders
  for all to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()))
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));
