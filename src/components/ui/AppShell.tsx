import type { ReactNode } from "react";
import { Wordmark } from "@/components/site/Wordmark";

export type ContentWidth = "reading" | "wide" | "full";

export interface AppShellProps {
  /** Where the wordmark goes: the library for a teacher, the student home for a student. */
  homeHref: string;
  /**
   * The wordmark as the layout's own link, when it needs one (a `GuardedLink` asks the page before
   * leaving unsaved work), wrapped around `<WordmarkMark />`. A plain `Wordmark` to `homeHref`
   * otherwise.
   */
  brand?: ReactNode;
  /**
   * The primary navigation: one `<nav>` with an `aria-label`. On a phone it is one row under the
   * bar that scrolls sideways (`APP_NAV_LIST_CLASSES`); from 1024px it sits beside the wordmark.
   */
  nav?: ReactNode;
  /** The right-hand end of the bar: the `AccountMenu`, which holds who is signed in. */
  account?: ReactNode;
  /**
   * How wide the page may grow. `reading` is the 48rem column, `wide` is 75rem for tables, lists
   * and two-pane pages, `full` has no cap. Whatever the cap, the column is centred and has the
   * shell's gutters (16px, 24px from 640px, 32px from 1024px), so it never jumps between pages.
   */
  width?: ContentWidth;
  /**
   * A full-width system message between the bar and the content, such as the author pages'
   * billing banner (#522). Nothing when null.
   */
  notice?: ReactNode;
  /**
   * False draws the same frame without its landmarks (a `div` for the banner and for main), for a
   * specimen inside another page, such as `/gallery/app-shell`. Every real page leaves it true.
   */
  landmarks?: boolean;
  children: ReactNode;
}

/**
 * The plain wordmark's look, for the root status screens (`StatusFrame`) that no AppShell frames.
 * The shell itself draws the site's `Wordmark` (docs/04 §11).
 */
export const WORDMARK_CLASSES =
  "tap-target inline-flex items-center font-read text-xl font-semibold tracking-tight text-ink-1";

/**
 * The classes a primary navigation's list wears in the bar (#563): one row that never wraps. On a
 * phone it scrolls sideways under the wordmark, with the shell's gutter at its start, its right
 * edge fading so a cut-off item reads as "more this way", and the scrollbar hidden (a swipe, a
 * trackpad and Tab all move it; scroll padding keeps a focused link clear of the fade). From
 * 1024px it is an ordinary row beside the wordmark. Its links draw their focus ring inside
 * themselves (`APP_NAV_LINK_CLASSES`), since the row clips anything outside its 44px.
 */
export const APP_NAV_LIST_CLASSES =
  "flex h-11 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain " +
  "no-scrollbar scroll-pr-8 scroll-pl-(--shell-gutter) px-(--shell-gutter) pr-8 " +
  "mask-r-from-[calc(100%-2rem)] " +
  "@min-[63rem]/shell:h-16 @min-[63rem]/shell:overflow-visible @min-[63rem]/shell:px-0 @min-[63rem]/shell:mask-none";

/**
 * A primary navigation link: muted until hovered, and the page the person is on in full ink on the
 * secondary surface (`aria-current` carries it, not colour). 44px, never wrapping its words.
 */
export const APP_NAV_LINK_CLASSES =
  "tap-target inline-flex shrink-0 items-center rounded-md px-3.5 text-base font-semibold " +
  "whitespace-nowrap text-ink-2 transition-colors duration-fast " +
  "hover:bg-surface-2 hover:text-ink-1 focus-visible:-outline-offset-2 " +
  "aria-[current]:bg-surface-2 aria-[current]:text-ink-1";

/** The column's cap: the token's width of content, plus the gutters either side of it. */
const WIDTHS: Record<ContentWidth, string> = {
  reading: "max-w-[calc(var(--content-reading)+2*var(--shell-gutter))]",
  wide: "max-w-[calc(var(--content-wide)+2*var(--shell-gutter))]",
  full: "",
};

/**
 * The frame of every signed-in page (PLAN §4, docs/04 §11): a 64px bar with the LeaRN wordmark and
 * the account menu, the primary navigation, and a centred content column of the width the page
 * asks for. On a phone the navigation is a 44px row under the bar, so the whole header is 108px
 * and the page's main action stays in the first screen; from 1024px it sits beside the wordmark.
 *
 * The bar sits in a size container (`@container/shell`), so it follows its own width: on a page
 * that is the window, and in the gallery it is the specimen's frame. The page around it is not a
 * container, so fixed Submit bars and sheets keep the viewport. Its "1024px" step is 63rem of
 * shell, so a 1024px window that gives up to 16px to a scrollbar still gets the desktop bar.
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
  notice,
  landmarks = true,
  children,
}: AppShellProps) {
  const Header = landmarks ? "header" : "div";
  const Main = landmarks ? "main" : "div";
  return (
    // The gutter follows the window for the page (PageWidth reads the same variable against 100vw).
    // Only the bar is a size container: container-type makes its element the containing block
    // for position: fixed, and the pages hold fixed Submit bars and sheets that must keep the
    // viewport (#576 review). The bar re-states the gutter by its own width, so the gallery's
    // narrow specimen frame draws the phone bar.
    <div className="flex flex-1 flex-col [--shell-gutter:1rem] min-[40rem]:[--shell-gutter:1.5rem] min-[63rem]:[--shell-gutter:2rem]">
      <div className="@container/shell">
        <Header
          data-app-bar=""
          className="flex flex-wrap items-center border-b border-line bg-surface-1 px-(--shell-gutter) [--shell-gutter:1rem] @min-[40rem]/shell:[--shell-gutter:1.5rem] @min-[63rem]/shell:flex-nowrap @min-[63rem]/shell:gap-x-6 @min-[63rem]/shell:[--shell-gutter:2rem]"
        >
          <div className="flex h-16 shrink-0 items-center">
            {brand ?? <Wordmark href={homeHref} />}
          </div>
          {nav ? (
            // Its own row on a phone, edge to edge so the row scrolls under the gutters.
            <div className="order-last -mx-(--shell-gutter) min-w-0 basis-full @min-[63rem]/shell:order-none @min-[63rem]/shell:mx-0 @min-[63rem]/shell:basis-auto">
              {nav}
            </div>
          ) : null}
          {account ? (
            <div className="ml-auto flex h-16 shrink-0 items-center gap-3">{account}</div>
          ) : null}
        </Header>
      </div>
      {notice}
      <Main className={`mx-auto w-full flex-1 px-(--shell-gutter) py-8 ${WIDTHS[width]}`.trim()}>
        {children}
      </Main>
    </div>
  );
}
