-- How a question has performed across every live session and assignment it was used in (#616).
--
-- Scored answers sit in two places with two access rules. public.session_responses is readable by
-- an author of the workspace; public.attempt_responses gives authors no column grant on scores,
-- which they reach only through assignment_report_rows. Both store the source question's id
-- (item_id), so answers can be grouped back to one question. This adds the two reads that do it,
-- for #615's statistics (src/lib/ngn/questionStats.ts) through src/lib/supabase/questionStatsReads.ts.
--
-- What this migration adds:
--
--   1. public.quiz_question_marks(target_bank): for every question now in the quiz, one row per
--      counted scored answer: the use it came from (use_kind, use_id, used_at), an opaque answerer
--      key, points, max_points, and the key it was scored with (scored_key). No answer content.
--   2. public.question_answers(target_item): for one question, the same rows with the response
--      and the whole stored reveal in place of scored_key, newest first, at most 2,000.
--   3. attempt_responses_item_id_idx, so "every attempt answer to these questions" is an index
--      read. session_responses_item_id_idx already exists (20260920130000).
--
-- ---------------------------------------------------------------------------
-- Who may read it
-- ---------------------------------------------------------------------------
--
-- An author (instructor or admin) of the quiz's own workspace, with the same two checks
-- assignment_report_rows and private.progress_class make: private.is_author() and the quiz's (or
-- question's) org_id = private.current_org_id(). Anyone else (a student, a teacher of another
-- workspace, an account with no role) gets no rows, never an error, so a quiz they cannot see
-- reads exactly like one nobody has answered. Security definer because attempt_responses' scores
-- and reveals are out of an author's column grant, as they are for assignment_report_rows.
-- Granted to authenticated only; anon and the service role hold nothing.
--
-- ---------------------------------------------------------------------------
-- Which answers count
-- ---------------------------------------------------------------------------
--
-- * A live session's answers only once it has ended (sessions.status = 'ended'), every
--   participant's, guests included. One row per participant per position
--   (session_responses_once), and so per question.
-- * An assignment's answers only once it has closed (private.assignment_refusal = 'closed', the
--   rule of the report and the student's results), and only the student's first submitted
--   attempt: the submitted attempt with the lowest `number` (assignment_attempts_number_key makes
--   it unique per student and assignment, so there is no tie; submitted_at plays no part, so two
--   attempts submitted at the same instant still give attempt 1). An unsubmitted attempt and a
--   response with no mark add nothing. Grades are untouched: reports and class progress keep the
--   best-attempt rule.
-- * Practice never counts: its answers are in practice_responses, which neither function reads.
-- * A question counts by item_id, so a question moved to another quiz keeps its answers, from
--   every use, whichever quiz the use was made from. A case study step is a question like any
--   other. A question deleted since is not in the quiz and has no rows.
--
-- ---------------------------------------------------------------------------
-- What each row says
-- ---------------------------------------------------------------------------
--
-- use_kind is 'live' or 'assignment'; use_id the session or the assignment; used_at a session's
-- start (opened_at) or an assignment's close (closes_at), as in class_progress.
--
-- answerer is md5(use_id || ':' || participant id) for a live answer and md5(use_id || ':' ||
-- student id) for an assignment answer: stable within a use, the same in both functions, and
-- different for the same person in two uses, so it is not a key to join answers across uses or
-- back to a profile. It is not a secret: an author who already knows a student's id (the
-- assignment report hands it to them) could recompute it. Authors see names in reports anyway;
-- this only keeps a join key out of the rows.
--
-- scored_key is the stored reveal's answerKey and scoring, {answerKey, scoring}, with the
-- rationale left out, or null for a row written before 20260928000000_scored_reveal.sql. #615 sets
-- aside an answer scored with an earlier key (earlierAnswers); whether a key is the current one is
-- decided in TS against the question as it is now (scoredWithCurrentKey), never here, so the
-- comparison rules stay in one place.
--
-- quiz_question_marks returns every counted answer to every question in the quiz, so each
-- answerer's share on the rest of the use is there for #615's separation figure. Its order is use,
-- answerer, question (and position), stable for reading it a page at a time.
--
-- Nothing here writes. Safe to replay on a fresh project: an index made only if it is missing,
-- and two new functions with their grants.

-- ---------------------------------------------------------------------------
-- 3. The index
-- ---------------------------------------------------------------------------

create index if not exists attempt_responses_item_id_idx
  on public.attempt_responses (item_id);

-- ---------------------------------------------------------------------------
-- 1. Every counted mark for every question in a quiz
-- ---------------------------------------------------------------------------

create function public.quiz_question_marks(target_bank uuid)
returns table (
  use_kind text,
  use_id uuid,
  used_at timestamptz,
  answerer text,
  item_id uuid,
  points numeric,
  max_points numeric,
  scored_key jsonb
)
language sql stable security definer set search_path = ''
as $$
  with target as (
    select b.id, b.org_id
      from public.item_banks b
     where b.id = target_bank
       and (select private.is_author())
       and b.org_id = (select private.current_org_id())
  ),
  questions as (
    select i.id, i.org_id
      from target t
      join public.items i on i.bank_id = t.id and i.org_id = t.org_id
  ),
  live_marks as (
    select 'live'::text as use_kind, s.id as use_id, s.opened_at as used_at,
           md5(s.id::text || ':' || r.participant_id::text) as answerer,
           r.item_id, r.points, r.max_points, r.reveal, r.item_position
      from questions q
      join public.session_responses r on r.item_id = q.id and r.org_id = q.org_id
      join public.sessions s on s.id = r.session_id and s.org_id = r.org_id
     where s.status = 'ended'
  ),
  assignment_marks as (
    select 'assignment'::text, a.id, a.closes_at,
           md5(a.id::text || ':' || x.student_id::text),
           r.item_id, r.points, r.max_points, r.reveal, null::smallint
      from questions q
      join public.attempt_responses r on r.item_id = q.id and r.org_id = q.org_id
      join public.assignment_attempts x on x.id = r.attempt_id and x.org_id = r.org_id
      join public.assignments a on a.id = x.assignment_id and a.org_id = x.org_id
     where r.points is not null and r.max_points is not null
       and x.submitted_at is not null
       and private.assignment_refusal(a.opens_at, a.closes_at) is not distinct from 'closed'
       and not exists (
         select 1 from public.assignment_attempts y
          where y.assignment_id = x.assignment_id and y.student_id = x.student_id
            and y.submitted_at is not null and y.number < x.number
       )
  ),
  marks as (
    select * from live_marks
    union all
    select * from assignment_marks
  )
  select m.use_kind, m.use_id, m.used_at, m.answerer, m.item_id, m.points, m.max_points,
         case when m.reveal is not null
              then jsonb_build_object('answerKey', m.reveal -> 'answerKey',
                                      'scoring', m.reveal -> 'scoring') end
    from marks m
   order by m.use_kind, m.use_id, m.answerer, m.item_id, m.item_position nulls first;
$$;

revoke all on function public.quiz_question_marks(uuid) from public, anon, service_role;
grant execute on function public.quiz_question_marks(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. One question's counted answers, with what was answered
-- ---------------------------------------------------------------------------

create function public.question_answers(target_item uuid)
returns table (
  use_kind text,
  use_id uuid,
  used_at timestamptz,
  answerer text,
  item_id uuid,
  points numeric,
  max_points numeric,
  response jsonb,
  reveal jsonb
)
language sql stable security definer set search_path = ''
as $$
  with question as (
    select i.id, i.org_id
      from public.items i
     where i.id = target_item
       and (select private.is_author())
       and i.org_id = (select private.current_org_id())
  ),
  live_answers as (
    select 'live'::text as use_kind, s.id as use_id, s.opened_at as used_at,
           md5(s.id::text || ':' || r.participant_id::text) as answerer,
           r.item_id, r.points, r.max_points, r.response, r.reveal, r.item_position
      from question q
      join public.session_responses r on r.item_id = q.id and r.org_id = q.org_id
      join public.sessions s on s.id = r.session_id and s.org_id = r.org_id
     where s.status = 'ended'
  ),
  assignment_answers as (
    select 'assignment'::text, a.id, a.closes_at,
           md5(a.id::text || ':' || x.student_id::text),
           r.item_id, r.points, r.max_points, r.response, r.reveal, null::smallint
      from question q
      join public.attempt_responses r on r.item_id = q.id and r.org_id = q.org_id
      join public.assignment_attempts x on x.id = r.attempt_id and x.org_id = r.org_id
      join public.assignments a on a.id = x.assignment_id and a.org_id = x.org_id
     where r.points is not null and r.max_points is not null
       and x.submitted_at is not null
       and private.assignment_refusal(a.opens_at, a.closes_at) is not distinct from 'closed'
       and not exists (
         select 1 from public.assignment_attempts y
          where y.assignment_id = x.assignment_id and y.student_id = x.student_id
            and y.submitted_at is not null and y.number < x.number
       )
  ),
  answers as (
    select * from live_answers
    union all
    select * from assignment_answers
  )
  select a.use_kind, a.use_id, a.used_at, a.answerer, a.item_id, a.points, a.max_points,
         a.response, a.reveal
    from answers a
   order by a.used_at desc, a.use_kind, a.use_id, a.answerer, a.item_position nulls first
   limit 2000;
$$;

revoke all on function public.question_answers(uuid) from public, anon, service_role;
grant execute on function public.question_answers(uuid) to authenticated;
