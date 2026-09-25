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
{ "supabase": "ok", "project": "vauokqoyvewtzubqajgh", "version": "9288d33a1b2c", "ready": false }
```

`project` is the ref parsed out of `NEXT_PUBLIC_SUPABASE_URL`, or `local` for the local stack, or `unknown` when the variable is absent or is not a project URL. The ref is the public part of the URL; no key, URL or error text is ever echoed. `version` is the deployed commit (`local` off Vercel) and `ready` is the one-word answer of the go-live check ([§7.11](#711-go-live-every-owner-step-in-order-and-pnpm-golivecheck-237)). **The demo step for the split is to open `/api/health` on the production URL and on a preview URL and see two different refs.**

### 7.2 Migrations in order

Everything in `supabase/migrations/` today, in filename order — this is the replay list, and a new project must end with every row below. Add a row in the same PR as the migration; a table that silently falls behind the directory is worse than none, because a replay checked against it looks complete when it is not.

| #   | Migration                                      | What it adds                                                                       | On `vauokqoyvewtzubqajgh`? |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------- |
| 1   | `20260913000000_authoring_schema`              | orgs, profiles, item banks, items, versions, case studies, RLS                     | applied                    |
| 2   | `20260914000000_case_study_steps`              | step items live in the case study's bank; atomic reorder                           | applied                    |
| 3   | `20260915000000_import_bank_content`           | one-call JSON import                                                               | applied                    |
| 4   | `20260916000000_bank_folders`                  | nested folders per bank                                                            | applied                    |
| 5   | `20260919000000_item_tags`                     | tag filtering on the bank page                                                     | applied                    |
| 6   | `20260919110000_start_step_and_rate_limits`    | `start_case_study_step`, per-user rate limit on authoring mutations                | applied                    |
| 7   | `20260919120600_duplicate_content`             | duplicate an item or a case study                                                  | applied                    |
| 8   | `20260919130000_item_search`                   | full-text search over a bank                                                       | applied                    |
| 9   | `20260919150000_import_into_folder`            | import straight into a folder                                                      | applied                    |
| 10  | `20260919160000_archive_content`               | archive and restore                                                                | applied                    |
| 11  | `20260919170000_live_sessions`                 | live sessions with a six-character join code (#128)                                | applied                    |
| 12  | `20260920130000_live_responses_and_aggregates` | live responses, server-side scoring, per-participant submit limit (#131, #133)     | applied                    |
| 13  | `20260920140000_session_participants`          | join with a display name and no account (#129)                                     | applied                    |
| 14  | `20260921000000_resume_participant_joined_at`  | resume a participant after a reload (#133)                                         | applied                    |
| 15  | `20260921100000_live_view_rate_limit`          | per-participant limit on `POST /api/live/view` (#152)                              | applied                    |
| 16  | `20260921200000_authoring_limit_at_the_write`  | authoring rate limit enforced at the write, not only in the UI (#123)              | applied                    |
| 17  | `20260921210000_private_live_channel`          | private Realtime channel with a per-participant token (#149)                       | applied                    |
| 18  | `20260923010000_item_timer`                    | optional per-item timer on a live session (#182)                                   | applied                    |
| 19  | `20260923060000_session_goto`                  | skip an item or go back to one (#183)                                              | applied                    |
| 20  | `20260923070000_case_study_live_record`        | run a case study live with the patient record on every phone (#184)                | applied                    |
| 21  | `20260923080000_student_paced`                 | student-paced mode (#185)                                                          | applied                    |
| 22  | `20260924000000_invite_only_signup`            | new accounts get no role; `private.make_instructor` (#204, §7.6)                   | applied                    |
| 23  | `20260924010000_classes`                       | classes, rosters and invite links; completes the invite seam (#205)                | applied                    |
| 24  | `20260924020000_assignments`                   | assign a bank or case study to a class with a window and attempts (#207)           | applied                    |
| 25  | `20260924030800_assignment_attempts`           | take an assignment: attempts, autosave, submit, submit at close (#208)             | applied                    |
| 26  | `20260924040000_assignment_report`             | the author's read of attempt scores for the assignment report (#211)               | applied                    |
| 27  | `20260924050000_my_assignment_result`          | a student's own score and marks after an assignment closes (#210)                  | applied                    |
| 28  | `20260924060000_assignment_reminders`          | reminder email outbox, class time zone, the pg_cron entry point (#212, §7.8)       | applied                    |
| 29  | `20260925000000_security_guard`                | RLS on class_removals, anon execute revoked, removal trigger skips cascades (#233) | applied                    |
| 30  | `20260925010000_shared_rate_limits`            | sign-in, invite and cron limits shared across server instances, keys hashed (#234) | applied                    |
| 31  | `20260925020000_class_timezone_and_removed`    | class time zone set in the app; removed students in the assignment report (#242)   | applied                    |
| 32  | `20260925030000_student_history`               | a student's closed assignments with their own attempts, for History (#238)         | applied                    |
| 33  | `20260925040000_practice_shares`               | share a bank with a class for practice; the graded-reuse warning (#240)            | applied                    |
| 34  | `20260925050000_rate_limit_sweep`              | a pg_cron job sweeps expired shared rate-limit rows every 5 minutes (#248, §7.8)   | applied                    |
| 35  | `20260925060000_student_steps`                 | a student's own marks by CJMM step on closed assignments, for Your steps (#239)    | applied                    |
| 36  | `20260925070000_practice`                      | practice runs and responses on a shared bank, scored one item at a time (#241)     | applied                    |
| 37  | `20260926000000_practice_run_items`            | a practice run records its items and their published content when it starts (#271) | applied                    |

Checked 2026-09-24 with `pnpm exec supabase migration list --linked`: rows 1–37 are applied to `vauokqoyvewtzubqajgh`, local and remote histories match (rows 4–21 were pushed on 2026-09-22 and 23, row 22 straight after #214 merged, row 23 straight after #220, row 24 straight after #222, row 25 straight after #224, row 26 straight after #226, row 27 straight after #228, row 28 straight after #230, row 29 straight after #245, row 30 after #247 and row 31 after #251 and row 32 after #254 and row 33 after #255 and row 34 after #257 and row 35 after #258 and row 36 after #261, all on 2026-09-24, and row 37 straight after #284 on 2026-09-25). Re-run that command before trusting this column; a new row is **not applied** until someone pushes it.

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

A class invite never demotes anyone. An instructor who opens one is told they already are one; an account with no role that joins becomes a student, and `make_instructor` then refuses it (remove it from its classes and set the role by hand if that was a mistake). To see a class's roster from the SQL editor: `select u.email, c.name from public.class_members m join public.classes c on c.id = m.class_id join auth.users u on u.id = m.profile_id order by c.name, u.email;`
Removing a student from a roster is recorded in `private.class_removals`, so the invite link they still hold will not let them back in. To let a removed student rejoin, delete their row in the SQL editor, then send them the link again: `delete from private.class_removals where profile_id = (select id from auth.users where lower(email) = lower('student@example.com'));`

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
3. **[ ] Magic-link template.** Authentication → Emails → **Magic Link**: subject `Sign in to LeaRN`, body = the whole of `supabase/templates/magic_link.html`, pasted as it is. Its link sends a `token_hash` to `/auth/confirm`, so it works on a phone the link was not requested from. The file is generated from `src/lib/email/templates/magicLink.ts` (#268), so it shares the reminders' layout; after a change to it merges, paste it again in both projects. To see it before pasting, open `<preview URL>/gallery/email` (closed on production, like the rest of the gallery), which renders it and both reminders with sample data.
4. **[ ] Raise the Auth email rate limit.** Authentication → **Rate Limits** → "Rate limit for sending emails" (only editable once step 2 is saved). Set **150 per hour** in production: a 40-student class asking for links in the same five minutes, with retries, plus instructors. Keep Resend's own quota in mind (the free plan is 100 emails a day); upgrade the Resend plan before a class larger than that. Preview can stay at 30. The app's own limits (`src/lib/auth/signInRateLimit.ts`) sit in front of this one, counted in Postgres so they hold across every server instance (#234; row 30 must be applied, or every sign-in and invite link is refused): plain sign-in is capped at 30 emailed links per IP per five minutes (#134), but a request through a **valid** class invite link is counted per class and IP instead, at 120 per five minutes, and at most 150 per IP across every class it holds a link to (#217), so a whole class behind one campus NAT gets through while a caller holding many links cannot stack them. A refused class invite logs `[invite] a class invite link reached its rate limit` with the class id: if that class is not in the middle of signing up, rotate its link. That makes this limit the ceiling a large class meets first: 150 an hour is shared by the whole deployment, so a 60-student class spends a good part of it in one go. Raise it before a class larger than that, and rotate a class's invite link (the class's own page under Classes) if a shared link is being used to mail strangers.
5. **[ ] Auth Site URL and redirect URLs.** Authentication → **URL Configuration**:
   - Production project: Site URL `https://learn-tanner-nielsons-projects.vercel.app` (or the custom domain once it exists); Redirect URLs `https://learn-tanner-nielsons-projects.vercel.app/**`.
   - Preview project (`vauokqoyvewtzubqajgh`), which serves production too until the §7.3 split: Site URL `https://learn-tanner-nielsons-projects.vercel.app`; Redirect URLs `https://learn-tanner-nielsons-projects.vercel.app/**`, `https://learn-*-tanner-nielsons-projects.vercel.app/**` (previews) and `http://localhost:3000/**`.
     A redirect that is not on the list silently falls back to the Site URL, which lands a preview's link on production.
6. **[ ] Vercel environment variables.** Vercel → project → Settings → Environment Variables, both server-only (no `NEXT_PUBLIC_`):
   - **Production** scope: `RESEND_API_KEY` = the `learn-production` key; `EMAIL_FROM` = `LeaRN <learn@info.tannernielson.com>`.
   - **Preview** scope: `RESEND_API_KEY` = the `learn-preview` key; `EMAIL_FROM` = the same sender.
     Redeploy each (env vars apply to a new build only). Only the reminder job (#212, §7.8) sends app email, so a missing value breaks no page; without them the job sends nothing and keeps every reminder for its next run, logging an error that names `RESEND_API_KEY`.
7. **[ ] Check it.** On the production URL, ask for a link to an instructor address you own: it arrives from `LeaRN <learn@info.tannernielson.com>` with the LeaRN template, and signs you in. Resend → Emails lists it as delivered.

The app mailer never logs a recipient's address, a message body or the key, and its errors carry only the HTTP status and Resend's error name. Build each message's idempotency key from what it is about (`reminder:<assignmentId>:<userId>:<kind>`), never from the address; Resend drops a repeat of the same key for 24 hours.

### 7.8 Scheduled jobs: reminder emails, the submit at close, and the rate-limit sweep (#212, #248, ADR 0007)

pg_cron in the database calls the app's `POST /api/cron/assignment-reminders` every 15 minutes through pg_net, with a shared secret. Each run submits attempts left open at close (#208) and sends the reminder emails that are due: "Week 5 is open" to every class member when an assignment opens, and "Week 5 closes tomorrow at 17:00" 24 hours before close to members who have not submitted. Until these steps are done in a project nothing is scheduled: no reminder goes out, and the submit at close happens only when someone opens the assignment or its report, as before. Do them after migration 28 is applied and after §7.7 (the job sends through Resend).

Until the §7.3 split there is one project and one job, pointed at the production URL. After the split, repeat steps 1–4 in the production project with its own secret, and leave the preview project unscheduled.

1. **[ ] Make the secret.** On your own machine: `openssl rand -hex 32` (64 characters; the route refuses anything under 32). It is shown once here and pasted twice below; do not save it anywhere else.
2. **[ ] Vercel `CRON_SECRET`.** Vercel → project → Settings → Environment Variables → `CRON_SECRET` = that value, **Production** scope, server-only (never `NEXT_PUBLIC_`). Redeploy. Until it is set the route answers every call `503 not_configured`.
3. **[ ] Enable the two extensions.** Supabase → Database → Extensions → enable **pg_cron** (it installs into `pg_catalog`) and **pg_net** (schema `extensions`). Or in the SQL editor: `create extension if not exists pg_cron with schema pg_catalog; create extension if not exists pg_net with schema extensions;`
4. **[ ] Store the URL and the secret in Vault, then schedule the job.** Supabase → SQL Editor, in the same project, with the secret from step 1 pasted in place of `<secret>`:

   ```sql
   select vault.create_secret('https://learn-tanner-nielsons-projects.vercel.app/api/cron/assignment-reminders', 'learn_reminders_url');
   select vault.create_secret('<secret>', 'learn_cron_secret');
   select cron.schedule('learn-assignment-reminders', '*/15 * * * *', $$select private.call_reminder_route()$$);
   select private.schedule_rate_limit_sweep();
   ```

   The last line schedules the second job, `learn-rate-limit-sweep` (#248): every 5 minutes it deletes up to 5000 expired rows from `private.shared_rate_limits`, the sign-in, invite and cron limiter of #234, so a flood from many addresses cannot grow that table faster than the limiter's own cleanup. It needs no URL and no secret, only pg_cron. It answers `scheduled`, or `updated` when its migration (`20260925050000_rate_limit_sweep`) already scheduled it (the migration does that on a project where pg_cron was on before it was applied), or `no_pg_cron` when step 3 is not done. Running it again never makes a second job: it resets the existing one and switches it back on.

   Use the production URL (or the custom domain once it exists); a preview URL sits behind Vercel's deployment protection and would answer with a login page. To change either value later: `select vault.update_secret((select id from vault.secrets where name = 'learn_cron_secret'), '<new secret>');` (and the same for the URL), then update `CRON_SECRET` in Vercel and redeploy. Never run `create_secret` again for a name that already exists: Vault allows two secrets with one name, and although the job reads the newest, a stale copy is confusing to debug. Check with `select name, created_at from vault.secrets where name like 'learn_%';`

5. **[ ] Check it.** In the SQL editor, `select private.call_reminder_route();` must answer `queued` (anything else names what is missing: `no_pg_net`, `no_vault` or `not_configured`). A few seconds later, `select status_code, content from net._http_response order by created desc limit 1;` shows `200` and a body of counts only, such as `{"autoSubmitted":0,"opened":0,"closingSoon":0,"sent":0,...}`. A `401` means the two secrets differ; `503` means `CRON_SECRET` is missing from the deployment. After 15 minutes, `select status, return_message from cron.job_run_details order by start_time desc limit 3;` shows the scheduled runs succeeding. `select jobname, schedule, active from cron.job;` lists exactly two jobs, `learn-assignment-reminders` and `learn-rate-limit-sweep`, both active.

**Turning the sweep off:** `select cron.unschedule('learn-rate-limit-sweep');`. The limiter still removes up to 20 expired rows on every call, as before #248; `select count(*) from private.shared_rate_limits;` shows how far the table has grown. `select private.schedule_rate_limit_sweep();` brings it back.

**Turning the reminders off:** `select cron.unschedule('learn-assignment-reminders');`. Nothing is lost: what is owed stays owed, and whatever is still due when the job comes back goes out then (an "is open" email only within a day of opening, so a long pause does not send stale ones).

**A class's time zone.** The due time in each email, on the student home and on the assignment pages is in the class's time zone, which is `America/Denver` for a new class. An instructor changes it in the app: Classes → the class → **Time zone** (#242). The database refuses a name Postgres does not know, whoever writes it.

**What was sent.** `select o.kind, o.status, o.tries, o.last_error, o.sent_at from private.email_outbox o order by o.created_at desc limit 20;` lists recent reminders with their state. The table holds no addresses and the route logs none; `last_error` is only an error kind such as `rate_limited`. A reminder is given up after five failed tries (`status = 'failed'`).

### 7.9 Error reporting through Sentry (#235)

The app reports browser and server errors to Sentry on the free tier. It is off until the DSN is set: without it nothing loads, nothing is sent, and the build is the same as before. Every event is scrubbed in the app before it leaves (`src/lib/observability/scrub.ts`): no user, no cookies, no request body or query string, and emails, names, invite tokens (`/c/…`), join codes, session ids in `/live/…` and `/play/…`, answer keys and rationales are removed or masked. There is no session replay, and the browser sends no traces; the server samples 10% of requests for tracing.

1. **[ ] Create the Sentry project.** sentry.io → sign up on the free (Developer) plan → Create Project → platform **Next.js**, alert frequency "Alert me on every new issue", name `learn-web`. Skip the wizard's install step; the code is already in the repo.
2. **[ ] Harden the project's own privacy settings** (a second layer behind the in-app scrub). Project → Settings → Security & Privacy: turn on **Data Scrubber**, **Use Default Scrubbers** and **Prevent Storing of IP Addresses**. Organization → Settings → Security & Privacy: the same two scrubber switches.
3. **[ ] Copy the DSN.** Project → Settings → Client Keys (DSN). It looks like `https://<key>@o<n>.ingest.us.sentry.io/<id>`. A DSN can only send events, so it is safe in the browser.
4. **[ ] Make an upload token.** Organization → Settings → Developer Settings → Organization Tokens → Create. It is shown once. It uploads source maps at build so stack traces are readable; the build deletes the maps from the output afterwards, so they are never served. Note the organization slug and the project slug from the Sentry URL (`sentry.io/organizations/<org>/projects/<project>/`).
5. **[ ] Add five variables to Vercel**, each in **Production** and **Preview**: Vercel → project → Settings → Environment Variables.

   | Variable                 | Value                 | Notes                                                   |
   | ------------------------ | --------------------- | ------------------------------------------------------- |
   | `SENTRY_DSN`             | the DSN from step 3   | server errors                                           |
   | `NEXT_PUBLIC_SENTRY_DSN` | the same DSN          | browser errors; baked in at build                       |
   | `SENTRY_AUTH_TOKEN`      | the token from step 4 | build only; mark it **Sensitive**; never `NEXT_PUBLIC_` |
   | `SENTRY_ORG`             | the organization slug | build only                                              |
   | `SENTRY_PROJECT`         | `learn-web`           | build only                                              |

   Then redeploy (variables apply to a new build only). Without the last three, errors are still reported and the build skips the source map upload with a warning. Production and previews file under separate environments (`production`, `preview`) in the one project, from Vercel's `VERCEL_ENV`; keep Vercel's "Automatically expose System Environment Variables" on so the browser gets `NEXT_PUBLIC_VERCEL_ENV`.

6. **[ ] Check it on a preview.** Open `<preview URL>/gallery/sentry-check` (it is closed on production, like the rest of the gallery). Press **Throw in the browser**, then open **Throw on the server**. Within a minute both errors appear in Sentry → Issues, filtered to the `preview` environment. Open each one: the message must read `fake student [email] opened /c/[redacted] with code [code]`, and the event must have no User, no Cookies and no request body. If the fake email, token or code appears in full, stop and report it; the scrub did not run.
7. **[ ] Set the alert rules.** Project → Alerts → Create Alert → Issues: "A new issue is created" → email the owner, environment `production`. Add a second: "The issue is seen more than 10 times in 1 hour" → email. The free tier allows 5,000 errors a month; Settings → Spike Protection stays on so one bad deploy cannot use them up.

**Turning it off:** delete `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` from the scope and redeploy.

### 7.10 Nightly encrypted backup, and restoring it (#236)

`.github/workflows/db-backup.yml` dumps the production database every night at 09:17 UTC (and whenever it is run by hand), encrypts it with [age](https://age-encryption.org) to the owner's public key, and keeps it as a workflow artifact for 14 days. It runs `scripts/db-backup.sh`. It is the fallback whichever plan production is on (owner decision 2026-09-24): Pro keeps its own 7 daily backups, but they cannot be downloaded or restored anywhere else.

**This repo is public, so anyone with a GitHub account can download these artifacts.** That is why encryption is not optional. The workflow holds only the public key, so it can encrypt but never decrypt. Every dump goes straight from `pg_dump` into `age` through a pipe, so no plaintext file is ever written, logged, cached or uploaded. The workflow runs only on its schedule or by hand, never for a pull request, and has read-only permissions.

**What a backup holds.** Five files, each an age ciphertext:

| File               | What it is                                                                                                                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roles.sql.age`    | custom database roles (`supabase db dump --role-only`); today there are none, only settings on the platform's roles                                                                                                                                                                                              |
| `schema.sql.age`   | the full definition of `public`, `private` and `live`: tables, functions, RLS policies, grants, and the extensions in use (`supabase db dump`)                                                                                                                                                                   |
| `data.sql.age`     | every row of `public`, `private` and `live`, **and of `auth`: `auth.users`, identities and sessions** (`supabase db dump --data-only`). Without `auth.users` a restored class has rosters, attempts and scores that belong to nobody, and no student can sign in, so a backup without it is useless for a cohort |
| `history.sql.age`  | the rows of `supabase_migrations`, so `supabase db push` knows which migrations the restored project already has; its tables are made only if missing and emptied first (`scripts/db-backup-history.sql`), so it loads whether or not the new project has them                                                   |
| `platform.sql.age` | our triggers on `auth.users` (a new account gets a profile, an invite is accepted) and our policies on `realtime.messages` (the private live channel). `supabase db dump` leaves those schemas out; `scripts/db-backup-platform.sql` says why they matter                                                        |

**What it does not hold:** the Vault secrets and the pg_cron job from §7.8 (Vault is encrypted with the old project's own key, and a restored copy should not start calling production by itself), Storage files (the app stores none), and project settings that live outside the database: auth settings and email templates, the JWT signing key, Realtime's "Allow public access" switch. A restore therefore ends with those steps done by hand, listed in step 5.

1. **[ ] Make the key pair, once, on your own machine.** Install age (`winget install FiloSottile.age`, `brew install age` or `sudo apt install age`), then:

   ```sh
   age-keygen -o learn-backup-key.txt
   # Public key: age1...   <- this line is the recipient; it is safe to share
   ```

   The file holds the **private** key (`AGE-SECRET-KEY-1...`). Put it in your password manager as a secure note, keep one offline copy (a USB stick or a printout in a drawer), and delete the file. Never put it in the repo, in a GitHub secret, in Vercel or in a chat. Lose it and every backup is unreadable; leak it and anyone can read the last 14 days of backups, so make a new pair, replace the secret in step 2 and delete the old artifacts (`gh run list -w db-backup.yml`, then `gh run delete <id>` for each).

2. **[ ] Set the two repository secrets** (GitHub → repo → Settings → Secrets and variables → Actions, or `gh secret set`, which reads the value from the prompt and keeps it out of shell history):
   - `BACKUP_AGE_RECIPIENT` = the `age1...` public key. The script refuses a value that is not a public key, and refuses outright a value that is a secret key.
   - `PROD_DB_URL` = the production project's **session pooler** string: Supabase → the production project → Connect → Session pooler. It looks like `postgresql://postgres.<prod-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres`, with the database password from §7.3 step 1 (percent-encode any `@ : / ? #` in it). The session pooler because GitHub's runners have IPv4 only and the direct connection is IPv6 only; not the transaction pooler (port 6543), which `pg_dump` cannot use.

   Until both are set the workflow does nothing and stays green, with a notice saying so. Leave `PROD_DB_URL` unset until the §7.3 production project exists; pointing it at the preview project for a drill is fine.

3. **[ ] Run it by hand once.** `gh workflow run db-backup.yml`, then `gh run watch`. The run's summary lists an artifact named `db-backup-<UTC time>` with the five `.age` files. If a step fails, nothing is uploaded: a failed dump never leaves a partial backup behind.

4. **Download and decrypt.** In a folder outside the repo, because the plaintext holds every student's email address and answers:

   ```sh
   gh run list -w db-backup.yml --limit 5                      # pick a run id
   gh run view <run-id>                                        # names its artifact, db-backup-<UTC time>
   gh run download <run-id> -n db-backup-<UTC time> -D backup  # backup/*.sql.age
   umask 077                                                   # decrypted files readable by you alone
   mkdir -p plain
   for part in roles schema data history platform; do
     age --decrypt --identity /path/to/learn-backup-key.txt \
       --output "plain/$part.sql" "backup/$part.sql.age"
   done
   ```

   Delete `plain/` as soon as the restore is done.

5. **Restore into a fresh project, step by step.**
   1. Create the project as in §7.3 steps 1–2. **Do not** run `db push` or load `seed.sql`: the backup brings the schema, the data and the migration history itself.
   2. Copy its session pooler string (as in step 2 above) into `NEW_DB_URL` without echoing it, for example `read -rs NEW_DB_URL`.
   3. From the repo root, with a `psql` of version 17 or later, in one transaction so a failure leaves the project empty rather than half restored:

      ```sh
      psql --single-transaction --variable ON_ERROR_STOP=1 \
        --file plain/roles.sql \
        --file scripts/db-restore-prepare.sql \
        --file plain/schema.sql \
        --command 'SET session_replication_role = replica' \
        --file plain/data.sql \
        --file plain/history.sql \
        --file plain/platform.sql \
        --dbname "$NEW_DB_URL"
      ```

      `scripts/db-restore-prepare.sql` must come before `schema.sql`. A fresh project grants ALL on every new table and function in `public` to `anon` and `authenticated` by default, and `pg_dump` does not undo that; without the prepare step the restored tables come back open to `anon` (TRUNCATE included, which RLS does not stop) and every function closed to `anon` in #233 is open again. `session_replication_role = replica` keeps triggers from firing while rows load, so loading `auth.users` does not make a second profile for every user. The command is Supabase's own restore order from its CLI backup guide; `data.sql` sets the same thing itself and ends with `RESET ALL`, which is fine because what follows it loads no rows through a trigger. If `history.sql` is the only file that fails (a newer CLI can change the history table), leave it out, re-run the rest, and record the history with `supabase migration repair --status applied <version>` for each row in §7.2.

   4. Check it: `pnpm exec supabase link --project-ref <new-ref>` then `pnpm exec supabase migration list`, where every row in §7.2 shows on both sides. Sign in as an instructor and open a class.
   5. Finish what the database does not carry: §7.3 step 6 (Vercel's variables, including the new project's `SUPABASE_JWT_SIGNING_KEY`) and step 8 (Realtime public access off); §7.3 step 5's auth settings, if they were changed from the defaults; §7.8 steps 3–4, only if this project is becoming production (`schema.sql` already creates pg_cron and pg_net, so step 3 changes nothing and is safe to repeat; step 4's Vault secrets and job are not in the backup). Everyone signs in again, because the new project signs tokens with a new key; accounts and passwords come through intact.

**Tested end to end on 2026-09-24** against the local stack, twice. Each time the source was the migrated, seeded database with pg_cron, pg_net, a Vault secret and a scheduled job; it was dumped by `scripts/db-backup.sh`, decrypted, and restored as in step 5 into the stack reset with no migrations and no seed, which is what a fresh project is. Both times the row counts matched in all 62 tables of `public`, `private`, `live`, `auth`, `storage`, `cron` and `supabase_migrations`, with the one expected difference that `cron.job` was empty, and a `pg_dump --schema-only` of the whole restored database, every schema included, matched the source line for line. The first run added a fictional cohort (three students with auth accounts, a class, an assignment, three scored attempts): the restored students and demo account were all there, the demo account signed in through Auth, and `migration list` showed all 30 migrations on both sides. The second run used the seed alone, because the pgTAP suite assumes it, and the full suite (`pnpm test:db`, 32 files, 923 tests) passed against the restored database. Without `db-restore-prepare.sql`, the schema comparison showed 99 grants wider than the source; with it, none. A third run restored into an empty project that already had `supabase_migrations` with a stale row in it, and ended with exactly the source's history.

**Not yet tested against a hosted project.** On a hosted project `postgres` is not a superuser, which the local stack cannot reproduce, so the first real drill is the demo step: restore a nightly backup into a scratch project (a free one, deleted afterwards), and write the result here. Check there, after the restore, that `select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' and privilege_type = 'TRUNCATE';` is `0`: the prepare step did its job.

To repeat the drill locally: dump the running stack with `PROD_DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres`, `BACKUP_AGE_RECIPIENT` and `OUT_DIR` set; reset the stack to an empty project with `supabase --workdir <copy> db reset`, where the copy is `supabase/config.toml` and `supabase/templates` with `[db.migrations]` and `[db.seed]` set to `enabled = false`; restore as in step 5; then `pnpm test:db`. Finish with a plain `pnpm exec supabase db reset` to put the stack back.

**Free-tier pausing.** A free project pauses after about a week without activity. The nightly dump connects to the database every day, which should count as activity and keep production awake. Do not rely on it alone: Supabase decides what counts, it could change, and a backup that stops (a secret expired, a failed run nobody opened) stops keeping the project awake at the same moment. GitHub also turns off scheduled workflows in a repo with no commits for 60 days. Check the Actions tab weekly, or subscribe to failed runs (GitHub → your profile → Settings → Notifications → Actions → "Send notifications for failed workflows only"), and decide the plan at go-live as planned.

### 7.11 Go-live: every owner step in order, and `pnpm golive:check` (#237)

Before the first real student gets an invite, do these in order, then run the check until every automated line passes. Each step is written out in full in the section it names; this is the order, not the detail.

1. **[ ] Production project** (§7.3 steps 1–4): create `learn-prod`, copy its ref, `db push` every migration in §7.2, load `seed.sql`. Check the replay locally first if §7.2 changed since the last one (§7.5). §7.4 is only for catching up a project that already exists.
2. **[ ] Instructor accounts** (§7.3 step 5 and §7.6): Add user, then `select private.make_instructor('<address>');` for each instructor. **Leave the demo account out of production**: do not set `DEMO_ACCOUNT_EMAIL` or `DEMO_ACCOUNT_PASSWORD` in Vercel Production (delete them if they are there), so "Use the demo account" is not on the sign-in page students see. The check fails while either is set.
3. **[ ] Vercel Production variables** (§7.3 step 6): the Supabase URL, publishable key, `SUPABASE_SECRET_KEY` and `SUPABASE_JWT_SIGNING_KEY`, all from the production project. Redeploy and check the ref (§7.3 step 7).
4. **[ ] Realtime private-only** (§7.3 step 8): "Allow public access" off. Never add `live` or `private` to the Data API's exposed schemas. Then #178 can merge and be applied, which drops the last open policy on `live.session_public_state`.
5. **[ ] Email** (§7.7 steps 1–7): Resend domain and key, custom SMTP, the magic-link template, the Auth email rate limit, the Auth URL configuration, `RESEND_API_KEY` and `EMAIL_FROM` in Vercel, and a real link to your own inbox.
6. **[ ] Scheduled jobs** (§7.8 steps 1–5): `CRON_SECRET` in Vercel, pg_cron and pg_net, the two Vault secrets, `cron.schedule` and `private.schedule_rate_limit_sweep()`, then `private.call_reminder_route()` answers `queued`.
7. **[ ] Sentry** (§7.9 steps 1–7): the project, its privacy settings, the five variables, a test error from a preview, the alert rules.
8. **[ ] Backups** (§7.10 steps 1–3): the age key pair, `BACKUP_AGE_RECIPIENT` and `PROD_DB_URL`, one run by hand. Do a restore drill into a scratch project before students depend on it.
9. **[ ] Choose the plan** (owner decision, 2026-09-24): Pro, or free plus the nightly dump.
10. **[ ] Run the check** (below) against production. Every automated line passes; work through each MANUAL line by hand.

**Running it.** From the repo root, on a machine signed in to the Supabase CLI (`pnpm exec supabase login`; the queries go through it) and, for the backup line, to GitHub (`gh auth login`):

```sh
read -rs GOLIVE_HEALTH_TOKEN && export GOLIVE_HEALTH_TOKEN   # paste production's CRON_SECRET; not echoed
pnpm golive:check -- --url https://learn-tanner-nielsons-projects.vercel.app \
  --project-ref <prod-ref> --publishable-key <the sb_publishable_ key>
```

On PowerShell, `$env:GOLIVE_HEALTH_TOKEN = Read-Host -MaskInput` does the same. The token is optional: without it the check reads the public health answer, which says only whether the site is ready, not which variable is missing. The publishable key is public (it ships to every browser) and is only used to ask PostgREST which schemas it exposes; without it that line is MANUAL. To try it against the local stack: `pnpm golive:check -- --url http://127.0.0.1:3000 --local` with `pnpm dev` running. There it reports the expected failures: no Resend, no Sentry, the demo account on, no pg_cron (so neither scheduled job), #178 not applied, and no backup.

It prints one line per check, `PASS`, `FAIL` or `MANUAL`, each with what it found and the step above that fixes it, and exits non-zero when any line fails. It is read-only: single `select` statements through `supabase db query`, GETs to the site and to PostgREST, and `gh run list`. It never prints a key, a password or the token. What it checks:

| Line                        | How                                                                                                                                                                    | Fixed by          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| migrations                  | `supabase_migrations.schema_migrations` equals the files in `supabase/migrations`                                                                                      | §7.3 step 3, §7.4 |
| exposed schemas             | PostgREST's refusal of an unknown schema lists the exposed ones; only `public` and `graphql_public` pass (docs/audits/S10-security.md)                                 | §7.3 step 8       |
| `live.session_public_state` | anon has no select, or no `using (true)` policy applies to anon (#178)                                                                                                 | §7.3 step 8, #178 |
| site                        | `/api/health` answers, reaches Supabase, and names the `--project-ref` project                                                                                         | §7.3 steps 6–7    |
| variables                   | `/api/health` reports every variable in `src/lib/golive/envVars.ts` as set: the four Supabase ones, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET` and both Sentry DSNs | the step it names |
| demo account                | neither `DEMO_ACCOUNT_*` variable is set                                                                                                                               | step 2 above      |
| reminder job                | pg_cron is on, `learn-assignment-reminders` is scheduled and active, and both Vault names exist                                                                        | §7.8 steps 3–4    |
| rate-limit sweep            | pg_cron is on and exactly one `learn-rate-limit-sweep` job is scheduled and active (#248)                                                                              | §7.8 steps 3–4    |
| backup                      | the newest successful `db-backup.yml` run is under 26 hours old and uploaded a `db-backup-*` artifact (MANUAL when `gh` cannot answer)                                 | §7.10 steps 2–3   |
| manual                      | Realtime public access, SMTP and the template, Auth URLs, and Sentry's test event and alerts                                                                           | the step it names |

**What `/api/health` shows, and to whom.** Anyone gets `{supabase, project, version, ready}`, cached for 5 seconds (`Cache-Control: public, max-age=5, s-maxage=5`). `ready` is true only when Supabase answers, every required variable is set and the demo account is off; it deliberately does not say which variable is missing, since a list of absent secrets tells a stranger which feature is unprotected. With `Authorization: Bearer <CRON_SECRET>` the answer adds one boolean per variable and `demoAccount`, never cached; a wrong token gets `401` and nothing else. No value is ever returned, which a route test proves on the response bytes. The route has no rate limit of its own: it reads no table, the CDN absorbs repeats, and its one outbound call (Supabase's auth health) is made at most once every 5 seconds per server instance however often it is asked.

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
