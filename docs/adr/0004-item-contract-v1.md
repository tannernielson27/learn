# ADR 0004 — Item JSON contract v1 freezes at the end of Sprint 3

- **Status:** Accepted, 2026-09-10 (freeze takes effect at end of Sprint 3)
- **Deciders:** product owner, Claude (TPM)

## Context

The Zod schemas in `src/lib/ngn/schemas` define the item JSON that renderers, the authoring editors, JSON import/export, and (from Sprint 4) the `items.content` / `answer_key` database columns all share. While Phase 1 builds renderers, the shape needs room to change. Once authored items are stored, every change becomes a data migration.

## Decision

- Through Sprint 3 the schemas may change freely. Fixtures and tests move with them.
- At the end of Sprint 3 the shape is frozen as **v1**. Every item carries a `version`.
- After the freeze, a breaking change requires a version bump, a pure migration function in `src/lib/ngn` (`vN -> vN+1`, fixture-tested), and a database migration that applies it.
- Additive, optional fields do not need a bump.

## Consequences

- Sprint 3's Definition of Done includes a schema review against `01-NGN-ITEM-SPEC.md` before the freeze.
- Import accepts older versions and upgrades them on read.
