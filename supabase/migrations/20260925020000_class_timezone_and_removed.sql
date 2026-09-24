-- A class time zone setting, and removed students in the assignment report (#242). Two gaps
-- Sprint 9 left (docs/sprints/S9-demo.md, "Known gaps").
--
-- ---------------------------------------------------------------------------
-- 1. The class's time zone, set in the app
-- ---------------------------------------------------------------------------
--
-- #212 added `classes.time_zone` (default America/Denver, checked against pg_timezone_names) with
-- no grant, so it could only be changed in the SQL editor. This grants UPDATE on that one column
-- to `authenticated`. Who may use it is the existing update policy on classes: an author of the
-- class's org, the same people who name the class, rotate its link and manage its roster. A
-- student, an author of another org and an account with no role match no row, and anon holds no
-- privilege on the table at all. The check still refuses any name Postgres does not know, whoever
-- writes it, so the app's own list is a convenience and not the guard.
--
-- The check is tightened here to refuse the tz database's `posix/` and `right/` copies and the
-- three files that are not zones (`posixrules`, `localtime`, `Factory`). Postgres lists them in
-- pg_timezone_names, but the app's Intl does not know them, and a class on one would get its
-- times in UTC. The default and every row written through the app are unaffected.
--
-- A student reads their classes' zones through public.my_classes(), which gains a `time_zone`
-- column, so the student home and the assignment pages can say due times in the class's zone. It
-- is dropped and recreated because Postgres cannot change a function's result columns in place.
--
-- ---------------------------------------------------------------------------
-- 2. Removed students in the report
-- ---------------------------------------------------------------------------
--
-- Since #205 a removal is recorded in private.class_removals (RLS on, no policies, read only by
-- definer functions) and the student's attempts are kept, but public.assignment_report_rows (#211)
-- listed current members only, so a removed student's work vanished from the report. It now also
-- lists every student who was removed from the class and holds at least one attempt at the
-- assignment, marked `membership = 'removed'`; every other row is `'member'`. A removed student
-- who never attempted it is not listed.
--
-- Nothing else changes: the function still answers only an author of the assignment's org, and
-- still withholds every score and mark until the close, for removed students as for members. A
-- removed student still reads nothing about the class: they have no class_members row, so
-- my_classes, the roster and the assignments policy all refuse them, and this function never
-- answers a student at all. (#210's my_assignment_result still shows them their own result for an
-- assignment they attempted, as it did before; that is their work, not the class.)
--
-- It is dropped and recreated for the same reason as my_classes.
--
-- Safe to replay on a fresh project: a grant, a `create or replace` with the same signature, and
-- two functions dropped with `if exists` and recreated with their grants.

-- ---------------------------------------------------------------------------
-- The zone
-- ---------------------------------------------------------------------------

create or replace function private.is_time_zone(zone text) returns boolean
language sql stable set search_path = ''
as $$
  select zone !~ '^(posix|right)/'
     and zone not in ('posixrules', 'localtime', 'Factory')
     and exists (select 1 from pg_catalog.pg_timezone_names t where t.name = zone);
$$;

revoke all on function private.is_time_zone(text) from public, anon;
grant execute on function private.is_time_zone(text) to authenticated, service_role;

grant update (time_zone) on public.classes to authenticated;

drop function if exists public.my_classes();

-- A student's classes: the id, the name and the zone its due times are read in, and nothing more.
-- Anyone signed in may call it; it only ever returns the caller's own memberships.
create function public.my_classes()
returns table (class_id uuid, class_name text, joined_at timestamptz, time_zone text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, m.joined_at, c.time_zone
    from public.class_members m
    join public.classes c on c.id = m.class_id
   where m.profile_id = (select auth.uid())
   order by c.name, c.id;
$$;

revoke all on function public.my_classes() from public, anon;
grant execute on function public.my_classes() to authenticated;

-- ---------------------------------------------------------------------------
-- The report
-- ---------------------------------------------------------------------------

drop function if exists public.assignment_report_rows(uuid);

create function public.assignment_report_rows(target_assignment uuid)
returns table (
  student_id uuid,
  display_name text,
  email text,
  membership text,
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
  ),
  -- Every current member, and every student taken off the class who attempted this assignment.
  roster as (
    select m.profile_id, 'member'::text as membership
      from target t
      join public.class_members m on m.class_id = t.class_id
    union all
    select r.profile_id, 'removed'::text
      from target t
      join private.class_removals r on r.class_id = t.class_id
     where not exists (select 1 from public.class_members m
                        where m.class_id = t.class_id and m.profile_id = r.profile_id)
       and exists (select 1 from public.assignment_attempts x
                    where x.assignment_id = t.id and x.student_id = r.profile_id)
  )
  select s.profile_id,
         p.display_name,
         u.email::text,
         s.membership,
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
    cross join roster s
    join public.profiles p on p.id = s.profile_id
    join auth.users u on u.id = p.id
    left join public.assignment_attempts a
      on a.assignment_id = t.id and a.student_id = s.profile_id
   order by s.profile_id, a.number nulls first;
$$;

revoke all on function public.assignment_report_rows(uuid) from public, anon;
grant execute on function public.assignment_report_rows(uuid) to authenticated;
