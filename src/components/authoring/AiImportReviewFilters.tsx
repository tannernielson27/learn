import type { Ref } from "react";
import { PRESS_CLASSES } from "@/components/ui/Button";
import { REVIEW_FILTERS, type ReviewFilter } from "@/lib/authoring/aiImportReview";

export interface AiImportReviewFiltersProps {
  filter: ReviewFilter;
  counts: Record<ReviewFilter, number>;
  onChoose: (filter: ReviewFilter) => void;
  /** What a card that has just left the list would have said (#593); null when none has. */
  notice: string | null;
  /** The notice takes the focus the card had, so it is focusable and reached by this ref. */
  noticeRef: Ref<HTMLParagraphElement>;
}

/**
 * The review's status filters, and under them the line that speaks for a card once it has left
 * the list: dropped under "Needs a fix", say, its confirmation would vanish with it.
 */
export function AiImportReviewFilters({
  filter,
  counts,
  onChoose,
  notice,
  noticeRef,
}: AiImportReviewFiltersProps) {
  return (
    <div>
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {REVIEW_FILTERS.map((option) => {
          const active = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChoose(option.value)}
              // At rest, a secondary button's 3:1 edge (WCAG 1.4.11); pressed, the selected fill.
              className={`tap-target rounded-md border px-3 text-sm font-semibold ${PRESS_CLASSES} ${
                active
                  ? "border-accent bg-accent-soft text-ink-1"
                  : "border-field-border bg-surface-1 text-ink-1 hover:bg-surface-2"
              }`}
            >
              {option.label} <span className="text-ink-2">({counts[option.value]})</span>
            </button>
          );
        })}
      </div>
      {/* Always rendered: a region that appears with its text already in it is often not read.
          It takes no room while it is empty. */}
      <div aria-live="polite">
        {notice ? (
          <p
            ref={noticeRef}
            tabIndex={-1}
            data-testid="review-notice"
            className="mt-3 text-sm text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {notice}
          </p>
        ) : null}
      </div>
    </div>
  );
}
