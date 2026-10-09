import type { Metadata } from "next";
import Link from "next/link";
import { InviteColleagueForm } from "@/components/workspace/InviteColleagueForm";
import { MemberList } from "@/components/workspace/MemberList";
import { PendingInvites } from "@/components/workspace/PendingInvites";
import { requireAuthor } from "@/lib/authoring/session";
import { listMembers, listOpenInvites, readWorkspace } from "@/lib/supabase/workspace";
import {
  memberCountLabel,
  WORKSPACE_DAILY_INVITES,
  WORKSPACE_MEMBER_CAP,
  WORKSPACE_PATH,
} from "@/lib/workspace/workspace";
import { inviteColleague, resendInvite, revokeInvite } from "./actions";

export const metadata: Metadata = { title: "Workspace" };

/**
 * A teacher's workspace: who teaches in it, and, in a workspace a teacher made by signing up, a
 * form to invite a colleague and the invitations still waiting.
 *
 * `requireAuthor` sends a student to the student home and a visitor to sign in before anything is
 * read. Every read runs as the teacher: `org_members()` and row level security answer only for
 * their own workspace. The shared LeaRN workspace shows its members and no way to invite; joining
 * it stays the owner's step (docs/05 section 7.6), and `create_org_invite` refuses it regardless.
 */
export default async function WorkspacePage() {
  const { supabase, orgId, userId } = await requireAuthor(WORKSPACE_PATH);
  const [workspace, members, invites] = await Promise.all([
    readWorkspace(supabase, orgId),
    listMembers(supabase),
    listOpenInvites(supabase),
  ]);
  const canInvite = workspace?.selfRegistered === true;

  return (
    <>
      <Link
        href="/author"
        className="tap-target mb-4 inline-flex items-center text-sm font-medium text-accent-ink hover:underline"
      >
        Item banks
      </Link>
      <p className="mb-1 font-mono text-sm tracking-wide text-ink-2 uppercase">Workspace</p>
      {/* The name is a teacher's own words: text, never markup. */}
      <h1 className="mb-8 font-read text-3xl break-words text-ink-1">
        {workspace ? workspace.name : "Your workspace"}
      </h1>
      {workspace ? null : (
        <p role="alert" className="mb-8 text-ink-2">
          The workspace could not be loaded. Reload the page to try again.
        </p>
      )}

      <section aria-labelledby="members-heading" className="mb-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 id="members-heading" className="text-lg font-medium text-ink-1">
            Members
          </h2>
          {canInvite && members ? (
            <p className="font-mono text-sm text-ink-2">{memberCountLabel(members.length)}</p>
          ) : null}
        </div>
        {members === null ? (
          <p role="alert" className="text-ink-2">
            The members could not be loaded. Reload the page to try again.
          </p>
        ) : (
          <MemberList members={members} viewerId={userId} />
        )}
      </section>

      {canInvite ? (
        <>
          <section aria-labelledby="invite-heading" className="mb-10">
            <h2 id="invite-heading" className="mb-2 text-lg font-medium text-ink-1">
              Invite a colleague
            </h2>
            <p className="mb-4 max-w-prose text-ink-2">
              They join this workspace as a teacher and can see and change everything in it: every
              bank, class and report. A workspace holds up to {WORKSPACE_MEMBER_CAP} teachers, and
              you can send {WORKSPACE_DAILY_INVITES} invitations a day. An account that is already a
              student, or already teaches in another workspace, cannot accept.
            </p>
            <InviteColleagueForm action={inviteColleague} />
          </section>

          <section aria-labelledby="pending-heading">
            {/* Focusable from script only: a confirmed revoke or resend sends focus here. */}
            <h2 id="pending-heading" tabIndex={-1} className="mb-3 text-lg font-medium text-ink-1">
              Pending invitations
            </h2>
            {invites === null ? (
              <p role="alert" className="text-ink-2">
                The invitations could not be loaded. Reload the page to try again.
              </p>
            ) : (
              <PendingInvites
                invites={invites}
                now={new Date()}
                revokeActionFor={(inviteId) => revokeInvite.bind(null, inviteId)}
                resendActionFor={(inviteId) => resendInvite.bind(null, inviteId)}
                emptyAction={{ href: "#invite-heading", label: "Invite a colleague" }}
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
            Inviting colleagues is not available in this workspace. LeaRN adds its teachers
            directly.
          </p>
        </section>
      ) : null}
    </>
  );
}
