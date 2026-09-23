import { concealKey, type Distribution } from "@/lib/live/results";
import { BlanksResult } from "./BlanksResult";
import { GridResult } from "./GridResult";
import { OptionsResult } from "./OptionsResult";
import { OrderResult } from "./OrderResult";
import { PairsResult } from "./PairsResult";
import { SlotsResult } from "./SlotsResult";
import { Footnotes, blankLine } from "./parts";

export interface DistributionViewProps {
  distribution: Distribution;
  /** Whether the host has shown the answer. Until then nothing is marked correct. */
  revealed: boolean;
  /**
   * What the item is called, when more than one view is on a page: it keeps the name of a heat
   * map's scrolling region unique. The console shows one item at a time and passes nothing.
   */
  name?: string;
}

/**
 * How the room answered one item, drawn for its kind (#180). One component per kind of
 * distribution, and this picks between them.
 *
 * Before the reveal the key is taken off the data (`concealKey`) as well as out of the markup, so
 * a projected console cannot give the answer away through a component that forgot to check.
 */
export function DistributionView({ distribution, revealed, name }: DistributionViewProps) {
  const shown = revealed ? distribution : concealKey(distribution);
  return (
    <div data-testid="results-view" data-kind={shown.kind}>
      <p className="tabular mb-4 text-sm text-ink-2">
        {shown.responded} {shown.responded === 1 ? "answer" : "answers"} counted
      </p>
      <Kind distribution={shown} revealed={revealed} name={name} />
      <Footnotes lines={[blankLine(shown.unreadable, "could not be read and are not counted")]} />
    </div>
  );
}

function Kind({ distribution, revealed, name }: DistributionViewProps) {
  switch (distribution.kind) {
    case "options":
      return <OptionsResult distribution={distribution} revealed={revealed} />;
    case "grid":
      return <GridResult distribution={distribution} revealed={revealed} name={name} />;
    case "blanks":
      return <BlanksResult distribution={distribution} revealed={revealed} />;
    case "slots":
      return <SlotsResult distribution={distribution} revealed={revealed} />;
    case "order":
      return <OrderResult distribution={distribution} revealed={revealed} name={name} />;
    case "pairs":
      return <PairsResult distribution={distribution} revealed={revealed} />;
  }
}
