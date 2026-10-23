"use client";

import { usePathname } from "next/navigation";
import { TEACHER_NAV, teacherNavCurrent } from "@/lib/authoring/teacherNav";
import { GuardedLink } from "./LeaveGuard";

// The app shell's navigation (Foundation and Library mockups): muted until hovered, and the page
// the teacher is on in full ink on the secondary surface. `aria-current` carries it, not colour.
const linkClass =
  "tap-target inline-flex items-center rounded-md px-3.5 text-base font-semibold text-ink-2 " +
  "transition-colors duration-fast hover:bg-surface-2 hover:text-ink-1 " +
  "aria-[current]:bg-surface-2 aria-[current]:text-ink-1";

/**
 * The teacher's navigation (#412), in the app shell's bar on every teacher page (beside the
 * wordmark from 1024px, on its own row below): the library, classes, live sessions and the
 * workspace, each one tap away. The link for where the teacher is carries
 * `aria-current`. Every link asks the page's leave guard first, as the header's do, so unsaved
 * work in the case study builder is never dropped by a tap here.
 */
export function TeacherNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Main">
      <ul className="flex flex-wrap gap-1">
        {TEACHER_NAV.map((item) => {
          const current = teacherNavCurrent(item, pathname);
          return (
            <li key={item.id}>
              <GuardedLink href={item.href} aria-current={current} className={linkClass}>
                {item.label}
              </GuardedLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
