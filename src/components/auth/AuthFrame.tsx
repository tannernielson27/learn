import Link from "next/link";
import type { ReactNode } from "react";
import { WORDMARK_CLASSES } from "@/components/ui/AppShell";

/**
 * The page around a sign-in, sign-up, account or invite form (Main mockup): the LeaRN wordmark,
 * a 48px gap, then the form's own serif heading, short subline and 52px fields in one column.
 * Top-aligned on a phone so the keyboard never covers the first field; centred from 640px.
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 justify-center px-5 pt-14 pb-12 sm:items-center sm:py-12">
      <div className="w-full max-w-md">
        <p className="mb-12">
          <Link href="/" className={WORDMARK_CLASSES}>
            LeaRN
          </Link>
        </p>
        {children}
      </div>
    </main>
  );
}

/** A form page's h1 with a subline under it. */
export const AUTH_HEADING = "mb-2 font-read text-display leading-tight break-words text-ink-1";
/** A form page's h1 with nothing between it and the form. */
export const AUTH_HEADING_ALONE =
  "mb-8 font-read text-display leading-tight break-words text-ink-1";
/** The short line under the heading. */
export const AUTH_SUBLINE = "mb-8 break-words text-ink-2";
