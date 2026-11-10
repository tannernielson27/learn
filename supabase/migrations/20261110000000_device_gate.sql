-- The staging device gate (ADR 0017): the passkeys of the devices allowed to open
-- staging.learnursing.app, and the one-time links that add a device.
--
-- Only the staging project (`learn`) ever holds rows. The migration runs on production too, like
-- every migration, and production's tables stay empty: the app reads them only on the staging
-- host (src/lib/deviceGate/config.ts).
--
-- Everything is the server's (service_role) and nobody else's:
--
-- public.device_gate_add_device(p_name, p_credential_id, p_public_key, p_counter, p_transports,
--                               p_invite_hash)                               SERVICE ROLE ONLY
--   returns uuid, the new device. With p_invite_hash, the invite must be unused and unexpired; it
--   is used up in the same statement, so one link adds one device. Without it, the caller has
--   already checked the enrollment code. Raises 22023 for a bad argument and P0001
--   'invite_invalid' for an invite that cannot be used.
-- public.device_gate_credential(p_credential_id)                          SERVICE ROLE ONLY
--   returns the device id, public key, counter and transports of an unrevoked device, or no row.
-- public.device_gate_record_use(p_device_id, p_counter)                  SERVICE ROLE ONLY
--   returns whether the device is still active; when it is, stores the counter and the time.
-- public.device_gate_device_active(p_device_id)                          SERVICE ROLE ONLY
--   returns whether the device exists and is not revoked. The proxy asks on every request.
-- public.device_gate_list_devices()                                      SERVICE ROLE ONLY
--   every device, newest first, without its key.
-- public.device_gate_revoke_device(p_device_id)                          SERVICE ROLE ONLY
--   returns whether a device was revoked by this call.
-- public.device_gate_create_invite(p_token_hash, p_created_by, p_ttl_seconds) SERVICE ROLE ONLY
--   returns the invite's expiry. The token itself is never stored, only its sha-256.
-- public.device_gate_invite_open(p_token_hash)                           SERVICE ROLE ONLY
--   returns whether an invite can still be used.

create table if not exists private.device_gate_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  -- WebAuthn's credential id and COSE public key, both base64url.
  credential_id text not null unique check (credential_id ~ '^[A-Za-z0-9_-]{16,1366}$'),
  public_key text not null check (public_key ~ '^[A-Za-z0-9_-]{16,2048}$'),
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

comment on table private.device_gate_devices is
  'Passkeys of the devices allowed to open the staging site (ADR 0017). Read and written only by '
  'the device_gate_* functions.';

create table if not exists private.device_gate_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references private.device_gate_devices (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references private.device_gate_devices (id) on delete set null
);

comment on table private.device_gate_invites is
  'One-time links that add a device to the staging gate (ADR 0017). Only the sha-256 of each '
  'token is kept.';

create index if not exists device_gate_invites_created_by_idx
  on private.device_gate_invites (created_by);
create index if not exists device_gate_invites_used_by_idx
  on private.device_gate_invites (used_by);

alter table private.device_gate_devices enable row level security;
alter table private.device_gate_invites enable row level security;
revoke all on private.device_gate_devices from public, anon, authenticated, service_role;
revoke all on private.device_gate_invites from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Adding a device
-- ---------------------------------------------------------------------------

create or replace function public.device_gate_add_device(
  p_name text,
  p_credential_id text,
  p_public_key text,
  p_counter bigint,
  p_transports text[],
  p_invite_hash text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  clean_name text := btrim(coalesce(p_name, ''));
  invite_id uuid;
  new_id uuid;
begin
  if length(clean_name) not between 1 and 60 then
    raise exception 'the device name must be 1 to 60 characters' using errcode = '22023';
  end if;
  if coalesce(p_counter, -1) < 0 then
    raise exception 'the counter must be zero or more' using errcode = '22023';
  end if;

  if p_invite_hash is not null then
    update private.device_gate_invites i
       set used_at = now()
     where i.token_hash = p_invite_hash
       and i.used_at is null
       and i.expires_at > now()
    returning i.id into invite_id;
    if invite_id is null then
      raise exception 'invite_invalid';
    end if;
  end if;

  insert into private.device_gate_devices (name, credential_id, public_key, counter, transports)
  values (clean_name, p_credential_id, p_public_key, p_counter, coalesce(p_transports, '{}'))
  returning id into new_id;

  if invite_id is not null then
    update private.device_gate_invites set used_by = new_id where id = invite_id;
  end if;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Unlocking
-- ---------------------------------------------------------------------------

create or replace function public.device_gate_credential(p_credential_id text)
returns table (device_id uuid, public_key text, counter bigint, transports text[])
language sql stable security definer set search_path = ''
as $$
  select d.id, d.public_key, d.counter, d.transports
    from private.device_gate_devices d
   where d.credential_id = p_credential_id
     and d.revoked_at is null;
$$;

create or replace function public.device_gate_record_use(p_device_id uuid, p_counter bigint)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update private.device_gate_devices d
     set counter = greatest(d.counter, coalesce(p_counter, 0)),
         last_used_at = now()
   where d.id = p_device_id
     and d.revoked_at is null;
  return found;
end;
$$;

create or replace function public.device_gate_device_active(p_device_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.device_gate_devices d
     where d.id = p_device_id and d.revoked_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Managing devices and invites
-- ---------------------------------------------------------------------------

create or replace function public.device_gate_list_devices()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select d.id, d.name, d.created_at, d.last_used_at, d.revoked_at
    from private.device_gate_devices d
   order by d.created_at desc;
$$;

create or replace function public.device_gate_revoke_device(p_device_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update private.device_gate_devices d
     set revoked_at = now()
   where d.id = p_device_id
     and d.revoked_at is null;
  return found;
end;
$$;

create or replace function public.device_gate_create_invite(
  p_token_hash text,
  p_created_by uuid,
  p_ttl_seconds integer
) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  expiry timestamptz;
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'the token digest must be 64 lower-case hex digits' using errcode = '22023';
  end if;
  if coalesce(p_ttl_seconds, 0) not between 60 and 604800 then
    raise exception 'an invite lasts between a minute and a week' using errcode = '22023';
  end if;
  insert into private.device_gate_invites (token_hash, created_by, expires_at)
  values (p_token_hash, p_created_by, now() + make_interval(secs => p_ttl_seconds))
  returning expires_at into expiry;
  return expiry;
end;
$$;

create or replace function public.device_gate_invite_open(p_token_hash text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.device_gate_invites i
     where i.token_hash = p_token_hash and i.used_at is null and i.expires_at > now()
  );
$$;

revoke all on function public.device_gate_add_device(text, text, text, bigint, text[], text)
  from public, anon, authenticated;
revoke all on function public.device_gate_credential(text) from public, anon, authenticated;
revoke all on function public.device_gate_record_use(uuid, bigint) from public, anon, authenticated;
revoke all on function public.device_gate_device_active(uuid) from public, anon, authenticated;
revoke all on function public.device_gate_list_devices() from public, anon, authenticated;
revoke all on function public.device_gate_revoke_device(uuid) from public, anon, authenticated;
revoke all on function public.device_gate_create_invite(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.device_gate_invite_open(text) from public, anon, authenticated;

grant execute on function public.device_gate_add_device(text, text, text, bigint, text[], text)
  to service_role;
grant execute on function public.device_gate_credential(text) to service_role;
grant execute on function public.device_gate_record_use(uuid, bigint) to service_role;
grant execute on function public.device_gate_device_active(uuid) to service_role;
grant execute on function public.device_gate_list_devices() to service_role;
grant execute on function public.device_gate_revoke_device(uuid) to service_role;
grant execute on function public.device_gate_create_invite(text, uuid, integer) to service_role;
grant execute on function public.device_gate_invite_open(text) to service_role;
