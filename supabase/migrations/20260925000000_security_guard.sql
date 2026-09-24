-- The two gaps the S10 security audit found in the catalog (#233). See docs/audits/S10-security.md.
--
-- 1. private.class_removals was created without row level security. Nothing is exposed today:
--    `anon` and `authenticated` hold no privilege on it, `private` is not an exposed Data API
--    schema, and the only readers and writers (private.record_class_removal, private.admit_to_class,
--    private.is_current_member) are security definer functions owned by `postgres`, which bypasses
--    RLS. It is still the one table in public, live and private with RLS off, so a stray future
--    grant would open every row. Turning RLS on with no policy closes that and changes nothing for
--    the definer functions.
--
-- 2. Seven functions in `private` were executable by `anon`, through the default PUBLIC grant:
--    five trigger functions and the two helpers the RLS policies call. `anon` has no USAGE on
--    `private`, so none of them was reachable, but "anon can execute only what is on the allow
--    list" should be true in the catalog, not only because of a schema grant.
--      * Trigger functions need no EXECUTE grant to fire: Postgres checks it when the trigger is
--        created, not when it runs (private.guard_assignment_change already fires with no grant to
--        anyone). So PUBLIC's grant is dropped outright.
--      * private.current_org_id() and private.is_author() are called by `authenticated` policies
--        and by column defaults. `authenticated` keeps its explicit grant, and `service_role`,
--        which had them only through PUBLIC, gets an explicit one so its inserts keep working.
--
-- 3. A student's account could not be deleted once they had joined a class, and a class with
--    members could not be deleted either. Deleting either cascades to public.class_members, whose
--    AFTER DELETE trigger, private.record_class_removal, then inserted a class_removals row naming
--    the class or profile being deleted, and the foreign key refused it. The audit found this
--    while removing its own probe accounts. A removal record only matters while both the class
--    and the student still exist, so the trigger now skips the insert when either is gone.
--
-- supabase/tests/database/security_guard.test.sql keeps 1 and 2 true from here on, and
-- class_deletion.test.sql covers 3.
-- Safe to replay on a fresh project: every statement is idempotent.

alter table private.class_removals enable row level security;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.guard_archived_item() from public, anon, authenticated;
revoke all on function private.guard_archived_case_study() from public, anon, authenticated;
revoke all on function private.guard_archived_step() from public, anon, authenticated;

revoke all on function private.current_org_id() from public, anon;
revoke all on function private.is_author() from public, anon;
grant execute on function private.current_org_id() to authenticated, service_role;
grant execute on function private.is_author() to authenticated, service_role;

create or replace function private.record_class_removal() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- A cascade from deleting the class or the student's profile: the parent is already gone, and
  -- there is no one left to keep out.
  if not exists (select 1 from public.classes c where c.id = old.class_id)
     or not exists (select 1 from public.profiles p where p.id = old.profile_id) then
    return old;
  end if;

  insert into private.class_removals (class_id, profile_id)
  values (old.class_id, old.profile_id)
  on conflict do nothing;
  return old;
end;
$$;
revoke all on function private.record_class_removal() from public, anon, authenticated, service_role;
