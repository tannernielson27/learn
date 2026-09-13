-- Case study steps (#86): a step's item must live in the case study's own bank, steps can be
-- reordered atomically, and a reorder keeps each item's CJMM step in line with its position.

-- ---------------------------------------------------------------------------
-- Same bank, enforced by keys (the org is already enforced by #65's composite keys)
-- ---------------------------------------------------------------------------

alter table public.items
  add constraint items_id_bank_key unique (id, bank_id);
alter table public.case_studies
  add constraint case_studies_id_bank_key unique (id, bank_id);

-- A step whose item sits in another bank than its case study would make the new keys fail with a
-- bare foreign key error; say what is wrong instead. (#65 kept only the org consistent.)
do $$
begin
  if exists (
    select 1
      from public.case_study_items csi
      join public.case_studies cs on cs.id = csi.case_study_id
      join public.items i on i.id = csi.item_id
     where i.bank_id <> cs.bank_id
  ) then
    raise exception 'case_study_items has steps whose item is in another bank; move or remove them first';
  end if;
end
$$;

alter table public.case_study_items add column bank_id uuid;
update public.case_study_items csi
  set bank_id = cs.bank_id
  from public.case_studies cs
  where cs.id = csi.case_study_id;
alter table public.case_study_items alter column bank_id set not null;

alter table public.case_study_items
  add constraint case_study_items_item_bank_fkey foreign key (item_id, bank_id)
    references public.items (id, bank_id) on delete restrict,
  add constraint case_study_items_case_bank_fkey foreign key (case_study_id, bank_id)
    references public.case_studies (id, bank_id) on delete cascade;
create index case_study_items_bank_id_idx on public.case_study_items (bank_id);

-- ---------------------------------------------------------------------------
-- Atomic reordering
-- ---------------------------------------------------------------------------

-- Deferrable, so one transaction can swap two steps without a moment where two share a position.
alter table public.case_study_items drop constraint case_study_items_pkey;
alter table public.case_study_items
  add constraint case_study_items_pkey primary key (case_study_id, position)
    deferrable initially immediate;

-- Security invoker: the caller's RLS decides which steps and items it can see and change, so
-- another org's case study reads as having no steps and the reorder is refused.
create function public.reorder_case_study_steps(target uuid, item_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_count integer;
  moved integer;
begin
  select count(*) into current_count
    from public.case_study_items
    where case_study_id = target;

  if item_ids is null
     or cardinality(item_ids) = 0
     or cardinality(item_ids) <> current_count
     or cardinality(item_ids) <> (select count(distinct x) from unnest(item_ids) as x) then
    raise exception 'the new order must name each step of the case study exactly once'
      using errcode = '22023';
  end if;

  -- Lock this case study's steps in one order first, so two reorders of it wait for each other
  -- instead of deadlocking.
  perform 1 from public.case_study_items where case_study_id = target order by position for update;

  set constraints public.case_study_items_pkey deferred;

  update public.case_study_items csi
    set position = s.ord
    from unnest(item_ids) with ordinality as s(item_id, ord)
    where csi.case_study_id = target and csi.item_id = s.item_id;
  get diagnostics moved = row_count;

  if moved <> current_count then
    raise exception 'the new order must name each step of the case study exactly once'
      using errcode = '22023';
  end if;

  -- Each step item's CJMM step follows its new position (steps 1..6 in order).
  -- Joined through this case study's own steps as well, so only its step items can be renumbered
  -- even if the checks above are ever reordered.
  update public.items i
    set cjmm_step = s.ord
    from unnest(item_ids) with ordinality as s(item_id, ord),
         public.case_study_items csi
    where i.id = s.item_id
      and csi.item_id = i.id
      and csi.case_study_id = target;

  set constraints public.case_study_items_pkey immediate;
end;
$$;

revoke all on function public.reorder_case_study_steps(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_case_study_steps(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Placing or replacing one step, atomically
-- ---------------------------------------------------------------------------

-- One call both puts the item at the position (inserting, or replacing the item already there) and
-- sets that item's CJMM step, so a failure can never leave a step placed with its item marked for
-- another step. The bank and org come from the case study itself, never from the caller. Security
-- invoker: a case study the caller cannot see reads as not found. The keys still refuse an item
-- from another bank (23503), and the one-use rule an item that is already a step (23505).
create function public.place_case_study_step(target uuid, step_position smallint, step_item uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  case_bank uuid;
  case_org uuid;
begin
  select cs.bank_id, cs.org_id into case_bank, case_org
    from public.case_studies cs
    where cs.id = target;
  if not found then
    raise exception 'that case study does not exist' using errcode = '22023';
  end if;

  if step_position is null or step_position < 1 or step_position > 6 then
    raise exception 'a step position is 1 to 6' using errcode = '22023';
  end if;

  -- The same lock order as reorder_case_study_steps, so the two never deadlock each other.
  perform 1 from public.case_study_items where case_study_id = target order by position for update;

  -- Update then insert: ON CONFLICT cannot use the deferrable position key as its arbiter.
  update public.case_study_items
    set item_id = step_item
    where case_study_id = target and position = step_position;
  if not found then
    insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
      values (target, case_org, case_bank, step_position, step_item);
  end if;

  update public.items i
    set cjmm_step = step_position
    from public.case_study_items csi
    where csi.case_study_id = target
      and csi.position = step_position
      and csi.item_id = i.id;
end;
$$;

revoke all on function public.place_case_study_step(uuid, smallint, uuid) from public, anon;
grant execute on function public.place_case_study_step(uuid, smallint, uuid) to authenticated;