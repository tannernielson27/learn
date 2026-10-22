-- A whole-quiz live session plays each case study in place (#469).
--
-- Since #468 a quiz keeps one order for its loose questions and its case studies, and a live
-- session of the whole quiz ran only the loose questions. Owner decision 2026-10-21: a whole quiz
-- runs each case study at its place in the quiz order, as its steps, with its patient record, the
-- way a case study run on its own already does (#184, #335).
--
-- ---------------------------------------------------------------------------
-- The item set
-- ---------------------------------------------------------------------------
--
-- private.quiz_run_set is the quiz's run, in quiz order: each published loose question, and each
-- published case study whose steps are all published, expanded in place into its steps in
-- position order. A case study that is not published, has a step that is not, or has no steps at
-- all is skipped, as a draft question is: a whole quiz runs what is ready, and a case study run
-- on its own still refuses a half-published one (start_session's case-study branch is unchanged).
-- A quiz with nothing ready at all is refused as an empty quiz always was. The assignment
-- snapshot reads the same function in a later migration (#470).
--
-- ---------------------------------------------------------------------------
-- The record of each case study
-- ---------------------------------------------------------------------------
--
-- sessions.case_study_records: for a session run from a quiz, one entry per case study the set
-- plays, in set order:
--
--   { "case_study_id": uuid, "title": text, "first_position": integer, "step_count": integer,
--     "record": object | null }
--
-- The case study's steps are the step_count positions from first_position on, and the step a
-- position is at is its offset from first_position plus one: the rule a case-study session already
-- reads its record by (stepAtPosition, the position is the step). `record` is the case study's
-- ehr as it was when the session started, never read again from case_studies while the room runs.
-- Null when no case study plays, and always null for a session run from one case study, which
-- keeps its one record on patient_record exactly as before.
--
-- It is written by the snapshot trigger, private.snapshot_session_record, beside patient_record,
-- and for the same reasons (20260923070000): the trigger sees every insert, including one written
-- straight at the Data API under the host policy, and it overwrites whatever the insert carried,
-- so a client never chooses a record. It finds the case studies in the item set itself: each run
-- of positions that is exactly a case study of the session's quiz, in step order, starting at its
-- first step. start_session's set is built so that every case study it expanded is found; a set
-- written by hand gets the records of the case studies it really plays, and nothing else. Runs
-- never overlap: where two could start at one place (two case studies with the very same steps)
-- the one earlier in the quiz order is taken. `authenticated` has no grant to update the column
-- (its update grants on public.sessions are the room's moves only), so nothing changes it after.
--
-- Like patient_record, the column is not answer-bearing (docs/01-NGN-ITEM-SPEC.md, the ehr is not
-- part of an item's key), and it reaches a participant only cut to a step, through the service
-- role, after the participant cookie has been checked (src/lib/liveSupabase/viewEntries.ts).
--
-- Deploy order: the app reads the column by name, so this migration goes before the app that
-- reads it (docs/05-VERSION-CONTROL-AND-DEPLOY.md section 7.2). Safe to replay on a fresh
-- project: one column, one new function, two functions replaced with the same signatures.

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------

alter table public.sessions
  add column case_study_records jsonb
    check (case_study_records is null or jsonb_typeof(case_study_records) = 'array');

comment on column public.sessions.case_study_records is
  'For a session run from a quiz, each case study it plays in place: case_study_id, title, '
  'first_position, step_count and its patient record as it was when the session started. Null '
  'when none plays, and for a session run from one case study (see patient_record). Written only '
  'by private.snapshot_session_record on insert; see 20261022000000_quiz_case_studies_live.sql.';

-- ---------------------------------------------------------------------------
-- A quiz's run, in quiz order
-- ---------------------------------------------------------------------------

-- Security invoker: start_session calls it as the teacher, whose row level security already
-- limits it to their workspace, and the assignment snapshot (a security definer trigger) names
-- the org itself. The org is matched here too, so neither caller depends on the other's check.
create function private.quiz_run_set(target_bank uuid, target_org uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with entries as (
    select i.quiz_position, i.created_at, i.id as entry_id, jsonb_build_array(i.id) as ids
      from public.items i
     where i.bank_id = target_bank
       and i.org_id = target_org
       and i.status = 'published'
       and not exists (select 1 from public.case_study_items csi where csi.item_id = i.id)
    union all
    select cs.quiz_position, cs.created_at, cs.id,
           (select jsonb_agg(csi.item_id order by csi.position)
              from public.case_study_items csi
             where csi.case_study_id = cs.id)
      from public.case_studies cs
     where cs.bank_id = target_bank
       and cs.org_id = target_org
       and cs.status = 'published'
       and exists (select 1 from public.case_study_items csi where csi.case_study_id = cs.id)
       and not exists (
         select 1 from public.case_study_items csi
           join public.items i on i.id = csi.item_id
          where csi.case_study_id = cs.id and i.status <> 'published'
       )
  )
  select coalesce(
           jsonb_agg(step.id order by e.quiz_position, e.created_at, e.entry_id, step.n),
           '[]'::jsonb
         )
    from entries e
   cross join lateral jsonb_array_elements(e.ids) with ordinality as step(id, n);
$$;

revoke all on function private.quiz_run_set(uuid, uuid) from public, anon;
grant execute on function private.quiz_run_set(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The snapshot: one record for a case study's session, one per case study for a quiz's
-- ---------------------------------------------------------------------------

-- 20260923070000's function, with the quiz's case studies added. A case-study session is
-- unchanged. Security definer for the reason it always was: the snapshot must not depend on what
-- the inserting role may read, so the org and the quiz are matched explicitly instead.
create or replace function private.snapshot_session_record() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  found_run record;
  runs jsonb := '[]'::jsonb;
  covered integer := 0;
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

  if new.bank_id is null or jsonb_typeof(new.item_set) <> 'array' then
    return new;
  end if;

  -- Every place in the set where one of the quiz's case studies starts with its first step and
  -- runs through its last, in order. Earliest place first; at one place, earliest in the quiz.
  for found_run in
    select cs.id, cs.title, cs.ehr, s.steps, place.ord::integer as first_position
      from jsonb_array_elements(new.item_set) with ordinality as place(v, ord)
      join public.case_study_items head
        on head.bank_id = new.bank_id and head.item_id::text = place.v #>> '{}'
      join public.case_studies cs on cs.id = head.case_study_id
     cross join lateral (
       select jsonb_agg(csi.item_id order by csi.position) as steps,
              min(csi.position) as first_step
         from public.case_study_items csi
        where csi.case_study_id = cs.id
     ) s
     where jsonb_typeof(place.v) = 'string'
       and cs.bank_id = new.bank_id
       and cs.org_id = new.org_id
       and head.position = s.first_step
       and (select jsonb_agg(new.item_set -> (place.ord::integer - 1 + k) order by k)
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

  if jsonb_array_length(runs) > 0 then
    new.case_study_records := runs;
  end if;
  return new;
end;
$$;

revoke all on function private.snapshot_session_record() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A whole quiz runs its case studies in place
-- ---------------------------------------------------------------------------

-- 20261021000000's function with the quiz's set read from private.quiz_run_set and nothing else.
create or replace function public.start_session(
  source_bank uuid default null,
  source_case_study uuid default null,
  paced public.session_mode default 'instructor_paced',
  item_timer_seconds integer default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  source_org uuid;
  source_title text;
  chosen jsonb;
  new_id uuid;
  failed_constraint text;
begin
  if num_nonnulls(source_bank, source_case_study) <> 1 then
    raise exception 'start a session from either a bank or a case study, not both'
      using errcode = '22023';
  end if;

  if source_bank is not null then
    select b.org_id, b.name into source_org, source_title
      from public.item_banks b where b.id = source_bank;
    if not found then
      raise exception 'that bank does not exist' using errcode = 'P0002';
    end if;
    -- The quiz in its order (#468), each ready case study in place as its steps (#469). A draft
    -- question, and a case study that is not ready, are left out.
    chosen := private.quiz_run_set(source_bank, source_org);
  else
    select c.org_id, c.title into source_org, source_title
      from public.case_studies c
     where c.id = source_case_study and c.status = 'published';
    if not found then
      -- An unpublished case study is not "gone", but a room must not be shown one, and the two
      -- answers are told apart below rather than here so the P0002 branch keeps meaning one thing.
      if exists (select 1 from public.case_studies c where c.id = source_case_study) then
        raise exception 'that case study is not published' using errcode = '22023';
      end if;
      raise exception 'that case study does not exist' using errcode = 'P0002';
    end if;

    -- Every step, in order, and every one of them published. A case study is a sequence: silently
    -- dropping a half-written step would run the room through a different case study from the one
    -- the instructor chose, so this refuses instead.
    if exists (
      select 1 from public.case_study_items csi
        join public.items i on i.id = csi.item_id
       where csi.case_study_id = source_case_study and i.status <> 'published'
    ) then
      raise exception 'that case study has a step that is not published' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(csi.item_id order by csi.position), '[]'::jsonb) into chosen
      from public.case_study_items csi
     where csi.case_study_id = source_case_study;
  end if;

  if jsonb_array_length(chosen) = 0 then
    raise exception 'that source has no published items to run' using errcode = '22023';
  end if;

  for attempt in 1 .. 10 loop
    begin
      insert into public.sessions
        (org_id, host_id, bank_id, case_study_id, title, code, mode, item_set, timer_seconds)
      values
        (source_org, caller, source_bank, source_case_study, source_title,
         private.new_session_code(), paced, chosen, item_timer_seconds)
      returning id into new_id;
      return new_id;
    exception when unique_violation then
      -- Only a code that collided with a session still open is worth another draw.
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint is distinct from 'sessions_open_code_key' then
        raise;
      end if;
    end;
  end loop;

  raise exception 'could not find a free join code' using errcode = '53400';
end;
$$;
