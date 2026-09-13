# Sprint 5 — Demo

**Goal:** editors for the remaining six item types, a scoring preview, case studies built step by step with a patient record, records on standalone items, and moving content as JSON.
**Status:** complete 2026-09-13. Stories #82 to #90 merged; `main` at 837afe1.
**Production:** https://learn-tanner-nielsons-projects.vercel.app
**Repo:** https://github.com/tannernielson27/learn

## Demo script (6 steps)

1. In a bank, choose **New item → Bowtie**. Write the three columns, mark two actions, one condition and two parameters. The **Scoring** panel reads "Worth 5 points." Publish.
2. Open a matrix item and choose **Add patient record**. Add Vital Signs sections at 0800 and 1200, switch time in the preview, and publish. Play it from the bank: the record sits beside the question, with no answer key in the page.
3. Start a case study. On the **Record** step, write the header and two sections, then save; the rail marks it Ready. Pick a type for each of the six steps, write it in place, and publish it.
4. Type in a step and choose another step. The builder asks before discarding. Change a step's type; it warns that its answers will be lost.
5. Choose **Preview case study** and play it as a student would. Choose **Back to editing**, then **Publish case study**.
6. Choose **Export JSON** on the case study. In a second bank, import the file: the copy is a draft with its record and six steps.

## What shipped

| PR   | Issue | What                                                                                      |
| ---- | ----- | ----------------------------------------------------------------------------------------- |
| #91  | #82   | Highlight text and table editors (5beb038)                                                |
| #92  | #83   | Drag-and-drop cloze and rationale editors (f82df9c)                                       |
| #93  | #84   | Ordered response and bowtie editors, so every item type has an editor (1b5180d)           |
| #95  | #85   | Scoring preview while writing, and points in the bank list (636433f)                      |
| #96  | #86   | Case study data: same-bank steps, atomic placing and reordering, publish checks (0b5c9d0) |
| #97  | #87   | Patient record editor beside the record panel (8a27e59)                                   |
| #98  | #89   | A patient record on any standalone item, in the editor, preview and play (b5e7634)        |
| #99  | #88   | Case study builder: step rail, steps edited in place, unsaved-change prompts (e3525d1)    |
| #100 | #88   | Preview and publish from the builder, plus a timed build e2e (e9584ce)                    |
| #101 | #90   | Export and import as learn.v1 JSON, written in one transaction (837afe1)                  |

- **Editors:** all 14 NGN item types now have an editor on the shared `EditorShell`, with plain-language problems and a live scoring summary.
- **Records:** one record editor, `EhrRecordFields`, serves a case study's Record step and any standalone item.
  - Notes are plain text; tables and vitals are grids; time points drive the preview's time selector.
  - Unfinished records save as drafts and reopen as they were left.
- **Case studies:**
  - Steps live in the case study's own bank. Placing, replacing and reordering are single database calls, and a step item's clinical judgment step is pinned by the server to its position.
  - The builder asks before discarding unsaved work, previews the saved case study, and publishes with every blocker named.
- **Transfer:** `learn.v1` (docs/transfer-format.md).
  - Imports are bounded before parsing and validated per entry, with errors that never repeat the file.
  - A valid import is written by one security-invoker function, as new drafts with new ids. It's bounded there too, for any caller.
  - Exports are author-only, `no-store`, and refused when started from another site.
- **Hosted database:** migrations `case_study_steps` and `import_bank_content` were applied to the hosted project with MCP after their PRs merged.
- **Checks:**
  - pgTAP: 59 tests.
  - Unit: every PR added tests first; the last authoring run passed 863 tests.
  - e2e: CI's `auth e2e` job now also runs the timed case study build and the transfer journey.

## Known gaps

- **ADR 0003 amended (owner-approved):** authoring pages, including the case study preview, may score in the author's browser. Student-facing pages keep server-side scoring. #46 (keys per step, at reveal) still gates Sprint 7.
- **Builder:**
  - The builder page works out step readiness beside `assembleCaseStudy`, and repeats its select string in the export. They agree today; fold them together.
  - Changing the same step's type from two tabs at once can leave one empty draft in the bank. It needs a locked database function.
  - The site header's links don't ask before leaving unsaved work. Reload and close still warn.
- **Rate limiting:** no authoring action has it yet, the import function included.
- **Test runs:** local e2e and full coverage runs on this machine get stopped for low memory with both local Supabase stacks up. CI remained the e2e gate for several PRs.
- **Hosted setup:** Vercel Supabase env vars, the dashboard URL config and magic-link template, and #67's Google OAuth client are still the owner's to set up.
- **Carried forward:** #46, #49, #50, #54 to #61, #94.

## Retro

- **Reviews** again caught what tests alone didn't:
  - a step unpinned by saving a half-written draft
  - a published case study left "published" after a step's type changed
  - export downloads that another site could trigger
  - import bounds that a direct RPC call could skip
  - focus lost after removals, moves and type changes

  Each got a failing test before its fix.

- **Scripted edits** across the 14 form mappers and draft schemas were fast and safe because round-trip tests covered every type; the script's own report caught the one loader it missed.
- **Testing Library** trims spaces at the edges of screen-reader-only text when it computes names. The `Sr` helper keeps those spaces outside the span, and a test found the real "Movesection 2 up" bug.
- **Playwright** name matching is a substring match: "Likely" matched "Unlikely". Use `exact: true` in shared helpers.
- **Local resources:** role queries over a whole record form timed out under a loaded run, and local e2e kept getting stopped for memory. Scope heavy tests, run one spec on one worker locally, and let CI carry the rest.
