# Open issues

A running log of every open issue, grouped by milestone. Update it when an issue is filed, started, merged or closed.

Last updated: 2026-09-24 (#242 merged in #251 with `20260925020000_class_timezone_and_removed` applied to hosted; #236 merged in #250).

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

## S9: Take-home assignments (milestone 9)

Demo 9: assign a set Monday, answer it Tuesday on a phone, review results Wednesday.

| #                                                           | Title                                                                                      | Gates                     | Status                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------- |
| [#204](https://github.com/tannernielson27/learn/issues/204) | feat(auth): invite-only sign-up, so no new account becomes an instructor                   | security, db, e2e         | Merged (#214); `20260924000000_invite_only_signup` applied to hosted                                |
| [#205](https://github.com/tannernielson27/learn/issues/205) | feat(assign): a class with an invite link students join                                    | security, db, e2e         | Merged (#220); `20260924010000_classes` applied to hosted                                           |
| [#206](https://github.com/tannernielson27/learn/issues/206) | chore(infra): send email through Resend from info.tannernielson.com                        | security                  | Merged (#216); no migration; owner steps in docs/05 §7.7                                            |
| [#207](https://github.com/tannernielson27/learn/issues/207) | feat(assign): assign a bank or case study to a class with a window and attempts            | security, db, e2e         | Merged (#222); `20260924020000_assignments` applied to hosted                                       |
| [#208](https://github.com/tannernielson27/learn/issues/208) | feat(assign): take an assignment on a phone with autosave and resume                       | player, security, db, e2e | Merged (#224); `20260924030800_assignment_attempts` applied to hosted                               |
| [#209](https://github.com/tannernielson27/learn/issues/209) | feat(assign): shuffle options where the item type allows it                                | player, security          | Merged: part 1 (#218) and the wiring in #224                                                        |
| [#210](https://github.com/tannernielson27/learn/issues/210) | feat(assign): student results with keys and rationales after close                         | security, e2e             | Merged (#228); `20260924050000_my_assignment_result` applied to hosted                              |
| [#211](https://github.com/tannernielson27/learn/issues/211) | feat(assign): an assignment report per student, item and CJMM step, with CSV               | security, db              | Merged (#226); `20260924040000_assignment_report` applied to hosted                                 |
| [#212](https://github.com/tannernielson27/learn/issues/212) | feat(assign): reminder emails when an assignment opens and a day before it closes          | infra, security, db       | Merged (#230); `20260924060000_assignment_reminders` applied to hosted; owner steps in docs/05 §7.8 |
| [#217](https://github.com/tannernielson27/learn/issues/217) | fix(auth): a class behind one campus IP hits the per-IP sign-in limit at about 30 students | security                  | Merged (#231); no migration                                                                         |

Sprint 9 is code complete: every story merged, `main` at 3c3b1e2. Demo script, owner steps, known gaps and retro in `docs/sprints/S9-demo.md`. Milestone 9 stays open until the owner accepts the demo. Every Sprint 9 migration is applied to hosted; nothing emails on hosted until the owner finishes docs/05 §7.7 (Resend) and §7.8 (the reminder schedule), and no real student is invited until the §7.3 production project exists.

Suggested order: #204 invite-only first (every later story assumes a student cannot author), with #206 email alongside; then #205 classes; #207 assign; #208 take an assignment; then #209 shuffle and #211 report; #210 results; #212 reminders last, or alongside #208 once #206 and #207 have merged.

Parallelization: one builder at a time on this machine (see the S8 retro). The only pairs that may run together, with the second builder skipping Docker and `next dev`, are #204 with #206, #209 with #211 (the pure part), and #208 with #212. #205, #207, #208 and #210 all add student-facing routes and the student home; never build two of them at once. Number migrations at merge time, not build time.

Owner decisions, 2026-09-23:

1. **Sign-up is invite-only.** Existing instructors and the demo account keep their role. A class invite makes a student, and any other new account gets no role until the owner promotes it (#204, #205).
2. **Email goes through Resend** from info.tannernielson.com (the owner's existing account and domain), both as Supabase's custom SMTP and as the app's mailer (#206).
3. **Attempts: 1 by default, up to 3, and the best attempt counts** (#207, #208, #210, #211).
4. **Build on the shared project; split before real students.** No real student gets an invite link until the §7.3 production project exists and has every migration.

Decisions taken at kickoff, each the conservative option; say if any should change:

1. **Classes are minimal:** a name, an invite link and a roster (#205). Bulk rosters and email invites wait for Phase 4.
2. **Scores, keys and rationales all wait until close** (#208, #210), so a student who submits early cannot pass answers on while the window is still open.
3. **An attempt still open at close is submitted with what it saved** (#208), rather than discarded.
4. **Assignment content is snapshotted when it is assigned** (#207), as sessions are.
5. **Reminders run on `pg_cron` every 15 minutes through `pg_net`** (#212, ADR 0007 to write), because Vercel Cron on Hobby runs only once a day. A reminder can be up to 15 minutes late.
6. **The assignment report shows progress only while open** (#211), so projecting it mid-window gives nothing away.

## S10: Go-live + student home (milestone 10)

Demo 10: production passes the go-live check. A student signs in on a phone, sees their assignment history and their weakest CJMM step, and practices a shared bank with instant feedback.

Phase 4 splits across two sprints. Sprint 10 covers what real students need: hardening and the student home. Sprint 11 covers the landing page, onboarding, empty and error states, email templates, the guides, and the cold-onboarding demo.

| #                                                           | Title                                                                                         | Gates                     | Status                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| [#233](https://github.com/tannernielson27/learn/issues/233) | chore(security): audit RLS, security-definer functions and routes before real students        | security, db, e2e         | Merged (#245); `20260925000000_security_guard` applied to hosted                              |
| [#234](https://github.com/tannernielson27/learn/issues/234) | fix(auth): keep rate limits in Postgres so they hold across server instances                  | security, db              | Merged (#247); `20260925010000_shared_rate_limits` applied to hosted                          |
| [#235](https://github.com/tannernielson27/learn/issues/235) | chore(infra): report client and server errors to Sentry with student data scrubbed            | security                  | Merged (#246); no migration; owner steps in docs/05 §7.9                                      |
| [#236](https://github.com/tannernielson27/learn/issues/236) | chore(infra): a nightly encrypted database dump, with restore steps                           | security, db              | Merged (#250); no migration; owner sets secrets (docs/05 §7.10), hosted restore drill pending |
| [#237](https://github.com/tannernielson27/learn/issues/237) | chore(infra): a go-live check that proves production is ready for students                    | security                  | To do                                                                                         |
| [#219](https://github.com/tannernielson27/learn/issues/219) | fix(player): an ordered-response item starts in the author's order, which is often the answer | player                    | Merged (#249); no migration; start order is keyed server-side                                 |
| [#178](https://github.com/tannernielson27/learn/issues/178) | fix(live): drop the open select policy on live.session_public_state                           | live, security            | Blocked: owner turns off Realtime "Allow public access"                                       |
| [#238](https://github.com/tannernielson27/learn/issues/238) | feat(student): a history of my assignments and best scores                                    | security, db, e2e         | To do                                                                                         |
| [#239](https://github.com/tannernielson27/learn/issues/239) | feat(student): my weakest clinical judgment steps                                             | security                  | To do                                                                                         |
| [#240](https://github.com/tannernielson27/learn/issues/240) | feat(authoring): share a bank with a class for practice, and warn on graded reuse             | security, db, e2e         | To do                                                                                         |
| [#241](https://github.com/tannernielson27/learn/issues/241) | feat(student): practice a shared bank with instant feedback                                   | player, security, db, e2e | To do                                                                                         |
| [#242](https://github.com/tannernielson27/learn/issues/242) | feat(assign): a class time zone setting, and removed students in the report                   | db, e2e                   | Merged (#251); `20260925020000_class_timezone_and_removed` applied to hosted                  |
| [#244](https://github.com/tannernielson27/learn/issues/244) | test(security): check live play and a second student on the real response bytes               | security, e2e             | To do; filed from #233                                                                        |
| [#248](https://github.com/tannernielson27/learn/issues/248) | chore(db): sweep expired rate-limit rows on a schedule                                        | security, db              | To do; filed from #247's review                                                               |

Suggested order:

1. #233, the audit, first, because its findings may add fixes to the sprint. #235 (Sentry) and #219 can run alongside it.
2. #234, shared rate limits. #241 needs the limiter.
3. #236 (backups) and #242 (leftovers).
4. #238 history, then #239 weak steps.
5. #240 share, then #241 practice.
6. #237, the go-live check, last, once the Sentry and backup checks have something to check.

Parallelization: one builder at a time on this machine, with a light second builder allowed only when it skips Docker and `next dev`. The pairs that may run together:

- #235 or #219 beside #233;
- #236 beside #242;
- the pure part of #239 beside #240.

#238, #239 and #241 all edit the student home (`src/app/learn/page.tsx`), so never build two of them at once. Number migrations at merge time.

Owner decisions, 2026-09-24:

1. **Sprint 10 is go-live plus the student home.** Landing, onboarding, email templates and the guides move to Sprint 11.
2. **Practice is opt-in per bank, and graded reuse only warns** (#240, #241). An instructor shares a bank with a class. Students see each item's key and rationale right after answering it. Assigning a practice-shared item as graded work shows a warning but is allowed.
3. **The production plan is decided at go-live.** Free tier pauses after about a week idle and has no downloadable backups; Pro does not pause and keeps 7 days of daily backups. The nightly encrypted dump (#236) is built either way as the fallback.
4. **Sentry on the free tier** (#235), with student data scrubbed before it leaves the app. The owner creates the Sentry project and adds the DSN to Vercel.

Decisions taken at kickoff, each the conservative option; say if any should change:

1. **Rate limits move into Postgres** (#234), not a new vendor such as Upstash. Keys that are IPs or emails are stored hashed.
2. **Sentry gets no session replay and no PII** (#235). Users are an opaque hashed id at most, and answer keys, invite tokens and join codes are stripped.
3. **The backup artifact is encrypted to the owner's public key** (#236), because anyone with a GitHub account can download artifacts from a public repo. The workflow never holds the decryption key.
4. **History and weak steps count only closed assignments** (#238, #239), using the best attempt. A step needs 5 items before it is ranked.
5. **Practice never counts toward a grade** and stays out of the instructor's assignment report (#241). It feeds the student's weak steps as a separate source.
6. **Practice keys arrive one item at a time, from the server, after that item is answered** (#241). No endpoint hands out a key for an unanswered item.

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
- **Author accounts are now created by hand** (#139, merged in #157). Sign-in no longer creates accounts, so a new instructor exists only once added under Authentication, Users, Add user. **Since #204 that is two steps**: Add user, then `select private.make_instructor('<address>');` in the SQL editor (docs/05 §7.6); without the second step the account lands on "No access yet". The sign-in form answers identically whether or not an address has an account, so a mistyped or unregistered address will appear to succeed and simply never receive a link.
- **Sprint 9 email (#206)**: in Resend, confirm info.tannernielson.com is verified; in Supabase, set custom SMTP to Resend and raise the Auth email rate limit; in Vercel, add `RESEND_API_KEY` and `EMAIL_FROM` to Production and Preview. The exact steps are in docs/05 §7.7.
- **Before any real student gets an invite**, create the production project and replay migrations (§7.3). Sprint 9 puts student emails in the database.
- **Sprint 10 monitoring (#235)**: create a Sentry project (free tier) and add `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` to Vercel Production and Preview. The steps will be in docs/05 §7.9 when #235 merges.
- **Sprint 10 backups (#236)**: generate an `age` key pair and keep the private key off GitHub. Once the §7.3 project exists, add the repo secrets `BACKUP_AGE_RECIPIENT` (the public key) and `PROD_DB_URL`.
- **Choose the production plan at go-live**: Pro, or free plus the nightly dump (owner decision 2026-09-24).
- **Decide #159**: whether to accept that four cheap IPs can hold one author's sign-in closed indefinitely, or pay for one of the mitigations listed there.
- Done 2026-09-22: Vercel Production and Preview both carry `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `SUPABASE_JWT_SIGNING_KEY`; Production also has `DEMO_ACCOUNT_*`. The hosted demo user exists as an instructor in the seeded LeaRN org.
- Supabase Authentication, URL Configuration: Site URL and redirect URLs for production, previews and localhost.
- Supabase magic-link template: paste `supabase/templates/magic_link.html`. Email sign-in still needs it; the demo account (#115) works without it.
- Done 2026-09-22 on `vauokqoyvewtzubqajgh`: migration history repaired (rows 1–3 had been applied by hand under other versions), rows 4–16 pushed with `supabase db push`, and `seed.sql` loaded. Row 17 (#149, `20260921210000_private_live_channel`) applied after #176 merged. A separate production project (below) still needs the full replay.
- Split production into its own Supabase project. The code landed in #136 (ADR 0006 supersedes ADR 0005); the eight owner steps are written out in `docs/05-VERSION-CONTROL-AND-DEPLOY.md` §7.3. Order matters: `seed.sql` before creating the demo user, and never run `seed-demo.sql` against a hosted project.
- **Do not add `live` to the exposed schemas** in either Supabase project. That dashboard setting is what keeps the session-state mirror off the Data API.
- Nothing to set for `LIVE_PARTICIPANT_SECRET`: #131 shipped it as a placeholder and #133 deleted it. If it was set on a deployment, remove it.
- While creating that project, consider raising its **auth rate limits**. Supabase's default is 30 sign-ins per five minutes and it applies to the deployment's egress address as a whole, not per student — so it, not #134's per-IP limit, is what constrains a NAT'd classroom.
