-- The staging device gate (ADR 0017): passkeys of the devices allowed to open the staging site,
-- and the one-time links that add a device.
--
-- What is held here:
--   1. Structure and privileges: RLS on both tables and no client privilege on them; every
--      function is the server's (service_role) and nobody else's.
--   2. Adding: a device is stored with a trimmed name; a bad name or counter is refused; a
--      credential cannot be registered twice.
--   3. Invites: an open invite adds exactly one device and is then used; a used, expired or
--      unknown invite is refused and adds nothing; a bad digest or lifetime is refused.
--   4. Unlocking: an active device's credential is found and its use recorded; a revoked one is
--      neither found, recorded nor active; revoking twice revokes nothing the second time.
--   5. Listing: every device, revoked ones too, never the key.
--   6. Clients: a signed-in user and anon can neither read the tables nor call the functions.
--
-- Runs with `pnpm test:db`. The closing rollback removes everything it made.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------------------------------------------------------------------------
-- 1. Structure and privileges
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'private.device_gate_devices'::regclass),
  'device_gate_devices has row level security on'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'private.device_gate_invites'::regclass),
  'device_gate_invites has row level security on'
);
select ok(
  not has_table_privilege('authenticated', 'private.device_gate_devices', 'select'),
  'a signed-in user cannot read the devices'
);
select ok(
  not has_table_privilege('service_role', 'private.device_gate_devices', 'select'),
  'not even the server reads the devices table directly: only through the functions'
);

select is_empty(
  $$
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'device\_gate\_%'
       and (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute')
            or not has_function_privilege('service_role', p.oid, 'execute'))
  $$,
  'every device_gate_ function is the server''s alone'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'device\_gate\_%'),
  8,
  'eight device_gate_ functions'
);

-- ---------------------------------------------------------------------------
-- 2. Adding a device with the enrollment code (no invite)
-- ---------------------------------------------------------------------------

create temporary table ids (label text primary key, id uuid) on commit drop;
grant all on ids to service_role;

set local role service_role;

insert into ids values ('laptop', public.device_gate_add_device(
  '  Tanner laptop  ', 'credentialLaptop0001', 'publicKeyLaptop00001', 0, '{internal}', null));

select is(
  (select name from public.device_gate_list_devices() where id = (select id from ids where label = 'laptop')),
  'Tanner laptop',
  'the name is stored trimmed'
);

select throws_ok(
  $$ select public.device_gate_add_device('   ', 'credentialBlankName01', 'publicKeyBlankName001', 0, '{}', null) $$,
  '22023', null, 'a blank name is refused'
);
select throws_ok(
  $$ select public.device_gate_add_device(repeat('x', 61), 'credentialLongName001', 'publicKeyLongName0001', 0, '{}', null) $$,
  '22023', null, 'a name over 60 characters is refused'
);
select throws_ok(
  $$ select public.device_gate_add_device('Phone', 'credentialNegative01', 'publicKeyNegative001', -1, '{}', null) $$,
  '22023', null, 'a negative counter is refused'
);
select throws_ok(
  $$ select public.device_gate_add_device('Again', 'credentialLaptop0001', 'publicKeyLaptopAgain1', 0, '{}', null) $$,
  '23505', null, 'the same credential cannot be registered twice'
);
select throws_ok(
  $$ select public.device_gate_add_device('Bad id', 'not a credential!', 'publicKeyBadId000001', 0, '{}', null) $$,
  '23514', null, 'a credential id that is not base64url is refused'
);

-- ---------------------------------------------------------------------------
-- 3. Invites
-- ---------------------------------------------------------------------------

select isnt(
  public.device_gate_create_invite(repeat('a', 64), (select id from ids where label = 'laptop'), 3600),
  null,
  'an invite is created with an expiry'
);
select ok(public.device_gate_invite_open(repeat('a', 64)), 'a new invite is open');

insert into ids values ('phone', public.device_gate_add_device(
  'Phone', 'credentialPhone00001', 'publicKeyPhone000001', 0, '{hybrid}', repeat('a', 64)));
select isnt((select id from ids where label = 'phone'), null, 'the invite adds a device');
select ok(not public.device_gate_invite_open(repeat('a', 64)), 'the invite is used up');

select throws_ok(
  $$ select public.device_gate_add_device('Tablet', 'credentialTablet0001', 'publicKeyTablet00001', 0, '{}', repeat('a', 64)) $$,
  'P0001', 'invite_invalid', 'a used invite is refused'
);
select throws_ok(
  $$ select public.device_gate_add_device('Tablet', 'credentialTablet0001', 'publicKeyTablet00001', 0, '{}', repeat('b', 64)) $$,
  'P0001', 'invite_invalid', 'an unknown invite is refused'
);
select is(
  (select count(*)::integer from public.device_gate_list_devices() where name = 'Tablet'),
  0,
  'a refused invite adds no device'
);

-- An expired invite, made by moving one back in time as the superuser.
reset role;
insert into private.device_gate_invites (token_hash, expires_at)
values (repeat('c', 64), now() - interval '1 minute');
set local role service_role;

select ok(not public.device_gate_invite_open(repeat('c', 64)), 'an expired invite is not open');
select throws_ok(
  $$ select public.device_gate_add_device('Tablet', 'credentialTablet0001', 'publicKeyTablet00001', 0, '{}', repeat('c', 64)) $$,
  'P0001', 'invite_invalid', 'an expired invite is refused'
);
select throws_ok(
  $$ select public.device_gate_create_invite('not-a-digest', null, 3600) $$,
  '22023', null, 'an invite digest that is not 64 hex digits is refused'
);
select throws_ok(
  $$ select public.device_gate_create_invite(repeat('d', 64), null, 30) $$,
  '22023', null, 'an invite shorter than a minute is refused'
);

-- ---------------------------------------------------------------------------
-- 4. Unlocking and revoking
-- ---------------------------------------------------------------------------

select is(
  (select device_id from public.device_gate_credential('credentialPhone00001')),
  (select id from ids where label = 'phone'),
  'an active device''s credential is found'
);
select ok(
  public.device_gate_record_use((select id from ids where label = 'phone'), 7),
  'its use is recorded'
);

select ok(
  public.device_gate_revoke_device((select id from ids where label = 'phone')),
  'a device is revoked'
);
select ok(
  not public.device_gate_revoke_device((select id from ids where label = 'phone')),
  'revoking it again revokes nothing'
);
select ok(
  not public.device_gate_device_active((select id from ids where label = 'phone'))
    and not exists (select 1 from public.device_gate_credential('credentialPhone00001'))
    and not public.device_gate_record_use((select id from ids where label = 'phone'), 8),
  'a revoked device is not active, its credential is not found and its use is not recorded'
);

-- ---------------------------------------------------------------------------
-- 5. Listing
-- ---------------------------------------------------------------------------

-- Both were made in this transaction, so they share a created_at; the order is not tested here.
select is(
  (select array_agg(name order by name) from public.device_gate_list_devices()),
  array['Phone', 'Tanner laptop'],
  'every device is listed, revoked ones included'
);

-- ---------------------------------------------------------------------------
-- 6. Clients
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select throws_ok(
  $$ select public.device_gate_list_devices() $$,
  '42501', null, 'a signed-in user cannot list devices'
);

reset role;
set local role anon;
select throws_ok(
  $$ select public.device_gate_device_active(gen_random_uuid()) $$,
  '42501', null, 'anon cannot ask whether a device is active'
);

reset role;
select * from finish();
rollback;
