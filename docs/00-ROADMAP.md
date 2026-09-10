# LeaRN — Product Roadmap & Sprint Plan

> Working name: **LeaRN** (folder name; rename freely). Status: planning, 2026-09-10.
> Companion docs: `01-NGN-ITEM-SPEC.md`, `02-ARCHITECTURE.md`, `03-AGENT-WORKFLOW.md`, `04-DESIGN-DIRECTION.md`, `05-VERSION-CONTROL-AND-DEPLOY.md`.

## 1. Vision

A Socrative-style live learning platform built specifically for the Next Generation NCLEX (NGN).
Instructors author exam-faithful clinical judgment items, run them live in class with instant feedback,
and assign multi-day take-home practice. Students practice on the exact item formats and layouts they
will see on test day, on any phone or laptop browser.

**One-line pitch:** "Socrative, but every question looks and scores exactly like the NCLEX."

## 2. Users & jobs to be done

| Persona                                                       | Primary jobs                                                                                                                                            | Notes                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Instructor / Creator** (faculty, NCLEX tutor, prep company) | Build NGN items and case studies quickly; run a live session in class; assign take-home sets; see who is struggling and on which clinical-judgment step | Pays / owns content. Authoring must be fast and forgiving.                  |
| **Student** (pre-licensure RN candidate)                      | Join a live session in seconds; practice items that feel like the real exam; get rationales; track weak areas                                           | Mostly on phones in class, laptops at home. Zero-friction join is critical. |
| **Org admin** (later)                                         | Manage instructors, classes, rosters, item banks                                                                                                        | Phase 4+.                                                                   |

## 3. Product principles (use these to settle design arguments)

1. **Exam fidelity first.** Layout, interaction, and scoring match NCSBN NGN conventions. Familiarity is a feature.
2. **Professional, calm, fast.** No emoji, no confetti, no gamified noise. Motion only to clarify state changes.
3. **Mobile-browser native.** Every item type must be fully usable with a thumb on a 375px screen (drag-and-drop included).
4. **Component-first.** Every item type is a self-contained renderer + editor + scorer + fixtures. New features compose these.
5. **Demoable every sprint.** Each sprint ends with a deployed URL and a 5-minute demo script.
6. **Pure core.** Schemas and scoring live in framework-free TypeScript with high test coverage. UI and backend are replaceable.

## 4. Scope

### In scope (v1)

- All NGN item formats (see `01-NGN-ITEM-SPEC.md`) plus traditional multiple choice and ordered response.
- Case studies (six-item Clinical Judgment Measurement Model flow) with an EHR-style record panel; standalone Bowtie and Trend items.
- Authoring UI for every item type with live preview and JSON import/export.
- Live sessions: join by code, instructor-paced and student-paced, live results, reveal answers and rationales.
- Take-home assignments with open/close windows, autosave and resume, results and export.
- Accounts (instructors required; students by join code for live, account for take-home), classes/rosters, basic analytics by CJMM step.
- Deployed on Vercel + Supabase free tiers; GitHub for source control and CI.

### Out of scope (v1) — explicitly deferred

- AI-assisted item generation from documents (v2; the JSON item contract is designed so it can plug in).
- Native mobile apps.
- Computerized adaptive testing / ability estimation. (Percent-correct and per-step analytics only.)
- Billing and multi-tenant org hierarchy beyond a simple `org -> class` model.
- LMS integrations (LTI), SSO.

## 5. Phases and sprints

Sprint length: **1 week** (assumes one human + Claude Code agents; move to 2 weeks if that proves too tight).
Every sprint ends with a **Demo checkpoint**: a URL on Vercel, a demo script, and a short written retro.

### Phase 0 — Foundation (Sprint 0, ~3 days)

Goal: an empty but production-shaped app, deployed, with the core schema and scoring engine tested.

- Repo on GitHub (`learn`), `main` protected, PR template, CODEOWNERS, CI (typecheck, lint, unit, build). Full branching and deploy rules in `05-VERSION-CONTROL-AND-DEPLOY.md`.
- Vercel project connected to the GitHub repo: preview deploy on every PR, production deploy automatically on merge to `main`.
- Next.js + TypeScript + Tailwind scaffold, design tokens, base typography, light/dark themes.
- `/gallery` route: an internal component gallery used for every demo from here on.
- `src/lib/ngn/`: Zod schemas for all item types + scoring engine (0/1, +/-, dyad/triad) with fixtures. TDD, >90% coverage.
- Collaborator onboarded: clone, `pnpm install`, `pnpm dev`, first PR merged through the flow.

**Demo 0:** open the deployed URL, show the tokens page and gallery shell; show the test suite green with scoring fixtures.

### Phase 1 — Question experience (Sprints 1–3)

Goal: every NGN item type is beautiful, fast, and correct on phone and desktop. No backend yet; items load from static fixtures.

**Sprint 1 — Question shell + selection-based items**

- `QuestionShell`: stem, instructions, progress, submit, three modes (`answer`, `review`, `feedback`).
- Item types: Multiple Choice, Extended Multiple Response (SATA, Select N), Multiple Response Grouping, Matrix Multiple Choice, Matrix Multiple Response, Drop-Down Cloze, Drop-Down Rationale, Drop-Down Table.
- Keyboard and screen-reader support for all of the above.
- Playwright screenshot tests at 375 / 768 / 1280 for each item.

**Demo 1:** play through eight item types in the gallery on a phone and a laptop; submit and see score + correct answers.

**Sprint 2 — Pointer-heavy items**

- Highlight Text, Highlight Table (token-level selection, touch friendly).
- Drag-and-Drop Cloze, Drag-and-Drop Rationale, Ordered Response, with tap-to-place fallback on touch.
- Bowtie.
- Motion pass: selection, submit, reveal transitions per `04-DESIGN-DIRECTION.md`.

**Demo 2:** all 14 item types playable; drag-and-drop works with a thumb.

**Sprint 3 — Case study + polish**

- `CaseStudyPlayer`: EHR panel (tabs: History & Physical, Nurses' Notes, Vital Signs, Lab Results, Orders, MAR, Diagnostics) + six-step CJMM flow with step indicator.
- Trend item (EHR panel with multiple time points).
- Feedback mode: per-item rationale, per-option rationale, score breakdown that explains the scoring rule.
- Review mode: navigate answered items, flag for review.
- Accessibility audit, reduced-motion support, performance budget check.
- Sample content for demos only: ~10 original standalone items + 1 original case study, labeled "Sample" in the UI (write originals; do not copy NCSBN or vendor items). The platform is the product, not a content bank.

**Demo 3:** complete a full six-item case study end to end on a phone, then review it with rationales.

### Phase 2 — Authoring (Sprints 4–6)

Goal: an instructor can build any item type in minutes without reading docs.

**Sprint 4 — Backend + authoring shell**

- Supabase: auth (magic link + Google), tables for orgs, users, item banks, items, case studies, with RLS. Migrations in repo.
- Authoring shell: item bank list, create item, choose type, split-pane editor with the _same renderer_ as the player for live preview.
- Editors for the Sprint 1 item types. Validation messages come from the Zod schemas.

**Demo 4:** sign in, create a SATA and a Matrix item, preview them live, play them from the bank.

**Sprint 5 — Remaining editors + case study builder**

- Editors for highlight, drag-and-drop, bowtie, ordered response.
- Case study builder: EHR tab editor (rich text + simple tables), six-step wizard, per-step item editor, Trend time points.
- Scoring preview: "this item is worth N points, scored with +/-".
- JSON import/export of items and case studies (this is also the v2 AI-authoring contract).

**Demo 5:** build a complete case study from scratch in under 10 minutes.

**Sprint 6 — Bank management + polish**

- Folders, tags (CJMM step, client-needs category, topic), search, duplicate, archive, item versioning.
- Bulk import from JSON, quality warnings (no rationale, single correct answer on SATA, etc.).
- Authoring UX polish; read-only authoring on phone is acceptable.

**Demo 6:** organize a 50-item bank, find items by tag, fix warnings.

### Phase 3 — Live sessions & assignments (Sprints 7–9)

Goal: the Socrative moment. A room full of phones answering the same case study, results on the projector.

**Sprint 7 — Session core**

- Session model, six-character join code, QR code, student join with display name (no account).
- Lobby with presence; instructor-paced mode (instructor advances items); real-time submission.
- Transport behind a `LiveSessionTransport` interface (Supabase Realtime first).

**Demo 7:** three phones join a room from a QR code and answer a live SATA; the instructor screen updates in real time.

**Sprint 8 — Instructor dashboard**

- Per-item live results visualizations designed per item type (distribution for SATA, heat map for matrix and highlight, common wrong pairs for rationale items).
- Reveal answer + rationale to the room; timer; pause; skip; end session.
- Student-paced mode (whole set open, students move freely) with live progress board.
- Session report: per-student, per-item, per-CJMM step; CSV export.

**Demo 8:** run a full case study live with a class-sized simulated crowd (load script).

**Sprint 9 — Take-home assignments**

- Assign an item set or case study to a class with open/close window and attempt limits.
- Autosave, resume, integrity basics (shuffle options where valid, one attempt).
- Student results page with rationales after close; instructor report.
- Reminder email at open and 24h before close.

**Demo 9:** assign a set Monday, answer it Tuesday on a phone, review results Wednesday.

### Phase 4 — Product completion (Sprints 10–12; likely 10–11 given single-cohort scope)

- Accounts & roles: instructor and student; one class roster for the owner's cohort; invite link. (Org admin and multi-org are v2.)
- Student home: history, weak CJMM steps, practice mode against instructor-shared banks.
- Landing page, onboarding, empty states, error states, email templates.
- Hardening: security review of RLS and session endpoints, rate limiting, observability (Sentry), backups, load test.
- Docs: instructor guide, item-authoring guide, contributor guide.

**Demo 12:** an outside instructor onboards cold and runs a class without help.

### v2 (parked)

- AI item generation from uploaded documents (produces the same JSON contract as the editor).
- Adaptive practice, spaced repetition, LMS/LTI, billing, mobile apps.

## 6. Milestone summary

| Milestone              | Sprint | Demo                                      | Risk it retires                         |
| ---------------------- | ------ | ----------------------------------------- | --------------------------------------- |
| M0 Foundation          | 0      | Deployed shell, scoring engine tested     | Stack and CI unknowns                   |
| M1 Item types complete | 1–3    | All 14 types + case study player on phone | UX quality, touch DnD, item correctness |
| M2 Authoring           | 4–6    | Build a case study in 10 min              | Editor complexity, data model           |
| M3 Live                | 7–9    | Live class + take-home                    | Realtime scale on free tier             |
| M4 Product             | 10–12  | Cold onboarding                           | Auth, roles, polish                     |

## 7. Top risks and mitigations

| Risk                                                                      | Mitigation                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Touch drag-and-drop and highlight feel bad on phones                      | Prototype in Sprint 2 first; always ship a tap-to-select fallback; test on real devices each sprint |
| Scoring edge cases misreported (rationale triads, +/- floors)             | Pure scoring engine with fixture tests derived from NCSBN examples; scoring rule shown in feedback  |
| Supabase Realtime free-tier limits (concurrent connections, message rate) | Batch submissions, aggregate on server, transport interface so PartyKit/Ably can be swapped         |
| Authoring UI becomes a maze                                               | Same renderer for preview; per-type editor components; JSON escape hatch                            |
| Content copyright                                                         | Author original seed items; keep NCSBN sample items out of the repo                                 |
| Solo builder bandwidth                                                    | Agents fan out per item type; strict Definition of Done; weekly demo forces cut decisions           |

## 8. Decisions (answered 2026-09-10)

| #   | Question          | Decision                                                                               | Consequence                                                                                                                                                                                                     |
| --- | ----------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Student identity  | Live = join code + display name, no account. Take-home = student account (magic link). | Anonymous `participants` rows for live; `profiles` only needed from Sprint 9.                                                                                                                                   |
| 2   | Traditional items | Include multiple choice and ordered response alongside NGN formats.                    | 14 renderable formats stay in scope.                                                                                                                                                                            |
| 3   | Look and feel     | Exam-faithful layout, our own polished identity.                                       | Follow `04-DESIGN-DIRECTION.md`; do not clone Pearson VUE chrome.                                                                                                                                               |
| 4   | First users       | The product owner's own class / cohort.                                                | One org, one instructor in Phase 4. Org admin, invites, multi-org are v2. Phase 4 shrinks to Sprints 10–11.                                                                                                     |
| 5   | Seed content      | Author a small set of originals with agents, **for demos only**.                       | The platform is the product, not a content library. Ship ~10 sample items + 1 sample case study, clearly labeled "Sample", and make authoring + JSON import first-class so instructors bring their own content. |
| 6   | Sprint length     | 1 week.                                                                                | 12 sprints as planned; Phase 4 may finish early.                                                                                                                                                                |
| 7   | Name              | Keep "LeaRN" as working name.                                                          | GitHub repo `learn`, package name `learn`.                                                                                                                                                                      |
| 8   | Repo shape        | Single Next.js app with enforced module boundaries.                                    | No monorepo; `src/lib/ngn` is the pure core.                                                                                                                                                                    |

**Product framing clarified:** LeaRN is a study _platform_, not a question bank. Knowledge bases already exist. The value is exam-faithful rendering, fast authoring, and live/take-home delivery of the instructor's own content. Any built-in content is a sample to show the tooling.
