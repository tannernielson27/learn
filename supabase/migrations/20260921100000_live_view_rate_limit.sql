-- ---------------------------------------------------------------------------
-- How often one person may read the room (#152)
-- ---------------------------------------------------------------------------
--
-- `src/lib/live/transport.ts` says an adapter with a network boundary owes the interface a rate
-- limit on join and submit. Join is #129's and submit is #131's. This is the third one the same
-- reasoning reaches and the one nobody wrote down: `POST /api/live/view`.
--
-- A participant token is required, so the route is not anonymous. It is still uncapped, and every
-- call costs an `UPDATE public.participants SET last_seen_at` in `resume_participant`, a read of
-- the session, a read of the item and a read of that participant's own response. #132 made a
-- phone fetch the view on every state change rather than only on entry, so the call rate — and
-- with it the write rate — is higher than it was when `resume_participant` was written. One
-- participant of one room can spin all of that as fast as it likes.
--
-- Everything below is `private.take_session_submission`'s shape, deliberately and line for line:
-- the same table columns, the same five-minute window, the same `least(calls + 1, limit + 1)` so
-- hammering does not lengthen the wait, the same 0.5%-of-calls sweep twelve windows back, the
-- same `rate_limited` refusal code. A second dialect for the same idea is how #129 and #131
-- shipped two answers to "who is speaking?"; there is one answer to "how often may you?" and this
-- is it, said twice with two counters rather than said twice two ways.
--
-- **Keyed by participant, not by address**, for #131's reason: one classroom is one address, so a
-- per-address budget would let one script lock a whole class out of seeing the item.
--
-- **In `private`, not in `public.participants`.** The counter could have been two columns on the
-- participant row, which would have saved a table. It is not, because that row is already written
-- on every single call by `resume_participant` and widening what that UPDATE touches is the
-- opposite of what this story is for. `private.session_views` is not published, has no index but
-- its primary key and its sweep index, and is never read by anything but the function below.

create table private.session_views (
  participant_id uuid primary key,
  window_start timestamptz not null,
  calls integer not null check (calls >= 1)
);

comment on table private.session_views is
  'How many times one participant has read the room in the current window. Charged by '
  'private.take_session_view from public.begin_session_view, which POST /api/live/view calls '
  'before it reads anything (#152).';

alter table private.session_views enable row level security;
revoke all on private.session_views from public, anon, authenticated, service_role;
create index session_views_window_start_idx on private.session_views (window_start);

-- The number, and why it is not submit's 120.
--
-- A participant answers an item once; `session_responses_once` stops the second, so 120 answers
-- in five minutes is already far past real use. Reading the room is not once per item: a phone
-- fetches the view when it enters, when the host advances, when the host reveals, and again on
-- every reconnect, because a rejoined Realtime channel replays nothing (see
-- `participantTransport.ts`). A fast host running twenty items in five minutes with a reveal on
-- each is forty calls before a single reconnect, and a phone on bad school wifi can add a great
-- many. 600 is an order of magnitude above that — two calls a second, sustained, for five
-- minutes — and still three orders below what a script on the same cookie would manage. It caps
-- the write rate one participant can put on `public.participants`, which is the point; it is not
-- trying to be tight.
create function private.take_session_view(participant uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  window_length constant interval := interval '5 minutes';
  limit_calls constant integer := 600;
  used integer;
begin
  -- Swept on a small fraction of calls, like private.session_submits: the table is bounded by the
  -- number of participants ever seen, not by anything that shrinks. The cut-off is twelve windows
  -- back, so the sweep can never reach a live counter and is not a way to clear anyone's budget.
  if random() < 0.005 then
    delete from private.session_views where window_start < now() - (window_length * 12);
  end if;

  insert into private.session_views as l (participant_id, window_start, calls)
  values (participant, now(), 1)
  on conflict (participant_id) do update
    set window_start = case
          when l.window_start <= now() - window_length then now()
          else l.window_start
        end,
        calls = case
          when l.window_start <= now() - window_length then 1
          else least(l.calls + 1, limit_calls + 1)
        end
  returning calls into used;

  return used <= limit_calls;
end;
$$;

revoke all on function private.take_session_view(uuid)
  from public, anon, authenticated, service_role;

-- What the view route needs before it reads anything: whether this participant may read the room
-- at all, and the four columns of `public.sessions` a student is allowed to know about.
--
-- It replaces the route's own `select status, current_position, reveal, item_set from sessions`
-- rather than sitting in front of it, so the limit costs no extra round trip — exactly what
-- `begin_session_submission` does for the submission route, and the reason it is worth folding
-- the two together there as well.
--
-- No code, no host, no org, no title: none of that is a student's (ADR 0003), and the columns
-- here are the same four the route already read.
--
-- A session that is no longer there answers with no rows, not with a refusal. The route turns
-- that into the same 401 it always did: a participant whose session has been deleted is not in a
-- room, and the token is the only thing that said otherwise.
--
-- Volatile, because `private.take_session_view` writes.
create function public.begin_session_view(target_session uuid, participant uuid)
returns table (
  refusal text,
  session_status public.session_status,
  session_position smallint,
  session_reveal boolean,
  session_items jsonb
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.take_session_view(participant) then
    return query select 'rate_limited'::text, null::public.session_status, null::smallint,
                        null::boolean, null::jsonb;
    return;
  end if;

  return query
    select null::text, s.status, s.current_position, s.reveal, s.item_set
      from public.sessions s
     where s.id = target_session;
end;
$$;

-- Granted to service_role alone, so the only caller is this app's own server: the participant id
-- is read from #129's token there, never taken from a browser.
revoke all on function public.begin_session_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_session_view(uuid, uuid) to service_role;
