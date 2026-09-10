# Sprint 0 — Demo

**Goal:** an empty but production-shaped app, deployed, with the scoring engine tested.
**Status:** deployed 2026-09-10.
**Production:** https://learn-tanner-nielsons-projects.vercel.app
**Repo:** https://github.com/tannernielson27/learn

## Demo script (5 steps)

1. Open the production URL. The landing page shows the wordmark and a link to the gallery.
2. Open `/gallery/tokens`. Switch the theme (System / Light / Dark) in the sidebar. Both palettes render; press Play under Motion.
3. Open `/gallery/typography`. Show the stem, options, a nurses' note in the reading face, and the vitals table with H/L tags.
4. Open `/gallery/primitives`. Tab through the tab strip with arrow keys; use the segmented control.
5. In the repo, run `pnpm test:coverage`. 125 tests pass; `src/lib/ngn` is above 90% lines.

## What shipped

- Next.js 16 app, TypeScript strict, Tailwind 4 mapped to design tokens, three fonts.
- `src/lib/ngn`: Zod schemas for all 14 item types and the case study, three scoring models, per-type scorers, `validateItem` / `validateCaseStudy` with warning rules, registry, and sample fixtures (14 canonical + 14 edge items, 1 case study).
- UI primitives: Button, SegmentedControl, Tabs, Surface, ThemeToggle, with tests.
- Gallery shell with tokens, typography and primitives pages.
- CI workflow, PR/issue templates, CODEOWNERS, Husky hooks, commitlint, lint-staged.

## Known gaps

- Vercel Authentication is switched off on the project so phones and the collaborator can open previews without a Vercel login. Re-enable under Project → Settings → Deployment Protection once real class data exists (Sprint 4+).
- Branch protection requires one approval. Until the collaborator has write access, drop it to zero in GitHub → Settings → Branches, then raise it again.
- No Playwright yet; screenshots start in Sprint 1.
- Gallery has no item renderers yet; they arrive in Sprints 1–2.

## Retro

- Background agents stalled twice with no output; the core and gallery were built directly in the main session. Retry agents for Sprint 1 with smaller, single-file stories.
- The pure-core-first order paid off: 115 scoring and schema tests were green before any UI existed.
