"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { MENU_ITEM_CLASSES } from "@/components/ui/AccountMenu";
import { textLinkClasses } from "@/components/ui/TextLink";
import { PROBLEM_LABEL } from "@/lib/support/problemReportForm";
import { EmailSupport } from "./EmailSupport";
import { useOpenProblemForm, useProblemSignedIn } from "./ProblemReportProvider";

export interface ProblemReportLinkProps {
  /**
   * Who can be looking. `signed-in`: a page only ever shown to an account (the library, the student
   * home), so the form is offered at once. `unknown`: a public page (help, the root error screen),
   * which asks the server once it has loaded and offers the form only to someone signed in.
   * `nobody`: a guest's page, which only offers email.
   */
  audience: "signed-in" | "unknown" | "nobody";
  /** The error screen's reference and Sentry event id, when it sits on one. */
  reference?: string;
  eventId?: string;
  /**
   * `link` (the default): the form's button, then the support address, which is always offered.
   * `menu`: the button alone, as a row in the account menu.
   */
  appearance?: "link" | "menu";
  /** Words before the email address when the form is not offered: "Still stuck?". */
  emailLead?: string;
}

/** The account menu is a native popover; it is closed first so the dialog is not behind it. */
function closeEnclosingPopover(event: MouseEvent<HTMLElement>) {
  const panel = event.currentTarget.closest("[popover]") as
    (HTMLElement & { hidePopover?: () => void }) | null;
  if (panel?.matches(":popover-open")) panel.hidePopover?.();
}

/**
 * The ways to tell us about a problem (#568): the form, for someone signed in, and the support
 * address, for everyone. Outside the provider (the global error page) or for a guest, the address
 * alone. On a public page the button appears once the server says someone is signed in; until
 * then, and for anyone signed out, only the address shows.
 */
export function ProblemReportLink({
  audience,
  reference,
  eventId,
  appearance = "link",
  emailLead,
}: ProblemReportLinkProps) {
  const openForm = useOpenProblemForm();
  const check = useProblemSignedIn();
  const [signedIn, setSignedIn] = useState(audience === "signed-in");

  useEffect(() => {
    if (audience !== "unknown" || !check) return;
    let current = true;
    check().then(
      (answer) => current && setSignedIn(answer),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [audience, check]);

  const offerForm = openForm !== null && audience !== "nobody" && signedIn;
  const button = offerForm ? (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(event) => {
        closeEnclosingPopover(event);
        openForm({ audience: "signed-in", reference, eventId });
      }}
      className={
        appearance === "menu" ? MENU_ITEM_CLASSES : `${textLinkClasses()} cursor-pointer text-left`
      }
    >
      {PROBLEM_LABEL}
    </button>
  ) : null;

  if (appearance === "menu") return button;
  return (
    <div className="flex flex-col items-start gap-2">
      {button}
      <EmailSupport lead={offerForm ? "Or" : emailLead} reference={reference} />
    </div>
  );
}
