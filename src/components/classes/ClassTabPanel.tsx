"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { ClassTab } from "@/lib/classes/classTabs";

/** The tab a link in `ClassTabs` was just followed to, until its panel has taken focus. */
let pending: ClassTab | null = null;

/** Called by a tab link as it is followed, so the panel it opens takes focus once it is drawn. */
export function requestClassTabFocus(tab: ClassTab): void {
  pending = tab;
}

export interface ClassTabPanelProps {
  tab: ClassTab;
  children: ReactNode;
}

/**
 * The open tab's panel. After a tab link is followed, focus moves to the panel's first heading, so
 * a screen reader says where it landed and the next Tab starts in the panel, not at the top of the
 * page. Only after a tab link: a page opened from its address, or from Back, keeps the browser's
 * own focus.
 */
export function ClassTabPanel({ tab, children }: ClassTabPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pending !== tab) return;
    pending = null;
    const heading = ref.current?.querySelector<HTMLElement>("h2");
    if (!heading) return;
    // Focusable from script only, as the roster's and the assignments' headings already are.
    if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
    heading.focus();
  }, [tab]);
  return (
    <div ref={ref} className="min-w-0">
      {children}
    </div>
  );
}
