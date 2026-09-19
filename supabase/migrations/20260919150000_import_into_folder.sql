-- Bulk import (#109): an import can land in a folder of its bank. Same function as #90 with one
-- more argument, target_folder (null: Unfiled), so a file's items, or a case study and its six
-- steps, are written and filed in the same single call: a file lands whole or not at all.
-- The three-argument form is dropped rather than overloaded, so there is one import function.

drop function public.import_bank_content(uuid, jsonb, jsonb);

create function public.import_bank_content(
  target_bank uuid,
  new_items jsonb,
  new_case_study jsonb,
  target_folder uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bank_org uuid;
  entry jsonb;
  step record;
  created uuid;
  created_ids uuid[] := '{}';
  case_id uuid;
begin
  -- Security invoker: a bank the caller cannot see reads as not found, and RLS checks each insert.
  select b.org_id into bank_org from public.item_banks b where b.id = target_bank;
  if not found then
    raise exception 'that bank does not exist' using errcode = '22023';
  end if;

  -- A target folder is one of this bank's folders the caller can see; anything else reads as not
  -- found. (The items and case studies foreign keys hold the same bank line for any caller.)
  if target_folder is not null and not exists (
    select 1 from public.bank_folders f where f.id = target_folder and f.bank_id = target_bank
  ) then
    raise exception 'that folder does not exist in this bank' using errcode = '23503';
  end if;

  -- The app refuses imports over 800 KB before parsing; the function holds a line for any caller.
  if octet_length(coalesce(new_items::text, '')) + octet_length(coalesce(new_case_study::text, ''))
     > 1000000 then
    raise exception 'an import is larger than 1 MB' using errcode = '22023';
  end if;

  if new_items is not null then
    if jsonb_typeof(new_items) <> 'array' or jsonb_array_length(new_items) > 50 then
      raise exception 'an import holds at most 50 items' using errcode = '22023';
    end if;
    for entry in select value from jsonb_array_elements(new_items) loop
      if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'content') <> 'object' then
        raise exception 'each imported item must be an object with content' using errcode = '22023';
      end if;
      -- The app bounds items at 200 KB before calling; the function holds the same line for any caller.
      if octet_length(entry::text) > 200000 then
        raise exception 'an imported item is larger than 200 KB' using errcode = '22023';
      end if;
      created := gen_random_uuid();
      insert into public.items (
        id, bank_id, org_id, folder_id, type, cjmm_step, tags, version, status,
        content, answer_key, rationale, scoring, created_by)
      values (
        created, target_bank, bank_org, target_folder, entry->>'type', (entry->>'cjmm_step')::smallint,
        array(select jsonb_array_elements_text(coalesce(entry->'tags', '[]'::jsonb))),
        1, 'draft',
        (entry->'content') || jsonb_build_object('id', created::text),
        coalesce(entry->'answer_key', '{}'::jsonb),
        coalesce(entry->'rationale', '{}'::jsonb),
        coalesce(entry->'scoring', '{}'::jsonb),
        (select auth.uid()));
      created_ids := created_ids || created;
    end loop;
  end if;

  if new_case_study is not null then
    if jsonb_typeof(new_case_study) <> 'object'
       or jsonb_typeof(new_case_study->'items') <> 'array'
       or jsonb_array_length(new_case_study->'items') <> 6 then
      raise exception 'a case study imports with exactly six steps' using errcode = '22023';
    end if;

    insert into public.case_studies (bank_id, org_id, folder_id, title, tags, ehr, status, created_by)
    values (
      target_bank, bank_org, target_folder, new_case_study->>'title',
      array(select jsonb_array_elements_text(coalesce(new_case_study->'tags', '[]'::jsonb))),
      coalesce(new_case_study->'ehr', '{}'::jsonb), 'draft', (select auth.uid()))
    returning id into case_id;

    for step in
      select s.value as item, s.ordinality::smallint as position
      from jsonb_array_elements(new_case_study->'items') with ordinality as s(value, ordinality)
      order by s.ordinality
    loop
      if jsonb_typeof(step.item) <> 'object' or jsonb_typeof(step.item->'content') <> 'object' then
        raise exception 'each step must be an object with content' using errcode = '22023';
      end if;
      if octet_length(step.item::text) > 200000 then
        raise exception 'an imported step is larger than 200 KB' using errcode = '22023';
      end if;
      created := gen_random_uuid();
      -- A step item is pinned to its position, whatever the file says.
      insert into public.items (
        id, bank_id, org_id, folder_id, type, cjmm_step, tags, version, status,
        content, answer_key, rationale, scoring, created_by)
      values (
        created, target_bank, bank_org, target_folder, step.item->>'type', step.position,
        array(select jsonb_array_elements_text(coalesce(step.item->'tags', '[]'::jsonb))),
        1, 'draft',
        (step.item->'content') || jsonb_build_object('id', created::text),
        coalesce(step.item->'answer_key', '{}'::jsonb),
        coalesce(step.item->'rationale', '{}'::jsonb),
        coalesce(step.item->'scoring', '{}'::jsonb),
        (select auth.uid()));
      insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
      values (case_id, bank_org, target_bank, step.position, created);
      created_ids := created_ids || created;
    end loop;
  end if;

  return jsonb_build_object('item_ids', to_jsonb(created_ids), 'case_study_id', case_id);
end;
$$;

revoke all on function public.import_bank_content(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.import_bank_content(uuid, jsonb, jsonb, uuid) to authenticated;
