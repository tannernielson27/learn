-- A class's results over time, by clinical judgment step and by client needs category (#618).
--
-- The class Progress tab (ADR 0014) draws one bar per step for the whole term and one cell per
-- student per activity. It cannot say whether the class is getting better at a step, and it has
-- no breakdown by client needs category, though every question carries both. This adds the read
-- that can, beside the existing ones: public.class_progress and public.class_progress_steps are
-- not touched, so the bars a teacher sees today cannot move.
--
-- What this migration adds:
--
--   public.class_progress_trend(target_class): one row per activity per group, and one all-term
--   row per client needs category.
--
-- ---------------------------------------------------------------------------
-- Who may read it
-- ---------------------------------------------------------------------------
--
-- Exactly who reads class_progress: an author (instructor or admin) of the class's own
-- workspace, through private.progress_class, the same two checks. Anyone else (a student, a
-- teacher of another workspace, an account with no role, a class id that does not exist) gets no
-- rows, never an error. Security definer for the same reason as class_progress: the removals
-- (private.class_removals) are out of the Data API's reach. Granted to authenticated only. No
-- service role. Nothing phone-facing reads it.
--
-- ---------------------------------------------------------------------------
-- What each row says
-- ---------------------------------------------------------------------------
--
-- An activity is an ended class live session (`session`, occurred_at its start) or a closed class
-- assignment (`assignment`, occurred_at its close). A running or paused session, one still in its
-- lobby, and a scheduled or open assignment add no rows. A group is a clinical judgment step
-- (group_kind 'step', group_key '1' to '6') or a client needs category (group_kind 'category',
-- group_key the stored tag, e.g. 'Management of Care', or 'none' for a question with no client
-- needs tag). group_key is always a code value, never display text.
--
-- The answers are those ADR 0014 counts, so the two views never disagree: in an ended class
-- session, a linked participant's scored answers (guests never); in a closed class assignment,
-- each student's best attempt by the owner's 2026-09-23 rule (highest score, a tie to the earlier
-- attempt, submitted only), its scored answers. Practice is never read. Only the class's current
-- members count: a removed student is in none of the figures, as on the Progress tab.
--
-- Step and tags are read from the question as it is now, as class_progress_steps reads the step:
-- the snapshot keeps question ids only. A question deleted since is left out. A question tagged
-- with two client needs categories counts under both; one with none counts under 'none'. A topic
-- tag (anything not one of the eight categories) is not a category.
--
-- Per member, group and activity, the member's percent is the mean of their scored answers'
-- percents (each answer once), rounded to two places, as class_progress_steps rounds a student's
-- step percent. The row's `percent` is the mean of those member percents, each member once, so a
-- student who answered more does not outweigh the rest; `students` is the members with an answer
-- in the group, `answers` the answers counted. An answer worth nothing counts as answered but has
-- no percent, as in class_progress_steps.
--
-- The all-term rows (activity_kind 'term', activity_id, title and occurred_at null) are the same
-- arithmetic per client needs category over every activity at once: each member's mean of all
-- their answers in the category, then the class's mean of those. Steps have no term row: the
-- Progress tab's bars are that figure already.
--
-- Order: activities oldest first (then kind, then id), steps 1 to 6 before categories in test
-- plan order with 'none' last, and the term rows at the end.
--
-- Safe to replay on a fresh project: one new function with its grant. Depends on
-- 20261025000000_class_progress (private.progress_class, private.progress_students).

create function public.class_progress_trend(target_class uuid)
returns table (
  activity_kind text,
  activity_id uuid,
  title text,
  occurred_at timestamptz,
  group_kind text,
  group_key text,
  students integer,
  answers integer,
  percent numeric
)
language sql stable security definer set search_path = ''
as $$
  with target as (
    select * from private.progress_class(target_class)
  ),
  members as (
    select st.profile_id
      from private.progress_students(target_class) st
     where st.membership = 'member'
  ),
  -- The eight client needs categories as stored (src/lib/ngn/tags.ts CLIENT_NEEDS), in test plan
  -- order, and 'none' last.
  category_order (need, place) as (
    select * from unnest(array[
      'Management of Care',
      'Safety and Infection Control',
      'Health Promotion and Maintenance',
      'Psychosocial Integrity',
      'Basic Care and Comfort',
      'Pharmacological and Parenteral Therapies',
      'Reduction of Risk Potential',
      'Physiological Adaptation',
      'none'
    ]) with ordinality
  ),
  -- Every scored answer of a linked participant in an ended class session.
  session_answers as (
    select 'session'::text as activity_kind, s.id as activity_id, s.title,
           s.opened_at as occurred_at, p.profile_id, r.item_id, r.points, r.max_points
      from target t
      join public.sessions s on s.class_id = t.class_id and s.org_id = t.org_id
      join public.participants p on p.session_id = s.id and p.profile_id is not null
      join public.session_responses r on r.session_id = s.id and r.participant_id = p.id
     where s.status = 'ended'
  ),
  -- The best attempt at each closed class assignment, by the report's rule.
  best_attempts as (
    select distinct on (x.assignment_id, x.student_id) x.id, x.assignment_id, x.student_id
      from target t
      join public.assignments a on a.class_id = t.class_id and a.org_id = t.org_id
      join public.assignment_attempts x on x.assignment_id = a.id
     where private.assignment_refusal(a.opens_at, a.closes_at) is not distinct from 'closed'
       and x.submitted_at is not null and x.score is not null and x.max_score is not null
     order by x.assignment_id, x.student_id, x.score desc, x.number
  ),
  attempt_answers as (
    select 'assignment'::text, a.id, a.title, a.closes_at, b.student_id, r.item_id, r.points,
           r.max_points
      from best_attempts b
      join public.assignments a on a.id = b.assignment_id
      join public.attempt_responses r on r.attempt_id = b.id
     where r.points is not null and r.max_points is not null
  ),
  -- The members' answers only, each with its question as it is now; a deleted one drops here.
  answers as (
    select a.activity_kind, a.activity_id, a.title, a.occurred_at, a.profile_id, a.points,
           a.max_points, i.cjmm_step, i.tags
      from (select * from session_answers union all select * from attempt_answers) a
      join members m on m.profile_id = a.profile_id
      join public.items i on i.id = a.item_id
  ),
  -- Each answer under each of its groups: its step, and every client needs tag it has, or 'none'.
  grouped as (
    select a.activity_kind, a.activity_id, a.title, a.occurred_at, a.profile_id, a.points,
           a.max_points, 'step'::text as group_kind, a.cjmm_step::text as group_key
      from answers a
     where a.cjmm_step between 1 and 6
    union all
    select a.activity_kind, a.activity_id, a.title, a.occurred_at, a.profile_id, a.points,
           a.max_points, 'category'::text, coalesce(c.need, 'none')
      from answers a
      left join lateral (
        select distinct o.need
          from unnest(a.tags) as tag(value)
          join category_order o on o.need = tag.value and o.need <> 'none'
      ) c on true
  ),
  -- One figure per member per group: per activity, and per category for the whole term.
  member_figures as (
    select g.activity_kind, g.activity_id, g.title, g.occurred_at, g.group_kind, g.group_key,
           g.profile_id, count(*) as answered,
           round(avg(g.points / g.max_points * 100) filter (where g.max_points > 0), 2)
             as member_percent
      from grouped g
     group by g.activity_kind, g.activity_id, g.title, g.occurred_at, g.group_kind, g.group_key,
              g.profile_id
    union all
    select 'term'::text, null::uuid, null::text, null::timestamptz, g.group_kind, g.group_key,
           g.profile_id, count(*),
           round(avg(g.points / g.max_points * 100) filter (where g.max_points > 0), 2)
      from grouped g
     where g.group_kind = 'category'
     group by g.group_kind, g.group_key, g.profile_id
  )
  select f.activity_kind, f.activity_id, f.title, f.occurred_at, f.group_kind, f.group_key,
         count(*)::integer,
         sum(f.answered)::integer,
         round(avg(f.member_percent), 2)
    from member_figures f
   group by f.activity_kind, f.activity_id, f.title, f.occurred_at, f.group_kind, f.group_key
   order by f.activity_kind = 'term', f.occurred_at, f.activity_kind, f.activity_id,
            f.group_kind = 'category',
            case when f.group_kind = 'step' then f.group_key::integer
                 else (select o.place from category_order o where o.need = f.group_key)::integer
            end;
$$;

revoke all on function public.class_progress_trend(uuid) from public, anon;
grant execute on function public.class_progress_trend(uuid) to authenticated;
