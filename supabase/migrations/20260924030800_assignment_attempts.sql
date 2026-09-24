-- Taking an assignment (#208): attempts, autosaved answers, submit, and the submit at close.
--
-- A student opens an assignment of a class they are a current member of, starts an attempt,
-- answers at their own pace (every change is saved), leaves, comes back on any device, and submits.
-- The server scores every item through src/lib/ngn/submit.ts and stores the total. The student is
-- told "Submitted" and nothing about right or wrong until the assignment closes (#210).
--
-- ---------------------------------------------------------------------------
-- Who writes what
-- ---------------------------------------------------------------------------
--
-- Nobody writes either table directly: not a student, not an author, not the service role (its
-- insert, update and delete are revoked like session_responses'). Every write is one of four
-- functions, and each re-checks everything it depends on in the statement that writes:
--
--   public.start_assignment_attempt   (authenticated, as auth.uid())  start, or resume the open one
--   public.save_attempt_response      (authenticated, as auth.uid())  one answer, last write wins
--   public.begin_attempt_submission   (authenticated, as auth.uid())  what the server is to score
--   public.record_attempt_submission  (service_role only)             the score, once
--
-- The first three are the student's own and take their identity from the JWT, never from an
-- argument. The fourth takes a score, and a function that takes a score must not be one a browser
-- can call, so it is granted to the service role alone: the app's server calls it after scoring on
-- the server (ADR 0003), naming the student it verified.
--
-- What SQL enforces on start, save and submit alike:
--   * the window: nothing before opens_at, nothing after closes_at plus the live timer's two
--     seconds of grace (a request in the air, not a phone's clock);
--   * current membership of the assignment's class, and not being on private.class_removals;
--   * one open attempt at a time (a partial unique index), and at most max_attempts in all;
--   * a per-student rate limit: `attempt_save` 120 a minute, `attempt_submit` 20 a minute (starting
--     is charged to `attempt_submit` too), through the same private.take_rate_limit the authoring
--     limits use.
--
-- ---------------------------------------------------------------------------
-- A save racing a submit
-- ---------------------------------------------------------------------------
--
-- Scoring happens in TypeScript between begin_attempt_submission (which hands the server the saved
-- answers) and record_attempt_submission. A save landing in that gap would be stored but never
-- scored. So every save bumps the attempt's `revision`, begin hands the server the revision it
-- read, and record refuses as 'changed' if the revision moved; the server reads and scores again.
-- Save and record both lock the attempt row, so the check and the write cannot interleave.
--
-- ---------------------------------------------------------------------------
-- The submit at close
-- ---------------------------------------------------------------------------
--
-- An attempt still open when the window closes is submitted with exactly what it saved. SQL cannot
-- score (the scoring engine is TypeScript, and ADR 0003 keeps it in one place), so the database
-- only lists what is due, `public.expired_open_attempts`, and the app's server scores each one and
-- records it with `automatic => true`. It runs from the server whenever a student opens an
-- assignment that has closed (src/lib/assignments/autoSubmit.ts), and #212's cron calls the same
-- function for everyone. Recording is idempotent: an attempt already submitted answers
-- 'already_submitted' and nothing changes, so two runs racing each other score it once. An
-- automatic submit is stamped at closes_at, when it was due.
--
-- ---------------------------------------------------------------------------
-- What a student reads
-- ---------------------------------------------------------------------------
--
-- Their own attempts and their own saved answers, and only the columns that say nothing about a
-- mark: a column grant leaves `score`, `max_score` and every per-item mark out entirely, so no
-- policy and no query can reach them. Scores reach students at close through #210's read, which
-- runs on the server after this migration's auto-submit.
--
-- Safe to replay on a fresh project: new tables, new functions, and `create or replace` of
-- private.rate_limit_for with the four existing limits unchanged.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.assignment_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  assignment_id uuid not null,
  student_id uuid not null references public.profiles (id) on delete cascade,
  number smallint not null check (number between 1 and 3),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(8, 2),
  max_score numeric(8, 2) check (max_score >= 0),
  auto_submitted boolean not null default false,
  -- Bumped by every save; see "A save racing a submit" above.
  revision integer not null default 0 check (revision >= 0),
  constraint assignment_attempts_number_key unique (assignment_id, student_id, number),
  constraint assignment_attempts_id_org_key unique (id, org_id),
  constraint assignment_attempts_assignment_org_fkey foreign key (assignment_id, org_id)
    references public.assignments (id, org_id) on delete cascade,
  -- Open, or submitted with a score: never half of each.
  constraint assignment_attempts_submitted_scored check (
    (submitted_at is null and score is null and max_score is null and not auto_submitted)
    or (submitted_at is not null and score is not null and max_score is not null)
  )
);

-- One open attempt per student per assignment: a second start resumes it rather than opening another.
create unique index assignment_attempts_one_open
  on public.assignment_attempts (assignment_id, student_id) where submitted_at is null;
create index assignment_attempts_org_id_idx on public.assignment_attempts (org_id);
create index assignment_attempts_student_id_idx on public.assignment_attempts (student_id);
-- expired_open_attempts looks for open attempts only.
create index assignment_attempts_open_idx
  on public.assignment_attempts (assignment_id) where submitted_at is null;

comment on table public.assignment_attempts is
  'One student''s attempt at an assignment (#208). Written only by the attempt functions; a '
  'student reads their own rows'' non-score columns.';

create table public.attempt_responses (
  attempt_id uuid not null,
  org_id uuid not null,
  -- An id from the assignment's item_set, checked by save_attempt_response. No foreign key, like
  -- item_set itself: the snapshot outlives an item an author deletes.
  item_id uuid not null,
  -- The size cap matches the app's item payload limit, so a script calling the function directly
  -- cannot store more than the route would accept.
  response jsonb not null
    check (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 200000),
  saved_at timestamptz not null default now(),
  -- Written once, at submit, by record_attempt_submission. Null while the attempt is open.
  points numeric(8, 2),
  max_points numeric(8, 2) check (max_points >= 0),
  model text check (model is null or length(model) between 1 and 40),
  breakdown jsonb check (breakdown is null or jsonb_typeof(breakdown) = 'array'),
  groups jsonb check (groups is null or jsonb_typeof(groups) = 'array'),
  primary key (attempt_id, item_id),
  constraint attempt_responses_attempt_org_fkey foreign key (attempt_id, org_id)
    references public.assignment_attempts (id, org_id) on delete cascade
);

create index attempt_responses_org_id_idx on public.attempt_responses (org_id);

comment on table public.attempt_responses is
  'One saved answer per attempt per item (#208), last write wins. Marks are written at submit and '
  'never granted to a student.';

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

-- Supabase's default privileges hand anon and authenticated full DML on a new public table.
revoke all on public.assignment_attempts from anon, authenticated;
revoke all on public.attempt_responses from anon, authenticated;
-- The service role reads (the auto-submit and #210) but writes only through the functions below.
revoke insert, update, delete on public.assignment_attempts from service_role;
revoke insert, update, delete on public.attempt_responses from service_role;

-- No score, no revision, no marks: a column that is not granted cannot be selected at all.
grant select (id, assignment_id, student_id, number, started_at, submitted_at, auto_submitted)
  on public.assignment_attempts to authenticated;
grant select (attempt_id, item_id, response, saved_at)
  on public.attempt_responses to authenticated;

alter table public.assignment_attempts enable row level security;
alter table public.attempt_responses enable row level security;

create policy "students read their own attempts" on public.assignment_attempts
  for select to authenticated
  using (student_id = (select auth.uid()));

-- The attempt lookup runs as the student, so the policy above limits it to their own attempts.
create policy "students read their own saved answers" on public.attempt_responses
  for select to authenticated
  using (
    exists (
      select 1 from public.assignment_attempts a
       where a.id = attempt_responses.attempt_id
         and a.student_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Rate limits
-- ---------------------------------------------------------------------------

-- 20260921200000's function with two actions added; the four existing limits are unchanged.
-- Autosave is debounced in the browser to at most a save or two a second while typing, so 120 a
-- minute is far above real use. Starting and submitting share the smaller budget.
create or replace function private.rate_limit_for(action_name text) returns integer
language sql immutable set search_path = ''
as $$
  select case action_name
    when 'save' then 60
    when 'publish' then 20
    when 'import' then 10
    when 'step' then 30
    when 'attempt_save' then 120
    when 'attempt_submit' then 20
  end;
$$;

revoke all on function private.rate_limit_for(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared checks
-- ---------------------------------------------------------------------------

-- The same two seconds the live timer allows (20260923010000_item_timer.sql).
create function private.assignment_refusal(opens timestamptz, closes timestamptz)
returns text
language sql stable set search_path = ''
as $$
  select case
    when now() < opens then 'not_open'
    when now() > closes + interval '2 seconds' then 'closed'
  end;
$$;

revoke all on function private.assignment_refusal(timestamptz, timestamptz)
  from public, anon, authenticated, service_role;

-- A current member of the class, and not someone an author took off it.
create function private.is_current_member(target_class uuid, account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
      select 1 from public.class_members m
       where m.class_id = target_class and m.profile_id = account
    )
    and not exists (
      select 1 from private.class_removals r
       where r.class_id = target_class and r.profile_id = account
    );
$$;

revoke all on function private.is_current_member(uuid, uuid)
  from public, anon, authenticated, service_role;

-- A student's saved answers for one attempt, as one object keyed by item id.
create function private.attempt_answers(target_attempt uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(r.item_id::text, r.response), '{}'::jsonb)
    from public.attempt_responses r
   where r.attempt_id = target_attempt;
$$;

revoke all on function private.attempt_answers(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Starting, or resuming
-- ---------------------------------------------------------------------------

-- Refusals: 'rate_limited', 'not_found' (no such assignment, or not this student's to take: the
-- two are not told apart), 'not_open', 'closed', 'no_attempts_left'. An open attempt is returned
-- as it is, so a second device resumes rather than starts.
create function public.start_assignment_attempt(target_assignment uuid)
returns table (refusal text, attempt_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  found_assignment public.assignments%rowtype;
  open_attempt uuid;
  used integer;
  window_refusal text;
  created uuid;
begin
  if caller is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not private.take_rate_limit('attempt_submit') then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  select * into found_assignment from public.assignments a where a.id = target_assignment;
  if not found or not private.is_current_member(found_assignment.class_id, caller) then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  window_refusal := private.assignment_refusal(found_assignment.opens_at, found_assignment.closes_at);
  if window_refusal is not null then
    return query select window_refusal, null::uuid;
    return;
  end if;

  select a.id into open_attempt
    from public.assignment_attempts a
   where a.assignment_id = target_assignment and a.student_id = caller and a.submitted_at is null;
  if open_attempt is not null then
    return query select null::text, open_attempt;
    return;
  end if;

  select count(*) into used
    from public.assignment_attempts a
   where a.assignment_id = target_assignment and a.student_id = caller;
  if used >= found_assignment.max_attempts then
    return query select 'no_attempts_left'::text, null::uuid;
    return;
  end if;

  begin
    insert into public.assignment_attempts (org_id, assignment_id, student_id, number)
    values (found_assignment.org_id, target_assignment, caller, used + 1)
    returning id into created;
  exception when unique_violation then
    -- Two devices started at once: the other one won, and its attempt is the one to resume.
    select a.id into created
      from public.assignment_attempts a
     where a.assignment_id = target_assignment and a.student_id = caller
       and a.submitted_at is null;
    if created is null then
      return query select 'no_attempts_left'::text, null::uuid;
      return;
    end if;
  end;

  return query select null::text, created;
end;
$$;

revoke all on function public.start_assignment_attempt(uuid) from public, anon;
grant execute on function public.start_assignment_attempt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Saving one answer
-- ---------------------------------------------------------------------------

-- Refusals: 'rate_limited', 'not_found', 'already_submitted', 'not_open', 'closed', 'wrong_item'
-- (not an item of this assignment), 'malformed' (not a JSON object), 'too_large'.
--
-- The answer is stored as given; the app's route validates it against the response schemas first,
-- and scoring reads every stored answer back through `parseSubmission`, so an answer written by a
-- script straight to this function scores as unanswered rather than as anything else.
create function public.save_attempt_response(target_attempt uuid, target_item uuid, answer jsonb)
returns table (refusal text, saved_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  found_attempt public.assignment_attempts%rowtype;
  found_assignment public.assignments%rowtype;
  window_refusal text;
  written timestamptz;
begin
  if caller is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not private.take_rate_limit('attempt_save') then
    return query select 'rate_limited'::text, null::timestamptz;
    return;
  end if;

  -- Locked, so a submit being recorded and this save are one after the other, never interleaved.
  select * into found_attempt
    from public.assignment_attempts a
   where a.id = target_attempt and a.student_id = caller
   for update;
  if not found then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;
  select * into found_assignment from public.assignments a where a.id = found_attempt.assignment_id;
  if not found or not private.is_current_member(found_assignment.class_id, caller) then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;
  if found_attempt.submitted_at is not null then
    return query select 'already_submitted'::text, null::timestamptz;
    return;
  end if;
  window_refusal := private.assignment_refusal(found_assignment.opens_at, found_assignment.closes_at);
  if window_refusal is not null then
    return query select window_refusal, null::timestamptz;
    return;
  end if;
  if target_item is null or not (found_assignment.item_set ? target_item::text) then
    return query select 'wrong_item'::text, null::timestamptz;
    return;
  end if;
  if answer is null or jsonb_typeof(answer) <> 'object' then
    return query select 'malformed'::text, null::timestamptz;
    return;
  end if;
  if octet_length(answer::text) > 200000 then
    return query select 'too_large'::text, null::timestamptz;
    return;
  end if;

  insert into public.attempt_responses as r (attempt_id, org_id, item_id, response, saved_at)
  values (target_attempt, found_attempt.org_id, target_item, answer, now())
  on conflict (attempt_id, item_id) do update
    set response = excluded.response,
        saved_at = excluded.saved_at
  returning r.saved_at into written;

  update public.assignment_attempts set revision = revision + 1 where id = target_attempt;

  return query select null::text, written;
end;
$$;

revoke all on function public.save_attempt_response(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_attempt_response(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Submitting: what to score, then the score
-- ---------------------------------------------------------------------------

-- What the server needs before it can score a submit the student asked for: the item set, the
-- saved answers and the revision they were read at. Charges the submit limit, so a flood of submit
-- presses costs a counter update rather than a scoring pass. Reads nothing a student may not see.
--
-- Refusals: 'rate_limited', 'not_found', 'already_submitted', 'not_open', 'closed'.
create function public.begin_attempt_submission(target_attempt uuid)
returns table (refusal text, item_set jsonb, revision integer, answers jsonb)
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  found_attempt public.assignment_attempts%rowtype;
  found_assignment public.assignments%rowtype;
  window_refusal text;
begin
  if caller is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not private.take_rate_limit('attempt_submit') then
    return query select 'rate_limited'::text, null::jsonb, null::integer, null::jsonb;
    return;
  end if;

  select * into found_attempt
    from public.assignment_attempts a
   where a.id = target_attempt and a.student_id = caller;
  if not found then
    return query select 'not_found'::text, null::jsonb, null::integer, null::jsonb;
    return;
  end if;
  select * into found_assignment from public.assignments a where a.id = found_attempt.assignment_id;
  if not found or not private.is_current_member(found_assignment.class_id, caller) then
    return query select 'not_found'::text, null::jsonb, null::integer, null::jsonb;
    return;
  end if;
  if found_attempt.submitted_at is not null then
    return query select 'already_submitted'::text, null::jsonb, null::integer, null::jsonb;
    return;
  end if;
  window_refusal := private.assignment_refusal(found_assignment.opens_at, found_assignment.closes_at);
  if window_refusal is not null then
    return query select window_refusal, null::jsonb, null::integer, null::jsonb;
    return;
  end if;

  return query select null::text, found_assignment.item_set, found_attempt.revision,
                      private.attempt_answers(target_attempt);
end;
$$;

revoke all on function public.begin_attempt_submission(uuid) from public, anon;
grant execute on function public.begin_attempt_submission(uuid) to authenticated;

-- Writes the score, once. Service role only: it takes a score.
--
--   automatic = false  the student's own submit. Re-checks the window and the membership, as the
--                      submit is theirs to make only while they could still save.
--   automatic = true   the submit at close. Only once the window (and its grace) has closed, so no
--                      save can land after it; stamped at closes_at.
--
-- `marks` is an array of { item_id, points, max_points, model, breakdown, groups } for the saved
-- answers; items with no saved answer have no row and count only in `possible`.
--
-- Refusals: 'not_found', 'already_submitted' (idempotent: nothing changes), 'changed' (a save
-- landed after the answers were read; read and score again), 'closed', 'not_closed', 'malformed'.
create function public.record_attempt_submission(
  target_attempt uuid,
  student uuid,
  expected_revision integer,
  total numeric,
  possible numeric,
  marks jsonb,
  automatic boolean default false
)
returns table (refusal text, submitted_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  found_attempt public.assignment_attempts%rowtype;
  found_assignment public.assignments%rowtype;
  stamp timestamptz;
begin
  select * into found_attempt
    from public.assignment_attempts a
   where a.id = target_attempt and a.student_id = student
   for update;
  if not found then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;
  if found_attempt.submitted_at is not null then
    return query select 'already_submitted'::text, found_attempt.submitted_at;
    return;
  end if;
  select * into found_assignment from public.assignments a where a.id = found_attempt.assignment_id;
  if not found then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;

  if automatic then
    if private.assignment_refusal(found_assignment.opens_at, found_assignment.closes_at)
       is distinct from 'closed' then
      return query select 'not_closed'::text, null::timestamptz;
      return;
    end if;
    stamp := found_assignment.closes_at;
  else
    if not private.is_current_member(found_assignment.class_id, student) then
      return query select 'not_found'::text, null::timestamptz;
      return;
    end if;
    if private.assignment_refusal(found_assignment.opens_at, found_assignment.closes_at)
       is not null then
      return query select 'closed'::text, null::timestamptz;
      return;
    end if;
    stamp := now();
  end if;

  if found_attempt.revision is distinct from expected_revision then
    return query select 'changed'::text, null::timestamptz;
    return;
  end if;
  if total is null or possible is null or possible < 0 or total > possible
     or marks is null or jsonb_typeof(marks) <> 'array' then
    return query select 'malformed'::text, null::timestamptz;
    return;
  end if;

  update public.attempt_responses r
     set points = (m ->> 'points')::numeric,
         max_points = (m ->> 'max_points')::numeric,
         model = m ->> 'model',
         breakdown = coalesce(m -> 'breakdown', '[]'::jsonb),
         groups = case when jsonb_typeof(m -> 'groups') = 'array' then m -> 'groups' end
    from jsonb_array_elements(marks) as m
   where r.attempt_id = target_attempt
     and r.item_id = (m ->> 'item_id')::uuid;

  update public.assignment_attempts
     set submitted_at = stamp,
         score = total,
         max_score = possible,
         auto_submitted = automatic
   where id = target_attempt;

  return query select null::text, stamp;
end;
$$;

revoke all on function public.record_attempt_submission(uuid, uuid, integer, numeric, numeric, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.record_attempt_submission(uuid, uuid, integer, numeric, numeric, jsonb, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- The submit at close: what is due
-- ---------------------------------------------------------------------------

-- Open attempts whose window (and grace) has closed, with what each saved, oldest close first.
-- Narrowed to one assignment and one student when the page of a closed assignment asks for its
-- viewer's; unnarrowed for #212's cron. Service role only: it reads every student's answers.
create function public.expired_open_attempts(
  target_assignment uuid default null,
  target_student uuid default null,
  max_rows integer default 50
)
returns table (
  attempt_id uuid,
  student_id uuid,
  assignment_id uuid,
  item_set jsonb,
  revision integer,
  answers jsonb
)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.student_id, a.assignment_id, s.item_set, a.revision,
         private.attempt_answers(a.id)
    from public.assignment_attempts a
    join public.assignments s on s.id = a.assignment_id
   where a.submitted_at is null
     and now() > s.closes_at + interval '2 seconds'
     and (target_assignment is null or a.assignment_id = target_assignment)
     and (target_student is null or a.student_id = target_student)
   order by s.closes_at, a.id
   limit least(greatest(coalesce(max_rows, 50), 1), 500);
$$;

revoke all on function public.expired_open_attempts(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.expired_open_attempts(uuid, uuid, integer) to service_role;
