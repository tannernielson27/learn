"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
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
  /** Who is signed in, as the menu's heading. */
  name: string;
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

/**
 * The account menu (owner decision 9): Account, Help, the colour theme, and Sign out.
 *
 * A disclosure on the native `popover` attribute (PLAN §8): the browser puts it in the top layer,
 * closes it on Escape or a click outside, and returns focus to the button. It is a panel of
 * ordinary links and controls, not an ARIA `menu`, so Tab and the arrow keys work as they do
 * everywhere else. The theme is the same store the root layout applies before paint.
 */
export function AccountMenu({ name, initials, links, signOut }: AccountMenuProps) {
  const panelId = useId();
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);

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
        className="motion-toast inset-auto top-16 right-4 m-0 w-72 max-w-[calc(100%-2rem)] rounded-md border border-line bg-surface-1 p-2 text-ink-1 shadow-elevation-1"
      >
        <p className="truncate px-3 py-2.5 font-semibold">{name}</p>
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
        <nav aria-label="Help and account" className="flex flex-col">
          {links}
        </nav>
        <form action={signOut}>
          <button type="submit" className={MENU_ITEM_CLASSES}>
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
