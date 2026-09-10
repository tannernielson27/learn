# ADR 0003 — Scoring runs server-side; clients never hold the key before reveal

- **Status:** Accepted, 2026-09-10
- **Deciders:** product owner, Claude (TPM)

## Context

Every NGN item has an answer key and a scoring rule (0/1, plus-minus, dyad/triad rationale). If the key reaches a student's browser before the instructor reveals it, anyone with dev tools can read it, and the live-session results mean nothing.

## Decision

- The scoring engine in `src/lib/ngn/scoring` is pure and runs anywhere, but in production it is only called on the server (route handler or Postgres/Edge function) that reads the key and writes `responses.score`.
- Items have separate `content` and `answer_key` columns. RLS stops students from selecting `answer_key`. The key and rationale reach students only through a host-only reveal RPC.
- Client-side scoring is allowed only in the gallery and fixture modes, which have no real students. `ItemPlayer` already strips the key outside feedback mode.

## Consequences

- Submissions need a network round trip before a score exists. That is acceptable for live sessions, where scores appear on reveal anyway.
- Offline practice mode, if ever built, has to be an explicit exception with its own ADR.
- When student-facing payload builders arrive (Phase 3), each ships with a test asserting it never includes `answerKey`.
