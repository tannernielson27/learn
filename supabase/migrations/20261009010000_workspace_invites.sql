-- A teacher invites a colleague into their own workspace: the database layer.
-- Owner decisions 2026-10-08. ADR 0009 left this as "org administration, still v2"; this is the
-- first piece of it. The email is src/lib/email/templates/workspaceInvite.ts; the pages come after.
--
-- The rules, all of them enforced here and not only in the pages:
--
--   * Any instructor or admin of a SELF-REGISTERED workspace (`orgs.self_registered`) may invite.
--     Nobody may invite into a workspace that is not self-registered: the shared LeaRN workspace
--     has AI import on (`orgs.ai_import_enabled`), and joining it stays the owner's manual step
--     (docs/05 §7.6, `private.make_instructor`).
--   * The inviter's own address must be confirmed (see "The inviter is confirmed" below).
--   * The link works only for the invited address.
--   * Only an account with no role can accept, and it becomes an `instructor` of the inviting
--     workspace. A student is refused (promoting one would hand over answer keys), and so is an
--     account that already teaches, in a workspace of its own or the shared one. Nobody is ever
--     moved, promoted or given a second workspace.
--   * An invitation lasts 7 days. A workspace has at most 10 members (instructors and admins;
--     students are not members) and at most 10 pending invitations. A person makes at most 5
--     invitations in any 24 hours. One pending invitation per workspace and address.
--   * There is no removing a colleague in this version.
--
-- ---------------------------------------------------------------------------
-- The contract, for the pages
-- ---------------------------------------------------------------------------
--
-- public.create_org_invite(p_inviter uuid, p_email text)                    SERVICE ROLE ONLY
--   returns table (status text, invite_id uuid, token text, expires_at timestamptz), one row.
--   `p_inviter` is the signed-in account the server action has just verified. `token` is the raw
--   token, returned this once and stored nowhere: put it in the email (`/w/<token>`) and nowhere
--   else. On every status but 'created' the other three columns are null.
--     'created'           the invitation exists; send the email.
--     'invalid_email'     `p_email` is not one bare address: no `local@domain.tld` shape, over 254
--                         characters, or holding any of < > " , ; ( ) \ or a control character.
--     'shared_workspace'  the inviter's workspace is not self-registered.
--     'unconfirmed'       the inviter has not confirmed their own address yet.
--     'already_member'    the address already belongs to a member of this workspace.
--     'already_invited'   the address has a pending invitation here; revoke it to send another.
--     'members_full'      the workspace has 10 members.
--     'invites_full'      the workspace has 10 pending invitations.
--     'rate_limited'      the inviter has made 5 invitations in the last 24 hours.
--   Raises P0002 when no account has that id and 42501 when the account is not an instructor or
--   admin: neither is something a page explains, both mean the action called it wrongly.
--
-- public.revoke_org_invite(p_invite uuid)                                   authenticated
--   returns text. The caller must be an author; the invitation must be in the caller's workspace.
--     'revoked'           it is revoked now, or already was (also for one that had expired).
--     'already_accepted'  the colleague is in; there is nothing to revoke.
--     'not_found'         no such invitation in the caller's workspace (never "not yours").
--   Raises 42501 for a caller who is not an author.
--
-- public.resolve_org_invite(token text, client_key text default null)       SERVICE ROLE ONLY
--   returns table (state text, workspace_name text, inviter_name text, inviter_email text,
--                  invited_email text, expires_at timestamptz): one row for a token that was
--   ever issued, no row for anything else.
--     state is 'pending', 'expired', 'revoked' or 'accepted'.
--   `inviter_name` is null when the inviter has set no display name; both inviter columns are null
--   if that account is gone. A miss (unknown, malformed or missing token) is counted per
--   `client_key` under an `org-invite|` key, sixty per five minutes, and then raises PT429, exactly
--   as resolve_class_invite does. A hit is never counted and never refused.
--
-- public.accept_org_invite(p_user uuid, token text)                         SERVICE ROLE ONLY
--   returns text. `p_user` is the signed-in account the server has just verified (or just made).
--     'accepted'          the account is now an instructor of the inviting workspace.
--     'invalid'           no such token.
--     'already_accepted'  the invitation was used, by this account or any other.
--     'revoked'           the inviter withdrew it.
--     'expired'           older than 7 days.
--     'wrong_address'     the account's address is not the invited one.
--     'student'           the account is a student, in any workspace.
--     'already_teaches'   the account is an instructor or admin, in any workspace.
--     'shared_workspace'  the workspace stopped being self-registered after the invitation.
--     'members_full'      the workspace reached 10 members before this one accepted.
--   They are checked in that order, so a second call by the account that accepted answers
--   'already_accepted', not 'already_teaches'. Nothing is written on any answer but 'accepted'.
--   Raises P0002 when no account has that id. It counts no misses: resolve the token first.
--
-- public.org_members()                                                      authenticated
--   returns table (profile_id uuid, display_name text, email text, role public.org_role,
--                  joined_at timestamptz): the instructors and admins of the caller's own
--   workspace, for a caller who is one of them, and no rows for anybody else. `joined_at` is when
--   the member accepted an invitation here, or when their account was made for one who did not
--   come in by invitation. Profiles RLS hides colleagues from each other, hence this function.
--
-- public.org_invites                                                        authenticated: SELECT
--   An author reads the invitations of their own workspace, every column but `token_hash`. That
--   column has no grant, so `select *` is refused (42501): name the columns. Nobody signed in
--   inserts, updates or deletes a row; every write goes through the functions above. Whether an
--   unaccepted, unrevoked row is still pending is `expires_at > now()`.
--
-- ---------------------------------------------------------------------------
-- Why create_org_invite is the server's and not the browser's
-- ---------------------------------------------------------------------------
--
-- An accepted invitation counts as proof that the invitee holds the invited inbox (owner decision:
-- the link went to that address), so the page clears `learn_email_unconfirmed` on accepting. That
-- is only true while the token reaches nobody but the inbox. If a signed-in teacher could call
-- create_org_invite through the Data API, the token would come back to their browser, and they
-- could make an account on an address they do not own (open sign-up allows it, ADR 0009), invite
-- that address, and accept as it: the account would then be "confirmed" without its real owner
-- ever opening an email, and the takeover remedy of #378 (`endEarlierAccess`) would never run.
-- So it follows `register_instructor`: service role only, with the server naming the account it
-- has verified, and the token goes from the server into the email.
--
-- ---------------------------------------------------------------------------
-- The inviter is confirmed
-- ---------------------------------------------------------------------------
--
-- An account from open sign-up carries `learn_email_unconfirmed: true` in `app_metadata` until its
-- owner opens an emailed link (src/lib/auth/emailConfirmation.ts). Only the service role writes
-- app_metadata, and it is stored in `auth.users.raw_app_meta_data`, so the check is sound here and
-- is made here: create_org_invite reads the row itself, not a token claim that may be an hour
-- stale. Without it, someone who made an account on another person's address could send
-- invitations in that person's name.
--
-- ---------------------------------------------------------------------------
-- The token
-- ---------------------------------------------------------------------------
--
-- `private.new_invite_token()`: 192 bits, the class invite's generator. Only its SHA-256 is
-- stored, as 64 hex digits, so a read of this table (a backup, a support query) yields no link.
-- A 192-bit random value needs no salt and no slow hash.
--
-- ---------------------------------------------------------------------------
-- A student or a teacher, never both
-- ---------------------------------------------------------------------------
--
-- `private.admit_to_class` makes a role-less account a student; accept_org_invite makes one an
-- instructor. Both take the account's profile row `for update` and read the role in that same
-- statement, so of two that race one waits, then sees the role the other committed and refuses.
-- accept_org_invite sets the org and the role in one UPDATE, which is also all that
-- `profiles_org_and_role_together` allows. admit_to_class is not touched here.
--
-- Locks are taken in one order everywhere: profile, then org, then invitation. The org row is
-- locked `for no key update`, which serializes the two caps (two accepts, or two creates, cannot
-- both see nine) without blocking the foreign key checks of anything else that names the org.
--
-- Safe to replay on a fresh project, and safe to run twice: the table and its indexes are made
-- only if missing, the policy is dropped before it is made, and every function is
-- `create or replace` with its grants restated. Depends on 20261006000000 (`self_registered`).
-- Nothing existing is altered.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- Lower case and trimmed, so one address is one invitation however it was typed.
  email text not null
    check (email = lower(btrim(email)) and length(email) between 3 and 254),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  constraint org_invites_token_hash_key unique (token_hash),
  constraint org_invites_accepted_or_revoked
    check (accepted_at is null or revoked_at is null)
);

comment on table public.org_invites is
  'Invitations to join a self-registered workspace as an instructor. Written only by create_org_invite, revoke_org_invite and accept_org_invite.';
comment on column public.org_invites.token_hash is
  'SHA-256 of the emailed token, hex. The token itself is never stored.';

-- One open invitation per workspace and address. Expiry cannot be part of an index predicate
-- (now() is not immutable), so create_org_invite revokes an expired one before it makes another.
create unique index if not exists org_invites_one_open_per_address
  on public.org_invites (org_id, email)
  where accepted_at is null and revoked_at is null;
create index if not exists org_invites_invited_by_idx on public.org_invites (invited_by);
create index if not exists org_invites_accepted_by_idx on public.org_invites (accepted_by);

-- Supabase's default privileges hand anon and authenticated full DML on a new public table.
revoke all on public.org_invites from anon, authenticated;
grant select (
  id, org_id, email, invited_by, created_at, expires_at, accepted_at, accepted_by, revoked_at
) on public.org_invites to authenticated;

alter table public.org_invites enable row level security;

drop policy if exists "authors read their workspace's invitations" on public.org_invites;
create policy "authors read their workspace's invitations" on public.org_invites
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

-- ---------------------------------------------------------------------------
-- The token's digest
-- ---------------------------------------------------------------------------

create or replace function private.org_invite_token_hash(token text) returns text
language sql immutable set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(token, ''), 'UTF8')), 'hex');
$$;

revoke all on function private.org_invite_token_hash(text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Inviting
-- ---------------------------------------------------------------------------

create or replace function public.create_org_invite(p_inviter uuid, p_email text)
returns table (status text, invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  member_cap constant integer := 10;
  pending_cap constant integer := 10;
  daily_cap constant integer := 5;
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

-- ---------------------------------------------------------------------------
-- Revoking
-- ---------------------------------------------------------------------------

create or replace function public.revoke_org_invite(p_invite uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  caller_org uuid := (select private.current_org_id());
  was_accepted boolean;
begin
  if not (select private.is_author()) then
    raise exception 'only an author can revoke an invitation' using errcode = '42501';
  end if;

  update public.org_invites i
     set revoked_at = now()
   where i.id = p_invite
     and i.org_id = caller_org
     and i.accepted_at is null
     and i.revoked_at is null;
  if found then
    return 'revoked';
  end if;

  select i.accepted_at is not null into was_accepted
    from public.org_invites i
   where i.id = p_invite and i.org_id = caller_org;
  if not found then
    return 'not_found';
  end if;
  return case when was_accepted then 'already_accepted' else 'revoked' end;
end;
$$;

revoke all on function public.revoke_org_invite(uuid) from public, anon;
grant execute on function public.revoke_org_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Resolving a token
-- ---------------------------------------------------------------------------

-- An unknown token, a malformed one and none at all take the same path, as in
-- resolve_class_invite: each is a miss, each is counted, each returns no row. `code_lookups` keys
-- are at most 64 characters, so the address is clipped to 53 after the 11 of the prefix.
create or replace function public.resolve_org_invite(token text, client_key text default null)
returns table (
  state text,
  workspace_name text,
  inviter_name text,
  inviter_email text,
  invited_email text,
  expires_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  bucket_key text := 'org-invite|' || coalesce(
    nullif(left(lower(btrim(coalesce(client_key, ''))), 53), ''),
    'unidentified'
  );
  candidate text := coalesce(token, '');
  hit uuid;
begin
  if candidate ~ '^[A-Za-z0-9_-]{32}$' then
    select i.id into hit
      from public.org_invites i
     where i.token_hash = private.org_invite_token_hash(candidate);
  end if;

  if hit is null then
    if not private.take_failed_lookup(bucket_key) then
      raise exception 'too many invitation lookups from this network' using errcode = 'PT429';
    end if;
    return;
  end if;

  return query
    select case
             when i.accepted_at is not null then 'accepted'
             when i.revoked_at is not null then 'revoked'
             when i.expires_at <= now() then 'expired'
             else 'pending'
           end,
           o.name,
           p.display_name,
           u.email::text,
           i.email,
           i.expires_at
      from public.org_invites i
      join public.orgs o on o.id = i.org_id
      left join public.profiles p on p.id = i.invited_by
      left join auth.users u on u.id = i.invited_by
     where i.id = hit;
end;
$$;

revoke all on function public.resolve_org_invite(text, text) from public, anon, authenticated;
grant execute on function public.resolve_org_invite(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Accepting
-- ---------------------------------------------------------------------------

create or replace function public.accept_org_invite(p_user uuid, token text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  member_cap constant integer := 10;
  candidate text := coalesce(token, '');
  found_invite uuid;
  invite_org uuid;
  account_role public.org_role;
  account_email text;
  org_open boolean;
  invited_address text;
  was_accepted timestamptz;
  was_revoked timestamptz;
  ends_at timestamptz;
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

  -- The lock private.admit_to_class takes, and the role read under it: see the header.
  select p.role into account_role
    from public.profiles p where p.id = p_user
    for update;
  if not found then
    raise exception 'no account has that id' using errcode = 'no_data_found';
  end if;

  select o.self_registered into org_open
    from public.orgs o where o.id = invite_org
    for no key update;

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
  if account_role is not null then
    return 'already_teaches';
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

  update public.profiles
     set org_id = invite_org, role = 'instructor'
   where id = p_user;
  update public.org_invites
     set accepted_at = now(), accepted_by = p_user
   where id = found_invite;
  return 'accepted';
end;
$$;

revoke all on function public.accept_org_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_org_invite(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- The members of a workspace
-- ---------------------------------------------------------------------------

-- The address lives in auth.users, out of the Data API's reach, hence definer rights, as in
-- class_roster. A workspace holds at most 10 members; the limit is for the shared one.
create or replace function public.org_members()
returns table (
  profile_id uuid,
  display_name text,
  email text,
  role public.org_role,
  joined_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select p.id,
         p.display_name,
         u.email::text,
         p.role,
         coalesce(
           (select max(i.accepted_at) from public.org_invites i
             where i.accepted_by = p.id and i.org_id = p.org_id),
           p.created_at
         )
    from public.profiles p
    join auth.users u on u.id = p.id
   where (select private.is_author())
     and p.org_id = (select private.current_org_id())
     and p.role in ('instructor', 'admin')
   order by 5, lower(u.email::text), p.id
   limit 200;
$$;

revoke all on function public.org_members() from public, anon;
grant execute on function public.org_members() to authenticated;
