import { SessionQrCode } from "@/components/live/SessionQrCode";
import { formatClassCode, normalizeClassCode } from "@/lib/classes/classCode";
import { ConfirmSubmit, type ConfirmSubmitProps } from "./ConfirmSubmit";
import { CopyLinkButton, CopyTextButton } from "./CopyLinkButton";

export interface InviteLinkPanelProps {
  /** The absolute invite URL. */
  url: string;
  /** The class's join code as stored (#356): eight characters, no hyphen. */
  code: string;
  /** The class's name, for the QR code's accessible name. */
  classTitle: string;
  /** Rotates the token and the code, bound to this class. */
  rotateAction: ConfirmSubmitProps["action"];
}

/**
 * The ways into a class: the invite link as text to paste (#205), the class code to read out or
 * write on the board (#356), a QR code to scan off a projector, and a way to replace the link and
 * the code together when they have gone somewhere they should not. The QR code is the live
 * session's, drawn on the server with no script.
 *
 * The code is shown as `ABCD-EFGH`, so it is never read as a live session's `ABC DEF`, and copied
 * without the hyphen, as the database stores it.
 */
export function InviteLinkPanel({ url, code, classTitle, rotateAction }: InviteLinkPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="invite-link" className="text-sm font-medium text-ink-1">
          Invite link
        </label>
        <input
          id="invite-link"
          type="text"
          readOnly
          value={url}
          className="tap-target w-full rounded-sm border border-line bg-surface-2 px-3 font-mono text-sm text-ink-1"
        />
      </div>
      <CopyLinkButton url={url} />
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink-1">Class code</h3>
        <p
          data-testid="class-code"
          className="font-mono text-3xl tracking-[0.15em] break-all text-ink-1"
        >
          {formatClassCode(code)}
        </p>
        <p className="max-w-prose text-sm text-ink-2">
          Read it out or write it on the board. Students type it after signing in, and it joins the
          same class as the link.
        </p>
      </div>
      <CopyTextButton
        text={normalizeClassCode(code)}
        label="Copy class code"
        failedMessage="Could not copy. Write the code down from the page instead."
      />
      <SessionQrCode
        url={url}
        label={`QR code for the ${classTitle} invite link`}
        className="w-48 max-w-full sm:w-56"
      />
      <ConfirmSubmit
        action={rotateAction}
        label="Replace the link"
        confirmLabel="Replace it now"
        warning="The current link, class code and QR code stop working at once. Students already in the class stay in it."
      />
    </div>
  );
}
