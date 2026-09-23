import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { noAccessRedirect } from "@/lib/auth/noAccess";
import { authorForRoute } from "@/lib/authoring/session";
import { signOut } from "../actions";

export const metadata: Metadata = { title: "No access yet" };

/**
 * Where a signed-in account with no author role lands (#204). Sign-up is invite-only: a new
 * account has no role until an instructor's invite or the owner gives it one, so this is the
 * ordinary first stop for such an account, not an error. Anyone else is sent to their own home,
 * a student included (#205).
 */
export default async function NoAccessPage() {
  const access = await authorForRoute();
  const target = noAccessRedirect(
    access.status,
    access.status === "forbidden" ? (access.role ?? null) : null,
  );
  if (target) redirect(target);

  return (
    <section aria-labelledby="no-access-heading" className="max-w-prose">
      <h1 id="no-access-heading" className="mb-3 font-read text-3xl text-ink-1">
        No access yet
      </h1>
      <p className="mb-3 text-ink-1">
        You are signed in, but this account has not been given anything to open yet.
      </p>
      <p className="mb-6 text-ink-2">
        The way in is the invite link your instructor shares with their class. If you teach here,
        ask the site owner to make your account an instructor.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </section>
  );
}
