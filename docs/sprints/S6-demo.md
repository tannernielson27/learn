# Sprint 6 — Demo

**Goal:** bank management — folders, tags, search, duplicate, archive, version history — plus bulk import, quality warnings and the polish carried from Sprint 5.
**Status:** complete 2026-09-19. Stories #94, #103 to #111 and #115 merged; `main` at a09f50e.
**Production:** https://learn-tanner-nielsons-projects.vercel.app
**Repo:** https://github.com/tannernielson27/learn

## Demo script (5 steps)

Sign in with **Use the demo account** — no email needed.

1. **Organize.** In a bank, make a folder **Cardiac** and drag nothing: choose items and **Move to folder**. Tag three of them `perfusion` and CJMM step **Analyze cues**. The folder tree and the tag bar both narrow the list, and the URL keeps what you chose.
2. **Import a set.** Choose **JSON files**, pick three exported files at once, and import them into **Cardiac**. Two land whole as drafts; the third is refused by name with the entry and field that broke it, and nothing from it is written.
3. **Find one.** Search `lactate`, then narrow to **Matrix Multiple Choice**, **Published**. Matched words are highlighted in the results. Page past 50 items and the search, tags and folder all stay in the URL.
4. **Fix a warning.** Open an item with the **Has warnings** chip. The editor lists its problems: every option marked correct, an option with no rationale, a stem that asks nothing. Clear the general rationale and **Publish** is refused — an item needs one (spec §6). Write it and publish.
5. **Duplicate, version, archive.** Duplicate the item, change the copy, and check **Version history** on the original — restore the previous version. Then **Archive** the copy: it leaves the list, appears under the archived view, and **Restore** brings it back.

## What shipped

| PR   | Issue | What                                                             | Commit  |
| ---- | ----- | ---------------------------------------------------------------- | ------- |
| #113 | #94   | Keep `maxPoints` out of the play page until the answer is scored | 123a0d7 |
| #114 | #103  | Sort a bank into folders                                         | 9885c33 |
| #116 | #115  | Sign in to a shared demo account without email                   | cc0713e |
| #118 | #104  | Tag items and filter a bank by tag                               | ce7fde1 |
| #117 | #108  | See an item's version history and restore a version              | e602073 |
| #119 | #111  | Polish carried from Sprint 5, plus per-user rate limits          | 15af295 |
| #120 | #106  | Duplicate an item or a case study                                | d0ca714 |
| #121 | #105  | Search a bank, with paging                                       | 1c92100 |
| #122 | #109  | Import many files and large sets at once                         | 3040d12 |
| #124 | #110  | Quality warnings in the editor and the bank                      | 614c0a3 |
| #125 | #107  | Archive and restore items and case studies                       | a09f50e |

- **Bank management:** folders, tags (topic and CJMM step), full-text search over stem, options and rationale, duplicate, archive/restore, and version history. All of them compose: folder, tag, search, type, status and paging narrow the same list through one `list_bank_items` RPC, and every filter lives in the URL.
- **Bulk import:** many files at once, each whole or not at all, into a chosen folder. Bounded before parsing, validated per entry, and reported per file by name without ever echoing the file's own text.
- **Quality warnings:** `src/lib/ngn/quality.ts` (pure, 96% statements) finds every option marked correct, options with no rationale, duplicate text, over-marked highlights and a stem that asks nothing. Warnings show in the editor and as a **Has warnings** chip in the bank.
  - **Owner decision:** a missing `rationale.general` **blocks publishing** (spec §6 stands). Drafts still save without it.
- **Archive:** archiving is a `status`, not a parallel view, so the Archived switch is just `status=archived` and composes for free with search, type, tags, folders and paging. `list_bank_items` defaults to `status <> 'archived'`. Archived content refuses saves, publishes and step moves at the database, and the editor says "restore it first" rather than "try again".
- **Security:** answer keys stay out of the bank list. #105's RPC deliberately never returns `answer_key` or `rationale`, and #110's warning counts cross into the page as a number and a boolean only.
- **Migrations:** `item_tags`, `start_step_and_rate_limits`, `duplicate_content`, `item_search`, `import_into_folder`, `archive_content`.
- **Checks:** pgTAP now covers search, import-into-folder and archive. CI's `auth e2e` job runs eleven specs: auth, authoring, case study builder, transfer, folders, tags, history, duplicate, search, bulk import, warnings and archive.

## Known gaps

- **The hosted database is behind the repo.** Apply these in order, the first to confirm and the rest merged but not applied: `20260916000000_bank_folders` (confirm), `20260919000000_item_tags`, `20260919110000_start_step_and_rate_limits`, `20260919120600_duplicate_content`, `20260919130000_item_search`, `20260919150000_import_into_folder`, `20260919160000_archive_content`. **Until `start_step_and_rate_limits` is applied, production refuses every save, publish and import.** The demo script above does not work on production until all of them land.
- **The demo sign-in has no rate limit of its own**, and neither has the email one. Heavy use can trip Supabase's per-IP auth limit for everyone signing in through Vercel. #111's per-user limit covers authoring actions only. Filed for Sprint 7.
- **The authoring rate limit is enforced in the Server Action, not at the write** ([#123](https://github.com/tannernielson27/learn/issues/123)). An author's own token used straight against the Data API is bounded only by RLS. Deliberate and documented in `20260919110000`, and unchanged by this sprint, but it should be one decision across `save`, `publish`, `step` and `import_bank_content`.
- **#110 follow-ups**, all recorded on PR #124:
  - The **Has warnings** scan is capped at 200 items and truncates silently, with no signal to the author, though `total_count` is available.
  - `listItems` and `listTaggedRows` each read up to 200 full rows from the same table for the same request; they should share one read.
  - `duplicateWarnings` ends in a bare `default: return []`, so a fifteenth item type would silently get no duplicate-text checking.
  - `EditorShell` re-runs `itemSchema.safeParse` on top of each editor's per-type parse, doubling validation per keystroke.
- **#107 follow-ups:** editors stay interactive on archived content (the database refuses and the message names why; threading read-only through every editor is its own story); archived rows can still be re-foldered and re-tagged, deliberately; the list's default `status <> 'archived'` predicate is not sargable and wants a partial index.
- **#109 follow-up:** a bulk import begun with a partly-spent rate limit does not short-circuit, so later files show a spurious "doing that too often". Atomicity is unaffected.
- **#105 follow-ups:** the result count reads 0 past the last page; the search excerpt's markdown stripping diverges from `stemExcerpt` and can leak a link's URL; `count(*) over ()` re-counts the whole matching set per page.
- **Demo account** is still on in production and must come off before real students. Owner keeps `DEMO_ACCOUNT_*` in Vercel for now (Sprint 7 decision).
- **Carried forward:** #46, #49, #50, #54 to #61, #67, #123.
- **Not run locally all sprint:** full coverage and the full e2e suite, which exhaust memory on the build machine. CI stayed the real gate.

## Retro

- **Late-sprint branches age badly, and that was this sprint's real cost.** Four stories were left half-built on pushed branches when a parallel run died. Finishing them one at a time worked, but each merge conflicted the next branch, so three of the four needed a rebase-and-fix pass after their agent had already reported done. Next sprint: rebase a branch immediately before review, not at the start of it, and merge in the order branches were cut.
- **A conflicted PR runs no CI, and that looks like success.** #122 sat with three green Vercel checks while `check`, `db` and `auth e2e` never ran at all — GitHub cannot build a merge ref for a conflicting PR. Check `mergeable` before reading a check list as green. This nearly merged untested.
- **Two defects belonged to no single branch.** Search's paging (50 per page) broke bulk import's e2e, which counted 80 items on one page; and the new "…before it can be published" warning button made `getByRole("button", { name: "Publish" })` ambiguous in the _existing_ authoring spec. Both only existed once two stories met.
- **`exact: true` has now bitten twice** — "Likely"/"Unlikely" in Sprint 5, "Publish"/"published" here. It is time to stop writing it in retros: add a lint rule or a shared helper that forbids a bare short button name in `e2e/`.
- **The sprint's worst bug was found by a reviewer, not a test.** #107's archive guard fired `before insert or update of item_id, case_study_id`, so `reorder_case_study_steps` — which writes only `position` — slipped past it: an archived case study's steps could still be reordered and their CJMM steps renumbered. No test caught it because no test reordered an archived case study. The guard now watches every write to `case_study_items`, and all seven other writers of that table were checked.
- **Agents that verified a reviewer's claim rather than obeying it were right to.** A CRITICAL on the search migration's `strict $.**` was disproved by replaying the migration into a throwaway schema; a HIGH on the import rate limit was declined with the migration's own comment as evidence and filed as #123 instead. Reviews are advisory — the evidence decides.
- **Hand-edited `database.types.ts` remains the most expensive small mistake.** One PR failed on `?: never` where the generator emits `?: unknown`, reasoned confidently from the generator's source. Migration filenames that sorted before migrations already on `main` cost another two renames. Both are mechanical; both should be a pre-push check.
