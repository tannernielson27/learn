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

- Require a pull request before merging; require 1 approval; dismiss stale approvals on new pushes. **Currently 0 approvals** while the owner is the only member (GitHub never lets authors approve their own PRs); raise it back to 1 the day the collaborator joins.
- Require status checks to pass: `check` (GitHub Actions) and `Vercel` (preview deployment).
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

**Visual baselines (from Sprint 2).** In CI the `e2e` job also compares each gallery item route with a committed baseline in `e2e/__screenshots__/<viewport>/<type>.png` and fails on more than 0.1% changed pixels; the HTML report in the `gallery-screenshots` artifact shows the expected, actual and diff images. Baselines come only from CI's Linux runner, because fonts render differently on Windows and macOS, so local runs skip the comparison. After a deliberate visual change, regenerate them on your branch and commit the images:

```sh
gh workflow run e2e-baselines.yml --ref <branch>
gh run download <run-id> -n gallery-baselines -D e2e/__screenshots__
```

`e2e` is not a required check, because it runs after Vercel deploys rather than on the PR commit.

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

Which Supabase project each one talks to is in [§7.1](#71-which-supabase-project-each-environment-uses).

Rules:

- `.env.example` is committed and lists every variable with a comment. Real values live only in Vercel project settings and each dev's `.env.local`. Adding a variable = update `.env.example` in the same PR and tell the other human to add it in Vercel.
- Public variables are prefixed `NEXT_PUBLIC_`; everything else is server-only.
- Preview and production point at **different** Supabase projects (ADR 0006), so a bad migration on a branch can never touch real class data. See §7.1.

**Rollback:** Vercel → Deployments → previous production deployment → "Promote to Production". Then open a `fix/*` PR. Never force-push `main`.

## 7. Database (Supabase)

- Schema changes are SQL migrations in `supabase/migrations/`, created with `supabase migration new <name>`, committed in the PR that needs them.
- CI runs the migrations against a throwaway local Supabase (Docker) to verify they apply cleanly.
- Every migration must be backward compatible with the currently deployed app (add columns, don't rename; drop only in a later PR), because a merge to `main` reaches production immediately.
- Nothing is ever changed by hand in the dashboard. The schema exists only in `supabase/migrations/`, which is what makes standing up a new project a replay rather than a rewrite.

### 7.1 Which Supabase project each environment uses

| Env            | Supabase project                                                | How it is wired                                                                        | Demo account                                       | Sample content                             |
| -------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| **Local**      | local stack, or the preview project                             | `.env.local`; local stack is `http://127.0.0.1:55321` after `pnpm exec supabase start` | `supabase/seed-demo.sql` (`demo@learn.test`)       | `supabase/seed.sql` via `db reset`         |
| **Preview**    | `learn` — ref `vauokqoyvewtzubqajgh`                            | Vercel "Preview" scope                                                                 | none — clear `DEMO_ACCOUNT_*` in the Preview scope | whatever the two of us have authored there |
| **Production** | its own project — ref `<prod-ref>` _(owner to create; see 7.3)_ | Vercel "Production" scope                                                              | one shared instructor account, created by hand     | loaded once from `supabase/seed.sql`       |

`/api/health` says which one a deployment actually reached:

```json
{ "supabase": "ok", "project": "vauokqoyvewtzubqajgh" }
```

`project` is the ref parsed out of `NEXT_PUBLIC_SUPABASE_URL`, or `local` for the local stack, or `unknown` when the variable is absent or is not a project URL. The ref is the public part of the URL; no key, URL or error text is ever echoed. **The demo step for the split is to open `/api/health` on the production URL and on a preview URL and see two different refs.**

### 7.2 Migrations in order

Everything in `supabase/migrations/` today, in filename order — this is the replay list, and a new project must end with all ten:

| #   | Migration                                   | What it adds                                                        | On `vauokqoyvewtzubqajgh`? |
| --- | ------------------------------------------- | ------------------------------------------------------------------- | -------------------------- |
| 1   | `20260913000000_authoring_schema`           | orgs, profiles, item banks, items, versions, case studies, RLS      | applied                    |
| 2   | `20260914000000_case_study_steps`           | step items live in the case study's bank; atomic reorder            | applied                    |
| 3   | `20260915000000_import_bank_content`        | one-call JSON import                                                | applied                    |
| 4   | `20260916000000_bank_folders`               | nested folders per bank                                             | **confirm**                |
| 5   | `20260919000000_item_tags`                  | tag filtering on the bank page                                      | **not applied**            |
| 6   | `20260919110000_start_step_and_rate_limits` | `start_case_study_step`, per-user rate limit on authoring mutations | **not applied**            |
| 7   | `20260919120600_duplicate_content`          | duplicate an item or a case study                                   | **not applied**            |
| 8   | `20260919130000_item_search`                | full-text search over a bank                                        | **not applied**            |
| 9   | `20260919150000_import_into_folder`         | import straight into a folder                                       | **not applied**            |
| 10  | `20260919160000_archive_content`            | archive and restore                                                 | **not applied**            |

> **Standing drift (Sprint 6).** Rows 4–10 are merged to `main` but not applied to the existing hosted project. **Until `20260919110000_start_step_and_rate_limits` is applied, that project refuses every save, publish and import** — the app calls functions that are not there. Apply rows 4–10 to `vauokqoyvewtzubqajgh` with §7.4 at the same time as the production project is stood up, so the two projects do not start out different.

### 7.3 Standing up a fresh project (the production split)

Run from the repo root, on a machine with the repo checked out. Steps 1–2 and 6 are dashboard work; the rest is copy-pasteable.

1. **Create the project.** Supabase dashboard → New project. Region `us-east-1` (same as `learn`). Either a paid plan on the existing organization or a second organization on the free tier — the free tier allows two active projects per organization and one is already taken. Name it `learn-prod`. Save the database password; it is shown once.
2. **Copy the ref.** Project Settings → General → Reference ID. It is the `<prod-ref>` below and the first label of the project URL, `https://<prod-ref>.supabase.co`.
3. **Replay every migration, in filename order.** `db push` applies exactly the files in `supabase/migrations/`, oldest first, and records each one; it never edits anything by hand.

   ```sh
   git switch main && git pull
   pnpm install --frozen-lockfile
   pnpm exec supabase login                       # opens a browser once
   pnpm exec supabase link --project-ref <prod-ref>
   pnpm exec supabase db push                     # prompts with the list before applying
   pnpm exec supabase migration list              # every row in 7.2 present, local and remote
   ```

4. **Load the sample content, then create the demo user — in that order.** `seed.sql` creates the org that the sign-up trigger puts the first user into, so a user created before it would land in an org of its own.

   ```sh
   # Connection string: dashboard > Project Settings > Database > Connection string > URI.
   # Paste the database password from step 1. Do not commit it or leave it in shell history.
   psql "postgresql://postgres:<password>@db.<prod-ref>.supabase.co:5432/postgres" \
     -v ON_ERROR_STOP=1 -f supabase/seed.sql
   ```

   `seed.sql` is generated from the fixtures and is safe to run once on an empty project. It inserts one org, one published "Samples" bank, every canonical item, the Trend item and the sample case study. Running it twice fails on the fixed ids, which is the point.

5. **Create the demo account — production only.** Dashboard → Authentication → Users → Add user. Email `demo@learn.app` (any address you control), a long random password, **Auto Confirm User on**. The trigger files it into the seeded org as an instructor. Never run `supabase/seed-demo.sql` against a hosted project: its password is public and local-only.
6. **Point Vercel Production at it.** Vercel → project → Settings → Environment Variables, **Production scope only**:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<prod-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the `sb_publishable_…` key from Project Settings → API Keys (never the `sb_secret_…` one)
   - `DEMO_ACCOUNT_EMAIL` / `DEMO_ACCOUNT_PASSWORD` = the user from step 5
     Leave the Preview scope pointing at `vauokqoyvewtzubqajgh`, with `DEMO_ACCOUNT_*` empty there.
7. **Redeploy and check.** Vercel → Deployments → latest production → Redeploy (env vars only apply to a new build). Then open `/api/health` on the production URL and on any preview URL: two different `project` refs, both `"supabase": "ok"`.

### 7.4 Catching an existing project up

Same `db push`, against the project that is behind. It applies only what is missing, in filename order.

```sh
pnpm exec supabase link --project-ref vauokqoyvewtzubqajgh
pnpm exec supabase migration list    # shows local-only rows: the drift in 7.2
pnpm exec supabase db push
pnpm exec supabase migration list    # local and remote now agree
```

If `migration list` disagrees about a migration that is genuinely already applied (row 4 above is the likely one), `supabase migration repair --status applied <version>` records it without re-running it. Never hand-edit the schema to make the list agree.

### 7.5 Verifying a replay before it touches anything hosted

A clean replay onto an empty database is a one-liner locally, and it is how any change to the list in §7.2 gets checked:

```sh
pnpm exec supabase start        # Docker Desktop must be running
pnpm exec supabase db reset     # drops, recreates, applies all migrations in order, then seeds
```

`db reset` prints each migration as it applies it and stops at the first failure. It also runs `seed.sql` and `seed-demo.sql`, so a green run proves the sample content and the local demo account still load against the current schema. Afterwards `pnpm db:types` regenerates `src/lib/supabase/database.types.ts`; CI fails if the committed file differs.

## 8. Working together day to day

- Pick a story from the sprint milestone, assign yourself, branch, PR. Two people never work on the same story.
- Small PRs (under ~400 lines changed) get reviewed same day. Big PRs wait.
- Merge conflicts: the person merging second resolves them on their branch, never on `main`.
- Never commit secrets, `.env.local`, screenshots of real people, or real patient data.
- If CI is red on `main` (should be impossible, but), fixing it is the top priority for whoever sees it first.

## 9. Sprint 0 checklist for this doc

- [x] Repo created, `main` protected with the settings in §4 (approvals temporarily 0, see §4)
- [x] PR template, CODEOWNERS, `.github/workflows/ci.yml` committed
- [x] commitlint + lint-staged hooks installed via Husky
- [x] Vercel project imported from GitHub; first preview and first production deploy verified
- [x] `.env.example` committed
- [ ] Collaborator invited to the GitHub repo (write) and has merged one small PR end to end
