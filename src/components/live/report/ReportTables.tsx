import type { ReactNode } from "react";
import type { ItemRow, StepRow, StudentRow } from "@/lib/live/report";
import { formatPercent, formatPoints } from "@/lib/live/reportFormat";

export const HEAD =
  "border-b border-line-strong px-3 py-2 font-medium text-ink-2 whitespace-nowrap";
export const CELL = "px-3 py-2 text-right whitespace-nowrap";
/** The first column stays put while the rest scroll under it, so a row keeps its name at 375px. */
export const ROW_HEAD = "sticky left-0 bg-surface-1 px-3 py-2 text-left font-medium text-ink-1";
export const ROW = "border-b border-line last:border-b-0";

/**
 * A table that scrolls sideways inside its own box, never the page (#186's 375px criterion).
 * Focusable and named, so a keyboard can scroll it and axe's scrollable-region rule holds.
 */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-sm border border-line bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </div>
  );
}

export function StudentTable({
  items,
  students,
}: {
  items: readonly ItemRow[];
  students: readonly StudentRow[];
}) {
  return (
    <ScrollRegion label="Scores by student">
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${HEAD} sticky left-0 bg-surface-1 text-left`}>
              Student
            </th>
            {items.map((item) => (
              <th key={item.position} scope="col" className={`${HEAD} text-right`}>
                {`Q${item.position} ${item.ref}`}
              </th>
            ))}
            <th scope="col" className={`${HEAD} text-right`}>
              Total
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Percent
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.participantId} className={ROW}>
              <th scope="row" className={ROW_HEAD}>
                {student.displayName}
              </th>
              {student.scores.map((score, index) => (
                <td key={index} className={`${CELL} ${score ? "text-ink-1" : "text-ink-2"}`}>
                  {formatPoints(score?.points ?? null)}
                </td>
              ))}
              <td
                className={CELL}
              >{`${formatPoints(student.points)} / ${formatPoints(student.possible)}`}</td>
              <td className={`${CELL} font-medium`}>{formatPercent(student.percent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

export function ItemTable({
  items,
  participantCount,
  correctColumn = false,
}: {
  items: readonly (ItemRow & { percentCorrect?: number | null })[];
  participantCount: number;
  /** The share of answers fully correct, after Answered (#211's assignment report). */
  correctColumn?: boolean;
}) {
  const heads = correctColumn
    ? ["Step", "Answered", "Correct", "Mean", "Mean %", "Full", "Partial", "None"]
    : ["Step", "Answered", "Mean", "Mean %", "Full", "Partial", "None"];
  return (
    <ScrollRegion label="Results by item">
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${HEAD} sticky left-0 bg-surface-1 text-left`}>
              Item
            </th>
            {heads.map((head) => (
              <th key={head} scope="col" className={`${HEAD} text-right`}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.position} className={ROW}>
              <th scope="row" className={ROW_HEAD}>
                {`Q${item.position} ${item.ref}`}
              </th>
              <td className={CELL}>{item.cjmmStep === null ? "–" : `Step ${item.cjmmStep}`}</td>
              <td className={CELL}>{`${item.responded} of ${participantCount}`}</td>
              {correctColumn ? (
                <td className={CELL}>{formatPercent(item.percentCorrect ?? null)}</td>
              ) : null}
              <td className={CELL}>
                {item.meanPoints === null
                  ? "–"
                  : `${formatPoints(item.meanPoints)} / ${formatPoints(item.maxPoints)}`}
              </td>
              <td className={`${CELL} font-medium`}>{formatPercent(item.meanPercent)}</td>
              <td className={CELL}>{item.full}</td>
              <td className={CELL}>{item.partial}</td>
              <td className={CELL}>{item.none}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

export function StepTable({ steps }: { steps: readonly StepRow[] }) {
  return (
    <ScrollRegion label="Results by CJMM step">
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${HEAD} sticky left-0 bg-surface-1 text-left`}>
              CJMM step
            </th>
            {["Items", "Answers", "Mean %"].map((head) => (
              <th key={head} scope="col" className={`${HEAD} text-right`}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.step} className={ROW}>
              <th scope="row" className={ROW_HEAD}>
                {`Step ${step.step}: ${step.label}`}
              </th>
              <td className={CELL}>{step.itemCount}</td>
              <td className={CELL}>{step.responded}</td>
              <td className={`${CELL} font-medium`}>{formatPercent(step.meanPercent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
