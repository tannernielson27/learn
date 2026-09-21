# fix(live): make the Realtime channel private with a per-participant token

Closes #149 once the owner steps below are done. Merging this alone does not close it (see "What this PR does not close yet").

## The problem

`live:<sessionId>` was a public Realtime channel. Anyone with the publishable key and a session id could join it, watch the roster, put a made-up name in it (the presence forgery #150's review found), and follow the room's state changes over `postgres_changes` on `live.session_public_state`.

## What changed

**One participant identity, still.** #133 left exactly one: #129's httpOnly cookie, checked by `resume_participant`. This PR keeps it as the only identity. The channel token is minted from the cookie and never replaces it:

- The play page (`/play/[sessionId]`) already runs `resume_participant` on every render. After that check passes, it mints a **30-minute Supabase JWT**: `{ role: "anon", sub: <participant id>, live_session_id: <session id>, iat, exp }` (`src/lib/supabase/channelToken.ts`).
- `POST /api/live/channel` (new, `src/lib/liveSupabase/channelRoute.ts`) mints the next token. It checks the cookie the same way the view and submit routes do, and it charges the same per-participant view budget (`begin_session_view`, #152), so this adds no third rate limit. An ended session gets no token.
- No route accepts the token as proof of anything. Realtime is its only reader. Its role is `anon`, the same role the publishable key already has, so it reaches nothing new through PostgREST.

**Private channels.** Participants and hosts now open `live:<id>` with `private: true`.

- A student's page uses its own Supabase client, built with an `accessToken` callback (`createSupabaseChannelClient`). The callback comes from `createChannelTokenSource`, which returns the token it holds and fetches a new one from the route in the last 5 minutes before expiry.
- A host joins with their own Supabase session.

**Policies** (`20260921210000_private_live_channel.sql`, additive only):

- `realtime.messages`:
  - `anon` may join, and track presence in, the topic `live:` + its token's `live_session_id` claim. Broadcasting is not allowed.
  - `authenticated` may watch any session that `public.sessions`' own RLS lets them read (their org), and may not track presence.
- `live.session_public_state`: two scoped select policies are added beside the existing `true` policy. They do nothing until a follow-up drops `true` (see the rollout order below).
- `private.live_topic_session(text)` parses a topic safely. A malformed topic means no session and never raises an error.

**A race in supabase-js, found against the real local Realtime.** A client built with `accessToken` fetches its token asynchronously. A channel subscribed before that fetch finishes joins with the publishable key's default token, and its automatic rejoins keep sending that same stale token. On a private channel, that is a permanent refusal. Both transports now `await client.realtime.setAuth()` before subscribing (`presentRealtimeToken` in `wire.ts`). The host side had the same problem.

**When the server is finished with a phone.** A refresh can fail in two ways:

- **Transient** (a network error, a 5xx, a 429, a body that is not JSON): the source keeps the token it holds and retries on the next heartbeat.
- **Definitive**: a 401 (the cookie no longer names a participant) or the `not_open` refusal (the session has ended). The source stops asking for good. The transport closes the channel and reports `"refused"`, which no rejoin ever follows. `StudentRoom` then calls `router.refresh()`, and the server render decides what the phone shows next:
  - a participant who is gone is redirected to the join form;
  - an ended session gets its ordinary ended screen (`waitingCopy`).

  "Reconnecting — stay on this page" is not shown in this state.

**The server-only boundary is now a test, not a comment.** `src/components/live/noClientSigningKey.test.ts` walks the real import graph from every `"use client"` module in `src/` and fails if any of them reaches `src/lib/supabase/channelToken.ts` or `node:crypto`. The graph walker moved out of `noClientScoring.test.ts` into `src/components/testing/importGraph.ts` so both tests share it. I checked that the test catches a leak: adding an import of `channelToken` to `channelTokenSource.ts`, which `StudentRoom.tsx` imports, fails it with the full chain in the message. I then reverted that import.

## Owner configuration required: nothing is stubbed

Minting needs a key the Supabase project trusts. **Do not deploy this before setting it**: the student page throws an error naming the variable when it is missing.

1. **`SUPABASE_JWT_SIGNING_KEY`**, server-only. Set it in Vercel Production (production project's key) and Vercel Preview (preview project `vauokqoyvewtzubqajgh`'s key), and in your `.env.local` (the local stack prints it as `JWT_SECRET`). **This applies to the existing hosted projects, not only new ones**; docs/05 §7.4 now says so. Use either:
   - **The legacy JWT secret.** Dashboard, Project Settings, JWT Keys, Legacy JWT Secret. This only works if the project has not revoked it.
   - **An ES256 key you import.** Run `pnpm exec supabase gen signing-key --algorithm ES256`, import it as a standby key under JWT Keys, then Rotate. Paste the one-line JWK, including its `kid`.

   **Either key can sign a token for any Postgres role, `service_role` included.** Treat it exactly like `SUPABASE_SECRET_KEY`. If you import an ES256 key and rotate to it, Supabase Auth also signs every user session with it. CI already maps the local stack's `JWT_SECRET` to this variable.

2. **After deploy, turn off "Allow public access"** under Dashboard, Realtime, Settings, in both projects. Supabase documents this as the switch that enforces private channels. (Locally, a public channel on the same topic turned out to be a separate room: it neither saw nor affected the private roster. That result comes from the local Realtime version only.)
3. **Never add `live` to the exposed schemas.** Nothing in this PR touches that setting.

## Rollout order, and what this PR does not close yet

1. Owner sets `SUPABASE_JWT_SIGNING_KEY` in both Vercel scopes.
2. Merge; migration and code ship.
3. Owner turns off Realtime public access in both projects.
4. **Follow-up PR:** drop the policy `a subscriber may read the public state of a session it names` on `live.session_public_state`. Until then, the publishable key can still follow a known session's four public facts over `postgres_changes`. The drop is deferred because of the repo's migration rule (add now, drop later) and because it is the only safe order: migrations land before browsers carry tokens. The pgTAP test pins that the `true` policy is still there, so the follow-up has to change that test on purpose.

After step 2, **people outside a session** can no longer read its roster or write to it. After step 4, they can no longer follow its state either.

**What stays open inside a session (display-only).** A participant of a room can still `track()` any presence entry in that room, including one under a classmate's participant id. I checked whether the presence INSERT policy could tie the tracked key to the token's `sub`: it cannot.

- I installed a logging policy on the local stack and tracked from a client.
- Realtime evaluates the policy at join and on the first track. It evaluates it against a synthetic row: the topic, the extension, and the socket's claims, with `payload` and `event` both null. The row has no column for the presence key. Later tracks are not evaluated at all (the policy is cached for the connection).
- An enrolled participant who joined with a classmate's presence key and tracked a made-up entry had it shown to another watcher.

This changes what the roster shows and nothing else. View, submit and scoring all use the participant id that was checked against the cookie, never presence. `presence.ts` and the migration now say this instead of claiming the forgery is closed.

## Token lifetime

- Each token lasts 30 minutes.
- It is refreshed 5 minutes before expiry from inside the `accessToken` callback, which supabase-js calls on every heartbeat.
- A phone that sleeps through its expiry gets a fresh token on its first heartbeat after waking.
- When a participant is removed or the session ends, the next refresh is refused. The screen then leaves: a removed participant goes to the join form, and an ended session shows the ended screen. A participant already removed can keep a working channel until their current token expires, so the gap is at most 30 minutes.
- **Clock assumption:** "5 minutes before expiry" is measured on the phone's clock against a server-issued `expiresAt`. A phone clock more than about 5 minutes slow would hold a token Realtime already treats as expired. NTP makes that rare, and I did not fix it.

## Known gaps (recorded, not fixed)

- **MEDIUM:** both `realtime.messages` SELECT policies grant `extension in ('presence','broadcast')`. No pgTAP case reads a `broadcast` row, and the host's insert denial is tested only with `presence`. Nothing in the app broadcasts today, so the grant is live but untested.
- **LOW:** the pgTAP suite proves the scoped `session_public_state` policies are right once `true` is dropped (it drops it inside a rolled-back transaction). It does not show they are inert today; that rests on permissive policies being OR'd.
- **LOW:** no test of a token naming a session that never existed or has been deleted.
- **LOW:** the participant cookie parses its UUIDs case-insensitively, but topic matching is case-sensitive. This cannot let anyone into another session. It could one day produce a confusing "my own channel refuses me".

## Test plan

- [x] `pnpm typecheck`, `pnpm lint`, Prettier on every changed file (local)
- [x] Vitest (local): 36 files, 634 tests across `liveSupabase`, `supabase`, `live`, `components/live` and `noClientScoring`. The new tests cover:
  - `channelToken.test.ts`: HS256 and ES256 signatures verify; claims; key-parsing errors.
  - `channelRoute.test.ts`: the route mints only after the cookie check; refusals; a missing key fails loudly.
  - `channelTokenSource.test.ts`:
    - the refresh window, and a single request in flight;
    - transient failures (429, 5xx, a broken body, network, a non-ended 409) are retried;
    - **401 and `not_open` are definitive, reported once, and stop the heartbeat fetches.**
  - `participantTransport.test.ts`: a definitive refusal closes the channel and reports `"refused"` exactly once; nothing is reported after `leave`; the channel is private; `setAuth` runs before `subscribe`.
  - `StudentRoom.test.tsx`: `"refused"` triggers `router.refresh()` without the "Reconnecting" notice; the ended screen appears when the server answers with an ended session.
  - `privateChannel.test.ts`:
    - **a participant of session A cannot subscribe to session B**;
    - a page that asks to open B still gets A's token and is refused;
    - a removed participant's phone reports `"refused"` through the real route;
    - the publishable key alone is refused, and so are forged and expired tokens;
    - an outsider's forged roster name is kept out;
    - a host of another org is refused.
  - `noClientSigningKey.test.ts`: no Client Component reaches the signing module or `node:crypto`.
  - The whole room conformance suite runs over private channels, with tokens from the real route.
- [x] pgTAP `live_private_channel.test.sql` (25 assertions) plus the full pgTAP suite (466), on the local stack
- [x] Probed by hand against the local stack's real Realtime:
  - A's token: joins A, tracks presence, and receives `postgres_changes`.
  - A's token on B: refused.
  - No token: refused.
  - Wrong key: `JwtSignatureError`. Expired token: `InvalidJWTToken`.
  - Signed-in host: own org's session allowed, another org's refused.
  - A 20-second token with a 2-second heartbeat stayed joined for 35 seconds.
  - With the `true` state policy dropped temporarily: only A's token received A's state change.
  - The presence INSERT policy never sees the tracked payload or key (see above).
- [ ] CI: e2e `join`, `liveAnswer` and `liveSession` specs against the local stack. **Not run locally.**
- [ ] On a preview deployment: a student joins, the roster fills, and the room moves. Then end the session from the console: the phones should show the ended screen as soon as the state change arrives, and should still be on it (not "Reconnecting") after their next token refresh is refused.
- [ ] After step 3: confirm a public channel on `live:<id>` is refused on hosted.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_016tcmsv8XALsD2G6KRJLYu4
