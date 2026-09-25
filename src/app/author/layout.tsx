import { GuardedLink, LeaveGuardProvider } from "@/components/authoring/LeaveGuard";
import { Button } from "@/components/ui/Button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function AuthorLayout({ children }: LayoutProps<"/author">) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";

  return (
    // The header's links ask the page first, so leaving unsaved work (in the case study builder)
    // asks just as its Back to bank does.
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
            {email ? (
              <p className="truncate text-sm text-ink-2" data-testid="signed-in-email">
                {email}
              </p>
            ) : null}
            {/* #269: the guides are public pages outside /author. */}
            <nav aria-label="Author">
              <GuardedLink
                href="/help"
                className="tap-target inline-flex items-center rounded-sm px-2 text-sm text-accent-ink transition-colors duration-fast hover:bg-accent-soft"
              >
                Help
              </GuardedLink>
            </nav>
            {email ? (
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
            ) : null}
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
      </div>
    </LeaveGuardProvider>
  );
}
