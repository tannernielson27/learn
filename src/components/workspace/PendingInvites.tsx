import { ConfirmSubmit, type ConfirmSubmitProps } from "@/components/classes/ConfirmSubmit";
import { EmptyState, type EmptyStateAction } from "@/components/ui/EmptyState";
import type { OpenInvite } from "@/lib/supabase/workspace";
import { formatWorkspaceDate, isInviteExpired } from "@/lib/workspace/workspace";

export interface PendingInvitesProps {
  invites: readonly OpenInvite[];
  /** When the page was rendered: an invitation past its last day is marked, not hidden. */
  now: Date;
  /** The revoke Server Function bound to one invitation. */
  revokeActionFor: (inviteId: string) => ConfirmSubmitProps["action"];
  /** The resend Server Function bound to one invitation. */
  resendActionFor: (inviteId: string) => ConfirmSubmitProps["action"];
  /** With nothing pending: the way to the invite form. */
  emptyAction?: EmptyStateAction;
  /**
   * The id of the focusable heading above the list. Revoking or resending takes the row and its
   * buttons off the page, so focus goes here rather than to the document body.
   */
  focusAfterChange?: string;
}

export const RESEND_WARNING =
  "The link already sent stops working and a new one is emailed. It counts toward your 5 invitations a day.";
export const REVOKE_WARNING = "The link in their email stops working.";

/**
 * Invitations nobody has accepted yet. Each can be revoked, or sent again as a new invitation.
 * One that has run out its 7 days stays listed, marked expired, until it is resent or revoked.
 */
export function PendingInvites({
  invites,
  now,
  revokeActionFor,
  resendActionFor,
  emptyAction,
  focusAfterChange,
}: PendingInvitesProps) {
  if (invites.length === 0) {
    return (
      <EmptyState
        level={3}
        heading="No pending invitations"
        body="An invitation is listed here from when it is sent until your colleague accepts it."
        action={emptyAction}
      />
    );
  }

  return (
    <ul
      aria-label="Pending invitations"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {invites.map((invite) => {
        const expired = isInviteExpired(invite.expiresAt, now);
        const sent = formatWorkspaceDate(invite.createdAt);
        const ends = formatWorkspaceDate(invite.expiresAt);
        return (
          <li
            key={invite.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2 py-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="break-all text-ink-1">{invite.email}</span>
              <span className="font-mono text-sm text-ink-2">
                {sent ? `Sent ${sent}. ` : null}
                {expired ? `Expired${ends ? ` ${ends}` : ""}.` : `Expires ${ends}.`}
              </span>
            </span>
            <div className="flex flex-wrap items-start gap-2">
              <ConfirmSubmit
                action={resendActionFor(invite.id)}
                label="Resend"
                ariaLabel={`Resend the invitation to ${invite.email}`}
                confirmLabel="Send a new invitation"
                warning={RESEND_WARNING}
                focusOnSuccess={focusAfterChange}
              />
              <ConfirmSubmit
                action={revokeActionFor(invite.id)}
                label="Revoke"
                ariaLabel={`Revoke the invitation to ${invite.email}`}
                confirmLabel="Revoke invitation"
                warning={REVOKE_WARNING}
                focusOnSuccess={focusAfterChange}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
