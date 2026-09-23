import type { BlanksDistribution } from "@/lib/live/results";
import { ChoiceBars, Footnotes, ResultGroup, blankLine } from "./parts";

/** Drop-down and drag-and-drop cloze, and the drop-down table: the choices for each blank. */
export function BlanksResult({
  distribution,
  revealed,
}: {
  distribution: BlanksDistribution;
  revealed: boolean;
}) {
  return (
    <div className="space-y-5">
      {distribution.blanks.map((blank) => (
        <ResultGroup key={blank.id} title={blank.label}>
          <ChoiceBars
            label={blank.label}
            choices={blank.choices}
            total={distribution.responded}
            revealed={revealed}
          />
          <Footnotes lines={[blankLine(blank.unanswered)]} />
        </ResultGroup>
      ))}
    </div>
  );
}
