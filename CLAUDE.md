@AGENTS.md

# LeaRN — repo guide for agents

LeaRN is a Socrative-style live learning platform for the Next Generation NCLEX. Read `docs/00-ROADMAP.md` for the plan and **`docs/01-NGN-ITEM-SPEC.md` before touching any item type.**

## Stack (installed versions; do not upgrade without asking)

Next.js 16.3 (App Router) · React 19.2 · TypeScript 5.9 · Tailwind 4.3 · Zod 4 · Vitest 5 · pnpm 11 · Node 22.

## Commands

`pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test` (`test:watch`, `test:coverage`) · `pnpm build` · `pnpm check` (everything CI runs).

## Hard rules

- `src/lib/ngn/**` is pure TypeScript: no imports from React, Next, or Supabase. 90% coverage gate.
- Every item type is a triplet: `src/lib/ngn/schemas/<type>.ts` + `src/lib/ngn/fixtures/<type>.ts` + `src/components/question/<type>/` (+ `src/components/authoring/<type>/` from Phase 2), registered in `src/lib/ngn/registry.ts`.
- Answer keys never reach a student client before reveal. Scoring runs server-side outside the gallery.
- Design: follow `docs/04-DESIGN-DIRECTION.md`. No emoji in product UI. Motion uses transform/opacity only and respects reduced motion. 375px first.
- Never commit secrets, `.env.local`, or real patient data. EHR content is fictional.
- Tests first (see `docs/03-AGENT-WORKFLOW.md`). Fixtures drive unit tests, the gallery, and screenshots.

## Git

Trunk-based. Branch `feat|fix|chore|docs|refactor|test/<summary>` from `main`, open a PR, squash-merge. PR titles are Conventional Commits (`feat(ngn): ...`). Never push to `main`. See `docs/05-VERSION-CONTROL-AND-DEPLOY.md`.
