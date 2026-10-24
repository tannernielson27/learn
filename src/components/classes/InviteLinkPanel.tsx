import { SessionQrCode } from "@/components/live/SessionQrCode";
import { formatClassCode, normalizeClassCode } from "@/lib/classes/classCode";
import { ConfirmSubmit, type ConfirmSubmitProps } from "./ConfirmSubmit";
import { CopyLinkButton, CopyTextButton } from "./CopyLinkButton";

/**
 * The ways into a class, as parts the class page places where a teacher reaches for them: the
 * invite link as text to paste (#205) and the class code to read out or write on the board (#356)
 * in the page's header, the QR code to scan off a projector on its overview, and the way to replace
 * the link and the code together, when they have gone somewhere they should not, in its settings.
 * The QR code is the live session's, drawn on the server with no script.
 *
 * The code is shown as `ABCD-EFGH`, so it is never read as a live session's `ABC DEF`, and copied
 * without the hyphen, as the database stores it.
 */

export interface InviteLinkFieldProps {
  /** The absolute invite URL. */
  url: string;
}

/** The invite link in a read-only box, and a button that copies it. */
export function InviteLinkField({ url }: InviteLinkFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="invite-link" className="text-sm font-medium text-ink-1">
        Invite link
      </label>
      {/* Beside each other on a phone, to keep the class page's header short; stacked from 640px. */}
      <div className="flex flex-wrap items-start gap-3 sm:flex-col sm:flex-nowrap sm:items-stretch sm:gap-2">
        <input
          id="invite-link"
          type="text"
          readOnly
          value={url}
          // Read only, so the quieter surface; the field's 3:1 edge still marks the box (WCAG 1.4.11).
          className="tap-target min-w-0 flex-[1_1_9rem] rounded-sm border border-line-field bg-surface-2 px-3 font-mono text-sm text-ink-1 sm:w-full sm:flex-none"
        />
        <CopyLinkButton url={url} />
      </div>
    </div>
  );
}

export interface ClassCodeBlockProps {
  /** The class's join code as stored (#356): eight characters, no hyphen. */
  code: string;
  /**
   * What the "Class code" label is. A heading under a section's h2; plain text in the page's
   * header, where a heading would come before the page's own sections.
   */
  labelAs?: "h3" | "p";
}

/** The class code, large enough to read off a projector, and a button that copies it. */
export function ClassCodeBlock({ code, labelAs: Label = "h3" }: ClassCodeBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium text-ink-1">Class code</Label>
      {/* On a phone the code and its button share a row and the hint goes under both; from 640px
          the code stands alone, projector-sized, above the hint and the button. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-col sm:flex-nowrap sm:items-start">
        <p
          data-testid="class-code"
          className="font-mono text-2xl break-all text-ink-1 sm:text-3xl sm:tracking-[0.15em]"
        >
          {formatClassCode(code)}
        </p>
        <p className="order-last basis-full text-sm text-ink-2 sm:order-none sm:max-w-prose sm:basis-auto">
          Students type it after signing in.
        </p>
        <CopyTextButton
          text={normalizeClassCode(code)}
          label="Copy class code"
          failedMessage="Could not copy. Write the code down from the page instead."
        />
      </div>
    </div>
  );
}

export interface InviteQrCodeProps {
  url: string;
  /** The class's name, for the QR code's accessible name. */
  classTitle: string;
  className?: string;
}

export function InviteQrCode({
  url,
  classTitle,
  className = "w-48 max-w-full sm:w-56",
}: InviteQrCodeProps) {
  return (
    <SessionQrCode
      url={url}
      label={`QR code for the ${classTitle} invite link`}
      className={className}
    />
  );
}

export interface ReplaceInviteLinkProps {
  /** Rotates the token and the code, bound to this class. */
  rotateAction: ConfirmSubmitProps["action"];
}

/** Replaces the link, the code and the QR code at once, after asking. */
export function ReplaceInviteLink({ rotateAction }: ReplaceInviteLinkProps) {
  return (
    <ConfirmSubmit
      action={rotateAction}
      label="Replace the link"
      confirmLabel="Replace it now"
      warning="The current link, class code and QR code stop working at once. Students already in the class stay in it."
    />
  );
}
