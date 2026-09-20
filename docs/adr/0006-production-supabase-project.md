# ADR 0006 — Production runs on its own Supabase project

- **Status:** Accepted, 2026-09-19. Supersedes [ADR 0005](0005-supabase-environments.md).
- **Deciders:** product owner, Claude (TPM)

## Context

ADR 0005 put previews and production on one hosted project, `learn` (ref `vauokqoyvewtzubqajgh`), because Phase 2 had no real students and every row was an instructor's test bank or a sample. It said in as many words: **split before Sprint 7**.

Sprint 7 is live sessions with real students. From here a merged migration reaches real rows, and a branch that runs a migration against the shared project reaches them too. One project also means one set of auth users, so the shared demo account (#115) would sit in the same place as a real instructor's account.

The schema has only ever lived in `supabase/migrations/`; nothing has been changed by hand in the dashboard. That makes the split a replay, not a rewrite.

## Decision

- **Production gets its own hosted project.** It serves only the Vercel Production scope. Vercel Preview keeps pointing at `learn` (ref `vauokqoyvewtzubqajgh`), which becomes the dev/preview project. Local development keeps using the local stack or the preview project.
- **The production project is stood up by replaying `supabase/migrations/` in filename order onto an empty database**, with no hand edits, followed by the sample content and the demo account user. The exact procedure is in [docs/05-VERSION-CONTROL-AND-DEPLOY.md §7](../05-VERSION-CONTROL-AND-DEPLOY.md).
- **No data moves.** Every row in `learn` today is a test bank or a sample, and the samples are reproducible from the fixtures.
- **`/api/health` names the project it reached.** The response carries `project`: the ref parsed out of `NEXT_PUBLIC_SUPABASE_URL`, `local` for the local stack, or `unknown` when no ref can be derived. The ref is the public part of the project URL; no key, no full URL and no error text is ever echoed. Opening `/api/health` on the production URL and on a preview URL is how anyone confirms, from the outside, that the two are separate.
- **The demo account (#115) exists on production only.** The local stack keeps its own copy from `supabase/seed-demo.sql`; the preview project has none, because a preview is for the two of us. It is a shared instructor account with a password set by hand and, from #56, a per-IP rate limit. It is switched off by clearing `DEMO_ACCOUNT_EMAIL` / `DEMO_ACCOUNT_PASSWORD` in the Vercel Production scope.
- **A migration reaches preview first and production second**, through the merge to `main`. Every migration still has to be backward compatible with the deployed app (expand, then contract).

## Consequences

- A bad migration on a branch can no longer touch a real class's rows: the worst case is a broken preview project, which can be reset from migrations in minutes.
- Two projects now drift if one is left behind. The seven Sprint 6 migrations listed in docs/05 §7 must be applied to `vauokqoyvewtzubqajgh` as well as replayed onto production; until `20260919110000_start_step_and_rate_limits` is applied, every save, publish and import is refused.
- Two projects also means two free-tier budgets. The owner decides between a paid plan and a second organization when creating the project; either satisfies this ADR.
- The free tier pauses a project after about a week idle. A paused **preview** project now shows up as `unreachable` on a preview URL without touching production, which is exactly the separation we wanted.
- Generated types in `src/lib/supabase/database.types.ts` still come from the local stack (`pnpm db:types`), so they describe migrations rather than either hosted project. Nothing about the split changes that.

## Owner action, still outstanding

This ADR is accepted, but the split is not live until the owner creates the production project and sets the Vercel Production environment variables. The numbered steps are in [docs/05-VERSION-CONTROL-AND-DEPLOY.md §7](../05-VERSION-CONTROL-AND-DEPLOY.md).
