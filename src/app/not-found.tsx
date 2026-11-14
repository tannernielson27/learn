import type { Metadata } from "next";
import { StatusFrame } from "@/components/status/StatusFrame";
import { StatusLinks } from "@/components/status/StatusLinks";
import { ErrorState } from "@/components/ui/ErrorState";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Every unmatched URL, and every `notFound()` with no closer boundary (#267). It renders inside
 * the root layout, so the theme and the fonts are the app's own.
 *
 * Static copy (`ErrorState`'s not-found kind) and two links, and nothing else: no data is read here, so there is nothing a 404
 * could carry. `e2e/errorPages.spec.ts` checks that on the response bytes, against a gallery
 * page as the control that proves the same grep can find a key.
 */
export default function NotFound() {
  return (
    <StatusFrame>
      <ErrorState kind="not-found" headline="This page does not exist.">
        <StatusLinks />
      </ErrorState>
    </StatusFrame>
  );
}
