-- The waiting screen's count comes from the session's public state, not from Presence (#426).
--
-- Until now every phone in a live session received Realtime Presence: a sync or a diff for every
-- join and every leave anywhere in the room, so a class of N was sent on the order of N squared
-- messages while it gathered. The one thing a student's screen drew from it was "12 in this
-- session" on the waiting screen (#408 already stopped those messages re-rendering anything else).
--
-- What changes here:
--
--   1. `live.session_public_state` gains `participant_count`: how many people have joined this
--      session. A number, and nothing else about who they are. Every phone already receives this
--      row by `postgres_changes` (`replica identity full`), so the count rides along with every
--      state change for nothing.
--   2. The mirror trigger writes the count whenever it writes the state. It still writes only when
--      something a student sees has changed; a join on its own does not write the row here.
--   3. `public.refresh_participant_count(target)` is the bounded refresh: the host's console calls
--      it, at most once every few seconds, when its own roster (which keeps Presence) sees someone
--      new. It writes the row only if the count has actually changed and the session has not
--      ended, so whatever calls it, a session's row changes for its count at most once per join.
--      Joins are capped at 300 a session (`private.session_is_full`), which bounds that too.
--   4. `public.open_session_view` answers with the count as well, so a phone has the number the
--      moment it enters or rejoins, itself included, before any row has reached it.
--   5. A participant may no longer READ presence on its session's channel. It may still track
--      (the insert policy is unchanged), so the host still sees every phone. See below.
--
-- ## Why the policy, and not only the client (5)
--
-- Leaving the presence listener off in realtime-js makes the socket join with
-- `presence.enabled: false`. Read in the Realtime server's source (supabase/realtime, main at
-- 5bce1ee, 2026-10-16), that is not enough on its own: `PresenceHandler.track/2` sets
-- `presence_enabled?` to true on the socket the first time it tracks and asks for a full
-- `presence_state` resync, and `presence_diff` is then delivered to any private-channel socket for
-- which `policies.presence.read` is true (`can_read_presence?`). The read policy is evaluated on
-- demand at that first track. So a phone that tracks itself receives the whole roster unless the
-- `realtime.messages` select policy refuses it presence. Joining still works: with presence off at
-- join, Realtime checks only the `broadcast` read (`extensions_to_check/1`), which stays granted,
-- and the write check behind `track` inserts with `returning: false`, so it needs no select.
--
-- What this file does not prove is what the hosted Realtime version does; that is the hosted
-- before/after measurement #426 asks for, pending the load target (#405).
--
-- Applies on a fresh replay; one column, two functions replaced, one created, one policy replaced.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table live.session_public_state
  add column participant_count integer not null default 0
    constraint session_public_state_participant_count_check check (participant_count >= 0);

comment on column live.session_public_state.participant_count is
  'How many people have joined this session (#426): the waiting screen''s "12 in this session". '
  'A number only; who they are is Presence, which only the host reads. Written by the mirror '
  'trigger with every state change and by refresh_participant_count, never more than once a join.';

update live.session_public_state m
   set participant_count = c.joined
  from (select p.session_id, count(*)::integer as joined
          from public.participants p
         group by p.session_id) c
 where c.session_id = m.session_id;

-- ---------------------------------------------------------------------------
-- 2. The mirror writes the count with the state
-- ---------------------------------------------------------------------------

-- #182's function with one column added to the row. The early return is unchanged: a session
-- update that changes nothing a student sees still writes nothing, and the count alone never
-- makes this trigger write. `participants_session_id_idx` makes the count an index-only range of
-- at most 300 rows.
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
     timer_remaining_ms, participant_count, updated_at)
  values
    (new.id, new.status, new.current_position, jsonb_array_length(new.item_set), new.reveal,
     new.item_ends_at, new.timer_seconds, new.timer_remaining_ms,
     (select count(*)::integer from public.participants p where p.session_id = new.id), now())
  on conflict (session_id) do update set
    status = excluded.status,
    item_position = excluded.item_position,
    item_count = excluded.item_count,
    reveal = excluded.reveal,
    item_ends_at = excluded.item_ends_at,
    timer_seconds = excluded.timer_seconds,
    timer_remaining_ms = excluded.timer_remaining_ms,
    participant_count = excluded.participant_count,
    updated_at = now();
  return null;
end;
$$;

revoke all on function private.mirror_session_state() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The bounded refresh
-- ---------------------------------------------------------------------------

-- Called by the host's console (`hostTransport.ts`), throttled there to once every few seconds,
-- when Presence shows it a participant it has not seen before. The database decides the number;
-- the caller only says "now is a good time to look".
--
-- Security definer because nobody but the mirror may write `live.session_public_state`. The
-- caller is held to the same rule `public.sessions`' update policy holds a host to: an author in
-- the session's org. Anyone else, and a session that does not exist, is told the session is gone
-- (P0002), as `stop_item_timer` tells them, so the function says nothing about other orgs' rooms.
--
-- Writes the row only when the count has changed and the room has not ended, so a refresh that
-- finds nothing new sends phones nothing at all.
create function public.refresh_participant_count(target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.sessions s
     where s.id = target
       and (select private.is_author())
       and s.org_id = (select private.current_org_id())
  ) then
    raise exception 'that session does not exist' using errcode = 'P0002';
  end if;

  update live.session_public_state m
     set participant_count = c.joined,
         updated_at = now()
    from (select count(*)::integer as joined
            from public.participants p
           where p.session_id = target) c
   where m.session_id = target
     and m.status <> 'ended'
     and m.participant_count is distinct from c.joined;
end;
$$;

comment on function public.refresh_participant_count(uuid) is
  'Brings live.session_public_state.participant_count up to date for a session the caller hosts '
  '(#426). Writes, and so sends phones a row, only when the count changed and the room is open.';

revoke all on function public.refresh_participant_count(uuid) from public, anon;
grant execute on function public.refresh_participant_count(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The view read answers with the count
-- ---------------------------------------------------------------------------

-- #407's function with one column added at the end: how many have joined, counted here rather than
-- read off the mirror, because a join does not write the mirror and a phone entering must count
-- itself. An index-only count of at most 300 rows (`participants_session_id_idx`). A phone keeps
-- the larger of this and what the mirror sends it, since nobody is ever taken out of the count.
-- The return type changes, so the function is dropped and created again; the grant is given back
-- below. Everything else is word for word what `20261013120000_open_session_view.sql` wrote, and
-- its header is still the explanation of it.
drop function public.open_session_view(uuid, uuid, text);

create function public.open_session_view(
  target_participant uuid,
  target_session uuid,
  presented_secret text
)
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
  server_now timestamptz,
  view_items jsonb,
  view_answers jsonb,
  session_participants integer
)
language plpgsql security definer set search_path = ''
as $$
declare
  found_session public.sessions%rowtype;
  on_items boolean;
  whole_set boolean;
  shown_items jsonb := '[]'::jsonb;
  own_answers jsonb := '[]'::jsonb;
  joined integer;
begin
  if not exists (
    select 1
      from public.participants p
     where p.id = target_participant
       and p.session_id = target_session
       and p.rejoin_hash = extensions.digest(coalesce(presented_secret, ''), 'sha256')
  ) then
    return;
  end if;

  if not private.take_session_view(target_participant) then
    return query select 'rate_limited'::text, null::public.session_status,
                        null::public.session_mode, null::smallint, null::boolean, null::jsonb,
                        null::integer, null::timestamptz, null::integer, now(),
                        null::jsonb, null::jsonb, null::integer;
    return;
  end if;

  select * into found_session from public.sessions s where s.id = target_session;
  if not found then
    return;
  end if;

  on_items := found_session.status in ('running', 'paused');
  whole_set := on_items and found_session.mode = 'student_paced';
  on_items := on_items and (whole_set or found_session.current_position is not null);

  if on_items then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', i.id,
             'type', i.type,
             'cjmm_step', i.cjmm_step,
             'tags', i.tags,
             'version', i.version,
             'content', i.content,
             'answer_key', i.answer_key,
             'rationale', i.rationale,
             'scoring', i.scoring)), '[]'::jsonb)
      into shown_items
      from public.items i
     where i.id in (
             select e.item_id::uuid
               from jsonb_array_elements_text(found_session.item_set)
                    with ordinality as e (item_id, place)
              where whole_set or e.place = found_session.current_position);

    select coalesce(jsonb_agg(
             jsonb_build_object(
               'item_position', r.item_position,
               'response', r.response,
               'submitted_at', r.submitted_at)
             || case when found_session.reveal then jsonb_build_object(
                  'points', r.points,
                  'max_points', r.max_points,
                  'model', r.model,
                  'breakdown', r.breakdown,
                  'groups', r.groups,
                  'reveal', r.reveal)
                else '{}'::jsonb end), '[]'::jsonb)
      into own_answers
      from public.session_responses r
     where r.session_id = target_session
       and r.participant_id = target_participant
       and (whole_set or r.item_position = found_session.current_position);
  end if;

  -- #426: how many have joined, this participant among them.
  select count(*)::integer into joined
    from public.participants p
   where p.session_id = target_session;

  return query select null::text, found_session.status, found_session.mode,
                      found_session.current_position, found_session.reveal,
                      found_session.item_set, found_session.timer_seconds,
                      found_session.item_ends_at, found_session.timer_remaining_ms, now(),
                      shown_items, own_answers, joined;
end;
$$;

comment on function public.open_session_view(uuid, uuid, text) is
  'Everything POST /api/live/view needs in one call: checks the participant token, charges the '
  'per-participant view limit, and answers with the room, the item or set it is on, this '
  'participant''s own answers (#407) and how many have joined (#426). Returns items with their '
  'keys; service_role only, and the route strips every key before it answers.';

revoke all on function public.open_session_view(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.open_session_view(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. A participant joins and tracks, and does not read the roster
-- ---------------------------------------------------------------------------

-- #149's policy with `presence` taken out of the select. `broadcast` stays: it is what Realtime
-- checks when a socket joins with presence off, and nothing in this app broadcasts, so it lets a
-- phone in and hands it nothing. The insert policy that lets a phone track is untouched, and so
-- is the author's select policy: the host still reads every join and leave.
drop policy "a participant joins their own session's channel" on realtime.messages;

create policy "a participant joins their own session's channel"
  on realtime.messages for select to anon
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'live:' || ((select auth.jwt()) ->> 'live_session_id')
  );
