import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export interface HomeRowProps {
  href: string;
  /** The link's words, and so its whole accessible name: the row's title. */
  title: string;
  /** The quieter line under the title: class, attempts, due time. */
  children: ReactNode;
  /** What sits at the row's far end from 640px (a score), under the title line below that. */
  end?: ReactNode;
}

/**
 * One row of a student-home list (StudentHome mockup): a bordered card at least 64px tall with a
 * chevron, the whole of it a target. Only the title is the link, so the link's name is the title
 * alone; its `::after` stretches over the card to take the tap, and draws the focus ring there.
 */
export function HomeRow({ href, title, children, end }: HomeRowProps) {
  return (
    <li className="relative flex min-h-16 items-center gap-3 rounded-md border border-line bg-surface-1 px-4 py-3 transition-colors duration-fast has-[a:hover]:border-line-field">
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={href}
            className="font-semibold break-words text-ink-1 underline-offset-4 after:absolute after:inset-0 after:rounded-md after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
          >
            {title}
          </Link>
          <span className="text-sm break-words text-ink-2">{children}</span>
        </div>
        {end}
      </div>
      <Icon icon={ChevronRight} className="text-ink-2" />
    </li>
  );
}

/** The list the rows sit in, with the gap the mockup leaves between cards. */
export const HOME_LIST_CLASSES = "flex flex-col gap-2";
