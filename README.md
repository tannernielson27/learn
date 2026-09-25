# LeaRN

Live learning platform for the Next Generation NCLEX: exam-faithful item types, fast authoring, live sessions and take-home practice.

## Getting started

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000. The internal component gallery lives at `/gallery`.

To run the local Supabase stack, make a change, and open a PR, follow [CONTRIBUTING.md](CONTRIBUTING.md).

## Scripts

`pnpm check` runs everything CI runs: typecheck, lint, format check, tests with coverage, build.

## Docs

- `docs/00-ROADMAP.md` — plan and sprints
- `docs/01-NGN-ITEM-SPEC.md` — item types, data shapes, scoring
- `docs/02-ARCHITECTURE.md` — stack and structure
- `docs/03-AGENT-WORKFLOW.md` — how we build with agents
- `docs/04-DESIGN-DIRECTION.md` — visual system
- `docs/05-VERSION-CONTROL-AND-DEPLOY.md` — branches, PRs, deploys
