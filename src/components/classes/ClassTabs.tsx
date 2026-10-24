import Link from "next/link";
import { CLASS_TAB_LABELS, CLASS_TABS, classTabPath, type ClassTab } from "@/lib/classes/classTabs";

export interface ClassTabsProps {
  classId: string;
  current: ClassTab;
}

/**
 * The class page's parts as links, the way the reports switch views: each one is an address, so
 * switching needs no script, and the one shown carries `aria-current="page"`. Links rather than
 * the ARIA tabs pattern, because each part is its own page load with its own history entry.
 *
 * On a phone the row scrolls sideways inside itself, never the page. The focus ring is drawn
 * inside each link so the scrolling row cannot clip it.
 */
export function ClassTabs({ classId, current }: ClassTabsProps) {
  return (
    <nav aria-label="Class views" className="border-b border-line">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {CLASS_TABS.map((tab) => (
          <li key={tab} className="shrink-0">
            <Link
              href={classTabPath(classId, tab)}
              aria-current={tab === current ? "page" : undefined}
              className={`tap-target inline-flex items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-fast focus-visible:outline-offset-[-2px] ${
                tab === current
                  ? "border-accent text-accent-ink"
                  : "border-transparent text-ink-2 hover:text-ink-1"
              }`}
            >
              {CLASS_TAB_LABELS[tab]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
