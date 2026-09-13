import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Item banks" };

// Placeholder home for signed-in authors; the bank list arrives with #68.
export default async function AuthorHomePage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  // The proxy already redirects signed-out visits; this is the real check (docs: Data Security).
  if (!data?.claims?.sub) redirect("/sign-in?next=/author");
  const email = typeof data.claims.email === "string" ? data.claims.email : "";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <p className="font-mono text-sm tracking-wide text-ink-2 uppercase">LeaRN</p>
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
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-2 font-read text-3xl text-ink-1">Item banks</h1>
        <p className="text-ink-2">Your banks will appear here.</p>
      </main>
    </div>
  );
}
