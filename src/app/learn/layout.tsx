import Link from "next/link";
import { SignedInAs } from "@/components/auth/SignedInAs";
import { Button } from "@/components/ui/Button";
import { ACCOUNT_PATH } from "@/lib/auth/accountPaths";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { readViewer } from "@/lib/classes/viewer";
import { signOut } from "../author/actions";

/** The student side's frame (#205): the same header as authoring, pointing at the student home. */
export default async function StudentLayout({ children }: LayoutProps<"/learn">) {
  const viewer = await readViewer();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <Link
          href={STUDENT_HOME}
          className="tap-target flex items-center font-mono text-sm tracking-wide text-ink-2 uppercase hover:text-ink-1"
        >
          LeaRN
        </Link>
        {viewer.status === "signed_in" ? (
          <div className="flex min-w-0 items-center gap-3">
            <SignedInAs displayName={viewer.displayName} email={viewer.email} />
            <Link
              href={ACCOUNT_PATH}
              className="tap-target inline-flex items-center rounded-sm px-2 text-sm text-accent-ink transition-colors duration-fast hover:bg-accent-soft"
            >
              Account
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
