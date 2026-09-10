# ADR 0001 — Single Next.js app, no monorepo

- **Status:** Accepted, 2026-09-10
- **Deciders:** product owner, Claude (TPM)

## Context

LeaRN has one deployable surface (the web app) and one piece of logic that must stay independent of the UI: the NGN schemas and scoring engine. A monorepo (pnpm workspaces, Turborepo) would isolate that core as a package, at the cost of extra build configuration, slower CI, and more moving parts for a two-person team on free tiers. Roadmap decision #8.

## Decision

Ship a single Next.js App Router app. Keep module boundaries inside it:

- `src/lib/ngn/**` is pure TypeScript with no imports from React, Next, or Supabase, and has its own 90% coverage gate.
- Features depend on `lib`; `lib` never depends on `components` or `app`.

## Consequences

- One `package.json`, one CI job, one Vercel project.
- Boundaries hold only if they are enforced: add an ESLint `import/no-restricted-paths` rule for `src/lib/ngn` before Phase 2.
- If a second app appears (for example a native shell or a separate authoring tool), extract `src/lib/ngn` into a workspace package. Keeping it pure now makes that a move, not a rewrite.
