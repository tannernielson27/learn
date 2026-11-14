import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * The business pages (#522): pricing, the terms and the privacy policy. A route group, so the
 * URLs stay /pricing, /terms and /privacy. The root layout draws no header, so this one draws the
 * site's bar (#563: the public site's own, not the signed-in app's `AppShell`) with the wordmark
 * home and, on the right, Pricing and Sign in; the site footer closes every page. No session is
 * read here: pricing reads it itself, for its one action.
 *
 * The column is the reading width the terms and the privacy policy were written for; pricing
 * widens itself.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-site flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-14 lg:px-10">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
