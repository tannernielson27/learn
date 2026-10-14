import Link from "next/link";
import { PracticeBadge } from "@/components/practice/PracticeBadge";
import type { BankSummary } from "@/lib/authoring/banks";
import { formatEdited, itemCountLabel } from "@/lib/authoring/format";
import { EmptyState, type EmptyStateAction } from "@/components/ui/EmptyState";
import { SelectForMove } from "./SelectForMove";

export interface BankListProps {
  banks: readonly BankSummary[];
  /** Bank id to the names of the classes it is shared with for practice (#240). */
  sharedWith?: ReadonlyMap<string, readonly string[]>;
  /** With no banks yet: where one is made, on the page that lists them. */
  emptyAction?: EmptyStateAction;
  /** The empty list's heading; "No quizzes yet" unless a folder says otherwise. */
  emptyHeading?: string;
  /** The id of a move form (#411): each quiz gets a checkbox that joins it. */
  moveFormId?: string;
}

const NOBODY: readonly string[] = [];

export function BankList({
  banks,
  sharedWith,
  emptyAction,
  emptyHeading = "No quizzes yet",
  moveFormId,
}: BankListProps) {
  if (banks.length === 0) {
    // Right under the library's h1.
    return <EmptyState level={2} heading={emptyHeading} action={emptyAction} />;
  }

  return (
    <ul aria-label="Quizzes" className="flex flex-col divide-y divide-line border-y border-line">
      {banks.map((bank) => (
        <li key={bank.id} className="flex items-stretch">
          {moveFormId ? (
            <SelectForMove
              formId={moveFormId}
              name="quiz"
              value={bank.id}
              label={`Select ${bank.name}`}
            />
          ) : null}
          <Link
            href={`/author/banks/${bank.id}`}
            className="tap-target flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 py-3 transition-colors duration-fast hover:bg-surface-2"
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
