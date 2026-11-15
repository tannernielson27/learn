import { questionLabel, type ReportSummary } from "@/lib/live/report";
import { formatPercent, questionAnchor, reportPath } from "@/lib/live/reportFormat";

/**
 * A session at a glance, above the report's tabs (#565): how many joined, how many questions,
 * the class's average and the question the class found hardest, which links to its row.
 * Mirrors the class overview's figures (`ClassOverviewPanel`).
 */
export function ReportSummaryStrip({
  sessionId,
  students,
  questions,
  summary,
}: {
  sessionId: string;
  students: number;
  questions: number;
  summary: ReportSummary;
}) {
  const { classAverage, hardest } = summary;
  return (
    <dl
      aria-label="Summary"
      className="mt-6 grid grid-cols-3 gap-x-4 border-y border-line sm:grid-cols-4 sm:gap-x-0 sm:divide-x sm:divide-line"
    >
      <Figure label="Students" value={String(students)} />
      <Figure label="Questions" value={String(questions)} />
      <Figure label="Class average" value={formatPercent(classAverage)} />
      <div className="col-span-3 flex min-w-0 flex-col gap-1 border-t border-line py-3 sm:col-span-1 sm:border-t-0 sm:px-4">
        <dt className="text-sm text-ink-2">Hardest question</dt>
        {hardest === null ? (
          <dd className="font-mono text-2xl text-ink-1 tabular-nums">–</dd>
        ) : (
          <>
            <dd className="font-mono text-2xl text-ink-1 tabular-nums">
              {formatPercent(hardest.meanPercent)}
            </dd>
            <dd className="text-sm">
              {/* A plain link, not next/link: the browser's own jump is what sets :target, which
                  highlights the row it lands on. */}
              <a
                href={`${reportPath(sessionId, "items")}#${questionAnchor(hardest.position)}`}
                className="font-medium text-accent-ink hover:underline"
              >
                {questionLabel(hardest)}
              </a>
            </dd>
          </>
        )}
      </div>
    </dl>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:px-4 sm:first:pl-0">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="font-mono text-2xl text-ink-1 tabular-nums">{value}</dd>
    </div>
  );
}
