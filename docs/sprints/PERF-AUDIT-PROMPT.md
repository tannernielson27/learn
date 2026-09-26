# Structure and performance audit: a looping prompt

Run it in a fresh Claude Code session from the repo root:

```
/loop Read docs/sprints/PERF-AUDIT-PROMPT.md and follow the "Orchestrator prompt" section in it.
```

Every wake-up re-reads this file and picks up where the last one left off. The state lives in `docs/perf-audit.md` and on GitHub, not in the session.

## Orchestrator prompt

You are the orchestrator for a **conservative** structure and performance pass over LeaRN, a Socrative-style live learning app for the Next Generation NCLEX. v1 is code complete (Sprints 0–11). The goal is measurable wins with small, safe diffs, not a refactor. When in doubt, leave it out and write it down instead.

You run under `/loop` in dynamic mode. Each turn does the next useful step, then schedules the next wake-up.

### Every wake-up, first

1. `git fetch origin`, then `git switch main && git pull --ff-only`.
2. If `docs/perf-audit.md` does not exist on `main` and no PR adds it, you are in **Phase A**. Otherwise read it: its findings table is the source of truth for status.
3. `gh pr list --state open` and `gh issue list --milestone "Perf: conservative pass" --state all`.
4. Work out the phase and do its next step. Never redo finished work: check that a PR is merged or an issue is filed before acting.

### Read once per session, before acting

- `CLAUDE.md` and `AGENTS.md`. This Next.js 16 differs from your training data; read `node_modules/next/dist/docs/` before relying on any caching, rendering or bundling behavior.
- `docs/04-DESIGN-DIRECTION.md` (motion and perf rules), `docs/05-VERSION-CONTROL-AND-DEPLOY.md` §7.2 and §7.9 (migrations; the Sentry bundle measurement method), `docs/audits/S10-security.md`, `docs/sprints/BUILDER-BRIEF.md`.
- Your memory index (MEMORY.md), especially memory pressure, branch aging, verifying gates on the response, and the S11 owner decisions.

### Hard limits (these override any finding)

- **Behavior does not change.** Same output, same UI, same data, same errors. A finding that needs a product decision is written down, not built.
- **No dependency adds, removals or upgrades.** No new libraries, including build or analysis tools. Measure with what is installed: `pnpm build` output and manifests, `gzip`, Playwright, `EXPLAIN`, the browser's own timings.
- **Security surfaces are out of scope for changes:**
  - RLS policies;
  - grants;
  - security-definer functions;
  - the answer-key and scoring path;
  - rate limits;
  - auth;
  - the Realtime channel.

  You may note a finding there. Never build it in this pass.

- **Small diffs.** Aim for under about 150 changed lines of non-test code per PR, and one concern per PR. No renames or moves across the tree. No new abstractions unless the finding is the duplication itself, and even then only when it removes real work.
- **Migrations:** only additive, index-only migrations (`create index concurrently` is not available in a migration transaction, so a plain `create index if not exists`), backed by an `EXPLAIN` before and after on the local stack with realistic row counts.
  - Name them `2026MMDDHHMMSS_perf_<what>.sql`, handed out in merge order.
  - A PR with a migration is **held after it goes green**, until the owner can run the hosted push straight after the merge. The auto-mode classifier refuses Claude's `supabase db push`.
  - Give the owner the exact command, anchored at the repo root: `! cd /c/Users/wildd/Desktop/LeaRN && pnpm exec supabase db push --yes`, after your own `--dry-run` shows only the expected file.
- **Every fix proves itself with a number.** Before and after, measured the same way, in the PR body. If the after number is not better, or the gain is noise, close the PR unmerged and record "no gain" in the audit doc. That is a fine outcome.
- Do not use AskUserQuestion. Take the conservative option and write it under "Decisions" in `docs/perf-audit.md`.

### Phase A: audit (read-only), then file

Delegate the reading to one `general-purpose` agent (`isolation: "worktree"`), or do it yourself, but **change no code in this phase**. Cover:

1. **Structure.**
   - Map `src/app` routes: server versus client components, where the `"use client"` boundaries sit, and which heavy modules each client bundle pulls in.
   - Look for code duplicated across features that forces duplicate work at runtime. Duplication that only offends taste is out of scope.
   - Check that `src/lib/ngn/**` stays pure.
2. **Bundle.**
   - Run `pnpm build` twice with nothing changed, to learn the noise floor.
   - Record each route's first-load JS, gzip, from the build manifests, as docs/05 §7.9 did for Sentry.
   - Flag large client-only imports that could load per route or lazily, such as item renderers, the EHR panel and charting. #54 already made item renderers load per type; check what remains.
3. **Rendering and data.**
   - Look for server-side request waterfalls: sequential `await`s that could be `Promise.all`.
   - Look for missing or over-broad `select` columns, N+1 queries in loops, and repeated reads of the same row in one request.
   - Check caching that Next 16 supports and the app does not use, but only where the data is not per-user. Never cache anything keyed to a student or carrying an answer key.
4. **Database.**
   - On the local stack with the seed plus a realistic volume (script it in the scratchpad, not the repo), run `EXPLAIN (ANALYZE, BUFFERS)` on the hot queries: the author home, the bank page, the student home, the live console, the practice route, and the report pages.
   - Flag sequential scans on tables that will grow, and missing indexes on foreign keys used in `where` and `join`.
5. **Client runtime.**
   - Look for obvious re-render storms in the live console and the student room: state that changes every tick at the top of a big tree, and unstable props into memoized children.
   - Look for timers and subscriptions not cleaned up.
   - Measure with the React profiler or `performance.now()` marks in a local-only harness; never commit instrumentation.
6. **Assets.** Check fonts (preload choices, per docs/04 §2), images without dimensions, and anything render-blocking.

Write `docs/perf-audit.md` with:

- the method and the noise floor;
- the baseline numbers table;
- a findings table with these columns:
  - `#`;
  - Area;
  - Finding;
  - Evidence (a file and line, or a measurement);
  - Proposed change (one line);
  - Expected gain;
  - Risk (low, med or high);
  - Build? (yes, no, or later);
  - Status;
- a Decisions section;
- an "Out of scope, noted only" list.

**Build only rows that are low risk, behavior-preserving and measurable.** Everything else is "no" or "later", with the reason.

Then:

- create the milestone "Perf: conservative pass";
- file one issue per "yes" row, in the docs/03 template, with the before number and the measurement command in the body;
- open `docs/perf-audit.md` as a docs PR, `docs: a conservative structure and performance audit`, adding this prompt file too if it is not on `main` yet;
- merge the PR when it is green.

### Phase B: build, one fix at a time

Order the "yes" rows by expected gain divided by risk, highest first. Then for each:

1. **Launch one builder** with the Agent tool: `subagent_type: "general-purpose"`, `isolation: "worktree"`, `run_in_background: true`. The prompt must:
   - name the issue and the branch (`perf/<n>-<summary>`);
   - include the hard limits above, verbatim;
   - require reading `docs/sprints/BUILDER-BRIEF.md` first;
   - require the before and after measurement, same method, in the PR body;
   - require code-reviewer, plus typescript-reviewer for TS or database-reviewer for SQL, with CRITICAL and HIGH resolved;
   - say to push first and report second;
   - end commits with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, and end the PR body with the 🤖 Generated with Claude Code line.

   **One builder at a time**, because memory on this machine is tight. Only one may use Docker or `pnpm build`.

2. **When it reports:**
   - read the diff yourself;
   - confirm the behavior is unchanged: the existing tests pass, no test changed its expectations, and nothing about keys, RLS or auth moved;
   - check the numbers are real, above the noise floor.
3. **Rebase and add the docs commit.** Rebase on `origin/main`, then add one docs commit that flips the row's Status in `docs/perf-audit.md` to "Merged (#PR), <before> → <after>".
   - Keep the table's widest cell stable: pad the new status to the old width, so prettier does not re-pad the table and conflict with every other open docs commit.
   - Push with plain `git push --force-with-lease` (never `rtk git push`) and verify with `git ls-remote`.
4. **Wait for CI** in the foreground: `timeout 590 gh pr checks N --watch --interval 60`, one call per turn. A full run is about 25 minutes. Read failures with `gh run view <id> --log-failed` and the Playwright error context before blaming the code; infrastructure flakes get a rerun.
5. **Merge when green and up to date:** `gh pr merge N --squash --delete-branch`. The branch rule refuses a PR that is behind `main`, so rebase and rerun first. A PR with a migration waits for the owner, as above.
6. **Remove the worktree** in the background with PowerShell: `git worktree unlock`, then `git worktree remove --force`, then `Remove-Item -LiteralPath "\\?\<path>" -Recurse -Force`, then `git worktree prune`.
7. **Start the next builder.**

### Phase C: close

When every "yes" row is merged, closed as "no gain", or held for the owner:

- Add a summary section to `docs/perf-audit.md`: the baseline and final numbers per route and per query, what did not pay off, and the "later" list with reasons.
- Open it as a docs PR and merge it when it is green.
- Update your memory with a project file and an index line.
- Do not close the milestone; the owner does.
- End the loop with `ScheduleWakeup` `stop: true`.

### Pacing

End every turn with `ScheduleWakeup`:

- about 900 s while a builder or CI is running;
- about 1800 s when waiting only on a builder's report or on the owner.

Use `noop: true` when nothing changed. Builders notify on completion; do not poll them.

### Environment gotchas (Windows)

- Git Bash through the Bash tool; PowerShell for long-path deletes.
- Write files with the Write or Edit tools. Never `Set-Content` or `Out-File`, which add a BOM. Never write JS containing regex backslashes through a bash heredoc, which strips them; use the Write tool.
- Commit and PR text go in scratchpad files: `git commit -F`, `gh pr create --body-file`. commitlint rejects long headers.
- The ci.yml e2e spec list conflicts on most rebases: keep both sides.
- The Supabase CLI is linked in the repo root only, not in worktrees. Read-only checks use `pnpm exec supabase db query --linked "<select>"`.

### Talking to the owner

Keep turn-end messages to two or three lines of plain status. Anything the owner must decide or run goes into `docs/perf-audit.md` under "Owner", with exact commands.
