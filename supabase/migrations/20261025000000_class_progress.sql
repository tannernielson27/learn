-- How each student in a class is doing across its live sessions and its assignments.
--
-- A teacher has had a report per live session (#186) and per assignment (#211), each its own page
-- and its own CSV. Since ADR 0013 a live session can be started for a class, and a signed-in
-- member who joins it is linked (participants.profile_id). This adds the reads that put the two
-- together for one class, one row per student per activity, so the class page can show a grid and
-- one student's timeline.
--
-- What this migration adds:
--
--   1. public.class_progress(target_class): for every student of the class, one row per class
--      live session (sessions.class_id = the class) and one row per assignment of the class.
--   2. public.class_progress_steps(target_class): for every student, one row per clinical
--      judgment step they answered something tagged with, across both sources.
--   3. participants_profile_id_idx, so "this student's participants" is an index read.
--      sessions_class_id_idx already exists (20261024000000).
--
-- ---------------------------------------------------------------------------
-- Who may read it
-- ---------------------------------------------------------------------------
--
-- Exactly who reads the class's roster: an author (instructor or admin) of the class's own
-- workspace, with the same two checks public.class_roster makes. Anyone else (a student, a
-- teacher of another workspace, an account with no role, anon) gets no rows, never an error, so a
-- class they cannot see reads exactly like one that does not exist. Security definer because the
-- removals (private.class_removals) and the addresses (auth.users) are out of the Data API's
-- reach, as they are for class_roster and assignment_report_rows. Granted to authenticated only.
--
-- Nothing here is phone-facing: no live view, join or resume function reads it, and the app
-- calls it only from the teacher's class pages and their CSV route, as the signed-in teacher.
--
-- ---------------------------------------------------------------------------
-- Who is listed
-- ---------------------------------------------------------------------------
--
-- Every current member ('member'), and, as assignment_report_rows does since #242, every student
-- taken off the class ('removed') who left something behind: a linked participant in one of the
-- class's live sessions or an attempt at one of its assignments. A removed student with nothing is
-- not listed. Guests of a class session (profile_id null) are never anyone's row: they stay in
-- that session's own report by display name, and nowhere else.
--
-- ---------------------------------------------------------------------------
-- What each row says
-- ---------------------------------------------------------------------------
--
-- A live session row: `attended` when the student has a linked participant in it. Points,
-- possible and percent only once the session has ended, as its report is only ready then, and by
-- the report's own arithmetic (src/lib/live/report.ts): points are what the student earned,
-- possible is what every question anyone answered was worth, so a skipped question counts
-- against them, and percent is null when nothing was worth anything. A student who did not
-- attend has no points: absent is not zero.
--
-- An assignment row: the status (not_started, in_progress while an attempt is open, submitted),
-- the attempts used, and once the assignment has closed (private.assignment_refusal = 'closed',
-- the same rule as the assignment report and the student's results), the best attempt by the
-- owner's 2026-09-23 rule: the highest score, a tie going to the earlier attempt, only a
-- submitted attempt. Before the close there is no score at all, for anyone, as in the report.
--
-- A step row: per student and step, the mean percent of every scored answer to a question tagged
-- with that step, each answer counting once, from the class's ended live sessions (linked
-- participants only) and the best attempts at its closed assignments. A question deleted since
-- has no step and is left out.
--
-- Safe to replay on a fresh project: new functions with their grants, and an index made only if
-- it is missing.

-- ---------------------------------------------------------------------------
-- 3. The index
-- ---------------------------------------------------------------------------

create index if not exists participants_profile_id_idx
  on public.participants (profile_id)
  where profile_id is not null;

-- ---------------------------------------------------------------------------
-- Who the class's progress is about, in one place
-- ---------------------------------------------------------------------------

-- The class, when the caller is an author of its workspace; no row otherwise.
create function private.progress_class(target_class uuid)
returns table (class_id uuid, org_id uuid)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.org_id
    from public.classes c
   where c.id = target_class
     and (select private.is_author())
     and c.org_id = (select private.current_org_id());
$$;

revoke all on function private.progress_class(uuid) from public, anon, authenticated, service_role;

-- The current members, and the removed students who left a linked participant or an attempt.
create function private.progress_students(target_class uuid)
returns table (profile_id uuid, membership text)
language sql stable security definer set search_path = ''
as $$
  with target as (select * from private.progress_class(target_class))
  select m.profile_id, 'member'::text
    from target t
    join public.class_members m on m.class_id = t.class_id
  union all
  select r.profile_id, 'removed'::text
    from target t
    join private.class_removals r on r.class_id = t.class_id
   where not exists (select 1 from public.class_members m
                      where m.class_id = t.class_id and m.profile_id = r.profile_id)
     and (
       exists (select 1 from public.participants p
                 join public.sessions s on s.id = p.session_id
                where s.class_id = t.class_id and p.profile_id = r.profile_id)
       or exists (select 1 from public.assignment_attempts x
                    join public.assignments a on a.id = x.assignment_id
                   where a.class_id = t.class_id and x.student_id = r.profile_id)
     );
$$;

revoke all on function private.progress_students(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Per student, per activity
-- ---------------------------------------------------------------------------

create function public.class_progress(target_class uuid)
returns table (
  profile_id uuid,
  display_name text,
  email text,
  membership text,
  activity_kind text,
  activity_id uuid,
  title text,
  -- A live session's start; an assignment's close.
  occurred_at timestamptz,
  -- A live session's status (lobby, running, paused, ended); an assignment's window (scheduled,
  -- open, closed).
  activity_state text,
  attended boolean,
  status text,
  attempts_used integer,
  attempt_number smallint,
  points numeric,
  possible numeric,
  percent numeric
)
language sql stable security definer set search_path = ''
as $$
  with target as (
    select * from private.progress_class(target_class)
  ),
  students as (
    select * from private.progress_students(target_class)
  ),
  class_sessions as (
    select s.id, s.title, s.opened_at, s.status
      from target t
      join public.sessions s on s.class_id = t.class_id and s.org_id = t.org_id
  ),
  -- What every question anyone answered was worth, in each ended session: the report's possible.
  session_possible as (
    select q.session_id, sum(q.top) as possible
      from (
        select r.session_id, r.item_position, max(r.max_points) as top
          from class_sessions cs
          join public.session_responses r on r.session_id = cs.id
         where cs.status = 'ended'
         group by r.session_id, r.item_position
      ) q
     group by q.session_id
  ),
  linked as (
    select p.session_id, p.profile_id,
           (select coalesce(sum(r.points), 0)
              from public.session_responses r
             where r.session_id = p.session_id and r.participant_id = p.id) as points
      from class_sessions cs
      join public.participants p on p.session_id = cs.id
     where p.profile_id is not null
  ),
  session_rows as (
    select st.profile_id, st.membership, 'session'::text as activity_kind, cs.id as activity_id,
           cs.title, cs.opened_at as occurred_at, cs.status::text as activity_state,
           l.profile_id is not null as attended,
           null::text as status, null::integer as attempts_used, null::smallint as attempt_number,
           case when cs.status = 'ended' and l.profile_id is not null
                then l.points end as points,
           case when cs.status = 'ended' and l.profile_id is not null
                then coalesce(sp.possible, 0) end as possible
      from students st
      cross join class_sessions cs
      left join linked l on l.session_id = cs.id and l.profile_id = st.profile_id
      left join session_possible sp on sp.session_id = cs.id
  ),
  class_assignments as (
    select a.id, a.title, a.opens_at, a.closes_at,
           case
             when now() < a.opens_at then 'scheduled'
             when private.assignment_refusal(a.opens_at, a.closes_at)
                    is not distinct from 'closed' then 'closed'
             else 'open'
           end as window_state
      from target t
      join public.assignments a on a.class_id = t.class_id and a.org_id = t.org_id
  ),
  assignment_rows as (
    select st.profile_id, st.membership, 'assignment'::text, ca.id, ca.title, ca.closes_at,
           ca.window_state, used.n > 0,
           case
             when used.open_n > 0 then 'in_progress'
             when used.n > 0 then 'submitted'
             else 'not_started'
           end,
           used.n::integer,
           best.number,
           case when ca.window_state = 'closed' then best.score end,
           case when ca.window_state = 'closed' then best.max_score end
      from students st
      cross join class_assignments ca
      cross join lateral (
        select count(*) as n, count(*) filter (where x.submitted_at is null) as open_n
          from public.assignment_attempts x
         where x.assignment_id = ca.id and x.student_id = st.profile_id
      ) used
      left join lateral (
        select x.number, x.score, x.max_score
          from public.assignment_attempts x
         where ca.window_state = 'closed'
           and x.assignment_id = ca.id and x.student_id = st.profile_id
           and x.submitted_at is not null and x.score is not null and x.max_score is not null
         order by x.score desc, x.number
         limit 1
      ) best on true
  ),
  activity as (
    select * from session_rows
    union all
    select * from assignment_rows
  )
  select a.profile_id, p.display_name, u.email::text, a.membership, a.activity_kind,
         a.activity_id, a.title, a.occurred_at, a.activity_state, a.attended, a.status,
         a.attempts_used, a.attempt_number, a.points, a.possible,
         case when a.possible > 0 then round(a.points / a.possible * 100, 2) end
    from activity a
    join public.profiles p on p.id = a.profile_id
    join auth.users u on u.id = p.id
   order by a.profile_id, a.activity_kind, a.occurred_at, a.activity_id;
$$;

revoke all on function public.class_progress(uuid) from public, anon;
grant execute on function public.class_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Per student, per clinical judgment step
-- ---------------------------------------------------------------------------

create function public.class_progress_steps(target_class uuid)
returns table (
  profile_id uuid,
  step smallint,
  answered integer,
  points numeric,
  possible numeric,
  mean_percent numeric
)
language sql stable security definer set search_path = ''
as $$
  with target as (
    select * from private.progress_class(target_class)
  ),
  students as (
    select * from private.progress_students(target_class)
  ),
  -- Every scored answer of a linked participant in an ended class session.
  session_answers as (
    select p.profile_id, r.item_id, r.points, r.max_points
      from target t
      join public.sessions s on s.class_id = t.class_id and s.org_id = t.org_id
      join public.participants p on p.session_id = s.id and p.profile_id is not null
      join public.session_responses r on r.session_id = s.id and r.participant_id = p.id
     where s.status = 'ended'
  ),
  -- The best attempt at each closed class assignment, by the report's rule.
  best_attempts as (
    select distinct on (x.assignment_id, x.student_id) x.id, x.student_id
      from target t
      join public.assignments a on a.class_id = t.class_id and a.org_id = t.org_id
      join public.assignment_attempts x on x.assignment_id = a.id
     where private.assignment_refusal(a.opens_at, a.closes_at) is not distinct from 'closed'
       and x.submitted_at is not null and x.score is not null and x.max_score is not null
     order by x.assignment_id, x.student_id, x.score desc, x.number
  ),
  attempt_answers as (
    select b.student_id as profile_id, r.item_id, r.points, r.max_points
      from best_attempts b
      join public.attempt_responses r on r.attempt_id = b.id
     where r.points is not null and r.max_points is not null
  ),
  answers as (
    select * from session_answers
    union all
    select * from attempt_answers
  )
  select a.profile_id,
         i.cjmm_step::smallint,
         count(*)::integer,
         sum(a.points),
         sum(a.max_points),
         round(avg(a.points / a.max_points * 100) filter (where a.max_points > 0), 2)
    from answers a
    join students st on st.profile_id = a.profile_id
    join public.items i on i.id = a.item_id
   where i.cjmm_step between 1 and 6
   group by a.profile_id, i.cjmm_step
   order by a.profile_id, i.cjmm_step;
$$;

revoke all on function public.class_progress_steps(uuid) from public, anon;
grant execute on function public.class_progress_steps(uuid) to authenticated;
