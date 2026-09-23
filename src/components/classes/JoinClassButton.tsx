"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { InviteUnavailable } from "./InviteUnavailable";

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

export const ALREADY_INSTRUCTOR =
  "You are already an instructor, so this account stays one and is not added to the class.";

const INITIAL: JoinClassState = { status: "idle" };

/** The invite for someone already signed in: one tap (#205). */
export function JoinClassButton({ action, classTitle, email }: JoinClassButtonProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  if (state.status === "invalid") return <InviteUnavailable />;

  return (
    <section aria-labelledby="join-class-heading">
      <h1 id="join-class-heading" className="mb-3 font-read text-3xl text-ink-1">
        Join {classTitle}
      </h1>
      <p className="mb-6 text-ink-2">You are signed in as {email}.</p>
      {state.status === "instructor" ? (
        <div role="status" className="mb-6 flex flex-col gap-3">
          <p className="text-ink-1">{ALREADY_INSTRUCTOR}</p>
          <Link
            href="/author"
            className="tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline"
          >
            Go to your item banks
          </Link>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          {state.status === "error" ? (
            <p role="alert" className="text-sm text-incorrect">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
            {pending ? "Joining…" : `Join ${classTitle}`}
          </Button>
        </form>
      )}
    </section>
  );
}
