-- One student account can join classes in more than one workspace (owner decision 2026-10-08).
--
-- Since #355 every teacher who signs up gets an org of their own (ADR 0009), and since #205
-- private.admit_to_class refused a student whose profile pointed at any org but the class's. So a
-- student of one teacher could not join a second teacher's class with the same account. That one
-- branch was the only thing tying a student to one org, and it is removed here.
--
-- ---------------------------------------------------------------------------
-- What a student's profiles.org_id means from now on
-- ---------------------------------------------------------------------------
--
-- For an instructor or admin nothing changes: profiles.org_id is their workspace, and it is what
-- private.current_org_id() and every author policy read.
--
-- For a student, profiles.org_id is now only "the first workspace this account joined a class
-- in". It is set once, when an account with no role is first admitted, because
-- profiles_org_and_role_together requires a role to come with an org. It is never updated after
-- that and it is NOT the list of workspaces the student belongs to, and not an authority for
-- anything a student may read. A student's reach is their public.class_members rows, each of
-- which leads to a class and, through it, to that class's org.
--
-- Nothing a student reads was ever keyed on their org: the students' policies on
-- public.assignments and public.bank_practice_shares, and my_classes, my_assignment_history,
-- my_step_marks, my_assignment_result, my_practice_banks, my_practice_step_marks,
-- start_assignment_attempt, save_attempt_response and the practice run functions all go through
-- class_members (private.is_current_member, private.practice_shared_with). Every row written for
-- a student (an attempt, a saved answer, a practice run) takes its org_id from the assignment or
-- the bank, never from the student's profile. private.current_org_id() is only ever used beside
-- private.is_author(), as a column default on tables only an author can insert into, or in
-- "members read their org" on public.orgs. So no policy changes here, and an author still sees
-- exactly their own org's classes, rosters, assignments and reports: a student who is also in
-- another workspace's class brings nothing of that workspace with them.
--
-- The one place a student's org_id still shows: "members read their org" lets a student select
-- the public.orgs row of the first workspace they joined, as before. The names of all their
-- classes' workspaces come from my_classes() below.
--
-- A note for any future sweep of abandoned workspaces: profiles.org_id is ON DELETE SET NULL, so
-- deleting an org that is some student's first workspace would leave that student with a role and
-- no org, which profiles_org_and_role_together refuses (23514) whenever the student is still a
-- student elsewhere. Such a sweep must first repoint those profiles at the org of another class
-- they belong to (or clear both columns for a student with no class left).
--
-- ---------------------------------------------------------------------------
-- What changes
-- ---------------------------------------------------------------------------
--
--   1. private.admit_to_class no longer answers 'invalid' for a student of another org. Kept
--      exactly: an instructor or admin is answered 'instructor' and never demoted or enrolled; a
--      student an author took off the class stays off it (private.class_removals); an account
--      with no role becomes a student of the class's org; the profile row is locked first; the
--      function is callable by no API role. Its callers (public.join_class,
--      public.join_class_by_code, private.handle_new_user, private.handle_user_invite) are
--      unchanged.
--   2. public.my_classes() gains `workspace_name`, the name of each class's org, so the student
--      home can say which teacher's workspace a class is in. Dropped and recreated because
--      Postgres cannot change a function's result columns in place, as
--      20260925020000_class_timezone_and_removed.sql did for `time_zone`. It still returns only
--      the caller's own memberships, and nothing else about the org.
--
-- Safe to replay on a fresh project, and safe to run twice: a `create or replace` with an
-- unchanged signature and its revoke restated, and one function dropped with `if exists` and
-- recreated with its grants. No table, column, policy or row is touched.

-- ---------------------------------------------------------------------------
-- Admission
-- ---------------------------------------------------------------------------

-- 'joined'     the account is (now, or already was) a member.
-- 'instructor' the account is an instructor or admin; nothing changed. Never demoted.
-- 'invalid'    no such class, no such profile, or a student an author removed from this class;
--              nothing changed.
--
-- An account with no role becomes a student in the class's org. That is the only change to a
-- profile anything here makes: a student who joins a class of a second org keeps the org_id they
-- already have.
create or replace function private.admit_to_class(account uuid, target_class uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  class_org uuid;
  account_role public.org_role;
begin
  select c.org_id into class_org from public.classes c where c.id = target_class;
  if class_org is null then
    return 'invalid';
  end if;

  select p.role into account_role
    from public.profiles p where p.id = account
    for update;
  if not found then
    return 'invalid';
  end if;

  if account_role in ('instructor', 'admin') then
    return 'instructor';
  end if;
  -- Taken off this class by an author: the link they still hold no longer lets them in.
  if exists (select 1 from private.class_removals r
             where r.class_id = target_class and r.profile_id = account) then
    return 'invalid';
  end if;
  if account_role is null then
    update public.profiles set org_id = class_org, role = 'student' where id = account;
  end if;

  insert into public.class_members (class_id, profile_id)
  values (target_class, account)
  on conflict do nothing;
  return 'joined';
end;
$$;

revoke all on function private.admit_to_class(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

drop function if exists public.my_classes();

-- A student's classes: the id, the name, the zone its due times are read in and the name of the
-- workspace it belongs to, and nothing more. Anyone signed in may call it; it only ever returns
-- the caller's own memberships.
create function public.my_classes()
returns table (
  class_id uuid,
  class_name text,
  joined_at timestamptz,
  time_zone text,
  workspace_name text
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, m.joined_at, c.time_zone, o.name
    from public.class_members m
    join public.classes c on c.id = m.class_id
    join public.orgs o on o.id = c.org_id
   where m.profile_id = (select auth.uid())
   order by c.name, o.name, c.id;
$$;

revoke all on function public.my_classes() from public, anon;
grant execute on function public.my_classes() to authenticated;
