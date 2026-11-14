import Link from "next/link";
import { PRICING_PATH } from "@/lib/site/links";
import { Wordmark } from "./Wordmark";

const linkClass =
  "tap-target inline-flex items-center rounded-md px-3 text-sm font-semibold text-ink-2 " +
  "transition-colors duration-fast hover:bg-surface-2 hover:text-ink-1";

export interface SiteHeaderProps {
  /** Sign in, beside Pricing. Off where the page already offers the visitor their own home. */
  signIn?: boolean;
}

/**
 * The bar across the top of every public page (#563): a record-ink rule, the wordmark home, one
 * line of what LeaRN is from 768px, and Pricing and Sign in. Signed-in pages keep the app's own
 * `AppShell`; this is the front door's.
 */
export function SiteHeader({ signIn = true }: SiteHeaderProps) {
  return (
    <header className="border-t-2 border-b border-t-brand border-b-line bg-surface-0">
      <div className="mx-auto flex h-16 w-full max-w-wide items-center gap-4 px-5 sm:px-6 lg:px-8">
        <Link href="/" className="tap-target inline-flex items-center">
          <Wordmark />
        </Link>
        <p className="hidden border-l border-line pl-4 font-mono text-xs tracking-[0.08em] text-ink-2 uppercase md:block">
          Live learning for the Next Generation NCLEX
        </p>
        <nav aria-label="Site" className="ml-auto">
          <ul className="-mr-3 flex items-center gap-1">
            <li>
              <Link href={PRICING_PATH} className={linkClass}>
                Pricing
              </Link>
            </li>
            {signIn ? (
              <li>
                <Link href="/sign-in" className={linkClass}>
                  Sign in
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
      </div>
    </header>
  );
}
