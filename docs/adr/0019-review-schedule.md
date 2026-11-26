# ADR 0019 — A missed question comes back after 1, 3, 7 and 14 days, ten at a sitting

- **Status:** Accepted, 2026-11-25 (S16, issue #626). Takes spaced repetition out of docs/00-ROADMAP.md's Parked list in its simplest form. Numbered 0019 because 0018 is taken by the AI drafting record (#620), which was on a branch that had not merged when this was written.
- **Deciders:** product owner (the four decisions made while filing #626, all final), Claude (the rest, marked "added" below).

## Context

"Practise the N I missed" (`src/lib/practice/missed.ts`) brings back what a student missed, but only when they go looking for it, and only from one practice run or one assignment at a time. Nothing brings a missed question back days later.

Spaced retrieval improves course exam results in nursing and across the health professions. In the largest nursing trial (799 students, 19 campuses) only a third of students used the tool, and use still predicted exam results. So the rules have to be simple enough to run by default, with no setup.

Facts in the code that shape the decision:

1. **Full marks already has one line**: `isFullMarks` in `src/lib/assignments/resultsSummary.ts`, `maxPoints > 0 and points >= maxPoints`, the line the player's "All correct" draws and "Practise the N I missed" uses. It imports only `@/lib/ngn/types`, so `src/lib/ngn` may import it under the lint rule (`eslint.config.mjs`).
2. **Answers given after the key was shown are kept out of the steps.** `20261023020000_practice_missed.sql` leaves missed practice runs out of `my_practice_step_marks` because every answer in one comes after the student saw that question's key.
3. **The next issue (#627) stores one `review_entries` row per student per question.** The state has to fit one row with nothing derived stored twice.

## Decision

The rules live in `src/lib/ngn/reviewSchedule.ts`, a pure module with no clock of its own.

### The four decisions made while filing (owner, final)

1. **Fixed gaps of 1, 3, 7 and 14 days** (`REVIEW_GAPS_DAYS`). Gaps that adapt to the student or the question stay parked.
2. **Partial credit is a miss**, as it is for "Practise the N I missed".
3. **Ten at a sitting** (`REVIEW_SITTING_LIMIT`).
4. **Review answers never count toward a grade or toward "Your clinical judgment steps"**, for the reason missed runs do not (fact 2): every one comes after the key was shown. The module decides nothing about grades or steps; the code that stores review answers (#627 onwards) must keep them out of both.

### The rules

- **What enters review.** A question a student answered below full marks, once they have been shown its key. It enters waiting out the 1 day gap, due one day after that answer.
- **When it comes back.** Answered in review once due: full marks moves it to the next gap (1 → 3 → 7 → 14); anything less sends it back to the 1 day gap. Full marks at the 14 day gap retires it as learned.
- **Missing it again somewhere else** (a new assignment, a live session, practice) puts a waiting or a retired question back at the 1 day gap.
- **How many at once.** A sitting takes the due questions, the earliest due first, at most ten, so a backlog never looks like a wall.

### Choices made while building (added)

- **Full marks is imported, not copied.** The module re-exports `isFullMarks` from `resultsSummary.ts`, and a test checks it is the same function, so the line cannot drift.
- **Time is epoch milliseconds, always passed in.** No function reads the clock; a test checks the source for `Date.now()`, `new Date()` and `performance.now()`. A day is exactly 24 hours (`DAY_MS`), counted from the moment of the answer: with no time zone to go by, "after 1 day" means 24 hours later, not "tomorrow" on some calendar. A question is due from that moment on (`dueAt <= now`).
- **The next gap counts from the answer**, not from when the question fell due, so a review done late does not leave the next one already due.
- **The state.** A question never in review has none (`null`). Otherwise it is `{ kind: "waiting", gapDays, dueAt }` or `{ kind: "retired", retiredAt }`. Each is one row; nothing in it is derived from another field.
- **(a) Full marks outside review changes nothing.** On a waiting question it keeps its gap and due time; a retired question stays retired; a question never in review stays out. Only a review moves a question forward, since an answer elsewhere may be given while the question is not due.
- **(b) A review answer before the question is due counts as an answer elsewhere**: full marks changes nothing, a miss sends it back to 1 day. A sitting never offers a question that is not due, so this only happens with a stale sitting, and it must not let a student skip a gap. The same goes for a review answer on a question that is not waiting (retired, or never in review).
- **(c) The caller decides whether the key was shown.** The module takes no `keyShown` input; it is called only with answers whose key the student has seen, as `buildStepStandings` is handed only the marks that count. In practice that is every scored answer once its results are released (an assignment), revealed (a live session) or shown (practice).
- **(d) A question never in review that is answered below full marks** enters at the 1 day gap from that answer, wherever it was answered.
- **(e) A mark worth nothing changes nothing.** With `maxPoints` 0 a question can never reach full marks, so it would come back forever and never retire. Such a mark, and one no scorer could give (not a finite number, or a negative score), leaves the state as it was. A score above the maximum still counts as full marks, as `isFullMarks` says.
- **(f) Ties are broken by question id.** Equal due times are ordered by `questionId`, compared by code unit (not locale), so the same list always gives the same pick in any order. Two rows with the same id and due time (which #627's one row per question rules out) keep the list's order; the sort is stable.
- **A limit below one takes none**, and a fractional limit rounds down.
- **A time that is not a finite number is refused** with a `RangeError` rather than stored.

### Out

- Gaps that adapt to the student or the question; adaptive practice.
- Anything that reads or writes the database (#627 stores the state).
- Reminders of any kind.
- Any screen (#628 names and builds the Review card).

## Consequences

- #627 can store one row per student per question: a status (`waiting` or `retired`), the gap and due time when waiting, the time it retired when retired.
- Every place that shows a student a key (released assignment results, a live session's reveal, a practice answer) has to feed its scored answers through `nextReviewState` as `where: "elsewhere"`, or a miss there never enters review. A review sitting feeds its own as `where: "review"`.
- A student who misses a question in an assignment and again in practice the same day has it due a day after the later answer, not the earlier.
- A retired question stays retired however long ago it retired, until it is missed again.
- Changing a gap or the limit is a change to two constants and this record; rows already stored keep the due time they were given.

## Risks accepted

- **A day is 24 hours, not a calendar day.** A question missed at 23:00 comes back at 23:00 the next day, not at the start of it. A screen can show "due today" by the student's own clock; the schedule does not move for it.
- **A question worth nothing never enters review.** Every scored item type is meant to be worth something; one that is not is left out rather than looping.
