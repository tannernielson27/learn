import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * The business pages (#522): pricing, the terms and the privacy policy. A route group, so the
 * URLs stay /pricing, /terms and /privacy. The root layout draws no header, so this one draws the
 * site's bar: the wordmark home and, on the right, Pricing, Help and Sign in. The site footer
 * closes every page. No session is read here: pricing reads it itself, for its one action.
 *
 * #563: the bar sits on the navy band, as it does on the landing page, so every public page has
 * the same front door. The pages themselves stay on paper.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div data-surface="brand" className="bg-brand-surface text-brand-ink">
        <SiteHeader extra={[{ href: "/sign-in", label: "Sign in" }]} />
      </div>
      <main className="mx-auto w-full max-w-wide flex-1 px-5 py-10 sm:px-6 sm:py-16 lg:px-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
