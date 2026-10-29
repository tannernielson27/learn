-- Beta passes: an owner-issued link that gives one workspace free access until revoked (#520,
-- milestone S15: Billing, ADR 0016 "Beta passes"). Modelled on workspace invitations (ADR 0010,
-- 20261009010000_workspace_invites.sql): a 192-bit token, emailed (or handed) to one address and
-- stored only as its SHA-256.
--
-- The rules, all of them enforced here and not only in the page:
--
--   * Only the owner issues, lists and revokes, through `scripts/beta-pass.mjs` with the secret
--     key. There is no admin page, and nothing a teacher or student can call reads a pass.
--   * A pass is bound to one address (lower case, trimmed). It is redeemed only by the account
--     signed in with that address, only by a teacher who started the workspace they teach in
--     (`orgs.founder_id`, the person who manages billing, ADR 0016), only once, only while it is
--     neither revoked nor past `expires_at` (30 days from issue; the link expires, the access it
--     grants does not).
--   * Redeeming adds a `beta` grant to the redeemer's workspace with no expiry
--     (`public.access_grants`, 20261027000000_billing.sql), `granted_by` `beta_pass:<pass id>`
--     and the pass's note as its reason. A workspace that already has an unrevoked beta grant
--     keeps that one; the pass is still marked used.
--   * Revoking a pass by address also revokes the grant each of that address's passes made.
--     Nothing is deleted.
--   * Every refusal of a redemption is the same error, PT403 "this link cannot be used", for an
--     unknown or malformed token, a used, revoked or expired pass, another address, a student, an
--     account with no role, a teacher who did not start their workspace, and an account that does
--     not exist. Whoever calls learns only "it worked" or "it did not".
--
-- NOTHING HERE IS ENFORCED. Like 20261027000000, no policy reads a grant yet (#521). Pushing this
-- changes nothing a teacher or student can do; the page that calls redeem_beta_pass is /b/<token>.
-- What a teacher sees when their beta grant is revoked is #522 (the banners); nothing here says.
--
-- ---------------------------------------------------------------------------
-- The contract
-- ---------------------------------------------------------------------------
--
-- public.issue_beta_pass(p_email text, p_token_hash text, p_note text, p_created_by text)
--   returns table (status text, pass_id uuid, expires_at timestamptz), one row. SERVICE ROLE ONLY
--   The script makes the token and passes only its digest (64 lower-case hex digits), so the
--   database never holds, returns or logs a link. Status:
--     'issued'          the pass exists; hand the link to the address.
--     'invalid_email'   not one bare address (the rule create_org_invite uses).
--     'already_issued'  the address has an unused, unrevoked, unexpired pass; revoke it first.
--   An expired unused pass for the address is revoked here before a new one is made. Raises
--   22023 for a digest that is not 64 hex digits and for a note over 500 characters.
--
-- public.list_beta_passes()                                                  SERVICE ROLE ONLY
--   Every pass, newest first: id, email, note, created_by, created_at, expires_at, redeemed_at,
--   redeemed_by, redeemed_org, workspace_name, revoked_at, state ('pending', 'expired',
--   'redeemed', 'revoked'), and grant_active (the grant this pass made is unrevoked). Never the
--   digest.
--
-- public.revoke_beta_pass(p_email text)                                      SERVICE ROLE ONLY
--   returns table (passes_revoked integer, grants_revoked integer), one row. Sets revoked_at on
--   every pass for the address that has none, and on every unrevoked grant any of them made.
--   Running it twice revokes nothing the second time.
--
-- public.redeem_beta_pass(p_user uuid, p_token text) returns void            SERVICE ROLE ONLY
--   `p_user` is the signed-in account the /b/<token> Server Function has just verified with
--   Supabase Auth (`auth.getUser()`), as accept_org_invite's caller does. Returns on success;
--   raises PT403 on every refusal (above).
--
-- Why redeem is the server's and not the browser's: the per-network limit on redemption
-- (`src/lib/betaPass/redeemLimit.ts`, the shared store `/w/<token>` posts count in) can only key on
-- an address the server read off the request. A function a signed-in browser could call through
-- the Data API would sit behind no such limit, and a raise rolls back any counter kept in here.
-- So it follows accept_org_invite: service role only, with the server naming the account.
--
-- ---------------------------------------------------------------------------
-- The token
-- ---------------------------------------------------------------------------
--
-- 24 bytes from Node's CSPRNG (`crypto.randomBytes`), base64url: 32 characters, 192 bits, the
-- shape private.new_invite_token makes. Only `private.org_invite_token_hash(token)` is stored
-- (SHA-256 of the UTF-8 token, hex), the same digest invitations use, so a backup or a support
-- query yields no link. A 192-bit random value needs no salt and no slow hash.
--
-- Safe to replay: the table and its indexes are made only if missing and every function is
-- `create or replace` with its grants restated. Depends on 20261027000000 (access_grants) and
-- 20261009010000 (org_invite_token_hash). Nothing existing is altered.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table if not exists private.beta_passes (
  id uuid primary key default gen_random_uuid(),
  -- Lower case and trimmed, so one address is one pass however it was typed.
  email text not null
    check (email = lower(btrim(email)) and length(email) between 3 and 254),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  note text check (note is null or length(note) <= 500),
  created_by text not null check (length(created_by) between 1 and 100),
  created_at timestamptz not null default now(),
  -- When an unused link stops working. The access a redeemed pass grants has no end.
  expires_at timestamptz not null default (now() + interval '30 days'),
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles (id) on delete set null,
  redeemed_org uuid references public.orgs (id) on delete set null,
  revoked_at timestamptz,
  constraint beta_passes_token_hash_key unique (token_hash)
);

comment on table private.beta_passes is
  'Owner-issued beta passes (#520): one address, one use, free access until revoked. Read and '
  'written only by issue_beta_pass, list_beta_passes, revoke_beta_pass and redeem_beta_pass.';
comment on column private.beta_passes.token_hash is
  'SHA-256 of the token, hex (private.org_invite_token_hash). The token itself is never stored.';

-- One open pass per address. Expiry cannot be part of an index predicate (now() is not
-- immutable), so issue_beta_pass revokes an expired one before it makes another.
create unique index if not exists beta_passes_one_open_per_address
  on private.beta_passes (email)
  where redeemed_at is null and revoked_at is null;
create index if not exists beta_passes_redeemed_by_idx on private.beta_passes (redeemed_by);
create index if not exists beta_passes_redeemed_org_idx on private.beta_passes (redeemed_org);

alter table private.beta_passes enable row level security;
revoke all on private.beta_passes from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Issuing
-- ---------------------------------------------------------------------------

create or replace function public.issue_beta_pass(
  p_email text,
  p_token_hash text,
  p_note text,
  p_created_by text
) returns table (status text, pass_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  -- create_org_invite's address rule, word for word: clipped, trimmed of every kind of white
  -- space, one bare address and none of the characters a mail provider reads as structure.
  address text := lower(regexp_replace(left(coalesce(p_email, ''), 320), '^\s+|\s+$', '', 'g'));
  digest text := coalesce(p_token_hash, '');
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  new_id uuid;
  new_expiry timestamptz;
begin
  if digest !~ '^[0-9a-f]{64}$' then
    raise exception 'the token digest must be 64 lower-case hex digits' using errcode = '22023';
  end if;
  if length(clean_note) > 500 then
    raise exception 'the note is over 500 characters' using errcode = '22023';
  end if;

  if length(address) > 254
     or address ~ '[<>",;()\\[:cntrl:]\u0001-\u001F\u007F-\u009F]'
     or address !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return query select 'invalid_email'::text, null::uuid, null::timestamptz;
    return;
  end if;

  -- An expired unused pass still holds the one-per-address index. Nobody can redeem it, so it is
  -- closed here and a new one can take its place.
  update private.beta_passes b
     set revoked_at = now()
   where b.email = address
     and b.redeemed_at is null
     and b.revoked_at is null
     and b.expires_at <= now();

  if exists (
    select 1 from private.beta_passes b
     where b.email = address and b.redeemed_at is null and b.revoked_at is null
  ) then
    return query select 'already_issued'::text, null::uuid, null::timestamptz;
    return;
  end if;

  insert into private.beta_passes as b (email, token_hash, note, created_by)
  values (address, digest, clean_note, coalesce(nullif(btrim(p_created_by), ''), 'owner'))
  returning b.id, b.expires_at into new_id, new_expiry;

  return query select 'issued'::text, new_id, new_expiry;
end;
$$;

revoke all on function public.issue_beta_pass(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.issue_beta_pass(text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Listing
-- ---------------------------------------------------------------------------

create or replace function public.list_beta_passes()
returns table (
  id uuid,
  email text,
  note text,
  created_by text,
  created_at timestamptz,
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid,
  redeemed_org uuid,
  workspace_name text,
  revoked_at timestamptz,
  state text,
  grant_active boolean
)
language sql stable security definer set search_path = ''
as $$
  select b.id,
         b.email,
         b.note,
         b.created_by,
         b.created_at,
         b.expires_at,
         b.redeemed_at,
         b.redeemed_by,
         b.redeemed_org,
         o.name,
         b.revoked_at,
         case
           when b.revoked_at is not null then 'revoked'
           when b.redeemed_at is not null then 'redeemed'
           when b.expires_at <= now() then 'expired'
           else 'pending'
         end,
         exists (
           select 1 from public.access_grants g
            where g.granted_by = 'beta_pass:' || b.id::text
              and g.kind = 'beta'
              and g.revoked_at is null
         )
    from private.beta_passes b
    left join public.orgs o on o.id = b.redeemed_org
   order by b.created_at desc, b.id;
$$;

revoke all on function public.list_beta_passes() from public, anon, authenticated;
grant execute on function public.list_beta_passes() to service_role;

-- ---------------------------------------------------------------------------
-- Revoking
-- ---------------------------------------------------------------------------

create or replace function public.revoke_beta_pass(p_email text)
returns table (passes_revoked integer, grants_revoked integer)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  address text := lower(regexp_replace(left(coalesce(p_email, ''), 320), '^\s+|\s+$', '', 'g'));
  pass_count integer;
  grant_count integer;
begin
  update private.beta_passes b
     set revoked_at = now()
   where b.email = address and b.revoked_at is null;
  get diagnostics pass_count = row_count;

  -- Every pass for the address, not only the ones revoked just now, so a grant left open by
  -- anything else is closed too.
  update public.access_grants g
     set revoked_at = now()
   where g.kind = 'beta'
     and g.revoked_at is null
     and g.granted_by in (
       select 'beta_pass:' || b.id::text from private.beta_passes b where b.email = address
     );
  get diagnostics grant_count = row_count;

  return query select pass_count, grant_count;
end;
$$;

revoke all on function public.revoke_beta_pass(text) from public, anon, authenticated;
grant execute on function public.revoke_beta_pass(text) to service_role;

-- ---------------------------------------------------------------------------
-- Redeeming
-- ---------------------------------------------------------------------------

create or replace function public.redeem_beta_pass(p_user uuid, p_token text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  candidate text := left(coalesce(p_token, ''), 64);
  found_pass uuid;
  pass_address text;
  pass_note text;
  pass_redeemed timestamptz;
  pass_revoked timestamptz;
  pass_expires timestamptz;
  account_email text;
  account_role public.org_role;
  account_org uuid;
  org_founder uuid;
  org_open boolean;
begin
  if candidate ~ '^[A-Za-z0-9_-]{32}$' then
    -- Locked, so of two redemptions of one pass that race, the second sees the first's mark.
    select b.id, b.email, b.note, b.redeemed_at, b.revoked_at, b.expires_at
      into found_pass, pass_address, pass_note, pass_redeemed, pass_revoked, pass_expires
      from private.beta_passes b
     where b.token_hash = private.org_invite_token_hash(candidate)
       for update;
  end if;

  select lower(btrim(u.email::text)) into account_email from auth.users u where u.id = p_user;
  select p.role, p.org_id into account_role, account_org
    from public.profiles p where p.id = p_user;
  select o.founder_id, o.self_registered into org_founder, org_open
    from public.orgs o where o.id = account_org;

  -- One test, one answer: nothing about which part failed leaves this function.
  if found_pass is null
     or pass_redeemed is not null
     or pass_revoked is not null
     or pass_expires <= now()
     or account_email is null
     or account_email is distinct from pass_address
     or account_role is null
     or account_role not in ('instructor', 'admin')
     or account_org is null
     or not coalesce(org_open, false)
     or org_founder is distinct from p_user then
    raise exception 'this link cannot be used' using errcode = 'PT403';
  end if;

  insert into public.access_grants (org_id, kind, reason, granted_by)
  values (account_org, 'beta', pass_note, 'beta_pass:' || found_pass::text)
  on conflict (org_id, kind) where revoked_at is null do nothing;

  update private.beta_passes
     set redeemed_at = now(), redeemed_by = p_user, redeemed_org = account_org
   where id = found_pass;
end;
$$;

revoke all on function public.redeem_beta_pass(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_beta_pass(uuid, text) to service_role;
