"use client";

import { useState } from "react";
import type { EmailCodeFormProps } from "@/components/auth/EmailCodeForm";
import { InviteEmailForm, type InviteEmailFormProps } from "./InviteEmailForm";
import { InviteSignUpForm, type InviteSignUpFormProps } from "./InviteSignUpForm";

export interface InvitePanelProps {
  signUpAction: InviteSignUpFormProps["action"];
  linkAction: InviteEmailFormProps["action"];
  codeAction: EmailCodeFormProps["action"];
  /** Where the email's code sends the person: this invite page, which then offers to join. */
  codeNext: string;
  /** The class the link is for, as the server resolved it. */
  classTitle: string;
}

const SWITCH =
  "tap-target mt-4 inline-flex items-center rounded-sm text-left text-sm font-medium text-accent-ink hover:underline";

/**
 * The class invite for someone not signed in. A password comes first, because it lets a student
 * in during the first minute of class whatever their inbox is doing. The emailed link is one tap
 * away for anyone who would rather not have a password, and the address typed goes with them.
 */
export function InvitePanel({
  signUpAction,
  linkAction,
  codeAction,
  codeNext,
  classTitle,
}: InvitePanelProps) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  // Only after the person has switched: on arrival, focus stays where the page put it.
  const [switched, setSwitched] = useState(false);

  function show(target: "password" | "link") {
    setMode(target);
    setSwitched(true);
  }

  if (mode === "password") {
    return (
      <>
        <InviteSignUpForm
          action={signUpAction}
          classTitle={classTitle}
          email={email}
          onEmailChange={setEmail}
          autoFocus={switched}
        />
        <button type="button" className={SWITCH} onClick={() => show("link")}>
          Join with an emailed link instead
        </button>
      </>
    );
  }

  return (
    <>
      <InviteEmailForm
        action={linkAction}
        classTitle={classTitle}
        codeAction={codeAction}
        codeNext={codeNext}
        initialEmail={email}
        onEmailChange={setEmail}
        autoFocus={switched}
      />
      <button type="button" className={SWITCH} onClick={() => show("password")}>
        Join with a password instead
      </button>
    </>
  );
}
