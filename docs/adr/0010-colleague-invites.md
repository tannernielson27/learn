# ADR 0010 — A teacher invites a colleague into their own workspace

- **Status:** Accepted, 2026-10-08 (owner decisions of that day). Changes one consequence of ADR 0009: "a teacher cannot invite a colleague into theirs".
- **Deciders:** product owner (the decisions below), Claude (orchestrator)

## Context

ADR 0009 gave every self-registered teacher a workspace (org) of their own, and row level security is scoped by org. Two teachers of the same course who each sign up therefore see nothing of each other's banks, classes or results, and the only way to share was the owner's two steps in the SQL editor (docs/05 §7.6), which put someone in the **shared** LeaRN workspace and nowhere else.

Four facts in the code shape the decision:

1. **Everything an author reads or writes is scoped by org and by nothing finer.** No table, policy or function narrows an author to rows they made themselves. Joining a workspace is all or nothing.
2. **A profile has one org and one role** (`profiles_org_and_role_together`). An account that teaches or studies anywhere cannot be in a second workspace.
3. **Open sign-up lets anyone make an account on an address they do not own** (ADR 0009, accepted). Such an account is unconfirmed until its address is shown to be its holder's, and #378 retires the password it was made with when that happens from another browser.
4. **The shared workspace has AI import on** (`orgs.ai_import_enabled`); a self-registered one does not.

## Decision

- **Any teacher of a self-registered workspace may invite**, the instructors and admins alike, including a colleague who was invited themselves. The inviter's own address must be confirmed first. There is no owner or admin tier inside a workspace in this version.
- **The shared workspace stays owner-only.** `create_org_invite` refuses a workspace that is not self-registered, and `accept_org_invite` checks again. Joining it remains docs/05 §7.6.
- **The invitation is a link bound to one address.** `/w/<token>`, a 192-bit token emailed to the invited address and stored only as a hash. It is accepted only by an account whose address is the invited one. The inviter never sees the token: it goes from the database into the email and nowhere else, which is why creating an invitation is a service-role call from a Server Function and not something a browser can ask for.
- **Opening the link accepts nothing.** Accepting is a form post. The page sends `Referrer-Policy: no-referrer`, as does sign-in on the way back to it.
- **Only an account with no role can accept**, and it becomes an instructor of the inviting workspace. A student account is refused, and so is an account that already teaches in any workspace, each with its own sentence. Neither is moved, merged or demoted; the remedy is another address.
- **An invitation lasts 7 days.** An expired one stays listed for the inviter until it is revoked or sent again.
- **Caps: 10 members per workspace, 10 pending invitations per workspace, 5 invitations per inviter per 24 hours** (a resend is a new invitation and counts). All three are enforced in the database; the email sender counts the five again and holds the whole deployment to 50 invitation emails an hour.
- **No removal in the app.** Nobody can remove a colleague, leave a workspace or move between workspaces in this version. Revoking works only on an invitation that has not been accepted.
- **An accepted invitee counts as confirmed.** The link reached the invited inbox and nowhere else, so accepting it is the proof sign-up otherwise waits for: an account made on the invitation page is created without `learn_email_unconfirmed`, and an existing account has the key cleared.
- **Accepting retires an earlier password when the account may have been made by someone else.** For an account that existed already, the password it had is replaced with one nobody knows, every other session is signed out, and the person is sent to choose a password, when the account was still unconfirmed or when the session accepting was made after the invitation was issued. Only a confirmed account in a browser that was signed in before the invitation existed is left as it was. This reuses #378's `endEarlierAccess`; anything that cannot be read counts toward ending access.
- **No free text in the email**, and the workspace's name and the inviter's address are not in its subject line: an invitation is not a way to write to a stranger through LeaRN.

## Consequences

- **An invited colleague sees and can change everything in the workspace**: every bank, item, case study, class, roster (students' names and addresses), assignment, live session and result, whoever made it. They can also invite others and revoke anyone's pending invitation. The inviting teacher is told so before they send. There is no way to share one bank only.
- **A mistaken invitation cannot be undone from the app once accepted.** Removing a member is an owner step in the SQL editor, not yet written down (docs/05 §7.6). The 7-day expiry, the address binding and Revoke are what stand in front of that.
- **A person who made an account on someone else's address gains nothing when that address is invited.** They cannot receive the link. If the real holder accepts in a browser, the squatter's password and sessions end at that moment.
- **Someone who signed in after the invitation was sent, but before opening it, is asked for a new password they did not strictly need.** Accepted: the error is toward ending access.
- **A student who also teaches needs two addresses**, as does a teacher who wants to be in two workspaces. Recorded as a known limit, not solved here.
- **Email volume.** Up to 50 invitation emails an hour through the app mailer, against Resend's free 100 a day shared with the welcome email. The owner may change the ceiling.
- **A workspace is no longer one teacher's.** Copy that says "no other teacher can see them" is true only until the first colleague joins; an invited colleague gets a shorter welcome that says the workspace is shared.
- **Needs migration `20261009010000_workspace_invites` on the hosted project** before any of it works there.
