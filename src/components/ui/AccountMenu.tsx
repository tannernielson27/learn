"use client";

import { useId, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import {
  THEME_CHOICES,
  applyTheme,
  readTheme,
  serverTheme,
  subscribeTheme,
} from "@/components/theme/themeStore";
import { SegmentedControl } from "./SegmentedControl";

/** A row in the account menu: a link the full width of the menu, 44px tall. */
export const MENU_ITEM_CLASSES =
  "tap-target flex w-full items-center rounded-md px-3 text-left text-base text-ink-1 " +
  "transition-colors duration-fast hover:bg-surface-2";

export interface AccountMenuProps {
  /** Who is signed in, as the menu's heading when there is no `identity`. */
  name: string;
  /**
   * Who is signed in, at the top of the open panel: the layout's `SignedInAs`, with the name and
   * the email address (owner decision 2026-11-14, docs/04 §11: the email lives here, not in the
   * bar). The name alone when not given.
   */
  identity?: ReactNode;
  /** Up to two letters on the button (`accountInitials`). */
  initials: string;
  /**
   * The menu's links, rendered by the layout so it can use its own link (a `GuardedLink` asks the
   * page before leaving unsaved work): Account and Help, each with `MENU_ITEM_CLASSES`.
   */
  links: ReactNode;
  /** The Server Function that signs out. */
  signOut: (formData: FormData) => void | Promise<void>;
}

/** Hides the open panel when the click landed on one of its links. */
function closeOnLink(event: MouseEvent<HTMLElement>) {
  if (!(event.target instanceof Element) || event.target.closest("a") === null) return;
  const panel = event.currentTarget.closest("[popover]") as
    (HTMLElement & { hidePopover?: () => void }) | null;
  if (panel?.matches(":popover-open")) panel.hidePopover?.();
}

/**
 * The account menu (owner decision 9): Account, Help, the colour theme, and Sign out.
 *
 * A disclosure on the native `popover` attribute (PLAN §8): the browser puts it in the top layer,
 * closes it on Escape or a click outside, and returns focus to the button. It is a panel of
 * ordinary links and controls, not an ARIA `menu`, so Tab and the arrow keys work as they do
 * everywhere else. The theme is the same store the root layout applies before paint.
 */
type PanelProps = Pick<AccountMenuProps, "name" | "identity" | "links" | "signOut">;

/** The panel's look: a card under the bar, as wide as a phone allows. */
const PANEL_CLASSES =
  "w-72 max-w-[calc(100%-2rem)] rounded-md border border-line bg-surface-1 p-2 text-ink-1 shadow-elevation-1";

/** What the panel holds, open or drawn on its own: who, the theme, the links, Sign out. */
function PanelContents({ name, identity, links, signOut }: PanelProps) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  return (
    <>
      {identity ?? <p className="truncate px-3 py-2.5 font-semibold">{name}</p>}
      <hr className="my-1 border-line" />
      <div className="px-1 pt-2 pb-2">
        <SegmentedControl
          label="Theme"
          size="sm"
          options={THEME_CHOICES}
          value={theme}
          onChange={applyTheme}
          className="w-full [&>button]:flex-1"
        />
        <p className="px-2 pt-2 text-xs text-ink-2">The projector view is always light.</p>
      </div>
      <hr className="my-1 border-line" />
      {/* The layout outlives a client navigation, so a followed link closes the panel itself;
          otherwise it would stay open, with focus inside it, over the next page. */}
      <nav aria-label="Help and account" className="flex flex-col" onClick={closeOnLink}>
        {links}
      </nav>
      <form action={signOut}>
        <button type="submit" className={MENU_ITEM_CLASSES}>
          Sign out
        </button>
      </form>
    </>
  );
}

/**
 * The account menu (owner decision 9): who is signed in, Account, Help, the colour theme, and
 * Sign out. The bar shows only the initials; the name and the email address are inside.
 *
 * A disclosure on the native `popover` attribute (PLAN §8): the browser puts it in the top layer,
 * closes it on Escape or a click outside, and returns focus to the button. It is a panel of
 * ordinary links and controls, not an ARIA `menu`, so Tab and the arrow keys work as they do
 * everywhere else. The theme is the same store the root layout applies before paint.
 */
export function AccountMenu({ name, identity, initials, links, signOut }: AccountMenuProps) {
  const panelId = useId();

  return (
    <>
      <button
        type="button"
        popoverTarget={panelId}
        aria-label="Account menu"
        className="tap-target inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-fast hover:bg-accent-soft"
      >
        <span
          aria-hidden="true"
          className="grid size-9 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent-ink"
        >
          {initials}
        </span>
      </button>
      <div
        id={panelId}
        popover="auto"
        className={`motion-toast inset-auto top-16 right-4 m-0 ${PANEL_CLASSES}`}
      >
        <PanelContents name={name} identity={identity} links={links} signOut={signOut} />
      </div>
    </>
  );
}

/**
 * The panel drawn open in place, for the gallery's specimen of the open menu (`/gallery/app-shell`):
 * the same contents, without the popover, so it sits where the page puts it.
 */
export function AccountMenuPanel(props: PanelProps) {
  return (
    <div data-account-panel="" className={PANEL_CLASSES}>
      <PanelContents {...props} />
    </div>
  );
}
