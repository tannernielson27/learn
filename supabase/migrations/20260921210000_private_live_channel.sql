-- The private session channel (#149).
--
-- ## What was open
--
-- A live session's Realtime channel, `live:<session id>`, was public. Row level security on
-- `realtime.messages` cannot tell one `anon` caller from another, so anyone holding the publishable
-- key and a session id could join it: watch the roster, put a name in it (#150's review), and —
-- through `postgres_changes` on `live.session_public_state`, whose select policy is `true` — watch
-- the room's four public facts change. #131 made the ids unlistable and kept every key and mark
-- off the channel; this closes the channel itself.
--
-- ## How a socket now says who it is
--
-- The server that can read #129's participant cookie vouches for the socket. The play page and
-- `POST /api/live/channel` each run `resume_participant` against the cookie and, only then, mint
-- a thirty-minute JWT (`src/lib/supabase/channelToken.ts`):
--
--   { "role": "anon", "sub": <participant id>, "live_session_id": <session id>, "iat", "exp" }
--
-- There is still one participant identity and it is still the cookie. The token is minted from
-- it, repeats what it proved, and is read by nothing but the policies below. Its role is `anon` —
-- the role the publishable key already gives every browser — so it widens nothing; the claim is
-- the only thing it adds, and all it can do is let a socket into one room.
--
-- A host needs no minted token: their Supabase session already is a JWT, and the policies let a
-- signed-in author into any session their org can read, through `public.sessions`' own RLS.
--
-- ## What this migration does NOT do yet, on purpose
--
-- It adds. It drops nothing. The old `true` policy on `live.session_public_state` stays, and so
-- the state half of the hole stays open until a follow-up drops it. That is this repo's migration
-- rule (add now, drop in a later PR), and here it is also the only safe order: migrations reach
-- the database before the code that presents a token reaches browsers, and dropping the `true`
-- policy first would silence every phone already in a room. The order is:
--
--   1. The owner sets `SUPABASE_JWT_SIGNING_KEY` on every deployment (see .env.example).
--   2. This migration and the code that opens private channels ship.
--   3. The owner turns off "Allow public access" in each project's Realtime settings, which is
--      what makes Realtime refuse a *public* channel on any topic, and so what makes the policies
--      below the only way in. (Supabase: "To enforce private channels you need to disable the
--      'Allow public access' setting".)
--   4. A follow-up migration drops "a subscriber may read the public state of a session it names".
--
-- Nothing here touches the Data API's exposed schemas. `live` stays off it; that is what keeps
-- `session_public_state` unlistable, and it is a standing owner rule.

-- ---------------------------------------------------------------------------
-- Which session a topic names
-- ---------------------------------------------------------------------------

-- `live:<uuid>` to the uuid, or null for any other topic. A function rather than a cast in the
-- policy so a malformed topic is "no session" instead of an error mid-join, and so the author
-- policy below can compare uuids and use `sessions`' primary key rather than casting every row.
create function private.live_topic_session(topic text) returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when topic ~ '^live:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(topic, 6)::uuid
  end;
$$;

revoke all on function private.live_topic_session(text) from public, anon, authenticated;
grant execute on function private.live_topic_session(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Who may join `live:<session id>`
-- ---------------------------------------------------------------------------

-- Realtime evaluates these once, when a socket joins a private channel (and again when it sends a
-- new token), by querying `realtime.messages` as the socket's role with its claims set and rolling
-- the query back. `extension` is what the socket wants to do: `presence` for the roster,
-- `broadcast` for messages, which nothing in this app sends but which Realtime checks on join.

-- A participant: their token names this session. A token without the claim — which is every
-- token the publishable key alone produces — compares against null and is refused.
create policy "a participant joins their own session's channel"
  on realtime.messages for select to anon
  using (
    realtime.messages.extension in ('presence', 'broadcast')
    and (select realtime.topic()) = 'live:' || ((select auth.jwt()) ->> 'live_session_id')
  );

-- And may track presence in it. Presence is the one thing a phone writes; a broadcast from a
-- phone has no reader and no business existing, so it is not granted.
--
-- This cannot tie *what* is tracked to the token's `sub`. Realtime evaluates the policy when a
-- socket joins (and on its first track), against a row that carries the topic and the extension
-- and nothing else: checked against the local Realtime, `payload` and `event` are null there, and
-- there is no column for the presence key. So a participant of this room can still track an entry
-- under a classmate's id. That is display-only — every read and write that matters is keyed off
-- the cookie-checked participant id, never off presence — and it is now confined to people who
-- are in the room.
create policy "a participant tracks presence in their own session's channel"
  on realtime.messages for insert to anon
  with check (
    realtime.messages.extension = 'presence'
    and (select realtime.topic()) = 'live:' || ((select auth.jwt()) ->> 'live_session_id')
  );

-- An author: the session is one `public.sessions`' own policy lets them read — their org's, the
-- same rule that lets a co-instructor pick up a colleague's console. Read only: a host watches
-- the roster and is never in it (`hostTransport.ts`), so there is no insert policy for them.
create policy "an author watches their org's session channels"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('presence', 'broadcast')
    and exists (
      select 1 from public.sessions s
       where s.id = private.live_topic_session((select realtime.topic()))
    )
  );

-- ---------------------------------------------------------------------------
-- Who may read a session's public state — added beside the `true` policy, not yet instead of it
-- ---------------------------------------------------------------------------

-- `postgres_changes` is authorized by the source table's RLS, not by `realtime.messages`: Realtime
-- delivers a changed row only to subscribers whose role and claims could select it. So the state
-- half of the channel is closed here, by the same claim. These two are inert while the `true`
-- policy stands (permissive policies are OR'd); step 4 above is what makes them the rule.
create policy "a participant reads their own session's public state"
  on live.session_public_state for select to anon
  using (session_id::text = (select auth.jwt()) ->> 'live_session_id');

create policy "an author reads the public state of their org's sessions"
  on live.session_public_state for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_public_state.session_id));
