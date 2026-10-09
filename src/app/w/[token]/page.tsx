import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { FocusHeading } from "@/components/status/FocusHeading";
import { AcceptInviteForm } from "@/components/workspaceInvite/AcceptInviteForm";
import { InviteAnswerView, InviteNotValid } from "@/components/workspaceInvite/InviteAnswerView";
import { JoinWorkspaceButton } from "@/components/workspaceInvite/JoinWorkspaceButton";
import { MoveWorkspaceForm } from "@/components/workspaceInvite/MoveWorkspaceForm";
import { clientIp } from "@/lib/auth/signInRateLimit";
import { readViewer } from "@/lib/classes/viewer";
import { previewOrgMove, resolveOrgInvite } from "@/lib/supabase/orgInvites";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  INVITE_UNAVAILABLE,
  inviterLabel,
  maskEmail,
  sameAddress,
  signInToAcceptPath,
} from "@/lib/workspace/invite";
import {
  acceptInvitation,
  createAccountAndAccept,
  moveToInvitedWorkspace,
  signOutToInvitation,
} from "./actions";

export const metadata: Metadata = {
  title: "Workspace invitation",
  // The token is the whole secret: no Referer carries it off the page, and nothing indexes it.
  // The proxy sends the same policy as a header on every answer under /w/.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// Rendered for each request and never stored: the answer depends on the token and on who asks.
export const dynamic = "force-dynamic";

const linkClass =
  "tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline";
const HEADING = "mb-3 font-read text-3xl break-words text-ink-1 outline-none";

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-16 pb-12 sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">
        <p className="mb-2 font-mono text-sm tracking-wide text-ink-2 uppercase">LeaRN</p>
        {children}
      </div>
    </main>
  );
}

/**
 * A workspace invitation, `/w/<token>` (owner decisions 2026-10-08): the link in the email a
 * teacher sends a colleague.
 *
 * Opening it changes nothing. This page only looks the token up, with the service role and the
 * caller's trusted address, and decides what to offer; accepting is a button that posts
 * (`./actions`). A missing, malformed or unknown token and a caller the lookup has stopped
 * answering all get the same page.
 *
 * Then it depends on who is looking. A visitor makes an account on the invited address, or signs
 * in to the one they have and comes back. Someone signed in as the invited address gets one
 * button, or is told why that account cannot join. Someone signed in as anybody else is told to
 * sign out, and sees the invited address only in part.
 *
 * A teacher signed in as the invited address is a move (ADR 0011). The database is asked what
 * accepting would do (`org_invite_move_preview`, for the id this request's session belongs to):
 * either why this account may not leave the workspace it is in, or the name of that workspace and
 * what it holds, which the page puts above a box to tick. When the database cannot say, which is
 * every time until migration 20261011000000 is applied, the page says what it always said: this
 * account already teaches.
 *
 * The workspace's name and the inviter's are another person's words: they are rendered as text.
 */
export default async function WorkspaceInvitePage({ params }: PageProps<"/w/[token]">) {
  const { token } = await params;
  const service = createSupabaseServiceClient();
  const invite = await resolveOrgInvite(service, token, clientIp(await headers()));

  if (invite.status === "invalid") {
    return (
      <Shell>
        <InviteNotValid />
      </Shell>
    );
  }
  if (invite.status === "unavailable") {
    return (
      <Shell>
        <section aria-labelledby="workspace-invite-paused">
          <FocusHeading id="workspace-invite-paused" className={HEADING}>
            This invitation cannot be opened just now
          </FocusHeading>
          <p role="alert" className="text-ink-1">
            {INVITE_UNAVAILABLE}
          </p>
        </section>
      </Shell>
    );
  }

  const viewer = await readViewer();
  const teaches =
    viewer.status === "signed_in" && (viewer.role === "instructor" || viewer.role === "admin");

  if (invite.state !== "pending") {
    return (
      <Shell>
        <InviteAnswerView answer={{ status: "closed", state: invite.state }} />
        {invite.state === "accepted" && teaches ? (
          <Link href="/author" className={`${linkClass} mt-2`}>
            Go to your item banks
          </Link>
        ) : null}
      </Shell>
    );
  }

  const heading = `${inviterLabel({ name: invite.inviterName, email: invite.inviterEmail })} invited you to teach in ${invite.workspaceName}`;

  if (viewer.status === "signed_out") {
    return (
      <Shell>
        <AcceptInviteForm
          action={createAccountAndAccept.bind(null, token)}
          heading={heading}
          invitedEmail={invite.invitedEmail}
          signInHref={signInToAcceptPath(token)}
        />
      </Shell>
    );
  }

  if (!sameAddress(viewer.email, invite.invitedEmail)) {
    return (
      <Shell>
        <section aria-labelledby="workspace-invite-other-address">
          <h1 id="workspace-invite-other-address" className={HEADING}>
            This invitation is for another address
          </h1>
          <p className="mb-6 break-words text-ink-2">
            It was sent to {maskEmail(invite.invitedEmail)}, and you are signed in as {viewer.email}
            . Sign out, then open the link from the email again and sign in as the address it was
            sent to.
          </p>
          <form action={signOutToInvitation.bind(null, token)}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </section>
      </Shell>
    );
  }

  if (viewer.role === "student") {
    return (
      <Shell>
        <InviteAnswerView answer={{ status: "refused", reason: "student" }} />
      </Shell>
    );
  }

  if (viewer.role !== null) {
    // The id is the verified session's, never the request's: the answer describes that account.
    const move = await previewOrgMove(service, viewer.userId, token);
    if (move.status === "move") {
      return (
        <Shell>
          <MoveWorkspaceForm
            action={moveToInvitedWorkspace.bind(null, token)}
            heading={heading}
            email={viewer.email}
            preview={{
              leavingWorkspace: move.leavingWorkspace,
              leavingWorkspaceId: move.leavingWorkspaceId,
              bankCount: move.bankCount,
              classCount: move.classCount,
            }}
          />
        </Shell>
      );
    }
    return (
      <Shell>
        <InviteAnswerView
          answer={{
            status: "refused",
            reason: move.status === "refused" ? move.reason : "already_teaches",
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <JoinWorkspaceButton
        action={acceptInvitation.bind(null, token)}
        heading={heading}
        email={viewer.email}
      />
    </Shell>
  );
}
