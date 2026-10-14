"use client";

import { usePathname } from "next/navigation";
import { TEACHER_NAV, teacherNavCurrent } from "@/lib/authoring/teacherNav";
import { GuardedLink } from "./LeaveGuard";

const linkClass =
  "tap-target inline-flex items-center border-b-2 border-transparent px-2 text-sm text-ink-1 " +
  "transition-colors duration-fast hover:bg-surface-2 aria-[current]:border-accent " +
  "aria-[current]:font-medium aria-[current]:text-accent-ink";

/**
 * The teacher's navigation (#412), under the header of every teacher page: the library, classes,
 * live sessions and the workspace, each one tap away. The link for where the teacher is carries
 * `aria-current`. Every link asks the page's leave guard first, as the header's do, so unsaved
 * work in the case study builder is never dropped by a tap here.
 */
export function TeacherNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Main" className="border-b border-line px-2">
      <ul className="flex flex-wrap">
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
