import type { OptionsDistribution } from "@/lib/live/results";
import { ChoiceBars, Footnotes, blankLine } from "./parts";

/** Multiple choice and multiple response: one bar per option, in the item's order. */
export function OptionsResult({
  distribution,
  revealed,
}: {
  distribution: OptionsDistribution;
  revealed: boolean;
}) {
  return (
    <>
      <ChoiceBars
        label="Options"
        choices={distribution.options}
        total={distribution.responded}
        revealed={revealed}
      />
      <Footnotes lines={[blankLine(distribution.unanswered, "chose no option")]} />
    </>
  );
}
