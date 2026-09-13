import Link from "next/link";
import type { BankSummary } from "@/lib/authoring/banks";
import { formatEdited, itemCountLabel } from "@/lib/authoring/format";

export interface BankListProps {
  banks: readonly BankSummary[];
}

export function BankList({ banks }: BankListProps) {
  if (banks.length === 0) {
    return <p className="text-ink-2">No item banks yet. Create one to start writing items.</p>;
  }

  return (
    <ul aria-label="Item banks" className="flex flex-col divide-y divide-line border-y border-line">
      {banks.map((bank) => (
        <li key={bank.id}>
          <Link
            href={`/author/banks/${bank.id}`}
            className="tap-target flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 py-3 transition-colors duration-fast hover:bg-surface-2"
          >
            <span className="font-medium text-ink-1">{bank.name}</span>
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
