-- The assignment report (#211): an author's read of how a class did on an assignment.
--
-- #208's column grant leaves `score`, `max_score`, `revision` and every per-item mark out of
-- `authenticated` entirely, authors included, so there is no path for an author to read them. This
-- adds exactly one: public.assignment_report_rows, a security definer function that answers only
-- an author of the assignment's org, and only with scores once the assignment has closed.
--
-- ---------------------------------------------------------------------------
-- Who gets what
-- ---------------------------------------------------------------------------
--
--   * An author (instructor or admin) of the assignment's org: one row per attempt of every
--     current member of the assignment's class, and one row with empty attempt columns for a
--     member who has not started. After the close, each row also carries the attempt's score and
--     its per-item marks.
--   * Anyone else — a student (even one in the class), an author of another org, an account with
--     no role — gets no rows at all, exactly as for an assignment that does not exist.
--
-- ---------------------------------------------------------------------------
-- No scores while it is open
-- ---------------------------------------------------------------------------
--
-- Until the window (and #208's two seconds of grace) has closed, `scores_released` is false and
-- `score`, `max_score` and `marks` are null on every row, whatever the attempts hold. So an
-- instructor who projects the report mid-window shows who has started and who has submitted and
-- nothing about right or wrong, and the rule holds here, not only in the page.
--
-- Which attempt counts (the best: owner decision 2026-09-23) is decided by the app, which is
-- handed every submitted attempt's score; nothing here chooses.
--
-- Students removed from the class are not listed: the report is the class as it stands.
--
-- Rows are ordered by student then attempt number, so PostgREST's max_rows can be paged through
-- with a range. Safe to replay on a fresh project: one new function.

create function public.assignment_report_rows(target_assignment uuid)
returns table (
  student_id uuid,
  display_name text,
  email text,
  attempt_id uuid,
  attempt_number smallint,
  started_at timestamptz,
  submitted_at timestamptz,
  auto_submitted boolean,
  scores_released boolean,
  score numeric,
  max_score numeric,
  marks jsonb
)
language sql stable security definer set search_path = ''
as $$
  with target as (
    select s.id, s.class_id,
           private.assignment_refusal(s.opens_at, s.closes_at) is not distinct from 'closed'
             as released
      from public.assignments s
     where s.id = target_assignment
       and (select private.is_author())
       and s.org_id = (select private.current_org_id())
  )
  select m.profile_id,
         p.display_name,
         u.email::text,
         a.id,
         a.number,
         a.started_at,
         a.submitted_at,
         coalesce(a.auto_submitted, false),
         t.released,
         case when t.released then a.score end,
         case when t.released then a.max_score end,
         case when t.released and a.submitted_at is not null then (
           select coalesce(
                    jsonb_agg(
                      jsonb_build_object('item_id', r.item_id, 'points', r.points,
                                         'max_points', r.max_points)
                      order by r.item_id),
                    '[]'::jsonb)
             from public.attempt_responses r
            where r.attempt_id = a.id
              and r.points is not null
              and r.max_points is not null
         ) end
    from target t
    join public.class_members m on m.class_id = t.class_id
    join public.profiles p on p.id = m.profile_id
    join auth.users u on u.id = p.id
    left join public.assignment_attempts a
      on a.assignment_id = t.id and a.student_id = m.profile_id
   order by m.profile_id, a.number nulls first;
$$;

revoke all on function public.assignment_report_rows(uuid) from public, anon;
grant execute on function public.assignment_report_rows(uuid) to authenticated;
