-- Student-paced mode (#185): the host opens the whole set, each phone works through it at its own
-- pace, a progress board fills in on the console, and one "Show answers" reveals every item.
--
-- #128 already gave `public.sessions` its `mode` column and `start_session` its `paced` argument;
-- nothing ever chose anything but instructor-paced. This makes the other choice mean something,
-- in the same four places the instructor-paced rules live:
--
--   * `private.guard_session_change`. The pacing is fixed once the room has left the lobby. A
--     student-paced room starts on position 1 exactly as any room does (the constraint below
--     `sessions_reveal_needs_running_item` and the mirror both expect a position), and after that
--     its position never moves: there is no room-wide item to advance or jump to. Its reveal means
--     "every item's answer is showing", and once shown it stays shown until the room ends.
--     `applyHostCommand`, `goToItem` and `chooseTimer` in src/lib/live/state.ts refuse the same
--     moves first, as `student_paced`, so a console never sends them.
--   * Two check constraints. A student-paced room has no timer (per-student timers are out of
--     scope, the owner's decision), and a case study always runs instructor-paced: its six steps
--     are a sequence the instructor walks the room through, and running one student-paced is out
--     of scope too. A constraint rather than a line in `start_session`, so it holds whichever way
--     a row is written.
--   * `begin_session_submission` and `record_session_response`. In a student-paced room a phone
--     answers any item in the set, so the submission route names it by its place in the set
--     (`requested_position`) and both functions check that place against `item_set` instead of
--     against `current_position`. Every other rule — ended, lobby, paused, revealed, once per
--     person per item (`session_responses_once`) — is the one instructor-paced already keeps, in
--     the same order. The time check stays: a student-paced room can never have a clock, so it
--     never fires there.
--   * `begin_session_view` answers with the mode as well, so the view route knows to hand the
--     phone the whole set rather than one item. The set it already returned.
--
-- The guard function below is 20260923060000_session_goto.sql's, whole — #182's clock and #183's
-- position rules — with the pacing rules added before the position rules. Replaced whole rather
-- than wrapped, so there is still exactly one place that says what a session may become.
--
-- Nothing is pushed per submission (ADR 0002). The progress board is the host reading
-- `session_responses` (participant and position only) and `participants` under their own org's
-- row level security, both of which authors could already read; no grant changes here.

-- ---------------------------------------------------------------------------
-- What a student-paced row may hold
-- ---------------------------------------------------------------------------

alter table public.sessions
  add constraint sessions_student_paced_untimed
    check (mode = 'instructor_paced' or timer_seconds is null),
  add constraint sessions_student_paced_bank_only
    check (mode = 'instructor_paced' or case_study_id is null);

-- ---------------------------------------------------------------------------
-- The state machine, now with pacing
-- ---------------------------------------------------------------------------

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

  -- The one update that may touch any session, ended or not: a foreign key clearing a source
  -- pointer because the bank or case study was deleted. See #128.
  if to_jsonb(new) - 'bank_id' - 'case_study_id' = to_jsonb(old) - 'bank_id' - 'case_study_id'
     and (new.bank_id is not distinct from old.bank_id or new.bank_id is null)
     and (new.case_study_id is not distinct from old.case_study_id or new.case_study_id is null)
     and (new.bank_id is distinct from old.bank_id
          or new.case_study_id is distinct from old.case_study_id) then
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
     or new.item_set <> old.item_set then
    raise exception 'a session''s identity, source, item set and join code cannot change'
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
-- What a phone reads: the mode as well
-- ---------------------------------------------------------------------------

-- #182's function with one column added, `session_mode`. The return type changes, so it is dropped
-- and created again, and its grant given back below. The mode says how the room is paced and
-- nothing about any answer; the item set it already returned.
drop function public.begin_session_view(uuid, uuid);

create function public.begin_session_view(target_session uuid, participant uuid)
returns table (
  refusal text,
  session_status public.session_status,
  session_mode public.session_mode,
  session_position smallint,
  session_reveal boolean,
  session_items jsonb,
  session_timer_seconds integer,
  session_ends_at timestamptz,
  session_remaining_ms integer,
  server_now timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.take_session_view(participant) then
    return query select 'rate_limited'::text, null::public.session_status,
                        null::public.session_mode, null::smallint, null::boolean, null::jsonb,
                        null::integer, null::timestamptz, null::integer, now();
    return;
  end if;

  return query
    select null::text, s.status, s.mode, s.current_position, s.reveal, s.item_set,
           s.timer_seconds, s.item_ends_at, s.timer_remaining_ms, now()
      from public.sessions s
     where s.id = target_session;
end;
$$;

revoke all on function public.begin_session_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_session_view(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Answering any item of a student-paced set
-- ---------------------------------------------------------------------------

-- #182's function with a third argument. Dropped rather than overloaded: a two-argument call would
-- otherwise match both the old function and the new one with its default, and be ambiguous.
drop function public.begin_session_submission(uuid, uuid);

create function public.begin_session_submission(
  target_session uuid,
  participant uuid,
  requested_position smallint default null
)
returns table (refusal text, item_position smallint, item_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  found_session public.sessions%rowtype;
begin
  if not private.take_session_submission(participant) then
    return query select 'rate_limited'::text, null::smallint, null::uuid;
    return;
  end if;

  select * into found_session from public.sessions s where s.id = target_session;
  if not found or found_session.status = 'ended' then
    return query select 'not_open'::text, null::smallint, null::uuid;
    return;
  end if;
  if found_session.status = 'lobby' or found_session.current_position is null then
    return query select 'not_started'::text, null::smallint, null::uuid;
    return;
  end if;
  if found_session.status = 'paused' then
    return query select 'paused'::text, null::smallint, null::uuid;
    return;
  end if;
  if found_session.reveal then
    return query select 'already_revealed'::text, null::smallint, null::uuid;
    return;
  end if;
  if found_session.item_ends_at is not null
     and now() > found_session.item_ends_at + interval '2 seconds' then
    return query select 'time_up'::text, null::smallint, null::uuid;
    return;
  end if;

  -- #185: a student-paced phone answers the item it names, anywhere in the set. Nothing it names
  -- outside the set is an item of this room.
  if found_session.mode = 'student_paced' then
    if requested_position is null
       or requested_position < 1
       or requested_position > jsonb_array_length(found_session.item_set) then
      return query select 'wrong_item'::text, null::smallint, null::uuid;
      return;
    end if;
    return query select
      null::text,
      requested_position,
      (found_session.item_set ->> (requested_position - 1))::uuid;
    return;
  end if;

  return query select
    null::text,
    found_session.current_position,
    (found_session.item_set ->> (found_session.current_position - 1))::uuid;
end;
$$;

revoke all on function public.begin_session_submission(uuid, uuid, smallint)
  from public, anon, authenticated;
grant execute on function public.begin_session_submission(uuid, uuid, smallint) to service_role;

-- #182's function, the same signature, with the position check split by pacing: an
-- instructor-paced answer must be to the item the room is on, a student-paced one to the item at
-- the place it names. Everything else, and its order, is unchanged.
create or replace function public.record_session_response(
  target_session uuid,
  participant uuid,
  at_position smallint,
  target_item uuid,
  answer jsonb,
  earned numeric,
  possible numeric,
  scoring_model text,
  marks jsonb,
  row_groups jsonb default null
)
returns table (refusal text, submitted_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  found_session public.sessions%rowtype;
  written timestamptz;
begin
  select * into found_session from public.sessions s where s.id = target_session;
  if not found or found_session.status = 'ended' then
    return query select 'not_open'::text, null::timestamptz;
    return;
  end if;
  if found_session.status = 'lobby' or found_session.current_position is null then
    return query select 'not_started'::text, null::timestamptz;
    return;
  end if;
  if found_session.status = 'paused' then
    return query select 'paused'::text, null::timestamptz;
    return;
  end if;
  if found_session.reveal then
    return query select 'already_revealed'::text, null::timestamptz;
    return;
  end if;
  if found_session.item_ends_at is not null
     and now() > found_session.item_ends_at + interval '2 seconds' then
    return query select 'time_up'::text, null::timestamptz;
    return;
  end if;
  if (found_session.mode = 'instructor_paced' and found_session.current_position <> at_position)
     or at_position is null
     or at_position < 1
     or (found_session.item_set ->> (at_position - 1))::uuid is distinct from target_item then
    return query select 'wrong_item'::text, null::timestamptz;
    return;
  end if;

  begin
    insert into public.session_responses as written_row
      (session_id, org_id, participant_id, item_id, item_position, response,
       points, max_points, model, breakdown, groups)
    values
      (target_session, found_session.org_id, participant, target_item, at_position, answer,
       earned, possible, scoring_model, coalesce(marks, '[]'::jsonb), row_groups)
    returning written_row.submitted_at into written;
  exception when unique_violation then
    -- The only unique constraint this insert can meet is one answer per person per item.
    return query select 'already_answered'::text, null::timestamptz;
    return;
  end;

  return query select null::text, written;
end;
$$;
