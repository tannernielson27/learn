# chore(types): hand renderers the keyless item without a cast

## Summary

- `ItemPlayer` passed its renderer `playerItem as PlayerItem<ItemType> & ItemOf<ItemType>`. The
  intersection claimed `answerKey` and `rationale` were present, when `toPlayerItem` has just
  deleted both outside feedback mode. Both casts on `playerItem` are gone; the renderer and
  `isComplete` now get `toPlayerItem`'s own `PlayerItem<ItemType>`.
- On current `main` the renderer props already type the item as `PlayerItem<T>` (key and rationale
  optional), so each renderer's own view was already safe; the cast was a false claim at the call
  site rather than a hole a renderer could fall through. What was missing was anything that holds
  that line. This adds it.
- New type-level test `src/components/question/types.test.ts`:
  - for every item type, `ItemRendererProps<T>["item"]` has `answerKey` and `rationale` optional;
  - the optional fields keep the schema's own shape;
  - `item.answerKey.correctOptionId` and `item.rationale.general` without `?.` are
    `@ts-expect-error` lines, so `pnpm typecheck` fails if they ever start compiling;
  - `isComplete` receives the same keyless item as the renderer.

No behavior change: only types and a test.

## How verified

- `pnpm typecheck`: clean.
- `pnpm lint`: clean.
- `pnpm vitest run src/components/question src/lib/ngn`: 22 files, 480 tests passed.
- `pnpm vitest run src/components/question/types.test.ts src/components/case-study
src/components/authoring/PlayItem.test.tsx src/components/live/StudentRoom.test.tsx`: 4 files,
  48 tests passed.
- Negative check: changing `ItemRendererProps.item` to `PlayerItem<T> & ItemOf<T>` (the old cast,
  moved into the props) fails `tsc` in `types.test.ts` (both optionality assertions) and at the
  `ItemPlayer` call site.
- Not run here: full `test:coverage`, `build`, and CI (GitHub Actions is unavailable).

Note: putting the old cast back at the `ItemPlayer` call site alone still typechecks. A cast to a
narrower type is always allowed there, and it does not change what a renderer sees, because each
renderer annotates its own props as `ItemRendererProps<"type">`. The test guards the renderer-facing
type, which is what decides whether `item.answerKey.x` compiles inside a renderer.

Closes #50

🤖 Generated with [Claude Code](https://claude.com/claude-code)
