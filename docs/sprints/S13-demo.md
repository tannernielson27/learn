# Sprint 13: Demo

**Goal:** a stranger becomes a teacher, makes a class, and has a stranger become their student, with no help from the owner.

Sprint 13 opens sign-up (ADR 0009). It covers:

- a sign-up page for teachers and students;
- a workspace of their own for each teacher who signs up;
- a typed class code, as well as the invite link and QR code;
- a welcome page for an account with no role, in place of "No access yet";
- a short welcome popup for a new teacher and a new student;
- a CAPTCHA, a sign-up rate limit and hosted Auth checks in front of all of it.

**Status:** code complete 2026-10-08. Every story is merged.
**Production:** https://learn-nine-alpha.vercel.app
**Repo:** https://github.com/tannernielson27/learn

> **Hosted database:** caught up. Sprint 13 has two migrations, both applied to hosted by the owner on 2026-10-08. `main` and the hosted project agree on all 42 migrations.
>
> - **Row 41, `20261006000000_self_serve_instructors` (#355, PR #369).** `orgs.self_registered`, `orgs.ai_import_enabled`, `profiles.onboarded_at`, `register_instructor`, `mark_onboarded`.
> - **Row 42, `20261006010000_class_join_code` (#356, PR #375).** `classes.join_code` and `join_class_by_code`.
>
> After the sprint: rows 43 and 44 (`20261009000000_student_multi_workspace`, `20261009010000_workspace_invites`) were applied on 2026-10-09. **Row 45, `20261010000000_workspace_follow_ups`, is not applied yet.**
>
> Both were first pushed from a checkout that was behind `main`, which applies nothing and says "up to date". Pull `main` in the folder you push from, and read the push output: it must name the migrations.

## Demo script (6 steps)

`e2e/registration.spec.ts` runs steps 1 to 5 in CI at 375, 768 and 1280 px, with no account made beforehand and no emailed link opened.

**Where to run it.** A preview is the easiest place: previews carry no Turnstile keys, so the CAPTCHA is skipped there. On production the Turnstile widget must exist and its two variables must be set (owner steps below), or sign-up is refused. Use two private windows, one for the teacher and one for the student.

1. **A teacher signs up.** Open `/` signed out and choose **Create an account** (or open `/sign-up`). Choose **I teach**, type a name, an email address and a password, and press **Create account**. You are on the author home at once, with no email to wait for.
2. **The teacher is welcomed, once.** A three-step popup greets you by name: the workspace is yours, start with a question bank, then a class and a session. **Get started** closes it and leaves you on the Get started list. Reload: it does not come back.
3. **A bank and a class.** Choose **Import the sample bank**; the Sample bank opens. Go to **Classes**, make a class, and read its **Class code** (two groups of four, like `ABCD-2345`). The invite link and QR code are beside it.
4. **A student signs up and joins by code.** In the second window open `/sign-up`, choose **I am a student**, and sign up. You land on the welcome page. Type the class code, in lower case and without the hyphen if you like, and press **Join the class**. The student home lists the class, and a three-step popup says where assignments, practice and results are. Reload: it does not come back.
5. **The roster.** Back in the teacher's window, reload the class page: the Roster shows the student's name.
6. **Workspaces are private.** Sign up as a second teacher in a third window. Their author home is empty: none of the first teacher's banks or classes, and no shared-workspace content.

Things worth trying off the script:

- Sign up again with an address that already has an account: "This email already has an account", with a Sign in link, and nothing else.
- Sign in as a student from `/sign-in`: you land on your classes, not on authoring.
- Sign up on one device and open the welcome email's link on another: the page asks for a new password, and the one you signed up with no longer works. That is deliberate (#378).
- Open `/join` with a class code in hand: the page points you to the right place.

## Owner steps, in order

1. **Push the two migrations** (done 2026-10-08): from an up-to-date `main`, `pnpm exec supabase db push`.
2. **Check the shared workspace kept AI import** (from #369): `select name, self_registered, ai_import_enabled from public.orgs;` should show `false, true` for LeaRN.
3. **Create the Turnstile widget** (docs/05 §7.12 step 1): Cloudflare → Turnstile → Add widget, hostname `learn-nine-alpha.vercel.app` only, mode Managed.
4. **Set the two variables in Vercel, Production scope only** (§7.12 step 2): `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, then redeploy. Both were present on 2026-10-08.
5. **Hosted Supabase, both projects** (§7.12 steps 3 and 4): "Allow new users to sign up" off, and a minimum password length of 8.
6. **Run the check**: with `SUPABASE_ACCESS_TOKEN` set, `pnpm golive:check` passes "Supabase's own sign-up endpoint is closed" and "Supabase Auth refuses a password under 8 characters".
7. **Sign up once on production** as a teacher and as a student, to see the widget appear and the walk above work there.

## What shipped

| PR   | Issue | What                                                                        | Commit  |
| ---- | ----- | --------------------------------------------------------------------------- | ------- |
| #368 | n/a   | Sprint 13 kickoff, ADR 0009                                                 | e1a7ed9 |
| #369 | #355  | A workspace for each self-registered teacher; a per-account onboarding mark | 55491d1 |
| #375 | #356  | A short class code a student can type to join                               | 16b8f18 |
| #370 | #357  | A Dialog primitive for popups                                               | a96be90 |
| #373 | #358  | A name on the account, shown and changeable                                 | 278fa2c |
| #371 | #359  | A CAPTCHA, a sign-up rate limit and hosted Auth checks                      | 427891e |
| #372 | #359  | Sign-up refuses in production when the CAPTCHA is not set up                | 53abc1c |
| #374 | #360  | A welcome email that confirms the address                                   | 422c706 |
| #377 | #361  | The sign-up page, and a welcome page for an account with no role            | 266d47c |
| #378 | #361  | Confirming from another browser retires the first password                  | 1d1480c |
| #379 | #362  | Join a class by code; "No access yet" is gone                               | b960be6 |
| #380 | #363  | Each person goes to their own home after sign-in                            | dbe1a19 |
| #381 | #364  | A three-step welcome for a new teacher                                      | 1fbd9ea |
| #382 | #365  | A short welcome for a new student                                           | fbb1514 |
| #383 | #366  | Sign-up on the landing page; the invite-only wording retired                | 36241c0 |
| #384 | #367  | The registration walk, the security review and this demo                    | a81147b |

## Decisions made during the sprint

The four owner decisions of 2026-10-06 are in ADR 0009. These came after:

- **Production refuses sign-up without the CAPTCHA** (owner, 2026-10-07, #372), rather than letting it through with a log line.
- **The first confirmation from another browser retires the password the account was made with** and signs out every other session (owner, 2026-10-07, #378). It closes the case where someone signs up with an address that is not theirs.
- **One message for a wrong class code and for a class the student was removed from** (#379). The database gives one answer for both, so a code cannot be probed.
- **AI import stays off for a self-registered workspace** until the owner turns it on (`orgs.ai_import_enabled`, #355), so open sign-up cannot spend the owner's API key. Not yet confirmed by the owner.

## Known gaps

Closed after the sprint, on 2026-10-08 and 09:

- **One student account in classes of more than one workspace** (#392, migration `20261009000000`).
- **A teacher invites a colleague into their own workspace** (ADR 0010; #393 with migration `20261009010000`, #394, and the pages and walk in #397).
- **Resending the confirmation email is worded for the account's role** (#385).
- **A signed-in person who opens `/sign-in` goes straight to their own home** (#387).
- **Typed class codes are also limited per address** (#390).
- **A student reads no workspace row** (migration `20261010000000`). The policy keyed on the first workspace a student joined, which never changes; every column of `orgs` was granted. No student page read it, so the policy is now the authors' alone.
- **An address is sent at most three invitations in 24 hours, from every workspace together** (migration `20261010000000`, ADR 0010).
- **The workspace name sits beside the class name on a student's open assignments and history**, for a student whose classes span more than one workspace. No database change.

- **The teacher who started a workspace can remove a colleague, and a teacher who already has a workspace can accept an invitation by leaving it** (ADR 0011, migration `20261011000000`). The removed colleague starts again in an empty workspace of their own; a move is asked for first, with what it costs, and is refused where it would leave students without a teacher.

Still open:

- **Migration `20261011000000_workspace_remove_and_move` is not on hosted yet** (docs/05 §7.2 row 46). The app works without it; until it is pushed nobody can remove a colleague, and a teacher who opens an invitation is told moving is not available.
- **A founder cannot hand their workspace to someone else, and cannot leave it while colleagues are in it.** A teacher of the shared workspace cannot move at all. The shared workspace is still the owner's steps (docs/05 §7.6).
- **A removed colleague is not told by email, and takes nothing with them.** What they made stays in the workspace; there is no export on the way out.
- **The last teacher of a workspace with students, an assignment that has not closed or a live session cannot move** until those are gone.
- **Abandoned workspaces are never removed.** One whose last teacher moved away is now marked (`orgs.emptied_at`) and kept. A sweep must first deal with students whose first workspace it would delete (ADR 0009).
- **Migration `20261010000000_workspace_follow_ups` is not on hosted yet** (docs/05 §7.2 row 45). The app works without it; until it is pushed a student can still read the row of the first workspace they joined, and nothing caps invitations per address except a resend's own check.
- **Practice rows name no class or workspace.** `my_practice_banks()` returns the bank and no class, so two banks with one name from two workspaces look alike; telling them apart needs a database change. The assignment and results pages show no class name either.
- **Two workspaces with the same name look like one to a student.** `my_classes()` gives the workspace's name and no id.
