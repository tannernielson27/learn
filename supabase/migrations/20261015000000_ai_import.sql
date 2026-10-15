-- AI question import, the database half (#340, ADR 0008): batches, their files, chunks and staged
-- entries, a usage ledger with a monthly cap per workspace, and a private upload bucket.
--
-- What each table is
-- ------------------
--   ai_import_batches  One upload: a workspace, its teacher, an optional target quiz or library
--                      folder, and a status. Made only in a workspace with AI import on
--                      (`orgs.ai_import_enabled`, #355). Creating one is the rights confirmation
--                      ("I may use this content..."): `rights_confirmed_at` is the insert's own
--                      time, never the caller's value. At most 20 open batches per workspace.
--   ai_import_files    One uploaded file. Its object name in Storage is `<org>/<batch>/<file id>`,
--                      a generated column, so no file name a teacher chose is ever a path. At most
--                      5 files and 100 pages per batch (ADR 0008), checked under the batch's lock.
--   ai_import_chunks   About 8 pages of one file, sent to Claude in one request (#342). Status,
--                      attempts and tokens, so a closed tab resumes from the chunks still pending.
--   ai_import_entries  One staged question or case study. Holds answer keys (`draft`, `item`), so
--                      it is read by the workspace's authors and nobody else. `version` goes up by
--                      one on every update, for optimistic edits (#347): update ... where version =
--                      the one you read. At most 150 per batch.
--   ai_usage           One row per workspace and month: pages, tokens and estimated cost, reserved
--                      and used. Authors read their own workspace's; nobody writes it but the two
--                      functions below.
--   private.ai_usage_reservations
--                      The ledger: one row per Claude call, its reservation and, once settled, its
--                      real tokens and cost.
--
-- Who writes what
-- ---------------
-- The pipeline (#341-#344) runs on the server with the secret key and writes files, chunks and
-- entries itself, after checking the caller is an author of the batch's workspace. A signed-in
-- teacher, through the Data API, may only: make a batch in their own workspace, change its target
-- quiz or folder, delete (discard) it; and edit an entry's type, draft, item and status (#346,
-- #347). Token counts, page counts and the ledger are never the browser's to write, so the cap
-- cannot be talked down from a client.
--
-- The cap
-- -------
-- ADR 0008 keeps the cap in money: `orgs.ai_import_monthly_cap_usd`, default 10.00 (#333's
-- measurement; the owner has not confirmed it). The issue first proposed 300 pages, so there is
-- also `orgs.ai_import_monthly_page_cap`, null (off) by default. Either or both can be set per
-- workspace by the owner in SQL; a reservation must fit under every cap that is set. Months are
-- calendar months in UTC.
--
--   public.reserve_ai_usage(org, pages, cost_usd, batch)   SERVICE ROLE ONLY
--     Before each Claude call. Locks the workspace's row for this month, so two reservations at
--     once are serialized and cannot pass the cap together (pgTAP ai_import_cap_concurrency).
--     Answers allowed, reason ('ok', 'cap_reached' or 'disabled'), the reservation id, and what
--     is left after it. A refusal reserves nothing.
--   public.settle_ai_usage(reservation, pages, input_tokens, output_tokens, cost_usd)
--                                                          SERVICE ROLE ONLY
--     After the call, with the real numbers (zeros for a call that failed before Claude billed
--     anything). Moves the reservation from reserved to used, records the tokens, and answers
--     false, changing nothing, when it was settled already, so a retry is harmless. A real cost
--     above the reservation is recorded as it is: the next reservation sees it.
--   A reservation never settled (a function killed mid-call) keeps counting until the month ends.
--   That fails closed: it can only make the cap stricter. The Anthropic console limit is the
--   backstop either way.
--
-- Storage
-- -------
-- A private bucket, `ai-imports`, 25 MB per object, PDF, .docx, Markdown and plain text only. An
-- author may upload only to the path of a file row the server registered, in a batch of their own
-- workspace that is still uploading; may read and delete objects under their own workspace's
-- folder; may never overwrite (no update policy). Students and signed-out visitors have no policy
-- at all. Deleting a batch does not delete its objects: the discard and import paths (#348) delete
-- the objects first, then the rows.
--
-- Deploy order: nothing in the app reads these tables or the bucket yet. #341 onward are the first
-- callers, and each must land after this is pushed.

-- ---------------------------------------------------------------------------
-- The caps, per workspace. Not writable by any client: authenticated holds no UPDATE on orgs.
-- ---------------------------------------------------------------------------

alter table public.orgs
  add column ai_import_monthly_cap_usd numeric(10, 2) not null default 10.00,
  add column ai_import_monthly_page_cap integer,
  add constraint orgs_ai_import_monthly_cap_usd_check
    check (ai_import_monthly_cap_usd between 0 and 10000),
  add constraint orgs_ai_import_monthly_page_cap_check
    check (ai_import_monthly_page_cap between 0 and 100000);

-- ---------------------------------------------------------------------------
-- Batches
-- ---------------------------------------------------------------------------

create table public.ai_import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- The quiz the import goes into; null means "a new quiz" (#348).
  bank_id uuid,
  -- Where a new quiz is filed in the library; null means no folder.
  library_folder_id uuid,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  status text not null default 'uploading',
  rights_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_import_batches_status_check
    check (status in ('uploading', 'parsing', 'review', 'imported', 'discarded', 'failed')),
  constraint ai_import_batches_id_org_key unique (id, org_id),
  -- The target quiz and folder are in the batch's own workspace. Deleting either leaves the batch
  -- with no target, not with no workspace.
  constraint ai_import_batches_bank_fkey foreign key (bank_id, org_id)
    references public.item_banks (id, org_id) on delete set null (bank_id),
  constraint ai_import_batches_library_folder_fkey foreign key (library_folder_id, org_id)
    references public.library_folders (id, org_id) on delete set null (library_folder_id)
);
create index ai_import_batches_org_created_idx on public.ai_import_batches (org_id, created_at desc);
create index ai_import_batches_bank_idx on public.ai_import_batches (bank_id, org_id);
create index ai_import_batches_library_folder_idx
  on public.ai_import_batches (library_folder_id, org_id);
create index ai_import_batches_created_by_idx on public.ai_import_batches (created_by);

-- ---------------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------------

create table public.ai_import_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  org_id uuid not null,
  storage_path text generated always as
    (org_id::text || '/' || batch_id::text || '/' || id::text) stored,
  original_name text not null,
  -- Set by the server from the file's bytes (#341), not its name.
  kind text,
  size_bytes bigint,
  sha256 text,
  pages integer,
  status text not null default 'pending',
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_import_files_original_name_check
    check (length(original_name) between 1 and 255),
  constraint ai_import_files_kind_check check (kind in ('pdf', 'docx', 'md', 'txt')),
  constraint ai_import_files_size_check check (size_bytes between 1 and 26214400),
  constraint ai_import_files_sha256_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint ai_import_files_pages_check check (pages between 1 and 100),
  constraint ai_import_files_status_check check (status in ('pending', 'ready', 'rejected')),
  constraint ai_import_files_rejected_reason_check check (length(rejected_reason) <= 200),
  constraint ai_import_files_storage_path_key unique (storage_path),
  constraint ai_import_files_id_org_key unique (id, org_id),
  constraint ai_import_files_id_batch_org_key unique (id, batch_id, org_id),
  constraint ai_import_files_batch_fkey foreign key (batch_id, org_id)
    references public.ai_import_batches (id, org_id) on delete cascade
);
create index ai_import_files_batch_idx on public.ai_import_files (batch_id, org_id);
-- The same document twice in one batch is one document.
create unique index ai_import_files_batch_sha256_key
  on public.ai_import_files (batch_id, sha256) where sha256 is not null;

-- ---------------------------------------------------------------------------
-- Chunks
-- ---------------------------------------------------------------------------

create table public.ai_import_chunks (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null,
  batch_id uuid not null,
  org_id uuid not null,
  position smallint not null,
  page_from smallint,
  page_to smallint,
  status text not null default 'pending',
  attempts smallint not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_import_chunks_position_check check (position between 0 and 999),
  constraint ai_import_chunks_pages_check
    check (page_from between 1 and 100 and page_to between page_from and 100),
  constraint ai_import_chunks_status_check
    check (status in ('pending', 'running', 'done', 'failed')),
  constraint ai_import_chunks_attempts_check check (attempts between 0 and 10),
  constraint ai_import_chunks_tokens_check check (input_tokens >= 0 and output_tokens >= 0),
  constraint ai_import_chunks_last_error_check check (length(last_error) <= 500),
  constraint ai_import_chunks_file_position_key unique (file_id, position),
  constraint ai_import_chunks_id_batch_org_key unique (id, batch_id, org_id),
  constraint ai_import_chunks_file_fkey foreign key (file_id, batch_id, org_id)
    references public.ai_import_files (id, batch_id, org_id) on delete cascade
);
-- How a batch's pending chunks are found, and the key's columns minus the leading file_id.
create index ai_import_chunks_batch_status_idx on public.ai_import_chunks (batch_id, status);
create index ai_import_chunks_file_batch_org_idx
  on public.ai_import_chunks (file_id, batch_id, org_id);

-- ---------------------------------------------------------------------------
-- Staged entries
-- ---------------------------------------------------------------------------

create table public.ai_import_entries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  org_id uuid not null,
  chunk_id uuid,
  -- Order in the source, across files and chunks.
  position integer not null,
  kind text not null default 'item',
  -- The learn.v1 item type; null for a case study, or for a question with no NGN type.
  type text,
  status text not null,
  reasons text[] not null default '{}',
  source_excerpt text not null default '',
  -- The model's loose draft (src/lib/ngn/draft) and the learn.v1 item built from it. Both hold
  -- answer keys.
  draft jsonb,
  item jsonb,
  -- A case study's grouping and step, as the segment pass saw them (#344).
  group_key text,
  step smallint,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_import_entries_position_check check (position >= 0),
  constraint ai_import_entries_kind_check check (kind in ('item', 'case_study')),
  constraint ai_import_entries_type_check check (type in (
    'multiple_choice', 'multiple_response', 'multiple_response_grouping',
    'matrix_multiple_choice', 'matrix_multiple_response', 'dropdown_cloze',
    'dropdown_rationale', 'dropdown_table', 'highlight_text', 'highlight_table',
    'dragdrop_cloze', 'dragdrop_rationale', 'ordered_response', 'bowtie')),
  constraint ai_import_entries_status_check
    check (status in ('ready', 'needs_answer', 'needs_fix', 'not_importable', 'dropped')),
  constraint ai_import_entries_reasons_check check (cardinality(reasons) <= 20),
  constraint ai_import_entries_source_excerpt_check check (length(source_excerpt) <= 20000),
  constraint ai_import_entries_draft_size_check check (pg_column_size(draft) <= 262144),
  constraint ai_import_entries_item_size_check check (pg_column_size(item) <= 262144),
  constraint ai_import_entries_group_key_check check (length(group_key) between 1 and 80),
  constraint ai_import_entries_step_check check (step between 1 and 6),
  constraint ai_import_entries_version_check check (version >= 1),
  constraint ai_import_entries_batch_fkey foreign key (batch_id, org_id)
    references public.ai_import_batches (id, org_id) on delete cascade,
  -- A chunk of the entry's own batch. Re-chunking a file drops the link, not the entry the
  -- teacher may have edited.
  constraint ai_import_entries_chunk_fkey foreign key (chunk_id, batch_id, org_id)
    references public.ai_import_chunks (id, batch_id, org_id) on delete set null (chunk_id)
);
create index ai_import_entries_batch_position_idx
  on public.ai_import_entries (batch_id, org_id, position);
create index ai_import_entries_chunk_idx
  on public.ai_import_entries (chunk_id, batch_id, org_id);

-- ---------------------------------------------------------------------------
-- Usage: one row per workspace and month, and the per-call ledger
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  org_id uuid not null references public.orgs (id) on delete cascade,
  month date not null,
  pages_reserved integer not null default 0,
  pages_used integer not null default 0,
  cost_reserved_usd numeric(12, 6) not null default 0,
  cost_used_usd numeric(12, 6) not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  calls integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (org_id, month),
  constraint ai_usage_month_check check (extract(day from month) = 1),
  constraint ai_usage_counts_check check (
    pages_reserved >= 0 and pages_used >= 0 and cost_reserved_usd >= 0 and cost_used_usd >= 0
    and input_tokens >= 0 and output_tokens >= 0 and calls >= 0)
);

create table private.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  month date not null,
  batch_id uuid references public.ai_import_batches (id) on delete set null,
  pages_reserved integer not null,
  cost_reserved_usd numeric(12, 6) not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  pages_used integer,
  input_tokens integer,
  output_tokens integer,
  cost_used_usd numeric(12, 6),
  constraint ai_usage_reservations_usage_fkey foreign key (org_id, month)
    references public.ai_usage (org_id, month) on delete cascade
);
create index ai_usage_reservations_org_month_idx
  on private.ai_usage_reservations (org_id, month);
create index ai_usage_reservations_batch_idx on private.ai_usage_reservations (batch_id);

alter table private.ai_usage_reservations enable row level security;
revoke all on private.ai_usage_reservations from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers: timestamps, versions, and the batch limits
-- ---------------------------------------------------------------------------

create trigger ai_import_batches_updated_at before update on public.ai_import_batches
  for each row execute function private.set_updated_at();
create trigger ai_import_files_updated_at before update on public.ai_import_files
  for each row execute function private.set_updated_at();
create trigger ai_import_chunks_updated_at before update on public.ai_import_chunks
  for each row execute function private.set_updated_at();

create function private.bump_ai_import_entry_version() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end
$$;
revoke all on function private.bump_ai_import_entry_version() from public, anon, authenticated;

create trigger ai_import_entries_version before update on public.ai_import_entries
  for each row execute function private.bump_ai_import_entry_version();

-- At most 20 batches per workspace are open (not yet imported, discarded or failed). A
-- transaction-level advisory lock per workspace serializes two inserts at once; it does not touch
-- the org row, which the workspace sweep locks with NOWAIT.
create function private.guard_ai_import_batch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A closed batch is not counted; neither is an update that leaves an open batch open.
  if new.status not in ('uploading', 'parsing', 'review')
     or (tg_op = 'UPDATE' and old.status in ('uploading', 'parsing', 'review')) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('learn.ai_import_batches'), hashtext(new.org_id::text));
  if (select count(*) from public.ai_import_batches b
       where b.org_id = new.org_id and b.status in ('uploading', 'parsing', 'review')) >= 20 then
    raise exception 'a workspace has at most 20 open AI import batches' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.guard_ai_import_batch() from public, anon, authenticated;

create trigger ai_import_batches_limit before insert or update of status
  on public.ai_import_batches
  for each row execute function private.guard_ai_import_batch();

-- At most 5 files and 100 pages per batch, and files are added only while it is uploading. The
-- batch row is locked first, so two files added at once are counted one after the other.
create function private.guard_ai_import_file() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  batch_status text;
begin
  select b.status into batch_status
    from public.ai_import_batches b
   where b.id = new.batch_id and b.org_id = new.org_id
     for update;
  if batch_status is null then
    raise exception 'that batch does not exist in this workspace' using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    if batch_status <> 'uploading' then
      raise exception 'files are added to a batch only while it is uploading'
        using errcode = '23514';
    end if;
    if (select count(*) from public.ai_import_files f where f.batch_id = new.batch_id) >= 5 then
      raise exception 'a batch holds at most 5 files' using errcode = '23514';
    end if;
  elsif new.batch_id is distinct from old.batch_id or new.org_id is distinct from old.org_id then
    raise exception 'a file cannot move to another batch' using errcode = '22023';
  end if;

  if coalesce(new.pages, 0) + coalesce((
       select sum(f.pages) from public.ai_import_files f
        where f.batch_id = new.batch_id and f.id <> new.id), 0) > 100 then
    raise exception 'a batch holds at most 100 pages' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.guard_ai_import_file() from public, anon, authenticated;

create trigger ai_import_files_limit before insert or update of pages, batch_id, org_id
  on public.ai_import_files
  for each row execute function private.guard_ai_import_file();

-- At most 150 staged entries per batch.
create function private.guard_ai_import_entry() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.ai_import_batches b
   where b.id = new.batch_id and b.org_id = new.org_id
     for update;
  if not found then
    raise exception 'that batch does not exist in this workspace' using errcode = '23503';
  end if;
  if (select count(*) from public.ai_import_entries e where e.batch_id = new.batch_id) >= 150 then
    raise exception 'a batch holds at most 150 questions' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.guard_ai_import_entry() from public, anon, authenticated;

create trigger ai_import_entries_limit before insert on public.ai_import_entries
  for each row execute function private.guard_ai_import_entry();

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.ai_import_batches, public.ai_import_files, public.ai_import_chunks,
  public.ai_import_entries, public.ai_usage from anon;
revoke all on public.ai_import_batches, public.ai_import_files, public.ai_import_chunks,
  public.ai_import_entries, public.ai_usage from authenticated;

-- A teacher makes a batch with a workspace and an optional target, retargets it, or discards it.
-- Status, creator and the rights time are the server's and the defaults'.
grant select, delete on public.ai_import_batches to authenticated;
grant insert (org_id, bank_id, library_folder_id) on public.ai_import_batches to authenticated;
grant update (bank_id, library_folder_id) on public.ai_import_batches to authenticated;
-- Files, chunks and usage are read-only to a teacher.
grant select on public.ai_import_files, public.ai_import_chunks, public.ai_usage
  to authenticated;
-- A teacher reviews and edits entries (#346, #347): changes the type, fixes the draft or item,
-- or drops one. The pipeline inserts them.
grant select on public.ai_import_entries to authenticated;
grant update (type, draft, item, status) on public.ai_import_entries to authenticated;

alter table public.ai_import_batches enable row level security;
alter table public.ai_import_files enable row level security;
alter table public.ai_import_chunks enable row level security;
alter table public.ai_import_entries enable row level security;
alter table public.ai_usage enable row level security;

create policy "authors read AI import batches" on public.ai_import_batches
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

-- Only in a workspace with AI import on. Authors read their own org row ("authors read their
-- org"), so this sub-select runs under that policy.
create policy "authors start AI import batches" on public.ai_import_batches
  for insert to authenticated
  with check (
    (select private.is_author())
    and org_id = (select private.current_org_id())
    and exists (select 1 from public.orgs o
                where o.id = ai_import_batches.org_id and o.ai_import_enabled)
  );

-- Only while the batch is open: an imported, discarded or failed batch is final.
create policy "authors retarget AI import batches" on public.ai_import_batches
  for update to authenticated
  using (
    (select private.is_author())
    and org_id = (select private.current_org_id())
    and status in ('uploading', 'parsing', 'review')
  )
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors discard AI import batches" on public.ai_import_batches
  for delete to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors read AI import files" on public.ai_import_files
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors read AI import chunks" on public.ai_import_chunks
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors read AI import entries" on public.ai_import_entries
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

-- Only while the batch is in review: not while the pipeline is still writing it, nor after it is
-- imported or discarded. The import (#348) validates every entry again on the server; a
-- teacher's "ready" is a request, not a proof.
create policy "authors edit AI import entries" on public.ai_import_entries
  for update to authenticated
  using (
    (select private.is_author())
    and org_id = (select private.current_org_id())
    and exists (select 1 from public.ai_import_batches b
                 where b.id = ai_import_entries.batch_id and b.org_id = ai_import_entries.org_id
                   and b.status = 'review')
  )
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors read AI usage" on public.ai_usage
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

-- ---------------------------------------------------------------------------
-- The cap: reserve before a call, settle after it
-- ---------------------------------------------------------------------------

create function public.reserve_ai_usage(
  p_org uuid,
  p_pages integer,
  p_cost_usd numeric,
  p_batch uuid default null
)
returns table (
  allowed boolean,
  reason text,
  reservation_id uuid,
  remaining_usd numeric,
  remaining_pages integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  this_month date := date_trunc('month', now() at time zone 'utc')::date;
  enabled boolean;
  cap_usd numeric;
  cap_pages integer;
  month_row public.ai_usage%rowtype;
  committed_usd numeric;
  committed_pages integer;
  new_id uuid;
begin
  if p_org is null then
    raise exception 'reserve_ai_usage: the workspace is required' using errcode = '22023';
  end if;
  if p_pages is null or p_pages not between 0 and 1000 then
    raise exception 'reserve_ai_usage: pages must be between 0 and 1000' using errcode = '22023';
  end if;
  if p_cost_usd is null or p_cost_usd < 0 or p_cost_usd > 100 then
    raise exception 'reserve_ai_usage: cost_usd must be between 0 and 100'
      using errcode = '22023';
  end if;

  select o.ai_import_enabled, o.ai_import_monthly_cap_usd, o.ai_import_monthly_page_cap
    into enabled, cap_usd, cap_pages
    from public.orgs o
   where o.id = p_org;
  if not found then
    raise exception 'reserve_ai_usage: no such workspace' using errcode = 'P0002';
  end if;
  if p_batch is not null and not exists (
    select 1 from public.ai_import_batches b where b.id = p_batch and b.org_id = p_org
  ) then
    raise exception 'reserve_ai_usage: that batch is not in this workspace'
      using errcode = '22023';
  end if;
  -- AI import is off for this workspace (#355): nothing is reserved, and no row is made.
  if not enabled then
    return query select false, 'disabled'::text, null::uuid, null::numeric, null::integer;
    return;
  end if;

  -- The month's row, made if needed and then locked: every reservation and settlement for this
  -- workspace and month queues here, so the check and the increment below are one step.
  insert into public.ai_usage (org_id, month) values (p_org, this_month)
    on conflict (org_id, month) do nothing;
  select * into month_row from public.ai_usage u
   where u.org_id = p_org and u.month = this_month
     for update;

  committed_usd := month_row.cost_used_usd + month_row.cost_reserved_usd;
  committed_pages := month_row.pages_used + month_row.pages_reserved;

  if committed_usd + p_cost_usd > cap_usd
     or (cap_pages is not null and committed_pages + p_pages > cap_pages) then
    return query select false, 'cap_reached'::text, null::uuid,
      greatest(cap_usd - committed_usd, 0),
      case when cap_pages is null then null else greatest(cap_pages - committed_pages, 0) end;
    return;
  end if;

  update public.ai_usage u
     set cost_reserved_usd = u.cost_reserved_usd + p_cost_usd,
         pages_reserved = u.pages_reserved + p_pages,
         updated_at = now()
   where u.org_id = p_org and u.month = this_month;

  insert into private.ai_usage_reservations
    (org_id, month, batch_id, pages_reserved, cost_reserved_usd)
  values (p_org, this_month, p_batch, p_pages, p_cost_usd)
  returning id into new_id;

  return query select true, 'ok'::text, new_id,
    greatest(cap_usd - committed_usd - p_cost_usd, 0),
    case when cap_pages is null then null
         else greatest(cap_pages - committed_pages - p_pages, 0) end;
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, integer, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, integer, numeric, uuid) to service_role;

create function public.settle_ai_usage(
  p_reservation uuid,
  p_pages integer,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_usd numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r private.ai_usage_reservations%rowtype;
begin
  if p_pages is null or p_pages not between 0 and 1000
     or p_input_tokens is null or p_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_cost_usd is null or p_cost_usd < 0 or p_cost_usd > 100 then
    raise exception 'settle_ai_usage: pages, tokens and cost must be zero or more, within bounds'
      using errcode = '22023';
  end if;

  select * into r from private.ai_usage_reservations x where x.id = p_reservation;
  if not found then
    raise exception 'settle_ai_usage: no such reservation' using errcode = 'P0002';
  end if;

  -- Same lock order as reserve_ai_usage: the month's row first, then the reservation.
  perform 1 from public.ai_usage u
   where u.org_id = r.org_id and u.month = r.month
     for update;
  select * into r from private.ai_usage_reservations x where x.id = p_reservation for update;
  if r.settled_at is not null then
    return false;
  end if;

  update private.ai_usage_reservations x
     set settled_at = now(),
         pages_used = p_pages,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         cost_used_usd = p_cost_usd
   where x.id = p_reservation;

  update public.ai_usage u
     set cost_reserved_usd = greatest(u.cost_reserved_usd - r.cost_reserved_usd, 0),
         pages_reserved = greatest(u.pages_reserved - r.pages_reserved, 0),
         cost_used_usd = u.cost_used_usd + p_cost_usd,
         pages_used = u.pages_used + p_pages,
         input_tokens = u.input_tokens + p_input_tokens,
         output_tokens = u.output_tokens + p_output_tokens,
         calls = u.calls + 1,
         updated_at = now()
   where u.org_id = r.org_id and u.month = r.month;

  return true;
end;
$$;

revoke all on function public.settle_ai_usage(uuid, integer, integer, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.settle_ai_usage(uuid, integer, integer, integer, numeric)
  to service_role;

-- ---------------------------------------------------------------------------
-- Storage: a private bucket, written only at a path the server registered
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-imports',
  'ai-imports',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/x-markdown',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "ai-imports: authors upload a registered file" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ai-imports'
    and (select private.is_author())
    and exists (
      select 1
        from public.ai_import_files f
        join public.ai_import_batches b on b.id = f.batch_id and b.org_id = f.org_id
       where f.storage_path = objects.name
         and f.org_id = (select private.current_org_id())
         -- Only before the server has checked the bytes: once a file is ready (or rejected), its
         -- object cannot be deleted and put back with other content under the same name.
         and f.status = 'pending'
         and b.status = 'uploading'
    )
  );

create policy "ai-imports: authors read their workspace's files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ai-imports'
    and (select private.is_author())
    and (storage.foldername(objects.name))[1] = (select private.current_org_id())::text
  );

create policy "ai-imports: authors delete their workspace's files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ai-imports'
    and (select private.is_author())
    and (storage.foldername(objects.name))[1] = (select private.current_org_id())::text
  );

-- ---------------------------------------------------------------------------
-- The abandoned-workspace sweep (ADR 0012). A workspace's batches go with its row in orgs (on
-- delete cascade). A batch made by a teacher who has since moved to another workspace names that
-- account, so it stops the account's deletion as a library folder does. The function is as
-- 20261014000000 left it, with one line added for ai_import_batches.
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
      or exists (select 1 from public.ai_import_batches ab
                  where ab.created_by = p_user and ab.org_id <> p_org)
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
