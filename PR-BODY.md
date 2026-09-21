# test(db): fail the run when a pgTAP file stops short of its plan

## Summary

While building #161, a draft pgTAP file used `rollback to savepoint` inside the test transaction. That also rolled back pgTAP's own count of tests run. The file printed `# Looks like you planned 12 tests but ran 6`, yet `supabase test db` reported the file `ok` and the suite `Result: PASS`. This PR makes that fail the run, locally and in CI's `db` job.

- **`scripts/pgtap-verdict.mjs`**: a pure `findProblems(output, exitCode)`. It fails a run on a non-zero exit, on no `Result: PASS` line, on the harness markers `Bad plan`, `No plan found` and `Parse errors`, on pgTAP's `Looks like you failed N tests of M`, and on `Looks like you planned N tests but ran M` where N and M differ. Each problem names the file it follows in pg_prove's output.
- **`scripts/test-db.mjs`**: runs `pnpm exec supabase test db` with any arguments passed through, streams stdout and stderr as they arrive, then applies the verdict and exits 1 with a list of reasons. Node 22, no new dependencies. Works on Windows (the `pnpm` shim is started through a shell, as `db-types.mjs` does) and on ubuntu.
- **`pnpm test:db`** in `package.json`. CI's `db` job now runs `pnpm test:db` instead of `pnpm exec supabase test db`.
- **Unit tests** in `scripts/pgtap-verdict.test.ts` (14 tests). The fixtures are trimmed from real runs. `vitest.config.mts` adds `scripts/**/*.{test,spec}.ts` to the `core` project. There were no script tests before this. Coverage still only counts `src/**`.
- **`docs/03-AGENT-WORKFLOW.md`** gets a "Database tests (pgTAP)" section: use `pnpm test:db`, a plan mismatch now fails the run, and there is no `rollback to savepoint` inside a pgTAP file unless no assertions sit between the savepoint and the rollback.

## Repro findings

I ran throwaway files (kept in a scratch directory, not in `supabase/tests`) with `pnpm exec supabase test db <dir>` against the local stack. Supabase CLI 2.117.0 runs pg_prove in a container.

| Shape                                                                                          | pgTAP says                                   | `supabase test db` says                                                  | Exit  |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ | ----- |
| `plan(2)`, one `ok`, `finish()`                                                                | `# Looks like you planned 2 tests but ran 1` | `Parse errors: Bad plan. You planned 2 tests but ran 1.`, `Result: FAIL` | 1     |
| `plan(2)`, one `ok`, no `finish()`                                                             | nothing                                      | `Bad plan`, `Result: FAIL`                                               | 1     |
| `plan(2)`, one `ok`, then `select 1/0`                                                         | nothing (psql stops)                         | `Non-zero exit status: 3`, `Bad plan`, `Result: FAIL`                    | 1     |
| no `plan()`, one `ok`                                                                          | `You tried to run a test without a plan!`    | `No plan found in TAP output`, `Result: FAIL`                            | 1     |
| `plan(4)`, `ok`, savepoint, `ok`, `ok`, rollback to savepoint, `finish()`                      | `# Looks like you planned 4 tests but ran 1` | `Bad plan` (3 `ok` lines for a plan of 4), `Result: FAIL`                | 1     |
| **`plan(3)`, `ok`, savepoint, `ok`, `ok`, rollback to savepoint, `finish()`** (the #161 shape) | `# Looks like you planned 3 tests but ran 1` | **`ok`, `All tests successful.`, `Result: PASS`**                        | **0** |
| `plan(4)`, `ok`, savepoint, `ok`, `ok`, rollback to savepoint, `ok`, `finish()`                | nothing                                      | `ok`, `Result: PASS`                                                     | 0     |

The harness already catches a file that stops early, errors or never plans, because it counts the TAP lines itself. The hole is narrower than the issue first described. pgTAP numbers its `ok` lines from a sequence, which a rollback does not undo, but it keeps the count `finish()` reads in a table, which a rollback does undo. When the assertions inside the savepoint are the last in the file, every `ok` line is printed and matches the plan, so the harness passes. pgTAP's own "planned N but ran M" goes out as a `#` comment, and the harness ignores comments. No assertion was dropped from the output in these runs. But pgTAP's state no longer matched the file, and nothing failed. In the last row the savepoint count is restored correctly by the later assertion, so nothing is wrong and nothing is reported.

## How verified

Everything was run locally. GitHub Actions is down, so CI did not run.

- `pnpm typecheck`: pass. `pnpm lint`: pass, 0 warnings.
- `pnpm exec vitest run scripts`: 1 file, 14 tests passed. `pnpm test:coverage`: 190 files, 2272 tests passed; All files 90.74 statements, 86.2 branches, 89.85 functions, 92.94 lines.
- `pnpm format:check`: the only file flagged is the untracked `.claude/settings.local.json`, which is not part of this change and does not exist in CI.
- **Real suite through the wrapper.** The shared local stack's DB has leftover rows from other work. On it, unmodified `origin/main` already fails `live_aggregates.test.sql` tests 27 and 28 (`have: (33) want: (3)`, `have: (53) want: (2)`). So I started a second, throwaway Postgres-only project (a copy of `supabase/` with its own project id and ports, `supabase db start --workdir <scratch>`), and all migrations and both seeds applied from zero. Against it, `pnpm test:db --workdir <scratch>`: `Files=15, Tests=441`, `Result: PASS`, `test:db: pass (exit 0, Result: PASS, every plan met)`, exit 0.
- **Negative check.** I copied the #161-shape file into that project's `supabase/tests/database/` as `zz_plan_mismatch.test.sql`:
  - Plain `supabase test db`: `Files=16, Tests=444`, `Result: PASS`, **exit 0**, with `# Looks like you planned 3 tests but ran 1` in the output.
  - `pnpm test:db`: same output, then `test:db: FAIL` and `plan mismatch in supabase/tests/database/zz_plan_mismatch.test.sql: planned 3 but pgTAP ran 1`, **exit 1**.
  - After the file was removed, `pnpm test:db` passed again: 15 files, 441 tests, exit 0. The throwaway project was then stopped with `--no-backup`. The shared stack was not touched.
- The plain short-plan file through `pnpm test:db` exits 1 and lists the non-zero exit, the plan mismatch, the `Bad plan` parse error and the missing `Result: PASS`.

Known limits: the wrapper reads pg_prove's text output, so a future CLI that renames `Result: PASS` would fail every run. That is loud, not silent. Arguments are joined through a shell on Windows, so a path with spaces needs quoting.

Closes #163

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01LN21KbCo26YnCKiNKv5pEs
