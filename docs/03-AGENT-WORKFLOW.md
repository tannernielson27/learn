# Building With Agents — Operating Model

How one human plus Claude Code agents ship this roadmap one sprint at a time.

## 1. Roles

| Role               | Who                                                                                                    | Responsibility                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Product owner      | You                                                                                                    | Priorities, accept/reject demos, answer open questions, own the sprint goal                    |
| TPM / orchestrator | Claude (main session)                                                                                  | Break sprint goal into issues, dispatch agents, enforce Definition of Done, run demo checklist |
| Builder agents     | `tdd-guide` → implementer → `code-reviewer` / `typescript-reviewer`                                    | One story per agent, in its own git worktree, one PR each                                      |
| Specialist gates   | `security-reviewer`, `database-reviewer`, `e2e-runner`, `performance-optimizer`, `healthcare-reviewer` | Triggered by story labels (see §4)                                                             |

## 2. Sprint cadence (1 week)

| Day     | Activity                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mon     | Sprint planning: pick stories from the roadmap phase, write/verify GitHub issues, agree the demo script. Orchestrator dispatches parallel agents. |
| Tue–Thu | Build. Each story = branch + PR + preview URL. You review previews on your phone, leave comments; agents iterate.                                 |
| Fri AM  | Merge, deploy `main`, run the demo script on a phone and a laptop, record a 3-minute screen capture.                                              |
| Fri PM  | Retro (5 bullets in `docs/sprints/S<N>-retro.md`), groom next sprint.                                                                             |

## 3. Work item format

Every story is a GitHub issue using this template, with a milestone (`S1`, `S2`…) and labels (`type:item`, `area:player`, `area:authoring`, `area:live`, `gate:security`, `gate:db`, `gate:e2e`).

```
## Story
As an <instructor|student>, I can <do X> so that <Y>.

## Scope
- In: ...
- Out: ...

## Spec references
docs/01-NGN-ITEM-SPEC.md §3.x, docs/04-DESIGN-DIRECTION.md §<n>

## Acceptance criteria
- [ ] ...
- [ ] Works at 375px with touch and at 1280px with mouse + keyboard

## Demo step
"In the gallery, open <Type>, select ..., submit, see score N/M and rationale."

## Definition of Done (do not edit)
- [ ] Tests first: schema + scoring fixtures green (>=90% in lib/ngn), component tests for interaction states
- [ ] Gallery entry added using the canonical fixture
- [ ] Playwright screenshots at 375/768/1280 committed; axe passes
- [ ] Reduced-motion respected; keyboard operable
- [ ] Reviewed by code-reviewer agent; CRITICAL/HIGH resolved
- [ ] Preview URL posted on the PR; PR description includes the demo step
```

## 4. Agent playbook per story type

**Item type story (Phase 1)**

1. `tdd-guide`: write `lib/ngn/schemas/<type>.ts` + `fixtures/<type>.ts` + scoring tests from the spec table. Run red.
2. Implementer: scoring function green; then `components/question/<type>/` renderer against `QuestionShell` contract; gallery entry.
3. `e2e-runner`: screenshot spec at three breakpoints, touch emulation for pointer-heavy types.
4. `code-reviewer` + `typescript-reviewer`: review PR.
5. Orchestrator posts the preview URL and demo step.

**Editor story (Phase 2)**: same, plus `database-reviewer` for any migration and a round-trip test: editor form → JSON → Zod → renderer.

**Live/session story (Phase 3)**: `security-reviewer` mandatory (join codes, RLS, answer-key exposure); load script with 60 simulated participants against the in-memory transport, then against Supabase on a preview.

**Auth/roles story (Phase 4)**: `security-reviewer` + `database-reviewer` mandatory.

**Any story touching clinical content**: `healthcare-reviewer` checks seed items for clinical accuracy and that no real PHI patterns appear.

## 5. Parallelization map

Phase 1 is embarrassingly parallel once Sprint 0 lands the shell, tokens, registry and `QuestionShell` contract:

```
Sprint 0 (serial):  scaffold → tokens → ngn schemas skeleton → QuestionShell contract → registry → gallery
Sprint 1 (parallel, 4 worktrees):
   A: multiple_choice + multiple_response       B: matrix_mc + matrix_mr
   C: dropdown_cloze + dropdown_rationale       D: dropdown_table + multiple_response_grouping
Sprint 2 (parallel, 3 worktrees):
   A: highlight_text + highlight_table          B: dragdrop_cloze + dragdrop_rationale + ordered_response
   C: bowtie                                    (+ D: motion pass after A–C merge)
Sprint 3 (mostly serial): EhrPanel → CaseStudyPlayer → Trend → feedback/review modes → seed content (parallel with a11y audit)
```

Phase 2 editors parallelize the same way. Phase 3 is more serial (transport → session core → dashboard → assignments).

Use `Agent` with `isolation: "worktree"` for each parallel story so agents never collide on files. Merge order: schemas/registry changes first, then renderers.

## 6. Quality gates in CI (`.github/workflows/ci.yml`)

1. `pnpm typecheck` · 2. `pnpm lint` · 3. `pnpm test --coverage` (fails <80% overall, <90% `src/lib/ngn`) · 4. `pnpm build` · 5. Playwright smoke + screenshot diff against the Vercel preview URL · 6. axe on `/gallery/*`.

Branch protection on `main`: PR required, CI green, one approval (you) — agent reviews are advisory, your approval is the human gate.

## 7. Repo `CLAUDE.md` (create in Sprint 0)

Contents: stack + versions, folder rules (`lib/ngn` is pure), the item-type triplet convention, test commands, the Definition of Done, design rules summary (no emoji, motion tokens only, 375px first), and "read `docs/01-NGN-ITEM-SPEC.md` before touching any item type."

## 8. Demo checklist (every sprint)

- [ ] `main` deployed; URL in `docs/sprints/S<N>-demo.md`
- [ ] Demo script (5 steps max) rehearsed on a phone and a laptop
- [ ] Screen recording saved
- [ ] Known gaps listed honestly at the bottom of the demo doc
- [ ] Retro written; next sprint issues created
