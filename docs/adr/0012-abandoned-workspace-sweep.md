# ADR 0012 — A daily sweep removes abandoned self-registered workspaces

- **Status:** Accepted, 2026-10-12 (owner asked for it and set the two rules). Ends two consequences: ADR 0009's "Abandoned workspaces accumulate. Nothing deletes them" and ADR 0011's "A moved teacher's old workspace becomes unreachable, not deleted".
- **Deciders:** product owner (the two rules, the retention periods, deleting the unconfirmed accounts, the off-by-default switch), Claude (builder; everything marked "added" below)

## Context

Open sign-up gives every teacher a workspace (ADR 0009), a removal gives the removed teacher a fresh one, and a move leaves one behind with `orgs.emptied_at` set (ADR 0011). None was ever deleted. ADR 0009 named what a sweep must do first: `profiles.org_id` is `ON DELETE SET NULL`, and a student whose profile names the deleted workspace would be left with a role and no org, which `profiles_org_and_role_together` refuses.

Four facts in the schema shape the decision:

1. **An org delete does not cascade cleanly.** `session_responses.item_id` and `case_study_items.item_id` are `ON DELETE RESTRICT`. Deleting the `orgs` row reaches items through banks before it reaches the rows that hold them, and is refused for any workspace that ran a live session or built a case study.
2. **Deleting an account reaches other workspaces.** `sessions.host_id` is `ON DELETE CASCADE`, and every "made by" column is `ON DELETE SET NULL`. A teacher who was once in another workspace still hosts its sessions and is named on its content (ADR 0011 fact 3).
3. **A student's `profiles.org_id` is not an authority** (ADR 0009, amended). It is only the first workspace they joined, kept because a role needs an org. Their reach is `class_members`.
4. **The app stores nothing in Supabase Storage.** No migration creates a bucket and nothing in `src` calls the Storage API, so a workspace has no files.

## Decision

### Which workspaces

A workspace that is not self-registered (the shared LeaRN workspace, any org made by hand) is never a candidate. Two kinds are:

- **Memberless.** `emptied_at` is more than 30 days ago and no instructor or admin profile names the workspace.
- **Never used.** `emptied_at` is null, the workspace was made more than 90 days ago, it has at least one teacher, and every teacher in it is an instructor who still carries `app_metadata.learn_email_unconfirmed = true` (the mark `signUp` puts on a password account and `markEmailConfirmed` clears), whose account is older than 90 days, whose last sign-in is older than 90 days, and who has no sign-in session made, updated or refreshed in the last 90 days. The workspace has no class with a student in it, no assignment and no live session, ever.
- **Never used means by students too** (security review of #401). No practice run, no bank shared with a class for practice, and no student ever taken off one of its classes (`private.class_removals`). A student who joined, practised and left has no class membership now, and without this their practice would have been deleted as part of a workspace "nobody used". The memberless rule is unchanged: it is about a workspace that was used and then left.

Added to the owner's rule for "never used", each in the direction of deleting less:

- **A sign-in session still being refreshed counts as signing in.** `last_sign_in_at` moves only when a password or link is used; a browser left signed in refreshes its token for months without it.
- **No bank, item, case study or class made or changed in the last 90 days.** The same browser could be writing questions.
- **What cannot be read stops the rule.** An account with no mark is confirmed, an account with no creation time is new, a session with no times is recent, an admin is not an abandoned sign-up.
- **A workspace with no teacher and no `emptied_at` matches neither rule.** That is a founder whose account was deleted by hand. The owner can set `emptied_at` to start its 30 days.

### What stops a deletion

The workspace is reported `skipped` with one of these, and met again on the next run:

| Reason                   | Meaning                                                                                                                                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enrolled_students`      | A class of the workspace has a student in it. Never deleted, by either rule. Only a memberless workspace can say this (for "never used" it is part of the rule); ADR 0011 refuses the move that would cause it, so it means someone changed a row by hand.                              |
| `student_unsafe`         | A student whose profile names the workspace is in a class, but only of a workspace marked emptied, so there is nowhere right to point them.                                                                                                                                             |
| `teacher_tied_elsewhere` | Never used only. A teacher of the workspace is named by a row of another workspace: a session hosted, anything made, an invitation sent or accepted, a workspace founded, or any student work. Deleting the account would delete or change that row (fact 2). Added; the owner decides. |
| `locked`                 | A row the deletion needs was locked by another transaction at that moment, or one of its writes waited more than 2 seconds for a lock (SQLSTATE 55P03 either way).                                                                                                                      |
| `changed`                | Once locked, the workspace no longer matched its rule.                                                                                                                                                                                                                                  |
| `error_<SQLSTATE>`       | The deletion raised. Everything it had done for that workspace was rolled back.                                                                                                                                                                                                         |

### Students

A student account is never deleted. Before the workspace goes, every student whose `profiles.org_id` names it is handled:

- **In a class of another workspace that is not marked emptied:** the profile is pointed at the workspace of the class they joined earliest. Nothing else about them changes (fact 3).
- **In no class anywhere:** `org_id` and `role` are both cleared. This is the role-less state, the one an account has after signing up as a student and before joining a class. `/welcome` serves it: a class code makes them a student again, of that class's workspace. It is the only state the check constraint allows for an account with no org, and the one ADR 0009 named.
- **Otherwise:** the workspace is skipped (`student_unsafe`).

A student in no class of the deleted workspace can still have work there, from a class they were taken off: attempts, saved answers, practice runs. That work is deleted with the workspace. A student in a class of it stops the deletion.

### What a deletion removes

In one subtransaction per workspace, explicitly and in this order, so that nothing depends on the order a cascade happens to take (fact 1):

1. `sessions` of the workspace, and by cascade `participants`, `session_responses`, `session_item_aggregates`, `live.session_public_state`.
2. `assignments`, and by cascade `assignment_attempts`, `attempt_responses`, `private.email_outbox`.
3. `practice_runs`, and by cascade `practice_responses`, `practice_run_slots`.
4. `bank_practice_shares`.
5. `classes`, and by cascade `private.class_removals` (and `class_members`, of which there are none).
6. `case_studies`, and by cascade `case_study_items`.
7. `items`, and by cascade `item_versions`, `practice_item_snapshots`.
8. `item_banks`, and by cascade `bank_folders`.
9. `org_invites`.
10. The `orgs` row.

For a never-used workspace, additionally: each teacher's profile loses its org and role before step 1, and after step 10 the teacher's row in `auth.users` is deleted, which takes their identities, sign-in sessions, `profiles` row and `private.rate_limits` rows by cascade. `teacher_tied_elsewhere` has already established that no row outside the workspace names them.

Not removed: any student account; the account of a teacher who moved away from a memberless workspace (they are in another workspace); rows in the shared rate-limit tables, which expire on their own and hold digests only. Nothing is exported or archived first. The nightly backup (docs/05 §7.10) is the only way back.

### Where the logic lives

- **All of it is in SQL**, migration `20261012000000_workspace_sweep`. `public.sweep_abandoned_workspaces(p_delete, p_limit)` is security definer, `search_path = ''`, executable by `service_role` only, and returns one row per workspace looked at: its id, the rule, `would_delete`, `deleted` or `skipped`, and the reason. With `p_delete` anything but true it writes nothing and takes no lock. One function, `private.workspace_sweep_rule`, holds both rules and is what the candidate list and the check under the lock both call.
- **Each workspace is locked, checked again, then deleted.** The org row `FOR UPDATE`, every profile naming it, and for a never-used workspace the teachers' `auth.users` rows and their `auth.sessions` rows, all `NOWAIT`, so a workspace somebody is touching is skipped rather than waited for. The session rows matter because a browser left signed in refreshes its token by updating its session row, never the user row: a teacher coming back at that moment makes the sweep skip (`locked`). Only those lock statements are `NOWAIT`. The writes after them can wait, for a row another transaction holds or for the row of the workspace a student is being pointed at, so each deletion sets `lock_timeout` to 2 seconds: a longer wait, a deadlock included, ends as `locked` and is rolled back. Every way into a workspace takes a lock on the org row that conflicts (`admit_to_class` `FOR SHARE`, `accept_org_invite` `FOR NO KEY UPDATE`, any foreign key naming the org `FOR KEY SHARE`), so once it is held nothing can join. Each deletion runs in its own block: a failure is rolled back alone and the loop goes on.
- **The limit counts deletions, not skips**, oldest first, 20 a run from the route and never more than 100 from the function. A workspace skipped every day therefore cannot hold up the ones behind it.

### The schedule and the switch

- **pg_cron calls `POST /api/cron/workspace-sweep` once a day through pg_net** with the same `CRON_SECRET` as the reminder route, by `private.call_workspace_sweep_route()` and a second Vault name, `learn_workspace_sweep_url` (ADR 0007's pattern, except that this function refuses a URL that is not `https://`). The route checks the secret in constant time, counts wrong secrets per caller in the bucket the reminder route uses and its own runs separately (6 an hour), answers POST only, is never cached and returns counts only.
- **It is a dry run unless `WORKSPACE_SWEEP` is exactly `delete`.** The comparison is with the string as set, untrimmed. Nothing in the request can choose the mode or the limit. The variable is set nowhere, so merging this, applying the migration and scheduling the job all delete nothing.
- **One log line a run**, `[workspace-sweep] run`: the mode, counts by rule and outcome, and org ids. Never a name or an address; the route drops anything from the database that is not an id or one of the known words.
- **Before the migration is applied** the route answers `200 {"status":"not_available"}` and logs `[workspace-sweep] not available`. Only "no such function `sweep_abandoned_workspaces`" is read that way (PGRST202, or a 42883 that names it); any other error is a failed run, `500`.

## Consequences

- **A deletion cannot be undone from the app**, and nobody is told by email before or after. The owner reads dry runs for as long as they like before turning it on (docs/05 §7.13).
- **A teacher who never confirmed and stays away 90 days loses the account and any questions they wrote.** They can sign up again with the same address. Confirming the address at any time, or signing in, stops it.
- **An emptied workspace's content is gone 30 days after its last teacher moved**, banks and all. The move confirmation on `/w/<token>` said "Nothing is deleted, and nothing comes with you"; it now says "Nothing comes with you. If no teacher is left in it, it is deleted after 30 days." The sentence is a condition because the preview does not say whether another teacher stays. It is true only once the owner has turned deletion on; before that the workspace is kept longer than the page says, never shorter.
- **A student can find their role gone.** Only one in no class anywhere, who could do nothing as a student. They land on `/welcome` at their next visit.
- **A student's `profiles.org_id` can now change**, once, when the workspace it named is deleted. ADR 0009 said it was never updated; it is still not an authority for anything.
- **Workspaces from a removal are swept only by the never-used rule**, since their teacher is in them. A removed teacher who confirmed their address keeps an empty workspace for good.
- **`teacher_tied_elsewhere` workspaces stay** until the owner decides: a never-confirmed teacher who was once in someone else's workspace. They show in every run's log.
- **Needs migration `20261012000000_workspace_sweep` on the hosted project, then the owner's steps in docs/05 §7.13.** Before either, nothing changes.
- **Not verified on hosted:** that the function's owner may lock and delete rows in `auth.users`. If it may not, every never-used workspace is skipped with `error_42501` and nothing is half-done; the memberless rule does not touch `auth` and is unaffected.
