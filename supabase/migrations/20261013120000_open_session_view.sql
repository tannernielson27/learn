-- ---------------------------------------------------------------------------
-- One round trip for a phone to read the room (#407)
-- ---------------------------------------------------------------------------
--
-- Every move the host makes sends every phone to `POST /api/live/view`, and the route answered
-- each of them with four database calls one after another, five once the answers were showing:
--
--   1. `resume_participant`  — who is asking (and an UPDATE of `participants.last_seen_at`)
--   2. `begin_session_view`  — the rate limit (an upsert) and the room
--   3. a select of the item, or of the whole set in a student-paced room
--   4. a select of this participant's own answer
--   5. after the reveal, a second select of the same row for its marks
--
-- A class of 100 is therefore 400 to 500 calls and 200 writes in the instant the host presses a
-- button. #404 measured that as the one route that was refused and the slowest in every run.
--
-- `open_session_view` is those calls as one, in the same order and with the same answers:
--
--   * **Who is asking** is `resume_participant`'s check, word for word: the token's secret is
--     matched against the stored hash for that participant in that session. A wrong or missing
--     secret, a participant that is gone and a session that is gone all answer with no rows, and
--     a caller cannot tell them apart.
--   * **How often** is `private.take_session_view`, the same function `begin_session_view`
--     charges: the same counter, the same 600 calls in five minutes, the same `rate_limited`
--     refusal with nothing else in the row. Charged only after the secret has matched, so nobody
--     can spend a budget that is not theirs. A refused call reads nothing further.
--   * **The room** is `begin_session_view`'s ten columns, unchanged.
--   * **The item** is the row the route used to select: the one the room is on, or every item of
--     the set while a student-paced room is running or paused, and none at any other moment.
--   * **Their own answers** are the rows the route used to select, for those same positions. The
--     marks and the key the answer was scored with are in the row **only when `sessions.reveal`
--     is true**; before that they are not read at all, exactly as the route did not select them
--     (ADR 0003).
--
-- **`last_seen_at` is not written.** `resume_participant` set it on every call and nothing reads
-- it: no query in the app selects the column, and the roster is Realtime Presence (#132). The
-- column stays, and `resume_participant` still sets it where it is still called (joining, the
-- play page, submitting, a channel token). This function is the read a whole class makes at once,
-- and it now makes one write, the rate limit's, instead of two.
--
-- **What comes back carries answer keys, and that is not new.** The route has always read
-- `public.items` with its key under the service role, because it needs the key at the reveal and
-- validates the whole item before showing any of it. The rule is what it was: this function is
-- granted to `service_role` alone, its only caller is this app's own server, and nothing it
-- returns is forwarded as it is — `viewRoute.ts` passes every item through `toKeylessItem` before
-- a byte is serialized, and `src/lib/liveSupabase/viewRoute.test.ts` reads the response bytes to
-- say so.
--
-- `security definer` because it has to be: `private.take_session_view` and the table behind it
-- are revoked from every role, `service_role` included.
--
-- `begin_session_view` and `resume_participant` are left exactly as they are. The app deploys
-- before this migration is pushed, so the route calls this function and falls back to those two
-- when the database answers that it has never heard of it; the channel-token route still uses
-- them both.
--
-- Volatile, because `private.take_session_view` writes.
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
  view_answers jsonb
)
language plpgsql security definer set search_path = ''
as $$
declare
  found_session public.sessions%rowtype;
  on_items boolean;
  whole_set boolean;
  shown_items jsonb := '[]'::jsonb;
  own_answers jsonb := '[]'::jsonb;
begin
  -- A missing or malformed secret hashes to something no row holds, so it takes the same path as
  -- a wrong one: no rows.
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
                        null::jsonb, null::jsonb;
    return;
  end if;

  select * into found_session from public.sessions s where s.id = target_session;
  if not found then
    return;
  end if;

  -- `itemAt` and `pacedSet` in src/lib/live/state.ts, said once more: a room shows items only
  -- while it is running or paused. A student-paced room then shows its whole set, and any other
  -- room the one item it is on.
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

    -- What they sent and when; and, only once the answers are showing, what it earned and the key
    -- it was scored with.
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

  return query select null::text, found_session.status, found_session.mode,
                      found_session.current_position, found_session.reveal,
                      found_session.item_set, found_session.timer_seconds,
                      found_session.item_ends_at, found_session.timer_remaining_ms, now(),
                      shown_items, own_answers;
end;
$$;

comment on function public.open_session_view(uuid, uuid, text) is
  'Everything POST /api/live/view needs in one call: checks the participant token, charges the '
  'per-participant view limit, and answers with the room, the item or set it is on and this '
  'participant''s own answers (#407). Returns items with their keys; service_role only, and the '
  'route strips every key before it answers.';

-- Granted to service_role alone, so the only caller is this app's own server: the token is read
-- from #129's httpOnly cookie there, never taken from a browser's request body.
revoke all on function public.open_session_view(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.open_session_view(uuid, uuid, text) to service_role;
