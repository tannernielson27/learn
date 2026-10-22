"use client";

import { ChevronRight } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  isMissedRow,
  verdictLine,
  type ResultRow,
  type RowVerdict,
} from "@/lib/assignments/resultsSummary";
import { CJMM_STEP_LABELS } from "@/lib/ngn/types";

export type ResultsFilter = "all" | "missed";

export interface QuestionResultsProps {
  rows: readonly ResultRow[];
  filter: ResultsFilter;
  onFilter: (filter: ResultsFilter) => void;
  /** The question open in the review below, marked as current. */
  currentId?: string;
  onSelect: (id: string) => void;
  /** The heading's id, for the region's name. */
  headingId: string;
}

/** Red for none, green for full, ink between: always beside the words, never alone. */
const VERDICT_INK: Record<RowVerdict, string> = {
  full: "text-correct",
  partial: "text-ink-1",
  none: "text-incorrect",
  unanswered: "text-incorrect",
  unreadable: "text-ink-2",
};

const stepName = (row: ResultRow): string =>
  row.step === null ? "No step" : CJMM_STEP_LABELS[row.step];

/** The rows a filter shows. */
export const filterRows = (rows: readonly ResultRow[], filter: ResultsFilter): ResultRow[] =>
  filter === "all" ? [...rows] : rows.filter(isMissedRow);

/**
 * The questions with their verdicts (ResultsDesktop): All or Missed, and one row per question
 * that opens it in the review. Each row says its number, its text, its clinical judgment step and
 * its verdict with the points, so nothing depends on the colour.
 */
export function QuestionResults({
  rows,
  filter,
  onFilter,
  currentId,
  onSelect,
  headingId,
}: QuestionResultsProps) {
  const missed = rows.filter(isMissedRow).length;
  const shown = filterRows(rows, filter);
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <h2 id={headingId} className="font-read text-2xl text-ink-1">
          Questions
        </h2>
        <SegmentedControl
          label="Show"
          size="sm"
          options={[
            { value: "all", label: `All ${rows.length}` },
            { value: "missed", label: `Missed ${missed}` },
          ]}
          value={filter}
          onChange={onFilter}
        />
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-ink-2">You did not miss any questions.</p>
      ) : (
        <ul aria-label={filter === "all" ? "All questions" : "Missed questions"}>
          {shown.map((row) => (
            <li key={row.id} className="border-b border-line">
              <button
                type="button"
                aria-current={row.id === currentId ? "true" : undefined}
                aria-label={`Q${row.number}, ${row.stem}, ${stepName(row)}, ${verdictLine(row)}`}
                onClick={() => onSelect(row.id)}
                className="grid min-h-18 w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-1 py-3 text-left transition-colors duration-fast ease-out-expo hover:bg-surface-2 aria-current:bg-accent-soft sm:grid-cols-[3.5rem_minmax(0,1fr)_auto_1.5rem] sm:gap-x-4"
              >
                <span className="tabular font-mono text-sm text-ink-2">{`Q${row.number}`}</span>
                <span className="min-w-0">
                  <span className="block truncate">{row.stem}</span>
                  <span className="mt-0.5 block text-sm text-ink-2">{stepName(row)}</span>
                </span>
                <span className={`text-sm font-bold ${VERDICT_INK[row.verdict]}`}>
                  {verdictLine(row)}
                </span>
                <Icon icon={ChevronRight} className="hidden text-ink-2 sm:block" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
