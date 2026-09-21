## Story

Closes #58 (filed from the Sprint 3 audit, #42). Placing a bowtie choice into a pair's second slot while the first is empty now moves keyboard focus to the slot that actually received it, so a screen reader never lands on a slot that still says "empty".

## The choice: move focus, keep the response shape

The issue offers two fixes: fill the first empty slot and move focus to it, or store slot positions. This PR moves focus. The reasons:

1. **The spec makes the list the correct model.** `docs/01-NGN-ITEM-SPEC.md` 3.14: "Order within a pair does not matter. Key: `{ actionIds[2], conditionId, parameterIds[2] }`. Response: same." A pair is a set of two choices, not two positioned slots. Storing positions would put information in the response that the spec says has no meaning, and the scorer would then have to ignore it.
2. **Changing the shape is a lot of work for no scoring change.** A positional response (`[id | null, id | null]`) changes the Zod schema in `src/lib/ngn/schemas`, the bowtie scoring, the fixtures and their scoring tables (90% coverage gate), the server-side submit path, and every bowtie response already stored in live sessions and assignments. Those rows would need a migration or a dual-read period. The only behaviour it would buy is letting a lone choice sit visibly in slot 2.
3. **The bug is about focus, not about data.** What #58 reports is a keyboard and screen-reader user left on a control that announces the wrong state. Moving focus to where the choice landed fixes that directly. The status message already named the right slot ("placed in Actions to Take 1 of 2").

What it costs: a sighted pointer user who taps slot 2 first sees the choice appear in slot 1. That already happens on `main`. The slots are numbered, and the status region says where the choice went.

## What changed

- `BowtieItem`: `place` returns the slot the choice actually landed in. When a slot tap or keyboard activation lands the choice in a different slot, focus moves to that slot **after** the new response renders, through a ref and an effect keyed on `response`. So the slot's accessible name is already "Actions to Take 1 of 2: <choice>" when focus arrives, never "…, empty". A test records the `aria-label` at the moment of the `focus` event to prove this.
- The mirror case: clearing slot 1 while slot 2 is filled moves the second choice up. Focus stays on slot 1, which now correctly names the moved choice. The status message now says so: "<A> removed from Actions to Take 1 of 2. <B> moved to Actions to Take 1 of 2." Before, a screen-reader user heard that slot 1 was cleared and then found it full.
- Mouse and long-press drags do not move focus. They are pointer-only, and the drop already shows where the choice went.
- `DropSlot` (shared with drag-and-drop cloze) takes an optional `id` so a caller can focus it. Cloze does not pass one, so nothing changes there.
- No change to `src/lib/ngn/**`, the schema, scoring, fixtures or stored data.

## Where focus lands

| Case                                                        | Focus ends on | It announces                              |
| ----------------------------------------------------------- | ------------- | ----------------------------------------- |
| Keyboard: choice armed, Enter on Actions slot 2, pair empty | Actions 1     | "Actions to Take 1 of 2: <choice>"        |
| Tap: choice armed, tap Parameters slot 2, pair empty        | Parameters 1  | "Parameters to Monitor 1 of 2: <choice>"  |
| Slot 1 filled, choice placed in slot 2                      | Actions 2     | "Actions to Take 2 of 2: <choice>"        |
| Both filled, slot 1 cleared (nothing armed)                 | Actions 1     | "Actions to Take 1 of 2: <second choice>" |
| Both filled, slot 2 cleared (nothing armed)                 | Actions 2     | "Actions to Take 2 of 2, empty"           |

## Demo step

On the preview, open `/gallery/items/bowtie`. With the keyboard: Tab to an action choice, press Enter, then Tab to "Actions to Take 2 of 2" and press Enter. Focus jumps to slot 1, which holds the choice. Slot 2 is still empty. With a screen reader on, the slot's name is read with the choice in it.

## Screenshots

No visual change. The committed baselines under `e2e/__screenshots__` capture the untouched initial state, and the focus move happens only after an interaction, so no baseline should change.

## Verification

GitHub Actions is down, so this branch was verified locally only.

- Ran: `pnpm typecheck`, `pnpm lint`, `pnpm format:check` (only complaint: the git-ignored `.claude/settings.local.json`, which is not part of the repo), and `vitest run` on `src/components/question/bowtie` and `src/components/question/dragdrop` (23 passed, 5 new).
- Not run: the full unit suite, coverage, build, Playwright (including the three bowtie screenshots and axe). CI must run these before merge.

## Checklist

- [x] Tests added or updated; coverage gates pass (no `src/lib/ngn` change; coverage not run locally)
- [ ] Works at 375px with touch and at 1280px with keyboard (unit-tested in jsdom; not checked in a browser)
- [x] Reduced motion respected; focus visible (no new motion; focus uses the existing ring)
- [x] Docs updated if the item contract or workflow changed (contract unchanged)
- [x] PR title follows `type(scope): summary`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_016tcmsv8XALsD2G6KRJLYu4
