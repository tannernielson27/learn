-- Billing enforcement in the database, behind private.billing_config.enforced (#521, milestone
-- S15: Billing, ADR 0016 "Enforced in the app and in the database", "Shipping dark").
--
-- PUSHING THIS CHANGES NOTHING A TEACHER OR STUDENT CAN DO while billing_config.enforced is false,
-- which it is by default (20261027000000). Every gate below is `private.write_allowed()`, which
-- is true whenever enforcement is off. Turning it on is the owner's one-row update, together with
-- BILLING_ENFORCED=true on Vercel (docs/05 §7.15), and needs no code change and no migration.
--
-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------
--
-- private.org_write_allowed(p_org uuid) returns boolean                          OWNER ONLY
--   True when billing_config.enforced is false, or the workspace has access
--   (private.org_has_access: an active grant, or a subscription trialing, active or past_due
--   whose livemode matches billing_config's). For definer functions and triggers, which name the
--   workspace themselves.
-- private.write_allowed() returns boolean                          authenticated, service_role
--   org_write_allowed for the caller's own workspace (false when enforced and the caller has
--   none). For the policies below. Stable, so `(select private.write_allowed())` is read once
--   per statement.
--
-- ---------------------------------------------------------------------------
-- How the policies are gated: RESTRICTIVE policies, added beside the existing ones
-- ---------------------------------------------------------------------------
--
-- Every existing policy is left exactly as it is. For each gated write this adds one
-- `as restrictive` policy whose only test is the gate. Postgres ANDs a restrictive policy with
-- the permissive ones, so a write must pass the existing policy AND the gate: nothing can be
-- loosened by it, and the existing `for all` policies (whose USING is also the read rule) need
-- not be split to gate only their writes. Reads are not gated: no restrictive policy here is
-- `for select`, so read-only is read-only.
--
--   item_banks, items, case_studies, case_study_items,
--   bank_folders, library_folders                       insert, update, delete
--   item_versions                                       insert (the only write it allows)
--   classes                                             insert, update
--   class_members                                       delete (the teacher's Remove)
--   assignments                                         insert, update, delete
--   bank_practice_shares                                insert, delete
--   sessions                                            insert ONLY: starting a live session.
--                                                       Running one (advance, reveal, timers,
--                                                       end) is an update and is not gated, so a
--                                                       session already running runs to its end.
--   ai_import_batches                                   insert, update, delete
--   ai_import_entries                                   update
--   storage.objects in bucket ai-imports                insert
--
-- The SECURITY INVOKER functions teachers call write through these tables under RLS, so they are
-- gated by the policies without being restated: start_session (sessions insert), duplicate_item,
-- duplicate_case_study, import_bank_content, import_sample_bank, start_case_study_step,
-- place_case_study_step, reorder_case_study_steps, reorder_quiz, move_to_folder, move_to_quiz,
-- private.move_quiz_content, turn_folder_into_quiz, archive_* and restore_*. A refused insert
-- raises 42501; a refused update or delete matches no row, which each function already treats as
-- "not found".
--
-- SECURITY DEFINER functions bypass RLS, so each that creates or changes teacher content checks
-- the gate itself:
--   rotate_class_invite   restated below with the gate (42501).
--   import_ai_batch       a trigger on ai_import_batches refuses the batch's move to 'imported'
--                         (42501), which rolls back everything the import wrote.
--   create_org_invite     a trigger on org_invites refuses a new invitation (42501), for every
--                         path that makes one.
-- Not gated: revoke_org_invite and remove_org_member (they take access away, and a removed
-- teacher must be free to go), refresh_participant_count (running a session), mark_onboarded.
--
-- ---------------------------------------------------------------------------
-- Students are never gated
-- ---------------------------------------------------------------------------
--
-- No student path reads the gate: join_class, join_class_by_code, start_assignment_attempt,
-- save_attempt_response, begin_attempt_submission, record_attempt_submission, the practice and
-- live functions are SECURITY DEFINER or service-role only and touch none of the gated policies
-- or triggers. Open assignments run to their close; shared practice keeps working.
--
-- ---------------------------------------------------------------------------
-- The sweep, moving and removing (ADR 0016 "What it changes in earlier ADRs")
-- ---------------------------------------------------------------------------
--
--   * private.workspace_sweep_blocker: a workspace with a workspace_billing row (any status, any
--     mode) or any access_grants row (revoked or not) is skipped with reason 'billing', by either
--     rule. The sweep reads the blocker when it lists and again under the locks. The sweep is the
--     only path that deletes a workspace (nothing in the app does), so no workspace with a Stripe
--     customer is ever deleted and no subscription is left billing a deleted workspace.
--   * private.org_move_refusal: a founder whose workspace has a subscription trialing, active or
--     past_due (any livemode: it bills in Stripe either way) is refused with 'has_subscription'
--     until it is cancelled. accept_org_invite and org_invite_move_preview both ask it.
--   * remove_org_member's new workspace is made by private.found_workspace, which makes no grant;
--     nothing here changes that (the test holds it).
--
-- Safe to replay: functions are `create or replace` with grants restated, policies and triggers
-- are dropped if they exist and made again.

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------

create or replace function private.org_write_allowed(p_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not coalesce((select c.enforced from private.billing_config c where c.id), false)
      or coalesce(private.org_has_access(p_org), false);
$$;

revoke all on function private.org_write_allowed(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.write_allowed() returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.org_write_allowed((select private.current_org_id()));
$$;

revoke all on function private.write_allowed() from public, anon;
grant execute on function private.write_allowed() to authenticated, service_role;

comment on function private.write_allowed() is
  'Billing gate (#521): true unless billing_config.enforced and the caller''s workspace has no '
  'access. Restrictive write policies on teacher tables read it.';

-- Raises 42501 when the row's workspace may not write. For definer paths, which bypass RLS.
create or replace function private.billing_write_gate() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.org_write_allowed(new.org_id) then
    raise exception 'this workspace has no subscription, so nothing can be created or changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.billing_write_gate()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Restrictive policies
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  -- Tables whose every write is a teacher's authoring.
  foreach t in array array['item_banks', 'items', 'case_studies', 'case_study_items',
                           'bank_folders', 'library_folders', 'assignments',
                           'ai_import_batches'] loop
    execute format('drop policy if exists "billing: insert needs access" on public.%I', t);
    execute format('drop policy if exists "billing: update needs access" on public.%I', t);
    execute format('drop policy if exists "billing: delete needs access" on public.%I', t);
    execute format(
      'create policy "billing: insert needs access" on public.%I as restrictive '
      'for insert to authenticated with check ((select private.write_allowed()))', t);
    execute format(
      'create policy "billing: update needs access" on public.%I as restrictive '
      'for update to authenticated using ((select private.write_allowed())) '
      'with check ((select private.write_allowed()))', t);
    execute format(
      'create policy "billing: delete needs access" on public.%I as restrictive '
      'for delete to authenticated using ((select private.write_allowed()))', t);
  end loop;

  -- Inserts only: versions are append-only, and a live session is gated where it starts.
  foreach t in array array['item_versions', 'classes', 'bank_practice_shares', 'sessions'] loop
    execute format('drop policy if exists "billing: insert needs access" on public.%I', t);
    execute format(
      'create policy "billing: insert needs access" on public.%I as restrictive '
      'for insert to authenticated with check ((select private.write_allowed()))', t);
  end loop;

  -- Updates: renaming a class or setting its time zone; editing an AI import entry.
  foreach t in array array['classes', 'ai_import_entries'] loop
    execute format('drop policy if exists "billing: update needs access" on public.%I', t);
    execute format(
      'create policy "billing: update needs access" on public.%I as restrictive '
      'for update to authenticated using ((select private.write_allowed())) '
      'with check ((select private.write_allowed()))', t);
  end loop;

  -- Deletes: removing a student from a class; stopping a practice share.
  foreach t in array array['class_members', 'bank_practice_shares'] loop
    execute format('drop policy if exists "billing: delete needs access" on public.%I', t);
    execute format(
      'create policy "billing: delete needs access" on public.%I as restrictive '
      'for delete to authenticated using ((select private.write_allowed()))', t);
  end loop;
end;
$$;

-- AI import's uploads. Only the ai-imports bucket is gated; any other bucket is untouched.
drop policy if exists "ai-imports: uploads need access" on storage.objects;
create policy "ai-imports: uploads need access" on storage.objects
  as restrictive
  for insert to authenticated
  with check (bucket_id <> 'ai-imports' or (select private.write_allowed()));

-- ---------------------------------------------------------------------------
-- Definer paths
-- ---------------------------------------------------------------------------

-- Every new invitation, whoever makes it (create_org_invite runs as the service role).
drop trigger if exists org_invites_billing_gate on public.org_invites;
create trigger org_invites_billing_gate
  before insert on public.org_invites
  for each row execute function private.billing_write_gate();

-- import_ai_batch (definer) marks the batch imported after writing its items; refusing that
-- update rolls the whole import back.
drop trigger if exists ai_import_batches_billing_gate on public.ai_import_batches;
create trigger ai_import_batches_billing_gate
  before update of status on public.ai_import_batches
  for each row
  when (new.status = 'imported' and old.status is distinct from 'imported')
  execute function private.billing_write_gate();

-- 20261006010000's function, line for line, with the gate after the role check.
create or replace function public.rotate_class_invite(target_class uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  fresh text;
begin
  if not (select private.is_author()) then
    raise exception 'only an author can rotate an invite link' using errcode = '42501';
  end if;
  if not (select private.write_allowed()) then
    raise exception 'this workspace has no subscription, so nothing can be created or changed'
      using errcode = '42501';
  end if;

  update public.classes
     set invite_token = private.new_invite_token(),
         join_code = private.new_class_join_code()
   where id = target_class and org_id = (select private.current_org_id())
  returning invite_token into fresh;

  if fresh is null then
    raise exception 'that class does not exist' using errcode = 'P0002';
  end if;
  return fresh;
end;
$$;

revoke all on function public.rotate_class_invite(uuid) from public, anon;
grant execute on function public.rotate_class_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The sweep: never a workspace with billing history or a grant
-- ---------------------------------------------------------------------------

-- 20261012000000's function, line for line, with the 'billing' check first.
create or replace function private.workspace_sweep_blocker(p_org uuid, p_rule text) returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Billing history is a record the owner may need, and a grant is the owner's own decision
  -- (ADR 0016). Any status, any mode, revoked or not.
  if exists (select 1 from public.workspace_billing b where b.org_id = p_org)
     or exists (select 1 from public.access_grants g where g.org_id = p_org) then
    return 'billing';
  end if;

  if exists (
    select 1 from public.class_members m
      join public.classes c on c.id = m.class_id
     where c.org_id = p_org
  ) then
    return 'enrolled_students';
  end if;

  -- A student with no class at all is given no role. One who is in a class, but in none of a
  -- workspace they could be pointed at, has no state that is right for them.
  if exists (
    select 1 from public.profiles p
     where p.org_id = p_org
       and p.role = 'student'
       and exists (select 1 from public.class_members m where m.profile_id = p.id)
       and not exists (
         select 1 from public.class_members m
           join public.classes c on c.id = m.class_id
           join public.orgs t on t.id = c.org_id
          where m.profile_id = p.id and c.org_id <> p_org and t.emptied_at is null
       )
  ) then
    return 'student_unsafe';
  end if;

  if p_rule = 'never_used' and exists (
    select 1 from public.profiles p
     where p.org_id = p_org
       and p.role in ('instructor', 'admin')
       and private.sweep_account_tied_elsewhere(p.id, p_org)
  ) then
    return 'teacher_tied_elsewhere';
  end if;

  return null;
end;
$$;

revoke all on function private.workspace_sweep_blocker(uuid, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Moving: not a founder whose workspace is still billed
-- ---------------------------------------------------------------------------

-- 20261011000000's function, line for line, with 'has_subscription' after 'teaches_shared'.
create or replace function private.org_move_refusal(p_user uuid, p_from uuid, p_to uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  from_open boolean;
  from_founder uuid;
begin
  if p_from = p_to then
    return 'already_member';
  end if;

  -- Accepting makes an instructor. An admin is only ever made by hand, and is not demoted here.
  if exists (select 1 from public.profiles p where p.id = p_user and p.role = 'admin') then
    return 'admin_account';
  end if;

  select o.self_registered, o.founder_id into from_open, from_founder
    from public.orgs o where o.id = p_from;
  if not coalesce(from_open, false) then
    return 'teaches_shared';
  end if;

  -- The founder manages billing: leaving would keep the workspace billed with nobody able to
  -- cancel it (ADR 0016). Any livemode, since Stripe bills it either way.
  if from_founder = p_user and exists (
    select 1 from public.workspace_billing b
     where b.org_id = p_from and b.status in ('trialing', 'active', 'past_due')
  ) then
    return 'has_subscription';
  end if;

  if exists (
    select 1 from public.profiles p
     where p.org_id = p_from and p.role in ('instructor', 'admin') and p.id <> p_user
  ) then
    -- Somebody stays. Only the founder is held: nobody else could remove the people left.
    return case when from_founder = p_user then 'founder_with_members' end;
  end if;

  -- Nobody stays, so nothing here may still need a teacher.
  if exists (
       select 1 from public.class_members m
         join public.classes c on c.id = m.class_id
        where c.org_id = p_from
     )
     or exists (
       select 1 from public.assignments a where a.org_id = p_from and a.closes_at > now()
     )
     or exists (
       select 1 from public.sessions s where s.org_id = p_from and s.status <> 'ended'
     ) then
    return 'students_depend';
  end if;

  return null;
end;
$$;

revoke all on function private.org_move_refusal(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
