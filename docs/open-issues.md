# Open issues

A running log of every open issue, grouped by milestone. Update it when an issue is filed, started, merged or closed.

Last updated: 2026-09-19 (Sprint 6 closed, demo and retro in docs/sprints/S6-demo.md; Sprint 7 filed, #127-#134 plus #46 and #56).

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

| #                                                           | Title                                                                   | Gates                       | Status                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------ |
| [#127](https://github.com/tannernielson27/learn/issues/127) | chore(infra): split production onto its own Supabase project            | infra, db, security         | To do; **owner creates the project**; ADR 0005 -> 0006 |
| [#56](https://github.com/tannernielson27/learn/issues/56)   | chore(architecture): move scoring off the client                        | player, security            | To do; settles the submit shape                        |
| [#46](https://github.com/tannernielson27/learn/issues/46)   | chore(architecture): deliver case study answer keys per step, at reveal | player, security            | To do; before the live player                          |
| [#128](https://github.com/tannernielson27/learn/issues/128) | feat(live): a session model with a six-character join code              | live, db, security          | To do                                                  |
| [#130](https://github.com/tannernielson27/learn/issues/130) | feat(live): a LiveSessionTransport interface with an in-memory adapter  | live                        | To do; ADR 0002 review belongs in this PR              |
| [#129](https://github.com/tannernielson27/learn/issues/129) | feat(live): join a session with a display name and no account           | live, security, e2e         | To do; needs #128                                      |
| [#131](https://github.com/tannernielson27/learn/issues/131) | feat(live): the Supabase Realtime adapter                               | live, db, security          | To do; needs #128, #130, #56                           |
| [#132](https://github.com/tannernielson27/learn/issues/132) | feat(live): lobby with presence and instructor-paced mode               | live, e2e                   | To do; needs #129, #131                                |
| [#133](https://github.com/tannernielson27/learn/issues/133) | feat(live): answer a live item from a phone                             | live, player, security, e2e | To do; needs #132, #56                                 |
| [#134](https://github.com/tannernielson27/learn/issues/134) | fix(auth): rate limit sign-in per IP                                    | auth, security              | To do; carries the S6 gap                              |

Suggested order: #127 prod split, then #56 and #46 (serial, same scoring path), then #128 session model, #130 transport and #134 sign-in limit in parallel, then #129 join and #131 adapter in parallel, then #132 lobby and #133 live answer one at a time.

Parallelization: #132 and #133 both edit the host and student screens — never build them at once. Sprint 6 showed that two agents on one page is where the damage comes from.

## No milestone

| #                                                           | Title                                                                           | Area           | Status                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------- | ------------------------------------------------- |
| [#115](https://github.com/tannernielson27/learn/issues/115) | feat(auth): sign in to a shared demo account without email                      | auth, security | Merged (#116); owner creates the hosted demo user |
| [#123](https://github.com/tannernielson27/learn/issues/123) | fix(authoring): enforce the authoring rate limit where the write happens        | authoring, db  | To do; found on #109                              |
| [#67](https://github.com/tannernielson27/learn/issues/67)   | feat(auth): sign in with Google                                                 | auth, security | Blocked: owner creates the Google OAuth client    |
| [#49](https://github.com/tannernielson27/learn/issues/49)   | feat(player): place per-element rationale inline in the pointer-heavy renderers | player         | To do                                             |
| [#50](https://github.com/tannernielson27/learn/issues/50)   | chore(types): stop casting away the optionality of answerKey and rationale      | player         | To do                                             |
| [#54](https://github.com/tannernielson27/learn/issues/54)   | perf(player): load item renderers per type                                      | player         | To do                                             |
| [#55](https://github.com/tannernielson27/learn/issues/55)   | perf(player): Submit and drop interactions over 200 ms at 4x CPU                | player         | To do                                             |
| [#57](https://github.com/tannernielson27/learn/issues/57)   | chore(design): three font families against a two-family guideline               | player         | To do                                             |
| [#58](https://github.com/tannernielson27/learn/issues/58)   | fix(bowtie): a pair's second slot cannot hold a choice alone                    | a11y           | To do                                             |
| [#59](https://github.com/tannernielson27/learn/issues/59)   | fix(a11y): a disabled Submit cannot say why                                     | a11y           | To do                                             |
| [#60](https://github.com/tannernielson27/learn/issues/60)   | fix(a11y): smaller screen-reader findings                                       | a11y           | To do                                             |
| [#61](https://github.com/tannernielson27/learn/issues/61)   | chore(a11y): run the case study with NVDA and VoiceOver                         | a11y           | To do; needs a person with the screen readers     |

## Owner actions outside GitHub

These block the live site rather than a single issue:

- Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Vercel (Production and Preview), then redeploy.
- Supabase Authentication, URL Configuration: Site URL and redirect URLs for production, previews and localhost.
- Supabase magic-link template: paste `supabase/templates/magic_link.html`. Email sign-in still needs it; the demo account (#115) works without it.
- Demo account (#115): create the hosted demo user (Authentication, Users, Add user, auto-confirm) and set `DEMO_ACCOUNT_EMAIL` and `DEMO_ACCOUNT_PASSWORD` in Vercel. Remove them before real students use the site. Known gap: the demo action has no rate limit of its own (neither has the email one), so heavy use can trip Supabase's per-IP auth limit for everyone signing in through Vercel. #111's per-user limit covers authoring actions only; sign-in needs a per-IP limit.
- Apply the merged migrations to the hosted project, in order: `20260916000000_bank_folders` (confirm), `20260919000000_item_tags`, `20260919110000_start_step_and_rate_limits`, `20260919120600_duplicate_content`, `20260919130000_item_search`, `20260919150000_import_into_folder`, `20260919160000_archive_content`. Until `start_step_and_rate_limits` is applied, production refuses every save, publish and import.
- Before Sprint 7: split production into its own Supabase project (ADR 0005). Owner decided 2026-09-19 that this is Sprint 7 story 1.
