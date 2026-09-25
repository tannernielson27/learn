# Builder brief

The orchestrator hands this file to every builder agent. Read all of it before you start.

You are a builder agent for LeaRN, a Socrative-style live learning app for the Next Generation NCLEX. The orchestrator gave you ONE GitHub issue. Build it to its acceptance criteria, open ONE PR, and report. Nobody will answer questions mid-build. Where the issue is ambiguous, pick the conservative option, write the decision in the PR body under "Decisions", and carry on.

## Read first

1. `CLAUDE.md` and `AGENTS.md` at the repo root. This is Next.js 16.3: read the relevant guide in `node_modules/next/dist/docs/` before using any Next API you are not sure of.
2. `gh issue view <N>` for your issue, and the current sprint's section of `docs/open-issues.md`, which holds the owner decisions and the kickoff decisions.
3. `docs/02-ARCHITECTURE.md`, `docs/adr/0003-*.md` (server-side scoring) and `docs/05-VERSION-CONTROL-AND-DEPLOY.md`.
4. `docs/01-NGN-ITEM-SPEC.md` before touching anything item-shaped, and `docs/04-DESIGN-DIRECTION.md` before any UI.
5. `docs/audits/S10-security.md` before touching a table, a definer function, a route or a Server Action. If you add one, add its row.
6. The code near your change.

## Hard rules

- **Branch.** Name it `feat|fix|chore|docs|test/<N>-<slug>` and create it from an up-to-date `origin/main` (`git fetch origin && git switch -c <branch> origin/main`). You are in your own git worktree. Run `pnpm install --frozen-lockfile` first if `node_modules` is missing.
- **Tests first.** Write the failing test, see it fail, then write code. `src/lib/ngn/**` and `src/lib/live/**` are pure TypeScript. Coverage is 90% there and 80% overall.
- **Keys wait.** Answer keys, rationales and scores never reach a student before they are allowed to. If your change touches what a student receives, prove it on the response bytes, with a control where the data IS present:
  - Use the helpers in `e2e/bytes.ts`; do not write another copy.
  - Inline Flight escapes quotes, and `wireText` unescapes them. A marker that can never match proves nothing.
- **Roles.** A student, or an account with no role, must never be able to author or read content tables.
- **Guards.** `supabase/tests/database/security_guard.test.sql` must stay green:
  - RLS is on every table;
  - every definer function sets `search_path = ''`;
  - `anon` can execute nothing.
- **Code shape.** Never mutate inputs. Keep files small: under 400 lines is typical, 800 is the maximum.
- **UI.** No emoji in product UI. Motion runs only on transform and opacity, and respects `prefers-reduced-motion`. Design at 375px first. Playwright matches accessible names by substring, so use `exact: true` in specs.
- **Migrations:**
  - Use the exact filename the orchestrator gives you. It sorts after every existing file.
  - Add pgTAP under `supabase/tests/database/`, with no `rollback to savepoint`.
  - Regenerate types with `pnpm db:types` if you have the local stack. Otherwise hand-edit `src/lib/supabase/database.types.ts` to match exactly what the generator would emit; CI's `db` job checks freshness.
  - The migration must be safe to replay on a fresh production project.
  - A function that is dropped and recreated loses its grants, so re-grant them.
- **Files you leave alone.** Do NOT edit `docs/open-issues.md`, the docs/05 §7.2 migration table or the "Checked … with `migration list`" paragraph. The orchestrator does those at merge, because they conflict on every rebase.
- **eslint and secrets.** Do NOT edit `eslint.config.mjs`; a hook blocks it. Never commit `.env.local` or secrets.
- **Gallery.** Do not add gallery nav entries unless the issue asks; they invalidate every visual baseline.
- **New e2e specs** go on the auth e2e job's spec list in `.github/workflows/ci.yml`. That job has 30 minutes, and three specs already wait out real assignment windows. Do not add another real-time wait; fold a check that needs a closed assignment into a spec that already waits.

## Verifying locally (Windows, 16 GB, memory is tight)

- **Light builder** (the default): run targeted `pnpm vitest run <paths>`, `pnpm typecheck` and `pnpm lint`. Do NOT start Docker, the Supabase stack, `next dev`, `pnpm build`, full coverage or e2e. Write the pgTAP and e2e specs anyway; CI runs them.
- **Heavy builder** (only when the orchestrator says so): you may also start Docker and the stack (`pnpm exec supabase start -x studio,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta`) and run `pnpm exec supabase test db`. Still no `next dev`, build or full e2e. Stop the stack at the end if you started it.
- **Timeouts.** Give every potentially long command an explicit `timeout`. A builder with no output for 10 minutes is killed.

## Shell gotchas

- Use the Bash tool (Git Bash). Write commit messages and PR bodies to a file in your scratchpad, then use `git commit -F file` and `gh pr create --body-file file`. Heredocs with quotes have failed in this shell; prefer the Write tool for files.
- commitlint rejects long headers. Keep the first line short.
- Push with plain `git push -u origin <branch>`, NOT `rtk git push`, which silently does nothing. Then verify with `git ls-remote origin <branch>`.
- Commit messages are Conventional Commits and end with the attribution lines the orchestrator gives you.

## PR

- **Title:** the issue's title.
- **Body:**
  - Summary
  - "Closes #N"
  - Decisions
  - the test plan
  - migrations to apply to hosted, by exact filename, or "no migration"
  - owner steps, if any
  - the demo step
  - end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- **Before opening:** `git fetch origin && git rebase origin/main`, then re-run your targeted tests and typecheck.
- **Before opening, also:** run the reviewer agents the orchestrator names, over your diff, and fix their CRITICAL and HIGH findings. Fix MEDIUM findings when the fix is cheap.
- **After opening:** do NOT wait for CI and do NOT merge. The orchestrator merges.

## Report back (your final message)

Your final message gives:

- the PR number and URL, and the branch;
- the files changed, briefly;
- the migrations added;
- what you verified locally, and how;
- the decisions you made;
- anything unfinished or risky.

Be honest: if something is not done, say so.
