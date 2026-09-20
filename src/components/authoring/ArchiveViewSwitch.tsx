import Link from "next/link";
import type { BankFilter } from "@/lib/authoring/bankSearch";
import type { FolderView } from "@/lib/authoring/folders";
import { bankViewHref } from "@/lib/authoring/tagFilter";

export interface ArchiveViewSwitchProps {
  bankId: string;
  view: FolderView;
  filter: BankFilter;
}

const linkClass =
  "tap-target inline-flex items-center rounded-sm px-3 text-sm text-ink-1 transition-colors duration-fast hover:bg-surface-2 aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium aria-[current=page]:text-accent-ink";

/**
 * Two links: the bank's current content and its archived content. The Archived view is the status
 * filter set to archived, so both links keep the open folder, the tag filter and the search, and
 * Current keeps a draft or published status rather than clearing it. Either link starts at page 1.
 */
export function ArchiveViewSwitch({ bankId, view, filter }: ArchiveViewSwitchProps) {
  const archived = filter.status === "archived";
  const current: BankFilter = archived ? { ...filter, status: null } : filter;
  return (
    <nav aria-label="Current or archived">
      <ul className="flex gap-1 rounded-sm border border-line p-1">
        <li>
          <Link
            href={bankViewHref(bankId, view, current)}
            aria-current={archived ? undefined : "page"}
            className={linkClass}
          >
            Current
          </Link>
        </li>
        <li>
          <Link
            href={bankViewHref(bankId, view, { ...filter, status: "archived" })}
            aria-current={archived ? "page" : undefined}
            className={linkClass}
          >
            Archived
          </Link>
        </li>
      </ul>
    </nav>
  );
}
