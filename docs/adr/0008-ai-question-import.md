# ADR 0008 — AI question import: Claude reads documents into reviewable learn.v1 drafts

- **Status:** Proposed, 2026-10-01 (Sprint 12 kickoff). "Cost and accuracy" holds #333's measurements.
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
- **A monthly cap per org**, in estimated cost (starting at $10; see Cost and accuracy), reserved in Postgres _before_ each call and settled after it with the actual tokens, so concurrent chunks cannot overspend. A usage ledger records tokens and estimated cost per call. `AI_IMPORT_ENABLED=false` turns the feature off everywhere. The Anthropic console spend limit is the backstop.

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

## Cost and accuracy (measured by #333, 2026-10-01)

`scripts/ai-import-spike.ts` ran a draft segment pass and a draft extract pass (4 questions per call, 3 calls at once) on the owner's five samples. Sonnet 5.5 is $2 per million input tokens and $10 per million output tokens.

| Sample                         | Path         | Found | Importable | Cost   | Per importable item | Slowest call |
| ------------------------------ | ------------ | ----- | ---------- | ------ | ------------------- | ------------ |
| Ectopic (case study + bowtie)  | .docx → HTML | 7     | 7          | $0.259 | $0.024              | 36 s         |
| Preeclampsia (case + bowtie)   | .docx → HTML | 7     | 7          | $0.253 | $0.027              | 39 s         |
| Tuberculosis (case + trend)    | .docx → HTML | 7     | 7          | $0.242 | $0.024              | 30 s         |
| Malnutrition (course activity) | .docx → HTML | 15    | 6          | $0.144 | $0.011              | 41 s         |
| Malnutrition, same content     | PDF, native  | 15    | 6          | $0.238 | $0.021              | 45 s         |

All five cost $1.14. **About $0.25 for a Maryland-style case study plus its standalone item**, about $0.02–0.03 per item with a chart, and about $0.01 per short multiple choice item.

What the numbers change:

- **The cap is kept in money, not pages.** A .docx has no reliable page count, and cost per page varies widely (a chart-heavy step is about 3 times the price of a short question). The ledger already settles real tokens, so the cap is an estimated cost per org per month, **starting at $10** (about 40 case studies or 400–900 standalone items). Before each call, a reservation estimated from the input size is taken, and it is settled to the real cost afterwards. The upload page shows it as "about N documents left this month". The batch limits (5 files, 100 PDF pages, 150 items) stay.
- **Extract 2 questions per call, not 4.** Four chart-heavy steps took 30–45 s in one call. Two keep each call near 20 s, well inside a Hobby function, and #345 still runs 3 at once.
- **Warm the document cache before fanning out.** The extract calls read almost nothing from the cache: the structured-output schema differs from the segment pass's, so their prefix differs, and the first three ran at once, so all three wrote it. The first extract call of a file should run alone. Input is about a quarter of the cost, so this saves roughly 15–20%.
- **Make the "possible source error" notes shorter.** The segment pass spent about 600–700 output tokens per question, mostly on notes, many of them trivial (a missing question mark). Keep them to clinical or factual inconsistencies, at most two per question. That roughly halves the segment cost and cuts noise for the reviewer.

Accuracy, read by hand against the documents:

- **Types:** 26 of 28 importable questions were typed as an author would. Two were wrong: Ectopic step 6 says "Scoring Rule: Rationale" and was typed `dropdown_cloze`, not `dropdown_rationale`. The Malnutrition .docx bowtie was typed `multiple_response_grouping`, with confidence 0.55, because its bowtie shape is a drawing the .docx path drops. The PDF path typed it as a bowtie. Rules for #343: a stated rationale scoring rule or an "as evidenced by" sentence means the rationale family, and confidence below 0.7 is shown to the reviewer.
- **Keys:** every marked key matched the source, including `*` glued and spaced, `*` in matrix cells, "Answer: ✅ B." lines, and the Preeclampsia highlight item. In that item, each highlighted cell became a selectable phrase, and the 4 keys came from the document's separate "Key" table. **No key was invented.** Every unmarked layout (two matrices and a bowtie) came back with no key.
- **Not NGN:** all 9 open prompts, the BMI calculation, the matching exercise and the one-line recall question were marked not importable, with reasons. The instructor's "optional" add-on was recognized as an instructor note.
- **Text** was kept word for word, including the typos it flagged.
- **Structure:** the three case studies grouped as 6 steps plus a standalone, and growing charts were detected. **A risk:** on the Malnutrition PDF, the model labeled parts "Case Study Question 1 of 6", text that is not in the document. #342 must check that each question's opening text appears in the source (the .docx HTML, or a PDF's text layer), and #344 must take step numbers only from the source.
- **PDF and .docx** of the same content found the same 15 questions. The PDF path reads layout (the bowtie drawing) and costs about 65% more.

## Consequences

- **Owner documents never enter the repo.** They may be copyrighted or licensed, and the Malnutrition one includes a third-party form. The local spike and eval read them from `.ai-import-samples/`, which is gitignored. CI's golden corpus is fictional content written for the repo.
- **Accuracy is measured, not assumed.** `pnpm eval:ai-import` runs the corpus against the real API by hand and reports type accuracy, key accuracy and field accuracy. Any prompt change runs it before merge.
- **Images do not import.** LeaRN has no image support, so a question that relies on an image is flagged.
- **A new external dependency at runtime.** If Anthropic is down, AI import fails with a clear message and everything else works. Failed chunks retry with backoff and can be resumed.
- **Two migrations**, each pushed by the owner at merge: the import tables, bucket and cap (`20261001000000_ai_import`), and the import function (`20261001010000_ai_import_commit`). `20261001020000_*` is reserved in case reveal-by-step needs SQL.
