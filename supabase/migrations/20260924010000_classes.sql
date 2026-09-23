-- Classes with an invite link students join (#205).
--
-- A class is a name, an invite token and a roster, in one org. Its org's authors create, rename
-- and rotate it and read its roster. A student reads the id and name of the classes they belong to,
-- through `public.my_classes()`, and nothing else: not the class row, not the token, not anybody
-- else's membership. An author of another org sees nothing.
--
-- The invite link is `/c/<token>`. The app's server resolves the token with the service role
-- (`public.resolve_class_invite`, rate limited per address), creates the account with the admin
-- API and `app_metadata.learn_invite`, and sends the sign-in link. The seam #204 left in
-- `private.handle_new_user` is completed here.
--
-- ---------------------------------------------------------------------------
-- Why the invite is read on UPDATE as well as INSERT
-- ---------------------------------------------------------------------------
--
-- GoTrue's `POST /admin/users` does not write `app_metadata` in its INSERT. It inserts the row with
-- only `{"provider", "providers"}` and then applies the caller's app_metadata in an UPDATE inside
-- the same transaction (checked against the local stack while building #205: an AFTER INSERT
-- trigger saw no `learn_invite`, the following UPDATE did). An insert-only trigger therefore never
-- sees the invite. So the same check runs from a second trigger, AFTER UPDATE OF
-- raw_app_meta_data, and only when `learn_invite` itself changed.
--
-- Reading app_metadata on update is as safe as reading it on insert: only the service role can
-- write it (`auth.updateUser` from a browser writes user_metadata, which is never read here). And
-- the admission rules below never demote anyone: an instructor or admin is left exactly as it is,
-- a student of another org is not moved, and only an account with no role becomes a student.
--
-- Safe to replay on a fresh project: new tables, new functions, `create or replace` for the one
-- #204 function, and `drop trigger if exists` before the new trigger.

-- ---------------------------------------------------------------------------
-- The token
-- ---------------------------------------------------------------------------

-- 24 bytes from gen_random_bytes (pgcrypto's CSPRNG, never random()), base64url without padding:
-- 32 characters, 192 bits. Security definer so the column default works for an author without
-- granting anything in `extensions`.
create function private.new_invite_token() returns text
language sql volatile security definer set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
$$;

revoke all on function private.new_invite_token() from public, anon;
-- A column default runs as the inserting role, so the author creating a class needs this.
grant execute on function private.new_invite_token() to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default private.current_org_id()
    references public.orgs (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  invite_token text not null default private.new_invite_token()
    check (invite_token ~ '^[A-Za-z0-9_-]{32}$'),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_invite_token_key unique (invite_token)
);
create index classes_org_id_idx on public.classes (org_id);
create index classes_created_by_idx on public.classes (created_by);

create trigger classes_set_updated_at before update on public.classes
  for each row execute function private.set_updated_at();

create table public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, profile_id)
);
create index class_members_profile_id_idx on public.class_members (profile_id);

-- A student an author took off a class. The invite link stays valid for everyone else, and the
-- removed student still has it in their inbox, so without this record they could tap Join again
-- and undo the removal. admit_to_class refuses anyone listed here. Letting them back in is an owner
-- step in v1: delete the row. Private, so no client reads or writes it.
create table private.class_removals (
  class_id uuid not null references public.classes (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (class_id, profile_id)
);
create index class_removals_profile_id_idx on private.class_removals (profile_id);

create function private.record_class_removal() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.class_removals (class_id, profile_id)
  values (old.class_id, old.profile_id)
  on conflict do nothing;
  return old;
end;
$$;
revoke all on function private.record_class_removal() from public, anon, authenticated, service_role;

create trigger class_members_record_removal after delete on public.class_members
  for each row execute function private.record_class_removal();

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

-- Supabase's default privileges hand anon and authenticated full DML on a new public table.
revoke all on public.classes from anon, authenticated;
revoke all on public.class_members from anon, authenticated;

-- An author names a class and renames it. The org, the creator and the token come from defaults,
-- and the token changes only through rotate_class_invite, so no client ever chooses one.
grant select on public.classes to authenticated;
grant insert (name) on public.classes to authenticated;
grant update (name) on public.classes to authenticated;

-- Nobody inserts a membership: the invite (trigger or join_class) is the only way in. Removing a
-- student is a delete by an author of the class's org.
--
-- Deliberately absent, as the conservative choice for #205: deleting or archiving a class (no
-- delete grant on classes) and a student leaving a class on their own (no self-delete policy on
-- class_members). Both are later decisions, not oversights.
grant select, delete on public.class_members to authenticated;

alter table public.classes enable row level security;
alter table public.class_members enable row level security;

-- Only authors ever reach a class row, so only authors ever see a token. A student's view of their
-- classes is my_classes(), which returns the id and the name.
create policy "authors read their org's classes" on public.classes
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors create classes in their org" on public.classes
  for insert to authenticated
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors rename their org's classes" on public.classes
  for update to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()))
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

-- The class lookup runs as the caller, so the classes policy above already limits it to authors of
-- the org; the explicit is_author() keeps the rule readable on its own.
create policy "authors read their org's rosters, students their own membership"
  on public.class_members
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (
      (select private.is_author())
      and exists (select 1 from public.classes c
                   where c.id = class_members.class_id
                     and c.org_id = (select private.current_org_id()))
    )
  );

create policy "authors remove students from their org's classes" on public.class_members
  for delete to authenticated
  using (
    (select private.is_author())
    and exists (select 1 from public.classes c
                 where c.id = class_members.class_id
                   and c.org_id = (select private.current_org_id()))
  );

-- ---------------------------------------------------------------------------
-- Admission: the one place an account joins a class
-- ---------------------------------------------------------------------------

-- 'joined'     the account is (now, or already was) a member.
-- 'instructor' the account is an instructor or admin; nothing changed. Never demoted.
-- 'invalid'    no such class, no such profile, or a student of another org; nothing changed.
--
-- An account with no role becomes a student in the class's org. That is the only role change
-- anything here makes.
create function private.admit_to_class(account uuid, target_class uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  class_org uuid;
  account_role public.org_role;
  account_org uuid;
begin
  select c.org_id into class_org from public.classes c where c.id = target_class;
  if class_org is null then
    return 'invalid';
  end if;

  select p.role, p.org_id into account_role, account_org
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
  elsif account_org is distinct from class_org then
    return 'invalid';
  end if;

  insert into public.class_members (class_id, profile_id)
  values (target_class, account)
  on conflict do nothing;
  return 'joined';
end;
$$;

revoke all on function private.admit_to_class(uuid, uuid)
  from public, anon, authenticated, service_role;

-- The class id in `app_metadata.learn_invite.class_id`, or null for anything that is not a uuid.
-- Never an exception: a garbled invite must not stop the account being created.
create function private.invited_class(app_metadata jsonb) returns uuid
language plpgsql immutable set search_path = ''
as $$
declare
  raw text := app_metadata -> 'learn_invite' ->> 'class_id';
begin
  if raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return raw::uuid;
  end if;
  return null;
end;
$$;

revoke all on function private.invited_class(jsonb) from public, anon, authenticated, service_role;

-- #204's function, with its seam completed. Every new account still starts with no org and no
-- role; an app_metadata invite to a class that exists then admits it. Never raw_user_meta_data.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  invited uuid := private.invited_class(new.raw_app_meta_data);
begin
  insert into public.profiles (id, org_id, role) values (new.id, null, null);
  if invited is not null then
    perform private.admit_to_class(new.id, invited);
  end if;
  return new;
end
$$;

-- The admin API's path: app_metadata arrives in an UPDATE after the INSERT (see the header).
create function private.handle_user_invite() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  invited uuid := private.invited_class(new.raw_app_meta_data);
begin
  if invited is not null then
    perform private.admit_to_class(new.id, invited);
  end if;
  return new;
end
$$;

revoke all on function private.handle_user_invite() from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_invited on auth.users;
create trigger on_auth_user_invited
  after update of raw_app_meta_data on auth.users
  for each row
  when (new.raw_app_meta_data -> 'learn_invite' is distinct from old.raw_app_meta_data -> 'learn_invite')
  execute function private.handle_user_invite();

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- A student's classes: the id and the name, and nothing more. Anyone signed in may call it; it
-- only ever returns the caller's own memberships.
create function public.my_classes()
returns table (class_id uuid, class_name text, joined_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, m.joined_at
    from public.class_members m
    join public.classes c on c.id = m.class_id
   where m.profile_id = (select auth.uid())
   order by c.name, c.id;
$$;

revoke all on function public.my_classes() from public, anon;
grant execute on function public.my_classes() to authenticated;

-- A class's roster for an author of its org: who, their address (which lives in auth.users, out of
-- the Data API's reach, hence definer rights) and whether they have signed in yet. Anyone else
-- gets no rows. `signed_in` is false for an address someone typed into the invite form and whose
-- owner never opened the link, so an instructor can tell a real student from a typo.
create function public.class_roster(target_class uuid)
returns table (
  profile_id uuid,
  email text,
  display_name text,
  joined_at timestamptz,
  signed_in boolean
)
language sql stable security definer set search_path = ''
as $$
  select p.id, u.email::text, p.display_name, m.joined_at, u.last_sign_in_at is not null
    from public.class_members m
    join public.classes c on c.id = m.class_id
    join public.profiles p on p.id = m.profile_id
    join auth.users u on u.id = p.id
   where m.class_id = target_class
     and (select private.is_author())
     and c.org_id = (select private.current_org_id())
   order by lower(u.email::text), p.id
   limit 1000;
$$;

revoke all on function public.class_roster(uuid) from public, anon;
grant execute on function public.class_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Rotating
-- ---------------------------------------------------------------------------

-- A new token for a class of the caller's org, returned. The old one stops resolving the moment
-- this commits: nothing caches a token, and resolve_class_invite matches the current column only.
-- A class the caller cannot see is 'no such class', never 'not yours'.
create function public.rotate_class_invite(target_class uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  fresh text;
begin
  if not (select private.is_author()) then
    raise exception 'only an author can rotate an invite link' using errcode = '42501';
  end if;

  update public.classes
     set invite_token = private.new_invite_token()
   where id = target_class and org_id = (select private.current_org_id())
  returning invite_token into fresh;

  if fresh is null then
    raise exception 'that class does not exist' using errcode = 'P0002';
  end if;
  return fresh;
end;
$$;

revoke all on function public.rotate_class_invite(uuid) from public, anon;
grant execute on function public.rotate_class_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Resolving a token
-- ---------------------------------------------------------------------------

-- Turns an invite token into the class id and name, for the app's server. Granted to service_role
-- only, which is what makes `client_key` (the caller's address, read off the request) trustworthy,
-- the same argument resolve_session_code makes.
--
-- Misses are counted per address in private.code_lookups, through the same counter and limit as a
-- wrong join code (sixty per five minutes), under an `invite|` key so the two budgets are separate.
-- A hit is never counted and never refused, so a script on a campus network cannot lock the class
-- out of its own link.
--
-- An unknown token, a rotated token, a malformed token and no token all take the same path: they
-- are all misses, they are all counted, and they all return zero rows. The format check does not
-- short-circuit before the counter, so a malformed token costs what an unknown one costs and is
-- answered in the same way; nothing in the reply or its timing says which it was.
create function public.resolve_class_invite(token text, client_key text default null)
returns table (class_id uuid, class_name text)
language plpgsql security definer set search_path = ''
as $$
declare
  bucket_key text := 'invite|' || coalesce(
    nullif(left(lower(btrim(coalesce(client_key, ''))), 57), ''),
    'unidentified'
  );
  candidate text := coalesce(token, '');
  hit uuid;
begin
  if candidate ~ '^[A-Za-z0-9_-]{32}$' then
    select c.id into hit from public.classes c where c.invite_token = candidate;
  end if;

  if hit is null then
    if not private.take_failed_lookup(bucket_key) then
      raise exception 'too many invite lookups from this network' using errcode = 'PT429';
    end if;
    return;
  end if;

  return query select c.id, c.name from public.classes c where c.id = hit;
end;
$$;

revoke all on function public.resolve_class_invite(text, text) from public, anon, authenticated;
grant execute on function public.resolve_class_invite(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Joining while signed in
-- ---------------------------------------------------------------------------

-- The one-tap join for an account that is already signed in: 'joined', 'instructor', 'invalid'
-- or 'rate_limited'. The token is checked here, not trusted from the page, and misses are counted
-- against the caller's own account so a signed-in script cannot guess tokens either.
create function public.join_class(token text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  candidate text := coalesce(token, '');
  hit uuid;
begin
  if caller is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  if candidate ~ '^[A-Za-z0-9_-]{32}$' then
    select c.id into hit from public.classes c where c.invite_token = candidate;
  end if;

  if hit is null then
    if not private.take_failed_lookup('invite-user|' || caller::text) then
      return 'rate_limited';
    end if;
    return 'invalid';
  end if;

  return private.admit_to_class(caller, hit);
end;
$$;

revoke all on function public.join_class(text) from public, anon;
grant execute on function public.join_class(text) to authenticated;
