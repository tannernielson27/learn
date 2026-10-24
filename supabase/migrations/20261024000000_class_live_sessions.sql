-- A live session for a class (ADR 0013).
--
-- A teacher can still start a quick live session that anyone joins with a join code and a name,
-- exactly as before. A teacher can now also start one FOR A CLASS. Anyone can still join it with
-- the code. When the person joining is signed in with a student account that is a current member
-- of that class, their participant row is linked to their profile (participants.profile_id, which
-- has existed since #129 and which nothing wrote until now). A guest in a class session is
-- anonymous, as every participant was before.
--
-- What this migration adds:
--
--   1. sessions.class_id. Nullable; a composite key to classes (id, org_id), so the class is
--      always in the session's own workspace whoever writes the row (start_session, or an insert
--      straight at the Data API under the host policy). ON DELETE SET NULL on class_id only: a
--      session is the record of a class that happened, as with bank_id and case_study_id.
--   2. private.guard_session_change: class_id is part of a session's identity and never changes,
--      except to null when the class is deleted (the same pass-through the source columns have).
--   3. start_session(..., target_class uuid default null). The old call, with four or fewer
--      arguments, is the same call: the new argument is defaulted, and the old four-argument
--      function is dropped so that a call naming none of the new arguments is not ambiguous. A
--      class that is not the caller's workspace's is refused with errcode LC001.
--   4. participants_session_profile_key: one participant per (session, profile) among linked
--      rows. A member who joins again, from another phone or after clearing cookies, gets their
--      own participant back with a NEW secret. The old secret stops working: the hash is
--      replaced, not added to, so a participant has exactly one live token, as it always had.
--      Only the account holder can trigger this, because the profile id comes from the server's
--      verified claims, never from the request.
--   5. join_session(..., joining_profile uuid default null). Still granted to service_role only.
--      The profile is linked only when the session has a class AND the profile is a student who
--      is a member of that class now (class_members) AND was not taken off it
--      (private.class_removals). Anything else joins anonymously, exactly as before; the caller
--      is never trusted on membership.
--   6. class_session_for_member(code, member): for the join page, the class's name when the code
--      names an open class session the member belongs to, and nothing otherwise. Service role
--      only; it does not count wrong guesses, because it answers nothing about a code that is
--      not a session of the member's own class.
--   7. participant_link(participant, session, secret, account): for the join action only, whose
--      account a browser's participant token is linked to, and whether the signed-in account is
--      a current member of the session's class. The join action uses it to decide whether a
--      browser that is already in the room comes back as that participant (a shared laptop must
--      not hand one student's participant to another). Service role only, and only for a token
--      whose secret matches; nothing it returns is sent to a phone.
--
-- Rejoining from a second device (ADR 0013, decision 1). A member who joins again replaces the
-- participant's rejoin hash, so the first device's token stops working at once and that phone
-- shows "You are no longer in this live session" with a line saying it may have been opened on
-- another device. Rotating only when the old participant has not been seen for a minute was
-- considered and not done: last_seen_at moves only when a request is made, so a phone sitting on
-- one question looks unseen, and a refusal would need a second token or a new error for the
-- second device. One live token per participant stays the rule.
--
-- The cleanup functions that read participants.profile_id. private.sweep_account_tied_elsewhere
-- (20261012000000, replaced with one more line each by 20261014000000 and 20261015000000; those
-- are the "workspace_sweep", "library_folders" and "ai_import" definitions, and the last is the
-- live one) asks whether a TEACHER the never-used sweep would delete is named by a participant
-- row of another workspace. It was always false, because nothing wrote profile_id. It can be
-- true now only for an account that was linked as a student and is a teacher since; the sweep
-- then skips the workspace ('teacher_tied_elsewhere') rather than clearing that participant's
-- link through the account's deletion. That is the rule doing what it says, so it is unchanged.
-- No sweep deletes a student's account, and step 1 of a deletion moves a student's profile to
-- another workspace without touching participants: a student's linked participation in another
-- workspace's sessions is neither deleted nor unlinked. The swept workspace's own sessions,
-- with their participants linked or not, go with it, as its assignments' attempts always have.
-- class_live_sessions.test.sql pins both.
--
-- Read paths: none is opened. participants.profile_id was already readable by the authors of
-- the session's workspace (the column grant of #129) and by nobody else; no phone-facing function
-- (resume_participant, open_session_view and the live views) returns it, and none is changed here.
-- sessions.class_id is readable through the authors' existing policy only.
--
-- Deploy order: this goes before the app that passes target_class and joining_profile (docs/05
-- section 7.2). The app before it keeps working: both functions keep their old calls.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.sessions
  add column class_id uuid,
  -- classes_id_org_key is 20260924020000_assignments.sql's.
  add constraint sessions_class_org_fkey foreign key (class_id, org_id)
    references public.classes (id, org_id) on delete set null (class_id);

create index sessions_class_id_idx on public.sessions (class_id);

comment on column public.sessions.class_id is
  'The class a live session was started for, or null for a quick live session anyone joins. '
  'Always in the session''s own workspace (sessions_class_org_fkey). Fixed when the session '
  'starts; cleared only when the class is deleted. See 20261024000000_class_live_sessions.sql.';

-- ---------------------------------------------------------------------------
-- 2. The state machine: the class is part of a session's identity
-- ---------------------------------------------------------------------------

-- 20260923080000_student_paced.sql's function, with class_id in the pass-through for a deleted
-- pointer and in the list of what never changes. Nothing else differs.
create or replace function private.guard_session_change() returns trigger
language plpgsql set search_path = ''
as $$
declare
  moved boolean;
  left_before integer;
  left_after integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'lobby' then
      raise exception 'a session starts in the lobby' using errcode = '22023';
    end if;
    new.closed_at := null;
    new.reveal := false;
    new.item_ends_at := null;
    new.timer_remaining_ms := null;
    new.opened_at := now();
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- The one update that may touch any session, ended or not: a foreign key clearing a pointer
  -- because the bank, the case study or (since 20261024000000) the class was deleted. See #128.
  -- `authenticated` has no column privilege on any of the three, so only the referential action
  -- itself reaches this.
  if to_jsonb(new) - 'bank_id' - 'case_study_id' - 'class_id'
       = to_jsonb(old) - 'bank_id' - 'case_study_id' - 'class_id'
     and (new.bank_id is not distinct from old.bank_id or new.bank_id is null)
     and (new.case_study_id is not distinct from old.case_study_id or new.case_study_id is null)
     and (new.class_id is not distinct from old.class_id or new.class_id is null)
     and (new.bank_id is distinct from old.bank_id
          or new.case_study_id is distinct from old.case_study_id
          or new.class_id is distinct from old.class_id) then
    return new;
  end if;

  if old.status = 'ended' then
    raise exception 'that session has ended' using errcode = '22023';
  end if;

  if new.id <> old.id
     or new.org_id <> old.org_id
     or new.host_id <> old.host_id
     or new.code <> old.code
     or new.opened_at <> old.opened_at
     or new.bank_id is distinct from old.bank_id
     or new.case_study_id is distinct from old.case_study_id
     or new.class_id is distinct from old.class_id
     or new.item_set <> old.item_set then
    raise exception 'a session''s identity, source, class, item set and join code cannot change'
      using errcode = '22023';
  end if;

  if new.status <> old.status and not (
       (old.status = 'lobby' and new.status in ('running', 'ended'))
       or (old.status = 'running' and new.status in ('paused', 'ended'))
       or (old.status = 'paused' and new.status in ('running', 'ended'))
     ) then
    raise exception 'a session cannot go from % to %', old.status, new.status
      using errcode = '22023';
  end if;

  -- Pacing (#185). Chosen in the lobby and fixed from the first move: a class halfway through a
  -- set at its own pace cannot be turned into a room on one item, nor the other way round.
  if new.mode <> old.mode and old.status <> 'lobby' then
    raise exception 'a session''s pacing cannot change once it has started' using errcode = '22023';
  end if;
  if new.mode = 'student_paced' and old.status <> 'lobby' then
    -- Every phone moves by itself, so there is no room-wide item to move. `isStudentPaced` in
    -- src/lib/live/state.ts refuses advance and goto as `student_paced` before they get here.
    if new.current_position is distinct from old.current_position then
      raise exception 'a student-paced session has no current item to move'
        using errcode = '22023';
    end if;
    -- "Show answers" is one switch for the whole set, and it does not switch back: phones are
    -- reviewing. Ending the room is what clears it, below, as it does for any room.
    if old.reveal and not new.reveal and new.status <> 'ended' then
      raise exception 'a student-paced session''s answers stay shown' using errcode = '22023';
    end if;
  end if;

  -- Moving between items (#183). `goToItem` in src/lib/live/state.ts is the same rule set, and
  -- `advance` is the special case of it one item on. The range itself is still
  -- `sessions_position_within_set`'s, which runs after this and says 23514.
  if new.current_position is distinct from old.current_position then
    if old.status = 'lobby' then
      -- Leaving the lobby puts the room on its first item, and only that; a room still in the
      -- lobby is on no item at all, so it cannot be sent to one.
      if new.status <> 'running' or new.current_position is distinct from 1 then
        raise exception 'a session starts on its first item' using errcode = '22023';
      end if;
    elsif new.status not in ('running', 'paused') then
      raise exception 'a session moves between items only while it is running or paused'
        using errcode = '22023';
    elsif new.current_position is null then
      raise exception 'a session''s position cannot be cleared' using errcode = '22023';
    end if;
    -- A different item is a different question: whatever key was showing is not its answer,
    -- whatever the client sent. Before the clock below, which reads the reveal.
    new.reveal := false;
  end if;

  if new.status = 'ended' then
    new.closed_at := now();
    new.reveal := false;
  end if;

  -- The clock (#182). On a move, it is derived from the row as it was and whatever the client
  -- sent for it is ignored: a host says "advance", never "and the item ends at".
  moved := new.current_position is distinct from old.current_position
        or new.status <> old.status
        or new.reveal <> old.reveal;

  if moved then
    if new.current_position is distinct from old.current_position then
      -- A new item gets the whole chosen time: running if the room is, frozen if it is paused.
      if new.timer_seconds is null or new.current_position is null then
        new.item_ends_at := null;
        new.timer_remaining_ms := null;
      elsif new.status = 'paused' then
        new.item_ends_at := null;
        new.timer_remaining_ms := new.timer_seconds * 1000;
      else
        new.item_ends_at := now() + make_interval(secs => new.timer_seconds);
        new.timer_remaining_ms := null;
      end if;
    elsif old.status = 'running' and new.status = 'paused'
          and old.item_ends_at is not null and old.item_ends_at > now() then
      -- Pausing freezes what is left. A clock that has already run out is not frozen: it stays
      -- as it was, so a pause can never hand back time that was up.
      new.item_ends_at := null;
      new.timer_remaining_ms := private.ms_until(old.item_ends_at);
    elsif old.status = 'paused' and new.status = 'running' and old.timer_remaining_ms is not null then
      new.item_ends_at := now() + old.timer_remaining_ms * interval '1 millisecond';
      new.timer_remaining_ms := null;
    else
      new.item_ends_at := old.item_ends_at;
      new.timer_remaining_ms := old.timer_remaining_ms;
    end if;
  elsif new.item_ends_at is distinct from old.item_ends_at
        or new.timer_remaining_ms is distinct from old.timer_remaining_ms then
    -- A write to the clock alone, which is what extend_item_timer and stop_item_timer make. Two
    -- things may happen to a clock between moves: it stops, or it gets longer. Nothing else —
    -- not a shorter clock, not one conjured onto an item that had none, not one past an hour.
    if new.item_ends_at is not null or new.timer_remaining_ms is not null then
      if old.item_ends_at is null and old.timer_remaining_ms is null then
        raise exception 'this item has no timer running' using errcode = '22023';
      end if;
      if new.status = 'paused' and new.item_ends_at is not null then
        raise exception 'a paused room''s clock is frozen' using errcode = '22023';
      end if;
      left_before := coalesce(old.timer_remaining_ms, private.ms_until(old.item_ends_at));
      left_after := coalesce(new.timer_remaining_ms, private.ms_until(new.item_ends_at));
      if left_after < left_before or left_after > 3600000 then
        raise exception 'a timer can only be extended, up to an hour, or stopped'
          using errcode = '22023';
      end if;
    end if;
  end if;

  -- Showing the key and ending the room stop the clock; the chosen time stays for the next item.
  if new.reveal or new.status = 'ended' or new.current_position is null then
    new.item_ends_at := null;
    new.timer_remaining_ms := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.guard_session_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Starting a session, optionally for a class
-- ---------------------------------------------------------------------------

-- 20261022000000_quiz_case_studies_live.sql's function with target_class added at the end. The
-- four-argument function is dropped rather than overloaded: with both present, a call naming two
-- arguments (every existing caller) would match both and Postgres would refuse it as ambiguous.
drop function if exists public.start_session(uuid, uuid, public.session_mode, integer);

create function public.start_session(
  source_bank uuid default null,
  source_case_study uuid default null,
  paced public.session_mode default 'instructor_paced',
  item_timer_seconds integer default null,
  target_class uuid default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  source_org uuid;
  source_title text;
  chosen jsonb;
  new_id uuid;
  failed_constraint text;
begin
  if num_nonnulls(source_bank, source_case_study) <> 1 then
    raise exception 'start a session from either a bank or a case study, not both'
      using errcode = '22023';
  end if;

  if source_bank is not null then
    select b.org_id, b.name into source_org, source_title
      from public.item_banks b where b.id = source_bank;
    if not found then
      raise exception 'that bank does not exist' using errcode = 'P0002';
    end if;
    -- The quiz in its order (#468), each ready case study in place as its steps (#469). A draft
    -- question, and a case study that is not ready, are left out.
    chosen := private.quiz_run_set(source_bank, source_org);
  else
    select c.org_id, c.title into source_org, source_title
      from public.case_studies c
     where c.id = source_case_study and c.status = 'published';
    if not found then
      -- An unpublished case study is not "gone", but a room must not be shown one, and the two
      -- answers are told apart below rather than here so the P0002 branch keeps meaning one thing.
      if exists (select 1 from public.case_studies c where c.id = source_case_study) then
        raise exception 'that case study is not published' using errcode = '22023';
      end if;
      raise exception 'that case study does not exist' using errcode = 'P0002';
    end if;

    -- Every step, in order, and every one of them published. A case study is a sequence: silently
    -- dropping a half-written step would run the room through a different case study from the one
    -- the instructor chose, so this refuses instead.
    if exists (
      select 1 from public.case_study_items csi
        join public.items i on i.id = csi.item_id
       where csi.case_study_id = source_case_study and i.status <> 'published'
    ) then
      raise exception 'that case study has a step that is not published' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(csi.item_id order by csi.position), '[]'::jsonb) into chosen
      from public.case_study_items csi
     where csi.case_study_id = source_case_study;
  end if;

  -- A class session (ADR 0013): the class must be one the caller authors in, in the workspace the
  -- source is in. Row level security already hides another workspace's classes from this
  -- security-invoker read; the explicit org and author checks keep the rule readable on its own,
  -- and sessions_class_org_fkey holds it for a row written any other way. Its own errcode, so the
  -- app can say "that class" rather than "that quiz" (src/lib/supabase/sessions.ts).
  if target_class is not null and not (
    (select private.is_author())
    and exists (
      select 1 from public.classes c
       where c.id = target_class
         and c.org_id = source_org
         and c.org_id = (select private.current_org_id())
    )
  ) then
    raise exception 'that class is not in your workspace' using errcode = 'LC001';
  end if;

  if jsonb_array_length(chosen) = 0 then
    raise exception 'that source has no published items to run' using errcode = '22023';
  end if;

  for attempt in 1 .. 10 loop
    begin
      insert into public.sessions
        (org_id, host_id, bank_id, case_study_id, class_id, title, code, mode, item_set,
         timer_seconds)
      values
        (source_org, caller, source_bank, source_case_study, target_class, source_title,
         private.new_session_code(), paced, chosen, item_timer_seconds)
      returning id into new_id;
      return new_id;
    exception when unique_violation then
      -- Only a code that collided with a session still open is worth another draw.
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint is distinct from 'sessions_open_code_key' then
        raise;
      end if;
    end;
  end loop;

  raise exception 'could not find a free join code' using errcode = '53400';
end;
$$;

revoke all on function public.start_session(uuid, uuid, public.session_mode, integer, uuid)
  from public, anon;
grant execute on function public.start_session(uuid, uuid, public.session_mode, integer, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Who counts as a member, in one place
-- ---------------------------------------------------------------------------

-- A student who is on the class's roster now and was not taken off it. A removal deletes the
-- class_members row, so the second check only matters if a removed student were ever put back
-- by hand without clearing the removal; it is the same pair admit_to_class reads.
create function private.is_class_member(target_class uuid, account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select target_class is not null
     and account is not null
     and exists (
       select 1 from public.class_members m
         join public.profiles p on p.id = m.profile_id
        where m.class_id = target_class
          and m.profile_id = account
          and p.role = 'student'
     )
     and not exists (
       select 1 from private.class_removals r
        where r.class_id = target_class and r.profile_id = account
     );
$$;

revoke all on function private.is_class_member(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. One participant per member per session
-- ---------------------------------------------------------------------------

create unique index participants_session_profile_key
  on public.participants (session_id, profile_id)
  where profile_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Joining, linked when the joiner is a member of the session's class
-- ---------------------------------------------------------------------------

-- 20260920140000_session_participants.sql's function with joining_profile added. Dropped and
-- made again rather than overloaded, for the reason start_session is above.
drop function if exists public.join_session(uuid, text);

create function public.join_session(
  target_session uuid,
  chosen_name text,
  joining_profile uuid default null
)
returns table (participant_id uuid, rejoin_secret text)
language plpgsql security definer set search_path = ''
as $$
declare
  session_org uuid;
  session_state public.session_status;
  session_class uuid;
  linked uuid;
  cleaned text;
  secret text;
  new_participant uuid;
begin
  -- Read without `for share`, as #129 explains: the host's row is not held while a class files in.
  select s.org_id, s.status, s.class_id into session_org, session_state, session_class
    from public.sessions s where s.id = target_session;
  if not found then
    raise exception 'that session does not exist' using errcode = 'P0002';
  end if;
  if session_state = 'ended' then
    raise exception 'that session has ended' using errcode = '22023';
  end if;

  cleaned := left(btrim(regexp_replace(coalesce(chosen_name, ''), '\s+', ' ', 'g')), 32);
  if cleaned = '' then
    raise exception 'a participant needs a display name' using errcode = '22023';
  end if;

  -- The caller says who is signed in; this decides whether that counts. A quick session links
  -- nobody, and neither does a class session joined by anyone but a current member.
  if session_class is not null and private.is_class_member(session_class, joining_profile) then
    linked := joining_profile;
  end if;

  secret := encode(extensions.gen_random_bytes(24), 'hex');

  -- A member already in this session (another phone, cleared cookies): the same participant,
  -- with a new secret. Their answers stay theirs and the roster keeps one name for one person.
  -- Before the roster ceiling, so a member coming back is never told the session is full.
  if linked is not null then
    update public.participants p
       set rejoin_hash = extensions.digest(secret, 'sha256'),
           last_seen_at = now()
     where p.session_id = target_session and p.profile_id = linked
     returning p.id into new_participant;
    if new_participant is not null then
      return query select new_participant, secret;
      return;
    end if;
  end if;

  if private.session_is_full(target_session) then
    raise exception 'that session is full' using errcode = '54000';
  end if;

  -- The conflict clause only answers two phones of one member arriving in the same instant; the
  -- update above is the ordinary way back. An anonymous row has no profile and never conflicts.
  insert into public.participants (session_id, org_id, profile_id, display_name, rejoin_hash)
  values (target_session, session_org, linked, cleaned, extensions.digest(secret, 'sha256'))
  on conflict (session_id, profile_id) where profile_id is not null
    do update set rejoin_hash = excluded.rejoin_hash, last_seen_at = now()
  returning id into new_participant;

  return query select new_participant, secret;
end;
$$;

revoke all on function public.join_session(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.join_session(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. What the join page may say to a signed-in member
-- ---------------------------------------------------------------------------

-- The class's name, when the code names an open session for a class the member belongs to; no
-- rows otherwise, whether the code is wrong, ended, a quick session or another class's. The join
-- page calls it only for a signed-in account, with the id the server verified, so it says
-- nothing to anyone about a session they could not already have been told about by their own
-- teacher. Service role only, like resolve_session_code.
create function public.class_session_for_member(session_code text, member uuid)
returns table (class_name text)
language sql stable security definer set search_path = ''
as $$
  select c.name
    from public.sessions s
    join public.classes c on c.id = s.class_id and c.org_id = s.org_id
   where s.code = upper(regexp_replace(coalesce(session_code, ''), '[^0-9A-Za-z]', '', 'g'))
     and s.status <> 'ended'
     and private.is_class_member(s.class_id, member);
$$;

revoke all on function public.class_session_for_member(text, uuid)
  from public, anon, authenticated;
grant execute on function public.class_session_for_member(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Whose participant a browser holds, for the join action
-- ---------------------------------------------------------------------------

-- One row when the token's secret matches, none otherwise (an unknown, tampered or rotated token
-- takes the same path as a wrong one, as in resume_participant). `linked_profile` is the account
-- the participant is linked to, or null for an anonymous one; `account_is_member` says whether
-- `account`, the id the server verified, is a current member of the session's class (false for
-- a quick session, or a class that was deleted). The join action reads both to decide whether
-- to come back as this participant and sends neither to the browser. Reads only: it does not
-- touch last_seen_at, which resume_participant has just done.
create function public.participant_link(
  target_participant uuid,
  target_session uuid,
  presented_secret text,
  account uuid
)
returns table (linked_profile uuid, account_is_member boolean)
language sql stable security definer set search_path = ''
as $$
  select p.profile_id, private.is_class_member(s.class_id, account)
    from public.participants p
    join public.sessions s on s.id = p.session_id
   where p.id = target_participant
     and p.session_id = target_session
     and p.rejoin_hash = extensions.digest(coalesce(presented_secret, ''), 'sha256');
$$;

revoke all on function public.participant_link(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.participant_link(uuid, uuid, text, uuid) to service_role;
