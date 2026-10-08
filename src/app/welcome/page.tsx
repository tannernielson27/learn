import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SetUpWorkspace } from "@/components/auth/SetUpWorkspace";
import { JoinByCodeForm } from "@/components/classes/JoinByCodeForm";
import { Button } from "@/components/ui/Button";
import { ACCOUNT_PATH, WELCOME_PATH } from "@/lib/auth/accountPaths";
import { shownName } from "@/lib/auth/displayName";
import { signedInHome } from "@/lib/auth/landing";
import { carriedClassCode } from "@/lib/auth/signUp";
import { readViewer } from "@/lib/classes/viewer";
import { signOut } from "../author/actions";
import { joinClassWithCode } from "../learn/actions";
import { setUpWorkspace } from "./actions";

export const metadata: Metadata = { title: "Welcome" };

/**
 * Where an account with no role lands (#361, #362, ADR 0009), in place of "No access yet": someone
 * who signed up as a student and has not joined a class, anyone an instructor has yet to invite,
 * or a teacher whose workspace could not be made (`?teach=1`). Anyone with a role is sent to their
 * own home.
 *
 * Two ways forward, and nothing else: a class code, which makes the account a student, or a
 * workspace of their own, which makes it a teacher. The one the person came for is first.
 * `?code=` is a class code carried through sign-up; it only fills the field.
 */
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const viewer = await readViewer();
  if (viewer.status === "signed_out") {
    redirect(`/sign-in?next=${encodeURIComponent(WELCOME_PATH)}`);
  }
  if (viewer.role !== null) redirect(signedInHome(viewer.role));

  const params = await searchParams;
  const teaching = params.teach === "1";
  const classCode = carriedClassCode(params.code);

  const join = (
    <section key="join" aria-labelledby="welcome-join">
      <h2 id="welcome-join" className="mb-2 text-lg font-semibold text-ink-1">
        Join your class
      </h2>
      <p className="mb-4 text-ink-2">
        Type the class code your instructor gave you. Their invite link works too: you are already
        signed in, so one tap puts you in the class.
      </p>
      <JoinByCodeForm action={joinClassWithCode} initialCode={classCode ?? undefined} />
    </section>
  );

  const teach = (
    <section key="teach" aria-labelledby="welcome-workspace">
      <h2 id="welcome-workspace" className="mb-2 text-lg font-semibold text-ink-1">
        {teaching ? "Your workspace is not set up yet" : "I teach"}
      </h2>
      <p className="mb-4 text-ink-2">
        {teaching
          ? "Your account is ready, but the place where you write questions and keep your classes could not be made. Try again here."
          : "Set up a workspace of your own, where you write questions and run them with your classes."}
      </p>
      <SetUpWorkspace action={setUpWorkspace} />
    </section>
  );

  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-16 pb-12 sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">
        <p className="mb-2 font-mono text-sm tracking-wide text-ink-2 uppercase">LeaRN</p>
        <h1 className="mb-3 font-read text-3xl text-ink-1">Welcome to LeaRN</h1>
        <p className="mb-6 text-sm break-words text-ink-2">Signed in as {shownName(viewer)}.</p>

        <div className="mb-8 flex flex-col gap-8 divide-y divide-line [&>section+section]:pt-8">
          {teaching ? [teach, join] : [join, teach]}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
          <Link
            href={ACCOUNT_PATH}
            className="tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline"
          >
            Your account
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
