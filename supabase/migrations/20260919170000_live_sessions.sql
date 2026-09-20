-- Live sessions (#128): the session row a class joins, its six-character code, the state machine
-- the database enforces whatever a client does, and a rate-limited way to turn a code into a
-- session id.
--
-- What is deliberately NOT here: participants and presence (#129, #132), submissions and scoring
-- (#133), aggregates for the dashboard. This migration is the table those build on.

-- ---------------------------------------------------------------------------
-- The session
-- ---------------------------------------------------------------------------

create type public.session_mode as enum ('instructor_paced', 'student_paced');
create type public.session_status as enum ('lobby', 'running', 'paused', 'ended');

-- The join-code alphabet: 2-9 and A-Z without I and O, so nothing in a code can be read as
-- anything else across a classroom. Exactly 32 characters, which matters twice: 32 divides 256,
-- so a random byte taken modulo 32 is unbiased, and 32^6 is 1,073,741,824 codes.
-- Kept as a literal in three places (this comment, the check constraint and the generator) rather
-- than a function, because a check constraint may not call a volatile or mutable function.

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  host_id uuid not null references public.profiles (id) on delete cascade,
  -- Exactly one source: a whole bank, or one case study. Both carry their org in the key, so a
  -- session can never point at another org's content.
  bank_id uuid,
  case_study_id uuid,
  title text not null check (length(title) between 1 and 200),
  code text not null check (code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$'),
  mode public.session_mode not null default 'instructor_paced',
  status public.session_status not null default 'lobby',
  -- The items, snapshotted when the session starts, so editing the bank mid-session does not
  -- change what the room is looking at (02-ARCHITECTURE §3). An array of item ids.
  item_set jsonb not null default '[]'::jsonb check (jsonb_typeof(item_set) = 'array'),
  current_position smallint check (current_position >= 1),
  reveal boolean not null default false,
  -- Per-item countdown. null means the host advances by hand.
  timer_seconds integer check (timer_seconds between 5 and 3600),
  item_ends_at timestamptz,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_one_source check (num_nonnulls(bank_id, case_study_id) = 1),
  constraint sessions_bank_org_fkey foreign key (bank_id, org_id)
    references public.item_banks (id, org_id) on delete cascade,
  constraint sessions_case_org_fkey foreign key (case_study_id, org_id)
    references public.case_studies (id, org_id) on delete cascade,
  -- A session is closed exactly when it has ended; neither can be set without the other.
  constraint sessions_closed_with_ended check ((status = 'ended') = (closed_at is not null)),
  -- Nothing can be revealed before the room is on an item.
  constraint sessions_reveal_needs_item check (not reveal or current_position is not null),
  -- Lets later tables (participants, responses) require a session in their own org.
  constraint sessions_id_org_key unique (id, org_id)
);

-- Uniqueness is required among sessions that have NOT ended, not over all time. A code belongs to
-- a session for as long as that session can be joined; once it ends the code is free again, and a
-- much later session may draw it. That is deliberate: it keeps the code space small enough to
-- read aloud instead of growing a graveyard of retired codes. The cost is that a code written on
-- a whiteboard last term could one day name a different session — negligible at 1.07e9 codes and
-- random draws, and the reason the ended row keeps its code rather than nulling it (a host's
-- history still says which code that class used).
create unique index sessions_open_code_key on public.sessions (code) where status <> 'ended';

create index sessions_org_id_idx on public.sessions (org_id);
create index sessions_host_id_idx on public.sessions (host_id);
create index sessions_bank_id_idx on public.sessions (bank_id);
create index sessions_case_study_id_idx on public.sessions (case_study_id);

-- ---------------------------------------------------------------------------
-- Code generation
-- ---------------------------------------------------------------------------

-- Six characters from 32 cryptographically random bytes-worth of choice. gen_random_bytes, not
-- random(): random() is a seeded PRNG whose stream can be reconstructed from a few outputs, which
-- would make every open code guessable from one observed code. 256 % 32 = 0, so `% 32` is
-- unbiased and no rejection sampling is needed.
create function private.new_session_code() returns text
language sql volatile security definer set search_path = ''
as $$
  select string_agg(
    substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (get_byte(drawn.bytes, n) % 32) + 1, 1),
    '' order by n)
  from (select extensions.gen_random_bytes(6) as bytes) as drawn,
       generate_series(0, 5) as n;
$$;

revoke all on function private.new_session_code() from public, anon;
grant execute on function private.new_session_code() to authenticated;

-- ---------------------------------------------------------------------------
-- The state machine, enforced by the database
-- ---------------------------------------------------------------------------

-- #130 adds a TypeScript state machine in src/lib/live/ for the console's buttons. This trigger is
-- the same rules where they cannot be skipped: a client that posts straight at the Data API, an
-- SQL console, or a future route handler all meet it. The allowed moves:
--
--   lobby   -> running | ended
--   running -> paused  | ended
--   paused  -> running | ended
--   ended   -> nothing at all
--
-- Ending is one-way. That is the whole point of "an ended session cannot be reopened": there is no
-- transition back out of `ended`, and no update of any kind is allowed on an ended row, so its
-- code can never start resolving again.
create function private.guard_session_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'lobby' then
      raise exception 'a session starts in the lobby' using errcode = '22023';
    end if;
    new.closed_at := null;
    new.reveal := false;
    new.item_ends_at := null;
    new.opened_at := now();
    new.created_at := now();
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

  if new.current_position is not null
     and new.current_position > jsonb_array_length(new.item_set) then
    raise exception 'that item is past the end of the session''s set' using errcode = '22023';
  end if;

  if new.status = 'ended' then
    -- Ending settles the row itself, so no caller has to remember to. A reveal flag left true on
    -- an ended session would otherwise be a standing invitation to read the key.
    new.closed_at := now();
    new.reveal := false;
    new.item_ends_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.guard_session_change() from public, anon, authenticated;

create trigger sessions_guard_change before insert or update on public.sessions
  for each row execute function private.guard_session_change();

-- ---------------------------------------------------------------------------
-- Starting a session
-- ---------------------------------------------------------------------------

-- Code generation and the collision retry live here rather than in the application because
-- uniqueness is a database invariant. An application that drew a code, asked "is it taken?" and
-- then inserted would have a window between the two in which another host inserts the same code;
-- the partial unique index closes it, and the only honest way to answer the index is to insert and
-- retry the one error it can raise. Ten draws against a space of 1.07e9 is not a real loop: with
-- even a thousand open sessions the chance of a single collision is under one in a million.
--
-- Security invoker, so RLS decides everything: the source must be a bank or case study the caller
-- can see (another org's reads as gone), and the insert must satisfy the host policy below.
create function public.start_session(
  source_bank uuid default null,
  source_case_study uuid default null,
  paced public.session_mode default 'instructor_paced',
  item_timer_seconds integer default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  source_org uuid;
  source_title text;
  chosen jsonb;
  new_id uuid;
  failed_constraint text;
begin
  if num_nonnulls(source_bank, source_case_study) <> 1 then
    raise exception 'start a session from either a bank or a case study, not both'
      using errcode = '22023';
  end if;

  if source_bank is not null then
    select b.org_id, b.name into source_org, source_title
      from public.item_banks b where b.id = source_bank;
    if not found then
      raise exception 'that bank does not exist' using errcode = 'P0002';
    end if;
    -- Published items only: a draft is half-written by definition, and a room should never be
    -- shown one. Ordered oldest first, which is the order the bank lists them in.
    select coalesce(jsonb_agg(i.id order by i.created_at, i.id), '[]'::jsonb) into chosen
      from public.items i
     where i.bank_id = source_bank and i.status = 'published';
  else
    select c.org_id, c.title into source_org, source_title
      from public.case_studies c where c.id = source_case_study;
    if not found then
      raise exception 'that case study does not exist' using errcode = 'P0002';
    end if;
    select coalesce(jsonb_agg(csi.item_id order by csi.position), '[]'::jsonb) into chosen
      from public.case_study_items csi
     where csi.case_study_id = source_case_study;
  end if;

  if jsonb_array_length(chosen) = 0 then
    raise exception 'that source has no published items to run' using errcode = '22023';
  end if;

  for attempt in 1 .. 10 loop
    begin
      insert into public.sessions
        (org_id, host_id, bank_id, case_study_id, title, code, mode, item_set, timer_seconds)
      values
        (source_org, caller, source_bank, source_case_study, source_title,
         private.new_session_code(), paced, chosen, item_timer_seconds)
      returning id into new_id;
      return new_id;
    exception when unique_violation then
      -- Only a code that collided with a session still open is worth another draw. Anything else
      -- (a duplicate id, say) is a real fault and must not be retried ten times in silence.
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint is distinct from 'sessions_open_code_key' then
        raise;
      end if;
    end;
  end loop;

  raise exception 'could not find a free join code' using errcode = '53400';
end;
$$;

revoke all on function public.start_session(uuid, uuid, public.session_mode, integer)
  from public, anon;
grant execute on function public.start_session(uuid, uuid, public.session_mode, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Ending a session
-- ---------------------------------------------------------------------------

-- Idempotent: ending a session that has already ended returns the time it closed rather than
-- raising, so a double-tapped button and a retried request both settle on the same answer. A
-- session the caller cannot see reads as gone, exactly like the authoring functions.
create function public.end_session(target uuid)
returns timestamptz
language plpgsql security invoker set search_path = ''
as $$
declare
  closed timestamptz;
begin
  select s.closed_at into closed from public.sessions s where s.id = target;
  if not found then
    raise exception 'that session does not exist' using errcode = 'P0002';
  end if;
  if closed is not null then
    return closed;
  end if;

  update public.sessions set status = 'ended' where id = target
    returning closed_at into closed;
  return closed;
end;
$$;

revoke all on function public.end_session(uuid) from public, anon;
grant execute on function public.end_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Resolving a code, rate limited per address
-- ---------------------------------------------------------------------------

-- A fixed-window counter per caller and bucket, the same shape as private.rate_limits (#111) but
-- keyed by address rather than user, because the person resolving a code has not signed in.
--
-- Unlike #111's table, this one is not bounded by the number of accounts, so rows are swept: the
-- counter drops rows whose window closed long ago, on a small fraction of calls. The sweep cannot
-- reach a live counter (its cut-off is twelve windows back), so it is not a way to clear anyone's
-- budget.
create table private.code_lookups (
  client_key text not null check (length(client_key) between 1 and 64),
  bucket text not null check (bucket in ('attempt', 'miss')),
  window_start timestamptz not null,
  calls integer not null check (calls >= 1),
  primary key (client_key, bucket)
);

alter table private.code_lookups enable row level security;
revoke all on private.code_lookups from public, anon, authenticated;
create index code_lookups_window_start_idx on private.code_lookups (window_start);

-- Two budgets per address, both over five minutes (the window #134 chose for sign-in, for the same
-- reason: it is the window Supabase's own auth limit uses, so nothing this refuses is still inside
-- another limiter's window when it retries).
--
--   attempt 150 — every lookup, right or wrong. A class of sixty behind one school NAT shares one
--                 address and arrives at once; sixty joins plus a retype each fits with room over.
--   miss     60 — lookups that found nothing. This is the one that stops enumeration, because a
--                 class produces almost no misses (everyone types the same correct code) while a
--                 script produces nothing else. Sixty is high enough that a roomful of typos does
--                 not spend it.
--
-- At 150 lookups per address per five minutes, one address gets 43,200 guesses a day against
-- 1.07e9 codes; with the miss budget in force it gets 17,280. Either number is noise. The limits
-- live here, not in the caller's arguments, so no caller can widen its own.
create function private.take_code_lookup(lookup_key text, lookup_bucket text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  window_length constant interval := interval '5 minutes';
  limit_calls integer := case lookup_bucket when 'attempt' then 150 when 'miss' then 60 end;
  used integer;
begin
  if limit_calls is null then
    raise exception 'that lookup has no rate limit' using errcode = '22023';
  end if;

  if random() < 0.005 then
    delete from private.code_lookups
     where window_start < now() - (window_length * 12);
  end if;

  insert into private.code_lookups as l (client_key, bucket, window_start, calls)
  values (lookup_key, lookup_bucket, now(), 1)
  on conflict (client_key, bucket) do update
    set window_start = case
          when l.window_start <= now() - window_length then now()
          else l.window_start
        end,
        calls = case
          when l.window_start <= now() - window_length then 1
          -- Calls over the limit are still counted, capped one past it, so hammering neither
          -- shortens nor lengthens the wait.
          else least(l.calls + 1, limit_calls + 1)
        end
  returning calls into used;

  return used <= limit_calls;
end;
$$;

revoke all on function private.take_code_lookup(text, text) from public, anon, authenticated;

-- Turns a typed code into a session id, and nothing else. It returns no answer key, no item set
-- and no host: it is the seam #129's join path calls before it creates a participant.
--
-- Granted to service_role ONLY, and therefore callable just by this app's own server. That is what
-- makes the client_key argument trustworthy, and it is why the limit can live in Postgres here
-- when #134 deliberately kept the sign-in limit out of it. #134's three reasons were: a Postgres
-- limiter would need granting to anon; the key would then be an argument anyone could forge; and
-- fail-closed would lock people out of the product. None hold here — anon cannot execute this, the
-- only caller is the server that read the address off the request, and a failing database means
-- there is no session to join either way, so failing closed costs nothing. In exchange the counter
-- is shared across every serverless instance, which is the limitation #134 records about its own.
--
-- A code that does not exist and a session that has ended are the same answer: zero rows. Nothing
-- in the reply distinguishes "never was" from "is over", so a script cannot harvest live codes by
-- watching which refusals differ.
create function public.resolve_session_code(session_code text, client_key text default null)
returns table (
  session_id uuid,
  session_status public.session_status,
  session_mode public.session_mode,
  session_title text
)
language plpgsql security definer set search_path = ''
as $$
declare
  -- An address, lower-cased and clipped to the column's width so no caller can grow the table with
  -- one long key. A caller with no address at all shares one bucket rather than escaping the limit.
  bucket_key text := coalesce(
    nullif(left(lower(trim(coalesce(client_key, ''))), 64), ''),
    'unidentified'
  );
  -- Codes are read off a screen and typed by hand, so spaces and hyphens are forgiven and case is
  -- not. Anything left outside the alphabet simply will not match, which is the point of leaving
  -- O, 0, I and 1 out of it: there is no character a reader can mistake for another.
  normalized text := upper(regexp_replace(coalesce(session_code, ''), '[^0-9A-Za-z]', '', 'g'));
  hit uuid;
begin
  if not private.take_code_lookup(bucket_key, 'attempt') then
    raise exception 'too many join attempts from this network' using errcode = 'PT429';
  end if;

  select s.id into hit
    from public.sessions s
   where s.code = normalized and s.status <> 'ended';

  if hit is null then
    -- A miss costs the tighter budget. Note what this does NOT do: once the miss budget is spent,
    -- a correct code still resolves. One person mistyping on a shared address cannot shut the
    -- class out; only wrong guesses are refused.
    if not private.take_code_lookup(bucket_key, 'miss') then
      raise exception 'too many join attempts from this network' using errcode = 'PT429';
    end if;
    return;
  end if;

  return query
    select s.id, s.status, s.mode, s.title from public.sessions s where s.id = hit;
end;
$$;

revoke all on function public.resolve_session_code(text, text) from public, anon, authenticated;
grant execute on function public.resolve_session_code(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

-- Supabase's default privileges hand anon and authenticated full DML on a new public table, so
-- every one of them has to be taken back by hand; the blanket revoke in #65 only covered the
-- tables that existed then.
revoke all on public.sessions from anon;
revoke truncate, references, trigger on public.sessions from authenticated;
-- A session is a record of a class that happened. Ending it is the way out; deleting it would take
-- the responses with it once #133 lands.
revoke delete on public.sessions from authenticated;
-- Only the columns a host actually drives. The guard trigger refuses the rest too; this is the
-- same rule said where a trigger cannot be reached at all.
revoke update on public.sessions from authenticated;
grant update (status, current_position, reveal, item_ends_at, mode, timer_seconds, title)
  on public.sessions to authenticated;

alter table public.sessions enable row level security;

-- Reading is scoped to the org, so a co-instructor can pick up a colleague's room. A student never
-- reaches the row at all: anon has no privilege on the table and no policy, and the only way in
-- from outside is resolve_session_code above, which returns four fields and no key.
create policy "authors read their org's sessions" on public.sessions
  for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

create policy "authors host sessions in their org" on public.sessions
  for insert to authenticated
  with check (
    (select private.is_author())
    and org_id = (select private.current_org_id())
    and host_id = (select auth.uid())
  );

create policy "authors run their org's sessions" on public.sessions
  for update to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()))
  with check ((select private.is_author()) and org_id = (select private.current_org_id()));
