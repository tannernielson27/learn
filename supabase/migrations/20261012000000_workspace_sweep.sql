-- A sweep that removes abandoned self-registered workspaces (ADR 0012).
--
-- ADR 0009 opened sign-up and gave every teacher a workspace; ADR 0011 let a teacher move away
-- and marked the workspace left behind (`orgs.emptied_at`). Nothing has deleted a workspace until
-- now. This migration adds the one function that does, and the function pg_cron uses to call the
-- app's route for it. Applying the migration deletes nothing: the route runs the sweep as a dry
-- run unless the deployment's WORKSPACE_SWEEP variable is exactly `delete`, and nothing calls
-- the route until the owner schedules it (docs/05 §7.13).
--
-- ---------------------------------------------------------------------------
-- Which workspaces
-- ---------------------------------------------------------------------------
--
-- Never one that is not self-registered: the shared LeaRN workspace and any org the owner made
-- by hand are not candidates, whatever else is true of them. Two kinds are:
--
--   'memberless'  `emptied_at` is more than 30 days ago and no instructor or admin profile names
--                 the workspace.
--   'never_used'  `emptied_at` is null, the workspace was made more than 90 days ago, at least
--                 one teacher is in it, and EVERY teacher in it
--                   * is an instructor (an admin is only ever made by hand, and stops the rule),
--                   * still carries `app_metadata.learn_email_unconfirmed = true`, the mark the
--                     app puts on an account made with a password and clears the first time an
--                     emailed link or code is used (src/lib/auth/emailConfirmation.ts),
--                   * has an account older than 90 days whose last sign-in is older than 90 days,
--                     and no sign-in session made, updated or refreshed in the last 90 days;
--                 and the workspace has no class with a student in it, no assignment and no live
--                 session, ever; no student ever used it either (no practice run, no bank shared
--                 for practice, and no student ever taken off one of its classes); and no bank,
--                 item, case study or class was made or changed in the last 90 days.
--
-- An account with no mark counts as confirmed, an account with no creation time counts as new,
-- and a session with no times at all counts as recent: what cannot be read stops the rule.
-- A workspace with no teacher and no `emptied_at` (its founder's account was deleted by hand) is
-- matched by neither rule and is never swept.
--
-- ---------------------------------------------------------------------------
-- What stops a deletion (the workspace is reported 'skipped', with the reason)
-- ---------------------------------------------------------------------------
--
--   'enrolled_students'       a class of the workspace has a student in it. Never deleted, by
--                             either rule.
--   'student_unsafe'          a student whose profile names the workspace is in no class of a
--                             workspace they could be pointed at, but is in a class somewhere
--                             (one of a workspace marked emptied). Left for the owner.
--   'teacher_tied_elsewhere'  ('never_used' only) a teacher of the workspace is named by a row
--                             of another workspace: a session they hosted, anything they made,
--                             an invitation they sent or accepted, a workspace they founded, or
--                             student work. Deleting the account would delete or change it.
--   'locked'                  a row the deletion needs was locked by someone else just then, or
--                             a write waited more than 2 seconds for one (SQLSTATE 55P03).
--   'changed'                 the workspace no longer matched its rule once locked.
--   'error_<sqlstate>'        the deletion raised; everything it had done was rolled back.
--
-- ---------------------------------------------------------------------------
-- What a deletion does, in order, in one subtransaction per workspace
-- ---------------------------------------------------------------------------
--
--   1. Students. A student account is never deleted. `profiles.org_id` is ON DELETE SET NULL and
--      `profiles_org_and_role_together` refuses a role with no org, so every student whose
--      profile names the workspace is first pointed at the workspace of the class they joined
--      earliest among their classes in workspaces not marked emptied. A student in no class
--      anywhere gets no role and no org: the state of an account that signed up as a student and
--      has not joined a class, which `/welcome` serves (a class code makes them a student again).
--   2. Teachers ('never_used' only). Their profiles lose org and role, then, after step 3, their
--      accounts are deleted from `auth.users` (identities, sign-in sessions and the profile row
--      go by cascade).
--   3. The workspace's rows, explicitly and in an order that needs no cascade to be lucky
--      (`session_responses.item_id` and `case_study_items.item_id` are ON DELETE RESTRICT):
--      sessions (participants, responses, tallies, public state), assignments (attempts, saved
--      answers, queued reminder emails), practice runs (answers, slots), practice shares, classes
--      (removal records), case studies (steps), items (versions, practice snapshots), banks
--      (folders), invitations, and the `orgs` row.
--
-- The app stores no file in Supabase Storage, so there is nothing to remove there.
--
-- ---------------------------------------------------------------------------
-- Locks
-- ---------------------------------------------------------------------------
--
-- The locks a deletion takes first are NOWAIT: the org row FOR UPDATE, then every profile
-- naming it, then (for 'never_used') the teachers' `auth.users` rows and their `auth.sessions`
-- rows. A workspace somebody is touching is therefore skipped ('locked') and met again tomorrow,
-- rather than waited for. The sessions are locked because a browser that is still signed in
-- refreshes its token by updating its `auth.sessions` row and never touches `auth.users`: with
-- the row locked, a refresh in flight makes the sweep skip, and one that starts later waits and
-- then finds the session gone.
--
-- The writes that follow are ordinary statements and can wait: a delete for a row another
-- transaction holds, and the foreign key check of a student pointed at another workspace for
-- that workspace's row. So a deletion sets `lock_timeout` to 2 seconds first. A wait longer than
-- that, a deadlock included (Postgres looks for one after 1 second by default and would
-- otherwise raise 40P01, which is reported as 'error_40P01'), ends as 55P03: the workspace is
-- reported 'locked' and everything done for it is rolled back.
--
-- Every other path into a workspace takes a lock on the org row that
-- conflicts with FOR UPDATE: `private.admit_to_class` asks for it FOR SHARE, `accept_org_invite`
-- FOR NO KEY UPDATE, and any insert or update that names the org takes the foreign key's FOR KEY
-- SHARE. So once the org row is held nothing can join it, and both rules are read again under
-- the lock before anything is written. A path that was waiting finds the row gone.
--
-- Safe to replay on a fresh project and to run twice: functions only, each `create or replace`
-- with its grants restated. Depends on 20261011000000 (`emptied_at`, `founder_id`).

-- ---------------------------------------------------------------------------
-- The two rules
-- ---------------------------------------------------------------------------

-- 'memberless', 'never_used' or null. Reads only. The one place the rules are written: the
-- candidate list and the check under the lock both call it.
create or replace function private.workspace_sweep_rule(p_org uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when not o.self_registered then null
    when o.emptied_at is not null then
      case
        when o.emptied_at < now() - interval '30 days'
             and not exists (
               select 1 from public.profiles p
                where p.org_id = o.id and p.role in ('instructor', 'admin')
             )
        then 'memberless'
      end
    when o.created_at < now() - interval '90 days'
         and exists (
           select 1 from public.profiles p
            where p.org_id = o.id and p.role in ('instructor', 'admin')
         )
         -- No teacher who fails any part of "unconfirmed and gone for 90 days". The coalesce
         -- makes a part that cannot be read (a null) a failure.
         and not exists (
           select 1
             from public.profiles p
             left join auth.users u on u.id = p.id
            where p.org_id = o.id
              and p.role in ('instructor', 'admin')
              and not coalesce(
                    p.role = 'instructor'
                    and (u.raw_app_meta_data -> 'learn_email_unconfirmed') = 'true'::jsonb
                    and u.created_at < now() - interval '90 days'
                    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '90 days'
                    and not exists (
                      select 1 from auth.sessions s
                       where s.user_id = u.id
                         and (
                           num_nonnulls(s.created_at, s.updated_at, s.refreshed_at) = 0
                           or coalesce(s.created_at >= now() - interval '90 days', false)
                           or coalesce(s.updated_at >= now() - interval '90 days', false)
                           or coalesce(
                                (s.refreshed_at at time zone 'utc') >= now() - interval '90 days',
                                false
                              )
                         )
                    ),
                    false
                  )
         )
         and not exists (
           select 1 from public.class_members m
             join public.classes c on c.id = m.class_id
            where c.org_id = o.id
         )
         and not exists (select 1 from public.assignments a where a.org_id = o.id)
         and not exists (select 1 from public.sessions s where s.org_id = o.id)
         -- Never used by a student either: one who joined, practised and left has no class
         -- membership now, and still used it.
         and not exists (select 1 from public.practice_runs r where r.org_id = o.id)
         and not exists (select 1 from public.bank_practice_shares bs where bs.org_id = o.id)
         and not exists (
           select 1 from private.class_removals cr
             join public.classes c on c.id = cr.class_id
            where c.org_id = o.id
         )
         and not exists (
           select 1 from public.item_banks b
            where b.org_id = o.id
              and greatest(b.created_at, b.updated_at) >= now() - interval '90 days'
         )
         and not exists (
           select 1 from public.items i
            where i.org_id = o.id
              and greatest(i.created_at, i.updated_at) >= now() - interval '90 days'
         )
         and not exists (
           select 1 from public.case_studies cs
            where cs.org_id = o.id
              and greatest(cs.created_at, cs.updated_at) >= now() - interval '90 days'
         )
         and not exists (
           select 1 from public.classes c
            where c.org_id = o.id
              and greatest(c.created_at, c.updated_at) >= now() - interval '90 days'
         )
    then 'never_used'
  end
    from public.orgs o
   where o.id = p_org;
$$;

revoke all on function private.workspace_sweep_rule(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- What stops a deletion
-- ---------------------------------------------------------------------------

-- Whether any row outside `p_org` names the account `p_user`. Deleting an account cascades to
-- the sessions it hosted and to student work, and clears every "made by" pointer; inside the
-- workspace being deleted that is the point, anywhere else it is somebody else's record.
create or replace function private.sweep_account_tied_elsewhere(p_user uuid, p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.sessions s where s.host_id = p_user and s.org_id <> p_org)
      or exists (select 1 from public.participants t
                  where t.profile_id = p_user and t.org_id <> p_org)
      or exists (select 1 from public.item_banks b
                  where b.created_by = p_user and b.org_id <> p_org)
      or exists (select 1 from public.items i where i.created_by = p_user and i.org_id <> p_org)
      or exists (select 1 from public.case_studies cs
                  where cs.created_by = p_user and cs.org_id <> p_org)
      or exists (select 1 from public.bank_folders f
                  where f.created_by = p_user and f.org_id <> p_org)
      or exists (select 1 from public.classes c where c.created_by = p_user and c.org_id <> p_org)
      or exists (select 1 from public.assignments a
                  where a.created_by = p_user and a.org_id <> p_org)
      or exists (select 1 from public.bank_practice_shares bs
                  where bs.shared_by = p_user and bs.org_id <> p_org)
      or exists (select 1 from public.org_invites v
                  where (v.invited_by = p_user or v.accepted_by = p_user) and v.org_id <> p_org)
      or exists (select 1 from public.orgs o where o.founder_id = p_user and o.id <> p_org)
      -- A teacher is never a student, so any of these is unexpected, and stops the deletion.
      or exists (select 1 from public.class_members m where m.profile_id = p_user)
      or exists (select 1 from private.class_removals r where r.profile_id = p_user)
      or exists (select 1 from public.assignment_attempts t where t.student_id = p_user)
      or exists (select 1 from public.practice_runs r where r.student_id = p_user)
      or exists (select 1 from private.email_outbox e where e.student_id = p_user);
$$;

revoke all on function private.sweep_account_tied_elsewhere(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Null when the workspace `p_org`, matched by `p_rule`, may be deleted; otherwise why not. Reads
-- only.
create or replace function private.workspace_sweep_blocker(p_org uuid, p_rule text) returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
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
-- Deleting one workspace
-- ---------------------------------------------------------------------------

-- Deletes the workspace, or raises: WS001 with the reason as its message when a check under the
-- locks says no (every check comes before the first write), 55P03 when a lock is taken, and
-- whatever a write raises. It always refuses by raising, never by returning, so that the caller's
-- block, one per workspace, rolls back whatever was written and releases every lock taken here.
create or replace function private.sweep_one_workspace(p_org uuid, p_rule text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  blocker text;
  teachers uuid[] := '{}';
begin
  -- See "Locks" in the header.
  perform 1 from public.orgs o where o.id = p_org for update nowait;
  if not found then
    raise exception using errcode = 'WS001', message = 'changed';
  end if;
  perform 1 from public.profiles p where p.org_id = p_org order by p.id for update nowait;
  if p_rule = 'never_used' then
    -- The membership is fixed now: the org row and every profile naming it are held.
    select coalesce(array_agg(p.id), '{}') into teachers
      from public.profiles p
     where p.org_id = p_org and p.role in ('instructor', 'admin');
    perform 1 from auth.users u where u.id = any (teachers) order by u.id for update nowait;
    -- A token refresh updates the session's row and not the user's. See "Locks".
    perform 1 from auth.sessions s where s.user_id = any (teachers) order by s.id for update nowait;
  end if;

  -- Read again, now that nothing can change underneath.
  if private.workspace_sweep_rule(p_org) is distinct from p_rule then
    raise exception using errcode = 'WS001', message = 'changed';
  end if;
  blocker := private.workspace_sweep_blocker(p_org, p_rule);
  if blocker is not null then
    raise exception using errcode = 'WS001', message = blocker;
  end if;

  -- Nothing below waits long for anybody. See "Locks" in the header.
  perform set_config('lock_timeout', '2s', true);

  -- 1. Students: to the workspace of the class they joined earliest, among workspaces that are
  --    not marked emptied; the rest (in no class anywhere, or the blocker would have answered)
  --    get no role.
  update public.profiles p
     set org_id = moved.target
    from (
      select s.id,
             (select c.org_id
                from public.class_members m
                join public.classes c on c.id = m.class_id
                join public.orgs t on t.id = c.org_id
               where m.profile_id = s.id and c.org_id <> p_org and t.emptied_at is null
               order by m.joined_at, c.id
               limit 1) as target
        from public.profiles s
       where s.org_id = p_org and s.role = 'student'
    ) as moved
   where p.id = moved.id and moved.target is not null;

  update public.profiles p
     set org_id = null, role = null
   where p.org_id = p_org and p.role = 'student';

  -- 2. Teachers. 'memberless' has none: the rule was just read under the lock.
  if cardinality(teachers) > 0 then
    update public.profiles p
       set org_id = null, role = null
     where p.id = any (teachers);
  end if;

  -- 3. The workspace's rows. See the header for the order.
  delete from public.sessions s where s.org_id = p_org;
  delete from public.assignments a where a.org_id = p_org;
  delete from public.practice_runs r where r.org_id = p_org;
  delete from public.bank_practice_shares bs where bs.org_id = p_org;
  delete from public.classes c where c.org_id = p_org;
  delete from public.case_studies cs where cs.org_id = p_org;
  delete from public.items i where i.org_id = p_org;
  delete from public.item_banks b where b.org_id = p_org;
  delete from public.org_invites v where v.org_id = p_org;
  -- Any profile still naming the org here would be left with a role and no org, which
  -- profiles_org_and_role_together refuses: the whole deletion is then rolled back.
  delete from public.orgs o where o.id = p_org;

  if cardinality(teachers) > 0 then
    delete from auth.users u where u.id = any (teachers);
  end if;
end;
$$;

revoke all on function private.sweep_one_workspace(uuid, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The sweep
-- ---------------------------------------------------------------------------

-- public.sweep_abandoned_workspaces(p_delete boolean, p_limit integer)        SERVICE ROLE ONLY
--   returns table (org_id uuid, rule text, outcome text, reason text): one row per workspace
--   looked at.
--     rule     'memberless' or 'never_used'.
--     outcome  'would_delete'  `p_delete` is not true, and nothing stops the deletion.
--              'deleted'       it is gone.
--              'skipped'       it was not deleted; `reason` says why (see the header).
--   With `p_delete` anything but true it writes nothing and locks nothing. At most `p_limit`
--   workspaces (20 when null, never more than 100, none when it is 0 or less) are deleted, or
--   reported 'would_delete', in one call; skipped ones do not count, so a workspace that is
--   skipped every day cannot hold up the ones behind it. Oldest first: emptied workspaces by
--   `emptied_at`, then never used ones by `created_at`. It returns ids and words only, never a
--   name or an address.
create or replace function public.sweep_abandoned_workspaces(
  p_delete boolean default false,
  p_limit integer default 20
) returns table (org_id uuid, rule text, outcome text, reason text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  hard_cap constant integer := 100;
  remaining integer := least(greatest(coalesce(p_limit, 20), 0), hard_cap);
  deleting constant boolean := p_delete is true;
  candidate record;
  refusal text;
begin
  for candidate in
    select listed.id, listed.matched
      from (
        select o.id,
               private.workspace_sweep_rule(o.id) as matched,
               o.emptied_at,
               o.created_at
          from public.orgs o
         where o.self_registered
           and (o.emptied_at < now() - interval '30 days'
                or o.created_at < now() - interval '90 days')
      ) as listed
     where listed.matched is not null
     order by (listed.matched = 'memberless') desc,
              coalesce(listed.emptied_at, listed.created_at),
              listed.id
  loop
    exit when remaining <= 0;

    refusal := private.workspace_sweep_blocker(candidate.id, candidate.matched);

    if refusal is null and deleting then
      begin
        perform private.sweep_one_workspace(candidate.id, candidate.matched);
      exception
        when lock_not_available then
          refusal := 'locked';
        when sqlstate 'WS001' then
          -- sweep_one_workspace's own refusal: its message is one of the fixed reasons.
          refusal := sqlerrm;
        when others then
          -- The state only: a message could quote a row. The id and the state also go to the
          -- database log, so a workspace that fails every day can be found there.
          refusal := 'error_' || sqlstate;
          raise warning 'sweep_abandoned_workspaces: workspace % was not deleted (%)',
            candidate.id, sqlstate;
      end;
    end if;

    if refusal is not null then
      return query select candidate.id, candidate.matched, 'skipped'::text, refusal;
    else
      remaining := remaining - 1;
      return query
        select candidate.id,
               candidate.matched,
               case when deleting then 'deleted' else 'would_delete' end,
               null::text;
    end if;
  end loop;
end;
$$;

revoke all on function public.sweep_abandoned_workspaces(boolean, integer)
  from public, anon, authenticated;
grant execute on function public.sweep_abandoned_workspaces(boolean, integer) to service_role;

comment on function public.sweep_abandoned_workspaces(boolean, integer) is
  'Deletes abandoned self-registered workspaces, or with p_delete false only reports them. Service role only. ADR 0012.';

-- ---------------------------------------------------------------------------
-- What pg_cron runs (scheduled by the owner, docs/05 §7.13)
-- ---------------------------------------------------------------------------

-- 20260924060000's private.call_reminder_route, for the sweep's route: POSTs to
-- `learn_workspace_sweep_url` (the deployment's full URL of /api/cron/workspace-sweep) with the
-- same `learn_cron_secret`, both read from Vault at run time. Answers 'no_pg_net', 'no_vault',
-- 'not_configured' or 'queued' and never raises. Nobody but the superuser may call it. Unlike
-- that function it takes an https URL only: the secret behind this call can start a deletion,
-- and is never sent in the clear.
create or replace function private.call_workspace_sweep_route() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  target_url text;
  secret text;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    return 'no_pg_net';
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    return 'no_vault';
  end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1'
    into target_url using 'learn_workspace_sweep_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1'
    into secret using 'learn_cron_secret';

  if target_url is null or target_url !~ '^https://[^\s]+$'
     or secret is null or length(secret) < 32 then
    return 'not_configured';
  end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
    using target_url,
          '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json',
                             'Authorization', 'Bearer ' || secret),
          -- Longer than the route's maxDuration (60 s): a full run is not reported as a timeout.
          65000;
  return 'queued';
end;
$$;

revoke all on function private.call_workspace_sweep_route()
  from public, anon, authenticated, service_role;
