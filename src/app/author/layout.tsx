import { SignedInAs } from "@/components/auth/SignedInAs";
import { GuardedLink, LeaveGuardProvider } from "@/components/authoring/LeaveGuard";
import { TeacherNav } from "@/components/authoring/TeacherNav";
import { Button } from "@/components/ui/Button";
import { ACCOUNT_PATH } from "@/lib/auth/accountPaths";
import { readViewer } from "@/lib/classes/viewer";
import { signOut } from "./actions";

export default async function AuthorLayout({ children }: LayoutProps<"/author">) {
  const viewer = await readViewer();
  const signedIn = viewer.status === "signed_in";
  // The navigation is a teacher's. /author/no-access is drawn for an account that is not one yet.
  const teaches = signedIn && (viewer.role === "instructor" || viewer.role === "admin");

  return (
    // The header's links ask the page first, so leaving unsaved work (in the case study builder)
    // asks just as its own way back does.
    <LeaveGuardProvider>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <GuardedLink
            href="/author"
            className="tap-target flex items-center font-mono text-sm tracking-wide text-ink-2 uppercase hover:text-ink-1"
          >
            LeaRN
          </GuardedLink>
          <div className="flex min-w-0 items-center gap-3">
            {signedIn ? <SignedInAs displayName={viewer.displayName} email={viewer.email} /> : null}
            {/* #269: the guides are public pages outside /author. */}
            <nav aria-label="Help and account">
              <GuardedLink
                href="/help"
                className="tap-target inline-flex items-center rounded-sm px-2 text-sm text-accent-ink transition-colors duration-fast hover:bg-accent-soft"
              >
                Help
              </GuardedLink>
              {/* #358: the name, and the way to the password, are both on /account. */}
              {signedIn ? (
                <GuardedLink
                  href={ACCOUNT_PATH}
                  className="tap-target inline-flex items-center rounded-sm px-2 text-sm text-accent-ink transition-colors duration-fast hover:bg-accent-soft"
                >
                  Account
                </GuardedLink>
              ) : null}
            </nav>
            {signedIn ? (
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
            ) : null}
          </div>
        </header>
        {teaches ? <TeacherNav /> : null}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
      </div>
    </LeaveGuardProvider>
  );
}
