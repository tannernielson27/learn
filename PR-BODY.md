# feat(player): explain each element inline in six more renderers

## Summary

#39 put per-element rationale beside options, matrix rows and drop-down blanks. The six pointer-heavy renderers still listed their elements only in the breakdown. Each now shows an element's explanation where the element is and points the element at it with `aria-describedby`, reusing `ElementRationale`. It is feedback-only as before. Rationale reaches a renderer only with the reveal (`toPlayerItem` is unchanged), and each renderer also checks `mode === "feedback"`, so a renderer handed rationale in answer or review mode shows nothing.

**Stacked on #55** (`perf/55-submit-and-drop-inp`, itself on #54). Review and merge after those; the base will change to `main` once they land.

## Layout decisions, per renderer

| Renderer                          | Element                | Where the explanation goes                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Highlight text                    | a phrase inside a note | After the **sentence** holding the span, never mid-sentence. The note breaks only where an explanation goes; sentences in between stay one paragraph. The sentence splitting lives in `highlight/sentences.ts`: `.`, `!` or `?` followed by a space or the end of the text, and never inside a span.                                                           |
| Highlight table                   | a phrase in a cell     | **Beneath its own cell**, inside the cell: in the grid from 768px and in the row cards below it. Each layout has its own ids.                                                                                                                                                                                                                                  |
| Drag-and-drop cloze and rationale | a token that moves     | Attached to the **blank** the token landed in, and it says what belongs there. The explanations follow the sentence as "Blank N" entries, as the drop-down sentence does. A triad anchor is described by its tag and then its explanation.                                                                                                                     |
| Ordered response                  | a step                 | **Under each step's words**, in the order the student gave, next to "Correct position" when the step was misplaced. The `li` carries `aria-describedby` because a step has no control in feedback.                                                                                                                                                             |
| Bowtie                            | a slot in the diagram  | **Directly beneath each column's slots**, one entry per filled slot in slot order. Each is keyed by the choice id in the slot and named after that choice, and the slot button points at it. An explanation inside a slot would push the connector lines off their slots. A right choice the student left out is explained after the column's "Correct:" line. |

When several explanations share one place (two phrases in one cell or sentence, or a bowtie column), the new `ElementRationaleList` names each one after its element. There is no new motion. `ElementRationale` has none by design (#39), so the reduced-motion behaviour is unchanged.

## Other changes

- **Fixtures.** The canonical fixtures of all six types now carry `rationale.perElement`, keyed by span, blank, step or choice id. The content is fictional, consistent with each answer key, and written in the same clinical register as each fixture's general rationale.
- **Bowtie authoring** (`fix(authoring)` commit). The bowtie form dropped `rationale.perElement`, so opening and saving a bowtie lost it, and the fixture round-trip test would fail. The form now carries it through untouched, as the drop-down table form already does. The editor cannot edit it yet.

## How verified (local; Actions is down)

- `pnpm typecheck`: clean. `pnpm lint`: clean.
- `pnpm vitest run src/components/question src/lib/ngn`: 28 files, 525 tests pass. `src/lib/authoring src/components/authoring` also pass. New tests:
  - `src/components/question/inlineRationale.test.tsx` covers each renderer in feedback mode. The explanation sits beside its element, and the control's accessible description resolves to it. Ids are unique and every `aria-describedby` target exists. Nothing renders while the item is open, and each renderer shows nothing in answer or review mode even when handed rationale.
  - `highlight/sentences.test.ts` tests the sentence splitter.
  - `bowtie.test.ts` tests the per-choice rationale carried through a stored draft.
- `pnpm build`, then Playwright against `pnpm start` (`PLAYWRIGHT_BASE_URL`) at 375, 768 and 1280:
  - `e2e/feedback.spec.ts`: 21 passed. The new cases answer each canonical fixture and submit, then check that the explanation is visible, that it is the element's accessible description, that the page has no horizontal overflow, and that axe finds no serious or critical issues.
  - `bowtie`, `dragdrop`, `ordered`, `motion`, `gallery-items` and `case-study` specs: 61 passed, 20 skipped (skips are per-viewport by design).
- Screenshots were checked by eye at 375px and 1280px. The bowtie connectors stay on their slots.

**Visual baselines.** No committed baseline should change. `gallery-items` captures answer mode, `feedback-rationale.png` is multiple response, and the case-study fixtures have no `perElement` for these types. The new e2e cases write local screenshots only.

Closes #49

🤖 Generated with [Claude Code](https://claude.com/claude-code)
