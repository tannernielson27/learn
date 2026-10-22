import Link from "next/link";
import type { ReactNode } from "react";

export type ContentWidth = "reading" | "wide" | "full";

export interface AppShellProps {
  /** Where the wordmark goes: the library for a teacher, the student home for a student. */
  homeHref: string;
  /**
   * The wordmark as the layout's own link, when it needs one (a `GuardedLink` asks the page before
   * leaving unsaved work). Drawn with `WORDMARK_CLASSES`. A plain link to `homeHref` otherwise.
   */
  brand?: ReactNode;
  /** The primary navigation, beside the wordmark from 1024px and on its own row below that. */
  nav?: ReactNode;
  /** The right-hand end of the bar: who is signed in, and the `AccountMenu`. */
  account?: ReactNode;
  /**
   * How wide the page may grow. `reading` is the 48rem column every page had before the overhaul,
   * `wide` is 75rem for tables, lists and two-pane pages, `full` has no cap. Later phases widen
   * screens one at a time (PLAN §6).
   */
  width?: ContentWidth;
  children: ReactNode;
}

/** The wordmark's look, for a layout that draws it with its own link. */
export const WORDMARK_CLASSES =
  "tap-target inline-flex items-center font-read text-xl font-semibold tracking-tight text-ink-1";

const WIDTHS: Record<ContentWidth, string> = {
  reading: "max-w-reading",
  wide: "max-w-wide",
  full: "",
};

/**
 * The frame of every signed-in page (PLAN §4): a top bar with the LeaRN wordmark, the primary
 * navigation and the account menu, over a content column of the width the page asks for.
 *
 * Not a client component: the layouts that use it read the session on the server, and only the
 * pieces that need the browser (the navigation's current link, the menu) are client components.
 */
export function AppShell({
  homeHref,
  brand,
  nav,
  account,
  width = "reading",
  children,
}: AppShellProps) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-6 border-b border-line bg-surface-1 px-4 md:px-8">
        <div className="flex h-16 items-center">
          {brand ?? (
            <Link href={homeHref} className={WORDMARK_CLASSES}>
              LeaRN
            </Link>
          )}
        </div>
        {nav ? (
          <div className="order-last -mx-2 basis-full pb-2 lg:order-none lg:mx-0 lg:basis-auto lg:pb-0">
            {nav}
          </div>
        ) : null}
        {account ? (
          <div className="ml-auto flex h-16 min-w-0 items-center gap-3">{account}</div>
        ) : null}
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-8 ${WIDTHS[width]}`.trim()}>{children}</main>
    </div>
  );
}
