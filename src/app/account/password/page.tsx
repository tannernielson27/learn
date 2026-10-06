import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChoosePasswordForm } from "@/components/auth/ChoosePasswordForm";
import { PASSWORD_PATH } from "@/lib/auth/accountPaths";
import { landingEntry } from "@/lib/auth/landing";
import { safeNextPath } from "@/lib/auth/nextPath";
import { readViewer } from "@/lib/classes/viewer";
import { choosePassword } from "./actions";

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

  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-16 pb-12 sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">
        <p className="mb-2 font-mono text-sm tracking-wide text-ink-2 uppercase">LeaRN</p>
        <h1 className="mb-3 font-read text-3xl text-ink-1">Choose a password</h1>
        <p className="mb-6 text-ink-2">
          For {viewer.email}. With a password you can sign in without waiting for an email.
        </p>
        <ChoosePasswordForm action={choosePassword} email={viewer.email} next={next} />
      </div>
    </main>
  );
}
