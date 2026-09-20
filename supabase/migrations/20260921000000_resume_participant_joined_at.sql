-- ---------------------------------------------------------------------------
-- `resume_participant` also says when the participant joined (#132)
-- ---------------------------------------------------------------------------
--
-- #132 puts a student's phone into Realtime Presence, and a presence entry carries `joinedAt` so
-- that the roster at the front of the class has an order: first into the room, first in the list,
-- and a phone that drops and comes back keeps the place it had rather than jumping to the end.
--
-- The page that renders a student's screen has exactly one source of truth about who they are —
-- this function, called with the token from their cookie — and `joined_at` was not among the
-- columns it returned. The alternatives were worse. The browser's own clock is neither the
-- server's nor trustworthy, and a participant could set it to whatever puts them at the top of
-- the room. A second read of `public.participants` by the service-role client is precisely the
-- table read on a student's behalf that `createSupabaseServiceClient` warns must never happen.
-- One more column on a function that is already granted to `service_role` alone, and already
-- returns this participant's own row, adds no reach at all: it is the join time of the person
-- presenting the token, told to that person's own page.
--
-- The return type changes, so the function is dropped and created rather than replaced —
-- Postgres will not alter a function's OUT parameters in place. The body, the security, the
-- search path and the grants are #129's, unchanged; only the `returning` list and the signature
-- grow by one column.

drop function if exists public.resume_participant(uuid, uuid, text);

-- The whole of "reload rejoins as the same participant". The token's secret is matched against
-- the stored hash, so holding the cookie is the only way to be that participant: a name is not an
-- identity here, and two people called Sam are two rows.
--
-- It returns a participant's own name, their own join time, and their session's status, mode and
-- title. It returns no item set, no answer key, no other participant and no other session, which
-- is the whole of what "a participant token grants exactly one session" means in one place
-- (ADR 0003).
--
-- An ended session still resolves, carrying `ended`, so the page can say what happened rather
-- than sending someone who was in the room back to a join form with no explanation.
--
-- Volatile, because it touches `last_seen_at`.
create function public.resume_participant(
  target_participant uuid,
  target_session uuid,
  presented_secret text
)
returns table (
  participant_id uuid,
  participant_name text,
  participant_joined_at timestamptz,
  session_status public.session_status,
  session_mode public.session_mode,
  session_title text
)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
    update public.participants p
       set last_seen_at = now()
      from public.sessions s
     where p.id = target_participant
       and p.session_id = target_session
       and s.id = p.session_id
       -- A missing or malformed secret hashes to something no row holds, so it takes the same
       -- path as a wrong one: no rows, and a caller that cannot tell the two apart.
       and p.rejoin_hash = extensions.digest(coalesce(presented_secret, ''), 'sha256')
    returning p.id, p.display_name, p.joined_at, s.status, s.mode, s.title;
end;
$$;

revoke all on function public.resume_participant(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resume_participant(uuid, uuid, text) to service_role;
