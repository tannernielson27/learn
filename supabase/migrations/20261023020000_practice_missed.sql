-- "Practise the N I missed" (owner decision 6, docs/ui-overhaul/README.md): a practice run made of
-- only the questions a student missed in one finished practice run, or in an assignment whose
-- results they can already read.
--
-- ---------------------------------------------------------------------------
-- What changes
-- ---------------------------------------------------------------------------
--
--   * practice_runs gains two nullable columns, `source_run` and `source_assignment`, at most one
--     of them set. A run with neither is an ordinary run of a shared quiz, exactly as before. A
--     run with one is a "missed" run: frozen at start like every run since #271, holding only the
--     missed questions, in the order the source played them.
--   * Ordinary runs keep their rule that only the newest of a student's runs of a quiz takes
--     answers, and "newest" now counts ordinary runs only, so opening a missed run never closes
--     the run a student is in, and never changes the count on their Practice list. That is the
--     only reason open_practice_run, my_practice_banks and private.live_practice_run are restated;
--     each keeps its signature, result and grants.
--   * my_practice_step_marks leaves missed runs out. Every answer in one comes after the student
--     was shown that question's key (in practice, or in their released assignment results), so it
--     says nothing about their clinical judgment, as #239's "first answer" rule already says.
--   * Three new functions, the service role's alone, like every other run call:
--       - start_missed_practice_from_run(student, source_run, target_items)
--       - start_missed_practice_from_assignment(student, target_assignment, target_items,
--         best_attempt)
--       - missed_practice_run(student, target_run): the header of a live missed run.
--
-- ---------------------------------------------------------------------------
-- How the missed set is checked
-- ---------------------------------------------------------------------------
--
-- The app's server works out which questions were missed from its own view of the source (never
-- from the browser, which sends only the source's id) and names them. The database then refuses
-- the whole request ('invalid') unless every named question:
--
--   * is one the source played: a slot of the source run, or an id in the assignment's item_set;
--   * was missed there. Full marks is `max_points > 0 and points >= max_points`, the same line
--     the player's "All correct" draws. In a practice run a missed question is one answered
--     below full marks: one not yet answered is not missed, and its key and (for a case study
--     step) its patient record at that step have not been shown, so it is refused. In an
--     assignment it is any question the named attempt did not mark at full marks, blank ones
--     included, because the released results already show every key and the whole record. The
--     attempt must be the student's own, for this assignment, and submitted; a student with no
--     submitted attempt names none, and then every question counts as missed.
--
-- And the source itself must be open to the student right now: a run that is theirs, with its
-- quiz still shared with a class they are a current member of; or an assignment that has closed
-- by the database's clock, of a class they are a current member of or that they attempted. That
-- is my_assignment_result's own rule, so a missed run of an assignment reveals no key, rationale
-- or question the results page has not already shown them. Before the close there is no missed
-- run of an assignment at all. A missed run stays readable by the same rule for as long as it
-- holds: a run made from a practice run closes when its share stops.
--
-- Questions of an assignment play as they are published now (only published questions are
-- recorded; one an author has since unpublished or archived is left out), the way every practice
-- run plays the quiz as published. Questions of a practice run play exactly as that run recorded
-- them. Practice is never graded: nothing here reads or writes an assignment's attempts or marks.
--
-- Safe to replay on a fresh project: two nullable columns, two constraints, two indexes, two new
-- helpers, three new functions, and four functions replaced in place with the same signatures and
-- their grants restated. Depends on 20260926000000 (frozen runs and their slots) and
-- 20261022010000 (assignments.case_study_records).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.practice_runs
  add column source_run uuid,
  add column source_assignment uuid,
  add constraint practice_runs_one_source check (num_nonnulls(source_run, source_assignment) <= 1),
  add constraint practice_runs_source_run_fkey foreign key (source_run, org_id)
    references public.practice_runs (id, org_id) on delete cascade,
  add constraint practice_runs_source_assignment_fkey foreign key (source_assignment, org_id)
    references public.assignments (id, org_id) on delete cascade;

create index practice_runs_source_run_idx on public.practice_runs (source_run)
  where source_run is not null;
create index practice_runs_source_assignment_idx on public.practice_runs (source_assignment)
  where source_assignment is not null;

comment on column public.practice_runs.source_run is
  'Set on a run of only the questions missed in this earlier practice run. Null for an ordinary '
  'run of a shared quiz.';
comment on column public.practice_runs.source_assignment is
  'Set on a run of only the questions missed in this assignment, made after its results were '
  'released to the student. Null for an ordinary run of a shared quiz.';

-- ---------------------------------------------------------------------------
-- Helpers (no one may call these directly)
-- ---------------------------------------------------------------------------

-- Whether an assignment's results are released to the student: closed by the database's clock,
-- and the student a current member of its class or someone who attempted it. my_assignment_result
-- answers by exactly this rule.
create function private.assignment_results_released(student uuid, target_assignment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.assignments s
     where s.id = target_assignment
       and private.assignment_refusal(s.opens_at, s.closes_at) is not distinct from 'closed'
       and (
         private.is_current_member(s.class_id, student)
         or exists (
           select 1 from public.assignment_attempts a
            where a.assignment_id = s.id and a.student_id = student
         )
       )
  );
$$;

revoke all on function private.assignment_results_released(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Whether a run of the student's is open to them: its quiz still shared with them, or for a run of
-- an assignment's misses, that assignment's results still released to them. Says nothing about
-- which run is newest.
create function private.practice_run_open_to(student uuid, run public.practice_runs)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select run.id is not null
     and run.student_id = student
     and case
           when run.source_assignment is not null
             then private.assignment_results_released(student, run.source_assignment)
           else private.practice_shared_with(student, run.bank_id)
         end;
$$;

revoke all on function private.practice_run_open_to(uuid, public.practice_runs)
  from public, anon, authenticated, service_role;

-- As in #241, with "newest" counted over ordinary runs only. A missed run is live whenever it is
-- open to its student; an ordinary run must also be their newest ordinary run of its quiz.
create or replace function private.live_practice_run(student uuid, target_run uuid)
returns public.practice_runs
language sql stable security definer set search_path = ''
as $$
  select r.*
    from public.practice_runs r
   where r.id = target_run
     and private.practice_run_open_to(student, r)
     and (
       r.source_run is not null
       or r.source_assignment is not null
       or not exists (
         select 1 from public.practice_runs newer
          where newer.student_id = r.student_id
            and newer.bank_id = r.bank_id
            and newer.source_run is null
            and newer.source_assignment is null
            and (newer.started_at, newer.id) > (r.started_at, r.id)
       )
     );
$$;

revoke all on function private.live_practice_run(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ordinary runs: unchanged but for "newest"
-- ---------------------------------------------------------------------------

-- 20260926000000's, resuming the newest ordinary run only.
create or replace function public.open_practice_run(student uuid, target_bank uuid, fresh boolean)
returns table (run_id uuid, bank_id uuid, bank_name text, seed uuid, started_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  found_run public.practice_runs;
  bank_org uuid;
begin
  if student is null or target_bank is null
     or not private.practice_shared_with(student, target_bank) then
    return;
  end if;

  -- Two tabs opening the same bank at once make one run, not two.
  perform pg_advisory_xact_lock(
    hashtextextended('learn:practice-run:' || student::text || ':' || target_bank::text, 0));

  if not coalesce(fresh, false) then
    select r.* into found_run
      from public.practice_runs r
     where r.student_id = student and r.bank_id = target_bank
       and r.source_run is null and r.source_assignment is null
     order by r.started_at desc, r.id desc
     limit 1;
  end if;

  if found_run.id is null then
    select b.org_id into bank_org from public.item_banks b where b.id = target_bank;
    insert into public.practice_runs (org_id, student_id, bank_id, frozen)
    values (bank_org, student, target_bank, true)
    returning * into found_run;

    with listed as (
      select distinct on (s.item_id) s.item_id, s.case_study_id, s.step, s.ordinal
        from private.practice_item_set(target_bank) s
       order by s.item_id, s.ordinal
    ),
    source as (
      select l.item_id, l.case_study_id, l.step,
             row_number() over (order by l.ordinal) as ordinal,
             i.org_id, i.type, i.cjmm_step, i.tags, i.version,
             i.content, i.answer_key, i.rationale, i.scoring,
             sha256(convert_to(jsonb_build_array(
               i.type, i.cjmm_step, i.tags, i.version,
               i.content, i.answer_key, i.rationale, i.scoring)::text, 'UTF8')) as digest
        from listed l
        join public.items i on i.id = l.item_id
    ),
    kept as (
      insert into public.practice_item_snapshots
        (item_id, org_id, digest, type, cjmm_step, tags, version,
         content, answer_key, rationale, scoring)
      select
             src.item_id, src.org_id, src.digest, src.type, src.cjmm_step, src.tags, src.version,
             src.content, src.answer_key, src.rationale, src.scoring
        from source src
      on conflict (item_id, digest) do nothing
    )
    insert into public.practice_run_slots
      (run_id, org_id, ordinal, item_id, digest, case_study_id, step)
    select found_run.id, found_run.org_id, src.ordinal::integer, src.item_id, src.digest,
           src.case_study_id, src.step
      from source src;
  end if;

  return query
    select found_run.id, found_run.bank_id, b.name, found_run.seed, found_run.started_at
      from public.item_banks b
     where b.id = found_run.bank_id;
end;
$$;

revoke all on function public.open_practice_run(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.open_practice_run(uuid, uuid, boolean) to service_role;

-- 20261011010000's, with the newest run taken from ordinary runs only.
create or replace function public.my_practice_banks()
returns table (
  bank_id uuid,
  bank_name text,
  item_count integer,
  answered integer,
  workspace_name text
)
language sql stable security definer set search_path = ''
as $$
  with caller as (
    select (select auth.uid()) as id
  ),
  banks as (
    select distinct s.bank_id, s.org_id, c.id as caller
      from caller c
      join public.class_members m on m.profile_id = c.id
      join public.bank_practice_shares s on s.class_id = m.class_id
     where c.id is not null
       and private.is_current_member(m.class_id, c.id)
  )
  select b.id,
         b.name,
         case
           when newest.id is null
             then (select count(*)::integer from private.practice_item_set(b.id))
           else (select count(*)::integer from private.practice_run_set(newest.id))
         end,
         coalesce((
           select count(*)::integer
             from public.practice_responses p
            where p.run_id = newest.id
         ), 0),
         o.name
    from banks x
    join public.item_banks b on b.id = x.bank_id
    join public.orgs o on o.id = x.org_id
    left join lateral (
      select r.id from public.practice_runs r
       where r.student_id = x.caller and r.bank_id = b.id
         and r.source_run is null and r.source_assignment is null
       order by r.started_at desc, r.id desc
       limit 1
    ) newest on true
   order by b.name, b.id
   limit 200;
$$;

revoke all on function public.my_practice_banks() from public, anon;
grant execute on function public.my_practice_banks() to authenticated;

-- 20260925070000's, leaving missed runs out: each of their answers came after the key was shown.
create or replace function public.my_practice_step_marks()
returns table (cjmm_step smallint, points numeric, max_points numeric)
language sql stable security definer set search_path = ''
as $$
  with caller as (
    select (select auth.uid()) as id
  ),
  firsts as (
    select distinct on (p.item_id) p.item_id, p.points, p.max_points
      from caller c
      join public.practice_runs r on r.student_id = c.id
      join public.practice_responses p on p.run_id = r.id
     where c.id is not null
       and r.source_run is null
       and r.source_assignment is null
       and private.practice_shared_with(c.id, r.bank_id)
     order by p.item_id, p.answered_at, r.started_at, r.id
  )
  select i.cjmm_step, f.points, f.max_points
    from firsts f
    join public.items i on i.id = f.item_id
   order by f.item_id
   limit 2000;
$$;

revoke all on function public.my_practice_step_marks() from public, anon;
grant execute on function public.my_practice_step_marks() to authenticated;

-- ---------------------------------------------------------------------------
-- Missed runs (service role only)
-- ---------------------------------------------------------------------------

-- A run of the questions missed in one of the student's practice runs. ('started', the new run),
-- or ('not_found', null) when the source is not open to them, ('invalid', null) when a named
-- question was not one the source played or was not answered below full marks there, or
-- ('empty', null) when nothing is named.
create function public.start_missed_practice_from_run(
  student uuid,
  source uuid,
  target_items uuid[]
)
returns table (outcome text, run_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  src public.practice_runs;
  wanted uuid[];
  made public.practice_runs;
begin
  if student is null or source is null then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  select r.* into src from public.practice_runs r where r.id = source;
  if not coalesce(private.practice_run_open_to(student, src), false) then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  wanted := array(select distinct w from unnest(coalesce(target_items, '{}')) w where w is not null);
  if cardinality(wanted) = 0 then
    return query select 'empty'::text, null::uuid;
    return;
  end if;
  if cardinality(wanted) > 1000 or exists (
    select 1 from unnest(wanted) w(id)
     where not exists (select 1 from private.practice_run_set(src.id) s where s.item_id = w.id)
        or not exists (
          select 1 from public.practice_responses p
           where p.run_id = src.id and p.item_id = w.id
             and not (p.max_points > 0 and p.points >= p.max_points)
        )
  ) then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  -- A run of an assignment's misses passes its source on, so the new run is open by the same
  -- rule; otherwise it points at the run it came from and is open while the quiz is shared.
  insert into public.practice_runs
    (org_id, student_id, bank_id, frozen, source_run, source_assignment)
  values (src.org_id, student, src.bank_id, true,
          case when src.source_assignment is null then src.id end,
          src.source_assignment)
  returning * into made;

  if src.frozen then
    insert into public.practice_run_slots
      (run_id, org_id, ordinal, item_id, digest, case_study_id, step)
    select made.id, made.org_id, (row_number() over (order by s.ordinal))::integer,
           s.item_id, s.digest, s.case_study_id, s.step
      from public.practice_run_slots s
     where s.run_id = src.id and s.item_id = any(wanted);
  else
    -- A run from before #271 recorded nothing: record its questions as they are published now,
    -- as open_practice_run does for a new run.
    with listed as (
      select distinct on (s.item_id) s.item_id, s.case_study_id, s.step, s.ordinal
        from private.practice_item_set(src.bank_id) s
       where s.item_id = any(wanted)
       order by s.item_id, s.ordinal
    ),
    picked as (
      select l.item_id, l.case_study_id, l.step,
             row_number() over (order by l.ordinal) as ordinal,
             i.org_id, i.type, i.cjmm_step, i.tags, i.version,
             i.content, i.answer_key, i.rationale, i.scoring,
             sha256(convert_to(jsonb_build_array(
               i.type, i.cjmm_step, i.tags, i.version,
               i.content, i.answer_key, i.rationale, i.scoring)::text, 'UTF8')) as digest
        from listed l
        join public.items i on i.id = l.item_id
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
  end if;

  if not exists (select 1 from public.practice_run_slots s where s.run_id = made.id) then
    delete from public.practice_runs r where r.id = made.id;
    return query select 'empty'::text, null::uuid;
    return;
  end if;
  return query select 'started'::text, made.id;
end;
$$;

revoke all on function public.start_missed_practice_from_run(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.start_missed_practice_from_run(uuid, uuid, uuid[])
  to service_role;

-- A run of the questions missed in an assignment whose results are released to the student.
-- `best_attempt` is the attempt the results page counts (the student's own, submitted), left out
-- when they submitted none. Outcomes as start_missed_practice_from_run's.
create function public.start_missed_practice_from_assignment(
  student uuid,
  target_assignment uuid,
  target_items uuid[],
  best_attempt uuid default null
)
returns table (outcome text, run_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  asg public.assignments;
  quiz uuid;
  wanted uuid[];
  made public.practice_runs;
  recorded integer;
begin
  if student is null or target_assignment is null
     or not private.assignment_results_released(student, target_assignment) then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  select s.* into asg from public.assignments s where s.id = target_assignment;
  quiz := coalesce(
    asg.bank_id,
    (select c.bank_id from public.case_studies c
      where c.id = asg.case_study_id and c.org_id = asg.org_id));
  if quiz is null then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if best_attempt is null then
    if exists (
      select 1 from public.assignment_attempts a
       where a.assignment_id = asg.id and a.student_id = student and a.submitted_at is not null
    ) then
      return query select 'invalid'::text, null::uuid;
      return;
    end if;
  elsif not exists (
    select 1 from public.assignment_attempts a
     where a.id = best_attempt and a.assignment_id = asg.id
       and a.student_id = student and a.submitted_at is not null
  ) then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  wanted := array(select distinct w from unnest(coalesce(target_items, '{}')) w where w is not null);
  if cardinality(wanted) = 0 then
    return query select 'empty'::text, null::uuid;
    return;
  end if;
  if cardinality(wanted) > 1000 or exists (
    select 1 from unnest(wanted) w(id)
     where not (asg.item_set ? w.id::text)
        or (best_attempt is not null and exists (
          select 1 from public.attempt_responses r
           where r.attempt_id = best_attempt and r.item_id = w.id
             and r.max_points > 0 and r.points >= r.max_points
        ))
  ) then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  insert into public.practice_runs (org_id, student_id, bank_id, frozen, source_assignment)
  values (asg.org_id, student, quiz, true, asg.id)
  returning * into made;

  -- In the assignment's order. A question that is a step of the case study the assignment plays
  -- (on its own, or in place in a whole quiz) keeps that case study and step, so it plays with
  -- its patient record; any other question plays on its own.
  with placed as (
    select (place.v #>> '{}')::uuid as item_id, place.ord
      from jsonb_array_elements(asg.item_set) with ordinality as place(v, ord)
     where jsonb_typeof(place.v) = 'string'
       and (place.v #>> '{}') = any(array(select w::text from unnest(wanted) w))
  ),
  played_cases as (
    select asg.case_study_id as case_study_id
     where asg.case_study_id is not null
    union
    select (entry ->> 'case_study_id')::uuid
      from jsonb_array_elements(coalesce(asg.case_study_records, '[]'::jsonb)) entry
     where jsonb_typeof(entry -> 'case_study_id') = 'string'
  ),
  picked as (
    select pl.item_id, step_of.case_study_id, step_of.step,
           row_number() over (order by pl.ord) as ordinal,
           i.org_id, i.type, i.cjmm_step, i.tags, i.version,
           i.content, i.answer_key, i.rationale, i.scoring,
           sha256(convert_to(jsonb_build_array(
             i.type, i.cjmm_step, i.tags, i.version,
             i.content, i.answer_key, i.rationale, i.scoring)::text, 'UTF8')) as digest
      from (select distinct on (item_id) item_id, ord from placed order by item_id, ord) pl
      join public.items i on i.id = pl.item_id
      left join lateral (
        select csi.case_study_id, csi.position::smallint as step
          from public.case_study_items csi
          join played_cases pc on pc.case_study_id = csi.case_study_id
          join public.case_studies c on c.id = csi.case_study_id and c.org_id = asg.org_id
         where csi.item_id = pl.item_id and csi.position between 1 and 6
         order by c.created_at, c.id
         limit 1
      ) step_of on true
     where i.org_id = asg.org_id
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

revoke all on function public.start_missed_practice_from_assignment(uuid, uuid, uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.start_missed_practice_from_assignment(uuid, uuid, uuid[], uuid)
  to service_role;

-- A missed run's header, when it is live for the student: what it is called (the assignment's
-- title, or the quiz's name), its seed, and where it came from. No row for an ordinary run, or a
-- run that is not theirs or no longer open to them.
create function public.missed_practice_run(student uuid, target_run uuid)
returns table (
  run_id uuid,
  bank_id uuid,
  title text,
  seed uuid,
  source_kind text,
  source_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.bank_id,
         coalesce(s.title, b.name),
         r.seed,
         case when r.source_assignment is not null then 'assignment' else 'practice' end,
         coalesce(r.source_assignment, r.source_run)
    from private.live_practice_run(student, target_run) r
    join public.item_banks b on b.id = r.bank_id
    left join public.assignments s on s.id = r.source_assignment
   where r.id is not null
     and (r.source_run is not null or r.source_assignment is not null);
$$;

revoke all on function public.missed_practice_run(uuid, uuid) from public, anon, authenticated;
grant execute on function public.missed_practice_run(uuid, uuid) to service_role;
