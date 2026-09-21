# perf(player): load each item renderer in its own chunk

## Summary

Every route that could play an item shipped all fourteen renderers, dnd-kit included, because `src/components/question/registry.ts` imported every renderer eagerly. The gallery nav imported `hasRenderer` from that registry, so every gallery page carried them too, even Tokens and Typography.

- **Renderers load per type.** `registry.ts` wraps each renderer in `next/dynamic` with a literal `import()`, so each type gets its own chunk. A multiple choice page no longer loads the bowtie or dnd-kit. `ItemPlayer.tsx` is unchanged, because `RENDERERS[type]` still returns `{ Renderer, isComplete, explainScore }`.
- **Submit never waits on a chunk.** `isComplete` and `explainScore` moved out of the renderer files into `rules.ts`. The pure sentence helpers (`allBlanksFilled`, `blankOrder`, `withAnswer`) moved into `sentence.ts`, and `DropdownSentence.tsx` re-exports them. The lazy boundary holds only the component.
- **SSR stays on.** The server renders the item into the HTML. It streams in the same response, right behind the placeholder, and the chunk is preloaded (`<link rel="preload">`). Checked with `next start` on `/gallery/items/bowtie`. Key stripping is untouched: `ItemPlayer` removes the key and the rationale before any renderer gets props, lazy or not. With `ssr: false`, every student would see the placeholder until the JS ran.
- **Placeholder.** `RendererLoading` is a still, dashed block, `min-h-48`, `aria-busy` with screen-reader-only text. It has no shimmer and no emoji. It is not a live region, so it cannot collide with a page's own status line.
- **Gallery nav.** The nav and the playground read `hasRenderer` from `rendered.ts`, which is a plain `RENDERED_TYPES` list. `registry.ts` re-exports it, so existing imports still work.

## Bundle (First Load JS, gzip)

Measured from `.next` after `pnpm build` (Turbopack does not print route sizes). For each route: the root main files, plus the polyfill file, plus that route's `entryJSFiles` from its client reference manifest, gzipped at level 9.

| Route                                         | Before   | After    | Change   | dnd-kit on first load |
| --------------------------------------------- | -------- | -------- | -------- | --------------------- |
| /gallery (and tokens, typography, primitives) | 199.4 kB | 174.6 kB | -24.8 kB | yes -> no             |
| /gallery/items/[type]                         | 292.3 kB | 270.6 kB | -21.7 kB | yes -> no             |
| /gallery/case-study                           | 297.1 kB | 276.1 kB | -21.0 kB | yes -> no             |
| /gallery/ehr                                  | 215.5 kB | 190.6 kB | -24.9 kB | yes -> no             |
| /gallery/live                                 | 294.5 kB | 269.8 kB | -24.7 kB | yes -> no             |
| /gallery/trend                                | 295.4 kB | 274.5 kB | -20.9 kB | yes -> no             |
| /play/[sessionId]                             | 268.0 kB | 246.4 kB | -21.6 kB | yes -> no             |
| /author/items/[itemId]/play                   | 205.0 kB | 183.5 kB | -21.5 kB | yes -> no             |
| /author/items/[itemId]                        | 296.9 kB | 273.7 kB | -23.2 kB | yes -> no             |
| /author/case-studies/[caseStudyId]            | 302.0 kB | 280.3 kB | -21.7 kB | yes -> no             |
| /live/[sessionId] (host)                      | 338.9 kB | 338.9 kB | 0        | no -> no              |

Before, dnd-kit was one 24.7 kB gz chunk and every page above had it. After, it loads only with the bowtie, ordered response and drag-and-drop renderers.

## Tests

- Added `src/app/gallery/nav.test.ts`, which walks the nav's import graph. It fails if the nav reaches `registry.ts`, any `.tsx` under `components/question`, or `@dnd-kit/*`. A control case proves the walk finds all three from the playground.
- The import walk moved to `src/components/question/testing/importGraph.ts` and now follows `import()`. This matters because `noClientScoring.test.ts` (ADR 0003) would otherwise stop checking the lazy renderers. A new case there asserts that the walk reaches `BowtieItem.tsx`.
- Added `src/components/question/registry.test.ts`, which checks that `RENDERED_TYPES` matches `RENDERERS` and that every entry carries its synchronous rules.
- Component tests now wait for the renderer with `renderersLoaded()` (`waitFor` until the placeholder is gone, with a 10 s ceiling and no fixed sleeps) instead of mocking laziness away. Some editor tests had passed only because an earlier test in the same file had already loaded that renderer; they now wait explicitly.

## How verified

- `pnpm typecheck`: pass
- `pnpm lint`: pass
- `pnpm exec prettier --check src`: pass
- `pnpm vitest run src/components/question src/lib/ngn src/app/gallery src/components/case-study src/components/live src/components/authoring`: 82 files, 863 tests pass
- `pnpm vitest run` (whole suite, twice): 191 files, 2266 tests pass
- `pnpm build` on `origin/main` (d4ae283) and on this branch: both succeed. An earlier attempt on this branch failed with "next/dynamic options must be an object literal" and was fixed.
- `next start` plus a fetch of `/gallery/items/bowtie`: the bowtie's slots are in the HTML and its chunk is preloaded.
- Not run: `test:coverage` and Playwright e2e. CI is unavailable, so the gallery screenshot baselines have not been re-checked.

Closes #54

🤖 Generated with [Claude Code](https://claude.com/claude-code)
