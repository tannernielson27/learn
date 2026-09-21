# perf(player): paint Submit's press before the feedback reveal

## Summary

The #42 audit measured Submit at 264-392 ms and a drag-and-drop placement at 256 ms under 4x CPU throttling. It also found that repeat runs disagreed by up to ten times, so it did not claim an after figure. This branch adds a repeatable measurement, finds where Submit's time goes, and moves the feedback reveal out of the press's frame.

**Root cause (Submit).** In the gallery and the authoring preview, `scoreInProcess` resolves inside the click. The reveal's state updates ran in a microtask while the click was still the current event, so React gave them sync priority. The whole feedback render and commit therefore ran inside the click handler, before the browser could paint the press. At 4x CPU that was about 70 ms of script per Submit, and about 50 ms of it was style and layout forced during the commit: `applyStagger` reads `offsetParent` in a layout effect, and focus then moves to the score panel. The reveal itself is small. On multiple choice it mounts 26 elements (2 staggered feedback marks) into a page of 154. On drag-and-drop cloze it mounts 28 into 149. Node count is not the cost.

**The fix.** In `ItemPlayer.tsx`, the reveal (`setReveal`, `setResult`, `setMode`, `setSubmitting(false)` and the `onSubmitted` callback) now runs inside `startTransition`. The press's urgent update, "Checking your answer", commits and paints first, and the feedback follows in the next frames. `pending` stays set after a successful check, so the answer stays held and a second press sends nothing until Submit is gone. Before, `.finally` released it. A failed check is still urgent: the alert shows and Submit is re-enabled straight away.

Nothing else changes:

- **Answer keys.** The data path is untouched. The key still arrives only with the score, and only the render priority moved.
- **Scoring and Submit enablement.** Both are untouched.
- **Motion.** The stagger, `fade-up` and reduced motion are all untouched.

**Drag and drop.** I could not reproduce the 256 ms. A mouse drop onto a cloze blank or a bowtie slot, and a tap-to-place, measure 24-32 ms at 4x (median) on this machine, before and after. The drop's handlers (dnd-kit's `mouseup` plus the re-render) take about 17 ms at 4x. A drop does re-render the whole player: every slot and chip, and dnd-kit's context. But the page is about 150 elements, so memoizing slots and chips would not move a number that is already a tenth of the budget. I left it alone.

## Measurements

The method is `scripts/measure-inp.mjs` (new), run against `pnpm build` + `next start`:

- **Setup.** Headless Chromium from Playwright, with a fresh browser context per run. Viewport is 375x812; mouse drags run at 1280x800, as the e2e suite does them. CPU throttling is applied through CDP (`Emulation.setCPUThrottlingRate`) after hydration.
- **The INP proxy.** This is the longest Event Timing entry in the interaction (`durationThreshold: 16`). Chrome rounds these to 8 ms. The breakdown columns come from the long-animation-frame entries that overlap it.
- **Press to feedback frame.** This is the time from the press to the frame that paints the score panel, so a slower reveal cannot hide behind a fast INP.

Each figure is 15 runs, reported as median, then p75, then range, in ms. "Before" is this branch's base, #54 (`44a61d5`), built and measured the same way.

### 4x CPU

| Interaction            | Before           | After           |
| ---------------------- | ---------------- | --------------- |
| Multiple choice Submit | 88 / 96 / 72-240 | 24 / 24 / 16-40 |
| Drag-and-drop Submit   | 80 / 88 / 64-120 | 16 / 24 / 16-24 |
| Mouse drop, cloze      | 24 / 32 / 24-56  | 24 / 32 / 24-64 |
| Mouse drop, bowtie     | 32 / 32 / 24-40  | 32 / 32 / 24-48 |
| Tap-to-place, cloze    | 24 / 32 / 24-40  | 24 / 32 / 24-40 |

Here is the breakdown of the multiple choice Submit before the fix: handlers 71 ms, long-frame script 67 ms, of which 51 ms was forced style and layout. After the fix, handlers take 9 ms.

Press to feedback frame is 81 ms before and 80 ms after for multiple choice, and 75 ms before and 79 ms after for drag-and-drop. The feedback arrives no later; the press just no longer waits for it.

### 6x CPU (a slower phone, relative to this machine)

| Interaction            | Before              | After            |
| ---------------------- | ------------------- | ---------------- |
| Multiple choice Submit | 136 / 144 / 128-184 | 32 / 40 / 32-48  |
| Drag-and-drop Submit   | 144 / 168 / 96-200  | 32 / 40 / 24-152 |
| Mouse drop, cloze      | 40 / 40 / 32-64     | 40 / 48 / 32-56  |
| Mouse drop, bowtie     | 56 / 64 / 40-192    | 48 / 56 / 40-120 |
| Tap-to-place, cloze    | 40 / 48 / 32-72     | 40 / 56 / 32-64  |

The 6x drop and tap "before" figures come from an earlier baseline run of the same build. Press to feedback frame at 6x is about 130 ms before and 138 ms after.

### Caveats

- **This machine is faster than the one #42 measured on.** The baseline Submit at 4x is 88 ms here, not 264-392 ms. Every figure here is under the 200 ms target both before and after, apart from single outliers (240 ms at 4x before; 200 ms at 6x before).
- **The fix removes the reveal from the press's frame.** That is the part that scales with a slower CPU. The press itself now costs about a quarter of what it did.
- **No real mid-range phone was used.** Throttling a desktop CPU is not a phone. The numbers are comparable only with each other, on this machine.
- **The rare slow "after" run.** One drag-and-drop Submit at 6x took 152 ms. That is the transition's commit landing before the browser's paint. A transition allows this; it does not prevent it.

### What remains

The reveal still costs about 70 ms at 4x, now after the press's paint instead of before it. Most of that is the first layout of the feedback. On a repeat Submit in the same page, that layout takes about a tenth as long. Traces put roughly a quarter to a third of the first-time cost on the check and cross glyphs: rendering them once in the mono font before Submit made the first layout that much cheaper. That points to font fallback for glyphs the Latin subset of JetBrains Mono lacks. This is an inference, not confirmed. Replacing them with an inline SVG mark would remove that cost, but it is a design change, so I left it out of this PR. On the student path (live sessions, and case studies scored by the server), the reveal arrives with a network response and was never part of Submit's INP. There, the transition only lets the reveal yield to input.

## Tests

- **New:** `ItemPlayer.transition.test.tsx` (3 tests):
  - The reveal and `onSubmitted` happen inside one transition.
  - Submit shows as busy, and a second press sends nothing, until the feedback arrives.
  - A failed check reports straight away, not as a transition.
- **New:** `testing/feedback.ts` adds `feedbackShown()`. It uses `waitFor` until the score panel is on the page and Submit is no longer "Checking your answer", with no fixed sleeps. The ten component test files that read feedback straight after pressing Submit now await it. Under a full parallel run they had failed, because userEvent's `delay: 0` timer and the scheduler's `setImmediate` race.

## How verified

- `pnpm typecheck`: pass
- `pnpm lint`: pass
- `pnpm vitest run src/components/question src/components/case-study src/components/live`: 22 files, 186 tests pass (run three times)
- `pnpm vitest run` (whole suite): 194 files, 2278 tests pass
- `pnpm build`: pass (built three times: before, after, and before again for the final baseline)
- Playwright against the local build (`PLAYWRIGHT_BASE_URL`): `feedback`, `motion`, `dragdrop`, `bowtie` and `ordered` pass. `case-study` "the six steps run end to end" fails at step 2 on all three viewports. It fails the same way on the #54 base without this change, so it is not caused by this PR. `clickAll` counts the matrix's checkboxes before the lazily loaded matrix renderer has arrived. That needs fixing on #54 before it merges.
- Not run: `test:coverage`, the screenshot baselines (CI-only), a real phone.

Closes #55

🤖 Generated with [Claude Code](https://claude.com/claude-code)
