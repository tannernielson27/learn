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
