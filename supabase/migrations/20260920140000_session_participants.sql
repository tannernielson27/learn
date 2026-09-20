-- Session participants (#129): the row a student becomes when they type a code and a name, the
-- token that lets the same browser come back as the same person, and the two functions that are
-- the only way in.
--
-- The shape follows #128 exactly: a student has no account, so nothing here is reachable by
-- `anon` or by `authenticated`. Both functions are security definer and granted to `service_role`
-- alone, which means this app's own server is the only caller — the same reasoning that makes
-- `resolve_session_code`'s address argument trustworthy applies to the token argument below.
--
-- What is deliberately NOT here: presence and the lobby's live roster (#132), responses and
-- scoring (#133), removing or renaming a participant, and roster matching to a real account
-- (Phase 4 — `profile_id` is the column that will carry it and is always null today).

-- ---------------------------------------------------------------------------
-- The participant
-- ---------------------------------------------------------------------------

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  org_id uuid not null,
  -- Phase 4 rosters. Null for every row #129 writes: joining takes no account.
  profile_id uuid references public.profiles (id) on delete set null,
  -- The cap is 32 characters, in step with DISPLAY_NAME_MAX_LENGTH in
  -- src/lib/live/displayName.ts. `length()` counts characters, not bytes, so an accented or
  -- non-Latin name is measured the way a reader would measure it.
  display_name text not null check (length(display_name) between 1 and 32),
  -- SHA-256 of the token's secret half, never the secret itself. A dump of this table is
  -- therefore not a bag of working participant tokens.
  rejoin_hash bytea not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- The session and the participant are always in the same org, held by the composite key rather
  -- than by a trigger. Cascade, not set null: a participant has no meaning without its session,
  -- and a session is never deleted anyway (#128 revoked DELETE on it).
  constraint participants_session_org_fkey foreign key (session_id, org_id)
    references public.sessions (id, org_id) on delete cascade,
  -- Lets #133's responses require a participant in the session they are answering in.
  constraint participants_id_session_key unique (id, session_id)
);

create index participants_session_id_idx on public.participants (session_id);
create index participants_org_id_idx on public.participants (org_id);

-- ---------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------

-- A ceiling on one session's roster. Not a licence check and not a fairness rule: it is the only
-- thing bounding how many rows one valid code can create, since a correct code is deliberately
-- never rate limited (#128 explains why — a school behind one address would lock itself out).
-- Three hundred is several times the largest cohort this is built for and far below anything
-- worth scripting. Checked without locking the session, so two joins landing in the same instant
-- can both pass at the boundary; a roster of 301 is not a failure worth serialising every join
-- against the host's own updates for.
create function private.session_is_full(target_session uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select count(*) >= 300 from public.participants p where p.session_id = target_session;
$$;

revoke all on function private.session_is_full(uuid) from public, anon, authenticated, service_role;

-- Turns a session id and a typed name into a participant, and hands back the secret half of that
-- participant's token exactly once. The caller stores the token in an httpOnly cookie; nothing
-- can read the secret out of this table afterwards, because only its hash is kept.
--
-- The session id must already have come from `resolve_session_code`, which is what applies the
-- per-address limit on wrong codes. This function does not take an address and does not count:
-- reaching it at all means a correct code was typed.
create function public.join_session(target_session uuid, chosen_name text)
returns table (participant_id uuid, rejoin_secret text)
language plpgsql security definer set search_path = ''
as $$
declare
  session_org uuid;
  session_state public.session_status;
  cleaned text;
  secret text;
  new_participant uuid;
begin
  -- Read without `for share`, and therefore without holding the host's own row while a class
  -- files in. A session can end in the gap between this read and the insert below, and the join
  -- will still land — accepted, for the same reason the roster ceiling is: the cost is one
  -- participant row for a room that just closed, whose very next request is told the session
  -- ended, and the price of closing it is a lock on the one row the host updates every time they
  -- advance, reveal or pause. Sixty students arriving mid-lesson would then queue behind each of
  -- those, and the host's console behind them. Nothing here can be corrupted by the race: the
  -- composite key still pins the participant to the session's own org, and an ended session is
  -- refused everywhere it matters.
  select s.org_id, s.status into session_org, session_state
    from public.sessions s where s.id = target_session;
  if not found then
    raise exception 'that session does not exist' using errcode = 'P0002';
  end if;
  if session_state = 'ended' then
    raise exception 'that session has ended' using errcode = '22023';
  end if;

  -- The app cleans the name first (src/lib/live/displayName.ts: NFKC, invisible formatting
  -- removed, whitespace collapsed, refused when too long). This is the last line of the same
  -- rule, where no client can skip it. It cuts rather than refuses, because anything arriving
  -- here has already been past the message that says what a name may be, and a call that got this
  -- far has a session waiting for it.
  cleaned := left(btrim(regexp_replace(coalesce(chosen_name, ''), '\s+', ' ', 'g')), 32);
  if cleaned = '' then
    raise exception 'a participant needs a display name' using errcode = '22023';
  end if;

  if private.session_is_full(target_session) then
    raise exception 'that session is full' using errcode = '54000';
  end if;

  -- gen_random_bytes, not random(): the secret is the whole of a participant's identity, and
  -- random() is a seeded stream that a handful of observed outputs reconstructs. 24 bytes is 192
  -- bits, hex encoded so it is safe in a cookie without further escaping.
  secret := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.participants (session_id, org_id, display_name, rejoin_hash)
  values (target_session, session_org, cleaned, extensions.digest(secret, 'sha256'))
  returning id into new_participant;

  return query select new_participant, secret;
end;
$$;

revoke all on function public.join_session(uuid, text) from public, anon, authenticated;
grant execute on function public.join_session(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Coming back
-- ---------------------------------------------------------------------------

-- The whole of "reload rejoins as the same participant". The token's secret is matched against
-- the stored hash, so holding the cookie is the only way to be that participant: a name is not an
-- identity here, and two people called Sam are two rows.
--
-- It returns a participant's own name and their session's status, mode and title. It returns no
-- item set, no answer key, no other participant and no other session, which is the whole of what
-- "a participant token grants exactly one session" means in one place (ADR 0003).
--
-- An ended session still resolves, carrying `ended`, so the page can say what happened rather
-- than sending someone who was in the room back to a join form with no explanation.
--
-- Volatile, because it touches `last_seen_at` — the seam #132's presence will build on.
create function public.resume_participant(
  target_participant uuid,
  target_session uuid,
  presented_secret text
)
returns table (
  participant_id uuid,
  participant_name text,
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
    returning p.id, p.display_name, s.status, s.mode, s.title;
end;
$$;

revoke all on function public.resume_participant(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resume_participant(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

-- Supabase hands anon and authenticated full DML on a new public table, so it is all taken back
-- and only the columns a host's console needs are given again. `rejoin_hash` is not among them:
-- nobody reads it through the Data API, not even the host of the session.
revoke all on public.participants from anon, authenticated;
grant select (id, session_id, org_id, profile_id, display_name, joined_at, last_seen_at)
  on public.participants to authenticated;

alter table public.participants enable row level security;

-- Reading is scoped to the org, like sessions, so a co-instructor can pick up a colleague's room.
-- There is no insert, update or delete policy for anyone: `join_session` and `resume_participant`
-- are the only ways a row is written, and both are the server's alone.
create policy "authors read their org's participants" on public.participants
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));
