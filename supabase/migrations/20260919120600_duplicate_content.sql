-- Duplicating (#106): an author copies an item, or a case study with its step items, to write a
-- variation. A copy is a new draft at version 1 in the same bank and folder, with the same tags,
-- and carries a "(copy)" marker: before an item's stem (so the bank list shows it) and after a case
-- study's title. Version history is not copied. Duplicating into another bank is export and import.
--
-- Security invoker, as import_bank_content: RLS decides what the caller can read and write, so
-- another org's content (or a student's attempt) reads as not found and nothing is written.

create function public.duplicate_item(source_item uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created uuid := gen_random_uuid();
begin
  insert into public.items (
    id, bank_id, org_id, folder_id, type, cjmm_step, tags, version, status,
    content, answer_key, rationale, scoring, created_by)
  select
    created, i.bank_id, i.org_id, i.folder_id, i.type, i.cjmm_step, i.tags, 1, 'draft',
    jsonb_set(
      i.content || jsonb_build_object('id', created::text),
      '{stem}',
      jsonb_build_object(
        'kind', 'markdown',
        'value', btrim('(copy) ' || coalesce(i.content->'stem'->>'value', '')))),
    i.answer_key, i.rationale, i.scoring, (select auth.uid())
  from public.items i
  where i.id = source_item;
  if not found then
    raise exception 'that item does not exist' using errcode = '22023';
  end if;
  return created;
end;
$$;

revoke all on function public.duplicate_item(uuid) from public, anon;
grant execute on function public.duplicate_item(uuid) to authenticated;

-- One call copies the case study and every step it has, so either the whole copy lands or none of
-- it does. Each step becomes a new item pinned to its position; the original keeps its own items.
create function public.duplicate_case_study(source_case_study uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source public.case_studies%rowtype;
  case_id uuid;
  step record;
  created uuid;
begin
  -- Locked, and its steps below in position order (as reorder_case_study_steps does), so a save or
  -- reorder in between cannot leave the copy half old and half new.
  select cs.* into source from public.case_studies cs where cs.id = source_case_study for share;
  if not found then
    raise exception 'that case study does not exist' using errcode = '22023';
  end if;

  -- A title is at most 200 characters; the longest keeps room for the marker.
  insert into public.case_studies (bank_id, org_id, folder_id, title, ehr, tags, status, created_by)
  values (
    source.bank_id, source.org_id, source.folder_id, left(source.title, 193) || ' (copy)',
    source.ehr, source.tags, 'draft', (select auth.uid()))
  returning id into case_id;

  for step in
    select csi.position, i.folder_id, i.type, i.tags, i.content, i.answer_key, i.rationale,
           i.scoring
      from public.case_study_items csi
      join public.items i on i.id = csi.item_id
     where csi.case_study_id = source_case_study
     order by csi.position
       for share of csi
  loop
    created := gen_random_uuid();
    insert into public.items (
      id, bank_id, org_id, folder_id, type, cjmm_step, tags, version, status,
      content, answer_key, rationale, scoring, created_by)
    values (
      created, source.bank_id, source.org_id, step.folder_id, step.type, step.position, step.tags,
      1, 'draft', step.content || jsonb_build_object('id', created::text),
      step.answer_key, step.rationale, step.scoring, (select auth.uid()));
    insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
    values (case_id, source.org_id, source.bank_id, step.position, created);
  end loop;

  return case_id;
end;
$$;

revoke all on function public.duplicate_case_study(uuid) from public, anon;
grant execute on function public.duplicate_case_study(uuid) to authenticated;
