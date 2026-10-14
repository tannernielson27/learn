-- Two follow-ups from the security reviews of multi-workspace students (#392) and colleague
-- invitations (#393, #397).
--
-- ---------------------------------------------------------------------------
-- 1. A student reads no row of public.orgs
-- ---------------------------------------------------------------------------
--
-- "members read their org" (20260913000000) let anyone read the org their profile names. Since
-- 20261009000000 a student's `profiles.org_id` is only the first workspace they joined, and it
-- never changes: a student removed from every class there, or in classes of other workspaces
-- only, still read that row. `authenticated` holds SELECT on every column of the table (id, name,
-- created_at, self_registered, ai_import_enabled); nothing narrower was ever granted.
--
-- No student page reads the table. The two reads in the app are an author's: the workspace page
-- (`readWorkspace`) and the teacher's welcome (`readTeacherWelcomeState`). A student gets the
-- names of their classes' workspaces from `my_classes()`, a definer function that returns the
-- name and nothing else. So the policy is narrowed to authors, like every other policy an author
-- works under. An account with no role read nothing before and reads nothing now.
--
-- The app is the same before and after this is applied: no student code path asks for the row.
--
-- ---------------------------------------------------------------------------
-- 2. An address receives at most three invitations in 24 hours
-- ---------------------------------------------------------------------------
--
-- The caps of 20261009010000 are per workspace and per inviter. Sign-up is open, so throwaway
-- teacher accounts, each within its own five a day, could still make LeaRN mail one address over
-- and over. create_org_invite now also counts what the ADDRESS has been sent, across every
-- workspace, revoked invitations included, and refuses the fourth in 24 hours with a new status,
-- `recipient_limited`.
--
-- It is the last check made, so every answer the function gave before it still gives, in the same
-- order, and the new one is reached only by an invitation that would otherwise have been made.
-- It tells the inviter that the address was invited three times in the day, by them or by anyone:
-- that much about other workspaces is disclosed, and nothing more (not who, not which workspace).
--
-- The count spans workspaces, and the org lock serializes one workspace only. So the function
-- takes a transaction-level advisory lock on the address before counting, after the org lock.
-- Nothing else takes that lock, and nothing takes an org or profile lock while holding it, so the
-- order "profile, then org, then invitation" is as it was and no cycle is possible.
--
-- Before this is applied the old function never answers `recipient_limited`; the app knows the
-- status and simply never sees it. The app's own check before a resend counts only the caller's
-- workspace, under row level security, and works with or without this migration.
--
-- ---------------------------------------------------------------------------
-- The contract of create_org_invite, restated in full
-- ---------------------------------------------------------------------------
--
-- public.create_org_invite(p_inviter uuid, p_email text)                    SERVICE ROLE ONLY
--   returns table (status text, invite_id uuid, token text, expires_at timestamptz), one row.
--   `p_inviter` is the signed-in account the server action has just verified. `token` is the raw
--   token, returned this once and stored nowhere: put it in the email (`/w/<token>`) and nowhere
--   else. On every status but 'created' the other three columns are null.
--     'created'            the invitation exists; send the email.
--     'invalid_email'      `p_email` is not one bare address: no `local@domain.tld` shape, over
--                          254 characters, or holding any of < > " , ; ( ) \ or a control character.
--     'shared_workspace'   the inviter's workspace is not self-registered.
--     'unconfirmed'        the inviter has not confirmed their own address yet.
--     'already_member'     the address already belongs to a member of this workspace.
--     'already_invited'    the address has a pending invitation here; revoke it to send another.
--     'members_full'       the workspace has 10 members.
--     'invites_full'       the workspace has 10 pending invitations.
--     'rate_limited'       the inviter has made 5 invitations in the last 24 hours.
--     'recipient_limited'  the address has been sent 3 invitations in the last 24 hours, from any
--                          workspace, revoked ones included. NEW.
--   They are checked in that order. Raises P0002 when no account has that id and 42501 when the
--   account is not an instructor or admin.
--
-- Everything else about the function is 20261009010000's, line for line: the address clipping,
-- the checks, closing an expired invitation, the token, the grants.
--
-- Safe to replay on a fresh project, and safe to run twice: both policy names are dropped before
-- the policy is made, the index is made only if missing, and the function is `create or replace`
-- with its grants restated. Depends on 20261009010000 (`org_invites`). No table or column changes.

-- ---------------------------------------------------------------------------
-- 1. Only an author reads their org
-- ---------------------------------------------------------------------------

drop policy if exists "members read their org" on public.orgs;
drop policy if exists "authors read their org" on public.orgs;
create policy "authors read their org" on public.orgs
  for select to authenticated
  using ((select private.is_author()) and id = (select private.current_org_id()));

-- ---------------------------------------------------------------------------
-- 2. The cap on what one address is sent
-- ---------------------------------------------------------------------------

-- The count below is by address across every workspace; the existing indexes lead with org_id.
create index if not exists org_invites_email_created_at_idx
  on public.org_invites (email, created_at);

create or replace function public.create_org_invite(p_inviter uuid, p_email text)
returns table (status text, invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  member_cap constant integer := 10;
  pending_cap constant integer := 10;
  daily_cap constant integer := 5;
  recipient_cap constant integer := 3;
  -- Clipped first, so no caller can make the patterns do much work. Trimmed of every kind of
  -- white space, tabs and line ends included, which btrim alone would leave.
  address text := lower(regexp_replace(left(coalesce(p_email, ''), 320), '^\s+|\s+$', '', 'g'));
  inviter_org uuid;
  inviter_role public.org_role;
  org_open boolean;
  refusal text;
  raw_token text;
  new_id uuid;
  new_expiry timestamptz;
begin
  select p.org_id, p.role into inviter_org, inviter_role
    from public.profiles p where p.id = p_inviter;
  if not found then
    raise exception 'no account has that id' using errcode = 'no_data_found';
  end if;
  if inviter_role is null or inviter_role not in ('instructor', 'admin') then
    raise exception 'only an instructor or admin can invite a colleague' using errcode = '42501';
  end if;

  -- Serializes this workspace's invitations and acceptances, so the caps below are exact.
  select o.self_registered into org_open
    from public.orgs o where o.id = inviter_org
    for no key update;

  -- One bare address and nothing else. The characters refused outright are the ones a mail
  -- provider reads as structure around an address (a display name, a list, a comment, a quoted
  -- part): `x<a@b.com>` or `a,b@c.com` could otherwise be delivered somewhere other than the
  -- address the invitation is stored under. Control characters go with them.
  if length(address) > 254
     or address ~ '[<>",;()\\[:cntrl:]\u0001-\u001F\u007F-\u009F]'
     or address !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    refusal := 'invalid_email';
  elsif not coalesce(org_open, false) then
    refusal := 'shared_workspace';
  elsif exists (
    select 1 from auth.users u
     where u.id = p_inviter
       and u.raw_app_meta_data -> 'learn_email_unconfirmed' = 'true'::jsonb
  ) then
    refusal := 'unconfirmed';
  elsif exists (
    select 1
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.org_id = inviter_org
       and p.role in ('instructor', 'admin')
       and lower(u.email::text) = address
  ) then
    refusal := 'already_member';
  end if;

  if refusal is null then
    -- Serializes invitations to this one address across workspaces, so the recipient cap is
    -- exact. Taken after the org lock and released with the transaction: see the header.
    perform pg_advisory_xact_lock(hashtextextended('learn.org_invite_to|' || address, 0));

    -- An expired invitation to this address still holds the one-per-address index. Nobody can
    -- accept it, so it is closed here and a new one can take its place.
    update public.org_invites i
       set revoked_at = now()
     where i.org_id = inviter_org
       and i.email = address
       and i.accepted_at is null
       and i.revoked_at is null
       and i.expires_at <= now();

    if exists (
      select 1 from public.org_invites i
       where i.org_id = inviter_org
         and i.email = address
         and i.accepted_at is null
         and i.revoked_at is null
    ) then
      refusal := 'already_invited';
    elsif (
      select count(*) from public.profiles p
       where p.org_id = inviter_org and p.role in ('instructor', 'admin')
    ) >= member_cap then
      refusal := 'members_full';
    elsif (
      select count(*) from public.org_invites i
       where i.org_id = inviter_org
         and i.accepted_at is null
         and i.revoked_at is null
         and i.expires_at > now()
    ) >= pending_cap then
      refusal := 'invites_full';
    elsif (
      -- Every invitation counts, revoked ones too, so revoking does not buy another.
      select count(*) from public.org_invites i
       where i.invited_by = p_inviter and i.created_at > now() - interval '1 day'
    ) >= daily_cap then
      refusal := 'rate_limited';
    elsif (
      -- What the address has been sent, by anyone, in any workspace. Revoked ones count here
      -- too, so revoking does not buy another.
      select count(*) from public.org_invites i
       where i.email = address and i.created_at > now() - interval '1 day'
    ) >= recipient_cap then
      refusal := 'recipient_limited';
    end if;
  end if;

  if refusal is not null then
    return query select refusal, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  raw_token := private.new_invite_token();
  insert into public.org_invites as i (org_id, email, token_hash, invited_by)
  values (inviter_org, address, private.org_invite_token_hash(raw_token), p_inviter)
  returning i.id, i.expires_at into new_id, new_expiry;

  return query select 'created'::text, new_id, raw_token, new_expiry;
end;
$$;

revoke all on function public.create_org_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.create_org_invite(uuid, text) to service_role;
