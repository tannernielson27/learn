import type { Metadata } from "next";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { Notice } from "@/components/ui/Notice";
import { InviteColleagueForm } from "@/components/workspace/InviteColleagueForm";
import { MemberList } from "@/components/workspace/MemberList";
import { PendingInvites } from "@/components/workspace/PendingInvites";
import { requireAuthor } from "@/lib/authoring/session";
import {
  listMembers,
  listOpenInvites,
  readFounderId,
  readWorkspace,
} from "@/lib/supabase/workspace";
import {
  memberCountLabel,
  WORKSPACE_DAILY_INVITES,
  WORKSPACE_MEMBER_CAP,
  WORKSPACE_PATH,
} from "@/lib/workspace/workspace";
import { inviteColleague, removeMember, resendInvite, revokeInvite } from "./actions";

export const metadata: Metadata = { title: "Workspace" };

/**
 * A teacher's workspace: who teaches in it, and, in a workspace a teacher made by signing up, a
 * form to invite a colleague and the invitations still waiting.
 *
 * `requireAuthor` sends a student to the student home and a visitor to sign in before anything is
 * read. Every read runs as the teacher: `org_members()` and row level security answer only for
 * their own workspace. The shared LeaRN workspace shows its members and no way to invite; joining
 * it stays the owner's step (docs/05 section 7.6), and `create_org_invite` refuses it regardless.
 *
 * The teacher who started a workspace is marked, and is the only one given a Remove on each
 * colleague's row (ADR 0011). That is a courtesy of the page: `remove_org_member` checks the
 * founder itself. The founder is read on its own, so a database that does not have the column yet
 * still draws the page, with nobody marked and no Remove.
 */
export default async function WorkspacePage() {
  const { supabase, orgId, userId } = await requireAuthor(WORKSPACE_PATH);
  const [workspace, members, invites, founderId] = await Promise.all([
    readWorkspace(supabase, orgId),
    listMembers(supabase),
    listOpenInvites(supabase),
    readFounderId(supabase, orgId),
  ]);
  const canInvite = workspace?.selfRegistered === true;
  const canRemove = canInvite && founderId === userId;

  return (
    <ReadingWidth>
      {/* The way back to the library is the layout's navigation (#412). */}
      <p className="mb-1 font-mono text-sm tracking-wide text-ink-2 uppercase">Workspace</p>
      {/* The name is a teacher's own words: text, never markup. */}
      <h1 className="mb-8 font-read text-3xl break-words text-ink-1">
        {workspace ? workspace.name : "Your workspace"}
      </h1>
      {workspace ? null : (
        <Notice role="alert" className="mb-8">
          The workspace could not be loaded. Reload the page to try again.
        </Notice>
      )}

      <section aria-labelledby="members-heading" className="mb-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
          {/* Focusable from script only: removing a colleague sends focus here. */}
          <h2 id="members-heading" tabIndex={-1} className="text-lg font-medium text-ink-1">
            Teachers
          </h2>
          {canInvite && members ? (
            <p className="font-mono text-sm text-ink-2">{memberCountLabel(members.length)}</p>
          ) : null}
        </div>
        {members === null ? (
          <Notice role="alert">
            The teachers could not be loaded. Reload the page to try again.
          </Notice>
        ) : (
          <MemberList
            members={members}
            viewerId={userId}
            founderId={canInvite ? founderId : null}
            removeActionFor={
              canRemove ? (memberId) => removeMember.bind(null, memberId) : undefined
            }
            focusAfterRemove="members-heading"
          />
        )}
      </section>

      {canInvite ? (
        <>
          <section aria-labelledby="invite-heading" className="mb-10">
            <h2 id="invite-heading" className="mb-2 text-lg font-medium text-ink-1">
              Invite a colleague
            </h2>
            <p className="mb-2 max-w-prose text-ink-2">
              They join as a teacher with the same access as you.
            </p>
            {/* Everything a teacher needs before inviting, kept and closed (#412). */}
            <details className="mb-4 max-w-prose text-sm text-ink-2">
              <summary className="tap-target inline-flex cursor-pointer items-center font-medium">
                What a colleague can do
              </summary>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                <li>
                  See and edit every quiz, class and assignment, see every student&apos;s name,
                  email address and results, start live sessions, and send or revoke invitations.
                </li>
                <li>
                  Only the person who started the workspace can remove a colleague. Any teacher can
                  invite them back.
                </li>
                <li>
                  A workspace holds up to {WORKSPACE_MEMBER_CAP} teachers, and you can send{" "}
                  {WORKSPACE_DAILY_INVITES} invitations a day.
                </li>
                <li>
                  A student account cannot accept. A teacher in another workspace can accept only by
                  leaving that workspace, and is asked to confirm first.
                </li>
              </ul>
            </details>
            <InviteColleagueForm action={inviteColleague} />
          </section>

          <section aria-labelledby="pending-heading">
            {/* Focusable from script only: a confirmed revoke or resend sends focus here. */}
            <h2 id="pending-heading" tabIndex={-1} className="mb-3 text-lg font-medium text-ink-1">
              Pending invitations
            </h2>
            {invites === null ? (
              <Notice role="alert">
                The invitations could not be loaded. Reload the page to try again.
              </Notice>
            ) : (
              <PendingInvites
                invites={invites}
                now={new Date()}
                revokeActionFor={(inviteId) => revokeInvite.bind(null, inviteId)}
                resendActionFor={(inviteId) => resendInvite.bind(null, inviteId)}
                focusAfterChange="pending-heading"
              />
            )}
          </section>
        </>
      ) : workspace ? (
        <section aria-labelledby="invite-heading">
          <h2 id="invite-heading" className="mb-2 text-lg font-medium text-ink-1">
            Invite a colleague
          </h2>
          <p className="max-w-prose text-ink-2">
            Your LeaRN administrator adds teachers to this workspace.
          </p>
        </section>
      ) : null}
    </ReadingWidth>
  );
}
