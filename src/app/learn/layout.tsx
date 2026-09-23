import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "../author/actions";

/** The student side's frame (#205): the same header as authoring, pointing at the student home. */
export default async function StudentLayout({ children }: LayoutProps<"/learn">) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <Link
          href={STUDENT_HOME}
          className="tap-target flex items-center font-mono text-sm tracking-wide text-ink-2 uppercase hover:text-ink-1"
        >
          LeaRN
        </Link>
        {email ? (
          <div className="flex min-w-0 items-center gap-3">
            <p className="truncate text-sm text-ink-2" data-testid="signed-in-email">
              {email}
            </p>
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
