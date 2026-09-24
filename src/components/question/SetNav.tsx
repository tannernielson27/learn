"use client";

export interface SetNavEntry {
  /** Stable key for the entry: the item's id. */
  key: string;
  answered: boolean;
}

export interface SetNavProps {
  entries: readonly SetNavEntry[];
  /** Zero-based index of the item on screen. */
  current: number;
  onSelect: (index: number) => void;
}

/**
 * The list of a set's items a student moves through at their own pace: a numbered button per item,
 * the one on screen marked `aria-current="step"`, and a filled dot on the ones answered. Shared by
 * a student-paced live room (#185) and an assignment (#208), so both look and read the same.
 *
 * Answered is a filled dot and an outlined one is not: shape, not colour alone. Each button's name
 * says the same in words for a screen reader. Native buttons in reading order, so Tab and Enter
 * work; the list wraps at 375px.
 */
export function SetNav({ entries, current, onSelect }: SetNavProps) {
  return (
    <nav aria-label="Items" className="mt-4">
      <ol className="flex flex-wrap gap-2">
        {entries.map((entry, position) => (
          <li key={entry.key}>
            <button
              type="button"
              aria-current={position === current ? "step" : undefined}
              onClick={() => onSelect(position)}
              className={`tap-target inline-flex min-w-11 items-center justify-center gap-1 rounded-sm border px-3 text-sm ${
                position === current
                  ? "border-accent bg-accent-soft text-ink-1"
                  : "border-line bg-surface-1 text-ink-1 hover:border-line-strong"
              }`}
            >
              <span aria-hidden="true" className="tabular">
                {position + 1}
              </span>
              <span
                aria-hidden="true"
                className={`inline-block size-2 rounded-full border ${
                  entry.answered ? "border-accent bg-accent" : "border-line-strong bg-transparent"
                }`}
              />
              <span className="sr-only">
                {`Item ${position + 1}, ${entry.answered ? "answered" : "not answered"}`}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
