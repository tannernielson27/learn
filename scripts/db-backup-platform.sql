-- #236: what our migrations add to schemas the platform owns, as SQL that re-creates it.
--
-- `supabase db dump` leaves auth, storage and realtime out of the schema, because a fresh project
-- already has them. But three things of ours live there, and a restore without them looks fine
-- and is not: no trigger on auth.users means a new account gets no profile (and an invite is never
-- accepted), and no policy on realtime.messages means no student can join a live session.
--
--   auth.users         on_auth_user_created, on_auth_user_invited (migrations 1 and 23)
--   realtime.messages  the private live channel's policies (migration 17)
--
-- It is generated from the catalog rather than listed, so a later migration that adds another
-- trigger or policy there is carried without anyone remembering to. Triggers are those whose
-- function lives in one of our schemas; the platform's own call platform functions. Every policy
-- on those schemas is carried, since a fresh project has none of its own there. The output is
-- idempotent: CREATE OR REPLACE TRIGGER, and DROP POLICY IF EXISTS before each CREATE POLICY.
--
-- Run with `psql -X -q -At -v ON_ERROR_STOP=1 -f` so only the statements are printed.
set search_path = '';

select replace(pg_get_triggerdef(t.oid), 'CREATE TRIGGER ', 'CREATE OR REPLACE TRIGGER ') || ';'
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace tn on tn.oid = c.relnamespace
join pg_proc f on f.oid = t.tgfoid
join pg_namespace fn on fn.oid = f.pronamespace
where tn.nspname in ('auth', 'storage', 'realtime')
  and fn.nspname in ('public', 'private', 'live')
  and not t.tgisinternal
order by tn.nspname, c.relname, t.tgname;

select format(
  E'DROP POLICY IF EXISTS %I ON %I.%I;\nCREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
  p.policyname, p.schemaname, p.tablename,
  p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd,
  (select string_agg(case when r = 'public' then 'public' else quote_ident(r) end, ', ') from unnest(p.roles) r),
  coalesce(E'\n  USING (' || p.qual || ')', ''),
  coalesce(E'\n  WITH CHECK (' || p.with_check || ')', '')
)
from pg_policies p
where p.schemaname in ('auth', 'storage', 'realtime')
order by p.schemaname, p.tablename, p.policyname;
