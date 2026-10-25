# ADR 0014 — A progress tracker for each class and student

- **Status:** Accepted, 2026-10-25. Builds on ADR 0013 (a live session can be run for a class).
- **Deciders:** product owner (the intent: a teacher wants better ways than CSV to see and track how each student in a class is doing across live sessions and assignments), Claude (builder; every choice under "Decisions made while building" was made without the owner and is the conservative one)

## Context

A teacher had one report per live session (#186) and one per assignment (#211). Since ADR 0013 a signed-in class member who joins a class live session is linked to their account, so a class's live sessions and its assignments can be put side by side per student.

## Decision

- **Two database functions** (`20261025000000_class_progress.sql`): `public.class_progress(target_class)`, one row per student per class live session and per class assignment, and `public.class_progress_steps(target_class)`, each student's mean percent per clinical judgment step across both. Security definer, answering only an author of the class's own workspace (the same two checks as `class_roster`); anyone else gets no rows. Granted to `authenticated` only. No service role anywhere in the feature.
- **Class page:** a Progress tab (lowest overall, the class's step bars, a students-by-activities grid sortable by name or overall, a grid of removed students, and a CSV) and a Live sessions tab, through #487's tab list and needs map. Progress is the only tab that reads `class_progress`.
- **A student's page** at `/author/classes/[classId]/students/[profileId]`: overall, attendance, steps weakest first, and every class live session and assignment newest first, each linking to its report.
- **Start a live session** in the class header opens `/author/classes/[classId]/start`: choose a quiz and the pacing, and `startClassLiveSession` makes the same `start_session` call as the quiz page with "For a class" set.
- **Nothing here reaches a phone or a student's browser.** `noClientProgress.test.ts` walks the import graph from every student and participant entry.

## Decisions made while building

1. **Scores show only where the reports already show them.** A live session's points and percent only once it has ended; an assignment's best attempt only once it has closed (`private.assignment_refusal`), withheld in SQL, as `assignment_report_rows` does. Before that the cell says what happened ("In progress", "Submitted").
2. **Absent is not nought.** A missed live session has no score; it counts under Attended ("2 of 3", over ended sessions only). Overall is the mean of each live session and closed assignment the student has a percent for, each counting once. A student with no score has no overall and sorts last, and is never named among the "Lowest overall".
3. **A live session's percent is the report's.** Points earned over what every question anyone answered was worth, so a skipped question counts against the student, exactly as the session report's student table.
4. **The best attempt is the owner's 2026-09-23 rule:** the highest score, a tie going to the earlier attempt, submitted only.
5. **Steps:** each student's step percent is the mean of their scored answers at that step (each answer once), from ended class live sessions and best attempts at closed class assignments. The class's bar is the mean of its members' step percents, each member once, so a student who answered more does not outweigh the rest. A question deleted since has no step and is left out.
6. **Removed students** are listed, flagged `removed`, only when they left a linked participant or an attempt behind, as in the assignment report; they have their own grid and count in none of the class's figures. Their teacher can still open their page.
7. **Guests are never anyone's row.** A participant with no profile stays in that session's own report only. A quick live session (no class) is in no class's progress.
8. **Who gets not-found.** A teacher of another workspace, a class id that does not exist, and a student who was never in the class all get not-found. A student or an account with no role never reaches the page: the author area's `requireAuthor` sends them home, as on every author page.
9. **Shading** is the percent drawn in the one neutral ink layer the live results' heat table uses (never red or green), and every cell also says its value in words, so colour is never the only cue.
10. **The start page offers quizzes only**, not case studies alone; a case study can still be started for a class from its own page with "For a class".
11. **The grid shows every class live session and assignment**, including a scheduled assignment ("Not open") and a live session still in its lobby, so the teacher sees everything the class has; the Live sessions tab lists the newest 100.

## Consequences

- **Migration first.** `20261025000000_class_progress.sql` must be pushed after ADR 0013's `20261024000000_class_live_sessions.sql` and before this app is deployed: the class page's Progress tab calls `class_progress`.
- **Gallery baselines.** The class page gained two tabs, so the existing class-page baselines change and three new ones are needed (`class-page-progress`, `class-page-sessions`, `class-student`); regenerate with the e2e baselines workflow (docs/05).
