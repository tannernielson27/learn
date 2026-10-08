-- A workspace for each self-registered teacher, and a per-account onboarding record (#355).
-- Owner decision 2026-10-06 (ADR 0009): teacher sign-up is open, and each teacher who signs up on
-- their own gets an org of their own.
--
-- Until now every instructor was in one org, added by the owner with `private.make_instructor`.
-- Row level security has been scoped by org since the first migration ("even with one org"), so
-- isolating a new teacher needs no policy change: every content policy is
-- `private.is_author() and org_id = private.current_org_id()`, and both helpers read the caller's
-- own profile row. A teacher whose profile points at a new org therefore sees that org's rows and
-- no other's. supabase/tests/database/self_serve_instructors.test.sql proves it for banks, items,
-- classes and rosters, between two such teachers and against the shared org.
--
-- What this adds:
--
--   1. `orgs.self_registered`: true for an org made by `register_instructor`, false for the
--      shared org and any org the owner makes by hand.
--   2. `orgs.ai_import_enabled`: whether the org may use AI import (Sprint 12). False by default,
--      so open sign-up cannot spend the owner's API key (S13 kickoff decision 1). Every org that
--      exists when this migration first runs is the owner's own and gets true.
--   3. `public.register_instructor(p_user, p_workspace)`: the one way a sign-up becomes a teacher.
--      Service role only: the sign-up route (#361) calls it with the id of the account it has just
--      created through the admin API.
--   4. `profiles.onboarded_at` and `public.mark_onboarded()`: whether the account has seen its
--      welcome (#364, #365), recorded once.
--
-- `private.make_instructor` is unchanged: the owner can still add a colleague to the shared org.
-- `private.handle_new_user` is unchanged: a new account still starts with no org and no role.
--
-- Safe to replay on a fresh project, and safe to run twice: the columns are added only if missing,
-- the functions are `create or replace` with their grants restated, and existing orgs get
-- `ai_import_enabled = true` only in the statement that adds the column, so a second run cannot
-- switch AI import on for a workspace that registered in between.
--
-- On a fresh project no org exists when this runs, so nothing is switched on: `seed.sql` adds the
-- shared org afterwards with the default, false. Turning AI import on there is one line for the
-- owner: `update public.orgs set ai_import_enabled = true where not self_registered;`

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.orgs
  add column if not exists self_registered boolean not null default false;

-- Every org here today is the owner's own, so the column arrives as true for the rows that exist
-- and the default then becomes false for every org made from here on. If the column is already
-- there, the first statement does nothing and no row is touched.
alter table public.orgs
  add column if not exists ai_import_enabled boolean not null default true;
alter table public.orgs
  alter column ai_import_enabled set default false;

-- Null means not yet welcomed. `authenticated` holds UPDATE on `display_name` only
-- (20260913000000_authoring_schema.sql), and a column grant does not extend to a column added
-- later, so nobody signed in can write this one directly. mark_onboarded() below is the only way.
alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- ---------------------------------------------------------------------------
-- Registering a teacher
-- ---------------------------------------------------------------------------

-- Makes a new org named `p_workspace` and puts the account `p_user` in it as an instructor.
-- Returns the new org's id.
--
-- Granted to service_role only. That is what makes `p_user` trustworthy: the caller is the app's
-- server, naming the account it has just created, never a browser naming itself. Nothing here
-- reads `auth.users`, so nothing here can read `raw_user_meta_data`; the role comes from this call
-- and from nowhere else.
--
-- Refusals raise, so the whole call rolls back and nothing is left half-made:
--   P0002  no profile has that id.
--   23514  the account already has a role: a student, an instructor or an admin, in any org. It
--          is never moved, promoted or given a second workspace.
--   22023  the workspace name, trimmed of white space, is not 1 to 80 characters.
--
-- A caller that retries after losing the reply to a call that did commit gets 23514; it should
-- then read the profile, which already has its org.
--
-- The profile row is locked before anything is written, so two calls at once for the same account
-- cannot each make an org: the second waits, then sees the role the first one set and is refused.
-- The org and the role are then set in one UPDATE, which is also the only way
-- `profiles_org_and_role_together` allows.
create or replace function public.register_instructor(p_user uuid, p_workspace text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  workspace text := regexp_replace(coalesce(p_workspace, ''), '^\s+|\s+$', '', 'g');
  account_role public.org_role;
  new_org uuid;
begin
  select p.role into account_role
    from public.profiles p where p.id = p_user
    for update;
  if not found then
    raise exception 'no account has that id' using errcode = 'no_data_found';
  end if;
  if account_role is not null then
    raise exception 'that account already has a role' using errcode = 'check_violation';
  end if;
  if length(workspace) not between 1 and 80 then
    raise exception 'a workspace name is 1 to 80 characters'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.orgs (name, self_registered)
  values (workspace, true)
  returning id into new_org;

  update public.profiles
     set org_id = new_org, role = 'instructor'
   where id = p_user;

  return new_org;
end;
$$;

revoke all on function public.register_instructor(uuid, text) from public, anon, authenticated;
grant execute on function public.register_instructor(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- The onboarding record
-- ---------------------------------------------------------------------------

-- Stamps the caller's own `onboarded_at` the first time, and returns the stored time every time.
-- It takes no argument: the only row it can ever name is `auth.uid()`'s, so no caller can stamp or
-- read anybody else's. A second call matches no row (`onboarded_at is null` is false), writes
-- nothing and returns the first time. With no caller it returns null.
--
-- The read is a statement of its own, after the update: if two calls race, the second waits on
-- the row, updates nothing, and then reads the time the first one committed rather than a
-- snapshot from before it.
create or replace function public.mark_onboarded() returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  stamped timestamptz;
begin
  if caller is null then
    return null;
  end if;

  update public.profiles
     set onboarded_at = now()
   where id = caller and onboarded_at is null
  returning onboarded_at into stamped;

  if stamped is null then
    select p.onboarded_at into stamped from public.profiles p where p.id = caller;
  end if;
  return stamped;
end;
$$;

revoke all on function public.mark_onboarded() from public, anon;
grant execute on function public.mark_onboarded() to authenticated;
