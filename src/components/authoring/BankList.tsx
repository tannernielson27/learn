import Link from "next/link";
import { PracticeBadge } from "@/components/practice/PracticeBadge";
import type { BankSummary } from "@/lib/authoring/banks";
import { formatEdited, itemCountLabel } from "@/lib/authoring/format";
import { EmptyState, type EmptyStateAction } from "@/components/ui/EmptyState";

export interface BankListProps {
  banks: readonly BankSummary[];
  /** Bank id to the names of the classes it is shared with for practice (#240). */
  sharedWith?: ReadonlyMap<string, readonly string[]>;
  /** With no banks yet: where one is made, on the page that lists them. */
  emptyAction?: EmptyStateAction;
}

const NOBODY: readonly string[] = [];

export function BankList({ banks, sharedWith, emptyAction }: BankListProps) {
  if (banks.length === 0) {
    // Right under the author home's h1.
    return (
      <EmptyState
        level={2}
        heading="No item banks yet"
        body="Create one to start writing items."
        action={emptyAction}
      />
    );
  }

  return (
    <ul aria-label="Item banks" className="flex flex-col divide-y divide-line border-y border-line">
      {banks.map((bank) => (
        <li key={bank.id}>
          <Link
            href={`/author/banks/${bank.id}`}
            className="tap-target flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 py-3 transition-colors duration-fast hover:bg-surface-2"
          >
            <span className="flex min-w-0 flex-col items-start gap-1">
              <span className="font-medium break-words text-ink-1">{bank.name}</span>
              <PracticeBadge classNames={sharedWith?.get(bank.id) ?? NOBODY} />
            </span>
            <span className="flex gap-3 text-sm text-ink-2">
              <span>{itemCountLabel(bank.itemCount)}</span>
              <span>{formatEdited(bank.updatedAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
