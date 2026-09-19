# learn.v1: moving items and case studies as JSON

LeaRN exports and imports content as JSON in one versioned envelope. It is also the contract for
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
- **Item tags** (`tags`) hold the NCLEX client needs categories and free topic tags; the CJMM step stays in `cjmmStep`. On import, and whenever an item is saved, tags are trimmed with whitespace closed up, a client needs category is spelled the one fixed way (`src/lib/ngn/tags.ts`, for example `"Physiological Adaptation"`), a topic is lower-cased, and repeats are dropped. An item may carry at most 20 tags of at most 50 characters each; more refuses the import (`Item 1: "tags" is not valid.`).
- **A case study** is in the shape of `caseStudySchema` (§4.1): `id`, `title`, `tags`, `ehr`, and exactly six `items` in clinical judgment order, each with `cjmmStep` equal to its position.

## Export

**Export JSON** on an item or a case study downloads `item-<id>.learn.json` or `case-study-<id>.learn.json`.

- Only authors can export, and only content in their own organization.
- Only valid content exports. An item must pass its schema. A case study needs its record and six finished steps; they may still be drafts.
- Exports include answer keys and rationale, so treat an export like the bank itself.

## Import

**Import JSON** on a bank takes a file or pasted text.

1. **Size:** the text is refused above 800 KB, before it is parsed, and each item above 200 KB.
2. **Checks:** it must be JSON, a `learn.v1` envelope, and every entry must pass its schema.
3. **Any problem refuses the whole import.** Each problem names the entry and field, for example `Item 2: "stem.value" is not valid.` or `Case study, step 3: "stem.value" is not valid.`. Messages never repeat the file's text.
4. **New drafts only:** everything is written in one database call (`public.import_bank_content`). It runs as the caller, so it writes only into a bank their organization owns.
   - Every item gets a new id, draft status and version 1. Ids in the file are never used, and nothing already in the bank is changed.
   - A case study's six step items are created, placed and pinned to their steps in the same call.

Imported content is published the usual way: each item from its editor, then the case study from its builder.
