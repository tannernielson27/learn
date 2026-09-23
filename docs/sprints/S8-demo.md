# Sprint 8 — Demo

**Goal:** the instructor dashboard. Per-item live results for every item type, the answer shown to the whole room, a timer, skip and go back, a whole case study run live, student-paced mode with a progress board, and a session report with CSV.
**Status:** code complete 2026-09-23, built overnight while the owner was away. Stories #179–#187 merged, plus #193 found along the way; `main` at 139ae57.
**Production:** https://learn-tanner-nielsons-projects.vercel.app
**Repo:** https://github.com/tannernielson27/learn

> **Hosted database:** caught up. Every Sprint 8 migration was applied to `vauokqoyvewtzubqajgh` straight after its PR merged (dry run first, then `supabase db push`), so production and `main` agree: 21 migrations. The separate production project (§7.3) still does not exist, so production and previews share this database.

## Demo script (5 steps)

Sign in with **Use the demo account**. You need the laptop and two or three phones.

1. **Run the case study live.** Open the seeded sample case study and press **Start a live session**. Join from the phones with the QR code. Set **Time per item** to 60 seconds and press **Start session**. Each phone shows step 1 beside the patient record (a pane on a laptop, a sheet on a phone); the console reads "Step 1 of 6: Recognize Cues" and both screens count down from the same end time.
2. **Watch the room answer.** Answer on two phones and leave one quiet. The console draws the step's results for its type — a heat map for the highlight step — with counts and percentages as text, and marks nothing correct. **Hide results** takes the tallies off the projector.
3. **Show the answer.** Press **Show answer**. Every phone shows the key and rationale, including the quiet one, which says "You did not answer this item." The console now marks the correct cells, in words as well as colour.
4. **Skip and go back.** Press **Next item** twice, then pick step 1 on the item strip. The phones return to step 1 with their answers as sent, and the console shows step 1's results as they were. Press **End session**.
5. **Read the report.** Press **Open the report**. Switch between Students, Items and CJMM steps, then **Download CSV**. The same session is listed under **Live sessions and reports** on the author home.

Student-paced mode: on a bank, choose **Student-paced** before **Start a live session**. Phones get the whole set with next, previous and a list; the console shows a participants-by-items progress board; **Show answers** opens every item's key at once.

A class-sized crowd: `pnpm load:live --host --participants 60` against the local stack runs 60 simulated phones through the sample case study (docs/load-testing.md). It refuses production, and because production and previews share one database it refuses previews too, until the production split.

## What shipped

| PR   | Issue | What                                                                  | Commit  |
| ---- | ----- | --------------------------------------------------------------------- | ------- |
| #189 | #179  | Count how a room answered each item, per item type                    | 153abf8 |
| #190 | #186  | Session report by student, item and CJMM step, with CSV               | 7113f7e |
| #191 | #182  | Time an item and stop taking answers when it runs out                 | b70f6a2 |
| #192 | #187  | A load script that runs a class-sized crowd through a live case study | 557211d |
| #194 | #193  | A phone that joins as the host presses Start may miss the first move  | ec015d3 |
| #196 | #180  | Show each item's results on the host console                          | 655b173 |
| #195 | #181  | Show the answer and rationale to every phone at reveal                | ec7680e |
| #200 | #183  | Skip an item or go back to one                                        | 934937e |
| #199 | #184  | Run a case study live with the patient record on every phone          | 910bcf2 |
| #201 | #185  | Student-paced mode with a live progress board                         | 139ae57 |

- **Results for all fourteen types.** `src/lib/live/results/` turns raw responses into one of six shapes (options, grid, blanks, slots, order, pairs), with an exhaustive switch so a fifteenth type is a compile error. Responses that do not fit the item are counted as unreadable, never thrown. The console computes them from its own RLS-scoped read at the existing three-second tally cadence; nothing is pushed per answer (ADR 0002).
- **Two locks on a projected answer.** `concealKey()` strips every correct flag, the exact-order count and the common wrong pairs before reveal, and every view also gates on `revealed`. An import-graph test proves no participant entry point reaches the results module, and a wire-bytes test with a control proves no distribution field reaches a phone.
- **The server's clock decides.** The timer lives in `sessions.item_ends_at` and the trigger; a late answer is refused in SQL two seconds after the end, whatever a phone believes. Phones and console measure a clock offset and count down from the same instant.
- **Every state rule in three places that agree.** The reducer, the in-memory room and the Postgres trigger each hold the timer, goto and pacing rules, and the shared conformance suite runs both adapters against them.
- **The patient record is a snapshot.** Starting a case study copies its record onto the session, so an author editing the case mid-class changes nothing in the room; the phone reads it once, after its cookie is resumed.
- **A load script, not a guess.** 60 simulated phones completed the six-step case study on the local stack with zero refusals; join p95 1.4 s, submit p95 under 100 ms warm. A five-phone smoke runs on every PR.
- **Migrations:** `item_timer`, `session_goto`, `case_study_live_record`, `student_paced`.

## Known gaps

- **Production and previews still share one database** (the §7.3 split is owner work). That is also why the load script refuses to run against a preview.
- **The console reads responses twice per tick** ([#197](https://github.com/tannernielson27/learn/issues/197)): once for the tally, once for the results panel. Fine at class size; one read would do.
- **The whole patient record shows from step 1.** A review noted that the sample case's 1400 vitals and labs are visible before the steps that ask about them. No key is exposed, but it is an instructional-design question for the owner.
- **Student-paced rooms have no timer and cannot run a case study**, by design this sprint; both are check constraints.
- **The item strip only knows what this console has heard.** A console reloaded mid-session shows no answered counts for earlier items until it revisits them.
- **#178 is still blocked** on the owner turning off Realtime "Allow public access".
- **Not run locally all sprint:** full coverage, the production build and the full e2e suite. CI stayed the gate. The local stack was stopped partway through the night when the machine ran low on memory.

## Decisions taken without the owner

Listed at kickoff in `docs/open-issues.md` and followed: timer expiry closes rather than advances; skip means goto; student-paced reveal is one **Show answers**; the console never marks a correct answer before reveal; reports are org-scoped. Builders added these, each in its PR body: a new per-item time applies from the next item; pause after expiry gives no time back; case studies are instructor-paced only; **Show answers** in a student-paced room cannot be undone short of ending it; CSV leaves unanswered cells empty rather than 0.

## Retro

- **Reviewers earn their keep, and are sometimes wrong.** Reviews caught a secret redaction gap in the load script and a single-use drag token counted twice. One review called #194 a no-op from reading realtime-js's types; a ten-line probe against the local Realtime server showed the builder was right. Check claims about a wire against the wire.
- **Behaviour changes break other stories' tests, not their own.** #181 changed what a quiet phone sees; the break surfaced in #184's new test and in an older spec, one CI cycle each. When a story changes shared behaviour, grep the e2e suite for the old text before pushing.
- **Migration order is a merge-order problem.** Builders numbered migrations in the order they started, not the order they merged; #184's had to be renumbered after #183 landed first. Numbering at merge time, not at build time, would avoid it.
- **An aggregate embed that worked locally failed on CI.** `participants(count)` needs table-wide select that authors do not hold. The builder's local check had used a different path. Probe with the real role.
- **Memory, not tokens, was the limit.** Two builders plus reviewers plus the local stack exhausted 16 GB; the system reaped a background watcher. The rest of the night ran one builder at a time, polling CI on wake-ups instead of with shell watchers.
