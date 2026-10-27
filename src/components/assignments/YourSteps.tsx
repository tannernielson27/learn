import {
  STEP_SOURCES,
  type SourcedTally,
  type StepSource,
  type StepStanding,
  type StepStandings,
} from "@/lib/ngn/stepStandings";
import { formatPercent } from "@/lib/live/reportFormat";
import { EmptyState } from "@/components/ui/EmptyState";

export interface YourStepsProps {
  standings: StepStandings;
}

const SOURCE_LABEL: Readonly<Record<StepSource, string>> = {
  assignments: "assignments",
  practice: "practice",
  live: "live sessions",
};

const questionsLabel = (count: number): string =>
  count === 1 ? "1 question" : `${count} questions`;

/** "12 questions", or with two sources, "12 questions: 8 from assignments, 4 from practice". */
function countLabel(tally: SourcedTally): string {
  const sources = STEP_SOURCES.filter((source) => tally.bySource[source].items > 0);
  if (sources.length < 2) return questionsLabel(tally.items);
  const parts = sources.map(
    (source) => `${tally.bySource[source].items} from ${SOURCE_LABEL[source]}`,
  );
  return `${questionsLabel(tally.items)}: ${parts.join(", ")}`;
}

/** How far across the step's bar goes. Decorative: the percent beside it says the number. */
function StepBar({ percent }: { percent: number }) {
  const share = Math.min(Math.max(percent / 100, 0), 1);
  return (
    <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-sm bg-surface-2">
      <div
        data-share={share.toFixed(2)}
        className="h-full w-full origin-left bg-accent"
        style={{ transform: `scaleX(${share})` }}
      />
    </div>
  );
}

function StepItem({ standing }: { standing: StepStanding }) {
  const count = countLabel(standing);
  return (
    <li className="flex flex-col gap-1.5 px-2 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-medium text-ink-1">{standing.label}</h3>
        {standing.ranked ? (
          <span className="tabular shrink-0 font-mono text-base text-ink-1">
            {formatPercent(standing.percent)}
          </span>
        ) : null}
      </div>
      {standing.ranked && standing.percent !== null ? <StepBar percent={standing.percent} /> : null}
      <p className="text-sm text-ink-2">
        {standing.ranked ? count : null}
        {!standing.ranked && standing.items > 0 ? `Not enough answers yet (${count})` : null}
        {standing.items === 0 ? "No answers yet" : null}
      </p>
    </li>
  );
}

/**
 * A student's clinical judgment steps (#239): the six steps, weakest first, from their best
 * attempt at each closed assignment, their first answers in practice and their answers in ended
 * live sessions. A step needs five questions before it is ranked; until then it
 * reads "Not enough answers yet" and has no percent. The list is ordered, so a screen reader hears
 * the steps in rank order, each as a heading with its percent and count. A Server Component.
 */
export function YourSteps({ standings }: YourStepsProps) {
  const answered = standings.steps.reduce((sum, step) => sum + step.items, 0);
  if (answered === 0 && standings.untagged.items === 0) {
    // Under the student home's Your clinical judgment steps h2.
    return <EmptyState level={3} heading="No answers yet" />;
  }

  return (
    <>
      <p className="mb-3 text-sm text-ink-2">Weakest first.</p>
      <ol
        aria-label="Your clinical judgment steps"
        className="flex flex-col divide-y divide-line border-y border-line"
      >
        {standings.steps.map((standing) => (
          <StepItem key={standing.step} standing={standing} />
        ))}
      </ol>
    </>
  );
}
