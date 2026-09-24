-- #236: run against the NEW project, after roles.sql and before schema.sql (docs/05 §7.10).
--
-- A fresh Supabase project has default privileges for `postgres` in `public` that grant ALL on
-- every new table, sequence and function to anon, authenticated and service_role. pg_dump writes
-- each object's grants as a difference from Postgres's own default, not from those, so without
-- this step every table restored by schema.sql comes back with ALL (TRUNCATE included, which row
-- level security does not stop) for anon, and every function our migrations closed to anon
-- (#233) is open again. Checked on the local stack: 99 grants wider than the source.
--
-- This removes those defaults for our schemas, so each restored object gets exactly the grants
-- the dump lists. schema.sql then puts back the source project's own default privileges, which
-- it carries as ALTER DEFAULT PRIVILEGES statements at its end.
--
-- Only defaults FOR ROLE postgres matter: default privileges apply to objects the named role
-- creates, and the restore runs as postgres, so it creates every object. (Defaults for
-- supabase_admin cannot be changed by postgres on a hosted project, and do not apply here.)
-- `private` and `live` do not exist yet when this runs, so today only `public` matches; they are
-- listed so that a project that somehow has them is handled the same way.
do $$
declare
  d record;
begin
  for d in
    select n.nspname,
           case a.defaclobjtype
             when 'r' then 'tables'
             when 'S' then 'sequences'
             when 'f' then 'functions'
             when 'T' then 'types'
           end as kind
    from pg_default_acl a
    join pg_namespace n on n.oid = a.defaclnamespace
    where a.defaclrole = 'postgres'::regrole
      and n.nspname in ('public', 'private', 'live')
      and a.defaclobjtype in ('r', 'S', 'f', 'T')
  loop
    execute format(
      'alter default privileges for role postgres in schema %I revoke all on %s from anon, authenticated, service_role',
      d.nspname, d.kind
    );
  end loop;
end
$$;
