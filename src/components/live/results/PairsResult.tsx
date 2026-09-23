import type { PairsDistribution, WrongCombination } from "@/lib/live/results";
import { ChoiceBars, Footnotes, ResultGroup, blankLine, shareText } from "./parts";

/**
 * The rationale types: the choices for each blank, and — once the answer is showing — the wrong
 * combinations the room gave most often, which is what a class discusses. Before the reveal those
 * are not drawn at all: a list of wrong answers is a list of hints.
 */
export function PairsResult({
  distribution,
  revealed,
}: {
  distribution: PairsDistribution;
  revealed: boolean;
}) {
  const total = distribution.responded;
  const labels = new Map(distribution.blanks.map((blank) => [blank.id, blank.label]));
  return (
    <div className="space-y-5">
      {revealed ? (
        <p data-testid="result-summary" className="tabular text-base text-ink-1 lg:text-lg">
          {distribution.allCorrect} of {total} filled every blank correctly
        </p>
      ) : null}
      {distribution.blanks.map((blank) => (
        <ResultGroup key={blank.id} title={blank.label}>
          <ChoiceBars
            label={blank.label}
            choices={blank.choices}
            total={total}
            revealed={revealed}
          />
          <Footnotes lines={[blankLine(blank.unanswered)]} />
        </ResultGroup>
      ))}
      {revealed ? (
        <ResultGroup title="Most common wrong combinations">
          {distribution.commonWrong.length === 0 ? (
            <p className="text-base text-ink-2">Nobody gave a wrong combination.</p>
          ) : (
            <ol aria-label="Most common wrong combinations" className="space-y-2">
              {distribution.commonWrong.map((combination, index) => (
                <li key={index} className="text-base text-ink-1 lg:text-lg">
                  {describeCombination(combination, labels)}
                  <span className="tabular ml-2 whitespace-nowrap text-ink-2">
                    {shareText(combination.count, total)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </ResultGroup>
      ) : null}
    </div>
  );
}

/** "Blank 1: Pneumonia; Blank 2: nothing". */
function describeCombination(
  combination: WrongCombination,
  labels: ReadonlyMap<string, string>,
): string {
  return combination.picks
    .map(
      (pick) => `${labels.get(pick.blankId) ?? pick.blankId}: ${pick.choice?.label ?? "nothing"}`,
    )
    .join("; ");
}
