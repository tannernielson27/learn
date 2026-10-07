import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountNameForm } from "@/components/auth/AccountNameForm";
import { ACCOUNT_PATH, choosePasswordPath } from "@/lib/auth/accountPaths";
import { landingEntry } from "@/lib/auth/landing";
import { readViewer } from "@/lib/classes/viewer";
import { saveDisplayName } from "./actions";

export const metadata: Metadata = { title: "Your account" };

const LINK =
  "tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline";

/**
 * A signed-in person's own settings (#358): the name the header and the class roster show, and
 * the way to their password. The header's Account link comes here, whatever the person's role.
 */
export default async function AccountPage() {
  const viewer = await readViewer();
  if (viewer.status === "signed_out") {
    redirect(`/sign-in?next=${encodeURIComponent(ACCOUNT_PATH)}`);
  }
  const home = landingEntry(viewer);

  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-16 pb-12 sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">
        <p className="mb-2 font-mono text-sm tracking-wide text-ink-2 uppercase">LeaRN</p>
        <h1 className="mb-3 font-read text-3xl text-ink-1">Your account</h1>
        <p className="mb-6 break-words text-ink-2">Signed in as {viewer.email}.</p>
        <AccountNameForm action={saveDisplayName} name={viewer.displayName} />
        <section aria-labelledby="account-password" className="mt-8 border-t border-line pt-6">
          <h2 id="account-password" className="mb-2 text-xl font-medium text-ink-1">
            Password
          </h2>
          <p className="mb-3 text-ink-2">
            Choose a password, or change the one you have. Other devices are signed out.
          </p>
          <Link href={choosePasswordPath(ACCOUNT_PATH)} className={LINK}>
            Change your password
          </Link>
        </section>
        <p className="mt-8">
          <Link href={home.href} className={LINK}>
            {home.label}
          </Link>
        </p>
      </div>
    </main>
  );
}
