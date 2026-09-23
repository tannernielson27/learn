-- Skip an item, or go back to one (#183).
--
-- A host command `goto(position)` beside `advance`: the room jumps to any item in its set, forwards
-- or back, while it is running or paused. It is an ordinary update of `current_position`, exactly
-- as `advance` is, so nothing new is granted and no new function is needed. What changes is the one
-- place that says what a session may become, `private.guard_session_change`:
--
--   * A position may change only while the room is running or paused and stays so, or when it
--     leaves the lobby for its first item (`start`). Before this, a row in the lobby could be put
--     on an item without starting, and a running one could have its position cleared.
--   * Every move to another item clears the reveal, whatever the client sent. The key showing was
--     the answer to the item being left.
--   * The clock follows the move by the rule #182 put here (`settleTimer`): the item moved to gets
--     the whole chosen time, running or frozen. Unchanged below, and it already keyed on "the
--     position changed", so a jump back re-arms it exactly as `advance` does.
--
-- Answers already given to an item stay: `session_responses` keeps one row per participant per
-- item, so going back shows that item's results as they were and refuses a second answer from
-- anyone who gave one. `private.push_session_aggregates` already refreshes the item being left on
-- any position change, so a jump pushes one tally, like `advance`.
--
-- Moving to the item the room is already on is not a move at all here (nothing changes); the
-- reducer refuses it as `same_item` so a console never sends it.
--
-- The function is #182's (20260923010000_item_timer.sql) with the position rules added before the
-- `ended` settlement. Replaced whole rather than wrapped, so there is still exactly one place that
-- says what a session may become.

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
