"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { APP_NAV_LINK_CLASSES, APP_NAV_LIST_CLASSES } from "@/components/ui/AppShell";
import { TEACHER_NAV, teacherNavCurrent } from "@/lib/authoring/teacherNav";
import { GuardedLink } from "./LeaveGuard";

/** How much of the row's right edge the fade covers (`APP_NAV_LIST_CLASSES`'s `pr-8`). */
const FADE_PX = 32;

/**
 * Scrolls the row, without animating, so a link is whole and clear of the fade. A browser scrolls
 * a focused link into view only when none of it shows, so a half-shown one is brought in here.
 */
export function revealLink(list: HTMLElement, link: Element): void {
  if (list.scrollWidth <= list.clientWidth) return;
  const row = list.getBoundingClientRect();
  const item = link.getBoundingClientRect();
  const start = Number.parseFloat(getComputedStyle(list).paddingLeft) || 0;
  if (item.left < row.left + start) list.scrollLeft -= row.left + start - item.left;
  else if (item.right > row.right - FADE_PX) list.scrollLeft += item.right - (row.right - FADE_PX);
}

/** The current link, whole: on a phone "Workspace" starts off the screen, and the teacher should
 * see where they are. */
export function revealCurrent(list: HTMLElement): void {
  const current = list.querySelector("[aria-current]");
  if (current) revealLink(list, current);
}

export interface TeacherNavProps {
  /** The path to mark as current, for a gallery specimen; the browser's own path otherwise. */
  currentPath?: string;
  /** The landmark's name. "Main" on every teacher page; a specimen names itself apart. */
  label?: string;
}

/**
 * The teacher's navigation (#412), in the app shell's bar on every teacher page: the library,
 * classes, live sessions and the workspace, each one tap away. One row that never wraps: beside
 * the wordmark from 1024px, and under it on a phone, where it scrolls sideways with the current
 * link kept in view (#563). The link for where the teacher is carries `aria-current`. Every link
 * asks the page's leave guard first, as the header's do, so unsaved work in the case study
 * builder is never dropped by a tap here.
 */
export function TeacherNav({ currentPath, label = "Main" }: TeacherNavProps = {}) {
  const browserPath = usePathname();
  const pathname = currentPath ?? browserPath ?? "";
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (list.current) revealCurrent(list.current);
  }, [pathname]);

  return (
    <nav aria-label={label}>
      <ul
        ref={list}
        className={APP_NAV_LIST_CLASSES}
        onFocus={(event) => revealLink(event.currentTarget, event.target)}
      >
        {TEACHER_NAV.map((item) => {
          const current = teacherNavCurrent(item, pathname);
          return (
            <li key={item.id} className="shrink-0">
              <GuardedLink href={item.href} aria-current={current} className={APP_NAV_LINK_CLASSES}>
                {item.label}
              </GuardedLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
