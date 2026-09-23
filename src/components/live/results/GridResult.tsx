import { percentOf, shareOf, type GridDistribution, type GridRow } from "@/lib/live/results";
import { HeatTable, heatLabel } from "./HeatTable";
import { CorrectMark, Footnotes, HeatLayer, ResultGroup, blankLine } from "./parts";

/**
 * Matrices, grouping and the highlight types: a heat map (#180).
 *
 * A matrix has shared columns, so it is a table of rows by columns. Grouping and highlighting do
 * not — each row has its own options or spans — so each row is its own group of shaded tiles,
 * each tile saying its label, its count and its percentage.
 */
export function GridResult({
  distribution,
  revealed,
  name,
}: {
  distribution: GridDistribution;
  revealed: boolean;
  /** Prefixes the table's name when more than one is on a page. */
  name?: string;
}) {
  const total = distribution.responded;
  if (distribution.columns !== null) {
    return (
      <>
        <HeatTable
          label={heatLabel("Answers by row and column", name)}
          corner="Row"
          columns={distribution.columns}
          rows={distribution.rows}
          total={total}
          revealed={revealed}
        />
        <Footnotes lines={distribution.rows.map(rowBlank)} />
      </>
    );
  }
  return (
    <div className="space-y-5">
      {distribution.rows.map((row) => (
        <ResultGroup key={row.id} title={row.label}>
          <TileList row={row} total={total} revealed={revealed} />
          <Footnotes lines={[rowBlank(row)]} />
        </ResultGroup>
      ))}
    </div>
  );
}

const rowBlank = (row: GridRow): string | null =>
  blankLine(row.unanswered, `chose nothing in ${row.label}`);

function TileList({ row, total, revealed }: { row: GridRow; total: number; revealed: boolean }) {
  return (
    <ul aria-label={row.label} className="flex flex-wrap gap-2">
      {row.cells.map((cell) => {
        const marked = revealed && cell.correct;
        return (
          <li
            key={cell.id}
            data-testid="result-cell"
            className={`relative max-w-full overflow-hidden rounded-sm border px-3 py-2 ${
              marked ? "border-2 border-correct" : "border-line"
            }`}
          >
            <HeatLayer share={shareOf(cell.count, total)} />
            <span className="relative block text-base break-words text-ink-1 lg:text-lg">
              {cell.label}
            </span>
            <span className="tabular relative block text-sm text-ink-1">
              {cell.count} · {percentOf(cell.count, total)}%
            </span>
            {marked ? (
              <span className="relative block">
                <CorrectMark />
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
