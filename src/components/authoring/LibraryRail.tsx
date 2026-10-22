import { Folder } from "lucide-react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { LibraryRailEntry } from "@/lib/authoring/libraryFolders";

export interface LibraryRailProps {
  entries: readonly LibraryRailEntry[];
}

// A chip on a phone and a tablet, a full-width row on the rail from 1024px (Library mockups). The
// open view is in accent on its soft fill, and says so with `aria-current`, not colour alone.
const linkClass =
  "tap-target flex shrink-0 items-center gap-2.5 rounded-full border border-field-border px-3.5 " +
  "text-sm font-medium whitespace-nowrap text-ink-1 transition-colors duration-fast " +
  "hover:bg-surface-2 aria-[current=page]:border-transparent aria-[current=page]:bg-accent-soft " +
  "aria-[current=page]:font-semibold aria-[current=page]:text-accent-ink " +
  "lg:w-full lg:rounded-md lg:border-transparent lg:text-base lg:whitespace-normal";

/**
 * The library's folders (#411) as the Library mockups draw them: All quizzes, Not in a folder and
 * each folder, a rail beside the list from 1024px and a row of chips that scrolls sideways inside
 * itself below that. One list, so a screen reader hears it once at any width.
 */
export function LibraryRail({ entries }: LibraryRailProps) {
  return (
    <nav aria-label="Library folders" className="min-w-0">
      <p className="eyebrow mb-2 hidden px-3 lg:block">Folders</p>
      <ul
        aria-label="Folders"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {entries.map((entry) => (
          <li key={entry.key} className={entry.depth > 0 ? "lg:pl-6" : undefined}>
            <Link
              href={entry.href}
              aria-current={entry.current ? "page" : undefined}
              className={linkClass}
            >
              {entry.quizCount === undefined ? null : (
                <Icon icon={Folder} className="hidden text-ink-2 lg:block" />
              )}
              <span className="min-w-0 break-words lg:flex-1">{entry.label}</span>
              {entry.quizCount === undefined ? null : (
                <span className="font-mono text-sm text-ink-2">
                  {entry.quizCount}
                  <span className="sr-only">{entry.quizCount === 1 ? " quiz" : " quizzes"}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
