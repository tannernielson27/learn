# fix(player): recover from render errors outside the question renderer

**Stacked on #54** (`perf/54-load-renderers-per-type`). It reuses #54's `RendererRecovery` look and copy tone, and its diff includes #54's commits until #54 lands. Rebase onto `main` after #54 merges, then open the PR.

## Summary

Before this branch the only error boundary in the app was #54's, around the question renderer. A render error anywhere else — the student room, the host console, a case study's tabs, EHR panel or step navigation, the authoring editor — took the whole page down to Next's default error screen, in front of a class.

- **One shared panel.** `src/components/recovery/RouteRecovery.tsx` is the same bordered surface as `RendererRecovery`: a heading, the reassurance in `role="alert"`, one Try again. It is only ever given copy. The error's message, digest and stack never reach the screen. Nothing extra is logged: React already reports caught errors through `console.error`, the same as #54. It arrives with the existing `motion-enter` (opacity and an 8px lift), which reduced motion collapses through the tokens. No emoji. Built at 375px.
- **Boundaries.** Each `error.tsx` is a few lines that pass its own copy to the panel:
  - `src/app/play/[sessionId]/error.tsx`: the student room
  - `src/app/live/[sessionId]/error.tsx`: the host console
  - `src/app/author/error.tsx`: every authoring page. It sits inside the authoring layout, so the header and Sign out stay on screen.
  - `src/app/author/case-studies/[caseStudyId]/error.tsx`: the case study builder, with its EHR editor and preview
  - `src/app/author/items/[itemId]/play/error.tsx`: playing an item or a case study (the shell's tabs, EHR and step navigation)
  - `src/app/global-error.tsx`: the root layout. It brings its own `<html>`, `<body>` and `globals.css`. It follows the system theme, because the theme script belongs to the layout that failed.
- **Next 16 conventions, checked in `node_modules/next/dist/docs`.** Error files must be Client Components. Since 16.3 they receive a stable `retry` alongside `reset`, and the docs recommend `retry` for most cases. The props are typed with `ErrorInfo` from `next/error`.

## Rejoining the room

Try again on the student room is `retry`, not `reset`. Next's `retry` runs `router.refresh()` and `reset()` inside one `startTransition` (`next/dist/client/components/error-boundary.js`), so no separate `router.refresh()` is needed.

- **Why not `reset`.** `reset` only clears the boundary and re-renders `StudentRoom` from the RSC payload the router already holds. That payload is the room as it was on first load, however far the host has moved since.
- **What `retry` re-runs.** The server component above the room runs again:
  - it reads the httpOnly participant cookie, which nothing in the browser can change;
  - `resume_participant` turns the cookie back into the same participant row (same id, display name and join time);
  - it reads the room's current state.

  A participant who is no longer valid is sent to the join form, as on any reload.

- **How the channel comes back.** The error unmounted `StudentRoom`. Its cleanup left the Realtime channel and dropped its presence, so the host sees the phone leave. The retried render mounts `StudentRoom` again with fresh props. Its effect reopens the channel and tracks presence under the same participant id, so the roster shows the same single entry again, not a second one. Nobody is asked for a display name.
- **What does not survive.** An answer the student had chosen but not sent lived only in the unmounted component, so it is lost. The copy says so: "Your place in the session is kept. Try again to rejoin the room; an answer you had not sent may need choosing again."

In fairness to `reset`: the participant transport re-reads the room when its channel opens, so a plain `reset` would probably also reach the current item. `retry` is still the right call. It re-checks the participant on the server, and the first paint after recovery comes from the server's current state instead of a stale one.

The reasoning is also in a comment in `src/app/play/[sessionId]/error.tsx`.

## Tests

- `src/components/recovery/RouteRecovery.test.tsx`: the panel shows a level-1 heading and its detail as an alert, and Try again calls `onRetry`.
- `src/app/routeErrors.test.tsx` mounts each `error.tsx` inside Next's own segment `ErrorBoundary`, with an `AppRouterContext` whose `refresh` is a spy, over a page that throws an error with a message, a chunk URL and a digest in it. For all five segment boundaries it checks:
  - the calm message, heading and Try again show, and none of the error text or digest is rendered;
  - Try again calls `router.refresh()` once and renders the recovered page, which is what separates `retry` from `reset`;
  - the student room's copy says the place is kept.

  `global-error` is rendered to static markup and checked the same way.

- `vitest.config.mts`: the `ui` project now also picks up `src/app/**/*.{test,spec}.tsx`, so these tests sit beside the route files. `src/app` stays out of coverage, as before.
- `e2e/routeRecovery.spec.ts` (needs `E2E_AUTH=1`, added to the `auth-e2e` job's list in `ci.yml`). It needs no test-only hook: nothing was added to the app that could be triggered in production. The spec uses `page.route` to answer the phone's first view of the running room with `state: null`, which is what a malformed `/api/live/view` response would look like, and `StudentRoom` cannot render it. Every later request passes through untouched. It checks:
  - the room's boundary heading and alert show, with no error text, and axe passes;
  - the host sees the phone leave (0 phones connected);
  - after Try again: the student is on the same `/play/<id>` URL, back on the item the host moved to, still "Ada Brennan", with no display-name prompt and the same participant cookie value;
  - the host sees 1 phone connected again (presence is keyed by participant id);
  - the student can submit an answer, so the server still accepts this phone as that participant.

## Test plan and results

Run locally, because GitHub Actions is unavailable. The Playwright runs used a production build (`pnpm build`, then `pnpm start --port 3100`) against the local Supabase stack with Realtime, `E2E_AUTH=1` and the local demo account, so one run covers both CI jobs.

- [x] `pnpm typecheck`: pass
- [x] `pnpm lint`: pass
- [x] `pnpm exec prettier --check src e2e vitest.config.mts docs/open-issues.md`: pass
- [x] `pnpm vitest run src/app/routeErrors.test.tsx src/components/recovery`: 2 files, 14 tests pass
- [x] `pnpm vitest run src/app src/components`: 82 files, 459 tests pass
- [x] `pnpm vitest run` (whole suite): 196 files, 2291 tests pass
- [x] `pnpm build`: succeeds
- [x] `playwright test e2e/routeRecovery.spec.ts`: 3 passed (375, 768 and 1280)
- [x] `playwright test` (full suite, every spec, player, live and case-study included): 181 passed, 26 skipped, 0 failed. #54 on the same setup was 178 passed and 26 skipped; the 3 extra passes are the new spec.
- [ ] Not run: `test:coverage`. Screenshot comparisons run only under `CI` against Linux baselines, so they were not compared here; no baseline was changed.
- [ ] After #54 lands: rebase, re-run the checks above, and open the PR.

Closes #164

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01LN21KbCo26YnCKiNKv5pEs
