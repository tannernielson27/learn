-- #565: a teacher can tidy up their live sessions. They can rename one, and archive one that has
-- ended so it leaves the main list (and restore it again). Deleting stays impossible: a session
-- is the record of a class that happened (#128), and students' results hang off it. Archiving
-- only hides it from the teacher's list. Students' own results, class progress and reports
-- still read it.
--
-- Until now an ended session could not change at all, so this does three things:
--   1. adds `archived_at`, set only on an ended session;
--   2. grants authors update on it, beside `title`, which they already had;
--   3. teaches `private.guard_session_change` one new case, near the top. A write that changes
--      the title or the archive mark and nothing else is let through, ended or not, but only for
--      the session's host. Everything else falls through to the rules as they were, so an
--      ended session still refuses every other change.

alter table public.sessions
  add column archived_at timestamptz,
  add constraint sessions_archived_only_ended check (archived_at is null or status = 'ended');

comment on column public.sessions.archived_at is
  'When the host archived this ended session, or null. Archived sessions are left out of the '
  'teacher''s Live sessions list by default (#565); nothing else treats them differently. Set to '
  'the server''s time by private.guard_session_change, whatever the client sent.';

grant update (archived_at) on public.sessions to authenticated;

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

  -- #565: housekeeping. A rename or an archive (or restore), with nothing else in the same
  -- write, is allowed on any session, ended or not, but only for its host. Organisation-wide
  -- update rights let a co-teacher pick up a running room; tidying up someone else's history
  -- is not part of that. No user id at all is the owner or a migration, which may.
  if (new.title is distinct from old.title or new.archived_at is distinct from old.archived_at)
     and to_jsonb(new) - 'title' - 'archived_at' - 'updated_at'
       = to_jsonb(old) - 'title' - 'archived_at' - 'updated_at' then
    if (select auth.uid()) is not null and (select auth.uid()) is distinct from old.host_id then
      raise exception 'only the teacher who ran a live session can rename or archive it'
        using errcode = '42501';
    end if;
    if new.archived_at is distinct from old.archived_at then
      if old.status <> 'ended' then
        raise exception 'a live session can be archived only once it has ended'
          using errcode = '22023';
      end if;
      -- The time is the server's, never the client's; archiving twice keeps the first time.
      new.archived_at := case when new.archived_at is null then null
                              else coalesce(old.archived_at, now()) end;
    end if;
    new.updated_at := now();
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
