-- A whole-quiz assignment plays each case study in place (#470).
--
-- 20261022000000 made a whole-quiz live session run the quiz in its order with each ready case
-- study expanded in place into its steps, and snapshot each case study's record beside its place
-- in the set (sessions.case_study_records). This does the same for an assignment of a whole quiz,
-- as owner decision 2026-10-21 asks: each case study plays at its place, as its steps, with its
-- patient record, exactly as a case study assigned on its own does.
--
-- ---------------------------------------------------------------------------
-- What changes
-- ---------------------------------------------------------------------------
--
--   * private.snapshot_assignment: a quiz's item set is private.quiz_run_set (the live session's
--     own), and assignments.case_study_records is written beside it, in the same shape as
--     sessions.case_study_records: { case_study_id, title, first_position, step_count, record }.
--     A case study assigned on its own is unchanged: its one record stays on patient_record.
--   * private.case_study_runs: the matching both snapshots now share. It finds, in an item set,
--     each run of positions that is exactly one of the quiz's case studies in step order, and
--     answers with the entries above, or null for none. snapshot_session_record calls it too, so
--     a live session and an assignment can never place a case study differently.
--   * private.guard_assignment_change: the column cannot change once written, as patient_record.
--
-- ---------------------------------------------------------------------------
-- Who reads the column
-- ---------------------------------------------------------------------------
--
-- Like patient_record (20261014200000), it is not granted to `authenticated`: the grant on
-- public.assignments is a list of columns, and this one is not added to it. A student's own client
-- could otherwise read every step's chart before answering a single step. The take-home page reads
-- it with the service role, for an assignment the student's own client has just read under row
-- level security, and sends only the chart of each step the student has reached. The assignment
-- report reads it the same way, after the author's own read has found the assignment, for the case
-- studies' titles and places only.
--
-- Attempts and scoring need nothing new: an attempt's answers are keyed by item, and a submit
-- scores the item set, whatever it holds.
--
-- Deploy order: the app reads the column by name and falls back to patient_record alone when it
-- is missing, so either may go first. Safe to replay on a fresh project: one column, one new
-- function, three functions replaced with the same signatures.

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------

alter table public.assignments
  add column case_study_records jsonb
    check (case_study_records is null or jsonb_typeof(case_study_records) = 'array');

comment on column public.assignments.case_study_records is
  'For an assignment of a whole quiz, each case study it plays in place: case_study_id, title, '
  'first_position, step_count and its patient record as it was on insert. Null when none plays, '
  'and for a case study assigned on its own (see patient_record). Written only by '
  'private.snapshot_assignment; not granted to authenticated (#470, as #335 for patient_record).';

-- ---------------------------------------------------------------------------
-- The case studies an item set plays, shared by both snapshots
-- ---------------------------------------------------------------------------

-- 20261022000000's loop, lifted out of private.snapshot_session_record unchanged. Security definer
-- for the reason it had there: what the inserting role may read must not decide what is found, so
-- the quiz and the org are matched explicitly instead.
create function private.case_study_runs(target_bank uuid, target_org uuid, item_set jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_run record;
  runs jsonb := '[]'::jsonb;
  covered integer := 0;
begin
  if target_bank is null or jsonb_typeof(item_set) is distinct from 'array' then
    return null;
  end if;

  -- Every place in the set where one of the quiz's case studies starts with its first step and
  -- runs through its last, in order. Earliest place first; at one place, earliest in the quiz.
  for found_run in
    select cs.id, cs.title, cs.ehr, s.steps, place.ord::integer as first_position
      from jsonb_array_elements(item_set) with ordinality as place(v, ord)
      join public.case_study_items head
        on head.bank_id = target_bank and head.item_id::text = place.v #>> '{}'
      join public.case_studies cs on cs.id = head.case_study_id
     cross join lateral (
       select jsonb_agg(csi.item_id order by csi.position) as steps,
              min(csi.position) as first_step
         from public.case_study_items csi
        where csi.case_study_id = cs.id
     ) s
     where jsonb_typeof(place.v) = 'string'
       and cs.bank_id = target_bank
       and cs.org_id = target_org
       and head.position = s.first_step
       and (select jsonb_agg(item_set -> (place.ord::integer - 1 + k) order by k)
              from generate_series(0, jsonb_array_length(s.steps) - 1) k) = s.steps
     order by place.ord, cs.quiz_position, cs.created_at, cs.id
  loop
    if found_run.first_position > covered then
      runs := runs || jsonb_build_array(jsonb_build_object(
        'case_study_id', found_run.id,
        'title', found_run.title,
        'first_position', found_run.first_position,
        'step_count', jsonb_array_length(found_run.steps),
        'record', case when jsonb_typeof(found_run.ehr) = 'object' then found_run.ehr end
      ));
      covered := found_run.first_position + jsonb_array_length(found_run.steps) - 1;
    end if;
  end loop;

  return case when jsonb_array_length(runs) > 0 then runs end;
end;
$$;

revoke all on function private.case_study_runs(uuid, uuid, jsonb) from public, anon, authenticated;

-- 20261022000000's function, with its loop now private.case_study_runs. Nothing else changes.
create or replace function private.snapshot_session_record() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.patient_record := null;
  new.case_study_records := null;

  if new.case_study_id is not null then
    select c.ehr into new.patient_record
      from public.case_studies c
     where c.id = new.case_study_id and c.org_id = new.org_id;
    -- An empty or malformed record is no record: the phone shows the step on its own.
    if new.patient_record is not null and jsonb_typeof(new.patient_record) <> 'object' then
      new.patient_record := null;
    end if;
    return new;
  end if;

  new.case_study_records := private.case_study_runs(new.bank_id, new.org_id, new.item_set);
  return new;
end;
$$;

revoke all on function private.snapshot_session_record() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The assignment snapshot
-- ---------------------------------------------------------------------------

-- 20261021000000's trigger function, with a quiz's set read from private.quiz_run_set and its
-- case studies' records written beside it. A case study assigned on its own is unchanged.
create or replace function private.snapshot_assignment() returns trigger
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

  new.case_study_records := null;

  if new.bank_id is not null then
    select b.name into source_title
      from public.item_banks b where b.id = new.bank_id and b.org_id = new.org_id;
    if not found then
      raise exception 'that bank does not exist' using errcode = 'P0002';
    end if;
    -- The quiz in its order (#468), each ready case study in place as its steps (#470), as a
    -- whole-quiz live session runs it. A draft question, and a case study not ready, are left out.
    chosen := private.quiz_run_set(new.bank_id, new.org_id);
    record_snapshot := null;
    new.case_study_records := private.case_study_runs(new.bank_id, new.org_id, chosen);
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

-- ---------------------------------------------------------------------------
-- The editing rules: the records are as fixed as the set they describe
-- ---------------------------------------------------------------------------

-- 20260924020000's function with case_study_records added beside patient_record.
create or replace function private.guard_assignment_change() returns trigger
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
     or new.case_study_records is distinct from old.case_study_records
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

  -- Closed is final. Keys and rationales reach students at close (#210), so moving the close time
  -- later again would reopen the assignment to people who have read the answers.
  if old.closes_at <= now() and new.closes_at <> old.closes_at then
    raise exception 'that assignment has closed and cannot reopen' using errcode = '22023';
  end if;

  if new.closes_at <> old.closes_at and new.closes_at <= now() then
    raise exception 'an assignment cannot close in the past' using errcode = '22023';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.guard_assignment_change() from public, anon, authenticated;
