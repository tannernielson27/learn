-- #123: the per-user authoring limit moves to where the write happens.
--
-- 20260919110000 said it plainly, and this migration is the reason that sentence is now wrong:
-- the limit bounded the authoring UI, not the write, so an author's own session token used
-- against the Data API directly was bounded only by RLS. That was a fair Phase 2 posture — an
-- author is a trusted member of one org and nothing public can write — and it stops being one as
-- the blast radius grows. Save, publish, step and import are now bounded the same whether they
-- arrive through a Server Action or straight through PostgREST, by one mechanism rather than four
-- decisions.
--
-- ---------------------------------------------------------------------------
-- Why a trigger, and why the trigger is not enough on its own
-- ---------------------------------------------------------------------------
--
-- The four actions do not reach the database the same way, and that settles most of the choice.
-- `step` is one RPC (start_case_study_step) and `import` is one RPC (import_bank_content), so a
-- charge could sit inside either. `save` and `publish` are not RPCs at all: the editor writes
-- public.items and public.case_studies through PostgREST, under `authors manage items`, which is
-- FOR ALL. There is no function to put a charge inside for those two, and turning the editor's
-- save path into an RPC would be a rewrite, not a limit. So the mechanism has to be a trigger on
-- the tables.
--
-- A trigger on its own charges once per row, and that is exactly the double count #109 refused.
-- import_bank_content writes up to 50 items, or a case study and its six steps, in one call; a
-- per-row trigger would spend fifty import units on one file and turn the documented ten-file
-- batch into a one-file batch. The same trap catches start_case_study_step, which inserts an item,
-- places it and updates the case study in one call.
--
-- So it is one mechanism used in two places that agree: private.charge_authoring_action charges
-- AT MOST ONCE PER TRANSACTION, the triggers call it for every direct write, and the two
-- authoring RPCs call it first with their own action name so the first charge is the right one.
-- PostgREST runs one request in one transaction, which makes the arithmetic exact:
--
--   * PATCH /items or PATCH /case_studies is one transaction: the trigger charges one `save`, or
--     one `publish` when the row's new status is 'published'.
--   * import_bank_content charges one `import` before it writes anything; every row it then
--     writes finds the transaction already charged and adds nothing. ONE FILE IS ONE IMPORT UNIT,
--     so a ten-file batch is ten requests and ten units and IMPORT_MAX_FILES stays 10.
--   * start_case_study_step charges one `step`, the same way.
--
-- The four actions therefore share one mechanism and one counter. Nothing here needed a different
-- answer for the import case; it only needed the charge to be per call rather than per row.
--
-- ---------------------------------------------------------------------------
-- Why public.take_rate_limit now asks instead of counting
-- ---------------------------------------------------------------------------
--
-- The app called public.take_rate_limit before each write. If it kept counting there while the
-- write counted too, every action would cost two units and every documented cap would halve —
-- the same failure as counting per row, moved up a layer. So the count is now taken once, at the
-- write, and public.take_rate_limit asks whether there is room without spending any. The app's
-- pre-check keeps its job: it refuses cheaply, before a Server Action reads an 800 KB import file,
-- which is the costly part and the reason #109 put that check before the read.
--
-- It keeps the old name and signature on purpose. A deployment where this migration has NOT been
-- applied still has the old, counting version of the function, so the app that calls it is bounded
-- exactly as it is today: the UI capped at the documented limits, the direct PostgREST path bounded
-- only by RLS. An unapplied migration therefore degrades to the behaviour this migration replaces,
-- not to an outage — deliberately unlike #111, whose fail-closed check refuses every save when its
-- migration is missing. The app-side check keeps that fail-closed property for every other failure:
-- if the RPC errors, checkRateLimit still refuses the action. Renaming the function to say `peek`
-- is a later PR, once no deployed app calls the old name.
--
-- ---------------------------------------------------------------------------
-- What this does not bound, said out loud
-- ---------------------------------------------------------------------------
--
--   * One request that updates many rows is one statement in one transaction, so it is one charge.
--     RLS still holds it inside the caller's own org and PostgREST still holds the body under its
--     size limit; what is not bounded is the ratio of rows to units. A per-row charge would fix
--     that and break bulk import, and bulk import is the documented behaviour.
--   * The triggers are AFTER, so a write RLS refused costs nothing. Only writes that wrote are
--     charged. Hammering refused writes is unchanged by this migration.
--   * A caller with no auth.uid() — service_role, a migration, the seed — is not charged. Nothing
--     reaches those paths from the Data API, and a counter keyed to auth.users has nothing to key.
--   * item_banks and bank_folders are outside the four actions and keep no counter, as before.

-- ---------------------------------------------------------------------------
-- The limits, in one place
-- ---------------------------------------------------------------------------

-- Both the count and the question need the same numbers, so they stop being written twice.
-- All per minute, unchanged from 20260919110000: save 60, publish 20, import 10, step 30.
create function private.rate_limit_for(action_name text) returns integer
language sql immutable set search_path = ''
as $$
  select case action_name
    when 'save' then 60
    when 'publish' then 20
    when 'import' then 10
    when 'step' then 30
  end;
$$;

revoke all on function private.rate_limit_for(text) from public, anon, authenticated;

-- Unchanged behaviour; the limits simply come from the function above now. Still the only thing
-- that writes private.rate_limits.
create or replace function private.take_rate_limit(action_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  limit_calls integer := private.rate_limit_for(action_name);
  window_length constant interval := interval '1 minute';
  used integer;
begin
  if caller is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if limit_calls is null then
    raise exception 'that action has no rate limit' using errcode = '22023';
  end if;

  insert into private.rate_limits as r (user_id, action, window_start, calls)
  values (caller, action_name, now(), 1)
  on conflict (user_id, action) do update
    set window_start = case
          when r.window_start <= now() - window_length then now()
          else r.window_start
        end,
        calls = case
          when r.window_start <= now() - window_length then 1
          else least(r.calls + 1, limit_calls + 1)
        end
  returning calls into used;

  return used <= limit_calls;
end;
$$;

-- Asks whether the signed-in caller has room for one more of this action, and spends nothing.
-- Definer, so it can read the private table the caller cannot touch; it only reads the caller's
-- own row. A caller with no row, or one whose window has passed, has a whole window's room.
create function private.peek_rate_limit(action_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  limit_calls integer := private.rate_limit_for(action_name);
  window_length constant interval := interval '1 minute';
  row_used integer;
  row_started timestamptz;
begin
  if caller is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if limit_calls is null then
    raise exception 'that action has no rate limit' using errcode = '22023';
  end if;

  select r.calls, r.window_start into row_used, row_started
    from private.rate_limits r
   where r.user_id = caller and r.action = action_name;
  if not found or row_started <= now() - window_length then
    return true;
  end if;
  return row_used < limit_calls;
end;
$$;

revoke all on function private.peek_rate_limit(text) from public, anon;
grant execute on function private.peek_rate_limit(text) to authenticated;

-- Same name and signature the deployed app calls; it now asks rather than counts. See the header.
create or replace function public.take_rate_limit(action_name text)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.peek_rate_limit(action_name) $$;

-- ---------------------------------------------------------------------------
-- Charging one authoring action, once per transaction
-- ---------------------------------------------------------------------------

-- The marker is a transaction-local setting, in the same way Supabase's own RLS reads
-- request.jwt.claims: set with is_local, so it is gone when the transaction ends, and reachable
-- only by something that can run SQL inside the same transaction as the write. The Data API never
-- gives a client that — set_config lives in pg_catalog, which is not an exposed schema, and no
-- exposed function calls it — so a caller cannot mark its own write as already charged.
--
-- Refused calls are still counted (private.take_rate_limit caps them one past the limit), so
-- hammering does not shorten the wait.
--
-- 54000 is the refusal, matched in src/lib/authoring/rateLimit.ts the way 55000 (archived content)
-- is matched in src/lib/authoring/archive.ts.
create function private.charge_authoring_action(action_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- service_role, migrations and the seed have no auth.uid() and no counter to key. See the header.
  if (select auth.uid()) is null then
    return;
  end if;

  -- One charge per transaction, which is one charge per Data API request. Inside an authoring
  -- function this is what stops the function's own rows being charged on top of the action the
  -- function already took — the double count that killed the naive fix on #109.
  if coalesce(current_setting('learn.authoring_charge', true), '') <> '' then
    return;
  end if;
  perform set_config('learn.authoring_charge', action_name, true);

  if not private.take_rate_limit(action_name) then
    raise exception 'that is too many % calls in a minute', action_name using errcode = '54000';
  end if;
end;
$$;

revoke all on function private.charge_authoring_action(text) from public, anon;
-- The two authoring functions are security invoker, so they call this as the caller.
grant execute on function private.charge_authoring_action(text) to authenticated;

-- items and case_studies: a write that leaves the row published is a publish, anything else — a
-- draft saved, an archive, a restore, a delete — is a save. This is the same split the Server
-- Actions already made; the trigger just no longer trusts them to make it.
create function private.charge_content_write() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.charge_authoring_action('save');
  elsif new.status = 'published' then
    perform private.charge_authoring_action('publish');
  else
    perform private.charge_authoring_action('save');
  end if;
  return null;
end;
$$;

revoke all on function private.charge_content_write() from public, anon, authenticated;

-- item_versions and case_study_items are charged `save`, not `publish`, although the publish path
-- writes both. The app appends the version snapshot in its own request, so charging it `publish`
-- would spend two publishes on one publish and halve the documented cap of 20 — the same halving
-- the import case warns about. Charging `save` bounds these tables without moving either cap.
create function private.charge_save_write() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.charge_authoring_action('save');
  return null;
end;
$$;

revoke all on function private.charge_save_write() from public, anon, authenticated;

create trigger items_charge_authoring
  after insert or update or delete on public.items
  for each row execute function private.charge_content_write();

create trigger case_studies_charge_authoring
  after insert or update or delete on public.case_studies
  for each row execute function private.charge_content_write();

create trigger item_versions_charge_authoring
  after insert or update or delete on public.item_versions
  for each row execute function private.charge_save_write();

create trigger case_study_items_charge_authoring
  after insert or update or delete on public.case_study_items
  for each row execute function private.charge_save_write();

-- ---------------------------------------------------------------------------
-- The two authoring functions charge their own action first
-- ---------------------------------------------------------------------------

-- 20260919110000's function, with one line added: the step is charged before any lock is taken or
-- any row is read, so a caller over the limit does no work and waits on nothing. Everything this
-- function then writes finds the transaction charged, so one call is one `step`.
create or replace function public.start_case_study_step(target uuid, step_position smallint, step_type text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  case_bank uuid;
  case_org uuid;
  previous_item uuid;
  new_item uuid;
begin
  perform private.charge_authoring_action('step');

  if step_position is null or step_position < 1 or step_position > 6 then
    raise exception 'a step position is 1 to 6' using errcode = '22023';
  end if;

  -- Taken before the steps' own locks (in place_case_study_step), and neither reorder nor place
  -- locks the case study row, so this adds no lock cycle with them.
  select cs.bank_id, cs.org_id into case_bank, case_org
    from public.case_studies cs
   where cs.id = target
     for update;
  if not found then
    raise exception 'that case study does not exist' using errcode = 'P0002';
  end if;

  -- The steps are locked too (in the same order as reorder and place), so a reorder cannot move
  -- another item into this position between reading it here and replacing it. Read after the
  -- locks, so a change that committed while this call waited is seen.
  perform 1 from public.case_study_items where case_study_id = target order by position for update;
  select csi.item_id into previous_item
    from public.case_study_items csi
   where csi.case_study_id = target and csi.position = step_position;

  -- An empty draft, as the bank's New item starts one; its editor fills it in.
  insert into public.items
    (bank_id, org_id, type, status, content, answer_key, scoring, cjmm_step, created_by)
  values
    (case_bank, case_org, step_type, 'draft', '{"stem": {"kind": "markdown", "value": ""}}',
     '{}', '{}', step_position, (select auth.uid()))
  returning id into new_item;

  perform public.place_case_study_step(target, step_position, new_item);

  -- A new step starts unfinished, so a published case study is a draft again until republished.
  update public.case_studies set status = 'draft' where id = target;

  -- A published previous item stays in the bank. A draft one the database still refuses to delete
  -- (something else holds a key to it) stays too, as before; only that refusal is set aside.
  if previous_item is not null then
    begin
      delete from public.items where id = previous_item and status = 'draft';
    exception when foreign_key_violation then
      null;
    end;
  end if;

  return new_item;
end;
$$;

-- 20260919150000's function, with one line added: the import is charged before the bank is read,
-- so a caller over the limit does no work. Every item and step it then writes finds the
-- transaction charged, so ONE FILE IS ONE IMPORT UNIT however many items that file holds, and a
-- ten-file batch spends exactly ten. That is the constraint #109 refused to give up.
create or replace function public.import_bank_content(
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
  perform private.charge_authoring_action('import');

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
