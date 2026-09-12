# Sprint 3 audit: accessibility and performance budgets

Issue #42, 2026-09-12. Run against a local production build (`pnpm build && pnpm start`) of the `chore/42-a11y-audit` branch, which includes the sample label from #41. Scripts and raw output were kept outside the repo; this document is the record.

## Summary

- **Keyboard:** all 14 item types, the six-step case study and the Trend item can be completed with the keyboard alone, and every focused control shows a ring. Found and fixed: focus dropped to the page after Submit, Next step, Back and Results; the fixed submit bar could cover the focused control; scroll containers clipped focus rings.
- **Screen reader:** approximated, not run. See [What was not tested](#what-was-not-tested). Found and fixed: submit results were never announced, step changes moved no focus, feedback on highlight spans sat outside their names, matrix breakdown entries did not name the row, and the feedback panels had no headings.
- **Reduced motion:** passes. Under `prefers-reduced-motion: reduce` every transform is the identity and only an 80 ms opacity fade remains.
- **Performance:** CLS and every desktop number pass. Mobile LCP failed on every gallery route before the fixes because zod, every item schema and every fixture were in the browser bundle. Removing them cut about 100 kB gzipped from every gallery route and more than halved mobile blocking time, but simulated mobile LCP still misses the 2.5 s budget (about 3.0-4.0 s). The remaining weight is React, the router and every renderer with dnd-kit on every route (#54).

## Keyboard

Method: Playwright driving Chromium with `page.keyboard` only (Tab, Shift+Tab, Enter, Space, arrows, Escape) at 1280x800, and the phone record sheet at 375x812. Focus visibility was checked on `document.activeElement` at every stop.

The gallery's own chrome (sidebar, theme toggle, fixture controls) is 25 Tab stops before the first item control on every page; the item-only count is in brackets.

| Type                       | Completed | Tabs to Submit (in item) | Notes                                                        |
| -------------------------- | --------- | ------------------------ | ------------------------------------------------------------ |
| Multiple Choice            | yes       | 27 (2)                   |                                                              |
| Extended Multiple Response | yes       | 32 (7)                   |                                                              |
| Multiple Response Grouping | yes       | 34 (9)                   | Focused checkboxes sat behind the fixed submit bar (fixed)   |
| Matrix Multiple Choice     | yes       | 31 (6)                   |                                                              |
| Matrix Multiple Response   | yes       | 35 (10)                  |                                                              |
| Drop-Down Cloze            | yes       | 28 (3)                   |                                                              |
| Drop-Down Rationale        | yes       | 29 (4)                   |                                                              |
| Drop-Down Table            | yes       | 29 (4)                   | Select focus ring clipped (fixed)                            |
| Highlight Text             | yes       | 31 (6)                   |                                                              |
| Highlight Table            | yes       | 33 (8)                   |                                                              |
| Drag-and-Drop Cloze        | yes       | 34 (9) + 3 Shift+Tab     | Word bank follows the sentence; Escape cancels an armed word |
| Drag-and-Drop Rationale    | yes       | 33 (8) + 3 Shift+Tab     | As above                                                     |
| Ordered Response           | yes       | 30 (5)                   | Focus stays on the Move button after each move               |
| Bowtie                     | yes       | 45 (20) + 5 Shift+Tab    | A pair's second slot cannot hold a choice alone (filed)      |

**Case study:** all six steps completed by keyboard. Flag toggles with Space; Review opens with Enter and reports `aria-expanded`; a review jump moves focus to the step. **Phone record sheet:** Enter opens it with focus inside, the trap held over 25 Tab and 6 Shift+Tab presses, and Escape or Close return focus to the "Patient record" chip. **Trend:** arrow keys move between time points and wrap, focus follows, the status reads "Showing 1200", and the open section is held across times.

## Screen reader (approximation)

Method: Playwright's `ariaSnapshot` of each case-study step, a MutationObserver recording every change inside `aria-live`, `role=status` and `role=alert`, and `document.activeElement` after each action, at 1280x800 and 375x812. This shows what assistive technology is given; it does not show what NVDA or VoiceOver actually say.

| Step                                          | Given before answering                                                                                        | After submit (before fixes)                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1 Recognize Cues (highlight)                  | Seven toggle buttons named by their text; "Sample" label; stem                                                | Focus to page; nothing announced; Correct/Missed outside the button names |
| 2 Analyze Cues (matrix)                       | Table with row and column headers; checkboxes named "finding + condition" on desktop, condition only on phone | Focus to page; breakdown read "Pulmonary embolism +1" three times         |
| 3 Prioritize Hypotheses (drop-down rationale) | Three selects named "Blank 1/2/3 of 3" inside the sentence                                                    | Focus to page                                                             |
| 4 Generate Solutions (SATA)                   | Group "Options"; checkbox names                                                                               | Checkbox names gain Correct/Missed (the best of the six)                  |
| 5 Take Action (ordered)                       | List "Steps in order" with Move up/down buttons; moves announced with the new position                        | Focus to page                                                             |
| 6 Evaluate Outcomes (matrix)                  | As step 2                                                                                                     | Focus to page                                                             |
| Results                                       | Region "Case study results": total and one line per step                                                      | Focus to page; no headings                                                |

The phone record sheet was already right: focus moves into the dialog, the page behind is inert, and Escape or Close return focus to the chip.

## Fixed in #42

| Finding                                                                                    | Severity | Fix                                                                                                     |
| ------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| Focus lost after Submit on every item                                                      | High     | Focus moves to the score panel, which is described by its points                                        |
| Result of a submit never announced                                                         | High     | As above: the focused panel's description is the score                                                  |
| Focus lost after Next step, See results, Back, Results, and a review jump to the open step | High     | Every move the student makes focuses the step group; the step line is no longer a duplicate live region |
| Fixed submit bar covers the Tab-focused control                                            | Medium   | `scroll-padding-bottom` on the page                                                                     |
| Focus rings clipped by scroll containers (tabs, time control, tables, gallery nav)         | Medium   | Padding cancelled by a negative margin gives the ring room                                              |
| Highlight feedback outside the span's name                                                 | Medium   | Feedback is part of the name ("…, Correct")                                                             |
| Matrix breakdown names only the column                                                     | Medium   | Entries read "finding: condition"                                                                       |
| No headings in the feedback panels, review list or results                                 | Medium   | Score, Breakdown, Review and Total are `h2`; Rationale is `h3`                                          |
| zod, every schema and every fixture in the browser bundle                                  | Budget   | Zod-free `labels` and `spans` modules; gallery pages parse on the server and pass one type's items      |

## Performance

Method: Lighthouse 12, mobile (simulated 4x CPU and slow network) and `--preset=desktop`, on localhost, so network cost is understated. JS is the initial load's scripts, gzipped. INP is approximated with Playwright's event timing entries (threshold 16 ms), worst of three, with and without 4x CPU throttling through CDP.

### Before

| Route                 | Mobile score | Mobile LCP | CLS | Mobile TBT | Desktop score / LCP | JS gz  |
| --------------------- | ------------ | ---------- | --- | ---------- | ------------------- | ------ |
| items/multiple_choice | 87           | 3.05 s     | 0   | 324 ms     | 100 / 0.72 s        | 266 kB |
| items/bowtie          | 79           | 3.44 s     | 0   | 490 ms     | 100 / 0.74 s        | 266 kB |
| items/highlight_table | 80           | 3.98 s     | 0   | 344 ms     | 100 / 0.73 s        | 266 kB |
| case-study            | 69           | 4.44 s     | 0   | 633 ms     | 100 / 0.63 s        | 270 kB |
| trend                 | 87           | 3.43 s     | 0   | 247 ms     | 100 / 0.71 s        | 269 kB |

Unthrottled, the observed LCP is about 0.2 s (the stem is server-rendered). The simulated mobile LCP was 85-87% render delay: time to download and run the JavaScript on a slow phone.

INP proxy: option click 24 ms (128 ms at 4x); Submit 40 ms (264-392 ms at 4x); drag-and-drop placement 48 ms (256 ms at 4x).

### After

Build f730d1c. Mobile LCP moved by up to 0.6 s between runs of the same page, so the two routes that looked worse were run three times and are given as ranges.

| Route                 | Mobile score | Mobile LCP  | CLS | Mobile TBT | Desktop score / LCP | JS gz (like for like) |
| --------------------- | ------------ | ----------- | --- | ---------- | ------------------- | --------------------- |
| items/multiple_choice | 87-92        | 3.25-3.80 s | 0   | 88-129 ms  | 100 / 0.67 s        | 166 kB (was 266)      |
| items/bowtie          | 94           | 3.05 s      | 0   | 99 ms      | 100 / 0.68 s        | 166 kB (was 266)      |
| items/highlight_table | 93           | 3.17 s      | 0   | 97 ms      | 100 / 0.62 s        | 166 kB (was 266)      |
| case-study            | 85           | 3.97 s      | 0   | 111 ms     | 100 / 0.66 s        | 170 kB (was 270)      |
| trend                 | 86-92        | 3.22-3.96 s | 0   | 101-143 ms | 100 / 0.64 s        | 169 kB (was 269)      |

"Like for like" leaves out the 38.6 kB `noModule` polyfill, as the before numbers did; with it, Lighthouse counts 204 kB of script transferred (293 kB before). No remaining chunk contains zod or fixture text. The largest are react-dom (70 kB), the app router (43 kB), and the renderers with dnd-kit and scoring (27 kB, on every route).

INP proxy, unthrottled: option click 24 ms, Submit 56 ms, drag placement 32 ms, tap-to-place 16 ms. At 4x CPU the repeat runs disagreed by up to ten times for the same click (72 ms and 720 ms), so no after figure is claimed; the before figures (Submit 264-392 ms) stand, and #55 carries it.

## Against the budgets

| Budget                            | Before                                     | After                                   | Verdict                                          |
| --------------------------------- | ------------------------------------------ | --------------------------------------- | ------------------------------------------------ |
| JS on a gallery route < 300 kB gz | 266-270 kB                                 | 166-170 kB                              | Pass, with room                                  |
| CLS < 0.1                         | 0                                          | 0-0.001                                 | Pass                                             |
| LCP < 2.5 s                       | Desktop 0.63-0.74 s; mobile 3.05-4.44 s    | Desktop 0.62-0.68 s; mobile 3.05-3.97 s | Desktop pass; simulated mobile fail (#54)        |
| INP < 200 ms                      | Unthrottled pass; 4x CPU Submit 264-392 ms | Unthrottled pass; 4x inconclusive       | Fail on a slow phone until shown otherwise (#55) |
| axe serious or critical: none     | None                                       | None (CI)                               | Pass                                             |

## Filed, not fixed

| Issue | Finding                                                                                                                                                      | Why not in #42                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| #54   | Every gallery route ships all 14 renderers and dnd-kit (~27 kB gz with scoring)                                                                              | Lazy-loading renderers changes the registry contract every renderer module uses |
| #55   | Submit and drag-and-drop placement over 200 ms at 4x CPU                                                                                                     | Needs profiling of the feedback reveal on a real mid-range phone, not a guess   |
| #56   | Scoring code and answer keys are in the client bundle                                                                                                        | Architectural; belongs with per-step key delivery (#46) before live sessions    |
| #57   | Three font families against a two-family guideline                                                                                                           | A design decision, and not the cause of any failing budget                      |
| #58   | A bowtie pair's second slot cannot hold a choice alone; focus left on an "empty" slot                                                                        | Known since Sprint 2; needs the response shape to record slot positions         |
| #59   | A disabled Submit cannot say why                                                                                                                             | Moving to `aria-disabled` changes behaviour across every item's tests           |
| #60   | Smaller screen-reader findings (phone matrix names, doubled option labels, ordered feedback wording, dnd-kit's empty live region, generic "Question" region) | Low severity; batched                                                           |
| #61   | No real NVDA or VoiceOver run                                                                                                                                | Needs a person with the screen readers and devices                              |

## What was not tested

- **A real screen reader.** No NVDA or VoiceOver run was possible here; one is filed. Speech order, whether a status created with its text is announced, and how browse mode treats the disabled highlight buttons are all unverified.
- Firefox and Safari; the 768-1023 px drawer layout; the native select picker; dark-theme ring contrast; edge-case fixtures; single items at phone width.
- Real devices and a real network: every number here is from localhost with simulated throttling.
