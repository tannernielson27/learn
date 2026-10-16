# Sprint 12: Demo

**Goal:** a teacher turns a document of questions into drafts in a quiz, with the AI copying and the teacher deciding (Demo 13, ADR 0008).

Sprint 12 adds AI question import. It covers:

- **Import with AI** on a quiz, with a rights box, for up to 5 PDF, Word, Markdown or text files;
- reading each file part by part with Claude, under a monthly cap per workspace, carrying on after a reload;
- a review screen: every question the AI found, what to check, its source, Drop, Restore and Change type;
- **Edit** on a staged question, in its type's own editor, to mark a missing answer;
- **Import N questions** into the quiz as drafts, all or nothing, or **Discard this import**;
- a teacher guide section, a full-flow e2e, the security rows and this demo.

The AI copies what is in the document. It never writes an answer or a rationale.

**Status:** code complete 2026-10-15. Every story is merged but #348 (PR #451) and #349 (PR #453), which wait on the owner.
**Production:** https://learn-nine-alpha.vercel.app
**Repo:** https://github.com/tannernielson27/learn

> **Hosted database:** one migration to push. Sprint 12 has three: rows 54 and 55 (`20261015000000_ai_import`, `20261015005000_ai_import_segments`) were applied on 2026-10-15. **Row 56, `20261015010000_ai_import_commit` (#348), is not applied:** push it as soon as #451 merges (docs/05 §7.14 step 1). Until then a teacher can upload and review, but **Import** fails. Previews share this database, so the demo needs it too.

## Demo script (6 steps)

`e2e/aiImportFlow.spec.ts` runs steps 1 to 5 in CI at 375, 768 and 1280 px, through the interface only, with the fake client. `e2e/aiImport.spec.ts`, `aiImportReview.spec.ts`, `aiImportFix.spec.ts` and `aiImportCommit.spec.ts` cover the rest.

**Where to run it.** On a preview, on a phone first. The preview needs `AI_IMPORT_FAKE=1` in Vercel's **Preview** scope (owner step 2 below). The fake client makes no network call: it reads each numbered heading of a Markdown file as one multiple choice question. So use the corpus document, not your own samples: on the phone, open `https://github.com/tannernielson27/learn/blob/main/test/ai-import/corpus/01-med-surg-review.md`, choose **Download raw file**, and keep it in Files. Sign in as a teacher of the shared LeaRN workspace, which has AI import on.

1. **Start an import.** Create a quiz named `S12 demo` and press **Import with AI**. The page says about how many documents are left this month and links to **How AI import works**. Choose the downloaded file and press **Upload and read** without ticking the box: it asks you to confirm you may use the content and that it has no real patient information. Tick it and press **Upload and read** again.
2. **It reads, and survives a reload.** Each part shows as read. Reload, or lock the phone and come back: it carries on from where it was. When it says **Ready for review**, press **Review the questions**.
3. **Review.** **Import N questions** is greyed out, with why under it. Tap the filters: Ready, Needs an answer, Needs a fix, Not importable. Open **Show source** on one: on the phone the document's words sit under the question; on a laptop, beside it. The open discussion prompt is Not importable and is left out on its own.
4. **Add a missing answer.** The question about a blood glucose of 52 mg/dL says **Needs an answer**: the document gives its answer on a separate line the AI did not mark. Press **Edit**, mark **A** (4 ounces of fruit juice), press **Save**, then **Back to the review**. It is Ready.
5. **Import.** **Drop** each question that still needs something, and watch the button's count go down. Press **Import N questions**: "N questions were added to S12 demo as drafts." Press **Open S12 demo**. The questions are there as drafts, in no folder. Open the blood glucose question, write a rationale (the AI wrote none), and press **Publish**.
6. **Discard, and nothing left behind.** Start a second import with the same file, then on the review screen press **Discard this import** and confirm. You are back on the quiz, with nothing added. Both imports' uploaded files are gone.

Things worth trying off the script:

- **Change type** on a question, to Bowtie: it says first that it counts towards this month's allowance, then reads the question again as a Bowtie.
- Open the review page's address as a teacher of another workspace: it is not found. As a student: you are sent to your classes.
- `/help/instructor#ai-import` is the guide section, with a picture of the review screen.
- **The planned Demo 13** (a Word case study and a PDF of questions, the case study's chart growing step by step on a phone) needs the real key, so it runs on production after docs/05 §7.14, with your own samples. A case study imports as it is; it cannot be edited on the review screen (see Known gaps).

## What shipped

| PR   | Issue | What                                                                          | Commit  |
| ---- | ----- | ----------------------------------------------------------------------------- | ------- |
| #350 | n/a   | Sprint 12 kickoff, ADR 0008                                                   | 22dde50 |
| #352 | #333  | Cost and accuracy measured on the owner's samples                             | 087c342 |
| #441 | #337  | Draft shapes and converters for the selection, ordered and bowtie types       | 0f5d99c |
| #442 | #338  | Draft shapes and converters for cloze, highlight, drag-and-drop, case studies | 1b1a886 |
| #443 | #339  | A fictional golden corpus and an accuracy eval                                | 6601e69 |
| #444 | #340  | Import batches, staged entries, a private bucket and a monthly cap            | fac8fee |
| #445 | #341  | Uploaded files checked by their bytes and prepared for Claude                 | 05a5ab9 |
| #446 | #342  | The Claude client, the segment pass, the usage ledger and the cap             | f425c85 |
| #447 | #344  | Case studies assembled, with a chart that grows by step                       | c041a5f |
| #448 | #343  | Each question extracted into a draft, validated, and repaired once            | 88a0b59 |
| #449 | #345  | Upload documents and watch them read                                          | 4e1e7cb |
| #450 | #346  | The review screen                                                             | c9c5a99 |
| #452 | #347  | Edit a staged question in its own editor (single questions only)              | 6d58660 |
| #451 | #348  | Import a reviewed batch all at once, or discard it; the 7-day sweep           | pending |
| #453 | #349  | The guide, the full-flow e2e, the security rows and this demo                 | pending |

## Owner steps, in order

1. **Merge #451, then push row 56** from an up-to-date `main` (docs/05 §7.14 step 1). The push output must name `20261015010000_ai_import_commit`.
2. **For the demo on a preview:** Vercel → Settings → Environment Variables → `AI_IMPORT_FAKE` = `1`, **Preview** scope only, then redeploy the preview. Never in Production; the app refuses it there anyway.
3. **For real imports on production:** the key, the cap and the Anthropic spend limit (docs/05 §7.14 steps 2 to 6). Turn AI import on per workspace in SQL; it is off for every self-registered one.
4. **Accept the demo.** The S12 milestone stays open until you run it.

## Decisions made during the sprint

The eight owner decisions of 2026-10-01 are in docs/open-issues.md and ADR 0008. These came after:

- **Imports land in the quiz the import was started from** (owner, 2026-10-15, #345 and #348). No new quiz is made and none is offered.
- **Each chunk's segment answer is a column** (owner, 2026-10-15, #343: `ai_import_chunks.segments`), and a batch keeps its source matter (`ai_import_batches.source`).
- **The case-study half of #347 was cut** under the sprint's cut line: there is no builder view for a staged case study and no "Split into standalone items". Single questions ship whole.
- **AI import stays off for a self-registered workspace** until the owner turns it on (S13 kickoff decision 1).

## Known gaps

- **A staged case study cannot be edited or split before import** (#347's cut). Import it as it is and fix it in the quiz's case study builder, or drop it. #347's acceptance test "split a staged case study into six standalone items" is not met.
- **A swept import's files wait for that workspace's next import or discard** before Storage deletes them. Only the Storage API can delete an object, and nothing scheduled calls it. A workspace that never imports again keeps them, privately.
- **A failed part holds its claim for 6 minutes**, so **Try again** on it is refused until then. The same goes for a failed Change type.
- **A few milliseconds remain between re-reading the batch and writing** in Change type and Save. The only ways a batch leaves review delete its entries, so the write finds no row (docs/audits/S10-security.md, Sprint 12).
- **The fake client only reads numbered Markdown headings,** so a preview demo cannot show a PDF, a .docx or a case study. The real pipeline is measured by hand (`pnpm eval:ai-import`, `test/ai-import/README.md`); CI scores recorded answers offline.
- **Not yet in the corpus:** a trend question, a typo in a chart time, an embedded image, the same document as .pdf and .docx, and a damaged PDF text layer.

## Retro

Written by the #349 builder from the issue notes and the PRs, not from the whole sprint's sessions.

- **Measure first paid off.** The #333 spike ran the owner's samples before any schema existed. It changed the cap from pages to money and extract calls from four questions to two, and it found the model inventing "Question 1 of 6" labels, which became the "not in the source" check.
- **A fake client made the walk testable.** `AI_IMPORT_FAKE=1` let every e2e, and the full-flow test here, run the real routes, ledger and staging with no key and no network. The cost is that the fake reads only one shape of document, so prompt quality is measured by hand.
- **The cut line was written down at kickoff and used.** When #347 ran long, its case-study half was dropped without debate, and the notes in open-issues say exactly what is missing.
- **Notes between stories carried the sprint.** Each story left "Notes for the stories after it" in open-issues: the version check, the millisecond window, where the import button goes. Later builders started from them rather than from the code.
- **Hold a migration until the owner can push.** #348's migration waits with its PR, as S11 learned, rather than merging code the hosted database cannot run.
