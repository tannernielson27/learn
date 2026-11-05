import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { AppShell } from "@/components/ui/AppShell";
import { PRICING_PATH } from "@/lib/site/links";

const linkClass =
  "tap-target inline-flex items-center rounded-md px-3 text-sm font-semibold text-ink-2 transition-colors duration-fast hover:bg-surface-2 hover:text-ink-1";

/**
 * The business pages (#522): pricing, the terms and the privacy policy. A route group, so the
 * URLs stay /pricing, /terms and /privacy. The root layout draws no header, so this one draws the
 * shell's bar with the wordmark home and, on the right, Pricing and Sign in; the site footer
 * closes every page. No session is read here: pricing reads it itself, for its one action.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppShell
        homeHref="/"
        account={
          <nav aria-label="Site">
            <ul className="flex items-center gap-1">
              <li>
                <Link href={PRICING_PATH} className={linkClass}>
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/sign-in" className={linkClass}>
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
        }
      >
        {children}
      </AppShell>
      <SiteFooter />
    </>
  );
}
