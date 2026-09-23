import type { SlotsDistribution } from "@/lib/live/results";
import { ChoiceBars, Footnotes, ResultGroup, blankLine } from "./parts";

/** Bowtie: what went into each of the three slots, in the order the bowtie reads. */
export function SlotsResult({
  distribution,
  revealed,
}: {
  distribution: SlotsDistribution;
  revealed: boolean;
}) {
  return (
    <div className="space-y-5">
      {distribution.slots.map((slot) => (
        <ResultGroup key={slot.id} title={`${slot.label} (takes ${slot.capacity})`}>
          <ChoiceBars
            label={slot.label}
            choices={slot.choices}
            total={distribution.responded}
            revealed={revealed}
          />
          <Footnotes lines={[blankLine(slot.unanswered, "left this slot empty")]} />
        </ResultGroup>
      ))}
    </div>
  );
}
