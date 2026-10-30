import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountNameForm } from "@/components/auth/AccountNameForm";
import { ACCOUNT_PATH, choosePasswordPath } from "@/lib/auth/accountPaths";
import { landingEntry } from "@/lib/auth/landing";
import { readViewer } from "@/lib/classes/viewer";
import { WORKSPACE_PATH } from "@/lib/workspace/workspace";
import { saveDisplayName } from "./actions";
import { AuthFrame, AUTH_HEADING, AUTH_SUBLINE } from "@/components/auth/AuthFrame";
import { LegalLinks } from "@/components/site/SiteFooter";
import { textLinkClasses } from "@/components/ui/TextLink";

export const metadata: Metadata = { title: "Your account" };

const LINK = textLinkClasses();

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
    <AuthFrame>
      <h1 className={AUTH_HEADING}>Your account</h1>
      <p className={AUTH_SUBLINE}>Signed in as {viewer.email}.</p>
      <AccountNameForm action={saveDisplayName} name={viewer.displayName} />
      <section aria-labelledby="account-password" className="mt-8 border-t border-line pt-6">
        <h2 id="account-password" className="mb-2 text-xl font-semibold text-ink-1">
          Password
        </h2>
        <p className="mb-3 text-ink-2">Changing it signs out your other devices.</p>
        <Link href={choosePasswordPath(ACCOUNT_PATH)} className={LINK}>
          Change your password
        </Link>
      </section>
      {/* A teacher's workspace is under /author, which checks the role again. */}
      {viewer.role === "instructor" || viewer.role === "admin" ? (
        <section aria-labelledby="account-workspace" className="mt-8 border-t border-line pt-6">
          <h2 id="account-workspace" className="mb-2 text-xl font-semibold text-ink-1">
            Workspace
          </h2>
          <Link href={WORKSPACE_PATH} className={LINK}>
            Teachers and invitations
          </Link>
        </section>
      ) : null}
      <p className="mt-8">
        <Link href={home.href} className={LINK}>
          {home.label}
        </Link>
      </p>
      {/* #522: the account page has no site footer, so the terms and contact are one line here. */}
      <LegalLinks className="mt-8 border-t border-line pt-4 text-ink-2" />
    </AuthFrame>
  );
}
