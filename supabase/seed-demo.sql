-- The shared demo account for the LOCAL stack only (#115). Runs after seed.sql, so the sign-up
-- trigger puts it in the seeded org as an instructor. The password is public and local-only: the
-- hosted demo user is created by hand with its own password (see docs/05).
-- Sign in with DEMO_ACCOUNT_EMAIL=demo@learn.test and DEMO_ACCOUNT_PASSWORD=learn-demo-local.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  -- Auth reads these as strings and fails on null.
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-00000000d3e0',
  'authenticated', 'authenticated', 'demo@learn.test',
  extensions.crypt('learn-demo-local', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
values (
  '00000000-0000-4000-8000-00000000d3e1', '00000000-0000-4000-8000-00000000d3e0',
  '00000000-0000-4000-8000-00000000d3e0', 'email',
  '{"sub": "00000000-0000-4000-8000-00000000d3e0", "email": "demo@learn.test", "email_verified": true}',
  now(), now(), now()
);
