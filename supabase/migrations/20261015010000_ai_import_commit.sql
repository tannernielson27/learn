-- AI import, the last step (#348): a reviewed batch is imported into its quiz all at once, or
-- discarded; its uploaded files are deleted either way; batches left open for 7 days are swept.
--
-- Owner decision, 2026-10-15: imported questions land in the quiz the import was started from,
-- `ai_import_batches.bank_id`. No new quiz is made, and the teacher is not offered one.
--
-- 1. public.import_ai_batch(batch, entries)                       A SIGNED-IN TEACHER
--    The server reads the batch's entries with the teacher's session, validates every kept entry
--    with the learn.v1 schemas (src/lib/aiImport/commit/plan.ts, as the JSON import does), and
--    hands each one in as the row it becomes: `{ id, version, item }` for a question,
--    `{ id, version, case_study }` for a case study and its six steps. In one transaction the
--    function then:
--      * checks the caller is a teacher (`private.is_author()`) and takes the workspace from the
--        session (`private.current_org_id()`), never from the call; another workspace's batch
--        reads as not found;
--      * locks the batch, so two clicks (two tabs) import once: the second finds it imported;
--      * refuses anything but a batch in review, a workspace with AI import off, and a batch
--        whose quiz is gone;
--      * refuses unless the entries handed in are exactly the batch's kept entries (not dropped,
--        not "not importable") at the versions the server read, so nothing edited since the
--        server validated it, in another tab, is imported unseen; and refuses while a kept entry
--        still needs an answer or a fix, or has no item (#343's `unmarked_key`), whatever the
--        server says;
--      * charges one `import` (private.charge_authoring_action, 20260921200000);
--      * writes every question, then every case study with its steps, as new drafts in the quiz,
--        not in a folder, created by the caller; and
--      * marks the batch imported with its counts, and deletes its staged entries, chunks and file
--        rows, which hold the document's words and answer keys.
--    All or nothing: any failure rolls the whole call back, and the batch stays in review.
--    A refusal before anything is written answers `{ ok: false, reason }`; a payload that breaks
--    a bound raises (22023). Security definer, because the batch's status and the staging rows
--    are not the teacher's to write; every read and write is pinned to the caller's workspace.
--
-- 2. public.ai_import_object_deletes                              SERVICE ROLE ONLY
--    A file row deleted (import, discard, the sweep, a workspace removed) queues its Storage
--    object here, by an AFTER DELETE trigger, when the object exists. The database cannot delete
--    an object's bytes itself (only the Storage API can), so the server does: after an import or
--    a discard it removes the queued objects of the caller's workspace and then their rows. A
--    removal that fails stays queued and is tried again at the workspace's next import or
--    discard. Nobody but the server reads or writes the queue.
--
-- 3. Discard is the teacher's own DELETE on the batch ("authors discard AI import batches",
--    #340), filtered by the server to an open batch. Entries, chunks and files go with it (on
--    delete cascade), and the trigger above queues the objects.
--
-- 4. private.sweep_ai_imports(), daily, needs no secret (ADR 0007, as #248's rate-limit sweep):
--    deletes batches still open (uploading, parsing, review or failed) and untouched for 7 days,
--    the batch row and its entries both counted as touches. An imported batch keeps its row, which
--    no longer holds any document content. The migration schedules it where pg_cron is on, and
--    answers `no_pg_cron` elsewhere; the owner calls `select private.schedule_ai_import_sweep();`
--    again after enabling pg_cron (docs/05 §7.8).
--
-- Freeing the slot: #340's limit counts open batches (uploading, parsing, review), so a batch
-- imported or deleted no longer counts toward the workspace's 20.
--
-- Deploy order: push this before the app that calls `import_ai_batch`; until then the Import
-- button answers "Something went wrong" and nothing is written.

-- ---------------------------------------------------------------------------
-- What an imported batch keeps
-- ---------------------------------------------------------------------------

alter table public.ai_import_batches
  add column imported_at timestamptz,
  add column imported_questions integer,
  add column imported_case_studies integer,
  add constraint ai_import_batches_imported_counts_check
    check (imported_questions between 0 and 150 and imported_case_studies between 0 and 150);

comment on column public.ai_import_batches.imported_questions is
  'Standalone questions written by import_ai_batch (#348); case study steps are not counted here.';

-- ---------------------------------------------------------------------------
-- Objects waiting to be removed from Storage
-- ---------------------------------------------------------------------------

create table public.ai_import_object_deletes (
  storage_path text primary key,
  -- No foreign keys: the queue outlives the batch and the workspace it names, or their objects
  -- would be forgotten when those rows go.
  org_id uuid not null,
  batch_id uuid not null,
  queued_at timestamptz not null default now(),
  constraint ai_import_object_deletes_path_check
    check (storage_path = org_id::text || '/' || batch_id::text || '/'
                          || split_part(storage_path, '/', 3)
           and length(storage_path) <= 120)
);
create index ai_import_object_deletes_org_queued_idx
  on public.ai_import_object_deletes (org_id, queued_at);

alter table public.ai_import_object_deletes enable row level security;
revoke all on public.ai_import_object_deletes from public, anon, authenticated, service_role;
grant select, delete on public.ai_import_object_deletes to service_role;

create function private.queue_ai_import_object() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only an object that is there: a file never uploaded, or one removed before its row, leaves
  -- nothing to do.
  if exists (select 1 from storage.objects o
              where o.bucket_id = 'ai-imports' and o.name = old.storage_path) then
    insert into public.ai_import_object_deletes (storage_path, org_id, batch_id)
    values (old.storage_path, old.org_id, old.batch_id)
    on conflict (storage_path) do nothing;
  end if;
  return null;
end
$$;
revoke all on function private.queue_ai_import_object() from public, anon, authenticated;

create trigger ai_import_files_queue_object after delete on public.ai_import_files
  for each row execute function private.queue_ai_import_object();

-- ---------------------------------------------------------------------------
-- The import
-- ---------------------------------------------------------------------------

-- One item row into the quiz, as import_bank_content writes it: a new id, version 1, a draft, not
-- in a folder. `step` pins a case study step to its position, whatever the payload says.
create function private.insert_ai_import_item(
  p_bank uuid,
  p_org uuid,
  p_user uuid,
  p_row jsonb,
  p_step smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created uuid := gen_random_uuid();
begin
  if jsonb_typeof(p_row) <> 'object' or jsonb_typeof(p_row -> 'content') <> 'object' then
    raise exception 'each imported question must be an object with content'
      using errcode = '22023';
  end if;
  if octet_length(p_row::text) > 262144 then
    raise exception 'an imported question is larger than 256 KB' using errcode = '22023';
  end if;
  insert into public.items (
    id, bank_id, org_id, folder_id, type, cjmm_step, tags, version, status,
    content, answer_key, rationale, scoring, created_by)
  values (
    created, p_bank, p_org, null, p_row ->> 'type',
    coalesce(p_step, (p_row ->> 'cjmm_step')::smallint),
    array(select jsonb_array_elements_text(coalesce(p_row -> 'tags', '[]'::jsonb))),
    1, 'draft',
    (p_row -> 'content') || jsonb_build_object('id', created::text),
    coalesce(p_row -> 'answer_key', '{}'::jsonb),
    coalesce(p_row -> 'rationale', '{}'::jsonb),
    coalesce(p_row -> 'scoring', '{}'::jsonb),
    p_user);
  return created;
end;
$$;
revoke all on function private.insert_ai_import_item(uuid, uuid, uuid, jsonb, smallint)
  from public, anon, authenticated, service_role;

create function public.import_ai_batch(p_batch uuid, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_org uuid;
  batch public.ai_import_batches%rowtype;
  enabled boolean;
  kept_count integer;
  matched_count integer;
  entry jsonb;
  entry_kind text;
  step record;
  case_id uuid;
  created uuid;
  questions integer := 0;
  case_studies integer := 0;
begin
  if caller is null or not (select private.is_author()) then
    raise exception 'only a teacher can import' using errcode = '42501';
  end if;
  caller_org := (select private.current_org_id());
  if caller_org is null then
    raise exception 'only a teacher can import' using errcode = '42501';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) > 150 then
    raise exception 'an import holds at most 150 entries' using errcode = '22023';
  end if;
  if octet_length(p_entries::text) > 16000000 then
    raise exception 'an import is larger than 16 MB' using errcode = '22023';
  end if;

  -- The batch, in the caller's workspace only, locked: a second call waits here, then finds it
  -- imported.
  select * into batch from public.ai_import_batches b
   where b.id = p_batch and b.org_id = caller_org
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if batch.status = 'imported' then
    return jsonb_build_object('ok', false, 'reason', 'already_imported');
  end if;
  if batch.status <> 'review' then
    return jsonb_build_object('ok', false, 'reason', 'not_review');
  end if;

  select o.ai_import_enabled into enabled from public.orgs o where o.id = caller_org;
  if not coalesce(enabled, false) then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;
  if batch.bank_id is null or not exists (
    select 1 from public.item_banks k where k.id = batch.bank_id and k.org_id = caller_org
  ) then
    return jsonb_build_object('ok', false, 'reason', 'quiz_gone');
  end if;

  -- A kept entry that is not ready cannot be imported, whatever the server sent.
  if exists (
    select 1 from public.ai_import_entries e
     where e.batch_id = p_batch and e.org_id = caller_org
       and e.status in ('needs_answer', 'needs_fix')
  ) or exists (
    select 1 from public.ai_import_entries e
     where e.batch_id = p_batch and e.org_id = caller_org
       and e.status = 'ready' and e.item is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_ready');
  end if;

  -- Exactly the kept entries, at the versions the server validated.
  select count(*) into kept_count from public.ai_import_entries e
   where e.batch_id = p_batch and e.org_id = caller_org and e.status = 'ready';
  if kept_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_import');
  end if;
  select count(distinct e.id) into matched_count
    from jsonb_array_elements(p_entries) as given(value)
    join public.ai_import_entries e
      on e.id::text = given.value ->> 'id'
     and e.version::text = given.value ->> 'version'
     and e.batch_id = p_batch and e.org_id = caller_org and e.status = 'ready'
     and ((e.kind = 'item' and jsonb_typeof(given.value -> 'item') = 'object')
          or (e.kind = 'case_study' and jsonb_typeof(given.value -> 'case_study') = 'object'));
  if matched_count <> kept_count or jsonb_array_length(p_entries) <> kept_count then
    return jsonb_build_object('ok', false, 'reason', 'entry_changed');
  end if;

  perform private.charge_authoring_action('import');

  -- In source order; the entry's own kind decides what it becomes, not the payload's keys.
  for entry, entry_kind in
    select given.value, e.kind
      from jsonb_array_elements(p_entries) as given(value)
      join public.ai_import_entries e
        on e.id::text = given.value ->> 'id' and e.batch_id = p_batch and e.org_id = caller_org
     order by e.position
  loop
    if entry_kind = 'item' then
      perform private.insert_ai_import_item(batch.bank_id, caller_org, caller, entry -> 'item', null);
      questions := questions + 1;
      continue;
    end if;

    if jsonb_typeof(entry -> 'case_study' -> 'items') <> 'array'
       or jsonb_array_length(entry -> 'case_study' -> 'items') <> 6 then
      raise exception 'a case study imports with exactly six steps' using errcode = '22023';
    end if;
    insert into public.case_studies (bank_id, org_id, folder_id, title, tags, ehr, status, created_by)
    values (
      batch.bank_id, caller_org, null, entry -> 'case_study' ->> 'title',
      array(select jsonb_array_elements_text(coalesce(entry -> 'case_study' -> 'tags', '[]'::jsonb))),
      coalesce(entry -> 'case_study' -> 'ehr', '{}'::jsonb), 'draft', caller)
    returning id into case_id;

    for step in
      select s.value as item, s.ordinality::smallint as position
        from jsonb_array_elements(entry -> 'case_study' -> 'items') with ordinality as s(value, ordinality)
       order by s.ordinality
    loop
      created := private.insert_ai_import_item(batch.bank_id, caller_org, caller, step.item, step.position);
      insert into public.case_study_items (case_study_id, org_id, bank_id, position, item_id)
      values (case_id, caller_org, batch.bank_id, step.position, created);
    end loop;
    case_studies := case_studies + 1;
  end loop;

  update public.ai_import_batches b
     set status = 'imported',
         imported_at = now(),
         imported_questions = questions,
         imported_case_studies = case_studies
   where b.id = p_batch and b.org_id = caller_org;

  -- The staging rows hold the document's words and its keys; the quiz holds the questions now.
  -- Deleting the files cascades to their chunks and queues their objects.
  delete from public.ai_import_entries e where e.batch_id = p_batch and e.org_id = caller_org;
  delete from public.ai_import_files f where f.batch_id = p_batch and f.org_id = caller_org;

  return jsonb_build_object(
    'ok', true, 'questions', questions, 'case_studies', case_studies);
end;
$$;

revoke all on function public.import_ai_batch(uuid, jsonb) from public, anon;
grant execute on function public.import_ai_batch(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- The sweep: open batches untouched for 7 days
-- ---------------------------------------------------------------------------

create function private.sweep_ai_imports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.ai_import_batches b
   where b.id in (
     select x.id
       from public.ai_import_batches x
      where x.status in ('uploading', 'parsing', 'review', 'failed')
        and x.updated_at < now() - interval '7 days'
        and not exists (
          select 1 from public.ai_import_entries e
           where e.batch_id = x.id and e.updated_at >= now() - interval '7 days')
      order by x.updated_at
      limit 500
        for update skip locked
   );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function private.sweep_ai_imports() from public, anon, authenticated, service_role;

-- Returns what it did rather than raising: 'no_pg_cron', 'scheduled' or 'updated'. Idempotent,
-- as private.schedule_rate_limit_sweep() (20260925050000) is; call it as postgres.
create function private.schedule_ai_import_sweep()
returns text
language plpgsql
set search_path = ''
as $$
declare
  job_name constant text := 'learn-ai-import-sweep';
  job_schedule constant text := '23 3 * * *';
  job_command constant text := 'select private.sweep_ai_imports()';
  existing bigint;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    return 'no_pg_cron';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(job_name));

  execute 'select jobid from cron.job where jobname = $1 order by jobid limit 1'
    into existing using job_name;

  if existing is null then
    execute 'select cron.schedule($1, $2, $3)' using job_name, job_schedule, job_command;
    return 'scheduled';
  end if;

  execute 'select cron.alter_job(job_id := $1, schedule := $2, command := $3, active := true)'
    using existing, job_schedule, job_command;
  return 'updated';
end;
$$;

revoke all on function private.schedule_ai_import_sweep()
  from public, anon, authenticated, service_role;

select private.schedule_ai_import_sweep();
