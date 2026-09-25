-- #283: the sample bank arrives published, ready to assign or run live.
--
-- #265 imports the sample through public.import_bank_content, which always writes drafts, so an
-- instructor had to publish 21 items and a case study one at a time before a first class. This
-- adds one function that does the import and the publish together.
--
-- Why a function, and not a second request from the app: the publish has to be all or nothing with
-- the import, and cost one import unit rather than 21 of the publish limit (20 a minute). A second
-- PostgREST request is a second transaction: it could fail after the import committed, leaving the
-- drafts, and it would be charged `publish`. Inside one function it is one transaction, and
-- private.charge_authoring_action charges only the first action it sees in a transaction.
--
-- What it may publish, and why that is safe:
--
--   * Only the rows this call's own import_bank_content wrote: their ids come back from that call
--     and nothing else is updated. The target bank must be empty (no item, no case study, archived
--     or not), so nothing already in the bank changes, and every write is pinned to that bank.
--   * The payload must be the sample: every top-level item and the case study carry the `sample`
--     tag the fixtures carry. This is a scope line, not a security boundary: an author can already
--     publish any row in their own org with one PATCH under "authors manage items". So the function
--     gives no one a power they lack; it only saves the sample 21 requests.
--   * The app checks every part with the editor's own publish rule before calling
--     (samplePublishProblems in src/lib/onboarding/sampleBank.ts).
--
-- Security invoker, like import_bank_content: RLS applies to every read and write, so another
-- org's bank reads as not found and a student or role-less account can write nothing. The role
-- check below says so first, before any charge or read. search_path is pinned; anon executes
-- nothing. RLS on every table is unchanged.

create function public.import_sample_bank(
  target_bank uuid,
  new_items jsonb,
  new_case_study jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  imported jsonb;
  written uuid[];
  case_id uuid;
begin
  if not (select private.is_author()) then
    raise exception 'only an instructor can import the sample' using errcode = '42501';
  end if;

  -- The one charge for this transaction. import_bank_content and every row written below find it
  -- already charged, so the whole sample, published, costs one import unit.
  perform private.charge_authoring_action('import');

  -- Security invoker: a bank the caller cannot see reads as not found.
  if not exists (select 1 from public.item_banks b where b.id = target_bank) then
    raise exception 'that bank does not exist' using errcode = '22023';
  end if;

  -- The sample only goes into a bank of its own, so nothing already there is touched.
  if exists (select 1 from public.items i where i.bank_id = target_bank)
     or exists (select 1 from public.case_studies cs where cs.bank_id = target_bank) then
    raise exception 'the sample only imports into an empty bank' using errcode = '22023';
  end if;

  if new_items is null or jsonb_typeof(new_items) <> 'array'
     or new_case_study is null or jsonb_typeof(new_case_study) <> 'object' then
    raise exception 'the sample is items and a case study' using errcode = '22023';
  end if;
  if exists (
       select 1 from jsonb_array_elements(new_items) e
        where jsonb_typeof(e.value) <> 'object'
           or jsonb_typeof(e.value->'tags') <> 'array'
           or not (e.value->'tags') ? 'sample')
     or jsonb_typeof(new_case_study->'tags') <> 'array'
     or not (new_case_study->'tags') ? 'sample' then
    raise exception 'only the sample imports published' using errcode = '22023';
  end if;

  -- Every size, shape and count check is import_bank_content's, unchanged.
  imported := public.import_bank_content(target_bank, new_items, new_case_study);
  written := array(select jsonb_array_elements_text(imported->'item_ids')::uuid);
  case_id := (imported->>'case_study_id')::uuid;

  -- Published at version 1, exactly the rows just written.
  update public.items
     set status = 'published'
   where id = any (written) and bank_id = target_bank;

  -- Version 1 of each, as the editor's publish records it: the item as learn's Item, the columns
  -- folded back into the content (src/lib/supabase/itemRows.ts fromItemRow).
  insert into public.item_versions (item_id, org_id, version, snapshot)
  select i.id, i.org_id, 1,
         i.content
           || jsonb_build_object(
                'id', i.id::text,
                'type', i.type,
                'tags', to_jsonb(i.tags),
                'version', 1,
                'answerKey', i.answer_key,
                'rationale', i.rationale,
                'scoring', i.scoring)
           || case when i.cjmm_step is null then '{}'::jsonb
                   else jsonb_build_object('cjmmStep', i.cjmm_step) end
    from public.items i
   where i.id = any (written) and i.bank_id = target_bank;

  update public.case_studies
     set status = 'published'
   where id = case_id and bank_id = target_bank;

  return imported;
end;
$$;

comment on function public.import_sample_bank(uuid, jsonb, jsonb) is
  'Imports the sample bank into an empty bank and publishes exactly the rows it wrote, in one transaction for one import unit (#283).';

revoke all on function public.import_sample_bank(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.import_sample_bank(uuid, jsonb, jsonb) to authenticated;

-- Restated so a replay leaves the functions this one calls exactly as they were granted.
revoke all on function public.import_bank_content(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.import_bank_content(uuid, jsonb, jsonb, uuid) to authenticated;
revoke all on function private.charge_authoring_action(text) from public, anon;
grant execute on function private.charge_authoring_action(text) to authenticated;
