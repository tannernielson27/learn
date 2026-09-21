## Story

Closes #60 (filed from the Sprint 3 audit, #42): five smaller screen-reader findings. Each is its own commit with its own test.

**Stacked.** This branch is built on `fix/59-disabled-submit-reason` with `fix/58-bowtie-second-slot` merged in (the only conflict was the two draft `PR-BODY.md` files). Merge #59 and #58 first; this diff is then only the five fix commits below, plus one review fix to the matrix names.

## What a screen reader hears now

| #   | Finding                                        | Before                                                                 | After                                                                                    |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Phone matrix controls named by the column only | "Improving, radio button" on every card                                | "Heart rate 124 beats/min Improving, radio button"; after submit "… Improving Incorrect" |
| 2   | Option labels read twice                       | "Respiratory rate 28 breaths/min, check box", then the same text again | The name only, once                                                                      |
| 3   | Ordered feedback in an awkward order           | "…Correct position: 3 Incorrect"                                       | "<step> Incorrect", then "Correct position: 3"                                           |
| 4   | dnd-kit's empty assertive live region          | An empty `role="status" aria-live="assertive"` in every drag item      | Not in the accessibility tree                                                            |
| 5   | "Question" is a generic region name            | Region and heading "Question"                                          | "Bowtie question", "Matrix Multiple Choice question", and so on                          |

### 1. Phone matrix names (`Matrix.tsx`)

The grid already named each control by row and column. The phone cards named it by the column alone and left the row to the fieldset's legend, which a screen reader can skip when moving control to control. Card controls are now `aria-labelledby` the legend and the column text. That column text is `aria-hidden`: it is already in the name, and left exposed it would be read a second time (the same problem as #2).

**Review fix: the verdict is part of the name, in both views.** An explicit `aria-labelledby` replaces the name the `<label>`'s content would give, so the first version of this change dropped the sr-only Correct/Incorrect/Missed text from the phone card's name in feedback mode. A card control read "Respiratory rate 32 breaths/min Improved" with no verdict. That was a regression from this branch: before it, the card's name came from the label and included the verdict. The verdict span now has an id that goes last in `aria-labelledby` once there is feedback, and it is `aria-hidden` so it is not read again beside the control (the same approach as `OptionRow`). The card now reads "Respiratory rate 32 breaths/min Improved Incorrect".

**The desktop grid had the same gap, and it predates #60.** It came in with #62 (`01c1db2`): the grid's `aria-labelledby` pointed at the row and column headers only, so on a laptop the verdict was never part of the name either; it sat beside the control as loose text. It is fixed in the same commit, with the same helper. Both views have a feedback-mode test that checks the name and that no verdict text is left exposed outside it. Both tests failed before the fix.

### 2. Options read once (`OptionRow.tsx`)

#1 and #2 pull in opposite directions, so they are fixed separately. Here the name already had everything; the problem was the label's visible text also being exposed as content next to the control. The control is now `aria-labelledby` its letter (multiple choice), text and feedback spans, and those spans are `aria-hidden`. A hidden element still names whatever points at it with `aria-labelledby`. The content of the name is unchanged ("A <text>"; "<text> Correct" after submit), and the whole row is still the `<label>`, so the tap target is the same. Covers multiple choice, multiple response and grouping.

### 3. Ordered feedback order (`OrderedResponseItem.tsx`)

The visually hidden verdict moved from after the step's block to straight after the step's text, before "Correct position: N". **Only the order changed, not the wording.** If "Correct position" itself should read differently (for example "Belongs in position 3"), that is a copy decision and visible, so it would move baselines; it is left alone here.

### 4. dnd-kit's live region (`dndAccessibility.tsx`)

dnd-kit's `Accessibility` component always renders a drag-instructions text and an assertive live region, with no option to leave them out. Every drag item here already passed silent announcements and speaks through its own polite status, so the region only ever sat empty.

It is **not removed**: dnd-kit keeps writing to it, so removing it could lose an announcement or throw. A new `useSilentDndAccessibility` hook passes dnd-kit a `container`, so its markup is portalled into a `<div hidden>` the component renders. What writes to that region: only the four handlers in `SILENT_ANNOUNCEMENTS` (moved into the hook's module; `OrderedResponseItem`'s private copy is gone), which return `undefined`, and dnd-kit's `announce` ignores `undefined`; `onDragMove` is not defined, so dnd-kit never calls it. So nothing that was said before goes unsaid. The drag-instructions text is not referenced by anything (none of the draggables spread dnd-kit's `attributes`), so hiding it changes nothing either. The hook's comment warns that giving dnd-kit real announcements again means moving the container back into view.

### 5. Question region name (`ItemPlayer.tsx`)

`ItemPlayer` now defaults its `label` to `"<format> question"` from `ITEM_TYPE_LABELS`. A caller's own label still wins ("Your answer", "Version 1 question"). The live student room dropped its explicit `label="Question"` so it gets the default. `QuestionShell.tsx` (just rewritten by #59) is untouched: no `disabled`, no change to the Submit guard.

## Decided: the #58 focus-plus-status double announcement

After #58, placing a bowtie choice in an empty pair's second slot moves focus to slot 1. A screen reader then hears the slot's new name ("Actions to Take 1 of 2: <choice>") and, from the polite status, "<choice> placed in Actions to Take 1 of 2."

**Kept as is.** Accurate, and the redundancy is one short sentence. The status region is the one channel every path shares: keyboard, tap and drag all announce through it, and the drag path moves no focus at all. Programmatic focus moves are not reliably spoken everywhere (VoiceOver on iOS is the usual gap), so the status is the backstop for the one case #58 exists to fix. Suppressing it only when focus moves would couple the message to the focus logic for little gain. If a real screen-reader run (#61) finds it grating, the fix would be to make the status add something the focus does not, such as why focus moved, and that is a wording decision.

## e2e selectors

Playwright matches `name` and `getByText` by substring unless `exact: true`. Checked every `getByRole(..., { name })` and `getByText` in `e2e/` against the new names:

- **Changed:** `authoring.spec.ts:41`, `getByText("Extended Multiple Response")` on the editor page, would also have matched the preview's sr-only heading "Extended Multiple Response question" (strict-mode violation). Now `exact: true`.
- **Still match, checked:** `case-study.spec.ts` `/Pulmonary embolism/` and `/Improving/` (phone card names now carry the row, and no row label in the fixture contains either string; "Not improving" is lower case); `trend.spec.ts` `pick()` scopes to the row's card and matches the column by substring, which the longer name still contains (only its comment changed); option regexes and strings in `authoring`, `feedback`, `review`, `liveAnswer`, `liveSession` (option names keep the same text).
- **No region or heading query** in `e2e/` uses "Question", and no `level: 2` heading query matches "<format> question".

## Screenshots

No visual change intended. Every change is an attribute, an id, an `aria-hidden`, an sr-only element moved, or a `hidden` (display: none) container replacing dnd-kit's fixed-position 1px region, which was out of flow already. The ordered-response verdict gained a leading space inside the step's text; it falls at a line end before a block and collapses. No committed baseline captures ordered-response feedback anyway. The `gallery screenshots and axe` job is the real check.

## Verification

GitHub Actions is down, so this was verified locally only.

- **Ran:** `pnpm typecheck`, `pnpm lint`, `pnpm format:check` (only complaint: the git-ignored `.claude/settings.local.json`), and `vitest run` on `src/components/question`, `src/components/case-study`, `src/components/live` and `src/components/authoring` (all pass; the 13 new or updated tests were run first and failed before the fixes). After the review fix, `src/components/question`, `src/components/live` and `src/components/case-study` were re-run (all pass). The two new matrix feedback tests failed before that fix. `src/components/authoring` was not re-run after the review fix.
- **Not run:** coverage, build, Playwright (e2e, the 66 baselines, axe), and any real screen reader. What NVDA or VoiceOver actually say is inferred from the accessibility tree, as in the #42 audit; #61 covers a real run.

## Test plan

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`
- [x] Unit tests for the touched areas
- [ ] CI unit suite with coverage
- [ ] CI `gallery screenshots and axe`: no baseline should change
- [ ] CI e2e (authoring, case-study, trend, feedback, review, live)
- [ ] Manual screen-reader pass (#61)

## Demo step

On a phone-width gallery page for Matrix Multiple Choice, move through the controls with a screen reader: each is read with its finding and its column. On Extended Multiple Response, each option is read once. In the landmarks list, the item's region is "Extended Multiple Response question".

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_016tcmsv8XALsD2G6KRJLYu4
