import Link from "next/link";
import { practicePath, practiceProgressLabel } from "@/lib/practice/paths";
import type { PracticeBank } from "@/lib/supabase/practice";
import { EmptyState } from "@/components/ui/EmptyState";

export interface PracticeBankListProps {
  banks: readonly PracticeBank[];
}

/**
 * The Practice section of the student home (#241): each bank an instructor has shared with one of
 * the student's classes, how many items it holds, and how far their current run has got. Each name
 * opens the bank's practice. A Server Component.
 */
export function PracticeBankList({ banks }: PracticeBankListProps) {
  if (banks.length === 0) {
    // Under the student home's Practice h2.
    return (
      <EmptyState
        level={3}
        heading="Nothing is shared for practice yet"
        body="Banks your instructor shares for practice appear here, ready to open."
      />
    );
  }
  return (
    <ul
      aria-label="Practice banks"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {banks.map((bank) => (
        <li key={bank.bankId} className="flex flex-col gap-1 px-2 py-3">
          <Link
            href={practicePath(bank.bankId)}
            className="tap-target inline-flex items-center font-medium break-words text-ink-1 underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            {bank.name}
          </Link>
          <span className="tabular text-sm text-ink-2">{practiceProgressLabel(bank)}</span>
        </li>
      ))}
    </ul>
  );
}
