# ADR 0011 — A founder removes a colleague; a teacher moves by accepting an invitation

- **Status:** Accepted, 2026-10-09 (owner approved building both). Changes two decisions of ADR 0010: "no removal in the app" and "only an account with no role can accept".
- **Deciders:** product owner (both features and their rules), Claude (orchestrator; the defaults marked "added" below)

## Context

ADR 0010 let any teacher of a self-registered workspace invite a colleague, and left two gaps on purpose. A mistaken or outdated invitation could not be undone once accepted. And a teacher who had already signed up, and so already had a workspace of their own, could never join a colleague's: they were told to use another address.

Four facts in the code shape the decision:

1. **Who is in which workspace is one row, read on every request.** `private.current_org_id()` and `private.is_author()` read `public.profiles` for `auth.uid()` each time a policy runs, and `authorForRoute` reads the same row for every page and action. No token carries an org or a role, and nothing caches either. The one exception is a Realtime socket already joined to a private `live:<session>` channel: it was authorised when it joined and is not asked again until its access token is replaced.
2. **A profile has one org and one role** (`profiles_org_and_role_together`). Leaving a workspace therefore means being put in another one in the same statement, or losing the role.
3. **Everything an author reads or writes is scoped by org and nothing finer.** `created_by` and `host_id` are recorded and never compared after the insert. What a teacher made is the workspace's, not theirs.
4. **A workspace had no record of who made it.** Every member was an instructor and all were equal.

## Decision

### The founder

- **A self-registered workspace records its founder** (`orgs.founder_id`), set by `register_instructor`. Workspaces that existed before migration `20261011000000` are backfilled once: the member who did not come in by invitation, or failing that the earliest to join. The shared workspace and any org made by hand have none.
- The founder is shown on the member list ("Started this workspace"). It is not a role: the founder has the same access as everyone else, plus Remove.

### Removing a colleague

- **Only the founder removes, only in a self-registered workspace, and never themselves.** `remove_org_member(p_member)` is called by the signed-in teacher and checks `auth.uid()` against `orgs.founder_id` inside the function, under the workspace's row lock. Answers: `removed`, `shared_workspace`, `not_founder`, `is_founder`, `not_found`, `is_admin`.
- **A removed teacher keeps their account.** In the same transaction they become the founder of a new, empty, self-registered workspace, made by the same internal function sign-up uses and named the same way. Everything they authored stays in the workspace they were removed from.
- **Pages, reads and actions follow at once; the removed teacher is also signed out** (security review of #399). Fact 1: every request they make after the UPDATE is answered for their new workspace. For the exception in fact 1, `remove_org_member` deletes their rows in `auth.sessions`, which is what Supabase Auth's global sign-out does: no browser of theirs can get a new access token, and each signs in again with the password it has. What remains is the access token already issued, valid until it expires (one hour, `jwt_expiry`). In that window a socket they had joined beforehand can still receive presence and broadcast for a colleague's live session in the workspace: the room's public state, never a key. If the database role may not delete from `auth.sessions`, the removal stands and only this step is skipped.
- **A live session they are hosting is ended** (added). Any teacher of a workspace can run any of its sessions, so one left open would not be out of reach. It would still be a room whose host's controls have stopped working, with a class in it and nobody who knows to take over. Ended is the state every screen already explains.
- **Pending invitations they had sent are revoked** (added). Otherwise a colleague about to be removed could invite a second address of their own and walk back in.
- **So is a pending invitation into the workspace addressed to their own email** (security review). One press on a stale invitation would otherwise undo the removal.
- **Any teacher still in the workspace can invite a removed colleague back.** That is ADR 0010's rule, any member may invite, and it is unchanged: removal is not a ban. The founder can remove them again. The dialog and the page say so.
- **An admin is not removed** (`is_admin`). Nothing in the app makes an admin in a self-registered workspace; one put there by hand would be silently made an instructor by the move to a new workspace, so the function refuses instead.
- The founder is told all of this in a confirm dialog before anything happens. The removed teacher is not notified by email in this version.

### Moving between workspaces

`accept_org_invite` no longer answers `already_teaches`. For an account that teaches:

| Situation                                                                                                                                    | Answer                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| already in the inviting workspace                                                                                                            | `already_member`          |
| is an admin of the workspace they are in (only ever made by hand; accepting would demote them)                                               | `admin_account`           |
| teaches in a workspace that is not self-registered (the shared LeaRN workspace)                                                              | `teaches_shared`          |
| founded the workspace they are in, and other teachers are in it                                                                              | `founder_with_members`    |
| is its last teacher, and it has a class with a student in it, an assignment that has not closed (opened or not), or a live session not ended | `students_depend`         |
| otherwise, without the confirmation                                                                                                          | `move_needs_confirmation` |
| otherwise, with it                                                                                                                           | `accepted`                |

- **The confirmation is enforced in the database, and is for one workspace.** `accept_org_invite` has two more arguments, `p_confirm_move` and `p_leaving`; unless the first is true and the second is the id of the workspace the account teaches in at that moment, a move is answered `move_needs_confirmation` and nothing is written. The id is the one the preview returned, carried in the form, so a confirmation given for one workspace cannot be spent on another the account has since been put in. The page (`/w/<token>`) first asks `org_invite_move_preview` what the move would be, names the workspace the teacher would leave, counts its item banks and classes, and has a box to tick. The Server Function sends the database whether the box was ticked and decides nothing itself.
- **Nothing is deleted or moved.** The workspace left stays as it is. If it now has no teacher, `orgs.emptied_at` records when, for a later sweep (not built; ADR 0009 lists what a sweep must do first). Nothing else sets `emptied_at`.
- **A workspace with no teacher takes nobody** (added): when a move empties a workspace, its pending invitations are revoked. When a move leaves others behind, only the invitations the mover had sent are revoked, and a session they were hosting there is ended, as on removal.
- **A class of an emptied workspace admits nobody** (security review). `private.admit_to_class`, which every way into a class goes through (the link, the typed code, the invited sign-up), answers `invalid` for a class whose workspace has `emptied_at` set. It takes the workspace's row `for share` after the profile row, which conflicts with the `for no key update` the move holds, so a student joining and the last teacher leaving happen one after the other: the student is in and the move is refused, or the workspace is emptied and the student is refused. (`for key share` would not do: it conflicts only with `for update`.)
- **A move signs out the account's other sessions**, with the accepting session's own `signOut({ scope: "others" })`, never the admin API, so the session that accepted keeps working. The same window as for removal applies to those sessions' issued tokens; the accepting session's own socket, if it has one open, is refused the next time its token is refreshed.
- **Every protection of ADR 0010 still applies to a move:** the bound address, the form post, the per-caller limit, `Referrer-Policy: no-referrer`, the member cap, and the #378 password retirement for an unconfirmed account or a session newer than the invitation.

### Deploying before the migration

The app must work on a database that does not have the migration yet, and after it.

- The founder is read on its own (`readFounderId`). Without the column the read fails, nobody is marked and no Remove is drawn: the page as it was.
- `acceptOrgInvite` names two arguments unless a move is confirmed, which reaches the old two-argument function and the new one alike. A confirmed call that finds no function taking the confirmation is made again without it.
- `previewOrgMove` treats "no such function" as "cannot say", and the page then tells a teacher what it told them before: this account already teaches.

## Consequences

- **A successful removal and a successful move each write one server log line** with the actor's id, the target's id and the workspace's id, and no name or address. There is no audit table.
- **Removal is immediate and cannot be undone from the app.** Bringing someone back is a new invitation, which they accept as a move from the empty workspace they were given. They come back as an ordinary member.
- **A founder cannot leave while anyone else is in the workspace**, and cannot hand the workspace to someone else. Transferring a workspace is not built. A workspace whose founder's account is deleted has nobody who can remove; that is an owner step.
- **A removed teacher loses their own work.** It stays with the workspace. This is fact 3, and the dialog says so. There is no export on the way out.
- **A founder can end a colleague's live class by removing them mid-session.** Accepted: the dialog says so, and the alternative is a class left in a room its host cannot drive.
- **The last teacher of a workspace with students cannot move** until the students are off its classes, its assignments have closed and its sessions have ended. Otherwise they use another address. The error is toward not orphaning students.
- **A moved teacher's old workspace becomes unreachable, not deleted.** Nobody can see it from the app until a sweep exists; its banks are not exported. The page says nothing comes with them and counts what is left behind.
- **An invitation is now a way to make someone leave their workspace**, but only with their ticked box, on a page that names what they lose.
- **A teacher of the shared workspace still needs another address**, as does a student.
- **Empty workspaces accumulate faster**: one per removal, one per move of a sole teacher. `emptied_at` marks only the second kind. A removed teacher's fresh workspace is theirs and in use.
- **The founder's email notes changed.** The invitation email says an account that already teaches is asked first, where it said such an account cannot accept. Until the migration is applied the page behind the link still says moving is not available.
- **Needs migration `20261011000000_workspace_remove_and_move` on the hosted project.** Before it, nobody can remove or move and everything else works as in ADR 0010.
