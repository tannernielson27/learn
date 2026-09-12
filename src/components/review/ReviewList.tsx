"use client";

export interface ReviewEntry {
  id: string;
  label: string;
  answered: boolean;
  flagged: boolean;
}

export interface ReviewListProps {
  /** Accessible name for the region, e.g. "Review this case study". */
  label: string;
  entries: readonly ReviewEntry[];
  /** The one being shown now, marked as current rather than offered as a destination. */
  currentId?: string;
  onJump: (id: string) => void;
}

/** What the student still has to come back to, said in words. Colour alone never carries it. */
const stateOf = (entry: ReviewEntry): string[] => [
  entry.answered ? "Answered" : "Not answered",
  ...(entry.flagged ? ["flagged for review"] : []),
];

/**
 * Where the student stands across a set: what is answered, what is not, and what they flagged to
 * come back to. Each row is a button, because its job is to take them there.
 */
export function ReviewList({ label, entries, currentId, onJump }: ReviewListProps) {
  return (
    <section aria-label={label} className="rounded-md border border-line p-5 sm:p-6">
      <h2 className="eyebrow">Review</h2>
      <ul className="mt-3 flex flex-col">
        {entries.map((entry) => {
          const current = entry.id === currentId;
          return (
            <li key={entry.id} className="border-t border-line first:border-t-0">
              <button
                type="button"
                aria-current={current ? "true" : undefined}
                onClick={() => onJump(entry.id)}
                // Stacked on a phone: a step name and its state side by side leave each other too
                // little room, and the name wraps into the state.
                className={`tap-target flex w-full flex-col items-start justify-center gap-0.5 rounded-sm px-2 py-2 text-left text-sm transition-colors duration-fast ease-out-expo sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 ${
                  current ? "bg-accent-soft text-accent-ink" : "hover:bg-surface-2"
                }`}
              >
                <span className="min-w-0 sm:flex-1">{entry.label}</span>
                <span
                  className={`text-xs sm:shrink-0 ${entry.flagged ? "text-ink-1" : "text-ink-2"}`}
                >
                  {stateOf(entry).join(", ")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
