-- A student's own live session results (ADR 0013 follow-up).
--
-- Since 20261024000000_class_live_sessions.sql a signed-in member who joins a live session for
-- their class has their participant row linked to their profile (participants.profile_id). This
-- migration lets that student read back what they did there, and nothing else:
--
--   1. private.my_live_places(account, only_session): the one place the rules are kept. For each
--      ENDED session where a participant row is linked to `account`, the 50 most recently ended,
--      each question the session put to the room, with the caller's own answer to it if they gave
--      one. Callable by no API role.
--   2. public.my_live_results(): the student home's "Live sessions" list. Per session: title, the
--      class's name, when it ended, the questions, how many the caller answered, their points, what
--      was possible, and per question only its place and two numbers. No item id, key, rationale,
--      answer or stem, and nothing about any other participant.
--   3. public.my_live_result(target_session): the results page for one session. The same session
--      row, the item ids of its questions in order, its patient records, and the caller's own
--      answers with the marks and the key each was scored against (session_responses.reveal, as
--      my_assignment_result hands back attempt_responses.reveal after the close). No rows for a
--      session that has not ended, one the caller was not linked in, or one that does not exist,
--      so the app cannot tell them apart and answers not-found for all three.
--   4. public.my_live_step_marks(): the caller's own live answers as { cjmm_step, points,
--      max_points }, for "Your clinical judgment steps" beside #239's my_step_marks and #241's
--      my_practice_step_marks, which are not changed. A third function rather than a change to
--      either of those: the home already merges two sources in the app, and a new function cannot
--      change what the existing ones answer.
--
-- The rules, in every function:
--
--   * The caller is auth.uid() and nothing else: there is no account argument on any public
--     function, and a call with no session reads nothing. A teacher has no linked participant
--     (join_session links only a student who is a current class member), so a teacher reads none.
--   * Only sessions whose status is 'ended'. A running, paused or lobby session is not returned at
--     all, not even its title, so nothing about a live room reaches anyone through here. The
--     database's status is the clock: the app never decides a session has ended.
--   * Only participant rows with profile_id = the caller. An anonymous participant (profile_id
--     null, every quick session and every guest) is never returned, whatever name it typed.
--   * Not limited to the caller's current classes. A student taken off a class keeps their own
--     record, as a removed student keeps their assignment results (my_assignment_result answers
--     anyone with an attempt). A deleted class leaves class_id null and the session is still the
--     student's own; its class name reads null.
--
-- Which questions a session "put to the room". A teacher may end a session before its last
-- question. For a teacher-paced session that is positions 1 to current_position as it ended, plus
-- any position the caller answered (a teacher may have gone back before ending). For a
-- student-paced session every phone could reach every question, so it is the whole set. A question
-- the session never reached is not listed, scored or shown with its key: the teacher may still use
-- it in the next session.
--
-- What a question was worth, for "possible": the caller's own mark's maximum when they answered,
-- and otherwise the item's own scoring.maxPoints, which is how an assignment's results count a
-- question left blank (src/lib/assignments/resultsSummary.ts). Never anyone else's answer.
--
-- Deploy order: after 20261024000000_class_live_sessions.sql (PR #488), and before the app that
-- calls these functions (docs/05 section 7.2). Safe to replay on a fresh project: one partial
-- index, four new functions and their grants; no table, column, policy or row is changed.

-- ---------------------------------------------------------------------------
-- The index every read below starts from
-- ---------------------------------------------------------------------------

-- participants_session_profile_key leads with session_id, so "this student's participants" would
-- be a scan of every participant ever. Partial: anonymous rows, nearly all of them, are left out.
create index participants_profile_id_idx
  on public.participants (profile_id)
  where profile_id is not null;

-- ---------------------------------------------------------------------------
-- 1. The places a student's own live results are read from
-- ---------------------------------------------------------------------------

create function private.my_live_places(account uuid, only_session uuid default null)
returns table (
  session_id uuid,
  item_position integer,
  item_id uuid,
  cjmm_step smallint,
  worth numeric,
  response_id uuid
)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select s.id, s.mode, s.current_position, s.item_set, p.id as participant
      from public.participants p
      join public.sessions s on s.id = p.session_id and s.org_id = p.org_id
     where account is not null
       and p.profile_id = account
       and s.status = 'ended'
       and (only_session is null or s.id = only_session)
     order by s.closed_at desc nulls last, s.id
     limit 50
  ),
  places as (
    select m.id as session_id,
           place.ord::integer as item_position,
           (place.value #>> '{}')::uuid as item_id,
           r.id as response_id,
           r.max_points as answered_worth,
           m.mode,
           m.current_position
      from mine m
     cross join lateral jsonb_array_elements(
       case when jsonb_typeof(m.item_set) = 'array' then m.item_set else '[]'::jsonb end
     ) with ordinality as place(value, ord)
      left join public.session_responses r
        on r.session_id = m.id
       and r.participant_id = m.participant
       and r.item_position = place.ord
  )
  select pl.session_id,
         pl.item_position,
         pl.item_id,
         i.cjmm_step,
         coalesce(
           pl.answered_worth,
           case when jsonb_typeof(i.scoring -> 'maxPoints') = 'number'
                then (i.scoring ->> 'maxPoints')::numeric end,
           0),
         pl.response_id
    from places pl
    left join public.items i on i.id = pl.item_id
   where pl.response_id is not null
      or pl.mode = 'student_paced'
      or pl.item_position <= coalesce(pl.current_position, 0)
   order by pl.session_id, pl.item_position;
$$;

revoke all on function private.my_live_places(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The student home's list
-- ---------------------------------------------------------------------------

create function public.my_live_results()
returns table (
  session_id uuid,
  title text,
  class_id uuid,
  class_name text,
  closed_at timestamptz,
  question_count integer,
  answered integer,
  points numeric,
  possible numeric,
  marks jsonb
)
language sql stable security definer set search_path = ''
as $$
  with places as (
    select pl.*, r.points
      from private.my_live_places((select auth.uid())) pl
      left join public.session_responses r on r.id = pl.response_id
  ),
  totals as (
    select pl.session_id,
           count(*)::integer as question_count,
           count(pl.response_id)::integer as answered,
           coalesce(sum(pl.points), 0) as points,
           coalesce(sum(pl.worth), 0) as possible,
           jsonb_agg(
             jsonb_build_object('position', pl.item_position, 'points', pl.points,
                                'max_points', pl.worth)
             order by pl.item_position) as marks
      from places pl
     group by pl.session_id
  )
  select s.id, s.title, s.class_id, c.name, s.closed_at, t.question_count, t.answered, t.points,
         t.possible, t.marks
    from totals t
    join public.sessions s on s.id = t.session_id
    left join public.classes c on c.id = s.class_id and c.org_id = s.org_id
   order by s.closed_at desc nulls last, s.id;
$$;

revoke all on function public.my_live_results() from public, anon;
grant execute on function public.my_live_results() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. One session's results page
-- ---------------------------------------------------------------------------

create function public.my_live_result(target_session uuid)
returns table (
  session_id uuid,
  title text,
  class_id uuid,
  class_name text,
  closed_at timestamptz,
  patient_record jsonb,
  case_study_records jsonb,
  questions jsonb
)
language sql stable security definer set search_path = ''
as $$
  with places as (
    select pl.*
      from private.my_live_places((select auth.uid()), target_session) pl
     where target_session is not null
  ),
  questions as (
    select pl.session_id,
           jsonb_agg(
             jsonb_build_object(
               'position', pl.item_position,
               'item_id', pl.item_id,
               'max_points', pl.worth,
               'answer', case when r.id is null then null else jsonb_build_object(
                 'response', r.response,
                 'points', r.points,
                 'max_points', r.max_points,
                 'model', r.model,
                 'breakdown', r.breakdown,
                 'groups', r.groups,
                 'reveal', r.reveal) end)
             order by pl.item_position) as questions
      from places pl
      left join public.session_responses r on r.id = pl.response_id
     group by pl.session_id
  )
  select s.id, s.title, s.class_id, c.name, s.closed_at, s.patient_record, s.case_study_records,
         q.questions
    from questions q
    join public.sessions s on s.id = q.session_id
    left join public.classes c on c.id = s.class_id and c.org_id = s.org_id;
$$;

revoke all on function public.my_live_result(uuid) from public, anon;
grant execute on function public.my_live_result(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Live answers toward "Your clinical judgment steps"
-- ---------------------------------------------------------------------------

create function public.my_live_step_marks()
returns table (cjmm_step smallint, points numeric, max_points numeric)
language sql stable security definer set search_path = ''
as $$
  select pl.cjmm_step, r.points, r.max_points
    from private.my_live_places((select auth.uid())) pl
    join public.session_responses r on r.id = pl.response_id
   order by pl.session_id, pl.item_position;
$$;

revoke all on function public.my_live_step_marks() from public, anon;
grant execute on function public.my_live_step_marks() to authenticated;
