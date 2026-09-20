# Architecture & Stack

## 1. Stack (recommended)

Versions reflect what is installed on the dev machine on 2026-09-10: Node 22.21, pnpm 11.9, git 2.52, gh 2.95, Vercel CLI 50.4. The Supabase CLI is a devDependency since Sprint 4 (`pnpm exec supabase`).

| Layer             | Choice                                                                    | Why                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | **Next.js (App Router) + React + TypeScript**                             | Best Vercel fit, server components for authoring/dashboard pages, client components for the player. Mobile-browser first is a layout concern, not a framework one.            |
| Styling           | **Tailwind CSS + CSS custom properties for tokens**                       | Fast iteration; tokens keep the "professional exam" look consistent. Use shadcn/ui primitives only as unstyled building blocks (dialog, popover, select); restyle everything. |
| Motion            | **Motion** (`motion` package, the Framer Motion successor)                | Layout animations for reveal/feedback, `useReducedMotion` support, compositor-only properties.                                                                                |
| Drag & drop       | **dnd-kit**                                                               | Touch + pointer + keyboard sensors, accessible announcements; needed for DnD cloze, ordered response, bowtie.                                                                 |
| Schemas           | **Zod**                                                                   | One schema per item type drives validation, editor forms, import/export, and TS types.                                                                                        |
| Forms (authoring) | **React Hook Form + Zod resolver**                                        | Complex nested editors without re-render churn.                                                                                                                               |
| Client state      | **Zustand** (player + live session)                                       | Small, testable stores; no provider boilerplate.                                                                                                                              |
| Server state      | **TanStack Query**                                                        | Caching for banks, sessions, reports.                                                                                                                                         |
| Backend           | **Supabase** (Postgres, Auth, Realtime, Storage, Edge Functions)          | Free tier covers demos; RLS gives per-org security; Realtime covers live sessions at classroom scale.                                                                         |
| Hosting           | **Vercel** (Hobby)                                                        | Preview deploy per PR is the demo mechanism.                                                                                                                                  |
| Tests             | **Vitest** + Testing Library, **Playwright** (e2e + screenshots), **axe** | Coverage gate 80% overall, 90% on `src/lib/ngn`.                                                                                                                              |
| Tooling           | pnpm, ESLint, Prettier, GitHub Actions, Husky/lint-staged                 |                                                                                                                                                                               |
| Observability     | Sentry (free), Vercel Analytics                                           | Phase 4.                                                                                                                                                                      |

Alternatives considered: SvelteKit (great DX, smaller ecosystem for dnd + auth), Remix (fine, but Vercel + Next is the path of least resistance), Convex or PartyKit for realtime (keep as swap-in behind the transport interface if Supabase Realtime limits bite).

## 2. Repository shape

Single Next.js app with strict module boundaries (enforced with ESLint `import/no-restricted-paths`). Extract to packages later only if a second app appears.

```
learn/
├─ docs/                       # these planning docs, ADRs, demo scripts
├─ src/
│  ├─ app/                     # routes (App Router)
│  │  ├─ (marketing)/          # landing
│  │  ├─ (auth)/               # sign in
│  │  ├─ gallery/              # internal component gallery (Phase 1 demos)
│  │  ├─ play/                 # student player: /play/[sessionCode], /play/assignment/[id]
│  │  ├─ author/               # item bank, editors, case study builder
│  │  ├─ live/                 # instructor console: /live/[sessionId]
│  │  └─ api/                  # route handlers (session join, submit, reports)
│  ├─ lib/
│  │  ├─ ngn/                  # PURE: schemas/, scoring/, fixtures/, validate.ts — no React, no Supabase
│  │  ├─ live/                 # LiveSessionTransport interface + supabase adapter + in-memory adapter (tests)
│  │  ├─ supabase/             # clients (server/browser), typed queries, generated types
│  │  └─ utils/
│  ├─ components/
│  │  ├─ ui/                   # restyled primitives (Button, Select, Dialog, Tabs…)
│  │  ├─ question/             # QuestionShell, per-type renderers: <type>/<Type>Item.tsx
│  │  ├─ ehr/                  # EhrPanel, tab renderers, time selector
│  │  ├─ case-study/           # CaseStudyPlayer, StepIndicator
│  │  ├─ authoring/            # per-type editors: <type>/<Type>Editor.tsx, shared field components
│  │  └─ live/                 # lobby, results visualizations, instructor controls
│  ├─ features/                # use-case orchestration (join session, submit answer, assign set)
│  └─ styles/                  # tokens.css, typography.css, global.css
├─ supabase/                   # config, migrations/, seed.sql, functions/
├─ e2e/                        # Playwright specs + screenshot baselines
└─ .github/workflows/          # ci.yml, preview-e2e.yml
```

**Rule:** `src/lib/ngn` has zero imports from React, Next, or Supabase. Every item type is a folder triplet:
`lib/ngn/schemas/<type>.ts` + `components/question/<type>/` + `components/authoring/<type>/` + `lib/ngn/fixtures/<type>.ts`.
A registry (`lib/ngn/registry.ts`) maps `type -> { schema, score, Renderer, Editor, fixtures }` so the player, editor, gallery and tests are all data-driven.

## 3. Data model (Supabase / Postgres)

Phase 2 tables (Phase 3 additions marked):

```
orgs(id, name, created_at)
profiles(id = auth.users.id, org_id, role: instructor|student|admin, display_name)
classes(id, org_id, name, join_code)                      -- Phase 4 rosters
class_members(class_id, profile_id, role)

item_banks(id, org_id, name, folder_path)
items(id, bank_id, type, cjmm_step, tags text[], version, status draft|published,
      content jsonb, answer_key jsonb, rationale jsonb, scoring jsonb, created_by, updated_at)
item_versions(item_id, version, snapshot jsonb, created_at)  -- append-only history
case_studies(id, bank_id, title, ehr jsonb, tags text[], status, created_by)
case_study_items(case_study_id, position 1..6, item_id)

-- Phase 3
sessions(id, org_id, host_id, code char(6) unique, mode instructor_paced|student_paced,
         status lobby|running|paused|ended, current_position, set jsonb, started_at, ended_at)
participants(id, session_id, profile_id null, display_name, joined_at, last_seen)
responses(id, session_id null, assignment_id null, participant_id, item_id, response jsonb,
          score int, max_points int, breakdown jsonb, submitted_at)
assignments(id, class_id, set jsonb, opens_at, closes_at, attempts_allowed, settings jsonb)
assignment_attempts(id, assignment_id, profile_id, state jsonb, started_at, submitted_at)
```

Design notes:

- `content` and `answer_key` are separate columns so a view/RPC can return items **without keys** to student clients. RLS: students can never `select` `answer_key`; scoring happens in a Postgres function or Edge Function that reads the key server-side and writes `responses.score`.
- Item JSON is validated by the same Zod schemas at the API boundary (Edge Function / route handler) before insert.
- `sessions.set` snapshots the items at session start so edits during a live session do not change what students see.
- Everything is org-scoped for RLS from day one, even when there is one org.
- **As built in Sprint 4 (#65):** `items`, `case_studies` and `case_study_items` carry `org_id`, held equal to their bank's by composite foreign keys, so policies filter on a column instead of a join. RLS helpers live in a `private` schema the Data API does not expose. `item_versions` is append-only. `items.content` holds the item without `answerKey`, `rationale`, `scoring` and the fields stored as columns; `src/lib/supabase/itemRows.ts` splits and re-validates. By owner decision (2026-09-12), every new account joins the single org as an instructor; revisit before Sprint 7.

## 4. Live session design

```
interface LiveSessionTransport {
  join(code, identity): Promise<SessionSnapshot>
  onSessionState(cb): Unsubscribe        // status, current item, timer, reveal flag
  onPresence(cb): Unsubscribe            // participant list
  submit(itemId, response): Promise<SubmitAck>
  // host only
  advance(), reveal(), pause(), end()
  onAggregate(cb): Unsubscribe           // per-item aggregate results for the dashboard
}
```

**The submit seam** (`src/lib/ngn/submit.ts`, #56). One shape for "a candidate answered an item", shared by the authoring play route, the gallery and any live-session transport:

```ts
type KeylessItem = Omit<Item, "answerKey" | "rationale" | "scoring">
type KeylessCaseStudy = Omit<CaseStudy, "items"> & { items: KeylessItem[] }
toKeylessItem(item): KeylessItem                       // the only payload a student's browser gets
toKeylessCaseStudy(caseStudy): KeylessCaseStudy        // ...and the only case-study one (#46)
parseSubmission(body, itemType): ParsedSubmission      // validate an incoming answer
scoreSubmission(item, response): ScoreReveal           // the scoring entry point; server-side
type Reveal = Omit<ScoreReveal, "score">                 // the key, rationale and scoring
type SubmitHandler = (response) => Promise<ScoreReveal>  // what ItemPlayer calls
type SubmitHandlerFor<T> = (item: T) => SubmitHandler    // what CaseStudyPlayer calls per step
scoreInProcess(item): SubmitHandler                    // gallery and authoring preview only
```

`ItemPlayer` and `CaseStudyPlayer` hold no scoring code: they take a handler and render the `ScoreResult` they are given, including its per-row `groups`. A transport supplies the handler; it never lives inside `lib/ngn`.

**Keys arrive per step, at reveal** (#46). `CaseStudyPlayer` is generic in its items: the gallery and the authoring preview pass a parsed `CaseStudy` with `scoreInProcess`, while a session or assignment passes a `KeylessCaseStudy`, so no step's key is in the page at all. A step's key reaches the browser only in the `ScoreReveal` its own submit returns; the player keeps that reveal with the step and hands it back as `initialReveal` when the student walks into the step again, which is the only way a keyless step can mark an answer.

- **Supabase adapter:** session state and aggregates via Postgres changes on `sessions` and a `session_item_aggregates` table maintained by a trigger; presence via Realtime Presence; submissions via a route handler that calls `parseSubmission` then `scoreSubmission`, upserts the response and updates the aggregate.
- **In-memory adapter:** drives tests and the gallery's "fake room" demo; also makes Sprint 7 demos possible before the DB adapter is complete.
- Free-tier budget: 200 concurrent Realtime connections and 2M messages/month. A class of 60 with 20 items is well inside that; aggregates are pushed as one message per item change, not one per submission.
- Student clients never receive `answer_key` until the host sets `reveal` for that item; reveal payload comes from a host-only RPC that returns the key + rationale.

## 5. Environments & deployment

| Env       | Where                                                                    | Data                                                                    |
| --------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Local     | `pnpm dev` + Supabase local (Docker, ports 553xx) or the preview project | seed.sql                                                                |
| Preview   | Vercel preview per PR                                                    | hosted `learn` project, ref `vauokqoyvewtzubqajgh` (ADR 0006)           |
| Demo/Prod | Vercel production from `main`                                            | its own hosted project, replayed from `supabase/migrations/` (ADR 0006) |

`/api/health` reports the project ref it reached, so the two can be told apart from the outside. Which project each environment uses, and how to stand one up, is in [05-VERSION-CONTROL-AND-DEPLOY.md §7](05-VERSION-CONTROL-AND-DEPLOY.md).

CI on every PR: typecheck, lint, unit + coverage, Playwright smoke against the preview URL, axe on gallery pages, screenshot diff on item types.

## 6. Security baseline

- RLS on every table; students scoped to their participant/attempt rows; instructors scoped to their org.
- Answer keys never leave the server before reveal/close.
- Join codes are rate-limited (route handler + Postgres function) and expire when the session ends.
- No PHI: EHR content is fictional by policy; a lint rule and authoring copy remind creators.
- Secrets only in Vercel/Supabase env; `.env.example` committed.

## 7. ADRs to write in Sprint 0

1. Single app vs monorepo (see roadmap Q8).
2. Realtime transport: Supabase Realtime first, swap interface defined.
3. Server-side scoring only; client scoring allowed only in gallery/fixtures mode.
4. Item JSON contract v1 frozen at end of Sprint 3; changes require a version bump + migration.
