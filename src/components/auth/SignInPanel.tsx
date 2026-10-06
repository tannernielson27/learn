"use client";

import { useState } from "react";
import { choosePasswordPath } from "@/lib/auth/accountPaths";
import type { EmailCodeFormProps } from "./EmailCodeForm";
import { PasswordSignInForm, type PasswordSignInFormProps } from "./PasswordSignInForm";
import { SignInForm, type SignInFormProps } from "./SignInForm";

export interface SignInPanelProps {
  passwordAction: PasswordSignInFormProps["action"];
  linkAction: SignInFormProps["action"];
  codeAction: EmailCodeFormProps["action"];
  /** Already made safe by the page. */
  next: string;
  /** The person arrived from a sign-in link that failed, so they start at the link form. */
  linkError?: boolean;
}

/** `forgot` is the emailed link with one difference: it lands on choosing a new password. */
type Mode = "password" | "link" | "forgot";

const SWITCH =
  "tap-target inline-flex items-center rounded-sm text-left text-sm font-medium text-accent-ink hover:underline";

/**
 * The sign-in page's one decision: a password, or a link by email. The password comes first
 * because it works when email is slow, filtered or on another device. The link stays one tap away
 * for anyone who never chose a password or has forgotten it, and nothing typed is lost in between.
 */
export function SignInPanel({
  passwordAction,
  linkAction,
  codeAction,
  next,
  linkError = false,
}: SignInPanelProps) {
  const [mode, setMode] = useState<Mode>(linkError ? "link" : "password");
  const [email, setEmail] = useState("");
  // Only after the person has switched: on arrival, focus stays where the page put it.
  const [switched, setSwitched] = useState(false);

  function show(target: Mode) {
    setMode(target);
    setSwitched(true);
  }

  if (mode === "password") {
    return (
      <>
        <PasswordSignInForm
          action={passwordAction}
          next={next}
          email={email}
          onEmailChange={setEmail}
          autoFocus={switched}
        />
        <div className="mt-4 flex flex-col items-start">
          <button type="button" className={SWITCH} onClick={() => show("forgot")}>
            Forgot your password?
          </button>
          <button type="button" className={SWITCH} onClick={() => show("link")}>
            Sign in with an emailed link instead
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {mode === "forgot" ? (
        <p className="mb-4 text-ink-2">
          We will email you a link that signs you in. Then you can choose a new password.
        </p>
      ) : null}
      <SignInForm
        // A new form for each mode: a link already sent for one must not show under the other.
        key={mode}
        action={linkAction}
        next={mode === "forgot" ? choosePasswordPath(next) : next}
        linkError={linkError && !switched}
        codeAction={codeAction}
        initialEmail={email}
        onEmailChange={setEmail}
        autoFocus={switched}
      />
      <div className="mt-4 flex flex-col items-start">
        <button type="button" className={SWITCH} onClick={() => show("password")}>
          Sign in with your password instead
        </button>
      </div>
    </>
  );
}
