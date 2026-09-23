# Open issues

A running log of every open issue, grouped by milestone. Update it when an issue is filed, started, merged or closed.

Last updated: 2026-09-23 (Sprint 8 code complete: every story merged, `main` at 139ae57, demo in `docs/sprints/S8-demo.md`; #197 merged; the hosted project has all 21 migrations).

Status values: **To do**, **In progress** (branch open), **In review** (PR open), **Blocked** (waiting on something named).

## S6: Bank management + polish (milestone 6)

Demo 6: organize a 50-item bank, find items by tag, fix warnings.

| #                                                           | Title                                                                          | Gates             | Status                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------- |
| [#94](https://github.com/tannernielson27/learn/issues/94)   | fix(authoring): keep maxPoints out of the play page until the answer is scored | security          | Merged (#113)                                                              |
| [#103](https://github.com/tannernielson27/learn/issues/103) | feat(authoring): sort a bank into folders                                      | db, e2e           | Merged (#114); confirm `bank_folders` is applied to hosted                 |
| [#104](https://github.com/tannernielson27/learn/issues/104) | feat(authoring): tag items and filter a bank by tag                            | db, e2e           | Merged (#118); apply `20260919000000_item_tags` to hosted                  |
| [#105](https://github.com/tannernielson27/learn/issues/105) | feat(authoring): search a bank                                                 | security, db, e2e | Merged (#121); apply `20260919130000_item_search` to hosted                |
| [#106](https://github.com/tannernielson27/learn/issues/106) | feat(authoring): duplicate an item or a case study                             | db, e2e           | Merged (#120)                                                              |
| [#107](https://github.com/tannernielson27/learn/issues/107) | feat(authoring): archive and restore items and case studies                    | e2e               | Merged (#125); apply `20260919160000_archive_content` to hosted            |
| [#108](https://github.com/tannernielson27/learn/issues/108) | feat(authoring): see an item's version history and restore a version           | e2e               | Merged (#117)                                                              |
| [#109](https://github.com/tannernielson27/learn/issues/109) | feat(authoring): import many files and large sets at once                      | security, e2e     | Merged (#122); apply `20260919150000_import_into_folder` to hosted         |
| [#110](https://github.com/tannernielson27/learn/issues/110) | feat(authoring): show quality warnings in the editor and the bank              | e2e               | Merged (#124); no migration                                                |
| [#111](https://github.com/tannernielson27/learn/issues/111) | chore(authoring): polish carried from Sprint 5                                 | security, db      | Merged (#119); apply `20260919110000_start_step_and_rate_limits` to hosted |

Suggested order: #94, folders (#103), tags (#104), search (#105), then duplicate, archive and history, then bulk import (#109, uses folders) and warnings (#110), with #111 alongside.

## S7: Session core (milestone 7)

Demo 7: three phones join a room from a QR code and answer a live SATA; the instructor screen updates in real time.

| #                                                           | Title                                                                   | Gates                       | Status                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| [#127](https://github.com/tannernielson27/learn/issues/127) | chore(infra): split production onto its own Supabase project            | infra, db, security         | Merged (#136); **owner still creates the project and replays** — docs/05 §7.3 |
| [#56](https://github.com/tannernielson27/learn/issues/56)   | chore(architecture): move scoring off the client                        | player, security            | Merged (#137); seam is `src/lib/ngn/submit.ts`                                |
| [#46](https://github.com/tannernielson27/learn/issues/46)   | chore(architecture): deliver case study answer keys per step, at reveal | player, security            | Merged (#143)                                                                 |
| [#128](https://github.com/tannernielson27/learn/issues/128) | feat(live): a session model with a six-character join code              | live, db, security          | Merged (#142); migration to apply                                             |
| [#130](https://github.com/tannernielson27/learn/issues/130) | feat(live): a LiveSessionTransport interface with an in-memory adapter  | live                        | Merged (#145); ADR 0002 review done in the PR                                 |
| [#129](https://github.com/tannernielson27/learn/issues/129) | feat(live): join a session with a display name and no account           | live, security, e2e         | Merged (#147); migration to apply                                             |
| [#131](https://github.com/tannernielson27/learn/issues/131) | feat(live): the Supabase Realtime adapter                               | live, db, security          | Merged (#148); migration to apply                                             |
| [#132](https://github.com/tannernielson27/learn/issues/132) | feat(live): lobby with presence and instructor-paced mode               | live, e2e                   | Merged (#150); migration to apply                                             |
| [#133](https://github.com/tannernielson27/learn/issues/133) | feat(live): answer a live item from a phone                             | live, player, security, e2e | Merged (#151); closed the #129/#131 token seam                                |
| [#134](https://github.com/tannernielson27/learn/issues/134) | fix(auth): rate limit sign-in per IP                                    | auth, security              | Merged (#138); no migration, nothing to apply                                 |

Suggested order: #127 prod split, then #56 and #46 (serial, same scoring path), then #128 session model, #130 transport and #134 sign-in limit in parallel, then #129 join and #131 adapter in parallel, then #132 lobby and #133 live answer one at a time.

Sprint 7 is code complete: every story merged, `main` at 78f9c0a. Demo script, known gaps and retro in `docs/sprints/S7-demo.md`. Milestone 7 stays open until the owner accepts the demo, which cannot run on production until the migrations below are applied.

The one defect the sprint left behind was an integration gap rather than a bug in any PR: #129 and #131, built in parallel, shipped two participant-identity schemes with nothing converting one into the other, so a room could be joined, watched and ended but never answered. #133 closed it by making `LiveRouteDeps.verify` read #129's cookie and deleting #131's HMAC scheme outright.

Parallelization: #132 and #133 both edit the host and student screens — never build them at once. Sprint 6 showed that two agents on one page is where the damage comes from.

## S8: Instructor dashboard (milestone 8)

Demo 8: run a full case study live with a class-sized simulated crowd (load script).

| #                                                           | Title                                                                           | Gates               | Status                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| [#179](https://github.com/tannernielson27/learn/issues/179) | feat(live): count how a room answered each item, per item type                  | live                | Merged (#189)                                                            |
| [#180](https://github.com/tannernielson27/learn/issues/180) | feat(live): show each item's results on the host console                        | live, security, e2e | Merged (#196)                                                            |
| [#181](https://github.com/tannernielson27/learn/issues/181) | feat(live): show the answer and rationale to every phone at reveal              | live, security, e2e | Merged (#195)                                                            |
| [#182](https://github.com/tannernielson27/learn/issues/182) | feat(live): time an item and stop taking answers when it runs out               | live, db, security  | Merged (#191); `20260923010000_item_timer` applied to hosted             |
| [#183](https://github.com/tannernielson27/learn/issues/183) | feat(live): skip an item or go back to one                                      | live, db, e2e       | Merged (#200); `20260923060000_session_goto` applied to hosted           |
| [#184](https://github.com/tannernielson27/learn/issues/184) | feat(live): run a case study live with the patient record on every phone        | live, security, e2e | Merged (#199); `20260923070000_case_study_live_record` applied to hosted |
| [#185](https://github.com/tannernielson27/learn/issues/185) | feat(live): student-paced mode with a live progress board                       | live, db, security  | Merged (#201); `20260923080000_student_paced` applied to hosted          |
| [#186](https://github.com/tannernielson27/learn/issues/186) | feat(live): a session report per student, item and CJMM step, with CSV export   | live, db, security  | Merged (#190); no migration                                              |
| [#187](https://github.com/tannernielson27/learn/issues/187) | test(live): a load script that runs a class-sized crowd through a case study    | live                | Merged (#192); five-participant smoke runs in CI                         |
| [#193](https://github.com/tannernielson27/learn/issues/193) | fix(live): a phone that joins as the host presses Start may miss the first move | live                | Merged (#194)                                                            |
| [#197](https://github.com/tannernielson27/learn/issues/197) | perf(live): one read per host tick for the tally and the results panel          | live                | Merged (#202)                                                            |

Suggested order: #179 distributions (pure) alongside #182 timer; then #180 results on the console; #181 reveal to every phone; #183 skip and go back; #184 case study live; #185 student-paced; #186 report (independent, can run beside any of the above); #187 load script last, against whatever has merged.

Parallelization: #180, #181, #182, #183 and #185 all edit the host console or the phone room (`HostLobby.tsx`, `StudentRoom.tsx`) and the state machine; never build two of them at once. #179, #186 and #187 are mostly new files and can run beside one of them. At most two builders at a time.

Sprint 8 is code complete: every story merged, `main` at 139ae57. Demo script, known gaps and retro in `docs/sprints/S8-demo.md`. Milestone 8 stays open until the owner accepts the demo. Every Sprint 8 migration is already applied to hosted.

Decisions taken at kickoff while the owner was away (2026-09-23), each the conservative option; say if any should change:

1. **Timer expiry closes the item, it does not advance it** (#182). The host still moves the room; an auto-advance can follow if wanted.
2. **Skip means `goto(position)`** (#183): the host can jump forwards or back, and answers already given stay. Reveal clears on every move.
3. **Student-paced reveal is one "Show answers" for the whole set** (#185), not per student on submit. Per-student instant feedback would let the first finisher read keys out to the room.
4. **The console never marks the correct option before reveal** (#180), so projecting the results cannot give the answer away.
5. **Report access is the session's org only** (#186), the same boundary as the bank the session came from.

## No milestone

| #                                                           | Title                                                                                     | Area               | Status                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------ |
| [#115](https://github.com/tannernielson27/learn/issues/115) | feat(auth): sign in to a shared demo account without email                                | auth, security     | Merged (#116); owner creates the hosted demo user                  |
| [#123](https://github.com/tannernielson27/learn/issues/123) | fix(authoring): enforce the authoring rate limit where the write happens                  | authoring, db      | Merged (#160); apply `20260921200000_authoring_limit_at_the_write` |
| [#139](https://github.com/tannernielson27/learn/issues/139) | fix(auth): a per-IP sign-in limit still allows ~360 unsolicited emails an hour            | auth, security     | Merged (#157); no migration; residual risk is #159                 |
| [#140](https://github.com/tannernielson27/learn/issues/140) | chore(lint): forbid scoring-engine imports from student-facing components                 | player             | To do; found on #56; needs the config hook lifted                  |
| [#144](https://github.com/tannernielson27/learn/issues/144) | chore(types): derive KeylessItem's omit list from the item schemas                        | player, security   | Merged (#162)                                                      |
| [#146](https://github.com/tannernielson27/learn/issues/146) | fix(gallery): gate the gallery routes so ADR 0003 has a boundary                          | player, security   | Merged (#156); gate lives in `src/proxy.ts`                        |
| [#149](https://github.com/tannernielson27/learn/issues/149) | fix(live): make the Realtime channel private with a per-participant token                 | live, security     | Merged (#176)                                                      |
| [#152](https://github.com/tannernielson27/learn/issues/152) | fix(live): rate limit POST /api/live/view per participant                                 | live, security, db | Merged (#158); apply `20260921100000_live_view_rate_limit`         |
| [#178](https://github.com/tannernielson27/learn/issues/178) | fix(live): drop the open select policy on live.session_public_state                       | live, security     | Blocked: owner turns off Realtime "Allow public access"            |
| [#154](https://github.com/tannernielson27/learn/issues/154) | fix(test): EditorShell.restore "tells its host while a save is in flight" is flaky        | authoring          | Merged (#155); test-only                                           |
| [#159](https://github.com/tannernielson27/learn/issues/159) | fix(auth): a sustained lockout of one author's only sign-in path is still cheap           | auth, security     | **Owner decision**; filed from #157's review                       |
| [#161](https://github.com/tannernielson27/learn/issues/161) | test(authoring): prove every author-writable table is counted, rather than remembering to | authoring, db      | Merged (#174)                                                      |
| [#163](https://github.com/tannernielson27/learn/issues/163) | test(db): fail the run when a pgTAP file stops short of its plan                          | db                 | Merged (#175)                                                      |
| [#164](https://github.com/tannernielson27/learn/issues/164) | fix(player): recover from render errors outside the question renderer                     | player, live       | Merged (#173)                                                      |
| [#67](https://github.com/tannernielson27/learn/issues/67)   | feat(auth): sign in with Google                                                           | auth, security     | Blocked: owner creates the Google OAuth client                     |
| [#49](https://github.com/tannernielson27/learn/issues/49)   | feat(player): place per-element rationale inline in the pointer-heavy renderers           | player             | Merged (#172)                                                      |
| [#50](https://github.com/tannernielson27/learn/issues/50)   | chore(types): stop casting away the optionality of answerKey and rationale                | player             | Merged (#169)                                                      |
| [#54](https://github.com/tannernielson27/learn/issues/54)   | perf(player): load item renderers per type                                                | player             | Merged (#170)                                                      |
| [#55](https://github.com/tannernielson27/learn/issues/55)   | perf(player): Submit and drop interactions over 200 ms at 4x CPU                          | player             | Merged (#171)                                                      |
| [#57](https://github.com/tannernielson27/learn/issues/57)   | chore(design): three font families against a two-family guideline                         | player             | To do                                                              |
| [#58](https://github.com/tannernielson27/learn/issues/58)   | fix(bowtie): a pair's second slot cannot hold a choice alone                              | a11y               | Merged (#167)                                                      |
| [#59](https://github.com/tannernielson27/learn/issues/59)   | fix(a11y): a disabled Submit cannot say why                                               | a11y               | Merged (#166)                                                      |
| [#60](https://github.com/tannernielson27/learn/issues/60)   | fix(a11y): smaller screen-reader findings                                                 | a11y               | Merged (#168)                                                      |
| [#61](https://github.com/tannernielson27/learn/issues/61)   | chore(a11y): run the case study with NVDA and VoiceOver                                   | a11y               | To do; needs a person with the screen readers                      |

## Owner actions outside GitHub

These block the live site rather than a single issue:

- **GitHub Actions runs again** (2026-09-22): the repo was made public, so hosted runners are free. The private plan's 2,000 minutes ran out around Sept 20 (about 3,100 minutes were used Sept 10–22), and every job was refused from Sept 21. The backlog stack is merged.
- **Turn off Realtime "Allow public access"** in the Supabase project settings. It unblocks #178, which drops the last open select policy on `live.session_public_state`.
- **Apply each Sprint 8 migration to hosted after its PR merges**, in filename order (`pnpm exec supabase db push`). Each PR lists its own.
- **Author accounts are now created by hand** (#139, merged in #157). Sign-in no longer creates accounts, so a new instructor exists only once added under Authentication, Users, Add user. The sign-in form answers identically whether or not an address has an account, so a mistyped or unregistered address will appear to succeed and simply never receive a link.
- **Decide #159**: whether to accept that four cheap IPs can hold one author's sign-in closed indefinitely, or pay for one of the mitigations listed there.
- Done 2026-09-22: Vercel Production and Preview both carry `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `SUPABASE_JWT_SIGNING_KEY`; Production also has `DEMO_ACCOUNT_*`. The hosted demo user exists as an instructor in the seeded LeaRN org.
- Supabase Authentication, URL Configuration: Site URL and redirect URLs for production, previews and localhost.
- Supabase magic-link template: paste `supabase/templates/magic_link.html`. Email sign-in still needs it; the demo account (#115) works without it.
- Done 2026-09-22 on `vauokqoyvewtzubqajgh`: migration history repaired (rows 1–3 had been applied by hand under other versions), rows 4–16 pushed with `supabase db push`, and `seed.sql` loaded. Row 17 (#149, `20260921210000_private_live_channel`) applied after #176 merged. A separate production project (below) still needs the full replay.
- Split production into its own Supabase project. The code landed in #136 (ADR 0006 supersedes ADR 0005); the eight owner steps are written out in `docs/05-VERSION-CONTROL-AND-DEPLOY.md` §7.3. Order matters: `seed.sql` before creating the demo user, and never run `seed-demo.sql` against a hosted project.
- **Do not add `live` to the exposed schemas** in either Supabase project. That dashboard setting is what keeps the session-state mirror off the Data API.
- Nothing to set for `LIVE_PARTICIPANT_SECRET`: #131 shipped it as a placeholder and #133 deleted it. If it was set on a deployment, remove it.
- While creating that project, consider raising its **auth rate limits**. Supabase's default is 30 sign-ins per five minutes and it applies to the deployment's egress address as a whole, not per student — so it, not #134's per-IP limit, is what constrains a NAT'd classroom.
