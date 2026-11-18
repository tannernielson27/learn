# Open issues

A running log of every open issue, grouped by milestone. Update it when an issue is filed, started, merged or closed.

Last updated: 2026-10-27 (S15 billing filed: #514 to #523; ADR 0016).

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

| #                                                           | Title                                                                                         | Gates                     | Status                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| [#233](https://github.com/tannernielson27/learn/issues/233) | chore(security): audit RLS, security-definer functions and routes before real students        | security, db, e2e         | Merged (#245); `20260925000000_security_guard` applied to hosted                                |
| [#234](https://github.com/tannernielson27/learn/issues/234) | fix(auth): keep rate limits in Postgres so they hold across server instances                  | security, db              | Merged (#247); `20260925010000_shared_rate_limits` applied to hosted                            |
| [#235](https://github.com/tannernielson27/learn/issues/235) | chore(infra): report client and server errors to Sentry with student data scrubbed            | security                  | Merged (#246); no migration; owner steps in docs/05 §7.9                                        |
| [#236](https://github.com/tannernielson27/learn/issues/236) | chore(infra): a nightly encrypted database dump, with restore steps                           | security, db              | Merged (#250); no migration; owner sets secrets (docs/05 §7.10), hosted restore drill pending   |
| [#237](https://github.com/tannernielson27/learn/issues/237) | chore(infra): a go-live check that proves production is ready for students                    | security                  | Merged (#252); no migration; run it per docs/05 §7.11                                           |
| [#219](https://github.com/tannernielson27/learn/issues/219) | fix(player): an ordered-response item starts in the author's order, which is often the answer | player                    | Merged (#249); no migration; start order is keyed server-side                                   |
| [#178](https://github.com/tannernielson27/learn/issues/178) | fix(live): drop the open select policy on live.session_public_state                           | live, security            | Merged (#419); `20261013000000_drop_open_state_policy` applied to hosted 2026-10-13             |
| [#238](https://github.com/tannernielson27/learn/issues/238) | feat(student): a history of my assignments and best scores                                    | security, db, e2e         | Merged (#254); `20260925030000_student_history` applied to hosted                               |
| [#239](https://github.com/tannernielson27/learn/issues/239) | feat(student): my weakest clinical judgment steps                                             | security                  | Merged (#258); `20260925060000_student_steps` applied to hosted                                 |
| [#240](https://github.com/tannernielson27/learn/issues/240) | feat(authoring): share a bank with a class for practice, and warn on graded reuse             | security, db, e2e         | Merged (#255); `20260925040000_practice_shares` applied to hosted                               |
| [#241](https://github.com/tannernielson27/learn/issues/241) | feat(student): practice a shared bank with instant feedback                                   | player, security, db, e2e | Merged (#261); `20260925070000_practice` applied to hosted                                      |
| [#242](https://github.com/tannernielson27/learn/issues/242) | feat(assign): a class time zone setting, and removed students in the report                   | db, e2e                   | Merged (#251); `20260925020000_class_timezone_and_removed` applied to hosted                    |
| [#244](https://github.com/tannernielson27/learn/issues/244) | test(security): check live play and a second student on the real response bytes               | security, e2e             | Merged (#260); tests only; also fixed a `"score":` marker that could never match                |
| [#248](https://github.com/tannernielson27/learn/issues/248) | chore(db): sweep expired rate-limit rows on a schedule                                        | security, db              | Merged (#257); `20260925050000_rate_limit_sweep` applied to hosted; job waits on pg_cron (§7.8) |
| [#256](https://github.com/tannernielson27/learn/issues/256) | fix(authoring): show an error when a confirmed remove or stop-sharing fails                   | e2e                       | Merged (#259); no migration                                                                     |

Sprint 10 is code complete: every story is merged except #178, which waits on the owner turning off Realtime "Allow public access". `main` is at e26e8e6. The demo script, owner steps, known gaps and retro are in `docs/sprints/S10-demo.md`. Milestone 10 stays open until the owner accepts the demo. Every Sprint 10 migration is applied to hosted (36 in all). The go-live owner steps are in docs/05 §7.11, and `pnpm golive:check` reports which are done.

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

## S11: Onboarding + polish (milestone 11)

Demo 12: an outside instructor onboards cold and runs a class without help.

Sprint 11 is the last Phase 4 sprint. It covers the landing page, onboarding, empty and error states, email templates, the guides, the Sprint 10 leftovers, and a rehearsal of the cold-onboarding demo.

| #                                                           | Title                                                                                 | Gates             | Status                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| [#264](https://github.com/tannernielson27/learn/issues/264) | feat(onboarding): a landing page that says what LeaRN is and how to get in            | e2e               | Merged (#277); no migration                                                                         |
| [#265](https://github.com/tannernielson27/learn/issues/265) | feat(onboarding): a first-run checklist on the author home, with a sample bank import | security, e2e     | Merged (#282); no migration; the sample lands as drafts until #283                                  |
| [#266](https://github.com/tannernielson27/learn/issues/266) | feat(onboarding): every empty list says what to do next                               | e2e               | Merged (#285); no migration                                                                         |
| [#267](https://github.com/tannernielson27/learn/issues/267) | feat(onboarding): designed not-found and error pages, and clear expired-link messages | security, e2e     | Merged (#279); no migration                                                                         |
| [#268](https://github.com/tannernielson27/learn/issues/268) | feat(email): branded email templates with plain-text parts and a preview              | security, e2e     | Merged (#278); no migration; owner pastes the regenerated magic-link template (docs/05 §7.7)        |
| [#269](https://github.com/tannernielson27/learn/issues/269) | docs(help): an instructor guide and an item-authoring guide under /help               | e2e               | Merged (#280); no migration                                                                         |
| [#270](https://github.com/tannernielson27/learn/issues/270) | docs: a contributor guide                                                             | none              | Merged (#276); no migration                                                                         |
| [#271](https://github.com/tannernielson27/learn/issues/271) | fix(student): freeze a practice run's items when it starts                            | security, db, e2e | Merged (#284); migration `20260926000000_practice_run_items`, applied to hosted; old runs stay live |
| [#272](https://github.com/tannernielson27/learn/issues/272) | chore: Sprint 10 leftovers: roster focus, Sentry bundle size, fonts                   | e2e               | Merged (#287); no migration; Sentry delta in docs/05 §7.9, fonts in docs/04 §2                      |
| [#57](https://github.com/tannernielson27/learn/issues/57)   | chore(design): three font families against a two-family guideline                     | none              | Closed by #287: all three kept, the exception written in docs/04 §2                                 |
| [#273](https://github.com/tannernielson27/learn/issues/273) | test(student): an e2e for the ranked Your steps section                               | e2e               | Merged (#281); test-only; runs on phone-375 only                                                    |
| [#288](https://github.com/tannernielson27/learn/issues/288) | fix(a11y): keep focus after Stop sharing and Delete assignment                        | e2e               | Merged (#291); no migration; filed from #287's review                                               |
| [#289](https://github.com/tannernielson27/learn/issues/289) | chore(monitoring): import withSentryConfig from @sentry/nextjs/config                 | none              | Merged (#290); no migration; filed from #287                                                        |
| [#274](https://github.com/tannernielson27/learn/issues/274) | test(onboarding): a Demo 12 cold-onboarding rehearsal                                 | e2e               | Merged (#292); no migration; e2e/coldOnboarding.spec.ts                                             |
| [#283](https://github.com/tannernielson27/learn/issues/283) | feat(onboarding): the sample bank arrives published, ready to assign or run live      | security, db, e2e | Merged (#286); migration `20260926010000_sample_published`, applied to hosted                       |

Suggested order, in pairs (one heavier builder, one light):

1. #264 landing, beside #270 contributor guide.
2. #271 freeze practice (heavy: the local stack for pgTAP), beside #268 email templates.
3. #267 error states, beside #269 guides.
4. #265 onboarding, beside #273 the Your steps e2e.
5. #266 empty states, beside #272 leftovers (heavy: a local `next build` for the Sentry measurement).
6. #274 the rehearsal, alone and last, since it walks the landing page, onboarding and empty states.

Parallelization map. Never build two stories at once that edit the same page:

- **Author home** (`src/app/author/page.tsx`, `BankList`): #265 and #266. #266 goes after #265.
- **Student home** (`src/app/learn/page.tsx`): #266 only. #273 seeds data and adds a spec but does not edit the page. #271 edits the practice page and route, not the home.
- **Class page** (`src/app/author/classes/[classId]/`): #266 (roster empty state) and #272 (roster focus). #272 goes after #266.
- **Root layout** (`src/app/layout.tsx`): #272 (fonts). #267 adds `not-found.tsx` and `error.tsx` beside it but must not edit the layout.
- **Author layout** (`src/app/author/layout.tsx`): #269 (the Help link). No other story touches it.
- **Sign-in and invite pages**: #267 only. #264 and #274 link to them without editing them.
- **Gallery**: #268 adds a preview route with no nav entry. #269 only reads `e2e/__screenshots__`.
- **ci.yml e2e list**: most stories add a spec. The orchestrator resolves it at merge; keep both lines.

Migrations, given out ahead of time in merge order:

- `20260926000000_practice_run_items` (#271).
- `20260926010000_*`, reserved for any story that turns out to need one; the orchestrator names it at merge.

Decisions taken at kickoff, each the conservative option; say if any should change:

1. **The landing page has no sign-up, pricing, tracking or contact form** (#264). It explains the product and links to Sign in and Join a live session, because sign-up is invite-only.
2. **Onboarding state is derived, and dismissal is a cookie** (#265). The three steps read the org's own data on each load, so nothing new is stored. Hiding the checklist lasts per browser, with no migration.
3. **The sample bank comes from the same fixtures as the seed** (#265), through the existing import and validation path, labeled "Sample". A second import links to the existing "Sample bank" instead of copying it again.
4. **Error pages never show an error's message or stack** (#267), only its digest as a reference.
5. **Emails carry no remote images, fonts or tracking pixels** (#268), and each app-sent message keeps a plain-text part. The preview route sits behind the gallery gate, so it is closed on production.
6. **Help is public, static and in the app** (#269), under `/help`. Its screenshots are copies of the committed Playwright baselines, so no page renders an item's key for the guide.
7. **A practice run freezes item versions at start** (#271). Runs started before the migration keep reading the bank's current items. Stopping a share still closes every run at once.
8. **The three font families stay, with the exception written down** (#272, #57), unless one proves unused. The Sentry bundle delta is measured with a local build and a dummy DSN, since previews have no DSN until the owner step.
9. **The rehearsal walks a live session, not a take-home window** (#274), so it adds no real-time wait to the auth e2e job.

Sprint 11 is code complete: every story is merged, including the follow-ups #283, #288 and #289 filed during the sprint. `main` is at da34d8c. The demo script, owner steps, known gaps and retro are in `docs/sprints/S11-demo.md`, and `docs/sprints/S11-rehearsal.md` is Demo 12 step for step. Both Sprint 11 migrations are applied to hosted (rows 37 and 38). Milestone 11 stays open until the owner accepts the demo.

## S12: AI question import (milestone 14)

**Finished, 2026-10-15: every story is built.** #348 (PR #451) and #349 (PR #453) wait for the owner to merge, and #348's migration (row 56) for the owner's push. The case-study half of #347 was cut under the cut line below: a staged case study imports as it is or is dropped, with no builder view and no "Split into standalone items". The demo script, owner steps, known gaps and retro are in `docs/sprints/S12-demo.md`; the owner steps for the key, the cap, the push and the spend limit are docs/05 §7.14.

Status, 2026-10-14: the #333 spike (PR #352) and the draft converters for all 14 types (#337, #338) are done, and #339 adds the golden corpus and the accuracy eval (`test/ai-import/`, `pnpm eval:ai-import`). The spike's measurements are in ADR 0008, "Cost and accuracy". Sprints 13 and 14 ran first. Reveal-by-step for case study charts (#334–#336), planned here at kickoff, moved to S14 and is merged (PRs #424, #435, #438), so this sprint builds on it.

Demo 13: a teacher uploads a Word case study and a PDF of questions, reviews what the AI found, fills in a missing answer, and imports the batch as drafts into a quiz. The imported case study's patient record grows step by step, live on a phone.

The plan is ADR 0008. The AI copies questions that exist in a document. It never writes a key or a rationale.

Owner decisions (2026-10-01):

1. **Review first.** Parsed questions are staged; nothing reaches a quiz until the teacher imports the batch, all or nothing.
2. **Extract only.** A missing key or rationale is flagged for the teacher, never generated.
3. **Case studies are in this sprint.** A case study's chart may grow as the case unfolds, as the owner's Maryland samples do. Reveal-by-step itself shipped in S14 (`fromStep`, `stepAccess`, `recordAtStep`); #344 sets `fromStep` on what it imports.
4. **Claude Sonnet 5.5 on the owner's key**, live calls, a monthly cap per org (see kickoff decision 4).
5. **Formats:** PDF (text and scanned), .docx, .md, .txt.
6. **Uploaded files are deleted** once the batch is imported or discarded.
7. **A rights checkbox at upload**, which also confirms there is no real patient information.
8. **A batch is up to 5 files, 100 pages and 150 questions.**

| #                                                           | Title                                                                                          | Gates             | Status                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------- | --------------------------- |
| [#333](https://github.com/tannernielson27/learn/issues/333) | chore(ai-import): measure cost and accuracy on the owner's sample documents                    | none              | Merged (#352); no migration |
| [#337](https://github.com/tannernielson27/learn/issues/337) | feat(ngn): AI draft shapes and converters for the selection, ordered and bowtie types          | none              | Merged (#441); no migration |
| [#338](https://github.com/tannernielson27/learn/issues/338) | feat(ngn): AI draft shapes and converters for cloze, highlight, drag-and-drop and case studies | none              | Merged (#442); no migration |
| [#339](https://github.com/tannernielson27/learn/issues/339) | test(ai-import): a fictional golden corpus and an accuracy eval                                | none              | Merged (#443); no migration |
| [#340](https://github.com/tannernielson27/learn/issues/340) | feat(db): AI import batches, staged entries, a private upload bucket and a monthly cap         | security, db      | Merged (#444), applied      |
| [#341](https://github.com/tannernielson27/learn/issues/341) | feat(ai-import): check uploaded files and prepare them for Claude                              | security          | Merged (#445); no migration |
| [#342](https://github.com/tannernielson27/learn/issues/342) | feat(ai-import): Claude client, segment pass, usage ledger and cap                             | security          | Merged (#446); no migration |
| [#343](https://github.com/tannernielson27/learn/issues/343) | feat(ai-import): extract each question into a draft, validate it, and repair once              | security, db      | Merged (#448), applied      |
| [#344](https://github.com/tannernielson27/learn/issues/344) | feat(ai-import): assemble case studies with a chart that grows by step                         | none              | Merged (#447); no migration |
| [#345](https://github.com/tannernielson27/learn/issues/345) | feat(authoring): upload documents for AI import and watch them parse                           | security, e2e     | Merged (#449); no migration |
| [#346](https://github.com/tannernielson27/learn/issues/346) | feat(authoring): review an AI import batch before anything reaches the bank                    | security, e2e     | Merged (#450); no migration |
| [#347](https://github.com/tannernielson27/learn/issues/347) | feat(authoring): fix staged questions and case studies with the existing editors               | e2e               | Merged (#452); no migration |
| [#348](https://github.com/tannernielson27/learn/issues/348) | feat(authoring): import a reviewed batch all at once, or discard it                            | security, db, e2e | In review (#451); migration |
| [#349](https://github.com/tannernielson27/learn/issues/349) | docs(help): AI import guide, end-to-end tests, security rows and the S12 demo                  | e2e               | In review (#453)            |

Notes from #341 for the stories after it (`src/lib/aiImport/files/`):

- **#345:** call `registerFile`, upload with the `contentType` it answers and the teacher's own session, then `checkUploadedFile`; all three take the service-role client, so the Server Function checks the caller authors the workspace first. A refused file keeps its row (and one of the 5 places) until `removeFile`. The returned `images` count is not stored.
- **#342:** `ai_import_chunks` holds positions and pages, not content. Read a file only through `loadCheckedFile`, which re-hashes the object against `sha256` (a teacher can replace it while it is pending), then `chunkPayload(bytes, prepared, position)`. A .docx arrives as markdown; put `DOCX_MARKUP` in the prompt.

Notes from #342 for the stories after it (`src/lib/aiImport/`):

- **#345:** a parse request calls `segmentChunk(segmentChunkDeps(service), { orgId, batchId, fileId, position, userId })` with the workspace and user from the session. It checks `AI_IMPORT_ENABLED`, the per-teacher limit (`ai_import_parse`, 60 an hour), the file's hash, then reserves and settles itself; since #343 it writes the chunk's `segments` and no other column. Claim the chunk first (`update ... set status = 'running', attempts = attempts + 1 where status in ('pending', 'failed')`) so two tabs cannot send it twice, then record `done` or `failed` with the tokens. `cap_reached` carries `remainingUsd` and `remainingPages` for the page.
- **#343, #345:** decided 2026-10-15 (owner): a column. `ai_import_chunks.segments` (#343's migration) holds each chunk's `ChunkSegment`, and `segmentChunk` now writes it itself after settling (`unavailable` if it cannot).
- **#343:** answer sections are copied text, linked by number (`MergedQuestion.answers`). For text and .docx they were found in the source; a PDF's cannot be checked here (`sourceChecked: false`), so treat a PDF key as needing the reviewer. `flags.notInSource` marks an excerpt the text does not hold. Confidence below 0.7 is shown to the reviewer. `runPipeline` in `test/ai-import` still has its own segment call; move it onto `src/lib/aiImport` with extraction, since both read the same document block. (Done in #343.)

Notes from #343 for the stories after it (`src/lib/aiImport/`):

- **#345:** once every chunk of a file is `done`, extract it one unit per request: `extractUnit(extractUnitDeps(service), { orgId, batchId, fileId, userId, unit })`, from `unit: 0` up to the `units` each answer reports (2–3 at a time, the first alone so it warms the document cache). `incomplete` means a chunk has no segments yet. A unit sent twice stages nothing twice (`ai_import_entries (batch_id, position)` is unique; a file's questions sit at `file order × 1000 + place`). Extract requests have their own limit (`ai_import_extract`, 160 an hour). `overLimit` counts questions past the batch's 150, not extracted: show it. A case study group is one unit (its steps and its charts in parallel calls, assembled by #344), so it can run longer than a standalone unit. When every unit of every file is done, call `finishExtraction(service, { orgId, batchId })` once (duplicates flagged, source matter on `ai_import_batches.source`), then move the batch to `review`.
- **#346:** each `reasons` entry is `code: message` (`readReason` in `stage.ts`). `unmarked_key` means the model returned a key that part of the document does not show: the draft is kept, the item is null, the status `needs_fix`. `check_key` marks a key read from a PDF (not checkable). `duplicate` is advisory; the reviewer drops one. `source_error` notes never changed the text; `note` is #344's reviewer note (a group that was not six steps). A case study is one entry, `kind = 'case_study'`, at its first step's place: `item` is the learn.v1 case study, `draft` is `{ title, charts, steps }`.

Notes from #345 for the stories after it (`src/lib/aiImport/upload/`, `src/components/authoring/AiImportUpload.tsx`):

- **#346:** a batch reaches `review` from the upload page at `/author/banks/[bankId]/ai-import?batch=<id>`, which then shows "Ready for review" and the count staged, nothing more. Replace that section of `AiImportUpload` (the `status === "review"` branch) with the review screen or a link to it. The batch's `bank_id` is the quiz the teacher started from (see the decision below). Read entries on the server only; the page and routes never send a draft, an item or a key to the browser today.
- **#346, #348:** a batch in review still counts towards the workspace's 20 open batches until it is imported or discarded.
- **Owner decision, 2026-10-15 (#345, #348):** the import is started from a quiz, so `ai_import_batches.bank_id` is that quiz, and the import lands there. No new quiz is made and none is offered.
- **Retries:** a failed chunk can be sent again at once (up to 5 tries). A failed extract unit keeps its 6-minute claim, so "Try again" waits for it (the page asks again every 15 s).

Notes from #346 for the stories after it (`src/lib/aiImport/review/`, `src/components/authoring/AiImportReview.tsx`):

- **#347:** the review screen is `/author/banks/[bankId]/ai-import/[batchId]`. Each entry card (`AiImportReviewEntry`) has Drop/Restore and Change type; add the edit link there. Entries are read with the teacher's own session (`readReviewBatch`), and every change names the version the page showed: update `... where version = <shown>` and treat no row as `entry_changed` (`src/lib/aiImport/review/actions.ts` does this for drop and restore). A teacher's session may update `type, draft, item, status` while the batch is in review; `reasons` needs the service client. After a fix, set the status again (`restoredStatus` in `src/lib/authoring/aiImportReview.ts` works it out from the item and reasons), and drop the stale `needs_fix`/`needs_answer` reasons.
- **#347:** Change type is `POST /api/ai-import/retype` (`retypeEntry`): one question re-extracted as the chosen type under the cap, written back at the shown version. It keeps a `duplicate` reason and replaces the rest. A case study has no change of type.
- **#348:** done in #451: the button is `AiImportReview`'s `actions.importBatch` (and `actions.discard`); it enables once `importSummary(entries).blockers` is empty. Kept = not `dropped` and not `not_importable`. "Dropped" is a status, so restoring works by recomputing; nothing else marks an entry dropped.
- **Restore:** the table keeps no earlier status, so restoring recomputes it: no NGN type is not importable; no item, or a `needs_fix`, `unmarked_key`, `not_in_source`, `relies_on_image` or `cut_off` reason, needs a fix; a `needs_answer` reason needs an answer; anything else is ready.

Notes from #347 for the stories after it (`src/lib/aiImport/review/fix.ts`, `src/components/authoring/AiImportEntryEditor.tsx`):

- **#348:** a single question with an NGN type that is not dropped has **Edit** on its card, opening `/author/banks/[bankId]/ai-import/[batchId]/[entryId]` with its type's own editor (one **Save**, no Publish). Save (`saveAiImportEntryFix` → `saveEntryFix`) stores only a whole, valid item of the entry's own type (`itemSchema`), so after #347 an entry with an item and status `ready` always holds a valid item. It writes `item`, `status` and `reasons` with the service client at the shown version, after reading the batch's status again, the same window as Change type: #348's import should still take a row lock or re-check versions. The draft column is left as the model gave it.
- **#348:** a save drops every reason except `duplicate`, `instructor_note`, `source_error` and `note`, and works the quality `warning`s out again from the saved item (`reasonsAfterFix`). So a saved question is Ready unless it was dropped.
- **#348:** `AiImportReview` hands each card an `editHref`; nothing else in it changed.
- **Cut (#347):** the case-study half (the builder view for a staged case study, its record with "Shows from step", and "Split into standalone items") is not built. A case study card has no Edit link; drop it or import it as staged. Its acceptance test ("split a staged case study into six standalone items") is not met.
- **#349:** the e2e is `e2e/aiImportFix.spec.ts` (the Malnutrition-shaped matrix: mark the key, Save, Ready). The help guide can say: Edit, mark the answer, Save, back to the review.

Notes from #348 for the stories after it (`src/lib/aiImport/commit/`, migration `20261015010000_ai_import_commit`):

- **#349:** import is one click on the review screen and lands in the batch's quiz as drafts, not in a folder; the batch page then says "Imported" with its counts (`imported_questions`, `imported_case_studies`). Discard is a dialog on the same screen and goes back to the quiz. e2e: `e2e/aiImportCommit.spec.ts`.
- **#347:** an import locks every entry of its batch (`select ... for update` in `import_ai_batch`) and checks each kept entry's version against the one the server validated, so an edit or retype that lands during an import waits, then finds the row gone. Keep writing entries with `where version = <shown>`.
- **Owner step at push:** where pg_cron is on (the hosted project), the migration schedules `learn-ai-import-sweep` itself; elsewhere run `select private.schedule_ai_import_sweep();` after enabling pg_cron (docs/05 §7.8).
- **Files:** a file row deleted queues its object in `ai_import_object_deletes`; the server removes up to 100 of the workspace's queued objects after each import or discard. A workspace that never imports or discards again keeps the objects of its swept batches until it does.

Notes from #349 (`e2e/aiImportFlow.spec.ts`, `/gallery/ai-import`, `/help/instructor#ai-import`):

- The full walk runs in `auth e2e` through the interface only: upload the corpus's `01-med-surg-review.md`, mark the key on question 3 (blood glucose 52 mg/dL, "Needs an answer"), drop what still blocks, import, publish the fixed question.
- The guide's figure is `public/help/ai-import-review.png`, a byte copy of the `desktop-1280` baseline from `e2e/aiImportGallery.spec.ts` (regenerate with the `e2e baselines` workflow, which now includes it). Its entries carry no key, as #269 decision 6 asks.
- The upload page links to `/help/instructor#ai-import` ("How AI import works"); keep the anchor.
- Security rows for the three routes, the two Server Function files, `import_ai_batch` and `ai_import_object_deletes`, and the sprint's accepted gaps, are in docs/audits/S10-security.md ("Sprint 12 review").

Notes from #344 for #343 (`src/lib/ngn/draft/assemble.ts`, pure):

- Call `assembleImport(parts, { idPrefix, tags, source })` per file, parts in source order: `{ kind: "case_study", title, charts, steps }` (`charts` is the unparsed output of the `caseStudyChartsJsonSchema()` call; `steps` are the step drafts after repair, a step whose extract failed left out) or `{ kind: "question", draft, chart? }` (`chart` from a `standaloneChartJsonSchema()` call, for a standalone bowtie or trend with its own chart). Each entry has `reasons` (turn into the status), `notes` (reviewer only: `not_a_case_study`, `chart_not_attached`, `possible_source_error`), `groupKey` and `step` for `ai_import_entries`.
- `source` (author, objectives, references) comes back for the batch. Done in #343: the segment pass copies it, and `finishExtraction` writes it to `ai_import_batches.source` (#343's migration, owner request 2026-10-15).

#334, #335 and #336 are in S14 below. Issue titles keep the words they were filed with; the interface follows docs/glossary.md ("quiz", not "bank"; "question", not "item").

Suggested order, one builder at a time (two heavy builders run this machine out of memory):

1. #333 spike. First the owner adds `ANTHROPIC_API_KEY` to `.env.local` and puts the samples in `.ai-import-samples/`.
2. The #337 and #338 drafts (pure `src/lib/ngn`).
3. #340 db (heavy; hold the merge until the owner can push), then #341 files.
4. #339 eval, then #342 segment, then #343 extract. **Checkpoint:** a .md of multiple choice and select-all questions becomes staged entries.
5. #344 case study assembly.
6. #345 upload, #346 review, #347 edit, then #348 import (hold the merge for its push).
7. #349 last.

**Cut line:** if the sprint runs late, #344 and the case-study half of #347 move to a later sprint. Standalone questions still ship whole.

Parallelization map. Never build two stories at once that edit the same files:

- **`src/lib/ngn/registry.ts`:** #337, then #338. #338's case study draft reuses the `fromStep` and `stepAccess` schema that S14 shipped in `src/lib/ngn/schemas/common.ts`; it should not change it.
- **Case study builder** (`CaseStudyBuilder`, `EhrBlockEditors`): #347 only.
- **Quiz page** (`src/app/author/banks/[bankId]/page.tsx`): #345 only (the Import with AI link).
- **`src/lib/aiImport/claude.ts` and the prompts:** #342, then #343, then #344.
- **`src/lib/observability/scrub.ts`:** #342 only.
- **docs/audits/S10-security.md:** several stories add rows. The orchestrator resolves it at merge; keep both.

Migrations, reserved in merge order. They must sort after the newest migration on `main` (on 2026-10-14, `20261014300000_move_between_quizzes`); if `main` gains a later one before a story merges, renumber it:

- `20261015000000_ai_import` (#340).
- `20261015005000_ai_import_segments` (#343, owner decision 2026-10-15: a column for each chunk's segment answer).
- `20261015010000_ai_import_commit` (#348), still after #343's.

Reveal-by-step needed one migration, `20261014200000_assignment_record_column_grant` (#335, S14), so no spare is reserved for it here.

Decisions taken at kickoff, each the conservative option; say if any should change:

1. **Owner documents never enter the repo** (#333, #339). They live in `.ai-import-samples/`, which is gitignored. The CI corpus is fictional, written for the repo.
2. **The model never writes ids, tokens or offsets** (#337, #338). It fills a string-only draft, and pure converters build learn.v1.
3. **Imports land in the quiz the import was started from** (`ai_import_batches.bank_id`). Owner decision, 2026-10-15, replacing the kickoff's "a new quiz, 'AI import – <date>', by default": no new quiz is made and none is offered (#348).
4. **The cap is about $10 of estimated cost per org per month**, reserved before each call (#340). #333 measured it and proposed it in place of 300 pages, because a .docx has no reliable page count; the owner confirms it. #340 ships both: `orgs.ai_import_monthly_cap_usd` (default 10.00) and `orgs.ai_import_monthly_page_cap` (default null, off), each set per workspace in SQL, and a reservation must fit under every cap that is set. AI import is also off for a self-registered workspace until the owner turns it on (`orgs.ai_import_enabled`, S13 kickoff decision 1).
5. **2–3 chunks parse at once** (#345). #333's latency may change it.
6. **Images are not imported.** A question that relies on one is flagged (#341, #343).
7. **Abandoned batches are deleted after 7 days** by a self-scheduling cleanup that needs no secret (#348: `private.sweep_ai_imports()`, daily as `learn-ai-import-sweep`). Their uploaded objects are queued and removed at the workspace's next import or discard, since only the Storage API can delete an object's bytes.
8. **Source errors are kept word for word**, with a note for the reviewer (#343).
9. **A group that is not exactly six steps imports as standalone questions** (#344).

Edge cases the owner's samples showed, each covered by an acceptance criterion or a corpus case in #339:

- Keys as `*` glued or spaced, inside matrix cells, as "Answer: ✅ B." lines, and as yellow Word highlighting; layouts with no keys at all.
- A stated scoring rule on each step; "Which 4…" (select-N) against "Select all that apply".
- A case study bundled with a standalone bowtie or trend; a chart repeated every step and growing; a typo in a chart time.
- Author blocks, objectives, QR codes, survey links and references, which are not question content; instructor notes.
- Open discussion prompts, calculations, matching and one-line recall, which have no NGN type.
- Errors in the source; an embedded clinical image and a copyrighted form; the same document as both .pdf and .docx.
- Character damage in a PDF's text layer (degree signs, superscripts).

#339's corpus covers keys glued, spaced, in matrix cells, as `✅ Answer` lines, as Word highlighting and at the back; an unmarked question after an injected instruction; a two-column PDF and a scanned page; a growing six-step case study with a standalone bowtie; an open prompt, a matching exercise, a calculation and instructor notes. Not yet in it: a trend item, a typo in a chart time, an embedded image, the same document as .pdf and .docx, and a damaged PDF text layer. Add them as #342–#344 need them (`test/ai-import/README.md`, "Adding a case").

### After the 2026-11-17 audit: making AI import work on real documents

The audit read the whole feature after the owner's 9-page Word test bank stuck on 2026-10-22. That import failed in the segment pass (`stop_reason=max_tokens` at 8,000 tokens), every retry failed the same way and was billed, and the upload page had no way out. Six issues came of it, in build order:

| Issue                                                       | Story                                                                                  | Gates         | Status        |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------- | ------------- |
| [#590](https://github.com/tannernielson27/learn/issues/590) | fix(ai-import): the segment pass cannot overflow, and a failed part says what happened | security      | Merged (#596) |
| [#591](https://github.com/tannernielson27/learn/issues/591) | fix(authoring): no dead ends on the AI import upload page                              | security, e2e | Merged (#597) |
| [#592](https://github.com/tannernielson27/learn/issues/592) | fix(ai-import): answer keys survive Word formatting and long documents                 | none          | Merged (#600) |
| [#593](https://github.com/tannernielson27/learn/issues/593) | feat(authoring): an AI import review you can check and finish, case studies included   | security, e2e | In review     |
| [#594](https://github.com/tannernielson27/learn/issues/594) | test(ai-import): real-size documents in the golden corpus                              | none          | Not started   |
| [#595](https://github.com/tannernielson27/learn/issues/595) | feat(ai-import): reading continues with the tab closed (ADR first)                     | none          | Deferred      |

Owner decisions, 2026-11-17: a key marked only by bold, underline or font colour is accepted with a "check this key" reason (#592); case studies in review get "add the key per step" and "split into separate questions" first, not the full builder (#593); background reading is decided after #590–#593 are in use (#595).

Notes from #590 for the stories after it (`src/lib/aiImport/segmentChunk.ts`, `segmentSplit.ts`, `upload/http.ts`):

- **The limits:** `SEGMENT_MAX_TOKENS` is 16,000 and the segment request asks for no thinking (`thinking: "minimal"` on a `StructuredRequest`, sent as `between_tools`: Sonnet 5.5 answers `disabled` with a 400). A segment call may run 130 s (`SEGMENT_TIMEOUT_MS`); every other AI import call keeps 90 s. The extract pass still thinks and still has 8,000 tokens: a chart-heavy case study can overflow there, and now says `too_long` when it does.
- **Time:** a parse request's calls are all cut to end inside `SEGMENT_BUDGET_MS` (270 s of the route's 300), so the function is not killed with a reservation open. In `callStructured`, a failure is tried again only if it came back within `RETRY_WINDOW_MS` (45 s): that holds for the extract and retype calls too, whose worst case was three slow tries.
- **A chunk that overflows** is read again as two halves at once (`SEGMENT_SPLIT_DEPTH = 1`), each under its own reservation with no pages, both reserved before either is sent; `joinParts` returns the chunk's one segment, so nothing downstream knows. Text is cut before a numbered question nearest the middle (`splitText`); a PDF by pages around a shared page (`splitPages`). A half that still overflows answers `part_too_large`, which is recorded as the chunk's last try (`settleChunk`'s `final`), so "Try again" answers `spent` without paying again.
- **Money:** one parse request may now make three calls, and the teacher's 60 parse requests an hour count requests, not calls, so the pace one account can spend at is about four times what it was; the monthly cap still bounds the total, as every call is reserved first (security review, accepted). A cap reached between a chunk's call and its halves answers `cap_reached` with `charged`, and the try is counted, not given back.
- **Known limits:** the second half of a text chunk does not hold a case study's title, so its steps may come back ungrouped; a case study has few questions and is unlikely to overflow. In `merge.ts`, `foldChunk` compares a chunk's questions only with the last one before it, so when two or more questions start on the page two PDF chunks share, they are staged twice (and flagged as duplicates at the end); `joinParts` does not have this fault, and #592 should carry its rule to `mergeSegments`. The same file's text rule can also merge the questions either side of a chunk boundary when they open with the same eight words.
- **#591:** `part_too_large` and `spent` both tell the teacher to remove the file, which the page cannot yet do. The new codes `claude_timeout`, `too_long` and `claude_refused` are worth an automatic retry in the driver; `part_too_large` is not. A chunk's `last_error` now reads `claude_failed:<reason>`, and both routes log `[ai-import] a segment call failed` or `an extract call failed` with the reason.
- **#592:** a half of a text chunk is cut where `chunkText` would not cut, so a question can cross it; the join relies on the model's `cutOff` and `continued` flags exactly as chunk boundaries do. Fixing the chunk join in `unitPayload` fixes nothing here: the extract pass still reads the whole chunk.
- **#594:** the 60-question document should overflow 8,000 tokens on `main` before #590 and fit in one call after it; a second, denser one should need the split.
- **Not verified live:** the local `ANTHROPIC_API_KEY` answered 401 on 2026-11-17, so the stuck document and `pnpm eval:ai-import` have not been run against this change. Do both before merging.

Notes from #591 for the stories after it (`src/lib/aiImport/upload/removeFile.ts`, `openImports.ts`, `src/lib/authoring/aiImportDriver.ts`, `src/components/authoring/AiImportUpload.tsx`):

- **A removed file keeps its row.** Removing a file while the import is reading marks it `rejected` with `REMOVED_REASON` (`files/reasons.ts`, `isRemovedFile`) and deletes its chunks, the entries at its place and its object; the row goes with the batch. A file's place is its order among the batch's rows, and entries sit at `place × 1000 + n`, so deleting the row would move every later file's questions under the wrong file. Never filter the batch's files by status before counting places (`filePlace`, `fileAt`, `readReviewBatch.fileNames`, `readBatchView` all count every row). `finishBatch` clears removed files once more and answers `nothing_left` when no file is ready.
- **Every reader leaves out a removed file's place.** An extract request that was already reading the file can stage a question after any delete, up to the route's 300 s, so no delete can be timed to catch it. `src/lib/aiImport/places.ts` (`removedPlaces`, `withoutRemoved`) is what closes it: the review read, the duplicate pass, the upload page's counts and the quiz page's count all leave those places out, and `importBatch` deletes them with the service client just before it calls `import_ai_batch`, which takes exactly the kept entries and so refuses if one lands after that. The staging insert also reads the file's status again first (`extractUnitDeps.insertEntries` answers `not_found` for a file that is no longer `ready`), which narrows the window but does not close it. **#593:** any new read of `ai_import_entries` must go through `withoutRemoved`, and a new write path that makes entries (splitting a case study) must not write at a removed place.
- **`REMOVED_REASON` must never change.** It is stored in `ai_import_files.rejected_reason` and matched by exact equality. It is a sentence in a text column only because #591 could add no migration; a later migration can give removal a real column or status and backfill it from this value.
- **#593:** the discard dialog is `AiImportDiscard` (its `keepLabel` names the screen); the upload page shows it at every stage. The quiz page lists a quiz's unfinished imports (`readOpenImports`, the newest five, with `describeOpenImport`'s line and link). "Import with AI" still reopens only an import that is uploading or reading, so a teacher can start another while one waits in review. A split case study's new entries must stay inside its file's thousand.
- **#593, #595: claims are not released.** A failed extract unit and a failed Change type still hold their claim for six minutes: `RateLimitStore` has only `hit`, and giving a hit back needs a new database function, so a migration, which #591 was not allowed. It would be `public.release_rate_limit(bucket_name text, key_digest text)`, granted to `service_role` only like `public.hit_rate_limit`, deleting that key's row from `private.shared_rate_limits`, with a `release` method on `RateLimitStore` (and on the memory store the tests use). The upload page says a file is waiting and that it can take up to 6 minutes (`fileHeld`, `HOLD_STAGES`). With a release function, call it in `extractRoute.ts` and `retypeRoute.ts` when the try fails having staged nothing; #591's route test ("a failed extract releases its claim, and the next request runs") is still to be written.
- **#595:** the retry policy lives in the browser's driver: `WORTH_RETRYING` (`unavailable`, `claude_failed`, `claude_timeout`, `bad_answer`), two more tries after `RETRY_PAUSES_MS`, and a try that waited out a claim is the last. A server-side runner should carry the same policy; a chunk's five tries still bound it. **One click now spends up to three of a chunk's five tries** (the first and two new ones), so a chunk that keeps failing is `spent` on the second click, where it used to take five; each try that reached Claude is paid for. The driver looks again after each pause and sends nothing more once anything has stopped the run or failed the file. When reading no longer needs the tab, take out the "Keep this tab open" note and the `beforeunload` warning in `AiImportUpload`. A runner must also expect a file to be removed under it: `loadCheckedFile` answers `not_found` for a file that is not `ready`.
- **Left out:** upload progress per file. `supabase-js`'s `upload` reports no progress; it needs a resumable (TUS) upload or a hand-written request. Each file still says "Uploading." and "Checking the file." as it goes.

Notes from #592 for the stories after it (`src/lib/aiImport/files/docx/`, `choiceMarks.ts`, `keyEvidence.ts`, `sourceText.ts`, `merge.ts`, `finish.ts`):

- **The markup a .docx becomes** (`files/docx/format.ts`, legend in `DOCX_MARKUP`). Unchanged: `**bold**`, `*italic*`, `<u>underlined</u>`, `==text=={yellow}` or `=={#FFFF00}` for a highlight or run shading, `{shaded #RRGGBB}` at the start of a table cell, `<br>` between a cell's paragraphs, `[image]`, `[text box]`. New: `~~struck through~~` (single or double); font colour as `==text=={color #C00000}`, and `=={yellow, color #C00000}` when the text is highlighted too; raised and lowered text as Unicode superscripts and subscripts (`10³`, `SpO₂`, `Ca²⁺`) or, where Unicode has none, `^(text)` and `_(text)`, with an ordinal's letters left as they are (`1st`); `{shaded #RRGGBB}` at the start of a shaded paragraph or list item, after its number; hidden text (`w:vanish`) dropped, whether the run, its character style or its paragraph style hides it. Black, white, grey and automatic font colours are not marked. Bold is also read from a run's character style and the paragraph's style, through `basedOn` (not for a heading, which `#` already marks); bold and hidden are the only properties read from styles. `w:sym` and text set in Symbol, Wingdings or Wingdings 2 become the character the font shows (`symbols.ts`); a code not in the tables is `[symbol]`.
- **The prompt changed.** `DOCX_MARKUP` names each new mark and ends with two sentences that tell Claude when formatting is the answer mark, written to say no more than the guard accepts: "When some of a question's choices (options, list items, table rows or cells) are bold, underlined, coloured, shaded or highlighted as a whole and its other choices are not, that formatting is the document's answer mark: write \* on those choices in the draft. Emphasis in a stem, a label, a heading or a table header is never an answer mark, and neither is formatting that every choice shares." `SEGMENT_RULES` and `EXTRACT_RULES` did not change. **Not verified live:** there is no working API key on the build machine, so run `pnpm eval:ai-import` and the demo step (a Word quiz keyed in red and in bold) before trusting it. If the model does not turn a bold option into `*`, the place to say more is `EXTRACT_RULES` or `draftOptionSchema`'s description.
- **What counts as key evidence** (`keyEvidence` in `keyEvidence.ts`, three levels; the formatting rule is in `choiceMarks.ts`, with every case in `choiceMarks.test.ts`). `marked`, as before: a check mark, a lone `*`, a highlight (`=={yellow}`, not `=={color ...}`), an `X` cell, an "Answer:" line; and shading, which now follows the rule below. `formatting`, new: bold, underline or font colour. **The rule:** formatting counts only inside a choice group of two or more choices, when at least one of them and not all of them carry the mark across the whole choice. A choice group is a run of sibling list items, the lettered lines of one table cell, or the body rows of a table; a list whose numbering starts again is a new group, and an item that ends in `?` or `:` or is a label (Rationale, Note, Answer, Priority, Question 4, Step 2) is not a choice and ends the group. A lettered or numbered list needs nothing more. A bulleted list counts only when the line just before it is the question (it ends in `?`, or says "select all that apply" or "select 2"), and no list counts under a line that asks for an order ("in order", "sequence", "arrange", "rank"). In a table the header row never counts; a body row counts when every cell carries the mark; one bold, underlined or coloured cell counts only outside the first column, when another row's cell in its column is unmarked, and when the header names answer columns (two of Expected / Unexpected, Indicated / Contraindicated, Effective / Ineffective, Yes / No and the like: `ANSWER_HEADINGS`); one shaded cell needs no such header, and an empty shaded cell always counts. `formatting` stages as `ready` with `check_key` and the words "The key was read from bold, underlined or coloured text, which may not mark an answer. Check it." (`CHECK_FORMAT_KEY` in `stage.ts`; a case study prefixes "Step N: "). The code is the PDF one on purpose, so #593's "check this key" filter needs one code.
- **What that rule leaves out, on purpose.** Each of these fails safe, as `unmarked_key` or `needs_answer`: bulleted options under a stem that ends in a full stop or a colon, or with a line between the stem and the bullets; a bold letter with a plain option (`**B.** Yogurt`); one bold or underlined word inside a choice; one bold line among the unlettered lines of a table cell; a bold, underlined or coloured cell in a table whose header does not name answers; anything after a "Rationale", "Explanation" or "Feedback" heading; an option that is only a link; a table with no header row whose first row is the key (the first row of a markdown table is always its header); a matrix whose every row keys the same column with bold or shaded text (empty shaded cells do count); shading that alternates down four or more rows (banding); an option written as a plain paragraph with no letter or bullet; a choice marked inside a sentence (`a / **b** / c`); any marked step of a question that asks for an order. **What still gets through:** a highlighted or shaded value in a chart (evidence before #592 too), italics (a `*` mark, as always), and a whole-bold item in a lettered or numbered list that is not a list of options. Before #592 any grey header let a key pass with no reason at all. **#594:** the corpus document keyed in red and bold should use lettered options or a stem that ends in `?`.
- **The source check ignores markup** (`sourceText.ts`). `normalizePassage` takes out `<u>`, `</u>`, `<br>`, `=={...}`, `{shaded #...}`, `[image]`, `[text box]`, `[/text box]` and `[symbol]` before it compares, in the source and in what the model copied; `locateOpenings` steps over the same spans. A caret between two characters is dropped, so `10^3` matches `10³`. Struck-out text is tried both ways, kept and left out, since Claude is told it is not part of the question. **A new mark that holds letters must be added to `LETTERED_MARKUP`**, or it reads as a word again.
- **Chunks are joined by what was cut from between them.** `chunkSpans` (`files/text.ts`) gives each text chunk's place; `prepareFile` records `gapBefore` on each chunk, and `unitPayload` and `wholeText` join with it (`joinTextParts`). Chunk boundaries did not move, `ai_import_chunks` rows are untouched and nothing is stored, so an import in flight is not affected. #590's note stands: this does not help the two halves of one chunk, which still rely on `cutOff` and `continued`.
- **Merging** (`merge.ts`). Every question of a PDF chunk that starts on the page it shares with the chunk before is looked for among that chunk's questions on the page, as `segmentSplit.ts` does for halves. Two text questions that open with the same eight words are no longer merged at a chunk boundary: text chunks share nothing. A model that does repeat a question there now stages it twice, and the duplicate pass flags it.
- **Unmatched answers are counted on the batch, with no migration.** `finishExtraction` writes `unmatchedAnswers` (answer sections that matched no question, or more than one) and `droppedAnswers` (ones the model reported that the document does not hold) into `ai_import_batches.source`, beside `objectives` and `references`; the column's check asks only for an object with those two lists. `readReviewBatch` returns them as `answers` (0 for a batch finished earlier), and the review page shows one sentence each above the entries (`answerNotes`), for example "3 answers in the document could not be matched to a question. Check the questions that need an answer." **#593:** this is a `Notice` in the page, not in `AiImportReview`; move it when the review is rebuilt. Which answers, and their text, are not kept: showing them needs a column or the segments read again.
- **#594:** worth a corpus document each for a Word quiz keyed in red and bold (expect `ready` with `check_key`), a text file long enough for three chunks with a question that opens the second, and a PDF with two questions that start on a shared page. `docxKeys.test.ts` is the demo step with a stub model, and is the shape to copy.
- **Files accepted.** A PDF with only a permissions (owner) password is opened with the empty password and its chunks are cut as plain PDFs; one that needs a password to open, or is locked with a certificate or a cipher the library does not have, is still `encrypted`, and an encrypted PDF that is damaged is `corrupt`. An encrypted PDF's object streams cannot be decoded to be counted before they are decrypted, so they are bounded by their size at deflate's best ratio (`guardEncryptedPdfStreams`): more than about 63 KB of them is refused as `too_complex`. That is safe but strict, and a long restricted PDF saved with object streams will be refused; a real count needs the library's cipher, which its package does not export. A .docx's main part is found through `_rels/.rels` (`files/docx/package.ts`), with `numbering.xml` and `styles.xml` read from beside it, and `word/document.xml` as the fallback.
- **Left out:** Playwright screenshots of the review page with the new notice (no local stack on the build machine; `e2e` uses the fake client, which reports no answer sections, so the notice does not appear in CI). Paragraph shading, colour and underline that come from a style, not the run, are not read.

Notes from #593 for the stories after it (`src/lib/aiImport/review/caseStudy.ts`, `split.ts`, `fixRead.ts`, `src/lib/authoring/aiImportCaseStudy.ts`, `sourceMarkup.ts`, `src/components/authoring/AiImportReview*.tsx`, `AiImportImportPanel.tsx`, `AiImportCaseStudyActions.tsx`, `AiImportSource.tsx`):

- **A case study has two ways out, not a builder** (owner decision 2026-11-17). _Add the key per step:_ a staged case study whose `item` holds its six step questions lists each step that has no key, or was flagged with something a save answers, as a link to `/author/banks/[bankId]/ai-import/[batchId]/[entryId]?step=N`. That page is the question editor on the step's own question, with the case study's patient record beside it when the record is whole. Save is `saveAiImportEntryFix` with `step`: the form must be a whole, valid question of the step's stored type, the step keeps its stored id and its place sets `cjmmStep`, and `withStepSaved` puts it back. The case study is `ready` once every step is keyed and the whole passes `caseStudySchema`; if it then fails, the reason says "Step N is not complete yet." or "The patient record is not complete yet.", never a schema's message. _Split:_ `splitAiImportCaseStudy` replaces the entry with six staged questions (`splitSteps`), each with the status a single question gets and a `note` reason, 'Split from the case study "…". The patient record was not attached.'. Nothing of the patient record, the title or "Shows from step" can be edited in review: a case study whose record could not be built (`item` is null) can only be split or dropped.
- **Where a split puts the steps.** The case study's own row becomes step 1 (`kind` changes to `item`), and steps 2 to 6 are inserted at the next five free positions after it inside the file's thousand (`placeSteps`). Those are the steps' own positions from the segment pass, which a case study never used, so Change type on a split step reads the right question again. It refuses in words when the batch would pass 150 entries (`split_too_many`), when the file has no five free places left or a step's draft cannot be read (`cannot_split`), for a dropped entry or a question (`not_splittable`), and at a removed file's place (`not_found`). The five inserts and the update are two statements with the service client; if the update finds the case study changed, the five are deleted again. A database function would make it one transaction; this story had no migration.
- **Extract only still holds in a split.** A step taken from the case study's `item` was already checked. A step taken from the draft (the case study had no item) is staged as `stageQuestion` would: a key the document does not show becomes `needs_fix` with no item and `unmarked_key`. A case study's `draft` now carries what that needs beside the model's output: `opening` (step 1's opening words), `keys` (`shown`, `formatting` or `none` for each step) and `unchecked` (true for a key read from a PDF or an unchecked answer section). A batch staged before #593 has none of the three: the first step named by an `unmarked_key` reason and every keyed step after it are treated as unshown, and a PDF's keys all get `check_key` (the entry's chunk has pages).
- **`source_excerpt` is the question's whole part of the document** for a text source (`sourceOf` in `stage.ts`: the region `regionsOf` already computed, cut at 20,000 characters with a `[…]` line), a case study's six parts joined; for a PDF, and for a question whose part was not found, it is still the opening words. `StagedEntry.opening` keeps the opening for the eval (`test/ai-import/pipeline.ts`). The review reads each entry's chunk for `page_from` and `page_to`, and a PDF entry says "Opening words only. Check the rest on pages 3 to 10 of file.pdf." A chunk is about 8 pages, so that is the range the question was read from, not its exact page. Showing a PDF question's own text needs the text layer kept at upload, which is a column or a table.
- **Marks are drawn, not shown as punctuation** (`parseSource`, `AiImportSource`): `**bold**`, `<u>underline</u>`, `~~struck~~` and `<br>` as themselves; a highlight or shading (`=={yellow}`, `=={#FFFF00}`) as a `<mark>` in the app's flag colour; font colour (`=={color …}`) as a dotted underline; `{shaded #…}` as a small "Shaded" label. One legend line explains whichever of the last three are on screen. An unclosed mark stays as text. The document's own colours are not reproduced, on purpose (contrast in both themes). **A new converter mark must be added to `MARK` in `sourceMarkup.ts`** as well as to `LETTERED_MARKUP`, or it shows as punctuation. Italics (`*word*`) are left as typed, since a lone `*` is an answer mark.
- **Duplicates compare stem-less entries by their first twelve words.** `entryStem` falls back to `openingKey(draft.opening ?? source_excerpt)`, so a question with no NGN type matches between a .pdf (opening only) and a .docx (whole part). `refreshBatchDuplicates` works the batch's own flags out again after a drop, a restore, a bulk drop, a save and a split; it reads stems only (never `source_excerpt`), so an entry with no stem and no `draft.opening` keeps the flag it has, and the workspace-wide flag stays as `finishExtraction` computed it. Each rewritten entry's version goes up by one, and the drop and restore answers carry those new versions (`changed`) so the page does not send a stale one.
- **Reasons.** A case study's step is "Step 3: …" in every reason (it was `steps.2: …`); `stepOfReason` reads both, so older batches still work. A schema failure is one plain sentence (`NOT_BUILT`, `caseIssueReasons`), not `path: message`; the repair call still gets the paths (`Converted.problems`), and `Converted.fixes` holds the converter's own sentences. Reworded: the type guess (no score), "no NGN item type", "staged on its own", and "chart" in `src/lib/ngn/draft` (now "patient record"). Stored reasons on existing batches keep their old words. The converter still says "the source" where a teacher would say "the document"; that is about forty sentences in `src/lib/ngn/draft` and was left.
- **The filter and the place are in the address.** `?show=<filter>` on the review (read on the server as `initialFilter`, written with `history.replaceState`), each card is `#entry-<id>`, and the edit page carries `show` so "Back to the review", the breadcrumb and "next" all return to the same filter and card. "Save and go to the next one" is `ItemEditorHost.saveAndGo`, a second button on a Save-only editor; the next target is worked out when the page loads (`attentionTargets`, `nextTarget`: questions and case study steps that need attention, in review order, going round to the start). The edit page's breadcrumbs are `Breadcrumbs guarded`.
- **A card that leaves the filter** hands its confirmation to one line under the filters (`AiImportReviewFilters`, `data-testid="review-notice"`), which takes the focus. Bulk drop, split and a change of type that moves a card out of the filter use the same line.
- **Import asks first** (`AiImportImportPanel`): the counts, the quiz, what is left out, and that the files are deleted. The answer-section sentences from #592 moved from a `Notice` on the page into this panel (`notes`).
- **Imported drafts are only partly findable.** Both "Imported" screens link to the quiz with `?status=draft`. That lists every draft question of the quiz, not only this import's, and case studies are hidden while a filter is on. `import_ai_batch` returns counts, not ids. Marking exactly what an import added needs a column (`items.ai_import_batch_id`) or the function returning ids, so a migration. Within one import, every item's `created_at` equals the batch's `imported_at` (one transaction), which a later story could filter on without one.
- **Left out:** regrouping loose questions into a case study; changing a type by hand; editing a keyed step that is not flagged (only steps with no key or a flag get a link); releasing a failed Change type's claim (#591's note stands).
- **Baselines.** The gallery page (`/gallery/ai-import`) passes no `dropAll` or `split`, so `ai-import-review.png` and `public/help/ai-import-review.png` should not have changed; if the visual check disagrees, regenerate with the `e2e baselines` workflow. New screenshots are written, not compared: `ai-import-review-attention.png`, `ai-import-fix-next.png`, `ai-import-confirm.png`, `ai-import-case-study.png`, `ai-import-split.png`.
- **Not run locally:** Playwright, the Supabase stack and `pnpm dev` (the build machine is short on memory). The new e2e tests in `aiImportFix.spec.ts` and the wider grep in `aiImportReview.spec.ts` have only been run by CI.

## S13: Registration + onboarding (milestone 15)

Demo 14: a stranger signs up as a teacher, makes a class, and a stranger signs up as their student and joins by code, with no help from the owner.

Sprint 13 closes the account loop that password sign-in (#353, #354) left open: there is no way to create an account without a class invite, and no way to become an instructor without the owner's SQL. The decision record is `docs/adr/0009-self-serve-registration.md`.

| #                                                           | Title                                                                                       | Gates             | Status                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------- | --------------------------- |
| [#355](https://github.com/tannernielson27/learn/issues/355) | feat(db): a workspace for each self-registered teacher, and a per-account onboarding record | security, db      | Merged (#369); pushed       |
| [#356](https://github.com/tannernielson27/learn/issues/356) | feat(classes): a short class code a student can type to join                                | security, db, e2e | Merged (#375); needs push   |
| [#357](https://github.com/tannernielson27/learn/issues/357) | feat(ui): a Dialog primitive for popups                                                     | none              | Merged (#370)               |
| [#358](https://github.com/tannernielson27/learn/issues/358) | feat(account): ask for a name, show it, and let people change it                            | security, e2e     | Merged (#373); no migration |
| [#359](https://github.com/tannernielson27/learn/issues/359) | feat(auth): abuse controls for open sign-up: a CAPTCHA, a rate limit and hosted Auth checks | security          | Merged (#371, #372)         |
| [#360](https://github.com/tannernielson27/learn/issues/360) | feat(email): a welcome email that confirms the address of a new account                     | security          | Merged (#374); no migration |
| [#361](https://github.com/tannernielson27/learn/issues/361) | feat(auth): a sign-up page for teachers and students                                        | security, e2e     | Merged (#377)               |
| [#362](https://github.com/tannernielson27/learn/issues/362) | feat(student): join a class by code, and a way forward for an account with no class         | security, e2e     | Merged (#379); no migration |
| [#363](https://github.com/tannernielson27/learn/issues/363) | fix(auth): send each person to their own home after sign-in                                 | none              | Merged (#380)               |
| [#364](https://github.com/tannernielson27/learn/issues/364) | feat(onboarding): a three-step welcome for a new teacher                                    | e2e               | Merged (#381); no migration |
| [#365](https://github.com/tannernielson27/learn/issues/365) | feat(onboarding): a short welcome for a new student                                         | e2e               | Merged (#382); no migration |
| [#366](https://github.com/tannernielson27/learn/issues/366) | docs(onboarding): put sign-up on the landing page and retire the invite-only wording        | e2e               | Merged (#383)               |
| [#367](https://github.com/tannernielson27/learn/issues/367) | test(e2e): the whole registration walk, security rows and the S13 demo                      | security, e2e     | Merged (#384)               |

Suggested order: #355, #356, #357, #358, #359 and #360 depend on nothing and can start at once. Then #361 (needs #355 and #359) and #362 (needs #356); then #363, #364 and #365; #366 after #361; #367 last.

Parallelization: on the owner's machine, one builder at a time. Agents elsewhere can take the first six together. #358, #361 and #362 all touch the sign-in and account components, and #362 and #365 both edit the student home (`src/app/learn/page.tsx`); never build two of either group at once. #355 and #356 are the only migrations; hold each merge until the owner can push.

Reserved migrations:

- `20261006000000_self_serve_instructors.sql` (#355)
- `20261006010000_class_join_code.sql` (#356)

Owner decisions, 2026-10-06. They replace S9 decision 1 (invite-only) and S11 kickoff decision 1 (no sign-up on the landing page):

1. **Teacher sign-up is open, and each self-registered teacher gets their own workspace** (#355, #361). The existing shared org stays as it is; `make_instructor` remains for adding a colleague to it.
2. **A class has a short typed code as well as its link** (#356, #362), so a student can sign up first and join after.
3. **The sign-up form may say "This email already has an account"** (#361), behind a CAPTCHA and a rate limit (#359). This relaxes #139 on that form only; sign-in still answers every address alike.
4. **Confirming the email never blocks anything**, for teachers as for students (#360, #361).

Decisions taken at kickoff, each the conservative option; say if any should change:

1. **AI import is off for a self-registered workspace** until the owner turns it on (`orgs.ai_import_enabled`, #355; noted on #342), so open sign-up cannot spend the owner's API key.
2. **The CAPTCHA is Cloudflare Turnstile** (#359): free, no npm dependency, and skipped when its keys are unset.
3. **Hosted Supabase's own sign-up endpoint is turned off** (#359). The app creates every account through the admin API, so the public endpoint only offers a way around the site's limits.
4. **A student who signs up without a code has no role until they join a class** (#361, #362). They land on `/welcome`, which replaces the "No access yet" dead end. No "intent" is stored.
5. **The welcome popups show once per account, stored in the database** (`profiles.onboarded_at`, #355), and only to accounts made after this sprint. The Get started checklist stays as it is.
6. **Live sessions stay account-free** (join code and display name), as Kahoot and Socrative do.
7. **Google sign-in (#67) is not in this sprint.**
8. **A student still belongs to one workspace.** A student of one teacher cannot join another teacher's class with the same account. Known gap, to be shown in the demo; fixing it means per-class rather than per-org student membership.

## S14: Stakeholder feedback (milestone 16)

Only the stories this file has been told about are listed here; the milestone on GitHub has the rest.

| #                                                           | Title                                                                                             | Gates             | Status                                                                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#334](https://github.com/tannernielson27/learn/issues/334) | feat(ngn): reveal and lock a case study's chart step by step (fromStep, stepAccess, recordAtStep) | none              | Merged (#424); no migration; owner confirms hidden/locked/open                                                                                                                             |
| [#335](https://github.com/tannernielson27/learn/issues/335) | feat(player): serve each case study step only the chart it has reached                            | security, e2e     | Merged (#435); `20261014200000_assignment_record_column_grant` applied 2026-10-14                                                                                                          |
| [#336](https://github.com/tannernielson27/learn/issues/336) | feat(authoring): set when each tab of a case study's chart appears and opens                      | e2e               | Merged (#438); no migration                                                                                                                                                                |
| [#406](https://github.com/tannernielson27/learn/issues/406) | fix(live): page the progress board read past 1,000 answers                                        | none              | Merged (#422); no migration                                                                                                                                                                |
| [#407](https://github.com/tannernielson27/learn/issues/407) | perf(live): fewer round trips when the host advances                                              | security, db      | Merged (#428); `20261013120000_open_session_view` applied 2026-10-14; load run at 100 owed                                                                                                 |
| [#409](https://github.com/tannernielson27/learn/issues/409) | fix(auth): a full class signing in from one network                                               | security          | Merged (#439); no migration; owner sets the hosted Auth rate limits (docs/05 §7.7 step 4)                                                                                                  |
| [#411](https://github.com/tannernielson27/learn/issues/411) | feat(authoring): library folders that hold quizzes                                                | db, e2e           | Merged (#433); `20261014000000_library_folders` applied 2026-10-14                                                                                                                         |
| [#412](https://github.com/tannernielson27/learn/issues/412) | feat(authoring): rename and trim, teacher home and quiz page                                      | e2e               | Merged (#429); no migration; leftovers in the wording cleanup PR                                                                                                                           |
| [#413](https://github.com/tannernielson27/learn/issues/413) | feat(authoring): rename and trim, editors and case study builder                                  | e2e               | Merged (#434); no migration                                                                                                                                                                |
| [#414](https://github.com/tannernielson27/learn/issues/414) | feat(live): rename and trim, host console, join and student room                                  | e2e               | Merged (#431); no migration; leftovers in the wording cleanup PR                                                                                                                           |
| [#415](https://github.com/tannernielson27/learn/issues/415) | feat(student): rename and trim, student home, practice and assignments                            | e2e               | Merged (#432); no migration; class components fixed in the wording cleanup PR                                                                                                              |
| [#416](https://github.com/tannernielson27/learn/issues/416) | docs(help): rename and trim, landing, onboarding, help and emails                                 | e2e               | Merged (#430); owner re-pastes `magic_link.html`; "Sample bank" name open                                                                                                                  |
| [#417](https://github.com/tannernielson27/learn/issues/417) | feat(authoring): move questions between quizzes, and turn a folder into a quiz                    | db, e2e, security | Merged (#437); `20261014300000_move_between_quizzes` applied 2026-10-14                                                                                                                    |
| [#426](https://github.com/tannernielson27/learn/issues/426) | perf(live): students stop receiving presence; the count comes from session state                  | db                | **Draft PR**, not to merge until measured: hosted before/after at 100 waits on #405 (docs/load-testing.md); closed unmerged if the saving is small; `20261016010000_room_count` not pushed |

With #426 (draft PR) a phone tracks itself in Presence and is sent nobody else's: "12 in this session" becomes `participant_count` on `live.session_public_state`, written with each state change and by the host console's `refresh_participant_count` (at most once every 3 s, only for someone new). Reading Realtime's server source showed the client change alone would not stop the messages, because a socket that tracks has presence turned on for it; the migration also takes presence out of what a participant's token may read. The count is now everyone who has joined, so a phone that has left is still counted, as its name stays (greyed) on the host's roster.

With #335 (PR #435) a student is sent the chart of each step they have reached and nothing later: live, by the play page and every view the phone fetches when the host moves; practice and take-home, the steps up to the first unanswered one and each one's chart. Until its migration is pushed, a student's own client can still select `assignments.patient_record` directly. With #336 (PR #438) the case study's patient record editor sets both, step by step, and saving a staged record keeps them.

## S15: Billing

Demo: a stranger signs up as a teacher, starts a free trial in the Stripe sandbox, and their workspace turns read-only when the trial is cancelled, while their student finishes an open assignment.

A workspace pays $39.99 a month, flat, for up to 10 teachers, after a 7-day free trial with a card at Checkout. The decision record is `docs/adr/0016-billing.md`; the owner's Stripe steps are docs/05 §7.15. Issue titles keep the words they were filed with; the interface follows docs/glossary.md ("subscription", "free trial", "Billing", "beta access"; never "paywall").

| #                                                           | Title                                                                             | Gates             | Status                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| [#514](https://github.com/tannernielson27/learn/issues/514) | docs(billing): ADR 0016, glossary and owner steps for the paywall                 | none              | In review; ADR is 0016, not the 0013 of the issue title; no migration |
| [#515](https://github.com/tannernielson27/learn/issues/515) | chore(infra): production Supabase project split before live billing               | none              | To do; owner steps in docs/05 §7.3; blocks every live Stripe key      |
| [#516](https://github.com/tannernielson27/learn/issues/516) | chore(infra): learnursing.app domain and Stripe account activation                | none              | To do; owner steps in docs/05 §7.15 steps 3 and 4                     |
| [#517](https://github.com/tannernielson27/learn/issues/517) | feat(db): workspace billing state, access grants and the access check             | security, db      | In progress (`feat/517-billing-tables`)                               |
| [#518](https://github.com/tannernielson27/learn/issues/518) | feat(billing): Stripe library, webhook and catalog script                         | security          | To do; needs #517                                                     |
| [#519](https://github.com/tannernielson27/learn/issues/519) | feat(billing): free trial, subscribe and manage billing on the workspace page     | e2e               | To do; needs #518                                                     |
| [#520](https://github.com/tannernielson27/learn/issues/520) | feat(billing): private beta passes the owner issues and revokes                   | security          | To do; needs #517                                                     |
| [#521](https://github.com/tannernielson27/learn/issues/521) | feat(billing): enforce access in the app and the database behind BILLING_ENFORCED | security, db, e2e | In review (`feat/521-billing-enforcement`)                            |
| [#522](https://github.com/tannernielson27/learn/issues/522) | feat(billing): trial and payment banners, pricing, terms and privacy pages        | none              | To do; needs #519                                                     |
| [#523](https://github.com/tannernielson27/learn/issues/523) | test(billing): end-to-end walk, sandbox walk and go-live checklist                | e2e               | To do; last; gates docs/05 §7.15 step 11                              |

Suggested order: #514 first. #515 and #516 are the owner's and can run alongside everything else, but both must be done before any live key (docs/05 §7.15). Then #517; #518 and #520 after it; #519 after #518; #521 after #519 and #520; #522 after #519; #523 last.

Parallelization: #517, #520 and #521 each add a migration; never build two migrations at once, and number them at merge time. #519, #521 and #522 all edit the workspace page and the author session (`src/app/author/workspace/page.tsx`, `src/lib/authoring/session.ts`); build them one at a time.

Owner decisions, 2026-10-27, all final:

1. **Flat $39.99 a month per workspace**, up to 10 teachers (the existing cap). Not per teacher. Students never pay.
2. **A 7-day free trial through Stripe's hosted Checkout, card required**, which converts to paid on its own.
3. **A lapsed workspace is read-only for teachers**: view, export, reports and Billing work; creating, editing, starting, assigning and inviting do not. Open assignments run to their close. Students never see a billing message.
4. **Beta testers get a private beta pass**, an owner-issued link bound to one address and used once, which gives free access until revoked. Nothing in the interface hints it exists. No Stripe promotion codes.
5. **Every self-registered workspace that exists when billing ships is grandfathered** until revoked. The shared LeaRN workspace is exempt.
6. **The production Supabase split happens before live Stripe keys**, and no Stripe key goes into Vercel Preview until then.
7. **The production domain becomes `learnursing.app`.**

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
| [#159](https://github.com/tannernielson27/learn/issues/159) | fix(auth): a sustained lockout of one author's only sign-in path is still cheap           | auth, security     | **Owner decision**; ceiling alerts added (docs/05 §7.9 step 8)     |
| [#161](https://github.com/tannernielson27/learn/issues/161) | test(authoring): prove every author-writable table is counted, rather than remembering to | authoring, db      | Merged (#174)                                                      |
| [#163](https://github.com/tannernielson27/learn/issues/163) | test(db): fail the run when a pgTAP file stops short of its plan                          | db                 | Merged (#175)                                                      |
| [#164](https://github.com/tannernielson27/learn/issues/164) | fix(player): recover from render errors outside the question renderer                     | player, live       | Merged (#173)                                                      |
| [#67](https://github.com/tannernielson27/learn/issues/67)   | feat(auth): sign in with Google                                                           | auth, security     | Blocked: owner creates the Google OAuth client                     |
| [#49](https://github.com/tannernielson27/learn/issues/49)   | feat(player): place per-element rationale inline in the pointer-heavy renderers           | player             | Merged (#172)                                                      |
| [#50](https://github.com/tannernielson27/learn/issues/50)   | chore(types): stop casting away the optionality of answerKey and rationale                | player             | Merged (#169)                                                      |
| [#54](https://github.com/tannernielson27/learn/issues/54)   | perf(player): load item renderers per type                                                | player             | Merged (#170)                                                      |
| [#55](https://github.com/tannernielson27/learn/issues/55)   | perf(player): Submit and drop interactions over 200 ms at 4x CPU                          | player             | Merged (#171)                                                      |
| [#58](https://github.com/tannernielson27/learn/issues/58)   | fix(bowtie): a pair's second slot cannot hold a choice alone                              | a11y               | Merged (#167)                                                      |
| [#59](https://github.com/tannernielson27/learn/issues/59)   | fix(a11y): a disabled Submit cannot say why                                               | a11y               | Merged (#166)                                                      |
| [#60](https://github.com/tannernielson27/learn/issues/60)   | fix(a11y): smaller screen-reader findings                                                 | a11y               | Merged (#168)                                                      |
| [#61](https://github.com/tannernielson27/learn/issues/61)   | chore(a11y): run the case study with NVDA and VoiceOver                                   | a11y               | To do; needs a person with the screen readers                      |
| [#325](https://github.com/tannernielson27/learn/issues/325) | feat(player): give matrix, drop-down and drag-drop marks the left-rule treatment          | player             | In review (PR open); owner approves screenshots before merge       |
| [#326](https://github.com/tannernielson27/learn/issues/326) | fix(authoring): the preview keeps old marks after the answer key is edited                | authoring          | To do                                                              |
| [#327](https://github.com/tannernielson27/learn/issues/327) | fix(assign): mark the instructor's report against the key each answer was scored with     | assign, db         | To do; builds on #320's `reveal` column                            |
| [#328](https://github.com/tannernielson27/learn/issues/328) | docs(deploy): mark migrations 39 and 40 as applied to hosted                              | docs               | In review                                                          |
| [#356](https://github.com/tannernielson27/learn/issues/356) | feat(classes): a short class code a student can type to join                              | classes, db        | In review; `20261006010000_class_join_code`, after #369; db push   |
| [#358](https://github.com/tannernielson27/learn/issues/358) | feat(account): ask for a name, show it, and let people change it                          | auth, account      | In review; no migration                                            |

## Owner actions outside GitHub

These block the live site rather than a single issue.

**Go-live audit, 2026-09-26** (read-only, evidence from `supabase`, `vercel env ls`, `gh` and `pnpm golive:check` against production and `vauokqoyvewtzubqajgh`; 4 pass, 4 fail, 5 manual). Where things stand:

- **No production project yet.** `supabase projects list` shows only `learn` (`vauokqoyvewtzubqajgh`), and Vercel Production still points at it. Everything below that says "done on `vauokqoyvewtzubqajgh`" has to be repeated in the production project after the §7.3 split.
- **Done on `vauokqoyvewtzubqajgh`:** all 38 migrations applied; pg_cron and pg_net on; `learn-assignment-reminders` and `learn-rate-limit-sweep` scheduled and active; both Vault secrets (`learn_reminders_url`, `learn_cron_secret`) created; the Data API exposes only `public` and `graphql_public`.
- **Done in Vercel:** `RESEND_API_KEY` and `EMAIL_FROM` in Production; `EMAIL_FROM` in Preview (Preview has no `RESEND_API_KEY`); `DEMO_ACCOUNT_*` removed from every scope.
- **Missing in Vercel:** `CRON_SECRET` (the reminder route answers pg_net `503 not_configured` every 15 minutes until it is set) and all five `SENTRY_*` variables.
- **Backups:** the age key exists and both repo secrets are set, but the first run by hand (36275256043) failed while dumping roles (`error running container: exit 1`), most likely a `PROD_DB_URL` that is not the session pooler on port 5432 or has an unencoded character in its password. Point it at the production project once that exists.
- **Still open:** #178 (golive: `FAIL`), Realtime public access, SMTP, the magic-link template, the Auth rate limit and URLs, Sentry, the restore drill, the plan choice, and #159.

- **Turn off Realtime "Allow public access"** in the Supabase project settings. It unblocks #178, which drops the last open select policy on `live.session_public_state`.
- **Author accounts are now created by hand** (#139, merged in #157). Sign-in no longer creates accounts, so a new instructor exists only once added under Authentication, Users, Add user. **Since #204 that is two steps**: Add user, then `select private.make_instructor('<address>');` in the SQL editor (docs/05 §7.6); without the second step the account lands on "No access yet". The sign-in form answers identically whether or not an address has an account, so a mistyped or unregistered address will appear to succeed and simply never receive a link.
- **Sprint 9 email (#206)**: in Resend, confirm info.tannernielson.com is verified; in Supabase, set custom SMTP to Resend and raise the Auth email rate limit. The exact steps are in docs/05 §7.7. Vercel Production has `RESEND_API_KEY` and `EMAIL_FROM` (2026-09-26); Preview still needs its own `RESEND_API_KEY`.
- **Before any real student gets an invite**, create the production project and replay migrations (§7.3). Sprint 9 puts student emails in the database.
- **Sprint 10 monitoring (#235)**: create a Sentry project (free tier) and add the five variables in docs/05 §7.9 (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`) to Vercel Production and Preview. None are set yet.
- **Sprint 10 backups (#236)**: the age key pair exists and `BACKUP_AGE_RECIPIENT` and `PROD_DB_URL` are set (2026-09-26), but the first run failed (see the audit above). Fix `PROD_DB_URL`, point it at the §7.3 project once it exists, run it by hand, then do the restore drill (docs/05 §7.10).
- **Production plan: Pro** (chosen 2026-10-20, ahead of #405's hosted run). `learn` moved from Nano to Micro on 2026-10-21.
- **Compute for a live class** (#405, docs/load-testing.md "Hosted"): Micro keeps a class of 100 waiting 2–5 s for each answer to land; Large keeps it under a second. Resize `learn` to Large about an hour before a class of 100 or more and back to Micro after (about $0.15 an hour; each change is about 2 minutes of downtime, so never during a session). Small and Medium are no faster than Micro: the same two shared cores.
- **Campus Wi-Fi and Vercel's challenge** (#405): about 20 quick requests from one address draw Vercel's security challenge (`X-Vercel-Mitigated: challenge`), and a class on campus Wi-Fi reaches Vercel from a few addresses (`128.187.0.0/16`). The load preview has a system bypass for that range. Whether a real phone recovers from a challenge mid-session is not tested; before a class, add the same bypass for the production domain (`vercel firewall system-bypass add 128.187.0.0/16 --domain learn-tanner-nielsons-projects.vercel.app`, CLI 65 or later).
- **Decide #159**: whether to accept that four cheap IPs can hold one author's sign-in closed indefinitely, or pay for one of the mitigations listed there. The alerting option is in: every per-address ceiling refusal (link, password, code) now sends an address-free Sentry warning tagged `auth.ceiling`. Once Sentry is set up, add the alert rule in docs/05 §7.9 step 8. Four networks can fill the link and password ceilings together, so the emailed link is not a way round a password lockout. The decision on automatic mitigation or a second way in stays open.
- **Sprint 11: paste the regenerated magic-link template** (#268, merged in #278). `supabase/templates/magic_link.html` is now generated from `src/lib/email/templates/magicLink.ts`. Paste it into Authentication, Emails, Magic Link in every hosted project (docs/05 §7.7). The link is unchanged, so the old copy keeps working until then.
- Done 2026-09-22: Vercel Production and Preview both carry `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `SUPABASE_JWT_SIGNING_KEY`. `DEMO_ACCOUNT_*` was removed from Production by 2026-09-26 (§7.11 step 2). The hosted demo user exists as an instructor in the seeded LeaRN org.
- Supabase Authentication, URL Configuration: Site URL and redirect URLs for production, previews and localhost.
- Supabase magic-link template: paste `supabase/templates/magic_link.html`. Email sign-in still needs it; the demo account (#115) works without it.
- Done 2026-09-22 on `vauokqoyvewtzubqajgh`: migration history repaired (rows 1–3 had been applied by hand under other versions), rows 4–16 pushed with `supabase db push`, and `seed.sql` loaded. Row 17 (#149, `20260921210000_private_live_channel`) applied after #176 merged. A separate production project (below) still needs the full replay.
- Split production into its own Supabase project. The code landed in #136 (ADR 0006 supersedes ADR 0005); the eight owner steps are written out in `docs/05-VERSION-CONTROL-AND-DEPLOY.md` §7.3. Order matters: `seed.sql` before creating the demo user, and never run `seed-demo.sql` against a hosted project.
- **Do not add `live` to the exposed schemas** in either Supabase project. That dashboard setting is what keeps the session-state mirror off the Data API.
- Nothing to set for `LIVE_PARTICIPANT_SECRET`: #131 shipped it as a placeholder and #133 deleted it. If it was set on a deployment, remove it.
- While creating that project, consider raising its **auth rate limits**. Supabase's default is 30 sign-ins per five minutes and it applies to the deployment's egress address as a whole, not per student — so it, not #134's per-IP limit, is what constrains a NAT'd classroom.
