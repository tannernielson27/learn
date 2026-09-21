# fix(live): make the Realtime channel private with a per-participant token

Closes #149 once the owner steps below are done. Merging this alone does not close it (see "What this PR does not close yet").

## The problem

`live:<sessionId>` was a public Realtime channel. Anyone with the publishable key and a session id could join it, watch the roster, put a made-up name in it (the presence forgery #150's review found), and follow the room's state changes over `postgres_changes` on `live.session_public_state`.

## What changed

**One participant identity, still.** #133 left exactly one: #129's httpOnly cookie, checked by `resume_participant`. This PR keeps it as the only identity. The channel token is minted from the cookie and never replaces it:

- The play page (`/play/[sessionId]`) already runs `resume_participant` on every render. After that check passes, it mints a **30-minute Supabase JWT**: `{ role: "anon", sub: <participant id>, live_session_id: <session id>, iat, exp }` (`src/lib/supabase/channelToken.ts`).
- `POST /api/live/channel` (new, `src/lib/liveSupabase/channelRoute.ts`) mints the next token. It checks the cookie the same way the view and submit routes do, and it charges the same per-participant view budget (`begin_session_view`, #152), so this adds no third rate limit. An ended session gets no token.
- No route accepts the token as proof of anything. Realtime is its only reader. Its role is `anon`, the same role the publishable key already has. That avoids the objection `participantToken.ts` records against Supabase anonymous sign-in: the token narrows what `anon` can see and adds no access.

**Private channels.** Participants and hosts now open `live:<id>` with `private: true`.

- A student's page uses its own Supabase client, built with an `accessToken` callback (`createSupabaseChannelClient`). That callback is `createChannelTokenSource`. It returns the token it holds and fetches a new one from the route in the last 5 minutes before expiry.
- A host joins with their own Supabase session.

**Policies** (`20260921210000_private_live_channel.sql`, additive only):

- `realtime.messages`:
  - `anon` may join, and track presence in, the topic `live:` + its token's `live_session_id` claim. Broadcasting is not allowed.
  - `authenticated` may watch any session that `public.sessions`' own RLS lets them read (their org), and may not track presence.
- `live.session_public_state`: two scoped select policies are added beside the existing `true` policy. They do nothing until a follow-up drops `true` (see the rollout order below).
- `private.live_topic_session(text)` parses a topic safely. A malformed topic means no session and never raises an error.

**A race in supabase-js, found against the real local Realtime.** A client built with `accessToken` fetches its token asynchronously. A channel subscribed before that fetch finishes joins with the publishable key's default token, and its automatic rejoins keep sending that same stale token. On a private channel, that is a permanent refusal. Both transports now `await client.realtime.setAuth()` before subscribing (`presentRealtimeToken` in `wire.ts`). The host side had the same problem.

## Owner configuration required: nothing is stubbed

Minting needs a key the Supabase project trusts. **Do not deploy this before setting it**: the student page throws an error naming the variable when it is missing.

1. **`SUPABASE_JWT_SIGNING_KEY`**, server-only. Set it in Vercel Production (production project's key) and Vercel Preview (preview project `vauokqoyvewtzubqajgh`'s key), and in your `.env.local` (the local stack prints it as `JWT_SECRET`). Use either:
   - **The legacy JWT secret.** Dashboard, Project Settings, JWT Keys, Legacy JWT Secret. This only works if the project has not revoked it.
   - **An ES256 key you import.** Run `pnpm exec supabase gen signing-key --algorithm ES256`, import it as a standby key under JWT Keys, then Rotate. Paste the one-line JWK, including its `kid`. Supabase never lets a key it generated be extracted, so this is the only route once a project has moved off the legacy secret.

   **Either key can sign a token for any Postgres role, `service_role` included.** Treat it exactly like `SUPABASE_SECRET_KEY`. If you import an ES256 key and rotate to it, Supabase Auth also signs every user session with it. CI already maps the local stack's `JWT_SECRET` to this variable.

2. **After deploy, turn off "Allow public access"** under Dashboard, Realtime, Settings, in both projects. Supabase documents this as the switch that enforces private channels. (Locally, a public channel on the same topic turned out to be a separate room: it neither saw nor affected the private roster. That result comes from the local Realtime version only.)
3. **Never add `live` to the exposed schemas.** Nothing in this PR touches that setting.

## Rollout order, and what this PR does not close yet

1. Owner sets `SUPABASE_JWT_SIGNING_KEY` in both Vercel scopes.
2. Merge; migration and code ship.
3. Owner turns off Realtime public access in both projects.
4. **Follow-up PR:** drop the policy `a subscriber may read the public state of a session it names` on `live.session_public_state`. Until then, the publishable key can still follow a known session's four public facts over `postgres_changes`. The drop is deferred because of the repo's migration rule (add now, drop later) and because it is the only safe order: migrations land before browsers carry tokens. The pgTAP test pins that the `true` policy is still there, so the follow-up has to change that test on purpose.

After step 2, the roster (presence read and write) is closed. After step 4, state is closed too.

## Token lifetime

- 30 minutes; refreshed 5 minutes before expiry from inside the `accessToken` callback, which supabase-js calls on every heartbeat.
- A phone that sleeps through its expiry gets a fresh token on its first heartbeat after waking.
- A participant the server no longer recognises gets no new token. Their socket drops when the last token expires. `router.refresh()` on the next rejoin then sends them to the join form.
- Removing a participant therefore closes their channel within at most 30 minutes, not instantly.

## Test plan

- [x] `pnpm typecheck`, `pnpm lint`, Prettier on every changed file (local)
- [x] Vitest (local), including these new tests:
  - `channelToken.test.ts`: HS256 and ES256 signatures verify; claims; key-parsing errors.
  - `channelRoute.test.ts`: the route mints only after the cookie check; refusals; a missing key fails loudly.
  - `channelTokenSource.test.ts`: refresh window; a single request in flight; never rejects.
  - `privateChannel.test.ts`: **a participant of session A cannot subscribe to session B**; a page that asks to open B still gets A's token and is refused; the publishable key alone is refused; forged and expired tokens are refused; a forged roster name is kept out; a host of another org is refused.
  - The whole room conformance suite now runs over private channels, with tokens from the real route.
- [x] pgTAP `live_private_channel.test.sql` (25 assertions) plus the full pgTAP suite (466), on the local stack
- [x] Probed by hand against the local stack's real Realtime:
  - A's token: joins A, tracks presence, and receives `postgres_changes`.
  - A's token on B: refused.
  - No token: refused.
  - Wrong key: `JwtSignatureError`. Expired token: `InvalidJWTToken`.
  - Signed-in host: own org's session allowed, another org's refused.
  - A 20-second token with a 2-second heartbeat stayed joined for 35 seconds (callback refresh works).
  - With the `true` state policy dropped temporarily: only A's token received A's state change.
- [ ] CI: e2e `join`, `liveAnswer` and `liveSession` specs against the local stack. **Not run locally.**
- [ ] On a preview deployment: a student joins, the roster fills, and the room moves.
- [ ] After step 3: confirm a public channel on `live:<id>` is refused on hosted.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_016tcmsv8XALsD2G6KRJLYu4
