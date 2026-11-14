import Link from "next/link";
import { PRICING_PATH } from "@/lib/site/links";
import { Wordmark } from "./Wordmark";

const LINK =
  "tap-target inline-flex items-center rounded-md px-3 text-sm font-semibold text-ink-2 " +
  "transition-colors duration-fast hover:bg-surface-2 hover:text-ink-1";

export interface SiteHeaderProps {
  /**
   * Whether to offer Sign in. The business pages read no session and always do; the landing page
   * leaves it out for someone already signed in, whose own home is its first action.
   */
  signIn?: boolean;
}

/**
 * The bar across every public page (#522, restyled for #563): the LeaRN wordmark home on the
 * left, Pricing and Sign in on the right, over a hairline. Not the signed-in app's `AppShell`,
 * which keeps its own look.
 */
export function SiteHeader({ signIn = true }: SiteHeaderProps) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 w-full max-w-site items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Wordmark />
        <nav aria-label="Site">
          <ul className="flex items-center gap-1">
            <li>
              <Link href={PRICING_PATH} className={LINK}>
                Pricing
              </Link>
            </li>
            {signIn ? (
              <li>
                <Link href="/sign-in" className={LINK}>
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
