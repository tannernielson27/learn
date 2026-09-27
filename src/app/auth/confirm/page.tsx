import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContinueButton } from "@/components/auth/ContinueButton";
import { readConfirmLink } from "@/lib/auth/confirm";
import { confirmSignIn } from "./actions";

// The page holds a live, unspent token until the button is pressed: render it per request, never
// from a cache, so Next answers it with `Cache-Control: no-store` (checked on the response in
// e2e/auth.spec.ts).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finish signing in",
  // The address carries the link's token hash: never send it on as a Referer, never index it.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/**
 * Where the sign-in email's link lands (#305). Loading it uses nothing: mail scanners open links
 * to inspect them, and a link that signed in on that visit would be spent before the person got
 * to it. The button posts the link to `confirmSignIn`, which is the only thing that uses it. A
 * link that cannot be read goes straight back to sign-in, the same as a spent one.
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const link = readConfirmLink(await searchParams);
  if (!link.ok) redirect(link.failed);

  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-16 pb-12 sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">
        <p className="mb-2 font-mono text-sm tracking-wide text-ink-2 uppercase">LeaRN</p>
        <h1 className="mb-3 font-read text-3xl text-ink-1">Finish signing in</h1>
        <p className="mb-6 text-ink-2">
          Pressing the button signs you in on this device, even if you asked for the link on another
          one. The link works once.
        </p>
        <form action={confirmSignIn}>
          <input type="hidden" name="token_hash" value={link.tokenHash} />
          <input type="hidden" name="type" value="email" />
          <input type="hidden" name="next" value={link.next} />
          <ContinueButton />
        </form>
      </div>
    </main>
  );
}
