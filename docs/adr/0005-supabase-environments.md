# ADR 0005 — One hosted Supabase project for previews and production, for now

- **Status:** Accepted, 2026-09-12
- **Deciders:** product owner, Claude (TPM)

## Context

`02-ARCHITECTURE.md` §5 plans a dev project for previews and a separate production project. The Supabase free tier allows two active projects per organization, and the owner's organization already runs one for another product. Phase 2 has no real students and no real content: every row is an instructor's test bank or a sample.

## Decision

- One hosted project, `learn` (ref `vauokqoyvewtzubqajgh`, us-east-1, free tier), serves Vercel previews and production.
- Local development can use the same project or the local stack (`pnpm exec supabase start`, Docker Desktop).
- The schema lives only in `supabase/migrations/`. Nothing is changed by hand in the dashboard; generated types in `src/lib/supabase/database.types.ts` are committed and regenerated with `pnpm db:types`.
- The browser and server clients use the publishable key and run as the signed-in user, so row level security applies everywhere. No secret key is configured until a story needs to bypass RLS, and then only as a server-only variable.

## Consequences

- A migration merged to `main` is live for previews too; destructive migrations need a two-step (expand, then contract) change.
- Free projects pause after about a week without requests. `/api/health` reports `unreachable` when that happens; resume from the dashboard.
- **Split before Sprint 7** (live sessions with real students): create a production project on a paid plan or in a separate organization, point Vercel Production at it, and replay the migrations. Because the schema is only in migrations, the split is a replay, not a rewrite.
