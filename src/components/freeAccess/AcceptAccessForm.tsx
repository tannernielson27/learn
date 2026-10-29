"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { AUTH_HEADING, AUTH_SUBLINE } from "@/components/auth/AuthFrame";
import { FormError } from "@/components/auth/FormError";
import type { RedeemState } from "@/lib/betaPass/link";
import { UnusableLink } from "./UnusableLink";

export interface AcceptAccessFormProps {
  /** The page's Server Function, bound to the token; on success it redirects. */
  action: (state: RedeemState, formData: FormData) => Promise<RedeemState>;
  heading: string;
  /** The page's one line. */
  line: string;
  /** What every refusal reads, from the page. */
  unusable: string;
  /** The signed-in account's address, so nobody accepts as the wrong person by accident. */
  email: string;
}

const INITIAL: RedeemState = { status: "idle" };

/**
 * One button, for a signed-in teacher. A form post, so opening the link (as a mail scanner does)
 * changes nothing. Every refusal turns the page into the one neutral sentence.
 */
export function AcceptAccessForm({
  action,
  heading,
  line,
  unusable,
  email,
}: AcceptAccessFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  if (state.status === "unusable") return <UnusableLink sentence={unusable} />;

  return (
    <section aria-labelledby="free-access-heading">
      <h1 id="free-access-heading" className={AUTH_HEADING}>
        {heading}
      </h1>
      <p className={AUTH_SUBLINE}>
        {line} Signed in as {email}.
      </p>
      <form action={formAction} className="flex flex-col gap-3">
        {state.status === "error" ? <FormError>{state.error}</FormError> : null}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          disabled={pending}
          aria-disabled={pending}
        >
          {pending ? "Accepting…" : "Accept"}
        </Button>
      </form>
    </section>
  );
}
