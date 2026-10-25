# ADR 0015 — A student sees their own live session results

- **Status:** Accepted, 2026-10-25. Follows ADR 0013 (a live session can be run for a class).
- **Deciders:** product owner (the intent: a signed-in student sees their own results from class live sessions, with keys and rationales once a session has ended), Claude (builder; every choice under "Decisions made while building" was made without the owner and is the conservative one)

## Context

Since ADR 0013 a signed-in member who joins a live session for their class has their participant row linked to their account (`participants.profile_id`). The link was recorded and nothing read it. A student who answered in class had no way to see how they did once the session was over, and their live answers did not count toward "Your clinical judgment steps".

## Decision

- **The student home has a Live sessions section**, in the style of the assignment Results list: each ended class live session the student joined signed in, most recently ended first, with the class, when it ended, their score and how many questions they answered. Each links to `/learn/live/[sessionId]`.
- **The results page shows each question with their answer, correct or not, and the rationale**, laid out as an assignment's results after close: their total, "Review what I missed", the share by step, the questions with their verdicts, and one question at a time in the review view. An answer is drawn against the key it was scored with (`session_responses.reveal`).
- **Only ended sessions, only the student who answered.** Three security definer functions answer only `auth.uid()`, only about participant rows linked to it, and only once the session's status is `ended`: `my_live_results()`, `my_live_result(target_session)` and `my_live_step_marks()` (migration `20261025010000_student_live_results`). Anyone else, and a session still running, reads as not-found. Keys and rationales are read with the service role only after `my_live_result` has answered.
- **Live answers count toward Your clinical judgment steps** as a third source, "live sessions", beside assignments and practice.
- **The live phone path is unchanged** and imports none of this (`src/components/live/noClientStudentLiveResults.test.ts`). The "Join a live session" link and joining with no account are unchanged.

## Decisions made while building

Each was made without the owner, during a build that merges after the live class of 2026-10-27, and each is the conservative choice.

1. **A new `my_live_step_marks()` rather than a change to `my_step_marks` or `my_practice_step_marks`.** The home already merges sources in the app (`buildMyStepStandings`); a new function cannot change what the existing two answer, so assignments and practice are counted exactly as before. If the live read fails, the steps section says it did not load, as it does when either other source fails, rather than showing a quietly different ranking.
2. **Only the questions the session reached are listed, scored or shown with their key.** A teacher may end a session early and use the rest of the quiz next time. For a teacher-paced session that is positions 1 to where it ended, plus any position the student answered (the teacher may have gone back); for a student-paced session it is the whole set, since every phone could reach it.
3. **A question left blank counts at the item's own worth** (`scoring.maxPoints`), which is how an assignment's results count a blank. It is never read from anyone else's answer.
4. **Not limited to the student's current classes.** A student taken off a class keeps their own record of what they answered, as a removed student keeps their assignment results. A deleted class leaves the session with no class; the list then names none.
5. **The 50 most recently ended sessions**, as History lists the 50 most recently closed assignments. One partial index (`participants_profile_id_idx`, linked rows only) keeps the read from scanning every participant.
6. **A separate results component** (`LiveSessionResults`) rather than widening `AssignmentResults`, which a class uses for graded work: its copy speaks of attempts and offers practice of the missed questions, neither of which fits a live session. It reuses the same review parts (`QuestionResults`, `ItemPlayer`, `StepBars`, `ScoreFigure`). No "Practise the N I missed" for a live session; that is later work if wanted.
7. **The patient record beside a case study step is cut to that step**, as the phone had it (`roomRecord`), not shown whole, because an author may hold parts of a record back until a later step.
8. **A teacher who opens `/learn/live/...` is sent to their own home** by `requireStudent`, as for every `/learn` page; the function would answer them nothing anyway (a teacher is never linked).
9. **The path is `/learn/live/[sessionId]`.** `/live/[sessionId]` is the teacher's live session page.

## Consequences

- **Migration order.** `20261025010000_student_live_results` must be pushed after `20261024000000_class_live_sessions` (PR #488) and before this app is deployed (docs/05 §7.2, row 63). Without it the home's Live sessions and steps sections say they did not load.
- **Glossary.** No new term: "Live session", "Results" (a student's word) and "Clinical judgment step" as decided.
