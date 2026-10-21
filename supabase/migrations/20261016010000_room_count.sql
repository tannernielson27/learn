-- The waiting screen's count comes from the session's public state, not from Presence (#426).
--
-- Until now every phone in a live session received Realtime Presence: a sync or a diff for every
-- join and every leave anywhere in the room, so a class of N was sent on the order of N squared
-- messages while it gathered. The one thing a student's screen drew from it was "12 in this
-- session" on the waiting screen (#408 already stopped those messages re-rendering anything else).
--
-- What changes here:
--
--   1. `live.session_public_state` gains `participant_count`: how many students are in the room
--      now. Someone who has left is not counted (owner decision, 2026-10-21). A number, and
--      nothing else about who they are. Every phone already receives this row by
--      `postgres_changes` (`replica identity full`), so the count rides along with every state
--      change for nothing.
--   2. The mirror trigger is unchanged: it writes the columns it always wrote and leaves the count
--      as it is, because who is in the room is not something the session row knows.
--   3. `public.refresh_participant_count(target, present)` is how the count changes. Only the
--      host's console knows who is still here, because only it keeps Presence, so it reports the
--      size of its roster, at most once every few seconds, when that size changes. The database
--      caps the number at how many have ever joined (300 at most, `private.session_is_full`) and
--      writes the row only if the number changed and the session has not ended.
--   4. `public.open_session_view` answers with the stored count as well, at least 1 for the phone
--      asking, so a phone has a number the moment it enters or rejoins, before any row reaches it.
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
-- Order: the app deploys before this is pushed, as always. A phone still on the old page joins
-- with presence on; Realtime then checks both reads and lets it in on `broadcast`
-- (`broadcast_read? || presence_read?`), so it keeps its channel and only its count stops moving
-- until it reloads. To undo the policy, put `'presence'` back in the select's `extension in (...)`
-- as `20260921210000_private_live_channel.sql` wrote it.
--
-- Applies on a fresh replay; one column, one function replaced, one created, one policy replaced.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table live.session_public_state
  add column participant_count integer not null default 0
    constraint session_public_state_participant_count_check check (participant_count >= 0);

comment on column live.session_public_state.participant_count is
  'How many students are in the room now (#426): the waiting screen''s "12 in this session". '
  'A number only; who they are is Presence, which only the host reads. Written only by '
  'refresh_participant_count, from the host console''s roster, capped at how many have joined.';

-- No backfill: who is in a room open at this moment is Presence, which the database cannot read.
-- The host's console reports it on its next roster sync, within a few seconds.

-- ---------------------------------------------------------------------------
-- 3. The host reports who is in the room
-- ---------------------------------------------------------------------------

-- Called by the host's console (`hostTransport.ts`) with the size of its Presence roster,
-- throttled there to once every few seconds and only when that size has changed. Presence is the
-- one thing that knows a student has left, and only the host reads it.
--
-- Security definer because nobody but the database's own functions may write
-- `live.session_public_state`. The caller is held to the same rule `public.sessions`' update
-- policy holds a host to: an author in the session's org. Anyone else, and a session that does
-- not exist, is told the session is gone (P0002), as `stop_item_timer` tells them, so the
-- function says nothing about other orgs' rooms.
--
-- The number is the host's to give, for its own room, so it is taken, but bounded: never below
-- zero and never above how many have joined (an index-only count of at most 300 rows,
-- `participants_session_id_idx`). Writes the row only when the number changed and the room has
-- not ended, so a report that changes nothing sends phones nothing.
--
-- What it does not cover: a room whose host console is closed. Its count then stays where the
-- console last left it.
create function public.refresh_participant_count(target uuid, present integer) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  in_room integer;
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

  select least(greatest(coalesce(present, 0), 0), count(*)::integer) into in_room
    from public.participants p
   where p.session_id = target;

  update live.session_public_state m
     set participant_count = in_room,
         updated_at = now()
   where m.session_id = target
     and m.status <> 'ended'
     and m.participant_count is distinct from in_room;
end;
$$;

comment on function public.refresh_participant_count(uuid, integer) is
  'Sets live.session_public_state.participant_count to how many students the host''s console sees '
  'in the room, for a session the caller hosts (#426), capped at how many have joined. Writes, and '
  'so sends phones a row, only when the number changed and the room is open.';

revoke all on function public.refresh_participant_count(uuid, integer)
  from public, anon, service_role;
grant execute on function public.refresh_participant_count(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The view read answers with the count
-- ---------------------------------------------------------------------------

-- #407's function with one column added at the end: the stored count, read off the mirror, and
-- at least 1, because the phone asking is in the room even before the host has reported it.
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
  in_room integer;
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

  -- #426: how many are in the room as the host last reported it, this participant at least.
  select greatest(coalesce(m.participant_count, 0), 1) into in_room
    from live.session_public_state m
   where m.session_id = target_session;

  return query select null::text, found_session.status, found_session.mode,
                      found_session.current_position, found_session.reveal,
                      found_session.item_set, found_session.timer_seconds,
                      found_session.item_ends_at, found_session.timer_remaining_ms, now(),
                      shown_items, own_answers, coalesce(in_room, 1);
end;
$$;

comment on function public.open_session_view(uuid, uuid, text) is
  'Everything POST /api/live/view needs in one call: checks the participant token, charges the '
  'per-participant view limit, and answers with the room, the item or set it is on, this '
  'participant''s own answers (#407) and how many are in the room (#426). Returns items with their '
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
