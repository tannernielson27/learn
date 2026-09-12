# Sprint 3 — Demo

**Goal:** a full six-step case study with its patient record, the Trend item, feedback that explains itself, review mode, original sample content, and an accessibility and performance check before Phase 2 builds on the player.
**Status:** complete 2026-09-12. All stories (#36 to #42) merged; `main` at 01c1db2 is deployed. Phase 1 (question experience) is done.
**Production:** https://learn-tanner-nielsons-projects.vercel.app/gallery
**Repo:** https://github.com/tannernielson27/learn

## Demo script (5 steps)

1. On a phone, open `/gallery/case-study`. Open the patient record from its chip, read the 1400 nurses' note, close it, and highlight the findings that need follow-up. Submit: focus lands on the score, with the rationale beside each choice and a breakdown of the sum.
2. Work through steps 2 to 6, flagging step 4 on the way. Open **Review**: each step says answered, not answered or flagged, in words. Jump back to step 4; it reopens with its answer and feedback.
3. Finish on the results page: a total out of 19 and one line per step.
4. On a laptop, open `/gallery/trend`. Move the record between 0800, 1200 and 1600 while staying on Vital Signs, and answer the trend matrix.
5. Open any item: "Sample" sits above the stem. Play it with the keyboard alone and press Submit.

## What shipped

| PR  | Issue | What                                                                                 |
| --- | ----- | ------------------------------------------------------------------------------------ |
| #44 | #36   | EHR record panel with tabs; pane, drawer or sheet by width (f71ecbe)                 |
| #45 | #37   | Case study player through the six CJMM steps (2383bcb)                               |
| #47 | #38   | Trend item: one record across time points (5765d8d)                                  |
| #48 | #39   | Rationale beside each choice, and a score breakdown (794aea4)                        |
| #52 | #40   | Flag a step and return to it from a review list (0e9756c)                            |
| #53 | #41   | Sample label and clinically reviewed sample content (96ddb85)                        |
| #62 | #42   | Accessibility audit, focus and naming fixes, zod out of the browser bundle (01c1db2) |

- **Composites:** `EhrPanel` picks a pane, drawer or bottom sheet by width; `CaseStudyPlayer` mounts one step at a time and holds each step's response, result and flag; `RecordLayout` puts the record beside the work for both the case study and Trend items. A Trend item is any item whose record is charted at more than one time.
- **Feedback that explains itself:** rationale sits beside each option, matrix row and blank, and a Breakdown lists every element's contribution to the score.
- **Sample content:** all 14 canonical items, the Trend item and the case study are original, tagged `sample`, labelled "Sample" in the player, and corrected after a clinical review that found ten errors.
- **Audit (#42):** every item type, the case study and the Trend item were completed by keyboard alone; focus now follows Submit and every step change; zod and the fixture set are out of the browser, taking about 100 kB gzipped off every gallery route. Record: `docs/audits/S3-a11y-perf.md`.
- **Checks:** 284 unit tests at ~95% lines (the core at 100%), Playwright visual diffs and axe on every gallery route.

## Known gaps

- #46: a case study's answer keys reach the client; per-step delivery at reveal is required before live sessions (Sprint 7).
- #49: per-element rationale is not yet inline in the six pointer-heavy renderers. #50: the `PlayerItem` / `ItemOf` cast.
- No real screen reader has played the case study yet (#61); the #42 pass was an accessibility-tree approximation.
- Simulated mobile LCP (about 3.0 to 4.0 s) still misses the 2.5 s budget: renderers and dnd-kit load on every gallery route (#54). Submit and drag placement exceed 200 ms at 4x CPU (#55). Scoring runs in the browser (#56).
- Bowtie pair gap (#58), disabled Submit gives no reason (#59), smaller screen-reader findings (#60), three font families (#57).
- Returning to an answered case-study step shows feedback rather than review mode, by owner decision (#40).
- The clinical review of sample content was an agent pass; a nurse educator should read it before students do.
- The collaborator is still not onboarded; required approvals on `main` stay at 0.

## Retro

- The clinical review earned its place: ten real errors in content that had passed every schema and scoring test, including a key that contradicted its own record and a rationale that taught the opposite of safe practice. Content needs its own reviewer, not just validators.
- Auditing with scripts that only report, run by parallel agents against one shared build, kept the findings independent of the fixes; the fixes were then written test first.
- An automated screen-reader pass is useful but not the real thing. Focus loss after Submit was the most serious finding and had survived three sprints of unit and e2e tests, because nothing asserted where focus went.
- A layout change for one purpose broke another: padding added to unclip focus rings moved the tab strip's resting scroll position, and only the e2e arrow test caught it. Local e2e runs against a production build separate real failures from screenshot diffs quickly.
- Measuring before fixing paid off. One import chain (the gallery nav through the registry) put zod and every fixture on every page; the bundle numbers pointed straight at it.
- Stacked PRs and squash merges do not mix with `--delete-branch`: deleting #53's branch closed #62 instead of retargeting it, and the branch had to be restored to reopen it. Next time, retarget the stacked PR to `main` before merging the one below it.
- On this machine, PowerShell 5.1 writes a BOM that commitlint rejects, and each `git commit -m` paragraph is a single line; commit messages go through a file.
