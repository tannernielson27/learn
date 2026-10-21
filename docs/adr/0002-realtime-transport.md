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
