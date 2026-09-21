# Sprint 7 — Demo

**Goal:** session core — a production database of its own, scoring moved off the client, and a live room: a six-character join code, a QR join with no account, a lobby with presence, and a phone answering a live item.
**Status:** code complete 2026-09-20. Stories #127, #56, #46, #128, #130, #134, #129, #131, #132 and #133 merged; `main` at 78f9c0a.
**Production:** https://learn-tanner-nielsons-projects.vercel.app
**Repo:** https://github.com/tannernielson27/learn

> **This demo does not run on production until the owner actions below are done.** Four live migrations are unapplied, and the seven Sprint 6 migrations are still outstanding. Until `20260919110000_start_step_and_rate_limits` lands, production refuses every save, publish and import.

## Demo script (5 steps)

Sign in with **Use the demo account** — no email needed. You need the laptop and three phones on the same room code.

1. **Start a room.** Open a bank with a published item and press **Start a live session**. A six-character code appears on the console, in two groups of three, from an alphabet with no O/0 or I/1. A QR code beside it encodes the join URL.
2. **Join from three phones.** Scan the QR, type a display name, and land in the lobby. No account, no email. Each phone appears in the instructor's roster within a second, with a live count. Put one phone to sleep: it greys out as **Away** and keeps its place rather than vanishing.
3. **Start the room.** Press **Start**. All three phones move to the SATA together. Answer on two of them; the console's count moves to **2 of 3 answered** without a reload.
4. **Reload and pause.** Reload the third phone mid-answer — it comes back on the same item with its answer intact, as the same participant, not a duplicate in the roster. Answer it. Press **Pause**: the item leaves the phones. Press **Resume**: it returns, half-finished answers still there.
5. **Reveal and end.** Press **Show answer**. Every phone that answered sees the key and the rationale; the key never reached any of them before this moment. Press **End**: the room closes and the code stops resolving. It cannot be reopened.

## What shipped

| PR   | Issue | What                                                         | Commit  |
| ---- | ----- | ------------------------------------------------------------ | ------- |
| #136 | #127  | Split production onto its own Supabase project (ADR 0006)    | b0671d6 |
| #137 | #56   | Move scoring off the client                                  | 880c6ef |
| #138 | #134  | Rate limit sign-in per IP                                    | c7f8ce5 |
| #143 | #46   | Deliver case study answer keys per step, at reveal           | 08a311c |
| #142 | #128  | A session model with a six-character join code               | 50fc8ca |
| #145 | #130  | A `LiveSessionTransport` interface with an in-memory adapter | 3dba70d |
| #148 | #131  | The Supabase Realtime adapter                                | 298756f |
| #147 | #129  | Join a session with a display name and no account            | 62e9632 |
| #150 | #132  | Lobby with presence and instructor-paced mode                | 4f147e9 |
| #151 | #133  | Answer a live item from a phone                              | 78f9c0a |

- **One scoring path.** `src/lib/ngn/submit.ts` holds `scoreSubmission`, the only entry point, with `parseSubmission`, `toKeylessItem`/`toKeylessCaseStudy` and `ScoreReveal`, which carries a key _with_ a result. Both players take an injected submit handler, so a live-session handler and the gallery's in-process one are the same seam. `noClientScoring.test.ts` walks the real import graph from both players to prove the engine no longer reaches a student bundle.
- **Keys arrive per step, at reveal.** `CaseStudyPlayer` used to take a parsed `CaseStudy`, so all six answer keys sat in the client tree from mount. It now accepts keyless items, and a step's key arrives with its result. Pairing a keyless case study with an in-process scorer is a compile error, not a convention.
- **The session model is a database invariant.** Code generation and collision retry live in `start_session`; uniqueness holds among rooms that have not ended, so codes are reusable afterwards. A trigger refuses every invalid transition, and no update of any kind is allowed on an ended row, which is what makes reopening impossible. Resolving a code is limited to 60 **failed** lookups per address per 5 minutes — only misses count, so a correct code always resolves and a script cannot lock a class out of its own room.
- **Two adapters, one suite.** `describeRoomConformance` runs the same tests against both the in-memory and the Supabase adapter. The in-memory one drives the gallery's fake room with no database at all.
- **`src/lib/live/` is pure**, enforced by `purity.test.ts`, which scans every file for React, Next and Supabase imports including dynamic ones. The Supabase adapter therefore lives in `src/lib/liveSupabase/`, and the dependency runs one way.
- **Answer keys, checked on the wire.** `supabaseRoom.test.ts` records every byte a participant's process receives — each HTTP body and each channel frame — and asserts over the log, not over objects: no `answerKey`, `correctOptionId`, `rationale`, `points` or `maxPoints` before reveal, and no aggregate ever on a participant channel.
- **Free-tier budget, asserted by a test.** 60 participants × 20 items is 81 server-side row changes and about 4,550 messages per session, so roughly 440 sessions inside 2M/month; 61 connections is 31% of the 200 cap. 1,200 recorded answers cost zero extra messages, because aggregates are pushed once per item change (ADR 0002).
- **Migrations:** `live_sessions`, `live_responses_and_aggregates`, `session_participants`, `resume_participant_joined_at`.

## Known gaps

- **The hosted databases are behind the repo, and this demo does not run on production until they are caught up.** See the owner actions below.
- **Only a phone that answered sees the key at reveal.** `ItemPlayer` marks a key against an answer, and a quiet phone has none, so it sees "The answer is showing." Deliberate Sprint 7 cut.
- **No per-item result views.** The host sees "N of M answered" and nothing per option, for every item type. Demo 7's SATA is correct end to end; everything else degrades to that count. Sprint 8.
- **Presence can be forged** ([#149](https://github.com/tannernielson27/learn/issues/149)). Anyone with the publishable key and a session id can put an ordinary-looking name in the roster. It reaches nothing else — no item, key, answer or row — and the roster caps at 400, keeping connected phones first. Closing it needs a private Realtime channel, which needs a per-participant credential; now unblocked, since #133 left exactly one participant identity.
- **`POST /api/live/view` has no rate limit** ([#152](https://github.com/tannernielson27/learn/issues/152)), where submit is capped at 120 per participant per 5 minutes. Every call also writes `last_seen_at`, and #132 made renders more frequent.
- **The gallery still ships answer keys to the browser** ([#146](https://github.com/tannernielson27/learn/issues/146)). ADR 0003 allows it because the gallery has no students, but nothing stops those routes loading on production, and the surface grew again this sprint.
- **Realtime from the `live` schema is verified locally, not on hosted.** `session_public_state` sits in a non-exposed `live` schema so session ids cannot be listed through the Data API. CI's `auth e2e` job now starts Realtime and drives join → Start → reveal → pause → resume → end against the local stack, so the wire is exercised — but never yet against a hosted project. If it does not work there, the fallback is broadcast-from-database (`realtime.send`) in the same trigger: one changed call plus two subscriptions.
- **A per-IP sign-in limit still allows ~360 unsolicited emails an hour to one address** ([#139](https://github.com/tannernielson27/learn/issues/139)): it counts the caller, not the recipient.
- **`KeylessItem`'s omit list is hand-written** ([#144](https://github.com/tannernielson27/learn/issues/144)). Correct against all fourteen schemas today; a fifteenth type with a new answer-bearing field would leak it and the structural test would still pass.
- **The scoring-engine-out-of-student-bundles rule is a test, not a lint rule** ([#140](https://github.com/tannernielson27/learn/issues/140)), because a `config-protection` hook blocks `eslint.config.mjs`. Two stories hit that hook this sprint.
- **Carried forward:** #49, #50, #54, #55, #57, #58, #59, #60, #61, #67, #123.
- **Not run locally all sprint:** full coverage, the production build and the full e2e suite. CI stayed the real gate.

## Owner actions before this demo runs on production

1. **Create the production Supabase project and replay it** — `docs/05-VERSION-CONTROL-AND-DEPLOY.md` §7.3. `seed.sql` before the demo user; never run `seed-demo.sql` against a hosted project.
2. **Catch up `vauokqoyvewtzubqajgh`** (now the preview database) with the seven Sprint 6 migrations, in order, starting with `20260916000000_bank_folders` to confirm.
3. **Apply the four live migrations to both projects:** `20260919170000_live_sessions`, `20260920130000_live_responses_and_aggregates`, `20260920140000_session_participants`, `20260921000000_resume_participant_joined_at`.
4. **Do not add `live` to the exposed schemas** in either project. That one dashboard setting is what keeps the session-state mirror off the Data API.
5. **Consider raising the production project's auth rate limits.** Supabase's default is 30 sign-ins per five minutes and it applies to the deployment's egress address as a whole, not per student — that, and not #134's per-IP limit, is what constrains a classroom behind one NAT.
6. **Nothing to set for `LIVE_PARTICIPANT_SECRET`.** #131 shipped it as a placeholder and #133 deleted it. If it was set anywhere, remove it.
7. **Accept the Sprint 6 demo** so milestone 6 can close.

## Retro

- **The sprint's one real defect was an integration gap, not a bug in any PR.** #129 and #131 were built in parallel and shipped two participant-identity schemes — a cookie and an HMAC bearer token — with nothing converting one into the other, so a room could be joined, watched and ended but never answered. Both PRs were internally correct, and #131 documented the seam deliberately. It was found by reading `origin/main` after both merged, not by any test or review, because no test spanned the two. When two parallel stories each define half of a contract, something has to check the join.
- **Ordering hazards are mechanical and keep recurring.** #129's migration sorted before #131's the moment #131 merged first, and had to be renumbered; #130's new gallery nav entry stale-dated all 65 visual baselines at once, failing every gallery route rather than the new one. Both are known, both are written down, and both still cost a CI cycle. They want a pre-push check, not another retro bullet.
- **A green check list is still not a green PR.** Branch protection requires an up-to-date head, so every merge cost a rebase and a full ~11-minute CI cycle, serially. That, not build time, set the sprint's pace.
- **Agents that verified rather than obeyed were right again.** #131 disproved its own migration comment about `session_public_state` being unlistable and moved the table to a non-exposed schema; #133 verified a reviewer's HIGH about a channel that failed before its first subscribe — a phone whose socket came up a second late would have sat on the server's first paint all class. #134 retracted its own rate-limit reasoning when three reviewers showed Supabase's per-IP limit applies to the deployment's egress address, not the student's.
- **Two agents were lost to limits mid-flight.** One hit the account session limit and died between its migration replay and its push; the machine's memory reaper killed seven background CI watchers while the session was idle. Both were recoverable because the work was committed and pushed, and because CI, not a local run, was the gate. Running two builders at a time held; six did not, in Sprint 6.
