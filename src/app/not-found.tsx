import type { Metadata } from "next";
import { StatusLinks } from "@/components/status/StatusLinks";
import { StatusPanel } from "@/components/status/StatusPanel";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Every unmatched URL, and every `notFound()` with no closer boundary (#267). It renders inside
 * the root layout, so the theme and the fonts are the app's own.
 *
 * Static copy and two links, and nothing else: no data is read here, so there is nothing a 404
 * could carry. `e2e/errorPages.spec.ts` checks that on the response bytes, against a gallery
 * page as the control that proves the same grep can find a key.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
      <StatusPanel headline="This page does not exist.">
        <p className="measure text-ink-2">
          The link may be mistyped, or the page may have moved. Check the address, or start again
          from one of these.
        </p>
        <StatusLinks />
      </StatusPanel>
    </main>
  );
}
