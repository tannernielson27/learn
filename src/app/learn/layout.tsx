import Link from "next/link";
import { SignedInAs } from "@/components/auth/SignedInAs";
import { AccountMenu, MENU_ITEM_CLASSES } from "@/components/ui/AccountMenu";
import { AppShell } from "@/components/ui/AppShell";
import { ACCOUNT_PATH } from "@/lib/auth/accountPaths";
import { shownName } from "@/lib/auth/displayName";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { readViewer } from "@/lib/classes/viewer";
import { accountInitials } from "@/lib/ui/initials";
import { signOut } from "../author/actions";

/** The student side's frame (#205): the same shell as authoring, pointing at the student home. */
export default async function StudentLayout({ children }: LayoutProps<"/learn">) {
  const viewer = await readViewer();
  const signedIn = viewer.status === "signed_in";
  const name = signedIn ? shownName(viewer) : "";

  return (
    <AppShell
      homeHref={STUDENT_HOME}
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
                  <Link href={ACCOUNT_PATH} className={MENU_ITEM_CLASSES}>
                    Account
                  </Link>
                  <Link href="/help" className={MENU_ITEM_CLASSES}>
                    Help
                  </Link>
                </>
              }
            />
          </>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
