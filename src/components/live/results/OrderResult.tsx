import type { OrderDistribution } from "@/lib/live/results";
import { HeatTable, heatLabel } from "./HeatTable";
import { Footnotes, blankLine } from "./parts";

/**
 * Ordered response: a heat map of where the room put each step, positions down and steps across.
 * Once the answer is showing, the cell the key puts at each position is marked, and the count of
 * answers that got the whole order right is said.
 */
export function OrderResult({
  distribution,
  revealed,
  name,
}: {
  distribution: OrderDistribution;
  revealed: boolean;
  /** Prefixes the table's name when more than one is on a page. */
  name?: string;
}) {
  const columns = (distribution.positions[0]?.choices ?? []).map(({ id, label }) => ({
    id,
    label,
  }));
  const rows = distribution.positions.map((position) => ({
    id: String(position.position),
    label: `Position ${position.position}`,
    cells: position.choices,
  }));
  return (
    <>
      {revealed ? (
        <p data-testid="result-summary" className="tabular mb-3 text-base text-ink-1 lg:text-lg">
          {distribution.exact} of {distribution.responded} put every step in the right order
        </p>
      ) : null}
      <HeatTable
        label={heatLabel("Answers by position", name)}
        corner="Position"
        columns={columns}
        rows={rows}
        total={distribution.responded}
        revealed={revealed}
      />
      <Footnotes
        lines={distribution.positions.map((position) =>
          blankLine(position.unanswered, `stopped before position ${position.position}`),
        )}
      />
    </>
  );
}
