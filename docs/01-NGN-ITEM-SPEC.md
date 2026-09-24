# NGN Item Specification

Source of truth for every question type the app supports: interaction, layout, scoring, and data shape.
Agents implementing an item type must read this file and the matching fixture before writing code.

Sources: NCSBN NGN item-type and scoring documentation; the ExamSoft NGN item-type index (`docs/reference/examsoft-ngn-item-types.pdf`).
Verify any scoring detail against NCSBN's current "scoring models" article before changing the engine.

## 1. Clinical Judgment Measurement Model (CJMM)

Case studies present six items, one per step, in this fixed order. Standalone items are tagged with the step they exercise.

| #   | Step                  | Typical item formats                                         |
| --- | --------------------- | ------------------------------------------------------------ |
| 1   | Recognize Cues        | Highlight Text/Table, SATA, Matrix MR                        |
| 2   | Analyze Cues          | Drop-Down Cloze/Rationale, Matrix MC, MRG                    |
| 3   | Prioritize Hypotheses | Drop-Down Rationale, Drag-and-Drop Rationale, Select N       |
| 4   | Generate Solutions    | SATA, Drop-Down Table, Matrix MC/MR                          |
| 5   | Take Action           | Drag-and-Drop Cloze, Matrix MC, Select N                     |
| 6   | Evaluate Outcomes     | Matrix MC (improved / no change / declined), Highlight, SATA |

## 2. Scoring models

All items produce an integer score in `[0, maxPoints]`. The engine is pure: `score(item, response) -> { points, maxPoints, breakdown[] }`.

| Model                 | Rule                                                                                                                                                                            | Used by                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **0/1**               | Each scorable element earns 1 if correct, else 0. Item score = sum.                                                                                                             | Multiple Choice, Matrix MC, Drop-Down Cloze, Drop-Down Table, Drag-and-Drop Cloze, Bowtie (5 elements), Ordered Response (whole-item 0/1) |
| **+/-**               | +1 per correct selection, -1 per incorrect selection, floored at 0. Max = number of correct options. Applied per row for grouped/table formats, then summed.                    | SATA, Select N, Multiple Response Grouping, Matrix MR, Highlight Text, Highlight Table                                                    |
| **Rationale (dyad)**  | One sentence, two targets. 1 point only if both are correct.                                                                                                                    | Drop-Down Rationale, Drag-and-Drop Rationale (2 blanks)                                                                                   |
| **Rationale (triad)** | One sentence, three targets sharing an anchor (usually the condition). 2 points max: anchor must be correct; each of the two supporting targets then earns 1. Anchor wrong = 0. | Drop-Down Rationale, Drag-and-Drop Rationale (3 blanks)                                                                                   |

Breakdown entries name the element, whether it was correct, and the delta, so the feedback UI can explain the score.

## 3. Item catalog

Fourteen renderable formats. Each has: `type` id, interaction summary, layout notes, scoring model, `answerKey` shape, `response` shape, and edge cases.

### 3.1 `multiple_choice` (traditional)

- Interaction: pick exactly one option (radio). Options 4–6.
- Scoring: 0/1, max 1.
- Key: `{ correctOptionId }`. Response: `{ optionId }`.
- Shuffle: options permuted.

### 3.2 `multiple_response` — Extended Multiple Response

- Variants: `sata` (select all that apply, 5–10 options, ≥1 correct) and `select_n` (must select exactly `n`; UI blocks the (n+1)th selection and shows "Select N").
- Scoring: +/-; max = count of correct options.
- Key: `{ correctOptionIds[] , n? }`. Response: `{ optionIds[] }`.
- Shuffle: options permuted (both variants; `n` unchanged).

### 3.3 `multiple_response_grouping` — Grouped Multiple Response

- Interaction: table; each row (e.g., a body system) has 2–4 option cells; select all that apply per row.
- Scoring: +/- per row, summed. Max = total correct cells.
- Key: `{ rows: [{ rowId, correctOptionIds[] }] }`. Response: `{ rows: [{ rowId, optionIds[] }] }`.
- Shuffle: rows permuted, and the option cells within each row permuted.

### 3.4 `matrix_multiple_choice`

- Interaction: rows × 2–3 columns; exactly one selection per row (e.g., Indicated / Contraindicated / Non-essential).
- Scoring: 0/1 per row; max = row count. Unanswered row = 0.
- Key: `{ rows: [{ rowId, correctColumnId }] }`. Response: `{ rows: [{ rowId, columnId }] }`.
- Shuffle: rows permuted; columns kept (they are a shared scale, such as improved / no change / declined).

### 3.5 `matrix_multiple_response`

- Interaction: rows × columns; any number of selections per row; at least one per row is typical.
- Scoring: +/- per row, summed.
- Key: `{ rows: [{ rowId, correctColumnIds[] }] }`. Response: `{ rows: [{ rowId, columnIds[] }] }`.
- Shuffle: rows permuted; columns kept.

### 3.6 `dropdown_cloze` — Drop-Down Cloze

- Interaction: prose with 1–3 inline `<select>` blanks, each with 3–5 choices.
- Scoring: 0/1 per blank.
- Key: `{ blanks: [{ blankId, correctChoiceId }] }`. Response: `{ blanks: [{ blankId, choiceId }] }`.
- Stem is stored as a token list: `[{ kind: "text", value }, { kind: "blank", blankId }]`.
- Shuffle: each blank's choices permuted; the prose and its blanks kept.

### 3.7 `dropdown_rationale` — Drop-Down Rationale

- Interaction: one sentence with 2 (dyad) or 3 (triad) blanks; "X is at risk for __ as evidenced by __".
- Scoring: rationale dyad/triad. `anchorBlankId` marks the anchor in triads.
- Key: `{ blanks: [...], anchorBlankId? }`. Response: same as cloze.
- Shuffle: each blank's choices permuted; the sentence and its blanks kept.

### 3.8 `dropdown_table` — Drop-Down Table

- Interaction: table where one column holds drop-downs per row.
- Scoring: 0/1 per row.
- Key: `{ rows: [{ rowId, correctChoiceId }] }`. Response: `{ rows: [{ rowId, choiceId }] }`.
- Shuffle: rows permuted, and each row's choices permuted; the column headings kept.

### 3.9 `highlight_text` — Enhanced Hot Spot

- Interaction: a passage split into author-defined selectable spans (phrases). Tap/click toggles a span. Non-selectable text is inert.
- Scoring: +/-; max = number of correct spans.
- Key: `{ correctSpanIds[] }`. Response: `{ spanIds[] }`.
- Content: `[{ kind: "text", value } | { kind: "span", spanId, value }]`.
- Shuffle: none. The passage is the answer.

### 3.10 `highlight_table`

- Same as highlight text, but spans live inside table cells (e.g., Assessment / Findings).
- Scoring: +/- (whole item, or per row if `scorePerRow: true`).
- Shuffle: none. The table is the answer.

### 3.11 `dragdrop_cloze` — Extended Drag and Drop (cloze)

- Interaction: word bank of 4–8 tokens; drag into 1–3 blanks in prose. Bank tokens are single-use unless `reusable: true`. Touch fallback: tap a token, then tap a blank.
- Scoring: 0/1 per blank.
- Key / Response: same shape as dropdown cloze with `tokenId`.
- Shuffle: word bank permuted; the prose and its blanks kept.

### 3.12 `dragdrop_rationale`

- Interaction: as 3.11 but sentence is a dyad/triad rationale.
- Scoring: rationale dyad/triad.
- Shuffle: word bank permuted; the sentence and its blanks kept.

### 3.13 `ordered_response` (traditional)

- Interaction: reorder 4–6 items (drag, or up/down buttons on touch).
- Scoring: 0/1 whole item (exact order). Optional `partial: "position"` variant gives 1 per correct position; default off for fidelity.
- Key: `{ orderedIds[] }`. Response: `{ orderedIds[] }`.
- Shuffle: none in the #209 sense (the order is the answer). Separately, the **starting order** is always scrambled (#219), because authors type the steps in their correct order and the authored order is usually the key:
  - For two or more steps, the order a candidate starts from is **never the key's order**, for any seed. A seeded scramble (`startingOrder` in `src/lib/ngn/startingOrder.ts`) that lands on the key is rotated one place; with two steps that is the one other order.
  - It reads the key, so it runs on the server: `toKeylessItem` lists the steps in their starting order before the item is sent, and the player starts from them as they arrive. The response bytes never list the steps in the key's order before the reveal. A browser that already holds the whole item (the gallery, an author's preview) computes the same order from the same seed.
  - Seed: the item id by default (the author's play page, the gallery). Where a student plays, the seed is `secretStartingOrderSeed(scopeId, itemId)` (`src/lib/supabase/startingOrderSeed.ts`): an HMAC-SHA256 under the server's secret key. The scramble is public and a student can see the session, attempt and item ids, so a seed built from those alone would let them replay the scramble, undo it and read off the authored order. The scope is the session in live sessions, both modes, so every phone in a room starts from the same order, and the attempt for take-home, whether or not the assignment shuffles, so a resume starts from the same order. The in-memory room (the gallery's fake live room) uses the unkeyed `startingOrderSeed`.
  - Scoring is unchanged: the response is the explicit id list, scored against the key, never against positions in `content`.

### 3.14 `bowtie`

- Interaction: three columns. Left: pick exactly 2 "Actions to Take" from 5. Center: pick exactly 1 "Potential Condition" from 4. Right: pick exactly 2 "Parameters to Monitor" from 5. Drag or tap-to-place.
- Scoring: 0/1 per slot, 5 slots, max 5. Order within a pair does not matter.
- Key: `{ actionIds[2], conditionId, parameterIds[2] }`. Response: same.
- Shuffle: each column's list (actions, conditions, parameters) permuted; the three columns stay in place.

## 4. Composite structures

### 4.1 Case study

```
CaseStudy {
  id, title, tags[], ehr: EhrRecord,
  items: [Item × 6]           // one per CJMM step, in order; item.cjmmStep must match index+1
}
EhrRecord {
  patientHeader: { name?, age, sex, setting, admissionDate? },   // fictional; never real PHI
  timePoints: [{ id, label }],                                    // ≥1; Trend items use several
  tabs: [{ id, kind: "history_physical" | "nurses_notes" | "vital_signs" | "lab_results" | "orders" | "mar" | "diagnostics" | "custom",
           title, blocks: [ RichTextBlock | TableBlock | VitalsBlock ], timePointId? }]
}
```

The EHR panel is shown beside (desktop) or above/tabbed (mobile) every item in the case. Items may reference `ehr.tabs[].id` to auto-open a tab.

### 4.2 Trend item

A standalone `Item` with an attached `EhrRecord` having ≥2 `timePoints`; the panel gets a time selector. Any format from section 3 may be used.

### 4.3 Standalone Bowtie

A `bowtie` item with an attached `EhrRecord` (single time point).

### 4.4 Item envelope (all formats)

```
Item {
  id, version, type, cjmmStep?: 1..6, tags[], difficulty?,
  stem: RichText,                      // the question prompt
  instructions?: string,               // e.g. "Select all that apply."
  ehr?: EhrRecord,                     // standalone items only
  content: <type-specific>,            // options, rows, tokens, spans...
  answerKey: <type-specific>,
  scoring: { model: "zero_one" | "plus_minus" | "rationale", maxPoints },
  rationale: { general: RichText, perElement?: Record<elementId, RichText> },
  meta: { author, createdAt, updatedAt, sourceNote? }
}
```

`content` never contains `answerKey`; the player receives `content` only until feedback mode so answer keys are never shipped to student clients during live sessions or take-home windows.

### 4.5 Shuffle (take-home attempts, #209)

Where a type's order carries no meaning, its lists are permuted per attempt so two students side by side cannot copy by position. Each type's "Shuffle" line in section 3 says what moves; `SHUFFLE_RULES` in `src/lib/ngn/shuffle.ts` is the same table in code, and its tests hold `shuffleItem` to it.

- Seed: `shuffleSeed(attemptId, itemId)`, so a reload or a resume shows the same order and each student sees a different one. The permutation is a seeded PRNG (cyrb128 + sfc32), never `Math.random`. Each list derives its own seed from the item's seed and the list's name.
- Applied on the server to the (keyless) item before it is sent; the browser never sees the seed or the author's order. Responses stay keyed by id, so scoring is unchanged.
- Never moved: anything whose position is the answer (ordered response, highlight text and table), the text around blanks, matrix columns (a shared scale), bowtie columns, and case-study step order.
- Fixed options: the schema has no "fixed" flag, so an option whose wording points at other options or at a position ("All of the above", "None of these", "Options A and C", "Choice 2") stays at the index the author gave it, and the rest move around it (`isFixedLabel`).
- Live sessions are not shuffled. The one exception to both of those rules is an ordered-response item's starting order, which is scrambled everywhere a candidate plays it (section 3.13, #219).

## 5. Player modes

| Mode       | Behavior                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `answer`   | Interactive, no key present, submit enabled when response is valid (Select N requires exactly N, Bowtie requires all 5 slots, etc.). |
| `review`   | Read-only replay of a response, no key (used mid-test for "flag and return").                                                        |
| `feedback` | Response + key + rationale; correct/incorrect marks per element; score breakdown with the rule explained in one sentence.            |

## 6. Validation rules (enforced by Zod at authoring and import)

- `sata`: 5–10 options, ≥1 correct (warn if all correct). `select_n`: n < option count, exactly n correct.
- Matrix: 2–8 rows, 2–4 columns. MC: exactly one correct per row.
- Cloze: 1–3 blanks; rationale: exactly 2 or 3 blanks, triad requires `anchorBlankId`.
- Highlight: ≥2 spans, ≥1 correct, ≤ 60% of spans correct (warning).
- Bowtie: 5 actions, 4 conditions, 5 parameters; keys sized 2/1/2.
- Every item: non-empty stem, `rationale.general` present (warning if missing, error for publish).
- Case study: exactly 6 items, steps 1..6 in order, EHR has ≥1 tab.
- Quality warnings (advice only, never block): every SATA option correct; a SATA option with no per-option rationale; more than 60% of highlight spans correct; a stem that neither asks a question nor says what to do; two options (or rows, columns, choices, words, steps, bowtie choices) in one list with the same text. `itemQualityWarnings` in `src/lib/ngn/quality.ts` returns each with a plain message and the path it points at.

> **Decision, 2026-09-19 (owner, #110):** a missing `rationale.general` blocks publishing, as this section says. A draft still saves without one. The publish action refuses it on the server (`checkPublishable`), the editor lists it under the problems to fix and keeps Publish unavailable, and a case study treats a step item without one as not yet published. Items published before this rule keep their status until they are next published; the bank's warning count and Has warnings filter find them. All sample fixtures and seed items carry one.

## 7. Fixtures

Every type ships with `fixtures/<type>.ts` containing: one canonical item, one edge-case item, and a table of `(response, expectedPoints, expectedBreakdown)` cases including: empty response, all correct, all wrong, over-selection (for +/-), anchor-wrong triad, unanswered rows. Fixtures drive unit tests, the gallery, and Playwright screenshots.
