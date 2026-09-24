-- Catalog guard for the three rules the S10 security audit rests on (#233).
--
-- docs/audits/S10-security.md checks every table, security definer function and route by hand.
-- That is a snapshot. This file is the part that stays true without anyone remembering: it reads
-- the catalog, so a migration that adds a table without RLS, a definer function without a fixed
-- search_path, or a function `anon` can call fails CI before it merges.
--
--   1. Every table in public, live and private has row level security on. With RLS off, any grant
--      (Supabase's default privileges hand `anon` and `authenticated` full DML on new public
--      tables) opens every row. A view has no RLS of its own, so every view must run as the
--      caller (security_invoker), or it reads the underlying tables as its owner.
--   2. Every security definer function in those schemas pins search_path in proconfig, to the
--      empty string the rest of the codebase uses. Without it, a caller who can create objects on
--      the search path can shadow a table or operator the function uses and run code as its owner.
--   3. `anon` (the publishable key, before sign-in) may execute only the functions on the allow
--      list below, and has no USAGE on `private`. Everything a signed-out visitor needs goes
--      through a server route using the secret key, so the list is empty today. Add a function
--      here only with a reason next to it.
--
-- Runs with `pnpm exec supabase test db`. Reads the catalog only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- ---------------------------------------------------------------------------
-- 1. Row level security
-- ---------------------------------------------------------------------------

select is_empty(
  $$
    select n.nspname || '.' || c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'live', 'private')
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
     order by 1
  $$,
  'every table in public, live and private has row level security enabled'
);

select is_empty(
  $$
    select n.nspname || '.' || c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'live', 'private')
       and c.relkind = 'v'
       and not coalesce(
         (select option_value::boolean
            from pg_options_to_table(c.reloptions)
           where option_name = 'security_invoker'),
         false)
     order by 1
  $$,
  'every view in public, live and private runs as the caller (security_invoker)'
);

-- ---------------------------------------------------------------------------
-- 2. search_path on security definer functions
-- ---------------------------------------------------------------------------

select is_empty(
  $$
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'live', 'private')
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) as setting
          where setting like 'search_path=%'
       )
     order by 1
  $$,
  'every security definer function in public, live and private sets search_path'
);

select is_empty(
  $$
    select p.oid::regprocedure::text || ' ' || setting
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral unnest(coalesce(p.proconfig, '{}')) as setting
     where n.nspname in ('public', 'live', 'private')
       and p.prosecdef
       and setting like 'search_path=%'
       and setting <> 'search_path=""'
     order by 1
  $$,
  'every security definer function pins search_path to the empty string and qualifies its names'
);

-- ---------------------------------------------------------------------------
-- 3. What anon can execute
-- ---------------------------------------------------------------------------
--
-- has_function_privilege counts grants to PUBLIC as well as to anon, which is the point: a
-- function created without `revoke ... from public` is callable by anon, and Supabase also grants
-- anon EXECUTE on new functions in public by default.

select is_empty(
  $$
    with allowed (signature, reason) as (
      -- Empty on purpose. Add rows as ('schema.name(argtypes)', 'why a signed-out caller needs it').
      select null::text, null::text where false
    )
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'live', 'private')
       and has_function_privilege('anon', p.oid, 'execute')
       and p.oid::regprocedure::text not in (select signature from allowed)
     order by 1
  $$,
  'anon can execute no function in public, live or private outside the allow list'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon has no USAGE on the private schema'
);

select * from finish();
rollback;
