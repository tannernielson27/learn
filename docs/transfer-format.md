# learn.v1: moving items and case studies as JSON

LeaRN exports content as JSON in one versioned envelope, and reads the same envelope internally (see Import). It is also the contract for
generating content with tools outside LeaRN.

## Envelope

```json
{ "format": "learn.v1", "items": [/* 1 to 50 items */] }
```

or

```json
{ "format": "learn.v1", "caseStudy": {/* one case study */} }
```

An envelope holds either `items` or `caseStudy`, never both. Anything else is refused.

- **Items** are in the shape of `itemSchema` (docs/01-NGN-ITEM-SPEC.md §4.4), including `answerKey`, `rationale` and `scoring`. A standalone item may carry an `ehr` record (§4.2, §4.3).
- **Item tags** (`tags`) hold the NCLEX client needs categories and free topic tags; the CJMM step stays in `cjmmStep`. On import, and whenever an item is saved, tags are trimmed with whitespace closed up, a client needs category is spelled the one fixed way (`src/lib/ngn/tags.ts`, for example `"Physiological Adaptation"`), a topic is lower-cased, and repeats are dropped. An item may carry at most 20 tags of at most 50 characters each; more refuses the import (`Item 1: "tags" is not valid.`). A case study's own `tags` are kept as written and are not yet filtered by; its six step items' tags follow the item rules.
- **A case study** is in the shape of `caseStudySchema` (§4.1): `id`, `title`, `tags`, `ehr`, and exactly six `items` in clinical judgment order, each with `cjmmStep` equal to its position.
- **A case study's chart may grow with the case** (§4.1, #334). Both fields are optional and additive, so the format stays `learn.v1` and an export written before them imports unchanged:
  - `fromStep` (a whole number 1 to 6) on an entry of `ehr.timePoints` or on a block of a tab: the step it first appears at. Absent means step 1. At least one time point must be there from step 1.
  - `stepAccess` on a tab: exactly six of `"hidden"`, `"locked"` or `"open"`, one per step, first step first. Absent means open at every step. Any other length refuses the import (`Case study: "ehr.tabs.3.stepAccess" is not valid.`).
  - Export writes both fields as stored, and import keeps them.
  - Only a case study's record may carry them. An item's own `ehr` with either field refuses the import (`Item 1: "ehr.tabs.0.stepAccess" is not valid.`).

```json
{
  "timePoints": [
    { "id": "tp_0115", "label": "0115" },
    { "id": "tp_0130", "label": "0130", "fromStep": 3 }
  ],
  "tabs": [
    {
      "id": "labs",
      "kind": "lab_results",
      "title": "Lab Results",
      "stepAccess": ["hidden", "locked", "open", "open", "open", "open"],
      "blocks": [{ "kind": "markdown", "value": "Drawn 0115, resulted 0128." }]
    },
    {
      "id": "notes",
      "kind": "nurses_notes",
      "title": "Nurses' Notes",
      "blocks": [
        { "kind": "markdown", "value": "0115: Pain now 8/10 and constant." },
        { "kind": "markdown", "value": "0130: Pale and diaphoretic.", "fromStep": 3 }
      ]
    }
  ]
}
```

## Export

**Export JSON** on an item or a case study downloads `item-<id>.learn.json` or `case-study-<id>.learn.json`.

- Only authors can export, and only content in their own organization.
- Only valid content exports. An item must pass its schema. A case study needs its record and six finished steps; they may still be drafts.
- Exports include answer keys and rationale, so treat an export like the bank itself.

## Import

Teachers no longer import JSON: the quiz page's **Import JSON** form was removed on 2026-10-22 at the owner's request, since it does not fit the target audience. To bring in existing questions, a teacher uses **Import with AI** on the quiz page instead. **Export JSON** stays.

The format is still read inside LeaRN: the sample quiz loads through the same parser (`parseImport` in `src/lib/authoring/transfer.ts`) and the same database function (`public.import_bank_content`), and e2e specs seed quizzes from `learn.v1` payloads with that parser, writing the rows that function writes (`e2e/seedQuiz.ts`). A `learn.v1` payload is read by these rules:

1. **Size:** the text is refused above 800 KB, before it is parsed, and each item above 200 KB.
2. **Checks:** it must be JSON, a `learn.v1` envelope, and every entry must pass its schema.
3. **Any problem refuses the whole payload.** Each problem names the entry and field, for example `Item 2: "stem.value" is not valid.` or `Case study, step 3: "stem.value" is not valid.`. Messages never repeat the payload's text.
4. **New drafts only:** everything in a payload is written in one database call (`public.import_bank_content`), optionally filed in one of the bank's folders in the same call. It runs as the caller, so it writes only into a bank their organization owns, and only into one of that bank's folders.
   - Every item gets a new id, draft status and version 1. Ids in the payload are never used, and nothing already in the bank is changed.
   - A case study's six step items are created, placed and pinned to their steps in the same call.

Imported content is published the usual way: each item from its editor, then the case study from its builder.
