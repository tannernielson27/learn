-- Assignments (#207): a bank or a case study given to a class, with a window and an attempt limit.
--
-- An author of the org assigns a source to one of the org's classes, with an open time, a close
-- time and 1 to 3 attempts (owner decision 2026-09-23: one by default, up to three, the best one
-- counts; the counting is #208/#211). A student reads the assignments of the classes they are a
-- current member of, and only once they have opened. Taking one is #208; nothing here stores an
-- attempt.
--
-- ---------------------------------------------------------------------------
-- What is snapshotted, and why it carries no key
-- ---------------------------------------------------------------------------
--
-- Like a live session (#128, #184), the assignment keeps its own copy of what it is made of,
-- taken when it is created: `item_set` (an array of item ids, published items only, in the order
-- the bank lists them or the case study's step order) and, for a case study, `patient_record` (the
-- EHR as it was then). Editing or deleting the bank afterwards does not change what the class was
-- given. Both are written by a trigger on every insert, whatever the insert carried, so no client
-- chooses them, and neither is granted for update.
--
-- Neither holds a key. `item_set` is ids only: the items themselves stay behind the authoring RLS a
-- student never passes. The patient record is not answer-bearing (docs/01-NGN-ITEM-SPEC.md,
-- `ITEM_FIELD_VISIBILITY.ehr`). So the student's read can be the row itself, under RLS, rather than
-- a function; the pgTAP proves the row carries no answer key with a control where the key exists.
--
-- ---------------------------------------------------------------------------
-- The editing rules, in the database
-- ---------------------------------------------------------------------------
--
--   * Until it opens: the window, the attempts and the shuffle setting may all change.
--   * Once it has opened: only the close time, so nobody's attempt limit or options change under
--     them mid-assignment.
--   * A close time is never moved into the past (by an edit or on creation). Closing retroactively
--     would rewrite the window students were given.
--   * Deleting is possible only before it opens, through the delete policy's `opens_at > now()`.
--     A policy rather than a trigger so a class or org deleted by the owner still cascades.
--
-- The source, the class, the snapshot and the title never change. The one exception is the
-- foreign keys' own ON DELETE SET NULL (a deleted source or creator), passed through exactly as
-- `private.guard_session_change` does for sessions.
--
-- ---------------------------------------------------------------------------
-- Rate limit
-- ---------------------------------------------------------------------------
--
-- Every insert, update and delete is charged one `save` through private.charge_save_write, the
-- same counter as the editor (#123), so the table is bounded at the write whether it arrives
-- through the Server Action or straight through PostgREST (authoring_trigger_coverage.test.sql).
--
-- Safe to replay on a fresh project: a new table, new functions, and one new unique constraint on
-- public.classes, which (id) being the primary key already guarantees holds.

-- Lets the assignment require a class in its own org, the composite pattern sessions use for banks.
alter table public.classes
  add constraint classes_id_org_key unique (id, org_id);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default private.current_org_id()
    references public.orgs (id) on delete cascade,
  class_id uuid not null,
  -- Exactly one source when created (the trigger requires it); at most one afterwards, because
  -- the assignment outlives a deleted bank the way a session does.
  bank_id uuid,
  case_study_id uuid,
  title text not null check (length(btrim(title)) between 1 and 200),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  max_attempts smallint not null default 1 check (max_attempts between 1 and 3),
  -- #209: shuffle each item's options per student. Stored here so #208 can apply it.
  shuffle_options boolean not null default true,
  item_set jsonb not null default '[]'::jsonb check (jsonb_typeof(item_set) = 'array'),
  patient_record jsonb
    check (patient_record is null or jsonb_typeof(patient_record) = 'object'),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignments_window check (closes_at > opens_at),
  constraint assignments_one_source check (num_nonnulls(bank_id, case_study_id) <= 1),
  constraint assignments_class_org_fkey foreign key (class_id, org_id)
    references public.classes (id, org_id) on delete cascade,
  constraint assignments_bank_org_fkey foreign key (bank_id, org_id)
    references public.item_banks (id, org_id) on delete set null (bank_id),
  constraint assignments_case_org_fkey foreign key (case_study_id, org_id)
    references public.case_studies (id, org_id) on delete set null (case_study_id),
  -- Lets #208's attempts require an assignment in their own org.
  constraint assignments_id_org_key unique (id, org_id)
);

create index assignments_org_id_idx on public.assignments (org_id);
create index assignments_class_opens_idx on public.assignments (class_id, opens_at);
create index assignments_bank_id_idx on public.assignments (bank_id);
create index assignments_case_study_id_idx on public.assignments (case_study_id);
create index assignments_created_by_idx on public.assignments (created_by);

comment on column public.assignments.item_set is
  'Item ids, snapshotted on insert by private.snapshot_assignment. Never answer keys.';
comment on column public.assignments.patient_record is
  'The case study''s EHR as it was on insert, or null for a bank. Not answer-bearing.';

-- ---------------------------------------------------------------------------
-- The snapshot, on every insert
-- ---------------------------------------------------------------------------

-- Security definer so the snapshot does not depend on what the inserting role may read; the source
-- is matched to the row's org explicitly, which the composite keys restate. The same refusals as
-- public.start_session: no source, a source that is gone, an unpublished case study or step, and a
-- source with nothing published.
create function private.snapshot_assignment() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  source_title text;
  source_status public.content_status;
  record_snapshot jsonb;
  chosen jsonb;
begin
  if num_nonnulls(new.bank_id, new.case_study_id) <> 1 then
    raise exception 'assign either a bank or a case study' using errcode = '22023';
  end if;

  if new.bank_id is not null then
    select b.name into source_title
      from public.item_banks b where b.id = new.bank_id and b.org_id = new.org_id;
    if not found then
      raise exception 'that bank does not exist' using errcode = 'P0002';
    end if;
    select coalesce(jsonb_agg(i.id order by i.created_at, i.id), '[]'::jsonb) into chosen
      from public.items i
     where i.bank_id = new.bank_id and i.org_id = new.org_id and i.status = 'published';
    record_snapshot := null;
  else
    select c.title, c.status, c.ehr into source_title, source_status, record_snapshot
      from public.case_studies c where c.id = new.case_study_id and c.org_id = new.org_id;
    if not found then
      raise exception 'that case study does not exist' using errcode = 'P0002';
    end if;
    if source_status <> 'published' then
      raise exception 'that case study is not published' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.case_study_items csi
        join public.items i on i.id = csi.item_id
       where csi.case_study_id = new.case_study_id and i.status <> 'published'
    ) then
      raise exception 'that case study has a step that is not published' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(csi.item_id order by csi.position), '[]'::jsonb) into chosen
      from public.case_study_items csi
     where csi.case_study_id = new.case_study_id;
    if record_snapshot is not null and jsonb_typeof(record_snapshot) <> 'object' then
      record_snapshot := null;
    end if;
  end if;

  if jsonb_array_length(chosen) = 0 then
    raise exception 'that source has no published items to assign' using errcode = '22023';
  end if;
  if new.closes_at <= now() then
    raise exception 'an assignment cannot close in the past' using errcode = '22023';
  end if;

  new.item_set := chosen;
  new.patient_record := record_snapshot;
  -- The author may name it; blank means the source's own name.
  new.title := coalesce(nullif(btrim(new.title), ''), left(source_title, 200));
  new.created_by := (select auth.uid());
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.snapshot_assignment() from public, anon, authenticated;

create trigger assignments_snapshot before insert on public.assignments
  for each row execute function private.snapshot_assignment();

-- ---------------------------------------------------------------------------
-- The editing rules, on every update
-- ---------------------------------------------------------------------------

create function private.guard_assignment_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- A foreign key clearing a pointer (a source or the creator deleted): nothing else differs and
  -- every changed column became null. Reachable only by the referential action, since no client
  -- holds an update privilege on any of the three columns.
  if to_jsonb(new) - array['bank_id', 'case_study_id', 'created_by']
       = to_jsonb(old) - array['bank_id', 'case_study_id', 'created_by']
     and (new.bank_id is not distinct from old.bank_id or new.bank_id is null)
     and (new.case_study_id is not distinct from old.case_study_id or new.case_study_id is null)
     and (new.created_by is not distinct from old.created_by or new.created_by is null) then
    return new;
  end if;

  if new.id <> old.id
     or new.org_id <> old.org_id
     or new.class_id <> old.class_id
     or new.bank_id is distinct from old.bank_id
     or new.case_study_id is distinct from old.case_study_id
     or new.title <> old.title
     or new.item_set <> old.item_set
     or new.patient_record is distinct from old.patient_record
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'an assignment''s class, source, items and title cannot change'
      using errcode = '22023';
  end if;

  if old.opens_at <= now() and (
       new.opens_at <> old.opens_at
       or new.max_attempts <> old.max_attempts
       or new.shuffle_options <> old.shuffle_options
     ) then
    raise exception 'that assignment has opened: only its close time can change'
      using errcode = '22023';
  end if;

  if new.closes_at <> old.closes_at and new.closes_at <= now() then
    raise exception 'an assignment cannot close in the past' using errcode = '22023';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.guard_assignment_change() from public, anon, authenticated;

create trigger assignments_guard_change before update on public.assignments
  for each row execute function private.guard_assignment_change();

-- The authoring limit at the write (#123, #161).
create trigger assignments_charge_authoring
  after insert or update or delete on public.assignments
  for each row execute function private.charge_save_write();

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

-- Supabase's default privileges hand anon and authenticated full DML on a new public table.
revoke all on public.assignments from anon, authenticated;

grant select on public.assignments to authenticated;
-- The org, creator, snapshot and timestamps come from defaults and the trigger.
grant insert (class_id, bank_id, case_study_id, title, opens_at, closes_at, max_attempts,
              shuffle_options)
  on public.assignments to authenticated;
grant update (opens_at, closes_at, max_attempts, shuffle_options)
  on public.assignments to authenticated;
grant delete on public.assignments to authenticated;

alter table public.assignments enable row level security;

create policy "authors read their org's assignments" on public.assignments
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

-- A current member only (a removed student's membership row is gone), and only once it has opened.
-- The membership lookup runs as the student, whose class_members policy shows them their own rows.
create policy "students read their classes' open assignments" on public.assignments
  for select to authenticated
  using (
    opens_at <= now()
    and exists (
      select 1 from public.class_members m
       where m.class_id = assignments.class_id
         and m.profile_id = (select auth.uid())
    )
  );

create policy "authors assign in their org" on public.assignments
  for insert to authenticated
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors edit their org's assignments" on public.assignments
  for update to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()))
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

-- Only before it opens: once a student can have seen it, it stays.
create policy "authors delete their org's assignments before they open" on public.assignments
  for delete to authenticated
  using (
    (select private.is_author())
    and org_id = (select private.current_org_id())
    and opens_at > now()
  );
