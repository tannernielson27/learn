-- Every table the Data API lets a signed-in user write is either charged or named (#161).
--
-- #123 moved the authoring limit to the write: AFTER triggers on items, case_studies,
-- item_versions and case_study_items call private.charge_authoring_action. That protects those
-- four tables and nothing else. A future table with an `authors manage <x>` policy and no charge
-- trigger would be writable through PostgREST without spending anything, and no test would
-- notice. This one does: it lists every (table, command) the `authenticated` role can write and
-- fails on any that is neither charged nor on the allowlist below, with a reason.
--
-- Runs with `pnpm exec supabase test db`. Reads the catalog only, except for the scratch table in
-- the last section, which the closing rollback removes with everything else.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ---------------------------------------------------------------------------
-- What "writable by authenticated" means here
-- ---------------------------------------------------------------------------
--
-- A (table, command) pair is writable when BOTH of these hold, because PostgREST needs both:
--
--   1. The privilege. `authenticated` (or a role it is a member of) holds INSERT, UPDATE or
--      DELETE on the table — for INSERT and UPDATE a grant on any one column is enough, which is
--      how profiles and bank_folders and sessions are opened (`grant update (name) ...`).
--      Without the privilege the write fails before RLS is consulted, whatever the policies say.
--
--   2. RLS lets it through. Either RLS is off on the table (every granted row is writable), or
--      `authenticated` has BYPASSRLS, or at least one PERMISSIVE policy for that command (or FOR
--      ALL) applies to `authenticated`, to a role it belongs to, or to PUBLIC. Restrictive
--      policies alone never admit a row, so they do not count.
--
-- Policies alone would be the wrong test: a policy on a table whose grant was revoked is inert.
-- Grants alone would be wrong the other way: Supabase's default privileges hand `authenticated`
-- full DML on every new public table, and RLS with no write policy is what actually closes most
-- of them. Only the pair is the Data API's real answer.
--
-- The check is per command, not per table: a table whose only trigger fires on INSERT is still
-- uncharged for UPDATE and DELETE, and fails here if those are writable.
--
-- Schemas: everything except Postgres's own and the ones Supabase manages (auth, storage,
-- realtime, ...), whose tables this repo does not own. A new schema of ours is covered without
-- editing this file. Temporary tables are skipped; they belong to one session.
--
-- Not covered: views. There are none in this repo today; an auto-updatable security-definer view
-- over an uncharged table would write through its owner and never appear as a writable table here.
-- A future view should get its own line in this test.

create temporary view write_coverage as
with candidate as (
  select c.oid, n.nspname as schema_name, c.relname as table_name, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and c.relpersistence <> 't'
    and n.nspname not like 'pg\_%'
    and n.nspname not in (
      'information_schema', 'auth', 'storage', 'realtime', '_realtime', 'extensions', 'graphql',
      'graphql_public', 'vault', 'pgsodium', 'pgsodium_masks', 'net', 'supabase_functions',
      'supabase_migrations', 'cron', 'pgbouncer', '_analytics'
    )
),
command(cmd, polcmd, tgbit) as (
  -- pg_policy.polcmd codes and the pg_trigger.tgtype bit for each command.
  values ('INSERT', 'a', 4), ('UPDATE', 'w', 16), ('DELETE', 'd', 8)
),
writable as (
  select cand.oid, cand.schema_name, cand.table_name, command.cmd, command.tgbit
  from candidate cand
  cross join command
  where
    -- 1. the privilege, table-wide or on any one column
    case command.cmd
      when 'DELETE' then has_table_privilege('authenticated', cand.oid, 'DELETE')
      else has_any_column_privilege('authenticated', cand.oid, command.cmd)
    end
    -- 2. RLS lets a row through
    and (
      not cand.relrowsecurity
      or (select r.rolbypassrls from pg_roles r where r.rolname = 'authenticated')
      or exists (
        select 1
        from pg_policy p
        where p.polrelid = cand.oid
          and p.polpermissive
          and p.polcmd in ('*', command.polcmd)
          and exists (
            select 1 from unnest(p.polroles) as pr(role_oid)
            where pr.role_oid = 0  -- PUBLIC
               or pg_has_role('authenticated', pr.role_oid, 'MEMBER')
          )
      )
    )
)
-- How a charge is detected: by what the trigger function DOES, not what the trigger is called.
-- A trigger counts when it is enabled (tgenabled <> 'D'), is not an internal constraint trigger,
-- fires on this command (its tgtype bit), and its function's source calls
-- private.charge_authoring_action( — line comments stripped first, so a function that merely
-- mentions the name in a comment does not pass. The `_charge_authoring` naming convention is
-- ignored on purpose: a well-named trigger on a function that charges nothing must still fail,
-- and a correctly charging trigger with an unusual name must still pass. Limitation, said out
-- loud: a function that charges only indirectly (through a helper) is not seen, and would have to
-- be allowlisted or call the charge directly.
select
  w.schema_name,
  w.table_name,
  w.cmd,
  exists (
    select 1
    from pg_trigger t
    join pg_proc f on f.oid = t.tgfoid
    where t.tgrelid = w.oid
      and not t.tgisinternal
      and t.tgenabled <> 'D'
      and (t.tgtype & w.tgbit) <> 0
      and regexp_replace(f.prosrc, '--[^\n]*', '', 'g')
          ~* 'private\s*\.\s*charge_authoring_action\s*\('
  ) as charged
from writable w;

-- ---------------------------------------------------------------------------
-- The allowlist: writable, deliberately not charged, and why
-- ---------------------------------------------------------------------------
--
-- Every entry is a table `authenticated` can write today and that is not one of the four
-- authoring actions. Adding a table here is a decision, so it needs a reason a reviewer can
-- argue with. Entries rot in two ways, and both fail below: the table stops being writable (or
-- stops existing), or it gains a charge trigger for every command it is writable for.
--
-- Tables that look like candidates but are NOT here, because `authenticated` cannot write them at
-- all and so the stale check would refuse them: orgs (all DML revoked), participants,
-- session_responses and session_item_aggregates (select only; written by definer RPCs),
-- live.session_public_state (select only; written by a trigger), and private.rate_limits,
-- private.code_lookups, private.session_submits, private.session_views (all privileges revoked;
-- the counters are written only by security-definer functions). If one of those ever becomes
-- directly writable, this test fails until someone decides whether it is authoring.

create temporary table uncharged_allowlist (
  schema_name text not null,
  table_name text not null,
  reason text not null check (length(reason) > 20),
  primary key (schema_name, table_name)
);

insert into uncharged_allowlist (schema_name, table_name, reason) values
  ('public', 'item_banks',
   'Banks are outside the four authoring actions (save, publish, import, step); #123 kept them '
   'uncounted on purpose. A bank is a container an author makes rarely, it is bounded by RLS to '
   'the author''s own org, and charging it `save` would spend the editor''s save budget on '
   'housekeeping.'),
  ('public', 'bank_folders',
   'Folders are outside the four authoring actions, as #123 says of item_banks and bank_folders '
   'together. Updates are limited to the name column; moving content between folders writes '
   'items and case_studies, which are charged.'),
  ('public', 'profiles',
   'Not authoring. A user may rename themselves (update of display_name only, own row only); no '
   'insert or delete. It holds one row per user and has nothing to amplify.'),
  ('public', 'classes',
   'Classes (#205) are a name and an invite link, outside the four authoring actions. Insert and '
   'update are limited to the name column; the org, creator and token come from defaults, and the '
   'token changes only through rotate_class_invite. An author makes a class a term, not a minute.'),
  ('public', 'class_members',
   'Roster rows (#205). Authenticated may only DELETE, and only in its own org''s classes as an '
   'author: removing a student. Nobody inserts; joining goes through the invite trigger and '
   'join_class, which count wrong tokens themselves.'),
  ('public', 'sessions',
   'Live sessions, not authoring content. Hosting inserts and pacing updates (a fixed column '
   'list) are the live path, which has its own limits (#152 view limit, per-step guards) and must '
   'not spend the author''s save budget mid-class. Delete is revoked.');

-- ---------------------------------------------------------------------------
-- The enumeration found something, so an empty result below means something
-- ---------------------------------------------------------------------------

select set_has(
  $$ select distinct schema_name::text, table_name::text from write_coverage where charged $$,
  $$ values ('public', 'items'), ('public', 'case_studies'), ('public', 'item_versions'),
            ('public', 'case_study_items') $$,
  'the four tables #123 charges are found writable and charged'
);

select is_empty(
  $$ select cmd from write_coverage
      where schema_name = 'public' and table_name = 'items' and not charged $$,
  'items is charged for insert, update and delete alike'
);

select results_eq(
  $$ select cmd::text from write_coverage
      where schema_name = 'public' and table_name = 'item_versions' order by cmd $$,
  $$ values ('INSERT') $$,
  'item_versions is writable for INSERT only, so the per-command reading of grants works'
);

-- ---------------------------------------------------------------------------
-- The two halves of the rule
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select wc.schema_name, wc.table_name, wc.cmd
       from write_coverage wc
      where not wc.charged
        and not exists (
          select 1 from uncharged_allowlist a
           where a.schema_name = wc.schema_name and a.table_name = wc.table_name)
      order by 1, 2, 3 $$,
  'every table authenticated can write is charged by private.charge_authoring_action or allowlisted'
);

select is_empty(
  $$ select a.schema_name, a.table_name
       from uncharged_allowlist a
      where not exists (
          select 1 from write_coverage wc
           where wc.schema_name = a.schema_name and wc.table_name = a.table_name) $$,
  'no allowlist entry names a table that is gone or that authenticated can no longer write'
);

select is_empty(
  $$ select a.schema_name, a.table_name
       from uncharged_allowlist a
      where exists (
          select 1 from write_coverage wc
           where wc.schema_name = a.schema_name and wc.table_name = a.table_name)
        and not exists (
          select 1 from write_coverage wc
           where wc.schema_name = a.schema_name and wc.table_name = a.table_name
             and not wc.charged) $$,
  'no allowlist entry names a table that is now fully charged'
);

-- ---------------------------------------------------------------------------
-- The test has teeth: a scratch table shaped like the one #161 fears
-- ---------------------------------------------------------------------------
--
-- Nothing here outlives this file: the whole file is one transaction and ends in rollback. (Not a
-- savepoint: rolling back to one would also roll back pgTAP's own count of the tests below.)

create table public.scratch_161 (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null
);
grant select, insert, update, delete on public.scratch_161 to authenticated;
alter table public.scratch_161 enable row level security;
create policy "authors manage scratch" on public.scratch_161
  for all to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()))
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));

select results_eq(
  $$ select wc.cmd::text
       from write_coverage wc
      where wc.table_name = 'scratch_161'
        and not wc.charged
        and not exists (
          select 1 from uncharged_allowlist a
           where a.schema_name = wc.schema_name and a.table_name = wc.table_name)
      order by 1 $$,
  $$ values ('DELETE'), ('INSERT'), ('UPDATE') $$,
  'an authors-manage table with no charge trigger is caught, for every command'
);

-- A trigger with the conventional name whose function does not charge: the name alone passes nothing.
create function public.scratch_161_no_charge() returns trigger
language plpgsql as $$
begin
  -- private.charge_authoring_action('save') is only mentioned here, never called
  return null;
end;
$$;
create trigger scratch_161_charge_authoring
  after insert or update or delete on public.scratch_161
  for each row execute function public.scratch_161_no_charge();

select is(
  (select count(*)::int from write_coverage
    where table_name = 'scratch_161' and not charged),
  3,
  'a trigger named like a charge, whose function only mentions it in a comment, does not count'
);

drop trigger scratch_161_charge_authoring on public.scratch_161;

-- A charge on INSERT only still leaves UPDATE and DELETE open.
create trigger scratch_161_charge_insert
  after insert on public.scratch_161
  for each row execute function private.charge_save_write();

select results_eq(
  $$ select cmd::text from write_coverage
      where table_name = 'scratch_161' and not charged order by 1 $$,
  $$ values ('DELETE'), ('UPDATE') $$,
  'a trigger that charges only INSERT leaves UPDATE and DELETE uncharged'
);

drop trigger scratch_161_charge_insert on public.scratch_161;

-- An unusually named trigger that really charges, on every command, passes.
create trigger scratch_161_whatever
  after insert or update or delete on public.scratch_161
  for each row execute function private.charge_save_write();

select is_empty(
  $$ select cmd from write_coverage where table_name = 'scratch_161' and not charged $$,
  'a trigger whose function calls private.charge_authoring_action covers the table, whatever its name'
);

-- Disabled, it charges nothing, so it does not count.
alter table public.scratch_161 disable trigger scratch_161_whatever;

select is(
  (select count(*)::int from write_coverage
    where table_name = 'scratch_161' and not charged),
  3,
  'a disabled charge trigger does not count'
);

-- And a table with the policy but no grant is not writable at all, so it is not asked about.
revoke insert, update, delete on public.scratch_161 from authenticated;

select is_empty(
  $$ select cmd from write_coverage where table_name = 'scratch_161' $$,
  'a policy without the privilege does not make a table writable'
);

select * from finish();
rollback;
