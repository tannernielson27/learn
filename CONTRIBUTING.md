# Contributing to LeaRN

LeaRN is a live learning platform for the Next Generation NCLEX. This file takes you from a fresh clone to a PR that passes review. It applies to people and to agents alike. When this file and a doc under `docs/` disagree, the doc wins; open a PR to fix this file.

## 1. Prerequisites

| Tool                    | Version                                                         | Why                                              |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Node.js                 | 22.x (`package.json#engines` is `>=22 <23`; `.nvmrc` says 22)   | Runs Next and the scripts                        |
| pnpm                    | 11.9.0 (`package.json#packageManager`; `corepack enable` works) | The only package manager; the lockfile is pnpm's |
| Docker (Docker Desktop) | any current version                                             | Runs the local Supabase stack                    |
| GitHub CLI (`gh`)       | optional                                                        | Issues, PRs and CI runs from the terminal        |

The Supabase CLI is a dev dependency, so you run it as `pnpm exec supabase`. Do not install another copy globally.

## 2. Run it locally

```sh
pnpm install
cp .env.example .env.local
```

`.env.example` lists every variable with a comment saying what it does and where the local value comes from. `.env.local` is git-ignored; never commit it.

Start the local Supabase stack. It needs Docker running, and its ports are 553xx so it can sit beside another Supabase project:

```sh
pnpm exec supabase start
```

On a low-memory machine, leave out the services the app does not need:

```sh
pnpm exec supabase start -x studio,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta
```

That list also drops `realtime`, so live sessions will not update on their own. Leave `realtime` out of the `-x` list (as CI's auth e2e job does) when you work on live sessions.

Then fill `.env.local` from the running stack:

```sh
pnpm exec supabase status -o env
```

- `NEXT_PUBLIC_SUPABASE_URL` is `http://127.0.0.1:55321`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `SUPABASE_JWT_SIGNING_KEY` come from that output; the comments in `.env.example` say which line is which.
- The first start applies every migration in `supabase/migrations/` and loads `supabase/seed.sql` (sample content) and `supabase/seed-demo.sql` (a local-only demo instructor; its sign-in is in the `.env.example` comments). `pnpm exec supabase db reset` replays them from scratch.
- Magic-link and app email land in the stack's Mailpit inbox at `http://127.0.0.1:55324`.

Start the app:

```sh
pnpm dev
```

Open `http://localhost:3000`. The component gallery is at `/gallery`: every item type rendered from its canonical fixture. It shows answer keys by design, so it is open locally and on previews and closed on production (`src/lib/gallery/availability.ts`).

Stop the stack when you are done, since it holds a lot of memory:

```sh
pnpm exec supabase stop
```

## 3. Scripts

| Script                              | What it does                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Next dev server                                                                           |
| `pnpm typecheck`                    | `next typegen` then `tsc --noEmit`                                                        |
| `pnpm lint`                         | ESLint, zero warnings allowed                                                             |
| `pnpm format` / `pnpm format:check` | Prettier write / check                                                                    |
| `pnpm test`, `pnpm test:watch`      | Vitest unit and component tests                                                           |
| `pnpm test:coverage`                | Vitest with the coverage gates                                                            |
| `pnpm check`                        | typecheck, lint, tests with coverage, build, and the gallery-closed check                 |
| `pnpm test:db`                      | pgTAP database tests against the local stack (`supabase test db` plus a plan-count check) |
| `pnpm db:types`                     | Regenerates `src/lib/supabase/database.types.ts` from the local stack                     |
| `pnpm e2e`                          | Playwright (`pnpm e2e:install` once to fetch Chromium)                                    |
| `pnpm load:live`                    | Load test for live sessions; see `docs/load-testing.md`                                   |

`pnpm check` does not run `pnpm format:check`, but CI does, so run both before you push. A pre-commit hook runs Prettier and ESLint on staged files, and a commit-msg hook runs commitlint.

## 4. The workflow

1. **An issue per story.** Every change starts from a GitHub issue in the template in `docs/03-AGENT-WORKFLOW.md` §3: Story, Scope (In and Out), Spec references, Acceptance criteria, Demo step, and the Definition of Done, which you do not edit.
2. **A branch per story**, from an up-to-date `main`, named `<type>/<issue>-<slug>`, where type is `feat`, `fix`, `chore`, `docs`, `refactor` or `test`. For example `feat/12-bowtie-item`. Nobody pushes to `main`.
3. **Tests first.** Write the failing test, watch it fail, then write the code. Coverage must stay at 90% of lines, functions and statements (85% of branches) in `src/lib/ngn/**` and `src/lib/live/**`, and 80% (75% of branches) overall; the gates are in `vitest.config.mts`. Fixtures drive the unit tests, the gallery and the screenshots.
4. **Run the checks locally**: `pnpm check` and `pnpm format:check`, plus `pnpm test:db` if you touched `supabase/`.
5. **Commits and PR titles are Conventional Commits**: `<type>(<scope>): <imperative summary>`, header at most 72 characters. Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`. For example `feat(ngn): add plus-minus scoring with zero floor`.
6. **Open one PR** with the template filled in: the story, "Closes #N", what changed, the demo step, and screenshots at 375px and 1280px for UI changes. Attach the reviews the story's labels call for (`code-reviewer` always; `security-reviewer` for `gate:security`; `database-reviewer` for `gate:db`).
7. **Squash merge.** The PR title becomes the one commit on `main`, and `main` deploys to production. The branch is deleted after merge.

### What CI runs

Six checks appear on each PR:

| Check                         | Where                       | What it does                                                                                          | Typical time |
| ----------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------ |
| `check`                       | `.github/workflows/ci.yml`  | install, typecheck, lint, format check, tests with coverage, build, gallery closed on production      | about 5 min  |
| `db`                          | `.github/workflows/ci.yml`  | replays every migration on a throwaway stack, runs `pnpm test:db`, fails if the generated types drift | about 2 min  |
| `auth e2e`                    | `.github/workflows/ci.yml`  | the signed-in Playwright specs against a local stack and a production build, then a load smoke        | about 20 min |
| `gallery screenshots and axe` | `.github/workflows/e2e.yml` | screenshots and axe on the gallery against the Vercel preview; compares with committed baselines      | about 2 min  |
| `Vercel`                      | Vercel                      | the preview deployment                                                                                | a few min    |
| `Vercel Preview Comments`     | Vercel                      | the preview's comment integration                                                                     | instant      |

The whole run takes about 20 minutes, dominated by `auth e2e`. A new e2e spec goes on the auth e2e job's spec list in `ci.yml`. Gallery baselines come only from CI's Linux runner; after a deliberate visual change, regenerate them with the `e2e baselines` workflow (`docs/05-VERSION-CONTROL-AND-DEPLOY.md` §5).

## 5. The rules that bite

- **Answer keys never reach a student early.** Scoring runs on the server; the browser gets keyless items until reveal (`docs/adr/0003-server-side-scoring.md`). If your change touches what a student receives, prove it on the response bytes, with a control where the key IS present, using the helpers in `e2e/bytes.ts`. Component tests alone have passed while keys leaked.
- **The core is pure.** `src/lib/ngn/**` (and `src/lib/live/**`) import nothing from React, Next or Supabase. Every item type is a triplet: `src/lib/ngn/schemas/<type>.ts`, `src/lib/ngn/fixtures/<type>.ts` and `src/components/question/<type>/`, registered in `src/lib/ngn/registry.ts`. Read `docs/01-NGN-ITEM-SPEC.md` before touching any item type.
- **Migrations are named in merge order and must replay.** A new file in `supabase/migrations/` sorts after every existing one; when two PRs race, the later one renumbers. Each migration must apply cleanly to a fresh project and stay compatible with the app already deployed. Nothing is changed by hand in a dashboard. Add pgTAP tests under `supabase/tests/database/`, and commit the regenerated `database.types.ts`.
- **The security guard stays green.** `supabase/tests/database/security_guard.test.sql` checks that RLS is on every table, every security-definer function sets `search_path = ''`, and `anon` can execute nothing. A student, or an account with no role, must never author or read content tables. If you add a table, definer function, route or Server Action, add its row to `docs/audits/S10-security.md`.
- **Do not edit `eslint.config.mjs`.** A hook blocks it. If a rule needs to change, say so in an issue.
- **No secrets and no real patient data.** Never commit `.env.local`, keys, or production project refs. EHR content is fictional.
- **Design.** Follow `docs/04-DESIGN-DIRECTION.md`: no emoji in product UI, motion only on transform and opacity and respecting reduced motion, 375px first.

## 6. Where to read next

- `docs/00-ROADMAP.md`: the plan and the sprints
- `docs/01-NGN-ITEM-SPEC.md`: item types, data shapes and scoring
- `docs/02-ARCHITECTURE.md`: the stack and the structure
- `docs/03-AGENT-WORKFLOW.md`: how stories are built, with agents
- `docs/04-DESIGN-DIRECTION.md`: the visual system
- `docs/05-VERSION-CONTROL-AND-DEPLOY.md`: branches, PRs, CI, deploys and the database
- `docs/adr/`: the architecture decisions
- `docs/sprints/BUILDER-BRIEF.md`: the brief every builder agent follows
- `docs/audits/S10-security.md`: the security audit, one row per table, function and route
- `docs/open-issues.md`: the current sprint and the owner's decisions

Questions about priorities or product go to the owner, on the issue.
