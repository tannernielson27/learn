import { SignedInAs } from "@/components/auth/SignedInAs";
import { GuardedLink, LeaveGuardProvider } from "@/components/authoring/LeaveGuard";
import { TeacherNav } from "@/components/authoring/TeacherNav";
import { AccountMenu, MENU_ITEM_CLASSES } from "@/components/ui/AccountMenu";
import { AppShell, WORDMARK_CLASSES } from "@/components/ui/AppShell";
import { ACCOUNT_PATH } from "@/lib/auth/accountPaths";
import { shownName } from "@/lib/auth/displayName";
import { readViewer } from "@/lib/classes/viewer";
import { accountInitials } from "@/lib/ui/initials";
import { signOut } from "./actions";

export default async function AuthorLayout({ children }: LayoutProps<"/author">) {
  const viewer = await readViewer();
  const signedIn = viewer.status === "signed_in";
  // The navigation is a teacher's. /author/no-access is drawn for an account that is not one yet.
  const teaches = signedIn && (viewer.role === "instructor" || viewer.role === "admin");
  const name = signedIn ? shownName(viewer) : "";

  return (
    // The header's links ask the page first, so leaving unsaved work (in the case study builder)
    // asks just as its own way back does.
    <LeaveGuardProvider>
      <AppShell
        homeHref="/author"
        brand={
          <GuardedLink href="/author" className={WORDMARK_CLASSES}>
            LeaRN
          </GuardedLink>
        }
        nav={teaches ? <TeacherNav /> : null}
        account={
          signedIn ? (
            <>
              <SignedInAs displayName={viewer.displayName} email={viewer.email} />
              <AccountMenu
                name={name}
                initials={accountInitials(name)}
                signOut={signOut}
                links={
                  <>
                    {/* #358: the name, and the way to the password, are both on /account. */}
                    <GuardedLink href={ACCOUNT_PATH} className={MENU_ITEM_CLASSES}>
                      Account
                    </GuardedLink>
                    {/* #269: the guides are public pages outside /author. */}
                    <GuardedLink href="/help" className={MENU_ITEM_CLASSES}>
                      Help
                    </GuardedLink>
                  </>
                }
              />
            </>
          ) : null
        }
      >
        {children}
      </AppShell>
    </LeaveGuardProvider>
  );
}
