-- A student's review list (#627): one row per student per question they have missed, once its key
-- was shown to them, with when it is next due. The rules it follows are ADR 0019's
-- (src/lib/ngn/reviewSchedule.ts, #626).
--
-- ---------------------------------------------------------------------------
-- What changes
-- ---------------------------------------------------------------------------
--
--   * public.review_entries: the student, the question (`item_id`), the workspace (`org_id`),
--     the gap it is waiting out and when it is due, or when it retired; when it entered the list
--     and when it was last answered. One row per student and question. Nobody reads or writes it
--     directly: RLS is on with no policy and no role holds a privilege. The functions below are
--     the only way in or out.
--   * Filling it from practice. record_practice_response is restated: a recorded answer in any
--     practice run (ordinary, missed, or review) is applied to the student's row for that
--     question in the same statement. The app returns that question's key straight after a
--     recorded answer and only then (POST /api/practice/answer), so "the key has just been shown"
--     holds for every answer applied here. A question not answered is never added.
--   * Filling it from assignments, on the student home's load, with no scheduled job:
--     fill_review_from_assignments(student) adds the questions missed in the student's best
--     attempt at each assignment whose results are released to them
--     (private.assignment_results_released, the reveal), that are not on the list yet. A blank
--     question counts as missed, as it does on the results page. Loading the home again adds
--     nothing again.
--   * my_review_due(): the caller's own count of questions due now and when the next one falls
--     due. Two values; no question, no key.
--   * review_due_items(student): the server's list of a student's due questions, to pick a
--     sitting from (src/lib/practice/review.ts, with dueForReview). Ids and times only.
--   * start_review_run(student, target_items): a practice run of due questions. practice_runs
--     gains a third source marker, `source_review`, at most one of the three set. A review run
--     belongs to one workspace and no quiz, so its `bank_id` is null, which no other run's is.
--     It is frozen at start like every run since #271.
--
-- ---------------------------------------------------------------------------
-- The schedule in the database
-- ---------------------------------------------------------------------------
--
-- private.review_next is ADR 0019's nextReviewState, restated in SQL so that an answer and the
-- row it moves are written in one statement. It is the only copy of the gap ladder outside
-- src/lib/ngn/reviewSchedule.ts. supabase/tests/database/review_entries.test.sql and
-- src/lib/supabase/reviewCases.test.ts pin the same table of cases against each, and the TS test
-- fails when the two tables differ. A day is exactly 24 hours (interval '24 hours', never
-- '1 day', which a time zone with daylight saving would stretch).
--
-- A stored row is ReviewState with nothing derived stored twice: waiting is (gap_days, due_at),
-- retired is (retired_at); a check makes any other shape impossible, so the TS reader's
-- RangeError on a malformed state cannot be reached from a row.
--
-- ---------------------------------------------------------------------------
-- Which rows are served
-- ---------------------------------------------------------------------------
--
-- Only a question still published, and only while the student is a current member of a class of
-- that workspace (private.review_entry_served). Otherwise the row is kept and not shown: it comes
-- back if the question is published again or the student rejoins. Their past results are not
-- touched (ADR 0015 decision 4).
--
-- ---------------------------------------------------------------------------
-- Review runs and the rules missed runs follow
-- ---------------------------------------------------------------------------
--
-- A review run has no bank, so none of the reads that look for a student's runs of a quiz can
-- find one: open_practice_run's "newest" (r.bank_id = target_bank), my_practice_banks' newest
-- run and private.live_practice_run's "newer" (newer.bank_id = r.bank_id) never match a null
-- bank, so opening one never closes the ordinary run a student is in and never changes their
-- Practice list; my_practice_step_marks reads only runs whose quiz is shared with the caller
-- (private.practice_shared_with), which a null bank never is, so review answers never reach the
-- steps. None of those four is restated; the tests check each. private.practice_run_open_to is
-- restated with one more case: a review run is open while its student is a current member of a
-- class of its workspace. A review run cannot be the source of a missed run: the new run would
-- carry a null bank without the review marker, which practice_runs_review_bank refuses.
--
-- Safe to replay on a fresh project: one new table, one column made nullable, one new column,
-- three constraints, five new helpers, four new functions, and two functions replaced in place
-- with the same signatures and their grants restated. Depends on 20261023020000.

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------

create table public.review_entries (
  student_id uuid not null references public.profiles (id) on delete cascade,
  item_id uuid not null,
  org_id uuid not null references public.orgs (id) on delete cascade,
  gap_days smallint,
  due_at timestamptz,
  retired_at timestamptz,
  entered_at timestamptz not null default clock_timestamp(),
  last_answered_at timestamptz not null,
  primary key (student_id, item_id),
  constraint review_entries_item_org_fkey foreign key (item_id, org_id)
    references public.items (id, org_id) on delete cascade,
  -- ReviewState: waiting out one of REVIEW_GAPS_DAYS until a finite time, or retired at one.
  constraint review_entries_one_state check (
    (retired_at is null and gap_days in (1, 3, 7, 14) and due_at is not null and isfinite(due_at))
    or (retired_at is not null and isfinite(retired_at) and gap_days is null and due_at is null)
  ),
  constraint review_entries_answered_finite check (
    isfinite(last_answered_at) and isfinite(entered_at)
  )
);

create index review_entries_student_due_idx on public.review_entries (student_id, due_at)
  where retired_at is null;
create index review_entries_item_id_idx on public.review_entries (item_id);
create index review_entries_org_id_idx on public.review_entries (org_id);

comment on table public.review_entries is
  'A student''s review list (#627): one row per student per missed question, with when it is next '
  'due (ADR 0019). Written and read only through security definer functions.';

-- Supabase's default privileges hand anon, authenticated and service_role full DML on a new
-- public table. Only the definer functions below touch it.
revoke all on public.review_entries from anon, authenticated, service_role;
alter table public.review_entries enable row level security;

-- ---------------------------------------------------------------------------
-- Review runs
-- ---------------------------------------------------------------------------

alter table public.practice_runs
  alter column bank_id drop not null,
  add column source_review boolean,
  drop constraint practice_runs_one_source,
  add constraint practice_runs_one_source
    check (num_nonnulls(source_run, source_assignment, source_review) <= 1),
  add constraint practice_runs_source_review_true check (source_review),
  add constraint practice_runs_review_bank check ((bank_id is null) = (source_review is not null));

comment on column public.practice_runs.source_review is
  'True on a run of due questions from the student''s review list (#627); such a run has no bank. '
  'Null otherwise.';

-- ---------------------------------------------------------------------------
-- Helpers (no one may call these directly)
-- ---------------------------------------------------------------------------

-- ADR 0019's nextReviewState. The state is (gap, due, retired): all null for a question never in
-- review, (gap, due, null) waiting, (null, null, retired) retired. Returns the next state in the
-- same shape. Mirrors src/lib/ngn/reviewSchedule.ts case for case (see the header).
create function private.review_next(
  gap smallint,
  due timestamptz,
  retired timestamptz,
  in_review boolean,
  earned numeric,
  possible numeric,
  answered timestamptz,
  out next_gap smallint,
  out next_due timestamptz,
  out next_retired timestamptz
)
language plpgsql stable set search_path = ''
as $$
declare
  ladder constant smallint[] := array[1, 3, 7, 14];
  place integer;
begin
  if answered is null or not isfinite(answered) then
    raise exception 'answered must be a finite time' using errcode = '22023';
  end if;
  next_gap := gap;
  next_due := due;
  next_retired := retired;

  -- A mark no scorer could give, or one worth nothing, changes nothing.
  if earned is null or possible is null or earned < 0 or possible <= 0 then
    return;
  end if;

  -- Below full marks, anywhere: the 1 day gap from this answer.
  if earned < possible then
    next_gap := 1;
    next_due := answered + interval '24 hours';
    next_retired := null;
    return;
  end if;

  -- Full marks moves a question only in review, only when it is waiting, and only once due.
  if not coalesce(in_review, false) or gap is null or due > answered then
    return;
  end if;

  place := array_position(ladder, gap);
  if place is null then
    raise exception 'gap must be one of 1, 3, 7, 14, got %', gap using errcode = '22023';
  end if;
  if place = cardinality(ladder) then
    next_gap := null;
    next_due := null;
    next_retired := answered;
  else
    next_gap := ladder[place + 1];
    next_due := answered + interval '24 hours' * ladder[place + 1];
    next_retired := null;
  end if;
end;
$$;

revoke all on function private.review_next(
  smallint, timestamptz, timestamptz, boolean, numeric, numeric, timestamptz)
  from public, anon, authenticated, service_role;

-- Applies one scored answer, given after its key was shown, to the student's row for that
-- question: adds it, moves it, or leaves it. `workspace` is the question's own (items.org_id).
create function private.apply_review_answer(
  student uuid,
  target_item uuid,
  workspace uuid,
  earned numeric,
  possible numeric,
  answered timestamptz,
  in_review boolean
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  entry public.review_entries;
  moved record;
begin
  -- Two answers to the same question at once (two tabs) are applied one after the other.
  perform pg_advisory_xact_lock(
    hashtextextended('learn:review-entry:' || student::text || ':' || target_item::text, 0));

  select e.* into entry
    from public.review_entries e
   where e.student_id = student and e.item_id = target_item;

  select * into moved
    from private.review_next(entry.gap_days, entry.due_at, entry.retired_at, in_review,
                             earned, possible, answered);

  if entry.student_id is null then
    if moved.next_gap is null and moved.next_retired is null then
      return;
    end if;
    insert into public.review_entries
      (student_id, item_id, org_id, gap_days, due_at, retired_at, last_answered_at)
    values (student, target_item, workspace, moved.next_gap, moved.next_due, moved.next_retired,
            answered);
  else
    update public.review_entries e
       set gap_days = moved.next_gap,
           due_at = moved.next_due,
           retired_at = moved.next_retired,
           last_answered_at = greatest(e.last_answered_at, answered)
     where e.student_id = student and e.item_id = target_item;
  end if;
end;
$$;

revoke all on function private.apply_review_answer(
  uuid, uuid, uuid, numeric, numeric, timestamptz, boolean)
  from public, anon, authenticated, service_role;

-- Whether the student is, right now, a current member of a class of the workspace.
create function private.in_workspace_class(student uuid, workspace uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
     where c.org_id = workspace
       and private.is_current_member(c.id, student)
  );
$$;

revoke all on function private.in_workspace_class(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Whether a row is served: the question still published, and the student still in a class of
-- its workspace. A row that is not is kept, and comes back when both hold again.
create function private.review_entry_served(student uuid, target_item uuid, workspace uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
           select 1 from public.items i
            where i.id = target_item and i.org_id = workspace and i.status = 'published'
         )
     and private.in_workspace_class(student, workspace);
$$;

revoke all on function private.review_entry_served(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- 20261023020000's, with a review run open while its student is in a class of its workspace.
create or replace function private.practice_run_open_to(student uuid, run public.practice_runs)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select run.id is not null
     and run.student_id = student
     and case
           when run.source_review is not null
             then private.in_workspace_class(student, run.org_id)
           when run.source_assignment is not null
             then private.assignment_results_released(student, run.source_assignment)
           else private.practice_shared_with(student, run.bank_id)
         end;
$$;

revoke all on function private.practice_run_open_to(uuid, public.practice_runs)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Filling the list from practice
-- ---------------------------------------------------------------------------

-- 20260926000000's, and a recorded answer is applied to the student's review list in the same
-- statement. Only a recorded answer: a second answer to the same question in a run ('answered')
-- changes nothing, here or in the list.
create or replace function public.record_practice_response(
  student uuid,
  target_run uuid,
  target_item uuid,
  answer jsonb,
  earned numeric,
  possible numeric,
  marks jsonb
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  run public.practice_runs;
  answered timestamptz;
begin
  run := private.live_practice_run(student, target_run);
  if run.id is null then
    return 'not_found';
  end if;
  if not exists (
    select 1 from private.practice_run_set(run.id) s where s.item_id = target_item
  ) then
    return 'not_found';
  end if;

  insert into public.practice_responses (run_id, org_id, item_id, response, points, max_points, score)
  values (run.id, run.org_id, target_item, answer, earned, possible, marks)
  on conflict (run_id, item_id) do nothing
  returning answered_at into answered;
  if answered is null then
    return 'answered';
  end if;

  perform private.apply_review_answer(student, target_item, run.org_id, earned, possible,
                                      answered, run.source_review is not null);
  return 'recorded';
end;
$$;

revoke all on function public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- Filling the list from assignments (service role, on the student home's load)
-- ---------------------------------------------------------------------------

-- Adds the questions missed in the student's best attempt (the highest score, the earlier attempt
-- on a tie, as the results page counts it) at each assignment whose results are released to
-- them, when the question is still published and not on their list yet. Missed is anything below
-- full marks, blank included; a mark worth nothing, or one that was never written, is left out.
-- Each enters waiting out the 1 day gap from the attempt's submit, which is when it was marked.
-- A question missed in two assignments enters from the later. At most 1000 a call; the next load
-- takes the rest. Returns how many were added.
create function public.fill_review_from_assignments(student uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  added integer;
begin
  if student is null then
    return 0;
  end if;
  -- Two loads of the home at once add each question once.
  perform pg_advisory_xact_lock(hashtextextended('learn:review-fill:' || student::text, 0));

  with best as (
    select distinct on (a.assignment_id) a.id, a.assignment_id, a.submitted_at
      from public.assignment_attempts a
     where a.student_id = student
       and a.submitted_at is not null
       and a.score is not null
       and a.max_score is not null
     order by a.assignment_id, a.score desc, a.number
  ),
  released as (
    select b.*
      from best b
     where private.assignment_results_released(student, b.assignment_id)
  ),
  placed as (
    select r.id as attempt_id, r.submitted_at, s.org_id,
           case when (place.v #>> '{}')
                       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (place.v #>> '{}')::uuid end as item_id
      from released r
      join public.assignments s on s.id = r.assignment_id
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(s.item_set) = 'array' then s.item_set else '[]'::jsonb end
      ) as place(v)
     where jsonb_typeof(place.v) = 'string'
  ),
  missed as (
    select distinct on (p.item_id) p.item_id, i.org_id, p.submitted_at
      from placed p
      join public.items i on i.id = p.item_id and i.org_id = p.org_id
      left join public.attempt_responses r
        on r.attempt_id = p.attempt_id and r.item_id = p.item_id
     where i.status = 'published'
       and (
         r.item_id is null
         or (r.points is not null and r.max_points > 0 and r.points < r.max_points)
       )
       and not exists (
         select 1 from public.review_entries e
          where e.student_id = student and e.item_id = p.item_id
       )
     order by p.item_id, p.submitted_at desc
     limit 1000
  )
  insert into public.review_entries
    (student_id, item_id, org_id, gap_days, due_at, last_answered_at)
  select student, m.item_id, m.org_id, 1, m.submitted_at + interval '24 hours', m.submitted_at
    from missed m
  on conflict (student_id, item_id) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;

revoke all on function public.fill_review_from_assignments(uuid) from public, anon, authenticated;
grant execute on function public.fill_review_from_assignments(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- The caller's own: how many served questions are due now, and when the next one not yet due
-- falls due (null when none is waiting). Always one row; nothing about any question.
create function public.my_review_due()
returns table (due integer, next_due_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with served as (
    select e.due_at
      from public.review_entries e
     where e.student_id = (select auth.uid())
       and e.retired_at is null
       and private.review_entry_served(e.student_id, e.item_id, e.org_id)
  )
  select (count(*) filter (where s.due_at <= now()))::integer,
         min(s.due_at) filter (where s.due_at > now())
    from served s;
$$;

revoke all on function public.my_review_due() from public, anon;
grant execute on function public.my_review_due() to authenticated;

-- The server's: a student's served questions due now, the earliest first (ties by id, by code
-- unit, as dueForReview breaks them). Ids, workspace, gap and time; no content, no key.
create function public.review_due_items(student uuid)
returns table (item_id uuid, org_id uuid, gap_days smallint, due_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.item_id, e.org_id, e.gap_days, e.due_at
    from public.review_entries e
   where e.student_id = student
     and e.retired_at is null
     and e.due_at <= now()
     and private.review_entry_served(e.student_id, e.item_id, e.org_id)
   order by e.due_at, e.item_id::text collate "C"
   limit 1000;
$$;

revoke all on function public.review_due_items(uuid) from public, anon, authenticated;
grant execute on function public.review_due_items(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- A review run (service role)
-- ---------------------------------------------------------------------------

-- ('started', the new run), ('invalid', null) unless every named question is a served row of
-- this student's that is due now, all of one workspace and at most REVIEW_SITTING_LIMIT (10) of
-- them, or ('empty', null) when nothing is named. The whole request is refused, never part.
-- The run plays the questions as they are published now, the earliest due first; a question that
-- is a step of a case study of the workspace keeps that case study and step, so it plays with its
-- patient record.
create function public.start_review_run(student uuid, target_items uuid[])
returns table (outcome text, run_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  wanted uuid[];
  workspaces uuid[];
  made public.practice_runs;
  recorded integer;
begin
  wanted := array(select distinct w from unnest(coalesce(target_items, '{}')) w where w is not null);
  if student is null then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  if cardinality(wanted) = 0 then
    return query select 'empty'::text, null::uuid;
    return;
  end if;
  if cardinality(wanted) > 10 or exists (
    select 1 from unnest(wanted) w(id)
     where not exists (
       select 1 from public.review_entries e
        where e.student_id = student
          and e.item_id = w.id
          and e.retired_at is null
          and e.due_at <= now()
          and private.review_entry_served(e.student_id, e.item_id, e.org_id)
     )
  ) then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  workspaces := array(
    select distinct e.org_id from public.review_entries e
     where e.student_id = student and e.item_id = any(wanted));
  if cardinality(workspaces) <> 1 then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  insert into public.practice_runs (org_id, student_id, bank_id, frozen, source_review)
  values (workspaces[1], student, null, true, true)
  returning * into made;

  with picked as (
    select e.item_id, step_of.case_study_id, step_of.step,
           row_number() over (order by e.due_at, e.item_id::text collate "C") as ordinal,
           i.org_id, i.type, i.cjmm_step, i.tags, i.version,
           i.content, i.answer_key, i.rationale, i.scoring,
           sha256(convert_to(jsonb_build_array(
             i.type, i.cjmm_step, i.tags, i.version,
             i.content, i.answer_key, i.rationale, i.scoring)::text, 'UTF8')) as digest
      from public.review_entries e
      join public.items i on i.id = e.item_id and i.org_id = e.org_id
      left join lateral (
        select csi.case_study_id, csi.position::smallint as step
          from public.case_study_items csi
          join public.case_studies c on c.id = csi.case_study_id and c.org_id = e.org_id
         where csi.item_id = e.item_id and csi.position between 1 and 6
         order by c.created_at, c.id
         limit 1
      ) step_of on true
     where e.student_id = student
       and e.item_id = any(wanted)
       and i.status = 'published'
  ),
  kept as (
    insert into public.practice_item_snapshots
      (item_id, org_id, digest, type, cjmm_step, tags, version,
       content, answer_key, rationale, scoring)
    select p.item_id, p.org_id, p.digest, p.type, p.cjmm_step, p.tags, p.version,
           p.content, p.answer_key, p.rationale, p.scoring
      from picked p
    on conflict (item_id, digest) do nothing
  )
  insert into public.practice_run_slots
    (run_id, org_id, ordinal, item_id, digest, case_study_id, step)
  select made.id, made.org_id, p.ordinal::integer, p.item_id, p.digest, p.case_study_id, p.step
    from picked p;
  get diagnostics recorded = row_count;

  if recorded = 0 then
    delete from public.practice_runs r where r.id = made.id;
    return query select 'empty'::text, null::uuid;
    return;
  end if;
  return query select 'started'::text, made.id;
end;
$$;

revoke all on function public.start_review_run(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.start_review_run(uuid, uuid[]) to service_role;
