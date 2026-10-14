# ADR 0009 — Anyone can sign up; a teacher gets a workspace of their own

- **Status:** Accepted, 2026-10-06 (Sprint 13 kickoff). Replaces the invite-only rule of #204 for instructors.
- **Deciders:** product owner (four decisions at kickoff), Claude (orchestrator)

ADR 0008 is the AI import record, in the Sprint 12 kickoff (#350).

## Context

Since #204 nobody could create an account without a class invite link, and nobody could become an instructor except by the owner running `private.make_instructor` in the SQL editor. That was right for one instructor and one cohort. With password sign-in merged (#353, #354) the owner wants the loop closed: a teacher or a student arrives, signs up, and is led through a short welcome.

Three facts in the code shape the decision:

1. **Every instructor shares one org.** Row level security is scoped by org, so a teacher added to it sees every other teacher's banks, classes and rosters.
2. **A profile has a role only together with an org** (`profiles_org_and_role_together`). A student is a student _of_ an org, which they get by joining a class.
3. **Live sessions already need no account**: a six-character code and a display name.

How comparable products do it, checked on 2026-10-06:

- **Kahoot.** The first sign-up screen asks the role. A teacher gives a workplace type and an email and password, or uses Google, Microsoft or Apple. Students play with a game PIN and a nickname, no account.
- **Socrative.** A teacher signs up with an email and a password. Students never have accounts: they enter a room name and their name, or, in a rostered room, an ID the teacher assigned (typed or imported from CSV).
- **Google Classroom, Wayground (Quizizz).** A student has an account and types a six-to-eight-character class code. Wayground's live games still need no account.

The pattern: ask the role first, keep live play account-free, and tie anything that persists to either an account plus a typed class code or a teacher-made roster.

## Decision

- **Sign-up is open at `/sign-up`**, with the role as the first choice, then name, email and password. The account is created server-side through the admin API, as invite sign-up already does, and the person is signed in at once.
- **A self-registered teacher gets a new org of their own** (`register_instructor`, service role only). Nothing joins an existing org by signing up. The shared org and `make_instructor` stay for the owner's own colleagues.
- **A student is still made only by joining a class**, now by a typed eight-character class code as well as the link and QR. A student who signs up without one has no role and lands on `/welcome`, where the code box is.
- **The role is never read from anything the person can write.** It comes from the server's own call, never from `user_metadata`.
- **The form may say an address already has an account.** A form that signs you in immediately cannot hide that, so it is guarded instead: a CAPTCHA (Cloudflare Turnstile), a per-IP and per-address rate limit, and Supabase's own public sign-up endpoint turned off so the limits cannot be walked around. Sign-in keeps answering every address alike (#139).
- **Confirming the email never blocks**, for teachers as for students. The owner's first client has trouble receiving email, and a blocked teacher is a lost teacher.
- **Onboarding is two short popups, one per role**, shown once per account and recorded in `profiles.onboarded_at`. The teacher's leads into the existing Get started checklist.
- **A self-registered workspace cannot use AI import** until the owner enables it.

## Consequences

- **Someone can make a teacher account on an address they do not own.** They get an empty private workspace and nothing else. The real owner of the address takes it back by opening any email LeaRN sends to it (the welcome email, a sign-in link, or "Forgot your password?"): the first time the address is confirmed from a browser that was not signed in to the account, the password it was made with stops working, every other session is signed out, and the owner is asked for a password of their own (`endEarlierAccess`, owner decision 2026-10-07). Until then the person who made the account can use it. Accepted with decision 4.
- **Orgs multiply.** Anything that assumed one org (the checklist's derived progress, `make_instructor`'s "first org", per-org caps) must be read per org. A teacher cannot move between workspaces or invite a colleague into theirs; that is org administration, still v2.
- **A student can be in classes of more than one workspace** (amended 2026-10-08, owner decision; migration `20261009000000_student_multi_workspace`). As first accepted, this consequence read "a student belongs to one org": `admit_to_class` refused a student whose profile pointed at another org, so a student of one teacher could not join a second teacher's class with the same account. With one workspace per teacher that was met at once, and the refusal is gone. What holds now:
  - A student's `profiles.org_id` is only **the first workspace they joined a class in**. It is set once, because a role must come with an org (`profiles_org_and_role_together`), never updated, and is not an authority for anything. A student's reach is their `class_members` rows; every student read and write was already keyed on those, so no policy changed. The student home shows each class's workspace name, from `my_classes()`. Since migration `20261010000000_workspace_follow_ups` a student reads no row of `public.orgs` at all: the policy that let anyone read the org their profile names is now the authors' alone.
  - A teacher account still cannot join a class as a student, in its own workspace or any other.
  - An author still sees only their own workspace. Sharing a student with another teacher shows them nothing of that teacher's classes, rosters, assignments, reports or banks (pgTAP `student_multi_workspace`).
  - **For any future workspace sweep:** `profiles.org_id` is `ON DELETE SET NULL`. Deleting an org that is some student's first workspace would leave that student with a role and no org, which the role check refuses while they are still a student elsewhere. A sweep must first repoint such profiles at the org of another class they belong to (or clear the role of a student with no class left).
- **Email volume grows with sign-ups.** The hosted limit is 150 Auth emails an hour and Resend's free plan allows 100 a day. The welcome email goes through the app mailer, so it counts against Resend only.
- **Abandoned workspaces accumulate.** Nothing deletes them. A sweep is a later decision.
- **Docs and copy that say "invite-only" are wrong until #366 merges.**
