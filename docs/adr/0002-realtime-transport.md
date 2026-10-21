# ADR 0002 — Supabase Realtime behind a swappable transport

- **Status:** Accepted, 2026-09-10 (implementation in Phase 3)
- **Deciders:** product owner, Claude (TPM)

## Context

Live sessions need presence, host-driven state (current item, reveal, pause), and aggregate results pushed to the instructor. Supabase Realtime is already in the stack and free, but the free tier caps concurrent connections (200) and monthly messages (2M). PartyKit, Ably or Convex could replace it if those limits bite.

## Decision

All live-session code talks to a `LiveSessionTransport` interface (`src/lib/live/`, see `02-ARCHITECTURE.md` §4). Ship two adapters:

1. **Supabase adapter:** Postgres changes on `sessions` and `session_item_aggregates`, Realtime Presence for the roster, submissions through a route handler.
2. **In-memory adapter:** for unit tests and the gallery's fake-room demo.

Aggregates are pushed once per item change, never once per submission.

## Consequences

- Swapping providers means writing one adapter; UI and stores do not change.
- The in-memory adapter lets live-session UI be built and demoed before the database exists.
- The interface must not leak Supabase types. Review this in the Phase 3 PR that introduces it.

## Addendum, 2026-09-21 (#149): the session channel is private

`live:<session id>` is a private Realtime channel. A signed-in host joins with their own session; a student joins with a thirty-minute `anon` JWT the server mints from the participant cookie after `resume_participant` has checked it (`src/lib/supabase/channelToken.ts`), refreshed through `POST /api/live/channel`. The `realtime.messages` policies in `20260921210000_private_live_channel.sql` let each token into its own session and no other. The participant cookie remains the one participant identity; the channel token is derived from it and read only by Realtime. It costs one server-only secret, `SUPABASE_JWT_SIGNING_KEY`.

## Addendum, 2026-10-16 (#426): only the host reads Presence

Accepted 2026-10-21, after the hosted before/after (docs/load-testing.md, "Hosted"). A phone tracks itself so the host's roster has its name, and is sent nobody else's: it binds no presence listener, and the `realtime.messages` select policy for a participant's token covers `broadcast` only (`20261016010000_room_count.sql`). Both halves are needed, because Realtime turns presence on for a socket the first time it tracks and then sends it presence wherever the policy lets it read. The waiting screen's count becomes `participant_count` on `live.session_public_state`: how many are in the room now, someone who has left not counted (owner decision, 2026-10-21). Only the host console, which keeps Presence, knows that, so it reports its roster's size with `refresh_participant_count` at most once every three seconds when the size changes, and the database caps it at how many have joined. `LiveSessionTransport.onPresence` becomes `onCount`; the host keeps `onPresence`.
