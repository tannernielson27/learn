"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { InviteUnavailable } from "./InviteUnavailable";
import { AUTH_HEADING, AUTH_SUBLINE } from "@/components/auth/AuthFrame";
import { FormError } from "@/components/auth/FormError";
import { textLinkClasses } from "@/components/ui/TextLink";

export type JoinClassState =
  | { status: "idle" }
  | { status: "instructor" }
  | { status: "invalid" }
  | { status: "error"; error: string };

export interface JoinClassButtonProps {
  action: (state: JoinClassState, formData: FormData) => Promise<JoinClassState>;
  classTitle: string;
  /** The signed-in account's address, so nobody joins as the wrong person by accident. */
  email: string;
}

export const ALREADY_INSTRUCTOR = "This is a teacher account, so it is not added to the class.";

const INITIAL: JoinClassState = { status: "idle" };

/** The invite for someone already signed in: one tap (#205). */
export function JoinClassButton({ action, classTitle, email }: JoinClassButtonProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  if (state.status === "invalid") return <InviteUnavailable />;

  return (
    <section aria-labelledby="join-class-heading">
      <h1 id="join-class-heading" className={AUTH_HEADING}>
        Join {classTitle}
      </h1>
      <p className={AUTH_SUBLINE}>You are signed in as {email}.</p>
      {state.status === "instructor" ? (
        <div role="status" className="mb-6 flex flex-col gap-3">
          <p className="text-ink-1">{ALREADY_INSTRUCTOR}</p>
          <Link href="/author" className={textLinkClasses()}>
            Go to your quizzes
          </Link>
        </div>
      ) : (
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
            {pending ? "Joining…" : `Join ${classTitle}`}
          </Button>
        </form>
      )}
    </section>
  );
}
