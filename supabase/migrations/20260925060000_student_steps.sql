-- A student's clinical judgment steps (#239): the per-item marks of the caller's own submitted
-- attempts at closed assignments, each with the item's CJMM step, and nothing else.
--
-- The student home ranks its "Your steps" section from these, in one read per page load. It keeps
-- the rules of #238's public.my_assignment_history, whose sibling it is:
--
--   * The caller is auth.uid() and nothing else: there is no student argument, and a call with no
--     session reads nothing.
--   * "Closed" is private.assignment_refusal answering 'closed': the database's clock, with #208's
--     two seconds of grace. No second definition of it is written here. An assignment still open
--     (or within its grace) contributes no row at all.
--   * The same assignments as History: the caller's current classes (private.is_current_member),
--     the 50 most recently closed.
--   * Only the caller's own attempts, and only submitted ones: an attempt still open has no marks.
--
-- Each row is one submitted attempt with its total (so the app can choose the best attempt with the
-- same `pickBestAttempt` as #210, #211 and #238; nothing here chooses) and its marks: a JSON array
-- of { cjmm_step, points, max_points }, one per item the attempt answered. The step is read from
-- public.items, which a student cannot select; it is null for an untagged item, or for an item the
-- author has since deleted. No item id, key, rationale, answer, breakdown or stem is returned.
--
-- max_attempts is at most 3, so that is at most 150 rows.
--
-- Safe to replay on a fresh project: one new function.

create function public.my_step_marks()
returns table (
  assignment_id uuid,
  attempt_number smallint,
  submitted_at timestamptz,
  score numeric,
  max_score numeric,
  marks jsonb
)
language sql stable security definer set search_path = ''
as $$
  with caller as (
    select (select auth.uid()) as id
  ),
  closed as (
    select s.id, s.closes_at, c.id as caller
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
         a.number,
         a.submitted_at,
         a.score,
         a.max_score,
         (
           select coalesce(
                    jsonb_agg(
                      jsonb_build_object('cjmm_step', i.cjmm_step, 'points', r.points,
                                         'max_points', r.max_points)
                      order by r.item_id),
                    '[]'::jsonb)
             from public.attempt_responses r
             left join public.items i on i.id = r.item_id
            where r.attempt_id = a.id
              and r.points is not null
              and r.max_points is not null
         )
    from closed t
    join public.assignment_attempts a
      on a.assignment_id = t.id and a.student_id = t.caller
   where a.submitted_at is not null
   order by t.closes_at desc, t.id, a.number;
$$;

revoke all on function public.my_step_marks() from public, anon;
grant execute on function public.my_step_marks() to authenticated;
