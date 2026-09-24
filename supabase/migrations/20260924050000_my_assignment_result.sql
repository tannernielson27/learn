-- A student's own results (#210): their score and marks on an assignment, once it has closed.
--
-- #208's column grant leaves `score`, `max_score` and every per-item mark out of `authenticated`
-- entirely, so a student has no path to them. #211 added one for authors. This adds the one for
-- students: public.my_assignment_result, a security definer function that answers only the caller
-- about their own attempts, and only after the close.
--
-- ---------------------------------------------------------------------------
-- Who gets what
-- ---------------------------------------------------------------------------
--
-- The caller is auth.uid() and nothing else: there is no student argument. They get rows only when
-- both hold:
--
--   * the assignment has closed, by the database's clock, with #208's two seconds of grace
--     (private.assignment_refusal answers 'closed'); and
--   * they are a current member of its class, or they made an attempt at it. A student taken off
--     the class after taking the assignment still sees their results: the attempts are their own
--     work, and the key was released to the class at the same moment. A removed student who never
--     started gets nothing, like anyone else outside the class.
--
-- Anyone else — another student, an author (of this org or another), an account with no role,
-- anon — gets no rows, exactly as for an assignment that does not exist, and so does everyone
-- before the close.
--
-- ---------------------------------------------------------------------------
-- What the rows hold
-- ---------------------------------------------------------------------------
--
-- One row per attempt of the caller's, oldest first, or a single row with empty attempt columns
-- when they made none (so the page can still show the items and their rationales with "You did not
-- attempt this"). Every row repeats the assignment's header, item set and patient record snapshot,
-- because a removed student can no longer read the assignment row under its own policy.
--
-- A submitted attempt carries its score, its maximum and `marks`: one object per saved answer with
-- the answer itself and its mark as #208 recorded it (points, max_points, model, breakdown,
-- groups). An attempt still open carries none of them. Nothing here holds a key or a rationale:
-- the app reads the items with those on the server, and only once this function has answered.
--
-- Which attempt counts (the best: owner decision 2026-09-23) is decided by the app from these
-- rows, as #211's report does; nothing here chooses.
--
-- Safe to replay on a fresh project: one new function.

create function public.my_assignment_result(target_assignment uuid)
returns table (
  assignment_id uuid,
  title text,
  closes_at timestamptz,
  max_attempts smallint,
  item_set jsonb,
  patient_record jsonb,
  attempt_id uuid,
  attempt_number smallint,
  started_at timestamptz,
  submitted_at timestamptz,
  auto_submitted boolean,
  score numeric,
  max_score numeric,
  marks jsonb
)
language sql stable security definer set search_path = ''
as $$
  with caller as (
    select (select auth.uid()) as id
  ),
  target as (
    select s.id, s.title, s.closes_at, s.max_attempts, s.item_set, s.patient_record, c.id as caller
      from public.assignments s
      join caller c on c.id is not null
     where s.id = target_assignment
       and private.assignment_refusal(s.opens_at, s.closes_at) is not distinct from 'closed'
       and (
         private.is_current_member(s.class_id, c.id)
         or exists (
           select 1 from public.assignment_attempts a
            where a.assignment_id = s.id and a.student_id = c.id
         )
       )
  )
  select t.id,
         t.title,
         t.closes_at,
         t.max_attempts,
         t.item_set,
         t.patient_record,
         a.id,
         a.number,
         a.started_at,
         a.submitted_at,
         coalesce(a.auto_submitted, false),
         case when a.submitted_at is not null then a.score end,
         case when a.submitted_at is not null then a.max_score end,
         case when a.submitted_at is not null then (
           select coalesce(
                    jsonb_agg(
                      jsonb_build_object(
                        'item_id', r.item_id,
                        'response', r.response,
                        'points', r.points,
                        'max_points', r.max_points,
                        'model', r.model,
                        'breakdown', r.breakdown,
                        'groups', r.groups)
                      order by r.item_id),
                    '[]'::jsonb)
             from public.attempt_responses r
            where r.attempt_id = a.id
         ) end
    from target t
    left join public.assignment_attempts a
      on a.assignment_id = t.id and a.student_id = t.caller
   order by a.number nulls first;
$$;

revoke all on function public.my_assignment_result(uuid) from public, anon;
grant execute on function public.my_assignment_result(uuid) to authenticated;
