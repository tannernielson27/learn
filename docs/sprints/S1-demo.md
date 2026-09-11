# Sprint 1 — Demo

**Goal:** the question shell and all eight selection-based item types, playable on a phone and a laptop.
**Status:** complete 2026-09-10. All stories (#2 to #8) merged and closed; `main` at 5fb495f is deployed.
**Production:** https://learn-tanner-nielsons-projects.vercel.app/gallery
**Repo:** https://github.com/tannernielson27/learn

## Demo script (5 steps)

1. On a phone, open `/gallery/items/multiple_response`. Select three options including one wrong, submit. The score panel shows +/- scoring (for example 1 / 3) and marks each option correct, incorrect or missed.
2. Open `/gallery/items/matrix_multiple_choice`. Answer two rows in portrait, rotate to landscape: the grid appears with both answers kept. Submit to see points per row.
3. Open `/gallery/items/dropdown_rationale`, switch the fixture to **Edge case** (the triad). Pick a wrong anchor and two right supporting blanks, submit. The score is 0 and the panel explains why: the anchor was wrong, so the supporting blanks earn nothing.
4. Open `/gallery/items/multiple_response_grouping` on a laptop, keyboard only. Over-select one row, submit. That row floors at 0 instead of going negative.
5. On GitHub, open the latest `e2e` workflow run on a PR and download `gallery-screenshots`: every item route at 375, 768 and 1280px, with axe passing (42 of 42).

## What shipped

| PR  | Story                                                                    |
| --- | ------------------------------------------------------------------------ |
| #9  | QuestionShell, gallery item harness, multiple choice and SATA / Select N |
| #11 | Matrix multiple choice and matrix multiple response                      |
| #12 | Drop-down cloze and drop-down rationale (dyad and triad)                 |
| #13 | Drop-down table and multiple response grouping                           |
| #14 | Playwright screenshots and axe on every Vercel preview                   |

- Shared layouts that later stories reuse: `matrix/Matrix.tsx` (grid at 768px and wider, row cards below, one response behind both), `row_table/RowTable.tsx`, `dropdown/DropdownSentence.tsx`, and `OptionRow` with its feedback marks.
- Renderer modules can add an item-specific note to the score panel (`explainScore`); drop-down rationale uses it for dyad and triad scoring.
- Answer keys are stripped from what renderers see outside feedback mode (tested in `ItemPlayer.test.tsx`).
- 152 unit tests pass at 97.75% lines and 92.71% branches. The `e2e` workflow runs after every successful Preview deployment.

## Known gaps

- The owner has not yet run the demo on a real phone, and there is no screen recording.
- Gallery sidebar at 1280px: the System / Light / Dark toggle overflows the 256px sidebar and long item names clip their "ready" tag. Gallery only, not the player.
- Screenshots are uploaded as artifacts but not diffed. Baselines must be generated on the Linux runner so fonts match.
- The `e2e` job is not a required check, because it runs after Vercel deploys rather than on the PR commit.
- `@types/node` 20 is below the version Vitest 5 expects (peer warning only). GitHub Actions `@v4` actions target the deprecated Node 20 runtime.
- The ESLint rule that keeps `src/lib/ngn` free of React, Next and Supabase imports (promised in ADR 0001) is not written yet.
- The collaborator is still not onboarded; required approvals on `main` stay at 0 until they are.

## Retro

- Building shared layouts first paid off: `Matrix` made #7's `RowTable` a small story, and `OptionRow`'s feedback marks were reused by three renderers.
- The stories ran one after another in the main session instead of four parallel worktrees. That avoided the Sprint 0 agent stalls, but every pair of PRs hit a one-line conflict in the renderer registry.
- Screenshots and axe arrived last (#8) and had to backfill three stories. In Sprint 2 they run on every PR from the first story, which matters most for touch drag-and-drop.
- The screenshot flake came from too many headless browsers on this machine, not from the app. Capping Playwright at 2 workers fixed it; waiting on a hydration marker replaced `networkidle`.
- The code-reviewer agent stalled on broad prompts and finished on narrow ones ("read these files, report only CRITICAL/HIGH").
