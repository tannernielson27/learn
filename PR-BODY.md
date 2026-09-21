## What

Closes #59 (from the Sprint 3 audit, #42).

The player's Submit button used the `disabled` attribute until the item was complete. A disabled
button cannot take focus, so a keyboard or screen-reader user never reached it, and never heard
"Complete the item to submit." beside it.

Submit is now `aria-disabled="true"` instead, stays in the tab order, and is `aria-describedby`
the reason. Focusing it reads roughly "Submit, button, unavailable, Complete the item to submit."

## How it stays unsubmittable

`aria-disabled` is advisory: the browser still fires `click` on pointer presses, Enter and Space.
So:

- `QuestionShell`'s `submit` handler returns early while the item is incomplete or an answer is
  being checked (`blocked = !canSubmit || submitting`). This guard is the only thing stopping the
  press, and it is tested directly.
- The button is `type="button"` (Button's default, now also set explicitly here), so pressing it,
  or pressing Enter on it, is never an implicit form submission. The player is not inside a form
  today (the authoring preview sits outside `EditorShell`'s form), and a test renders the shell
  inside a `<form>` to keep it that way.
- `aria-describedby` is set only when the reason text is actually rendered: not once the item is
  complete, not while checking, not when a check error takes the reason's place.

## Visuals

No visual change intended. Button's `disabled:opacity-50 disabled:cursor-not-allowed` no longer
match, so the Submit button carries `aria-disabled:opacity-50 aria-disabled:cursor-not-allowed`,
which produce the same opacity. The reason text only gained an `id`. The committed gallery
baselines all show the unanswered (blocked) Submit, so the `gallery screenshots and axe` job is
the real check on that claim.

One deliberate change in a transient state: while "Checking your answer" (already
`aria-disabled`), Submit is now dimmed like any other unavailable Submit. No baseline captures that
state.

## Tests

jest-dom's `toBeDisabled()` / `toBeEnabled()` read only the `disabled` attribute and ignore
`aria-disabled`. After this change `toBeDisabled()` would fail, and `toBeEnabled()` would pass in
both states, silently. So every Submit assertion moved, in both directions:

- 17 `expect(submit).toBeDisabled()` became `toHaveAttribute("aria-disabled", "true")`.
- 13 `expect(submit).toBeEnabled()` became `not.toHaveAttribute("aria-disabled")`.

Across Bowtie, DragDrop, Dropdown, Highlight, Matrix, RowTable, OrderedResponse, ItemPlayer,
ItemPlayer.server and CaseStudyPlayer. `toBeDisabled()` on other controls (radios, blanks, slots,
reorder buttons, authoring and host buttons) is unchanged: those are still natively disabled.

The attribute assertions say what state the button announces; they do not prove a press is
ignored. That is covered by:

- `QuestionShell.submit.test.tsx` (new): focus order, accessible description, the describedby
  target existing and being visible, click / Enter / Space ignored while blocked, no form submit,
  ignored while checking, and the complete path still submitting by click and by Enter.
- `ItemPlayer.test.tsx`: the multiple-choice test now presses the blocked Submit and asserts no
  score and no `onSubmitted`.

Mutation checks run locally: removing the `!canSubmit` half of the guard fails three tests;
making the button `type="submit"` fails the form test.

The e2e `toBeEnabled()` checks on Submit (`case-study.spec.ts`, `trend.spec.ts`) are unchanged:
Playwright 1.63's enabled state reads `aria-disabled`, so they still mean what they say, and its
click actionability still waits for Submit to be available.

## Out of scope

The smaller screen-reader findings in #60 are untouched.

## Test plan

- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] Prettier on `src/components` (repo-wide `format:check` flags only an untracked local
      `.claude/settings.local.json`)
- [x] The 12 touched unit test files: 107 tests pass
- [ ] CI unit suite with coverage
- [ ] CI `gallery screenshots and axe`: no baseline should change
- [ ] CI e2e (Submit clicks in authoring, case-study, feedback, review, motion, trend, liveAnswer)
- [ ] Manual screen-reader pass (NVDA or VoiceOver): Tab to Submit on an unanswered item and
      confirm it is announced as unavailable with the reason

## Demo step

Open any gallery item without answering, press Tab until Submit has focus, and listen: it is
announced as unavailable with "Complete the item to submit." Press Enter; nothing is sent.

## Review round

`code-reviewer`, on the local branch while CI was unavailable. **No CRITICAL, no HIGH.** It verified against source rather than taking the PR's word:

- jest-dom 7.0.1's `isElementDisabled` checks only `element.hasAttribute('disabled')`. So after this change `toBeDisabled()` fails loudly and `toBeEnabled()` passes in both states silently — which is why all 30 Submit assertions had to move, not just the 17 that would have failed.
- Playwright 1.63 reads `aria-disabled` in its enabled check (`hasAriaDisabledInChain`), so the e2e `toBeEnabled()` calls on Submit still mean what they say.
- `Button.tsx` spreads props onto a native `<button>` with no interception, so the `if (blocked) return` in `submit` is genuinely the only gate. `ItemPlayer` is the only caller of `QuestionShell`; nothing else reaches `submit`.
- `aria-describedby` walked through all four states (incomplete, complete, checking, error): set only while the reason is rendered, never dangling.
- None of the 66 baselines captures the "Checking your answer" state — `gallery-items.spec.ts` screenshots right after hydration without pressing Submit — so the one deliberate visual change is uncaptured.

Recorded, not fixed:

- **MEDIUM** — the 13 `not.toHaveAttribute("aria-disabled")` assertions are coupled to the implementation emitting `undefined` rather than `false`. `aria-disabled="false"` means the same thing and is exactly what `EditorShell.tsx:402` already emits, so copying that pattern here would break all thirteen while the button was still correctly enabled. It fails loudly, not silently, so it is a maintenance cost rather than a correctness risk. A shared `expectSubmitEnabled` helper would absorb it if the pattern spreads.
- **LOW** — the dimming is scoped to QuestionShell rather than added to `Button.tsx`, deliberately: adding `aria-disabled:opacity-50` to the shared component would dim every `aria-disabled` button in the app, including ones that are not dimmed today (`NewItemPicker.tsx:39`, `ItemHistory.tsx:165/189`). But it leaves the authoring Publish button (`EditorShell.tsx:389-413`) `aria-disabled` with no dimming and no stated reason, which predates this branch. Worth a consistency pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_016tcmsv8XALsD2G6KRJLYu4
