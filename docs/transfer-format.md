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
- **Item tags** (`tags`) hold the NCLEX client needs categories and free topic tags; the CJMM step stays in `cjmmStep`. On import, and whenever an item is saved, tags are trimmed with whitespace closed up, a client needs category is spelled the one fixed way (`src/lib/ngn/tags.ts`, for example `"Physiological Adaptation"`), a topic is lower-cased, and repeats are dropped. An item may carry at most 20 tags of at most 50 characters each; more refuses the import (`Item 1: "tags" is not valid.`). A case study's own `tags` are kept as written and are not yet filtered by; its six step items' tags follow the item rules.
- **A case study** is in the shape of `caseStudySchema` (§4.1): `id`, `title`, `tags`, `ehr`, and exactly six `items` in clinical judgment order, each with `cjmmStep` equal to its position.

## Export

**Export JSON** on an item or a case study downloads `item-<id>.learn.json` or `case-study-<id>.learn.json`.

- Only authors can export, and only content in their own organization.
- Only valid content exports. An item must pass its schema. A case study needs its record and six finished steps; they may still be drafts.
- Exports include answer keys and rationale, so treat an export like the bank itself.

## Import

**Import JSON** on a bank takes up to 10 files at once (the import rate limit is 10 a minute, and each file is one import), pasted text, or both, and optionally a folder of the bank to file everything in (**Import into**; it starts on the open folder, otherwise Unfiled).

Each file (and the pasted text) is its own import, with the rules below. The page sends one file per request, one after another, so no request carries more than one 800 KB file and every request stays under the 1 MB Server Action body limit. Each file is written in its own single database call, so **a file lands whole or not at all, and a refused file never blocks the others.** A set larger than 50 items is several files: a file over 50 items is refused whole rather than split, because a file split across calls could land in part.

After the last file, a report lists each file by name: how many items (or which case study) it imported, or that nothing was imported from it and why. An empty or oversized file is refused in the browser, before it is sent. If a request fails in transit, that file is reported as possibly not imported, since the page cannot tell whether it landed; check the bank before importing it again.

1. **Size:** the text is refused above 800 KB, before it is parsed, and each item above 200 KB.
2. **Checks:** it must be JSON, a `learn.v1` envelope, and every entry must pass its schema.
3. **Any problem refuses the whole file.** Each problem names the entry and field, for example `Item 2: "stem.value" is not valid.` or `Case study, step 3: "stem.value" is not valid.`. Messages never repeat the file's text.
4. **New drafts only:** everything in a file is written in one database call (`public.import_bank_content`), filed in the chosen folder in the same call. It runs as the caller, so it writes only into a bank their organization owns, and only into one of that bank's folders.
   - Every item gets a new id, draft status and version 1. Ids in the file are never used, and nothing already in the bank is changed.
   - A case study's six step items are created, placed and pinned to their steps in the same call.

Imported content is published the usual way: each item from its editor, then the case study from its builder.
