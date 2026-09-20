-- Live responses and aggregates (#131): what the Supabase transport adapter runs on.
--
-- #128 built the session row, its code and the state machine. This adds the three things a real
-- room needs on top of it:
--
--   * `public.session_public_state` — the four facts a student may know about a room (status,
--     which item it is on, how many there are, whether the key is showing), mirrored out of
--     `public.sessions` by a trigger so that Realtime's `postgres_changes` can carry them to a
--     participant who is not signed in. Students have no privilege and no policy on `sessions`
--     itself and must not get one: that row holds the org, the host, the code and the item set.
--   * `public.session_responses` — one answer per participant per position, written only by the
--     submission route handler after it has scored the answer on the server (ADR 0003).
--   * `public.session_item_aggregates` — the host dashboard's tallies, written by a trigger on
--     `sessions` and therefore **once per item change, never once per submission** (ADR 0002).
--     That is the whole reason the trigger is on `sessions` rather than on `session_responses`: a
--     trigger on the responses table would write a row — and so push a Realtime message — for
--     every answer, which is exactly the message budget ADR 0002 set out to protect.
--
-- What is deliberately NOT here: participants and the join token (#129 owns `public.participants`
-- and the token the submission route verifies), and the dashboard itself (Sprint 8).
-- `session_responses.participant_id` is therefore a plain uuid with no foreign key; see its
-- comment, and the owner action recorded on the #131 pull request.

-- ---------------------------------------------------------------------------
-- What a student may know about a room
-- ---------------------------------------------------------------------------

create table public.session_public_state (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  status public.session_status not null,
  -- One-based, like `sessions.current_position`, and null before the room starts.
  item_position smallint check (item_position >= 1),
  item_count integer not null default 0 check (item_count >= 0),
  reveal boolean not null default false,
  item_ends_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.session_public_state is
  'The four facts a participant may know about a live session, mirrored from public.sessions so an '
  'anonymous student can receive them over Realtime without ever being given a policy on the '
  'session row. It carries no org, no host, no join code, no title and no item ids.';

-- Every column here is one a participant is about to be shown anyway, so the policy is `true`
-- rather than a join no anonymous caller could satisfy. Reaching a row still needs the session's
-- uuid, which is only handed out by #129's join path after a correct code; and a caller who
-- listed the whole table would learn how many rooms are running and nothing whatsoever about any
-- of them. Insert, update and delete are granted to nobody: the trigger below is the only writer.
alter table public.session_public_state enable row level security;
alter table public.session_public_state replica identity full;
revoke all on public.session_public_state from anon, authenticated;
-- The service role is taken back too, so even this app's own server cannot tell a room something
-- its session row does not say. The trigger is the single writer, without exception.
revoke insert, update, delete on public.session_public_state from service_role;
grant select on public.session_public_state to anon, authenticated;

create policy "anyone holding a session id may read its public state"
  on public.session_public_state for select to anon, authenticated using (true);

create function private.mirror_session_state() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Nothing participant-visible changed, so nothing is written and no message goes out. A host
  -- renaming a session or setting a timer is not news to a student's page, and the free-tier
  -- message budget is the reason to say so here rather than to let every update echo.
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.current_position is not distinct from old.current_position
     and new.reveal is not distinct from old.reveal
     and new.item_ends_at is not distinct from old.item_ends_at then
    return null;
  end if;

  insert into public.session_public_state as m
    (session_id, status, item_position, item_count, reveal, item_ends_at, updated_at)
  values
    (new.id, new.status, new.current_position, jsonb_array_length(new.item_set), new.reveal,
     new.item_ends_at, now())
  on conflict (session_id) do update set
    status = excluded.status,
    item_position = excluded.item_position,
    item_count = excluded.item_count,
    reveal = excluded.reveal,
    item_ends_at = excluded.item_ends_at,
    updated_at = now();
  return null;
end;
$$;

revoke all on function private.mirror_session_state() from public, anon, authenticated;

create trigger sessions_mirror_public_state after insert or update on public.sessions
  for each row execute function private.mirror_session_state();

-- Sessions that already exist keep working. There are none in production yet; this is here so the
-- migration is correct wherever it is replayed rather than correct only on an empty database.
insert into public.session_public_state
  (session_id, status, item_position, item_count, reveal, item_ends_at)
select s.id, s.status, s.current_position, jsonb_array_length(s.item_set), s.reveal, s.item_ends_at
  from public.sessions s
on conflict (session_id) do nothing;

-- ---------------------------------------------------------------------------
-- The answers
-- ---------------------------------------------------------------------------

create table public.session_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  -- Carried rather than joined, exactly as #65 does for items: policies then filter on a column.
  org_id uuid not null,
  -- #129 owns `public.participants`. This column is the whole of what #131 needs from it: an id
  -- that is stable for one person in one session. A foreign key belongs here and is listed as an
  -- owner action on the #131 pull request, to be added once both stories have landed; adding it
  -- now would make this migration depend on one written in parallel.
  participant_id uuid not null,
  item_id uuid not null references public.items (id) on delete restrict,
  -- One-based, like `sessions.current_position`. Named `item_position` because `position` is a
  -- SQL function name and reads badly unquoted.
  item_position smallint not null check (item_position >= 1),
  response jsonb not null,
  points numeric(8, 2) not null,
  max_points numeric(8, 2) not null check (max_points >= 0),
  model text not null check (length(model) between 1 and 40),
  breakdown jsonb not null default '[]'::jsonb check (jsonb_typeof(breakdown) = 'array'),
  groups jsonb check (groups is null or jsonb_typeof(groups) = 'array'),
  submitted_at timestamptz not null default now(),
  -- One answer per person per item. This is what makes "you have already answered this item" a
  -- database fact rather than a race between two taps on a phone.
  constraint session_responses_once unique (session_id, participant_id, item_position),
  constraint session_responses_session_org_fkey foreign key (session_id, org_id)
    references public.sessions (id, org_id) on delete cascade
);

create index session_responses_session_position_idx
  on public.session_responses (session_id, item_position);

comment on table public.session_responses is
  'One scored answer per participant per item position. Written only by '
  'public.record_session_response, which the submission route handler calls after scoring on the '
  'server (ADR 0003).';

alter table public.session_responses enable row level security;
-- Reading is the host dashboard's (Sprint 8) and stays inside the org. Nobody writes through the
-- Data API at all — not even the service role, which the route handler runs as: its only way in
-- is record_session_response below, so there is no path to a response row that skips the scoring
-- and the state check.
revoke all on public.session_responses from anon, authenticated;
revoke insert, update, delete on public.session_responses from service_role;
grant select on public.session_responses to authenticated;

create policy "authors read their org's session responses"
  on public.session_responses for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

-- ---------------------------------------------------------------------------
-- The tallies
-- ---------------------------------------------------------------------------

create table public.session_item_aggregates (
  session_id uuid not null,
  item_position smallint not null check (item_position >= 1),
  org_id uuid not null,
  item_id uuid not null,
  -- The item's own id, the one that lives inside `items.content` and the one every renderer,
  -- fixture and transport payload calls an item by. `item_id` above is the row's uuid, which a
  -- participant never sees. Carrying both means the host console can name the item an aggregate is
  -- about without having to hold a translation table of its own.
  item_ref text not null,
  responded integer not null default 0 check (responded >= 0),
  full_marks integer not null default 0 check (full_marks >= 0),
  partial_marks integer not null default 0 check (partial_marks >= 0),
  no_marks integer not null default 0 check (no_marks >= 0),
  mean_points numeric(8, 2) not null default 0,
  max_points numeric(8, 2) not null default 0 check (max_points >= 0),
  computed_at timestamptz not null default now(),
  primary key (session_id, item_position),
  constraint session_item_aggregates_session_org_fkey foreign key (session_id, org_id)
    references public.sessions (id, org_id) on delete cascade
);

comment on table public.session_item_aggregates is
  'How the marks fell for one item of one session: counts only, never which option anyone chose. '
  'Written by private.refresh_session_aggregate from a trigger on public.sessions, so one row is '
  'written — and one Realtime message sent — per item change rather than per submission '
  '(ADR 0002). How many people were in the room is not stored: that is Realtime Presence, and the '
  'host transport merges it in.';

alter table public.session_item_aggregates enable row level security;
alter table public.session_item_aggregates replica identity full;
-- Host-only. "How many got it right" told to the room before the reveal is a hint, so anon gets
-- nothing, and no role may write: the refresh function below owns every row.
revoke all on public.session_item_aggregates from anon, authenticated;
revoke insert, update, delete on public.session_item_aggregates from service_role;
grant select on public.session_item_aggregates to authenticated;

create policy "authors read their org's session aggregates"
  on public.session_item_aggregates for select to authenticated
  using ((select private.is_author()) and org_id = (select private.current_org_id()));

-- Recomputes one item's tally from the answers on record and writes it down.
--
-- The three counts are the in-memory adapter's rules said in SQL, in the same order, so the two
-- adapters agree: full when the answer earned everything on offer, partial when it earned
-- something, none otherwise. An item nobody answered still gets a row, with zeroes.
create function private.refresh_session_aggregate(target_session uuid, at_position smallint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  session_org uuid;
  session_items jsonb;
  subject uuid;
  subject_ref text;
begin
  if at_position is null or at_position < 1 then
    return;
  end if;

  select s.org_id, s.item_set into session_org, session_items
    from public.sessions s where s.id = target_session;
  if session_items is null or at_position > jsonb_array_length(session_items) then
    return;
  end if;
  subject := (session_items ->> (at_position - 1))::uuid;
  select coalesce(i.content ->> 'id', subject::text) into subject_ref
    from public.items i where i.id = subject;

  insert into public.session_item_aggregates as a
    (session_id, item_position, org_id, item_id, item_ref,
     responded, full_marks, partial_marks, no_marks, mean_points, max_points, computed_at)
  select target_session, at_position, session_org, subject, coalesce(subject_ref, subject::text),
         count(*),
         count(*) filter (where r.points >= r.max_points),
         count(*) filter (where r.points < r.max_points and r.points > 0),
         count(*) filter (where r.points < r.max_points and r.points <= 0),
         coalesce(round(avg(r.points), 2), 0),
         coalesce(max(r.max_points), 0),
         now()
    from public.session_responses r
   where r.session_id = target_session and r.item_position = at_position
  on conflict (session_id, item_position) do update set
    item_id = excluded.item_id,
    item_ref = excluded.item_ref,
    responded = excluded.responded,
    full_marks = excluded.full_marks,
    partial_marks = excluded.partial_marks,
    no_marks = excluded.no_marks,
    mean_points = excluded.mean_points,
    max_points = excluded.max_points,
    computed_at = excluded.computed_at;
end;
$$;

revoke all on function private.refresh_session_aggregate(uuid, smallint)
  from public, anon, authenticated, service_role;

-- The one place aggregates are written, and therefore the one place a message goes out.
--
--   advance  -> the item the room has just left, so leaving it does not lose the count
--   reveal   -> the item now showing
--   end      -> the item the room was on
--
-- `start` moves the position from null to 1 and so takes the first branch with nothing to
-- refresh; `pause` and `resume` change none of these columns and write nothing at all. That is
-- move for move what `createInMemoryRoom` does, and the conformance suite holds them to it.
create function private.push_session_aggregates() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.current_position is distinct from old.current_position then
    perform private.refresh_session_aggregate(new.id, old.current_position);
  elsif new.reveal and not old.reveal then
    perform private.refresh_session_aggregate(new.id, new.current_position);
  elsif new.status = 'ended' and old.status <> 'ended' then
    perform private.refresh_session_aggregate(new.id, old.current_position);
  end if;
  return null;
end;
$$;

revoke all on function private.push_session_aggregates() from public, anon, authenticated;

create trigger sessions_push_aggregates after update on public.sessions
  for each row execute function private.push_session_aggregates();

-- ---------------------------------------------------------------------------
-- How often one person may answer
-- ---------------------------------------------------------------------------

-- `src/lib/live/transport.ts` says it plainly: an adapter with a network boundary owes the
-- interface a rate limit on join and submit, because uncapped they are unbounded roster growth
-- and unbounded scoring work. Join is #129's. This is submit's.
--
-- Keyed by participant rather than by address, because one classroom is one address and a
-- per-address budget would let a single script lock a whole class out of answering — the same
-- reasoning #128 wrote down for the join-code limiter, reaching the opposite key.
--
-- The window is five minutes, as everywhere else in this repo, and 120 attempts inside it is far
-- above real use (a participant answers each item once, and `session_responses_once` stops the
-- second) and far below anything worth doing with it.
create table private.session_submits (
  participant_id uuid primary key,
  window_start timestamptz not null,
  calls integer not null check (calls >= 1)
);

alter table private.session_submits enable row level security;
revoke all on private.session_submits from public, anon, authenticated, service_role;
create index session_submits_window_start_idx on private.session_submits (window_start);

create function private.take_session_submission(participant uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  window_length constant interval := interval '5 minutes';
  limit_calls constant integer := 120;
  used integer;
begin
  -- Swept on a small fraction of calls, like private.code_lookups: the table is not bounded by
  -- the number of accounts. The cut-off is twelve windows back, so the sweep can never reach a
  -- live counter and is not a way to clear anyone's budget.
  if random() < 0.005 then
    delete from private.session_submits where window_start < now() - (window_length * 12);
  end if;

  insert into private.session_submits as l (participant_id, window_start, calls)
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

revoke all on function private.take_session_submission(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Taking an answer
-- ---------------------------------------------------------------------------

-- Both functions answer with a refusal code rather than raising, because every one of these is an
-- ordinary thing that happens in a classroom — the host moved on, the key went up, a phone
-- retried — and the route handler turns the code straight into the sentence `LIVE_REFUSALS`
-- already holds. The codes and their order match `canSubmit` in `src/lib/live/state.ts` exactly.
--
-- Granted to service_role alone, so the only caller is this app's own server: the participant id
-- is read from #129's token there, never taken from a browser.

-- What the submission route needs before it can score anything: whether the room is taking
-- answers at all, and which item it is on. Charges the caller's rate limit first, so a flood of
-- unreadable answers costs a counter update rather than a scoring pass.
create function public.begin_session_submission(target_session uuid, participant uuid)
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

  return query select
    null::text,
    found_session.current_position,
    (found_session.item_set ->> (found_session.current_position - 1))::uuid;
end;
$$;

revoke all on function public.begin_session_submission(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_session_submission(uuid, uuid) to service_role;

-- Writes the scored answer down, re-checking the room's state in the same statement that inserts.
--
-- The check is repeated rather than trusted from `begin_session_submission` because scoring
-- happens between the two, and a host can reveal or advance in that gap. Under READ COMMITTED the
-- guard has to be part of the write, so the session read and the insert share one statement: a
-- host who reveals while an answer is in flight makes that answer arrive too late, which is the
-- right outcome and the one `canSubmit` describes.
create function public.record_session_response(
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
    -- The only unique constraint this insert can meet is one answer per person per item.
    return query select 'already_answered'::text, null::timestamptz;
    return;
  end;

  return query select null::text, written;
end;
$$;

revoke all on function public.record_session_response(
  uuid, uuid, smallint, uuid, jsonb, numeric, numeric, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_session_response(
  uuid, uuid, smallint, uuid, jsonb, numeric, numeric, text, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Two tables on the wire and no more. `public.sessions` is deliberately NOT published: the host
-- console reads the same four facts from `session_public_state` as everyone else and fetches the
-- item — key included — under its own row level security, so the session row with its org, host,
-- code and item set never travels over a channel at all.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'session_public_state'
  ) then
    alter publication supabase_realtime add table public.session_public_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'session_item_aggregates'
  ) then
    alter publication supabase_realtime add table public.session_item_aggregates;
  end if;
end;
$$;
