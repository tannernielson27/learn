"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Asked before a link leaves the page. Returns true when it has taken over (it holds unsaved work
 * and is asking the author first), so the link must not navigate; false lets the link go.
 */
export type LeaveGuard = (href: string) => boolean;

const LeaveGuardContext = createContext<RefObject<LeaveGuard | null> | null>(null);

/**
 * Lets links outside a page, such as the site header's, ask that page before leaving it. At most
 * one page guards at a time: the author layout shows one page.
 */
export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const guard = useRef<LeaveGuard | null>(null);
  return <LeaveGuardContext.Provider value={guard}>{children}</LeaveGuardContext.Provider>;
}

/** Guards leaving the page while the calling component is mounted. */
export function useLeaveGuard(guard: LeaveGuard) {
  const guardRef = useContext(LeaveGuardContext);
  useEffect(() => {
    if (!guardRef) return;
    guardRef.current = guard;
    return () => {
      if (guardRef.current === guard) guardRef.current = null;
    };
  }, [guardRef, guard]);
}

/** A click that opens a new tab or window, or a download, leaves this page as it is. */
function staysOnPage(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/** A link that asks the page's leave guard, if there is one, before navigating. */
export function GuardedLink({
  href,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const guardRef = useContext(LeaveGuardContext);
  function click(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || staysOnPage(event)) return;
    if (guardRef?.current?.(href)) event.preventDefault();
  }
  return <Link href={href} onClick={click} {...props} />;
}
