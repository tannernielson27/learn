-- Membership of a workspace can change: a founder removes a colleague, and a teacher accepts an
-- invitation into another workspace. Owner decisions 2026-10-09, ADR 0011. ADR 0010 said "no
-- removal in the app" and "only an account with no role can accept"; both end here.
--
-- ---------------------------------------------------------------------------
-- What this adds
-- ---------------------------------------------------------------------------
--
--   1. `orgs.founder_id`: the teacher who made a self-registered workspace. Set by
--      `register_instructor` from here on, and backfilled once for the workspaces that exist: the
--      member who did not come in by invitation, or failing that the one who joined first. Null
--      for the shared workspace and any org the owner makes by hand, and null again if the
--      founder's account is deleted (nobody can then remove anyone; that is an owner step).
--   2. `orgs.emptied_at`: when a workspace lost its last teacher because that teacher moved to
--      another one. Written by accept_org_invite and by nothing else. A later sweep, not part of
--      this migration, may delete such a workspace after a retention period. ADR 0009 lists what a
--      sweep must do first (a student whose `profiles.org_id` names the org).
--   3. `public.remove_org_member(p_member)`: the founder removes a colleague.
--   4. `public.accept_org_invite(p_user, token, p_confirm_move)`: an account that already teaches
--      may accept, moving from the workspace it is in, when the rules below allow it and the
--      caller says it has confirmed.
--   5. `public.org_invite_move_preview(p_user, token)`: what that move would be, for the page that
--      asks the person to confirm it.
--   6. `private.admit_to_class`: a class of a workspace marked emptied admits nobody.
--
-- ---------------------------------------------------------------------------
-- The contract, for the pages
-- ---------------------------------------------------------------------------
--
-- public.remove_org_member(p_member uuid)                                    authenticated
--   returns text. The caller must be the founder of the self-registered workspace they are in.
--     'removed'           the member is out. In the same transaction they became the founder of
--                         a new, empty workspace of their own, exactly as a sign-up makes one,
--                         named from their display name. Everything they authored stays where it
--                         was. Every live session they were hosting in the workspace is ended,
--                         every pending invitation they had sent from it is revoked, and so is
--                         every pending invitation into it addressed to their own email. Their
--                         sign-in sessions are ended (see "Sessions" below).
--     'shared_workspace'  the caller's workspace is not self-registered.
--     'not_founder'       the caller did not found the workspace they are in.
--     'is_founder'        `p_member` is the caller: the founder cannot be removed, by anyone.
--     'not_found'         no such teacher in the caller's workspace (never "not yours").
--     'is_admin'          the member is an admin. Nothing in the app makes one in a
--                         self-registered workspace; one put there by hand is not demoted here.
--   They are checked in that order. Raises 42501 for a caller who is not an author.
--   Any teacher still in the workspace may invite the removed colleague again; that is ADR 0010's
--   rule and is unchanged.
--
-- public.accept_org_invite(p_user uuid, token text, p_confirm_move boolean default false,
--                          p_leaving uuid default null)                      SERVICE ROLE ONLY
--   returns text. Replaces accept_org_invite(uuid, text), which is dropped: a call that names two
--   arguments reaches this one with `p_confirm_move` false. `p_leaving` is the id of the
--   workspace the person was shown they would leave (org_invite_move_preview's
--   `leaving_workspace_id`): a confirmation counts only for that workspace.
--     'accepted'                the account is now an instructor of the inviting workspace.
--     'invalid'                 no such token.
--     'already_accepted'        the invitation was used, by this account or any other.
--     'revoked'                 the inviter withdrew it.
--     'expired'                 older than 7 days.
--     'wrong_address'           the account's address is not the invited one.
--     'student'                 the account is a student, in any workspace.
--     'already_member'          the account already teaches in the inviting workspace. NEW.
--     'admin_account'           the account is an admin of the workspace it is in. Nothing in
--                               the app makes one in a self-registered workspace; one put there
--                               by hand is not moved, and so not demoted. NEW.
--     'teaches_shared'          the account teaches in a workspace that is not self-registered
--                               (the shared LeaRN workspace). It is never moved. NEW.
--     'founder_with_members'    the account founded the workspace it is in, and other teachers
--                               are in it. NEW.
--     'students_depend'         the account is the last teacher of its workspace, and that
--                               workspace has a class with at least one student in it, an
--                               assignment that has not closed, or a live session that has not
--                               ended. NEW.
--     'shared_workspace'        the inviting workspace stopped being self-registered.
--     'members_full'            the inviting workspace reached 10 members.
--     'move_needs_confirmation' the account teaches elsewhere, every check above passed, and
--                               `p_confirm_move` is not true, or `p_leaving` is not the workspace
--                               the account teaches in at this moment. Nothing was written. NEW.
--   They are checked in that order. 'already_teaches' is no longer answered. Nothing is written
--   on any answer but 'accepted'. Raises P0002 when no account has that id.
--
--   When an account that teaches is accepted: its profile points at the inviting workspace, as an
--   instructor. Nothing in the workspace it left is deleted or moved. Every pending invitation it
--   had sent from there is revoked, and every live session it was hosting there is ended (other
--   teachers remain, or the move would have been refused). If it was the last teacher there, the
--   workspace's remaining pending invitations are revoked too, so nobody can join a workspace
--   with no teacher in it, and `emptied_at` is set.
--
-- public.org_invite_move_preview(p_user uuid, token text)                    SERVICE ROLE ONLY
--   returns table (status text, leaving_workspace text, leaving_workspace_id uuid,
--                  bank_count integer, class_count integer): one row. `p_user` is the signed-in account the server has just verified. It reads and locks
--   nothing, and counts no misses: resolve the token first.
--     'invalid'                 no such token, or no such account.
--     'wrong_address'           the account's address is not the invited one.
--     'not_teaching'            the account has no role, or is a student: there is no move.
--     'already_member', 'admin_account', 'teaches_shared', 'founder_with_members',
--     'students_depend'         as accept_org_invite would answer.
--     'move_needs_confirmation' accepting would move the account. Only on this answer are the
--                               other four columns set: the name and id of the workspace it would
--                               leave, and how many item banks and classes that workspace holds.
--   It says nothing about the invitation's own state or the inviting workspace's caps; the page
--   has resolved the token already and accept_org_invite has the last word.
--
-- ---------------------------------------------------------------------------
-- Who is in which workspace is read from the profile row, on every request
-- ---------------------------------------------------------------------------
--
-- `private.current_org_id()` and `private.is_author()` read `public.profiles` for `auth.uid()`
-- each time a policy runs, and the app's own check (`authorForRoute`) reads the same row on every
-- request. No token carries an org or a role. So every request, table read and function call a
-- removed or moved teacher makes after the UPDATE below is answered for the workspace they are
-- in now, on every session they have.
--
-- ---------------------------------------------------------------------------
-- Sessions: what does outlive the UPDATE, and for how long
-- ---------------------------------------------------------------------------
--
-- One thing is not asked on every request. A Realtime socket that has already joined a private
-- `live:<session>` channel was authorised when it joined ("an author watches their org's session
-- channels", 20260921210000) and is not asked again until its access token is replaced. A
-- teacher who has left could therefore keep receiving presence and broadcast for a colleague's
-- live session on a socket they opened beforehand. Their own sessions are ended above, so this
-- is about sessions other teachers are hosting. What flows there is the room's public state and
-- who is present, never an answer key.
--
-- What is done about it:
--   * Removal: `remove_org_member` deletes the member's rows in `auth.sessions`, which is what
--     Supabase Auth's own global sign-out does. Their refresh tokens go with the sessions, so no
--     browser of theirs can get a new access token; each has to sign in again, with the password
--     it has (nothing about the password changes). If this role may not delete from
--     `auth.sessions`, the removal still happens and only this step is skipped.
--   * A move: the database ends nothing, because the session that is accepting must go on
--     working. The app signs out every OTHER session of the account, with the session's own
--     `signOut({ scope: 'others' })`, as #378 does.
--
-- What remains: an access token already issued is valid until it expires (`jwt_expiry`, one hour
-- here and by default on a hosted project). Until then a socket joined before the change may
-- stay joined; it cannot outlive that token for a removed teacher or for a mover's other
-- sessions, and for the mover's own accepting session it is re-authorised, and refused, the next
-- time its token is refreshed. Table reads, pages and actions are not affected by any of this:
-- they are answered from the profile row at once.
--
-- ---------------------------------------------------------------------------
-- Locks
-- ---------------------------------------------------------------------------
--
-- The order is still profile, then org, then invitation. Two things are new. accept_org_invite
-- may lock two orgs, the one joined and the one left, and takes them in id order, so two teachers
-- moving in opposite directions cannot deadlock. And every change to who teaches in a
-- self-registered workspace (joining it, leaving it, being removed from it) now happens under
-- that workspace's row lock, so "the last teacher", "other members" and the member cap are each
-- read against a membership that cannot change underneath them.
--
-- `private.admit_to_class` now takes the class's org row `for share`, after the profile row. A
-- share lock is the weakest row lock that conflicts with `for no key update` (`for key share`
-- conflicts only with `for update`), and students joining at the same moment do not block each
-- other with it. So a student joining a class and that class's last teacher moving away are one
-- after the other: either the student is in and the move is refused (`students_depend`), or the
-- workspace is marked emptied and the student is refused (`invalid`).
--
-- Safe to replay on a fresh project, and safe to run twice: the columns are added only if
-- missing and the backfill runs only in the statement that adds `founder_id`, the index is made
-- only if missing, the old accept function is dropped only if it exists, and every function is
-- `create or replace` with its grants restated. Depends on 20261009010000 (`org_invites`) and on
-- 20261009000000 (`admit_to_class` as it stood, restated here with the two additions).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'orgs' and c.column_name = 'founder_id'
  ) then
    alter table public.orgs
      add column founder_id uuid references public.profiles (id) on delete set null;

    -- The founder did not come in by invitation; everybody else did. Where that does not single
    -- one out, the earliest `org_members().joined_at` does.
    update public.orgs o
       set founder_id = (
         select p.id
           from public.profiles p
          where p.org_id = o.id
            and p.role in ('instructor', 'admin')
          order by exists (
                     select 1 from public.org_invites i
                      where i.accepted_by = p.id and i.org_id = o.id
                   ),
                   coalesce(
                     (select max(i.accepted_at) from public.org_invites i
                       where i.accepted_by = p.id and i.org_id = o.id),
                     p.created_at
                   ),
                   p.id
          limit 1
       )
     where o.self_registered;
  end if;
end
$$;

alter table public.orgs
  add column if not exists emptied_at timestamptz;

create index if not exists orgs_founder_id_idx on public.orgs (founder_id);

comment on column public.orgs.founder_id is
  'The teacher who made a self-registered workspace, and the only one who may remove a colleague. Null for the shared workspace.';
comment on column public.orgs.emptied_at is
  'When the last teacher moved to another workspace. Written only by accept_org_invite. For a later sweep.';

-- ---------------------------------------------------------------------------
-- Making a workspace
-- ---------------------------------------------------------------------------

-- A workspace named after its teacher, as src/lib/auth/signUp.ts names one: the name cut so the
-- whole fits in 80 characters, and a plain name for an account nobody has named.
create or replace function private.default_workspace_name(display_name text) returns text
language sql immutable set search_path = ''
as $$
  select case
           when owner = '' then 'My workspace'
           else owner || chr(8217) || 's workspace'
         end
    from (
      select regexp_replace(
               left(regexp_replace(coalesce(display_name, ''), '^\s+|\s+$', '', 'g'), 68),
               '\s+$', ''
             ) as owner
    ) as named;
$$;

revoke all on function private.default_workspace_name(text)
  from public, anon, authenticated, service_role;

-- Makes a self-registered org named `p_workspace`, founded by `p_user`, and puts that account in
-- it as an instructor. The org and the role are set in one UPDATE, which is all that
-- `profiles_org_and_role_together` allows. Callers check who the account is and hold its profile
-- row locked; this checks nothing.
--
-- It sets the role to `instructor`. Its two callers pass it only an account with no role
-- (register_instructor) or an instructor (remove_org_member, which answers 'is_admin' before it
-- gets here), so it never demotes anyone.
create or replace function private.found_workspace(p_user uuid, p_workspace text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_org uuid;
begin
  insert into public.orgs (name, self_registered, founder_id)
  values (p_workspace, true, p_user)
  returning id into new_org;

  update public.profiles
     set org_id = new_org, role = 'instructor'
   where id = p_user;

  return new_org;
end;
$$;

revoke all on function private.found_workspace(uuid, text)
  from public, anon, authenticated, service_role;

-- 20261006000000's function, line for line, except that the org is made by found_workspace and so
-- records its founder. Same refusals, same grants.
create or replace function public.register_instructor(p_user uuid, p_workspace text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  workspace text := regexp_replace(coalesce(p_workspace, ''), '^\s+|\s+$', '', 'g');
  account_role public.org_role;
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

  return private.found_workspace(p_user, workspace);
end;
$$;

revoke all on function public.register_instructor(uuid, text) from public, anon, authenticated;
grant execute on function public.register_instructor(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Leaving a workspace: what goes with the teacher
-- ---------------------------------------------------------------------------

-- A teacher who is no longer in `p_org` cannot run a session there or stand behind an invitation
-- into it. Called after the membership is settled and under the org's row lock.
--
-- Sessions: every author of an org may run any of its sessions, so one left open would not be
-- out of anyone's reach. It would still be a room whose host's screen has stopped working, and a
-- class sitting in it with nobody who knows to take over. Ending it is the state every screen
-- already explains.
create or replace function private.close_departed_teacher(p_user uuid, p_org uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.sessions
     set status = 'ended'
   where org_id = p_org and host_id = p_user and status <> 'ended';

  update public.org_invites
     set revoked_at = now()
   where org_id = p_org
     and invited_by = p_user
     and accepted_at is null
     and revoked_at is null;
end;
$$;

revoke all on function private.close_departed_teacher(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Removing a colleague
-- ---------------------------------------------------------------------------

create or replace function public.remove_org_member(p_member uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_org uuid := (select private.current_org_id());
  org_open boolean;
  org_founder uuid;
  member_org uuid;
  member_role public.org_role;
  member_name text;
  member_email text;
begin
  if caller is null or not (select private.is_author()) then
    raise exception 'only an author can remove a colleague' using errcode = '42501';
  end if;

  -- Answered before anything is locked, so only a founder ever holds a lock here. Every answer
  -- is read again below, under the locks.
  select o.self_registered, o.founder_id into org_open, org_founder
    from public.orgs o where o.id = caller_org;
  if not coalesce(org_open, false) then
    return 'shared_workspace';
  end if;
  if org_founder is distinct from caller then
    return 'not_founder';
  end if;
  if p_member = caller then
    return 'is_founder';
  end if;

  -- Profile, then org: the order accept_org_invite takes them in.
  select p.org_id, p.role, p.display_name into member_org, member_role, member_name
    from public.profiles p where p.id = p_member
    for update;
  if not found then
    return 'not_found';
  end if;

  select o.self_registered, o.founder_id into org_open, org_founder
    from public.orgs o where o.id = caller_org
    for no key update;
  -- The caller's own membership cannot change while the org is locked: read it once more.
  if not exists (
    select 1 from public.profiles p
     where p.id = caller and p.org_id = caller_org and p.role in ('instructor', 'admin')
  ) then
    return 'not_found';
  end if;
  if not coalesce(org_open, false) then
    return 'shared_workspace';
  end if;
  if org_founder is distinct from caller then
    return 'not_founder';
  end if;
  if member_org is distinct from caller_org
     or member_role is null
     or member_role not in ('instructor', 'admin') then
    return 'not_found';
  end if;
  if member_role = 'admin' then
    return 'is_admin';
  end if;

  perform private.found_workspace(p_member, private.default_workspace_name(member_name));
  perform private.close_departed_teacher(p_member, caller_org);

  -- An invitation into this workspace still waiting at the removed teacher's own address would
  -- undo the removal with one press. A colleague may invite them again; that is a new decision.
  select lower(u.email::text) into member_email from auth.users u where u.id = p_member;
  update public.org_invites
     set revoked_at = now()
   where org_id = caller_org
     and email = member_email
     and accepted_at is null
     and revoked_at is null;

  -- See "Sessions" in the header. Supabase Auth's global sign-out is this delete. A role that may
  -- not make it leaves the removal standing: the profile row is what decides every request.
  begin
    delete from auth.sessions where user_id = p_member;
  exception when insufficient_privilege then
    raise warning 'remove_org_member could not end the removed member''s sessions';
  end;

  return 'removed';
end;
$$;

revoke all on function public.remove_org_member(uuid) from public, anon;
grant execute on function public.remove_org_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Moving between workspaces: may this teacher leave?
-- ---------------------------------------------------------------------------

-- Null when the teacher `p_user` of `p_from` may leave it for `p_to`; otherwise why not. The
-- caller has established that `p_user` is an instructor or admin of `p_from`. accept_org_invite
-- calls it under both orgs' row locks; org_invite_move_preview calls it with none, to describe.
create or replace function private.org_move_refusal(p_user uuid, p_from uuid, p_to uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  from_open boolean;
  from_founder uuid;
begin
  if p_from = p_to then
    return 'already_member';
  end if;

  -- Accepting makes an instructor. An admin is only ever made by hand, and is not demoted here.
  if exists (select 1 from public.profiles p where p.id = p_user and p.role = 'admin') then
    return 'admin_account';
  end if;

  select o.self_registered, o.founder_id into from_open, from_founder
    from public.orgs o where o.id = p_from;
  if not coalesce(from_open, false) then
    return 'teaches_shared';
  end if;

  if exists (
    select 1 from public.profiles p
     where p.org_id = p_from and p.role in ('instructor', 'admin') and p.id <> p_user
  ) then
    -- Somebody stays. Only the founder is held: nobody else could remove the people left.
    return case when from_founder = p_user then 'founder_with_members' end;
  end if;

  -- Nobody stays, so nothing here may still need a teacher.
  if exists (
       select 1 from public.class_members m
         join public.classes c on c.id = m.class_id
        where c.org_id = p_from
     )
     or exists (
       select 1 from public.assignments a where a.org_id = p_from and a.closes_at > now()
     )
     or exists (
       select 1 from public.sessions s where s.org_id = p_from and s.status <> 'ended'
     ) then
    return 'students_depend';
  end if;

  return null;
end;
$$;

revoke all on function private.org_move_refusal(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Moving between workspaces: what the page says before asking
-- ---------------------------------------------------------------------------

-- Dropped first: a function's result columns cannot be changed in place, and a replay of this
-- file must work over an earlier draft of it.
drop function if exists public.org_invite_move_preview(uuid, text);

create or replace function public.org_invite_move_preview(p_user uuid, token text)
returns table (
  status text,
  leaving_workspace text,
  leaving_workspace_id uuid,
  bank_count integer,
  class_count integer
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  candidate text := coalesce(token, '');
  invite_org uuid;
  invited_address text;
  account_org uuid;
  account_role public.org_role;
  account_email text;
  answer text;
begin
  if candidate ~ '^[A-Za-z0-9_-]{32}$' then
    select i.org_id, i.email into invite_org, invited_address
      from public.org_invites i
     where i.token_hash = private.org_invite_token_hash(candidate);
  end if;
  if invite_org is not null then
    select p.org_id, p.role into account_org, account_role
      from public.profiles p where p.id = p_user;
    if not found then
      invite_org := null;
    end if;
  end if;

  if invite_org is null then
    answer := 'invalid';
  else
    select lower(u.email::text) into account_email from auth.users u where u.id = p_user;
    if account_email is distinct from invited_address then
      answer := 'wrong_address';
    elsif account_role is null or account_role = 'student' then
      answer := 'not_teaching';
    else
      answer := coalesce(
        private.org_move_refusal(p_user, account_org, invite_org),
        'move_needs_confirmation'
      );
    end if;
  end if;

  if answer <> 'move_needs_confirmation' then
    return query select answer, null::text, null::uuid, null::integer, null::integer;
    return;
  end if;

  return query
    select answer,
           o.name,
           o.id,
           (select count(*)::integer from public.item_banks b where b.org_id = o.id),
           (select count(*)::integer from public.classes c where c.org_id = o.id)
      from public.orgs o
     where o.id = account_org;
end;
$$;

revoke all on function public.org_invite_move_preview(uuid, text)
  from public, anon, authenticated;
grant execute on function public.org_invite_move_preview(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Accepting
-- ---------------------------------------------------------------------------

-- One function under one name: two with the same named arguments could not be told apart by a
-- call that names only `p_user` and `token`.
drop function if exists public.accept_org_invite(uuid, text);
drop function if exists public.accept_org_invite(uuid, text, boolean);

create or replace function public.accept_org_invite(
  p_user uuid,
  token text,
  p_confirm_move boolean default false,
  p_leaving uuid default null
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  member_cap constant integer := 10;
  candidate text := coalesce(token, '');
  found_invite uuid;
  invite_org uuid;
  account_role public.org_role;
  account_org uuid;
  -- The workspace this account teaches in now, or null for an account that does not teach.
  from_org uuid;
  account_email text;
  org_open boolean;
  invited_address text;
  was_accepted timestamptz;
  was_revoked timestamptz;
  ends_at timestamptz;
  refusal text;
begin
  -- Read without a lock, only to learn which workspace to lock. Its state is read again below.
  if candidate ~ '^[A-Za-z0-9_-]{32}$' then
    select i.id, i.org_id into found_invite, invite_org
      from public.org_invites i
     where i.token_hash = private.org_invite_token_hash(candidate);
  end if;
  if found_invite is null then
    return 'invalid';
  end if;

  -- The lock private.admit_to_class takes, and the role read under it: see 20261009010000.
  select p.role, p.org_id into account_role, account_org
    from public.profiles p where p.id = p_user
    for update;
  if not found then
    raise exception 'no account has that id' using errcode = 'no_data_found';
  end if;
  if account_role in ('instructor', 'admin') then
    from_org := account_org;
  end if;

  -- The workspace joined and, for a teacher, the one left: in id order. See "Locks" above.
  perform 1
     from public.orgs o
    where o.id = invite_org or o.id = from_org
    order by o.id
      for no key update;
  select o.self_registered into org_open from public.orgs o where o.id = invite_org;

  select i.email, i.accepted_at, i.revoked_at, i.expires_at
    into invited_address, was_accepted, was_revoked, ends_at
    from public.org_invites i where i.id = found_invite
    for update;
  if not found then
    -- The workspace was deleted while this call waited, and its invitations with it.
    return 'invalid';
  end if;

  if was_accepted is not null then
    return 'already_accepted';
  end if;
  if was_revoked is not null then
    return 'revoked';
  end if;
  if ends_at <= now() then
    return 'expired';
  end if;

  select lower(u.email::text) into account_email from auth.users u where u.id = p_user;
  if account_email is distinct from invited_address then
    return 'wrong_address';
  end if;
  if account_role = 'student' then
    return 'student';
  end if;
  if from_org is not null then
    refusal := private.org_move_refusal(p_user, from_org, invite_org);
    if refusal is not null then
      return refusal;
    end if;
  end if;
  if not coalesce(org_open, false) then
    return 'shared_workspace';
  end if;
  if (
    select count(*) from public.profiles p
     where p.org_id = invite_org and p.role in ('instructor', 'admin')
  ) >= member_cap then
    return 'members_full';
  end if;
  -- The confirmation is for one workspace, the one the page named. An account that has since
  -- been removed from it, or moved, is in another now and has confirmed nothing about that one.
  if from_org is not null
     and (p_confirm_move is not true or p_leaving is distinct from from_org) then
    return 'move_needs_confirmation';
  end if;

  update public.profiles
     set org_id = invite_org, role = 'instructor'
   where id = p_user;
  update public.org_invites
     set accepted_at = now(), accepted_by = p_user
   where id = found_invite;

  if from_org is not null then
    perform private.close_departed_teacher(p_user, from_org);
    if not exists (
      select 1 from public.profiles p
       where p.org_id = from_org and p.role in ('instructor', 'admin')
    ) then
      -- Nobody teaches there now. Nothing is deleted; no invitation may lead into it.
      update public.org_invites
         set revoked_at = now()
       where org_id = from_org and accepted_at is null and revoked_at is null;
      update public.orgs set emptied_at = now() where id = from_org;
    end if;
  end if;

  return 'accepted';
end;
$$;

revoke all on function public.accept_org_invite(uuid, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.accept_org_invite(uuid, text, boolean, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Joining a class: not in a workspace nobody teaches in
-- ---------------------------------------------------------------------------

-- 20261009000000's function with two additions, both marked. Every way into a class goes through
-- it: the invite link (join_class), the typed code (join_class_by_code) and the invited sign-up
-- trigger. So a class of a workspace whose last teacher moved away admits nobody by any of them,
-- and the answer is the one a link that leads nowhere already gets.
--
-- 'joined'     the account is (now, or already was) a member.
-- 'instructor' the account is an instructor or admin; nothing changed. Never demoted.
-- 'invalid'    no such class, no such profile, a student an author removed from this class, or
--              a class of a workspace marked emptied; nothing changed.
create or replace function private.admit_to_class(account uuid, target_class uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  class_org uuid;
  org_emptied timestamptz;
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

  -- Added: profile, then org, the order accept_org_invite takes them in. Held to the end of the
  -- transaction, so the last teacher's move either sees this student or is seen by them.
  select o.emptied_at into org_emptied
    from public.orgs o where o.id = class_org
    for share;
  if not found or org_emptied is not null then
    return 'invalid';
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
