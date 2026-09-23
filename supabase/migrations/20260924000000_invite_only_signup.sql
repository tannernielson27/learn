-- Invite-only sign-up (#204). Owner decision 2026-09-23: nobody becomes an instructor by signing in.
--
-- Until now `private.handle_new_user` made every new auth user an instructor in the single org
-- (20260913000000_authoring_schema.sql said this is where tightening it would go). Since #139/#157
-- sign-in never creates an account (`shouldCreateUser: false`), so a new auth user comes from one of
-- two places, both server-side:
--
--   1. The owner's dashboard, Authentication > Users > Add user.
--   2. From #205 on, a class-invite route that creates the user with the admin API (service role).
--
-- From here on the trigger gives every new account a profile with NO org and NO role. Such an
-- account passes no `private.is_author()` check, so row level security already shows it nothing;
-- the app sends it to "No access yet". An instructor is made on purpose, in two steps: Add user,
-- then `select private.make_instructor('<their address>');` in the SQL editor (docs/05 §7.3).
--
-- The invite seam for #205
-- ------------------------
-- The only metadata the trigger may ever trust is `raw_app_meta_data` (app_metadata). It is
-- writable only with the service role. `raw_user_meta_data` (user_metadata) is the client's to
-- write, through `auth.updateUser` or sign-up options, and must never decide anything here.
--
-- The shape #205 sets through `auth.admin.createUser({ email, app_metadata: { ... } })`:
--
--     { "learn_invite": { "class_id": "<uuid of public.classes row>" } }
--
-- In THIS migration the key grants nothing: there is no classes table yet, so there is nothing to
-- check the class id against, and the conservative rule for #204 is that nothing grants a role
-- automatically. #205 replaces this function to read `new.raw_app_meta_data -> 'learn_invite' ->>
-- 'class_id'`, check the class exists, and give the account the role and org that class implies
-- (a student, never an author). supabase/tests/database/invite_only_signup.test.sql pins that the
-- key alone grants nothing today; #205 changes that assertion in the same PR as this function.
--
-- Existing profiles are not touched: this replaces an AFTER INSERT trigger's function, so no row
-- that already exists is re-evaluated, and the demo account and every current author keep their
-- role. Safe to replay on a fresh project: `create or replace` and a revoke, nothing data-bound.

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- #205 seam: `new.raw_app_meta_data -> 'learn_invite'` is read here once classes exist.
  -- Never `new.raw_user_meta_data`: the client writes that.
  insert into public.profiles (id, org_id, role) values (new.id, null, null);
  return new;
end
$$;

-- The owner's one line for adding an instructor, after Add user:
--
--     select private.make_instructor('person@example.com');
--
-- Finds the account by address (any letter case), puts it in the first org if it has none (making
-- that org on a project that has none, as the old trigger did), and makes it an instructor. An
-- admin stays an admin. An address with no account raises, so a typo is not a silent success.
-- Not callable by anon, authenticated or service_role: it is for the owner in the SQL editor.
create function private.make_instructor(account_email text) returns void
language plpgsql set search_path = ''
as $$
declare
  account uuid;
  target_org uuid;
begin
  select id into account from auth.users where lower(email) = lower(trim(account_email));
  if account is null then
    raise exception 'no account has the address %', account_email
      using errcode = 'no_data_found',
            hint = 'Add the user first: dashboard > Authentication > Users > Add user.';
  end if;

  -- Serialized like the old trigger, so two promotions at once cannot each create an org.
  perform pg_advisory_xact_lock(hashtext('learn.default_org'));
  select id into target_org from public.orgs order by created_at, id limit 1;
  if target_org is null then
    insert into public.orgs (name) values ('LeaRN') returning id into target_org;
  end if;

  insert into public.profiles (id, org_id, role)
  values (account, target_org, 'instructor')
  on conflict (id) do update
    set org_id = coalesce(public.profiles.org_id, excluded.org_id),
        role = case when public.profiles.role = 'admin' then public.profiles.role
                    else excluded.role end;
end
$$;

revoke all on function private.make_instructor(text) from public, anon, authenticated, service_role;
