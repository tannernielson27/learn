-- The per-item timer (#182): a host puts a time on each item, the room counts down together, and
-- answers stop being taken when it runs out.
--
-- #128 already gave `public.sessions` the two columns this is built on — `timer_seconds`, the time
-- the host chose per item, and `item_ends_at`, when the item the room is on runs out — and #131
-- already mirrors `item_ends_at` to the phones. Neither was ever written by anything. This makes
-- them mean something:
--
--   * `private.guard_session_change` now **derives** the clock on every room move, from `now()`,
--     which is the only clock in the system everyone has to agree with. A client never says when an
--     item ends; it says "advance" and the trigger works out the rest. The rules are
--     `settleTimer` in `src/lib/live/timer.ts`, move for move, and the pgTAP file for this
--     migration walks the same moves that file's tests do.
--   * A pause has to *freeze* the clock and a resume has to give back what was left, so a third
--     column holds it while the room is paused: `timer_remaining_ms`. At most one of `item_ends_at`
--     and `timer_remaining_ms` is ever set — a running clock has an end, a frozen one has a
--     remainder. A pause freezes only a clock that is still running: one that has already run out
--     is left as it was, so pausing and resuming can never hand back time that was up.
--   * The submission functions refuse an answer with `time_up` once `now()` is more than two
--     seconds past `item_ends_at` — the grace is for a request in the air, not for a phone's clock,
--     which is never asked.
--   * The host's two timer buttons are two functions, `extend_item_timer` ("add 15 seconds") and
--     `stop_item_timer`. Security invoker, so the org's row level security decides who may, exactly
--     as it does for every other move.
--   * The phones learn the chosen time and the frozen remainder over the same mirror as the rest,
--     and `begin_session_view` answers with the whole clock and the database's own `now()`, which
--     is what lets a phone whose clock is two minutes off count down correctly.
--
-- Expiry does NOT advance the room. The host still does (#182's owner decision). Nothing here runs
-- on a schedule: an expired timer is only ever a time compared with `now()`.

-- ---------------------------------------------------------------------------
-- The frozen clock, and what shape a clock may have
-- ---------------------------------------------------------------------------

alter table public.sessions
  add column timer_remaining_ms integer check (timer_remaining_ms between 0 and 3600000);

comment on column public.sessions.timer_remaining_ms is
  'What was left on the item''s clock when the room paused, in milliseconds. Null unless the room '
  'is paused with a clock frozen. Written only by private.guard_session_change and the two timer '
  'functions; see migration 20260923010000_item_timer.sql.';

alter table public.sessions
  -- A running clock has an end and a frozen one has a remainder; never both.
  add constraint sessions_timer_one_clock
    check (item_ends_at is null or timer_remaining_ms is null),
  -- Only a paused room has a frozen clock.
  add constraint sessions_timer_frozen_only_when_paused
    check (timer_remaining_ms is null or status = 'paused'),
  -- A clock only ever runs on an item the room is on, and stops when the key is shown: an answer
  -- is refused once the key is up anyway, and a countdown over a revealed item would be a lie.
  add constraint sessions_timer_needs_open_item check (
    (item_ends_at is null and timer_remaining_ms is null)
    or (current_position is not null and status in ('running', 'paused') and not reveal)
  );

-- `item_ends_at` was already a host column (#128). Its partner joins it, so `extend_item_timer` and
-- `stop_item_timer`, which run as the host, can write both. What either may be set to is the
-- trigger's decision below, not the grant's.
grant update (timer_remaining_ms) on public.sessions to authenticated;

-- ---------------------------------------------------------------------------
-- The state machine, now with a clock
-- ---------------------------------------------------------------------------

-- Milliseconds from now until `t`, never below zero. `now()` is the transaction's start, so every
-- reading inside one statement agrees with every other.
create function private.ms_until(t timestamptz) returns integer
language sql stable set search_path = ''
as $$
  select greatest(0, round(extract(epoch from (t - now())) * 1000))::integer;
$$;

revoke all on function private.ms_until(timestamptz) from public, anon;
-- The guard trigger runs as whoever wrote the row, which for every move is a host.
grant execute on function private.ms_until(timestamptz) to authenticated;

-- #128's function, unchanged down to the `ended` settlement, then the clock. Replaced whole rather
-- than wrapped, so there is still exactly one place that says what a session may become.
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
-- The host's two timer buttons
-- ---------------------------------------------------------------------------

-- "Add 15 seconds". A running clock gets fifteen more seconds from its end — or from now, if it
-- had already run out, so the host's "a little longer" is time the room can use. A paused room's
-- clock stays frozen and holds fifteen seconds more. Never past an hour. `extendTimer` in
-- src/lib/live/timer.ts is the same rule.
--
-- Security invoker: row level security decides whose session this may be, and the guard trigger
-- decides what the clock may become, exactly as for every other move.
create function public.extend_item_timer(target uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  found_session public.sessions%rowtype;
begin
  -- Locked, so two hosts pressing at once add thirty seconds rather than fifteen twice over the
  -- same starting point.
  select * into found_session from public.sessions s where s.id = target for update;
  if not found then
    raise exception 'that session does not exist' using errcode = 'P0002';
  end if;
  if found_session.item_ends_at is null and found_session.timer_remaining_ms is null then
    raise exception 'this item has no timer running' using errcode = '22023';
  end if;

  if found_session.status = 'paused' then
    update public.sessions
       set item_ends_at = null,
           timer_remaining_ms = least(coalesce(found_session.timer_remaining_ms, 0) + 15000, 3600000)
     where id = target;
  else
    update public.sessions
       set timer_remaining_ms = null,
           item_ends_at = least(greatest(found_session.item_ends_at, now()) + interval '15 seconds',
                                now() + interval '1 hour')
     where id = target;
  end if;
end;
$$;

revoke all on function public.extend_item_timer(uuid) from public, anon;
grant execute on function public.extend_item_timer(uuid) to authenticated;

-- "Stop timer": the item takes answers until the host moves on. Idempotent, so a double tap is not
-- an error; a session the caller cannot see reads as gone.
create function public.stop_item_timer(target uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.sessions
     set item_ends_at = null, timer_remaining_ms = null
   where id = target and (item_ends_at is not null or timer_remaining_ms is not null);
  if found then
    return;
  end if;
  if not exists (select 1 from public.sessions s where s.id = target) then
    raise exception 'that session does not exist' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.stop_item_timer(uuid) from public, anon;
grant execute on function public.stop_item_timer(uuid) to authenticated;

-- The database's own clock, for a host console to count down against (#182). A laptop's clock can
-- be as wrong as a phone's; this is one indexed-nothing round trip on open.
create function public.server_clock() returns timestamptz
language sql stable security invoker set search_path = ''
as $$
  select now();
$$;

revoke all on function public.server_clock() from public, anon;
grant execute on function public.server_clock() to authenticated;

-- ---------------------------------------------------------------------------
-- What the phones are told
-- ---------------------------------------------------------------------------

-- The chosen time and the frozen remainder join the end time the mirror already carried. None of
-- them says anything about the answer, and all three are about to be on every phone's screen.
alter table live.session_public_state
  add column timer_seconds integer,
  add column timer_remaining_ms integer;

update live.session_public_state m
   set timer_seconds = s.timer_seconds, timer_remaining_ms = s.timer_remaining_ms
  from public.sessions s
 where s.id = m.session_id;

-- #131's function, with the two new columns: in the "has anything a student may see changed?"
-- test, and in the row. A host choosing a time is now news to a phone, because the phone shows it.
create or replace function private.mirror_session_state() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.current_position is not distinct from old.current_position
     and new.reveal is not distinct from old.reveal
     and new.item_ends_at is not distinct from old.item_ends_at
     and new.timer_seconds is not distinct from old.timer_seconds
     and new.timer_remaining_ms is not distinct from old.timer_remaining_ms then
    return null;
  end if;

  insert into live.session_public_state as m
    (session_id, status, item_position, item_count, reveal, item_ends_at, timer_seconds,
     timer_remaining_ms, updated_at)
  values
    (new.id, new.status, new.current_position, jsonb_array_length(new.item_set), new.reveal,
     new.item_ends_at, new.timer_seconds, new.timer_remaining_ms, now())
  on conflict (session_id) do update set
    status = excluded.status,
    item_position = excluded.item_position,
    item_count = excluded.item_count,
    reveal = excluded.reveal,
    item_ends_at = excluded.item_ends_at,
    timer_seconds = excluded.timer_seconds,
    timer_remaining_ms = excluded.timer_remaining_ms,
    updated_at = now();
  return null;
end;
$$;

revoke all on function private.mirror_session_state() from public, anon, authenticated;

-- The view route's read (#152), with the clock added: the three timer columns, and `now()` so the
-- phone can tell how far its own clock is from the session's. The return type changes, so the
-- function is dropped and created again rather than replaced; its grant goes with it and is given
-- back below.
drop function public.begin_session_view(uuid, uuid);

create function public.begin_session_view(target_session uuid, participant uuid)
returns table (
  refusal text,
  session_status public.session_status,
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
    return query select 'rate_limited'::text, null::public.session_status, null::smallint,
                        null::boolean, null::jsonb, null::integer, null::timestamptz,
                        null::integer, now();
    return;
  end if;

  return query
    select null::text, s.status, s.current_position, s.reveal, s.item_set, s.timer_seconds,
           s.item_ends_at, s.timer_remaining_ms, now()
      from public.sessions s
     where s.id = target_session;
end;
$$;

revoke all on function public.begin_session_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_session_view(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Refusing a late answer
-- ---------------------------------------------------------------------------

-- #131's two functions with one check added, in the same place in both and in `canSubmit`: after
-- "the key is showing" and before "the room moved on". Two seconds of grace, for the request in
-- the air. `now()` is the database's; nothing a phone says about the time is ever read.
create or replace function public.begin_session_submission(target_session uuid, participant uuid)
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

  return query select
    null::text,
    found_session.current_position,
    (found_session.item_set ->> (found_session.current_position - 1))::uuid;
end;
$$;

-- The check that decides: it shares a statement with the insert, so an answer scored across the
-- moment the time ran out is judged by when it is written, like one scored across a reveal.
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
  if found_session.current_position <> at_position
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
    return query select 'already_answered'::text, null::timestamptz;
    return;
  end;

  return query select null::text, written;
end;
$$;
