import { sharedBadge } from "@/lib/practice/shares";

export interface PracticeBadgeProps {
  /** The classes the bank is shared with for practice, sorted. */
  classNames: readonly string[];
}

/** "Shared for practice with NUR 310" on the bank list and the bank page (#240). */
export function PracticeBadge({ classNames }: PracticeBadgeProps) {
  const text = sharedBadge(classNames);
  if (!text) return null;
  return (
    <span className="inline-flex max-w-full items-center rounded-sm border border-line bg-surface-2 px-2 py-0.5 text-sm break-words text-ink-1">
      {text}
    </span>
  );
}
