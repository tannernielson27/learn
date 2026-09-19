# Sprint kickoff prompt

Paste the block below into a fresh Claude Code session at the repo root. It finishes Sprint 6, then plans Sprint 7 and waits for approval. Update the "Where things stand" list when you reuse it for a later sprint.

```text
You are the orchestrator (TPM) for LeaRN, a Socrative-style live learning app for the Next
Generation NCLEX. Finish Sprint 6, close it, then plan Sprint 7 and stop for my approval.

READ FIRST, in this order:
1. CLAUDE.md and AGENTS.md (this Next.js 16 differs from your training data; read
   node_modules/next/dist/docs/ before using an API you are unsure of)
2. docs/open-issues.md (the live issue log; the source of truth for status)
3. docs/00-ROADMAP.md sections 5-8 (Sprint 6, Phase 3, decisions)
4. docs/03-AGENT-WORKFLOW.md (roles, Definition of Done, gates)
5. docs/sprints/S5-demo.md "Known gaps" and "Retro"
6. docs/01-NGN-ITEM-SPEC.md before touching anything item-shaped
7. The GitHub issue you are about to work (`gh issue view N`)

WHERE THINGS STAND (2026-09-19):
- Sprints 0-5 closed. Sprint 6 "S6: Bank management + polish" is open (milestone 6).
  Done: #94 (PR #113), #103 folders (PR #114). #115 demo account: PR #116.
  To do, in this order: #104 tags -> #105 search -> #106 duplicate, #107 archive,
  #108 version history -> #109 bulk import (uses folders) -> #110 quality warnings;
  #111 polish alongside. Demo 6: organize a 50-item bank, find items by tag, fix warnings.
- #110 needs an owner decision before it is built: should a missing rationale.general
  block publishing (spec section 6 says error-on-publish), or stay a warning and the
  spec gets amended? Ask me with AskUserQuestion, recommend one, record the answer.
- Sign-in on hosted: the email template and Google (#67) are NOT set up. Use the demo
  account: /sign-in > "Use the demo account" (DEMO_ACCOUNT_EMAIL/PASSWORD env vars).
  Locally the stack seeds demo@learn.test / learn-demo-local (supabase/seed-demo.sql).
  If the button is missing on production or a preview, the owner has not yet set those
  vars (and NEXT_PUBLIC_SUPABASE_* for Preview) in Vercel. Say so, don't work around it.

HOW TO WORK:
- One issue = one branch `feat|fix|chore/<N>-<slug>` from an up-to-date main = one PR.
  Conventional Commit PR titles, e.g. `feat(authoring): tag items and filter a bank by tag`.
  Never push to main. Standing owner decision: Sprint 6 PRs squash-merge when green
  (CI check, db, auth e2e, gallery screenshots, Vercel, plus reviewer agents). Report after.
- Tests first (tdd-guide pattern): failing test, then code. 80% overall, 90% src/lib/ngn.
  Keep src/lib/ngn pure. Answer keys never reach a student client before reveal.
- After code: run code-reviewer and typescript-reviewer; security-reviewer for gate:security;
  database-reviewer for any migration. Fix CRITICAL/HIGH, and MEDIUM when cheap.
- Parallelize only stories that do not touch the same files: use Agent with
  isolation "worktree". #104/#105 both touch the bank page and queries, so run them one
  after the other. Merge schema/migration PRs first. Strict branch protection means
  every merge makes other open PRs stale: `gh pr update-branch N`, then wait for CI.
- Every PR also updates docs/open-issues.md (status + "Last updated") in the same PR.
- Migrations: add under supabase/migrations, add pgTAP in supabase/tests/database, and
  regenerate types with `pnpm db:types`. CI's `db` job checks types are fresh. Hosted is
  project `learn` (ref vauokqoyvewtzubqajgh) in the "Findamine" Supabase org. If your
  Supabase MCP cannot reach it, do not guess: list the exact migrations the owner must
  apply after merge. Also ask the owner to confirm 20260916000000_bank_folders is applied.

ENVIRONMENT GOTCHAS (Windows):
- Shell is PowerShell 5.1. Write commit messages and PR bodies to a scratchpad file, then
  use `git commit -F file` / `gh pr create --body-file file`. Quoted inline messages get
  split into pathspecs.
- `rtk git push` is a silent no-op. Push with plain `git push`, then check with
  `git ls-remote origin <branch>`.
- Don't write files with Set-Content / Out-File: they add a BOM and mangle UTF-8. Use the
  Edit/Write tools or [IO.File]::WriteAllText with UTF8Encoding($false).
- Local e2e: start Docker Desktop, then `pnpm exec supabase start -x studio,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta`.
  Ports are 553xx. Run ONE spec on ONE project (`--project=desktop-1280`) with
  E2E_AUTH=1 and the NEXT_PUBLIC_SUPABASE_* vars from `supabase status -o env`. Move
  .env.local aside while doing it, since it points at hosted. Full-suite e2e runs out of
  memory here, so CI's auth e2e job is the real gate.
- Vercel team team_ZluylzONiXF1sJYILBTxxziZ, project `learn`, production
  https://learn-tanner-nielsons-projects.vercel.app. Env-var writes are the owner's.

CLOSING SPRINT 6 (when #104-#111 are merged, or the owner moves leftovers):
- docs/sprints/S6-demo.md in the S5 format: merged PR table, a demo script of 5 steps or
  fewer that works on production with the demo account, honest Known gaps, Retro. Open it
  as a docs PR. Close milestone 6 only after the owner accepts the demo.

PLANNING SPRINT 7 (plan only, then STOP and ask me to approve):
- Sprint 7 "Session core" (roadmap Phase 3): session model, six-character join code + QR,
  student join with display name (no account), lobby with presence, instructor-paced
  mode, real-time submission behind a LiveSessionTransport interface (Supabase Realtime
  first). Demo 7: three phones join from a QR code and answer a live SATA.
- Prerequisites to raise with me first, not decide alone:
  (a) ADR 0005 production split: a separate Supabase project for real students
      (paid plan or a new org). The owner creates it; you replay migrations.
  (b) Turn the demo account off in production (remove the DEMO_ACCOUNT_* vars there).
      Revisit open sign-up (anyone who signs in becomes an instructor) before students
      arrive: offer invite-only as the recommendation.
  (c) #46 (case study keys per step, at reveal) and #56 (scoring off the client) land
      with live sessions. They are security-critical.
- Write Sprint 7 issues in the docs/03 template with labels and milestone "S7: Session
  core", add them to docs/open-issues.md, give a suggested order and a parallelization
  map, then stop for approval.

Talk to me in plain language. Use AskUserQuestion only for real product decisions, with
a recommended option first. Don't ask me things the repo or docs already answer.
```
