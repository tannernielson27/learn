# ADR 0003 — Scoring runs server-side; clients never hold the key before reveal

- **Status:** Accepted, 2026-09-10
- **Deciders:** product owner, Claude (TPM)

## Context

Every NGN item has an answer key and a scoring rule (0/1, plus-minus, dyad/triad rationale). If the key reaches a student's browser before the instructor reveals it, anyone with dev tools can read it, and the live-session results mean nothing.

## Decision

- The scoring engine in `src/lib/ngn/scoring` is pure and runs anywhere, but in production it is only called on the server (route handler or Postgres/Edge function) that reads the key and writes `responses.score`.
- Items have separate `content` and `answer_key` columns. RLS stops students from selecting `answer_key`. The key and rationale reach students only through a host-only reveal RPC.
- Client-side scoring is allowed only in the gallery and fixture modes, which have no real students. `ItemPlayer` already strips the key outside feedback mode.
- **Amended 2026-09-13 (#88):** authoring pages are a third exception. An author (instructor or admin) may read their own org's keys, since the editors cannot work without them, and **Preview case study** in the builder scores in the author's browser. These routes sit behind `requireAuthor` and org RLS, so no student reaches them. The keyless play route (`/author/items/[id]/play`) and every student-facing payload keep the rule above, and must not reuse the builder's preview data.
- **Amended 2026-09-20 (#146):** the gallery exception now names its boundary instead of trusting one. `/gallery/**` is **disabled on the production deployment and open everywhere else**. `src/app/gallery/layout.tsx` is the single layout every gallery route passes through; it calls `galleryIsAvailable()` (`src/lib/gallery/availability.ts`) and answers `notFound()` when `VERCEL_ENV` is `production`, because a 404 does not advertise that the surface exists. The signal is `VERCEL_ENV`, not `NODE_ENV` — Next sets `NODE_ENV` to `production` for preview builds too, so reading it would close the gallery on previews and in CI. Those stay open deliberately: previews, CI and localhost are where the gallery is actually used — sprint demos, the Playwright screenshot and axe run, a reviewer opening a route on a phone — and none of them has a real student on it, so gating them would force the screenshot run to authenticate for no security gain. `src/app/gallery/gate.test.ts` fails if a route that answers on a `/gallery` URL is added outside that layout, if a gallery route handler is added (layouts do not wrap those), or if the layout stops calling the gate.

## Consequences

- Submissions need a network round trip before a score exists. That is acceptable for live sessions, where scores appear on reveal anyway.
- Offline practice mode, if ever built, has to be an explicit exception with its own ADR.
- When student-facing payload builders arrive (Phase 3), each ships with a test asserting it never includes `answerKey`.
