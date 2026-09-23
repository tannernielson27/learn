import { shareOf, percentOf, type ChoiceCount } from "@/lib/live/results";
import { CorrectMark, HeatLayer } from "./parts";

export interface HeatRow {
  id: string;
  label: string;
  /** One cell per column, in column order. */
  cells: readonly ChoiceCount[];
}

/** "Answers by position", or "Ordered Response: answers by position" when a page has several. */
export const heatLabel = (label: string, name?: string): string =>
  name === undefined ? label : `${name}: ${label.charAt(0).toLowerCase()}${label.slice(1)}`;

export interface HeatTableProps {
  /** Names the table and the region it scrolls in. */
  label: string;
  /** The heading over the row labels: "Finding", "Position". */
  corner: string;
  columns: readonly { id: string; label: string }[];
  rows: readonly HeatRow[];
  total: number;
  revealed: boolean;
}

/**
 * A heat map that is a real table (#180): row and column headers a screen reader announces with
 * every cell, and in each cell the count and its percentage as text. The shading is the same
 * number again, drawn; a correct cell, once the answer is showing, carries the word and a rule.
 *
 * At 375px a wide matrix scrolls sideways inside its own focusable region, never the page, and the
 * row labels stay put while it does (the report's tables do the same, #186).
 */
export function HeatTable({ label, corner, columns, rows, total, revealed }: HeatTableProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-sm border border-line bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <table className="tabular w-full border-collapse text-base lg:text-lg">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 border-b border-line-strong bg-surface-1 px-3 py-2 text-left text-sm font-medium text-ink-2"
            >
              {corner}
            </th>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="border-b border-line-strong px-3 py-2 text-center text-sm font-medium text-ink-2"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-b-0">
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-[12rem] bg-surface-1 px-3 py-2 text-left align-top font-medium break-words text-ink-1 sm:max-w-xs"
              >
                {row.label}
              </th>
              {row.cells.map((cell) => {
                const marked = revealed && cell.correct;
                return (
                  <td
                    key={cell.id}
                    data-testid="result-cell"
                    className={`relative min-w-[5.5rem] px-3 py-2 text-center align-top ${
                      marked ? "shadow-[inset_0_0_0_2px_var(--correct)]" : ""
                    }`}
                  >
                    <HeatLayer share={shareOf(cell.count, total)} />
                    <span className="relative block font-semibold text-ink-1">{cell.count}</span>
                    <span className="relative block text-sm text-ink-1">
                      {percentOf(cell.count, total)}%
                    </span>
                    {marked ? (
                      <span className="relative block">
                        <CorrectMark />
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
