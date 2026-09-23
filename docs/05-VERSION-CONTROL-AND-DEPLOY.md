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

Everything in `supabase/migrations/` today, in filename order — this is the replay list, and a new project must end with every row below. Add a row in the same PR as the migration; a table that silently falls behind the directory is worse than none, because a replay checked against it looks complete when it is not.

| #   | Migration                                      | What it adds                                                                   | On `vauokqoyvewtzubqajgh`? |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| 1   | `20260913000000_authoring_schema`              | orgs, profiles, item banks, items, versions, case studies, RLS                 | applied                    |
| 2   | `20260914000000_case_study_steps`              | step items live in the case study's bank; atomic reorder                       | applied                    |
| 3   | `20260915000000_import_bank_content`           | one-call JSON import                                                           | applied                    |
| 4   | `20260916000000_bank_folders`                  | nested folders per bank                                                        | applied                    |
| 5   | `20260919000000_item_tags`                     | tag filtering on the bank page                                                 | applied                    |
| 6   | `20260919110000_start_step_and_rate_limits`    | `start_case_study_step`, per-user rate limit on authoring mutations            | applied                    |
| 7   | `20260919120600_duplicate_content`             | duplicate an item or a case study                                              | applied                    |
| 8   | `20260919130000_item_search`                   | full-text search over a bank                                                   | applied                    |
| 9   | `20260919150000_import_into_folder`            | import straight into a folder                                                  | applied                    |
| 10  | `20260919160000_archive_content`               | archive and restore                                                            | applied                    |
| 11  | `20260919170000_live_sessions`                 | live sessions with a six-character join code (#128)                            | applied                    |
| 12  | `20260920130000_live_responses_and_aggregates` | live responses, server-side scoring, per-participant submit limit (#131, #133) | applied                    |
| 13  | `20260920140000_session_participants`          | join with a display name and no account (#129)                                 | applied                    |
| 14  | `20260921000000_resume_participant_joined_at`  | resume a participant after a reload (#133)                                     | applied                    |
| 15  | `20260921100000_live_view_rate_limit`          | per-participant limit on `POST /api/live/view` (#152)                          | applied                    |
| 16  | `20260921200000_authoring_limit_at_the_write`  | authoring rate limit enforced at the write, not only in the UI (#123)          | applied                    |
| 17  | `20260921210000_private_live_channel`          | private Realtime channel with a per-participant token (#149)                   | applied                    |
| 18  | `20260923010000_item_timer`                    | optional per-item timer on a live session (#182)                               | applied                    |
| 19  | `20260923060000_session_goto`                  | skip an item or go back to one (#183)                                          | applied                    |
| 20  | `20260923070000_case_study_live_record`        | run a case study live with the patient record on every phone (#184)            | applied                    |
| 21  | `20260923080000_student_paced`                 | student-paced mode (#185)                                                      | applied                    |
| 22  | `20260924000000_invite_only_signup`            | new accounts get no role; `private.make_instructor` (#204, §7.6)               | applied                    |

Checked 2026-09-23 with `pnpm exec supabase migration list --linked`: every row is applied to `vauokqoyvewtzubqajgh`, local and remote histories match (rows 4–21 were pushed on 2026-09-22 and 23, row 22 straight after #214 merged). Re-run that command before trusting this column; a new row is **not applied** until someone pushes it.

> **No standing drift.** The existing hosted project is current. The separate production project (§7.3) does not exist yet and will need every row replayed when it is created.

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

4. **Load the sample content, then create the demo user — in that order.** `seed.sql` creates the org that `private.make_instructor` puts the first instructor into; promoting someone before it would make an empty org of its own.

   ```sh
   # <db-uri>: dashboard > Project Settings > Database > Connection string. Take the direct
   # connection or the SESSION pooler (port 5432), not the transaction pooler (6543) — seed.sql
   # is one multi-statement file. Paste the password from step 1; never commit it, and keep it
   # out of shell history (a leading space, or read it from an environment variable).
   psql "<db-uri>" -v ON_ERROR_STOP=1 -f supabase/seed.sql
   ```

   `seed.sql` is generated from the fixtures and is safe to run once on an empty project. It inserts one org, one published "Samples" bank, every canonical item, the Trend item and the sample case study. Running it twice fails on the fixed ids, which is the point.

5. **Create the demo account — production only.** Dashboard → Authentication → Users → Add user. Email `demo@learn.app` (any address you control), a long random password, **Auto Confirm User on**. Then make it an instructor with the one line in §7.6 — since #204 a new account has no role until you do. Never run `supabase/seed-demo.sql` against a hosted project: its password is public and local-only.

   **Every author account is created here too, and only here.** #139 turned self-serve sign-up off: the sign-in form no longer creates an account, so an address that has none is answered exactly like an address that has one and is simply never mailed. To add an instructor, Add user with their address and **Auto Confirm User on** — no password is needed, they sign in from the emailed link — then run the §7.6 line for that address, then tell them to ask for a link. Until that account exists, the form will tell them to check an inbox nothing was sent to; that silence is deliberate, because any other answer would say aloud which addresses have accounts.

6. **Point Vercel Production at it.** Vercel → project → Settings → Environment Variables, **Production scope only**:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<prod-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the `sb_publishable_…` key from Project Settings → API Keys (never the `sb_secret_…` one)
   - `DEMO_ACCOUNT_EMAIL` / `DEMO_ACCOUNT_PASSWORD` = the user from step 5
   - `SUPABASE_JWT_SIGNING_KEY` = this project's JWT signing key (#149; `.env.example` says which key and where). Server only. The Preview scope needs its own, from the preview project.
     Leave the Preview scope pointing at `vauokqoyvewtzubqajgh`, with `DEMO_ACCOUNT_*` empty there.
7. **Redeploy and check.** Vercel → Deployments → latest production → Redeploy (env vars only apply to a new build). Then open `/api/health` on the production URL and on any preview URL: two different `project` refs, both `"supabase": "ok"`.
8. **Make Realtime private-only (#149), once the private-channel code is deployed.** Dashboard → Realtime → Settings → turn **Allow public access** off, in both projects. Every live-session channel is private from #149 on; this makes Realtime refuse a public channel on any topic. Never add `live` to the Data API's exposed schemas while you are in the dashboard: that is what keeps `live.session_public_state` unlistable.

### 7.4 Catching an existing project up

**Environment variables first.** A variable added to the app after a project was set up is not added by `db push`. Since #149, the student page needs `SUPABASE_JWT_SIGNING_KEY` in every Vercel scope, each with its own project's key (`.env.example` says which key and where), and each project needs Realtime's **Allow public access** turned off once the private-channel code is deployed (§7.3 step 8). Set the variable before the deploy that ships #149, or students cannot open a session.

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

### 7.6 Adding an instructor (two steps, since #204)

Sign-up is invite-only. A new account, however it was made, gets a profile with **no org and no role**: it can sign in, lands on "No access yet", and row level security shows it nothing. Nothing makes an account an instructor automatically, so adding one is two steps:

1. Dashboard → Authentication → Users → **Add user**, their address, **Auto Confirm User on**.
2. Dashboard → SQL Editor, in the same project:

   ```sql
   select private.make_instructor('person@example.com');
   ```

It finds the account by address (any letter case), puts it in the org (`seed.sql`'s, or a new "LeaRN" org on a project that has none) and makes it an instructor. An admin stays an admin, running it twice is harmless, and an address with no account is an error rather than a silent success. A student's address is refused too, so a typo cannot hand a student the answer keys. It runs only from the SQL editor: no API role (`anon`, `authenticated`, `service_role`) may call it. The person reloads and lands on the author home.

To check who is what: `select u.email, p.role from auth.users u join public.profiles p on p.id = u.id order by u.email;`

Existing accounts were not changed by #204: the demo account and every current instructor keep their role. From #205 on, a student joins through an instructor's class invite, which sets `app_metadata.learn_invite` server-side; never set a role through `user_metadata`, which the person can write themselves.

### 7.7 Email through Resend from info.tannernielson.com (#206)

Two senders, one Resend account. **Supabase Auth** sends the magic links itself, over Resend's SMTP, using `supabase/templates/magic_link.html`. **The app** sends its own transactional mail (reminders, #212) through `src/lib/email`, which calls Resend's HTTP API with `RESEND_API_KEY` and `EMAIL_FROM`. Locally, neither touches Resend: Auth mail and app mail both land in the local stack's Mailpit at `http://127.0.0.1:55324`.

Until steps 2–4 are done in a project, its magic links go out through Supabase's built-in mailer, which only delivers to the project's own team members and allows about two emails an hour. That is fine for the two of us and useless for a class.

Do these in order, in **both** Supabase projects (production and `vauokqoyvewtzubqajgh`) unless a step says otherwise. Tick each one here in the PR that records it.

1. **[ ] Resend domain verified.** Resend → Domains → `info.tannernielson.com` shows **Verified** (the SPF, DKIM and MX records it lists are at the DNS host for `tannernielson.com`). Nothing else works until this does. Then Resend → API Keys → **Create API key**, permission **Sending access**, domain `info.tannernielson.com`. Make one key per environment (`learn-production`, `learn-preview`) so either can be revoked alone. Each key is shown once.
2. **[ ] Supabase custom SMTP.** Supabase → Authentication → Emails → **SMTP Settings** → Enable custom SMTP:
   - Sender email: `learn@info.tannernielson.com` · Sender name: `LeaRN`
   - Host: `smtp.resend.com` · Port: `465`
   - Username: `resend` · Password: that environment's Resend API key from step 1
     Save. (Source: <https://resend.com/docs/send-with-supabase-smtp>.)
3. **[ ] Magic-link template.** Authentication → Emails → **Magic Link**: subject `Sign in to LeaRN`, body = the whole of `supabase/templates/magic_link.html`, pasted as it is. Its link sends a `token_hash` to `/auth/confirm`, so it works on a phone the link was not requested from.
4. **[ ] Raise the Auth email rate limit.** Authentication → **Rate Limits** → "Rate limit for sending emails" (only editable once step 2 is saved). Set **150 per hour** in production: a 40-student class asking for links in the same five minutes, with retries, plus instructors. Keep Resend's own quota in mind (the free plan is 100 emails a day); upgrade the Resend plan before a class larger than that. Preview can stay at 30. The app's own per-IP limit (`src/lib/auth/signInRateLimit.ts`, #134) still caps each IP at 30 emailed links per five minutes; a whole class behind one campus NAT shares one IP, so a class over about 30 can hit it before this one.
5. **[ ] Auth Site URL and redirect URLs.** Authentication → **URL Configuration**:
   - Production project: Site URL `https://learn.vercel.app` (or the custom domain once it exists); Redirect URLs `https://learn.vercel.app/**`.
   - Preview project (`vauokqoyvewtzubqajgh`): Site URL `https://learn.vercel.app`; Redirect URLs `https://*-<team>.vercel.app/**` (the preview pattern from §6) and `http://localhost:3000/**`.
     A redirect that is not on the list silently falls back to the Site URL, which lands a preview's link on production.
6. **[ ] Vercel environment variables.** Vercel → project → Settings → Environment Variables, both server-only (no `NEXT_PUBLIC_`):
   - **Production** scope: `RESEND_API_KEY` = the `learn-production` key; `EMAIL_FROM` = `LeaRN <learn@info.tannernielson.com>`.
   - **Preview** scope: `RESEND_API_KEY` = the `learn-preview` key; `EMAIL_FROM` = the same sender.
     Redeploy each (env vars apply to a new build only). Nothing sends app email until #212, so a missing value breaks no page; a send attempt without them fails with an error naming `RESEND_API_KEY`.
7. **[ ] Check it.** On the production URL, ask for a link to an instructor address you own: it arrives from `LeaRN <learn@info.tannernielson.com>` with the LeaRN template, and signs you in. Resend → Emails lists it as delivered.

The app mailer never logs a recipient's address, a message body or the key, and its errors carry only the HTTP status and Resend's error name. Build each message's idempotency key from what it is about (`reminder:<assignmentId>:<userId>`), never from the address; Resend drops a repeat of the same key for 24 hours.

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
