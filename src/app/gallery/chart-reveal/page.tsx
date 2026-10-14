import { EhrBlocks } from "@/components/ehr/blocks";
import { recordAtStep, type EhrRecordView } from "@/lib/ngn/chartReveal";
import { stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import type { CjmmStep } from "@/lib/ngn/types";

// Parsed and cut down on the server: the browser gets three views and no schema.
const record = ehrRecordSchema.parse(stagedEhr);

const SHOWN: readonly { step: CjmmStep; note: string }[] = [
  { step: 1, note: "The chart stops at 0115. There is no labs tab." },
  { step: 2, note: "The labs tab is listed, locked." },
  { step: 6, note: "Everything the case charted." },
];

function StepView({ step, note, view }: { step: CjmmStep; note: string; view: EhrRecordView }) {
  const headingId = `chart-step-${step}`;
  return (
    <section aria-labelledby={headingId} className="min-w-0 rounded-md border border-line p-4">
      <p className="eyebrow">Step {step}</p>
      <h2 id={headingId} className="mt-1 text-lg font-semibold">
        Chart at step {step}
      </h2>
      <p className="mt-1 text-sm text-ink-2">{note}</p>
      <p className="mt-3 font-mono text-xs text-ink-2">
        Times: {view.timePoints.map((point) => point.label).join(", ")}
      </p>
      <ul className="mt-4 flex flex-col gap-5">
        {view.tabs.map((tab) => (
          <li key={tab.id} className="min-w-0 border-t border-line pt-3">
            <h3 className="text-sm font-semibold">{tab.title}</h3>
            {tab.locked ? (
              <p className="mt-1 text-sm text-ink-2">Locked</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <EhrBlocks blocks={tab.blocks} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ChartRevealPage() {
  return (
    <article className="max-w-6xl">
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">Chart by step</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        One case study record as a student may read it at three steps. Each column is what
        recordAtStep returns for that step: later notes, times and columns are left out, and a
        locked tab is its name with no text behind it. This shows the data, not the player; the tab
        bar and the locked state arrive with the player change. Sample content is fictional.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {SHOWN.map(({ step, note }) => (
          <StepView key={step} step={step} note={note} view={recordAtStep(record, step)} />
        ))}
      </div>
    </article>
  );
}
