-- Practice a shared bank with instant feedback (#241).
--
-- A student practises a bank an author has shared with one of their classes (#240): one item at a
-- time, scored on the server as they answer it, and shown that one item's key, score and rationale
-- straight away. Practice never counts toward a grade and never appears in an assignment report:
-- it has its own two tables and nothing here reads or writes an assignment.
--
-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------
--
--   * Nobody but the service role touches practice_runs or practice_responses. RLS is on with no
--     policy, and anon and authenticated hold no privilege at all. item_banks and items keep their
--     author-only policies unchanged (#240's warning): a student never reads an item row.
--   * The app's server verifies the student (getClaims), then calls the service-role functions
--     below naming them. Every one of those re-checks, on every call, that the bank is shared with
--     a class the student is a current member of (private.is_current_member: a member, and not on
--     private.class_removals). Stopping a share is a delete of #240's row, so from that moment the
--     run view and the answer both find nothing, for runs already started as well as new ones.
--   * record_practice_response takes a score, so, like record_attempt_submission (#208), it is
--     the service role's alone: a browser that could call it could write any mark it liked.
--   * Two reads run as the student: public.my_practice_banks (the Practice list on the student
--     home: bank names, counts and their own progress) and public.my_practice_step_marks (#239's
--     "Your steps", practice as its own source). Both take the caller from auth.uid() and answer
--     only about the caller's own current shares. Neither returns an item id, key, rationale,
--     answer or stem.
--
-- ---------------------------------------------------------------------------
-- What a run holds
-- ---------------------------------------------------------------------------
--
-- A run is one pass through a bank, by one student. "Start over" opens a new run; only the newest
-- run for a student and bank takes answers, so a tab left open on an old run is refused rather
-- than writing into a pass the student has left. An item is answered once per run: its key was
-- shown on the first answer, so a second answer would measure nothing (unique run and item).
--
-- The run's items are private.practice_item_set: the bank's published items that are not a step
-- of any case study, in the order they were made, then each published case study of the bank
-- whose six steps are all published, step by step. A case study's steps are played in order and
-- each step's key arrives with that step's answer (#46).
--
-- `seed` is a random value the server never sends to a browser. The option shuffle (#209) and the
-- ordered-response starting order (#219, through the server's HMAC) are seeded by it per item, so
-- the order is stable within a run and differs between runs.
--
-- Safe to replay on a fresh project: new tables and new functions only.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.practice_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  bank_id uuid not null,
  seed uuid not null default gen_random_uuid(),
  started_at timestamptz not null default clock_timestamp(),
  constraint practice_runs_id_org_key unique (id, org_id),
  constraint practice_runs_bank_org_fkey foreign key (bank_id, org_id)
    references public.item_banks (id, org_id) on delete cascade
);

-- The newest run for a student and bank: every run lookup reads this.
create index practice_runs_student_bank_idx
  on public.practice_runs (student_id, bank_id, started_at desc, id desc);
create index practice_runs_bank_id_idx on public.practice_runs (bank_id);
create index practice_runs_org_id_idx on public.practice_runs (org_id);

comment on table public.practice_runs is
  'One student''s pass through a practice-shared bank (#241). Service role only; seed never leaves '
  'the server.';

create table public.practice_responses (
  run_id uuid not null,
  org_id uuid not null,
  item_id uuid not null,
  response jsonb not null
    check (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 200000),
  points numeric(8, 2) not null check (points >= 0),
  max_points numeric(8, 2) not null check (max_points >= 0),
  -- The ScoreResult the server computed through src/lib/ngn/submit.ts.
  score jsonb not null check (jsonb_typeof(score) = 'object' and octet_length(score::text) <= 200000),
  answered_at timestamptz not null default clock_timestamp(),
  primary key (run_id, item_id),
  constraint practice_responses_points_within check (points <= max_points),
  constraint practice_responses_run_org_fkey foreign key (run_id, org_id)
    references public.practice_runs (id, org_id) on delete cascade,
  constraint practice_responses_item_org_fkey foreign key (item_id, org_id)
    references public.items (id, org_id) on delete cascade
);

create index practice_responses_item_id_idx on public.practice_responses (item_id);
create index practice_responses_org_id_idx on public.practice_responses (org_id);

comment on table public.practice_responses is
  'One scored practice answer per run per item (#241). Never counts toward a grade. Service role only.';

-- Supabase's default privileges hand anon and authenticated full DML on a new public table.
revoke all on public.practice_runs from anon, authenticated;
revoke all on public.practice_responses from anon, authenticated;

alter table public.practice_runs enable row level security;
alter table public.practice_responses enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers (no one may call these directly)
-- ---------------------------------------------------------------------------

-- Whether a bank is shared, right now, with a class the student is a current member of.
create function private.practice_shared_with(student uuid, target_bank uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.bank_practice_shares s
     where s.bank_id = target_bank
       and private.is_current_member(s.class_id, student)
  );
$$;

revoke all on function private.practice_shared_with(uuid, uuid)
  from public, anon, authenticated, service_role;

-- What a practice run of a bank holds, in play order. `case_study_id` and `step` are null for a
-- standalone item.
create function private.practice_item_set(target_bank uuid)
returns table (item_id uuid, case_study_id uuid, step smallint, ordinal bigint)
language sql stable security definer set search_path = ''
as $$
  with standalone as (
    select i.id, i.created_at
      from public.items i
     where i.bank_id = target_bank
       and i.status = 'published'
       and not exists (select 1 from public.case_study_items csi where csi.item_id = i.id)
  ),
  playable_case as (
    select c.id, c.created_at
      from public.case_studies c
     where c.bank_id = target_bank
       and c.status = 'published'
       and exists (select 1 from public.case_study_items csi where csi.case_study_id = c.id)
       and not exists (
         select 1 from public.case_study_items csi
           join public.items i on i.id = csi.item_id
          where csi.case_study_id = c.id and i.status <> 'published'
       )
  ),
  ordered as (
    select s.id as item_id, null::uuid as case_study_id, null::smallint as step,
           0 as part, s.created_at as made, s.id as tiebreak, 0::smallint as position
      from standalone s
    union all
    select csi.item_id, c.id, csi.position, 1, c.created_at, c.id, csi.position
      from playable_case c
      join public.case_study_items csi on csi.case_study_id = c.id
  )
  select o.item_id, o.case_study_id, o.step,
         row_number() over (order by o.part, o.made, o.tiebreak, o.position)
    from ordered o;
$$;

revoke all on function private.practice_item_set(uuid)
  from public, anon, authenticated, service_role;

-- The run, if it is the student's, the newest for its bank, and its bank is still shared with
-- them. Null otherwise: the one check every practice read and write goes through.
create function private.live_practice_run(student uuid, target_run uuid)
returns public.practice_runs
language sql stable security definer set search_path = ''
as $$
  select r.*
    from public.practice_runs r
   where r.id = target_run
     and r.student_id = student
     and private.practice_shared_with(student, r.bank_id)
     and not exists (
       select 1 from public.practice_runs newer
        where newer.student_id = r.student_id
          and newer.bank_id = r.bank_id
          and (newer.started_at, newer.id) > (r.started_at, r.id)
     );
$$;

revoke all on function private.live_practice_run(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The server's calls (service role only)
-- ---------------------------------------------------------------------------

-- Opens the student's practice of a bank: their newest run, or a new one when there is none or
-- `fresh` is true ("Start over"). No row when the bank is not shared with them.
create function public.open_practice_run(student uuid, target_bank uuid, fresh boolean)
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
     order by r.started_at desc, r.id desc
     limit 1;
  end if;

  if found_run.id is null then
    select b.org_id into bank_org from public.item_banks b where b.id = target_bank;
    insert into public.practice_runs (org_id, student_id, bank_id)
    values (bank_org, student, target_bank)
    returning * into found_run;
  end if;

  return query
    select found_run.id, found_run.bank_id, b.name, found_run.seed, found_run.started_at
      from public.item_banks b
     where b.id = found_run.bank_id;
end;
$$;

revoke all on function public.open_practice_run(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.open_practice_run(uuid, uuid, boolean) to service_role;

-- A live run's items in play order, each with the case study it belongs to and whether this run
-- has answered it. No rows when the run is not live for the student (not theirs, started over,
-- or the share stopped).
create function public.practice_run_items(student uuid, target_run uuid)
returns table (
  item_id uuid,
  case_study_id uuid,
  step smallint,
  ordinal bigint,
  answered boolean
)
language sql stable security definer set search_path = ''
as $$
  select s.item_id, s.case_study_id, s.step, s.ordinal,
         exists (
           select 1 from public.practice_responses p
            where p.run_id = r.id and p.item_id = s.item_id
         )
    from private.live_practice_run(student, target_run) r
    cross join lateral private.practice_item_set(r.bank_id) s
   where r.id is not null
   order by s.ordinal;
$$;

revoke all on function public.practice_run_items(uuid, uuid) from public, anon, authenticated;
grant execute on function public.practice_run_items(uuid, uuid) to service_role;

-- Records one scored answer. 'recorded', or 'answered' when this run already has an answer for
-- the item (nothing changes), or 'not_found' when the run is not live for the student or the item
-- is not one of its items.
create function public.record_practice_response(
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
  inserted integer;
begin
  run := private.live_practice_run(student, target_run);
  if run.id is null then
    return 'not_found';
  end if;
  if not exists (
    select 1 from private.practice_item_set(run.bank_id) s where s.item_id = target_item
  ) then
    return 'not_found';
  end if;

  insert into public.practice_responses (run_id, org_id, item_id, response, points, max_points, score)
  values (run.id, run.org_id, target_item, answer, earned, possible, marks)
  on conflict (run_id, item_id) do nothing;
  get diagnostics inserted = row_count;
  return case when inserted = 1 then 'recorded' else 'answered' end;
end;
$$;

revoke all on function public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_practice_response(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- The student's own reads
-- ---------------------------------------------------------------------------

-- The Practice list: each bank shared with one of the caller's current classes, its name, how
-- many items a run of it holds, and how many the caller's newest run has answered.
create function public.my_practice_banks()
returns table (bank_id uuid, bank_name text, item_count integer, answered integer)
language sql stable security definer set search_path = ''
as $$
  with caller as (
    select (select auth.uid()) as id
  ),
  banks as (
    select distinct s.bank_id, c.id as caller
      from caller c
      join public.class_members m on m.profile_id = c.id
      join public.bank_practice_shares s on s.class_id = m.class_id
     where c.id is not null
       and private.is_current_member(m.class_id, c.id)
  )
  select b.id,
         b.name,
         (select count(*)::integer from private.practice_item_set(b.id)),
         coalesce((
           select count(*)::integer
             from public.practice_responses p
            where p.run_id = (
              select r.id from public.practice_runs r
               where r.student_id = x.caller and r.bank_id = b.id
               order by r.started_at desc, r.id desc
               limit 1
            )
         ), 0)
    from banks x
    join public.item_banks b on b.id = x.bank_id
   order by b.name, b.id
   limit 200;
$$;

revoke all on function public.my_practice_banks() from public, anon;
grant execute on function public.my_practice_banks() to authenticated;

-- Practice for #239's "Your steps": each item's first practice answer (across every run of the
-- caller's), for banks still shared with one of their current classes, with the item's CJMM step.
-- The first answer, because every later one came after its key was shown. A step and two numbers
-- per row; nothing else.
create function public.my_practice_step_marks()
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
