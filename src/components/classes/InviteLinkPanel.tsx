import { SessionQrCode } from "@/components/live/SessionQrCode";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { CopyLinkButton } from "./CopyLinkButton";

export interface InviteLinkPanelProps {
  /** The absolute invite URL. */
  url: string;
  /** The class's name, for the QR code's accessible name. */
  classTitle: string;
  /** Rotates the token, bound to this class. */
  rotateAction: (formData: FormData) => Promise<void>;
}

/**
 * The class's invite link three ways (#205): as text to paste, as a QR code to scan off a
 * projector, and a way to replace it when it has gone somewhere it should not. The QR code is the
 * live session's, drawn on the server with no script.
 */
export function InviteLinkPanel({ url, classTitle, rotateAction }: InviteLinkPanelProps) {
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
      <SessionQrCode
        url={url}
        label={`QR code for the ${classTitle} invite link`}
        className="w-48 max-w-full sm:w-56"
      />
      <ConfirmSubmit
        action={rotateAction}
        label="Replace the link"
        confirmLabel="Replace it now"
        warning="The current link and QR code stop working at once. Students already in the class stay in it."
      />
    </div>
  );
}
