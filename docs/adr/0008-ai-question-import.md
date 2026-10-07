# ADR 0008 — AI question import: Claude reads documents into reviewable learn.v1 drafts

- **Status:** Proposed, 2026-10-01 (Sprint 12 kickoff). Numbers in "Cost" are estimates until #333 measures them.
- **Deciders:** product owner (S12 kickoff decisions), Claude (planner)

## Context

Instructors already have questions, in Word files and PDFs, in their own layouts. The roadmap parked "AI item generation from uploaded documents" for v2 and designed `learn.v1` (docs/transfer-format.md) as its contract. Sprint 12 builds it as an **import**: the AI copies questions that exist; it does not write new ones.

The owner's sample documents (kept out of the repo, see Consequences) show what "a document" means in practice:

- **Maryland NGN Test Bank case studies** (Ectopic pregnancy, Preeclampsia, Tuberculosis): six steps plus a standalone bowtie or trend. Each step repeats the chart, which grows from step to step. Keys are marked with `*` in options and table cells, with yellow Word highlighting for a highlight item, and each step states its scoring rule ("Scoring Rule: +/-").
- **A course activity** (Malnutrition, as both .docx and .pdf): two patients, open discussion prompts, a matching exercise, unanswered matrices and bowtie, "Answer: ✅ B." lines, instructor notes, embedded images (an X-ray, a copyrighted screening form) and some errors in the source.

The constraints: a Vercel Hobby function per request, the 1 MB Server Action body limit, Supabase free tier, answer keys never reaching a student before reveal (ADR 0003), and `src/lib/ngn` staying pure.

## Decision

### Model and money

- **Claude Sonnet 5.5** through `@anthropic-ai/sdk`, on the owner's key (`ANTHROPIC_API_KEY`, server only, never `NEXT_PUBLIC_`). Live calls, not the Batch API, so the review screen fills in minutes.
- **A monthly cap per org**, in pages read, reserved in Postgres _before_ each call and settled after it with the actual tokens, so concurrent chunks cannot overspend. A usage ledger records tokens and estimated cost per call. `AI_IMPORT_ENABLED=false` turns the feature off everywhere. The Anthropic console spend limit is the backstop.

### Pipeline

1. **Upload** straight from the browser to a private Supabase Storage bucket on a signed upload URL, so no file passes through a Server Action. A batch is up to 5 files, 100 pages and 150 items, with a rights checkbox ("I may use this content in my course, and it contains no real patient information").
2. **Prepare** each file on the server: the type is checked by its bytes, not its name. PDFs are split into chunks of about 8 pages with one page of overlap and sent to Claude as PDF documents (text and page images, so scans, colour and layout survive). `.docx` becomes markdown that keeps tables, bold, highlight and cell shading as markup, since keys hide there. `.md` and `.txt` are sent as they are.
3. **The browser drives the work one chunk per request** (2–3 at a time), as the JSON import does one file per request. Each request stays well inside a Hobby function's limit, the page shows real progress, and a closed tab resumes from the chunks still pending.
4. **Pass 1, segment:** per chunk, Claude returns each question's source span, likely type, confidence, case-study grouping, and any answer-key or rationale sections printed elsewhere ("answers at the back"), linked by question number. Overlaps and cross-chunk questions are merged by source position.
5. **Pass 2, extract:** per question (or a case study's step), Claude fills a **draft**: a loose per-type shape of plain strings with marked blanks, highlightable phrases and keys. It never writes ids, tokens or offsets.
6. **Normalize, validate, repair:** `src/lib/ngn/draft/<type>.ts` turns a draft into a `learn.v1` item deterministically (pure, fixture-tested, inside the 90% gate). The result must pass `itemSchema`, then `itemQualityWarnings` runs. On failure Claude gets one repair attempt with the error paths; after that the entry is kept as `needs_fix`.
7. **Stage:** every question becomes a staged entry: `ready`, `needs_answer` (no key in the source), `needs_fix`, or `not_importable` (open prompts, matching, recall, anything without an NGN type), with the reason and the source excerpt.
8. **Review:** the author sees each entry rendered by the real question components, its warnings, and its source side by side. They can change its type (one re-extract), edit it with the existing editors (`EditorShell`'s `onSaveDraft` points at the staged entry), or drop it.
9. **Import:** one call writes every accepted entry and case study as new drafts in one transaction, all or nothing, into a chosen folder (default: a new folder "AI import – <date>"). The stored files are then deleted. Batches abandoned in review are deleted after 7 days.

### Extract only

The model copies; it never invents. A missing key is `needs_answer` and can only be filled in by the author. A missing rationale is the existing publish blocker. A stated scoring rule is kept when the spec allows it for the type, and flagged when it does not. Errors in the source are kept word for word, with a "possible source error" note for the reviewer. Instructor notes, author blocks, objectives, references, QR codes and links are not question content.

### Case studies and the growing chart

A case study keeps one `EhrRecord`, but its time points, tabs and blocks gain an optional **`fromStep`** (1–6). A pure `recordAtStep(record, step)` returns what a student may see at a step. The player, live sessions, assignments and practice serve that view **filtered on the server**, so a later step's chart never reaches a phone early. The builder gets a "from step" picker. The importer reconstructs `fromStep` by comparing each step's chart with the one before. A record with no `fromStep` behaves exactly as today.

### Safety

- Document text is data. The model has no tools that act on anything. Its output is JSON that must pass the Zod schemas, and it is rendered through the existing components, never as HTML.
- Staged entries hold answer keys. Only authors in the bank's org can read them (RLS), and students never reach author routes. Rows go in docs/audits/S10-security.md.
- Document text and staged entries are scrubbed from Sentry events like answer keys (`src/lib/observability/scrub.ts`).
- The rate limiter (`public.hit_rate_limit`) bounds batch starts and parse calls per user.

## Cost (estimate; replaced by the spike's measurements)

Sonnet 5.5 is $2 per million input tokens and $10 per million output tokens. Output dominates: about $0.01–0.025 per standalone item and $0.12–0.20 per case study, so a 40-question PDF costs about $0.70–1.00. The cap starts at 300 pages per org per month.

## Consequences

- **Owner documents never enter the repo.** They may be copyrighted or licensed, and the Malnutrition one includes a third-party form. The local spike and eval read them from `.ai-import-samples/`, which is gitignored. CI's golden corpus is fictional content written for the repo.
- **Accuracy is measured, not assumed.** `pnpm eval:ai-import` runs the corpus against the real API by hand and reports type accuracy, key accuracy and field accuracy. Any prompt change runs it before merge.
- **Images do not import.** LeaRN has no image support, so a question that relies on an image is flagged.
- **A new external dependency at runtime.** If Anthropic is down, AI import fails with a clear message and everything else works. Failed chunks retry with backoff and can be resumed.
- **Two migrations**, each pushed by the owner at merge: the import tables, bucket and cap (`20261001000000_ai_import`), and the import function (`20261001010000_ai_import_commit`). `20261001020000_*` is reserved in case reveal-by-step needs SQL.
