-- A student's history (#238): every closed assignment in their current classes, with their own
-- attempts and, on each submitted one, its score.
--
-- The student home lists it under "History" in one read per page load. It is the list form of
-- #210's public.my_assignment_result, and keeps that function's rules:
--
--   * The caller is auth.uid() and nothing else: there is no student argument, and a call with no
--     session reads nothing.
--   * "Closed" is private.assignment_refusal answering 'closed': the database's clock, with #208's
--     two seconds of grace. No second definition of it is written here. An assignment still open
--     (or within its grace) is not in the list at all, so no score of it can be.
--   * Only the caller's own attempts are joined, and a score and maximum only on a submitted one.
--     An attempt still open carries neither (the app runs the submit at close before it reads).
--   * Nothing here holds a key, a rationale, an answer or a per-item mark.
--
-- Unlike my_assignment_result, only the caller's current classes count (private.is_current_member):
-- the student home lists the classes a student is in now. A student taken off a class keeps their
-- results by URL through my_assignment_result; they just no longer see that class's work listed.
--
-- One row per attempt, most recently closed assignment first and oldest attempt first within it,
-- or a single row with empty attempt columns for an assignment the caller never started. Which
-- attempt counts (the best: owner decision 2026-09-23) is decided by the app from these rows with
-- the same `pickBestAttempt` as #210 and #211; nothing here chooses.
--
-- The 50 most recently closed assignments at most, like the list it replaces. max_attempts is at
-- most 3, so that is at most 150 rows.
--
-- Safe to replay on a fresh project: one new function.

create function public.my_assignment_history()
returns table (
  assignment_id uuid,
  class_id uuid,
  title text,
  closes_at timestamptz,
  max_attempts smallint,
  attempt_id uuid,
  attempt_number smallint,
  submitted_at timestamptz,
  score numeric,
  max_score numeric
)
language sql stable security definer set search_path = ''
as $$
  with caller as (
    select (select auth.uid()) as id
  ),
  closed as (
    select s.id, s.class_id, s.title, s.closes_at, s.max_attempts, c.id as caller
      from caller c
      join public.class_members m on m.profile_id = c.id
      join public.assignments s on s.class_id = m.class_id
     where c.id is not null
       and private.is_current_member(m.class_id, c.id)
       and private.assignment_refusal(s.opens_at, s.closes_at) is not distinct from 'closed'
     order by s.closes_at desc, s.id
     limit 50
  )
  select t.id,
         t.class_id,
         t.title,
         t.closes_at,
         t.max_attempts,
         a.id,
         a.number,
         a.submitted_at,
         case when a.submitted_at is not null then a.score end,
         case when a.submitted_at is not null then a.max_score end
    from closed t
    left join public.assignment_attempts a
      on a.assignment_id = t.id and a.student_id = t.caller
   order by t.closes_at desc, t.id, a.number nulls first;
$$;

revoke all on function public.my_assignment_history() from public, anon;
grant execute on function public.my_assignment_history() to authenticated;
