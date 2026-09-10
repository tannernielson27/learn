# Version Control & Deployment

Two humans plus agents share one repo. These rules make branches and deploys boring: nothing lands on `main` without a green PR, every PR gets a live preview URL, and every merge to `main` ships to production automatically.

## 1. Repository

- GitHub: `tannernielson27/learn` (private). Default branch `main`.
- Package manager: pnpm (lockfile committed; CI uses `pnpm install --frozen-lockfile`).
- Node version pinned in `.nvmrc` / `package.json#engines` (22.x) so Vercel and both laptops build identically.

## 2. Branching model: trunk-based with short-lived branches

```
main ──●──────●──────●──────●──────●───▶  (always deployable, auto-deploys to production)
        \    /  \   /  \    /
         feat/   fix/   chore/            (branch per story, 1–3 days, deleted after merge)
```

- **`main` is protected.** No direct pushes, even by admins. Changes arrive only through pull requests.
- **One branch per story.** Branch from `main`, name it `<type>/<short-kebab-summary>` where type is one of `feat`, `fix`, `chore`, `docs`, `refactor`, `test`. Examples: `feat/matrix-multiple-choice`, `fix/select-n-cap`, `chore/ci-coverage-gate`. Add the issue number when there is one: `feat/12-bowtie-item`.
- **Keep branches short.** Merge within three days. If a story is bigger than that, split it. Rebase or merge `main` into your branch daily so the PR never drifts.
- **No long-lived `develop` or `release` branches.** Previews on every PR make them unnecessary.
- **Agents follow the same rules.** Each agent works in its own git worktree on its own `feat/*` branch and opens a PR; agents never push to `main`.

## 3. Commits

Conventional Commits, enforced by a `commit-msg` hook (commitlint):

```
<type>(<optional scope>): <imperative summary, ≤72 chars>

<optional body: what and why, not how>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`. Scopes match folders: `ngn`, `player`, `authoring`, `live`, `ehr`, `ui`, `ci`.

Examples:

```
feat(ngn): add plus-minus scoring with zero floor
fix(player): block the (n+1)th selection in Select N
ci: add coverage gate for src/lib/ngn
```

PRs are **squash-merged**, so the PR title becomes the single commit on `main` and must itself follow the format above. Individual commits on the branch can be messy.

## 4. Pull request flow

1. Open the PR early as a **draft**; fill the template (story, what changed, demo step, screenshots for UI).
2. CI runs automatically: typecheck → lint → unit tests with coverage → build. Vercel posts the preview URL as a comment.
3. Mark **Ready for review**. Request the other human. Agent reviews (`code-reviewer`, etc.) are attached as comments but do not count as approval.
4. Reviewer opens the preview on a phone and a laptop, checks the demo step, approves or requests changes.
5. Author squash-merges. The branch is deleted automatically. Vercel deploys `main` to production.

**Branch protection settings on `main`** (set once in GitHub → Settings → Branches):

- Require a pull request before merging; require 1 approval; dismiss stale approvals on new pushes.
- Require status checks to pass: `ci / check`, `Vercel` (preview deployment).
- Require branches to be up to date before merging.
- Require conversation resolution.
- Do not allow bypassing the above (applies to admins too).
- Allow squash merging only; auto-delete head branches.

`CODEOWNERS` lists both humans for `*` so either can be requested; `src/lib/ngn/**` and `supabase/**` require review from whoever owns scoring/database (decide in Sprint 0).

## 5. Continuous integration (`.github/workflows/ci.yml`)

One workflow, one required job `check`, runs on every PR and on pushes to `main`:

| Step      | Command                          | Fails when                                                  |
| --------- | -------------------------------- | ----------------------------------------------------------- |
| Install   | `pnpm install --frozen-lockfile` | lockfile out of date                                        |
| Typecheck | `pnpm typecheck`                 | any TS error                                                |
| Lint      | `pnpm lint`                      | ESLint errors (warnings allowed)                            |
| Unit      | `pnpm test -- --coverage`        | any failure; coverage <80% overall or <90% on `src/lib/ngn` |
| Build     | `pnpm build`                     | Next build fails                                            |

From Sprint 1: a second job `e2e` runs Playwright against the Vercel preview URL (using the `deployment_status` event) and uploads screenshots. From Sprint 4: `supabase db lint` and migration dry-run.

Concurrency: one run per branch, newer pushes cancel older runs.

## 6. Deployment (Vercel)

**Setup (once, Sprint 0):**

1. Vercel dashboard → Add New Project → Import `tannernielson27/learn` from GitHub. Framework preset: Next.js. Root: `/`.
2. Production branch: `main`. Leave "Automatically deploy" on for all branches. This gives:
   - **Preview deployment** for every push to every branch/PR at `learn-<hash>-<team>.vercel.app`, with a comment on the PR.
   - **Production deployment** for every merge to `main` at `learn.vercel.app` (custom domain later).
3. Enable "Vercel for GitHub" checks so the preview shows up as a required status check.
4. Add the collaborator to the Vercel project (Hobby allows one member per project; if that blocks, the collaborator gets preview URLs from PR comments, which is sufficient).

**Environments:**

| Env        | Trigger         | URL                          | Env vars                                              |
| ---------- | --------------- | ---------------------------- | ----------------------------------------------------- |
| Local      | `pnpm dev`      | localhost:3000               | `.env.local` (git-ignored) copied from `.env.example` |
| Preview    | any PR push     | per-deploy URL in PR comment | Vercel "Preview" scope                                |
| Production | merge to `main` | production URL               | Vercel "Production" scope                             |

Rules:

- `.env.example` is committed and lists every variable with a comment. Real values live only in Vercel project settings and each dev's `.env.local`. Adding a variable = update `.env.example` in the same PR and tell the other human to add it in Vercel.
- Public variables are prefixed `NEXT_PUBLIC_`; everything else is server-only.
- Preview and production point at **different** Supabase projects from Sprint 4 onward (dev/preview project and prod project), so a bad migration on a branch can never touch real class data.

**Rollback:** Vercel → Deployments → previous production deployment → "Promote to Production". Then open a `fix/*` PR. Never force-push `main`.

## 7. Database changes (from Sprint 4)

- Schema changes are SQL migrations in `supabase/migrations/`, created with `supabase migration new <name>`, committed in the PR that needs them.
- CI runs the migrations against a throwaway local Supabase (Docker) to verify they apply cleanly.
- Migrations are applied to the **dev/preview** Supabase project when the PR merges (GitHub Action with the Supabase access token), and to **prod** by the same action on `main`. Every migration must be backward compatible with the currently deployed app (add columns, don't rename; drop only in a later PR).

## 8. Working together day to day

- Pick a story from the sprint milestone, assign yourself, branch, PR. Two people never work on the same story.
- Small PRs (under ~400 lines changed) get reviewed same day. Big PRs wait.
- Merge conflicts: the person merging second resolves them on their branch, never on `main`.
- Never commit secrets, `.env.local`, screenshots of real people, or real patient data.
- If CI is red on `main` (should be impossible, but), fixing it is the top priority for whoever sees it first.

## 9. Sprint 0 checklist for this doc

- [ ] Repo created, `main` protected with the settings in §4
- [ ] PR template, CODEOWNERS, `.github/workflows/ci.yml` committed
- [ ] commitlint + lint-staged hooks installed via Husky
- [ ] Vercel project imported from GitHub; first preview and first production deploy verified
- [ ] `.env.example` committed
- [ ] Collaborator invited to the GitHub repo (write) and has merged one small PR end to end
