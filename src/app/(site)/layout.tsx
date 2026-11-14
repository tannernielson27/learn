import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * The business pages (#522): pricing, the terms and the privacy policy. A route group, so the
 * URLs stay /pricing, /terms and /privacy. The root layout draws no header, so this one draws the
 * public site's own (#563): the wordmark home and, on the right, Pricing and Sign in, over the
 * reading column; the site footer closes every page. No session is read here: pricing reads it
 * itself, for its one action.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-reading flex-1 px-5 py-10 sm:px-6 sm:py-14">
          {children}
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
