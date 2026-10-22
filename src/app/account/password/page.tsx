import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChoosePasswordForm } from "@/components/auth/ChoosePasswordForm";
import { PASSWORD_PATH } from "@/lib/auth/accountPaths";
import { landingEntry } from "@/lib/auth/landing";
import { safeNextPath } from "@/lib/auth/nextPath";
import { readViewer } from "@/lib/classes/viewer";
import { choosePassword } from "./actions";
import { AuthFrame, AUTH_HEADING, AUTH_SUBLINE } from "@/components/auth/AuthFrame";

export const metadata: Metadata = { title: "Choose a password" };

/**
 * Where a signed-in person chooses or changes their password. "Forgot your password?" on the
 * sign-in page ends here, by way of an emailed link; the header's Password link comes here too.
 */
export default async function ChoosePasswordPage({ searchParams }: PageProps<"/account/password">) {
  const params = await searchParams;
  const viewer = await readViewer();
  if (viewer.status === "signed_out") {
    redirect(`/sign-in?next=${encodeURIComponent(PASSWORD_PATH)}`);
  }
  // With nowhere named, each person goes to their own home, not to authoring by default.
  const next =
    typeof params.next === "string" ? safeNextPath(params.next) : landingEntry(viewer).href;
  // Set by `afterConfirming`: an emailed link has just confirmed an account made with a password,
  // in a browser that was not signed in to it, and `endEarlierAccess` has retired that password.
  // Only the wording and the "Not now" link hang on it; anyone can add it and nothing else changes.
  const justConfirmed = params.confirmed === "1";

  return (
    <AuthFrame>
      {justConfirmed ? (
        <>
          <h1 className={AUTH_HEADING}>Your email is confirmed</h1>
          <p className={AUTH_SUBLINE}>
            An account for {viewer.email} was made with a password before anyone had shown the
            address was theirs. To keep it yours, that password no longer works and every other
            device has been signed out. Choose a new password to finish.
          </p>
        </>
      ) : (
        <>
          <h1 className={AUTH_HEADING}>Choose a password</h1>
          <p className={AUTH_SUBLINE}>
            For {viewer.email}. With a password you can sign in without waiting for an email.
          </p>
        </>
      )}
      <ChoosePasswordForm
        action={choosePassword}
        email={viewer.email}
        next={next}
        skippable={!justConfirmed}
      />
    </AuthFrame>
  );
}
