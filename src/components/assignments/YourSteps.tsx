import {
  STEP_SOURCES,
  type SourcedTally,
  type StepSource,
  type StepStanding,
  type StepStandings,
} from "@/lib/ngn/stepStandings";
import { formatPercent } from "@/lib/live/reportFormat";

export interface YourStepsProps {
  standings: StepStandings;
}

const SOURCE_LABEL: Readonly<Record<StepSource, string>> = {
  assignments: "assignments",
  practice: "practice",
};

const itemsLabel = (count: number): string => (count === 1 ? "1 item" : `${count} items`);

/** "12 items", or with more than one source, "12 items: 8 from assignments, 4 from practice". */
function countLabel(tally: SourcedTally): string {
  const sources = STEP_SOURCES.filter((source) => tally.bySource[source].items > 0);
  if (sources.length < 2) return itemsLabel(tally.items);
  const parts = sources.map(
    (source) => `${tally.bySource[source].items} from ${SOURCE_LABEL[source]}`,
  );
  return `${itemsLabel(tally.items)}: ${parts.join(", ")}`;
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

function UntaggedNote({ items }: { items: number }) {
  if (items === 0) return null;
  const verb = items === 1 ? "had no step and is" : "had no step and are";
  return (
    <p className="mt-3 text-sm text-ink-2">{`${itemsLabel(items)} ${verb} not counted here.`}</p>
  );
}

/**
 * A student's clinical judgment steps (#239): the six CJMM steps, weakest first, from their best
 * attempt at each closed assignment. A step needs five items before it is ranked; until then it
 * reads "Not enough answers yet" and has no percent. The list is ordered, so a screen reader hears
 * the steps in rank order, each as a heading with its percent and count. A Server Component.
 */
export function YourSteps({ standings }: YourStepsProps) {
  const answered = standings.steps.reduce((sum, step) => sum + step.items, 0);
  if (answered === 0 && standings.untagged.items === 0) {
    return (
      <p className="text-ink-2">
        Nothing to show yet. Your steps appear here once an assignment you answered has closed.
      </p>
    );
  }

  return (
    <>
      <p className="mb-3 text-sm text-ink-2">
        From your best attempt at each closed assignment, weakest first. A step needs 5 items before
        it is ranked.
      </p>
      <ol
        aria-label="Your clinical judgment steps"
        className="flex flex-col divide-y divide-line border-y border-line"
      >
        {standings.steps.map((standing) => (
          <StepItem key={standing.step} standing={standing} />
        ))}
      </ol>
      <UntaggedNote items={standings.untagged.items} />
    </>
  );
}
