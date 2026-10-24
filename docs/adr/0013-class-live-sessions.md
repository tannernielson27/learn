# ADR 0013 — A live session can be run for a class

- **Status:** Accepted, 2026-10-24. Amends ROADMAP §8 decision 1 ("Live = join code + display name, no account").
- **Deciders:** product owner (the intent: quick play unchanged, class sessions link signed-in members, guests stay anonymous), Claude (builder; every choice under "Decisions made while building" was made without the owner and is the conservative one)

## Context

Since #129 every participant in a live session is anonymous: a join code and a display name, with `participants.profile_id` in the table for "Phase 4 rosters" and always null. Since #205 a teacher has classes, and a student has an account that is a member of them. A teacher who runs a live session with their class gets a report by display name and nothing that follows a student from one session to the next.

The owner wants both: the quick live session anyone joins stays exactly as it is, and a teacher can also start one for a class, so that the answers of a student who is signed in and in that class count toward the class.

## Decision

- **Quick play is unchanged.** A live session started with no class is joined with the join code and a display name, needs no account, and links nobody, even someone who is signed in.
- **A live session can be started for a class** (`sessions.class_id`). The start forms on the quiz page and the case study page have an optional "For a class" select listing the teacher's classes; the default is "No class (anyone joins)". The class must be in the teacher's own workspace (`start_session` refuses anything else with `LC001`; a composite foreign key holds it for a row written any other way). The class is fixed when the session starts.
- **Anyone can still join a class session with the code.** When the person joining is signed in with a student account that is a current member of that class (on the roster now, not taken off it), their participant row is linked to their profile. The account is the one the server verifies from the session cookie (`getClaims`), never an id the request carries, and membership is checked in SQL by `join_session`, never by the caller.
- **Guests in a class session are anonymous, as today.** They appear in that session's report by display name and are not tracked. A signed-in member may choose "Join as a guest instead" on the join page.
- **The projector rule stands.** No names on the projector after the lobby. The end-of-session podium (PR #483) is the owner's explicit exception, and the only one.
- **A profile link is never shown to anyone but the teachers of the workspace.** No phone-facing read returns it, and other participants never see it.

## Decisions made while building

Each was made without the owner, during a build that merges after the live class of 2026-10-27, and each is the conservative choice.

1. **A member who joins again gets the same participant back, with a new secret.** A partial unique index allows one linked row per member per session. Joining again from a second phone (or after clearing cookies) returns that participant and replaces its rejoin hash, so the first phone's token stops working and that phone is sent back to the join form. A participant still has exactly one live token, which is what `resume_participant` and the private channel token were built on; keeping two would mean a second hash column and a second path through every check. Only the account holder can do this, because the account comes from verified claims. The participant keeps the name it first joined with.
2. **A browser already in the session comes back as whoever it already is.** If a browser holds a guest token for the session and the person then signs in and joins again, they stay that guest participant (the join action's existing "already in this room" rule). Linking a guest row after the fact would let a name typed by anyone become a student's record.
3. **A student who cannot be recognised joins as a guest.** If the server cannot verify the session cookie, the join goes ahead unlinked rather than failing. A live class must not stop at the door; a missed link costs one session's tracking for one student.
4. **The join page looks up the class only for a signed-in student.** `/join/[code]` deliberately looks nothing up for a visitor, so a camera cannot probe which codes exist. That still holds for anyone signed out. For a signed-in student the page calls `class_session_for_member`, which answers only when the code is an open session of a class that student is in, so it tells them nothing their teacher has not. It is service-role only and is not rate limited, because it reveals nothing about any other session.
5. **The old function calls keep working.** `start_session` and `join_session` gain a defaulted last argument; the old functions are dropped rather than overloaded, so the existing two-argument calls are not ambiguous. The app names the new arguments only when they have a value, so a quick session and a guest's join make exactly the calls they made before.
6. **Deleting a class keeps the session.** `class_id` is cleared (`ON DELETE SET NULL`), like a deleted quiz's `bank_id`; linked participants stay linked.
7. **The class page is not changed.** It is being redesigned in another PR; a class's view of its live sessions is later work, as is anything in the report that uses the link.

## Consequences

- **`participants.profile_id` is written for the first time.** It was readable by the teachers of the session's workspace since #129 and still is, and by nobody else.
- **Migration first.** `20261024000000_class_live_sessions` must be pushed before the app that names `target_class` or `joining_profile` is deployed (docs/05 §7.2). The app before it keeps working against the new functions.
- **What a class session counts toward is not built yet.** The link is recorded; reports and class tracking that read it are later PRs.
- **Glossary:** "Class" still never means the people in one live session. A class session has a join code like any live session; the class code still only joins a class.
