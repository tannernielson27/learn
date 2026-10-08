"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

/**
 * The submit button on `/auth/confirm` (#305). Disabled while the post is in flight: a sign-in
 * link works once, so a second press would spend nothing but land on "link already used".
 */
export function ContinueButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      className="w-full"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? "Signing in…" : "Continue to LeaRN"}
    </Button>
  );
}
