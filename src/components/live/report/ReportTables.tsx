import type { ReactNode } from "react";
import {
  groupByCaseStudy,
  questionLabel,
  stepLabel,
  questionNumber,
  type ItemRow,
  type StepRow,
  type StudentRow,
} from "@/lib/live/report";
import { formatPercent, formatPoints } from "@/lib/live/reportFormat";

export const HEAD =
  "border-b border-line-strong px-3 py-2 font-medium text-ink-2 whitespace-nowrap";
export const CELL = "px-3 py-2 text-right whitespace-nowrap";
/** The Step column is words ("3 · Prioritize Hypotheses"), so it reads left and may wrap. */
const STEP_CELL = "px-3 py-2 text-left";
/** The first column stays put while the rest scroll under it, so a row keeps its name at 375px. */
export const ROW_HEAD = "sticky left-0 bg-surface-1 px-3 py-2 text-left font-medium text-ink-1";
export const ROW = "border-b border-line last:border-b-0";
/** A case study's name over its steps (#469), in a row or across columns of its own. */
export const GROUP_HEAD =
  "border-b border-line bg-surface-2 px-3 py-2 text-left font-medium break-words text-ink-1";

const caseStudyHeading = (title: string) => `Case study: ${title}`;

/** The one line above a table that says what it shows, in plain words (#565). */
export function TableCaption({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-sm text-ink-2">{children}</p>;
}

/**
 * A row over a table's question columns naming each case study a quiz played in place over its
 * own steps' columns (#469, #470), or nothing for a set with none. `before` and `after` are how
 * many other columns the table has on either side of the questions. Each name is a column header
 * spanning its steps, so it heads every cell under them.
 */
export function CaseStudyHeadRow({
  items,
  before,
  after,
}: {
  items: readonly Pick<ItemRow, "position" | "caseStudy">[];
  before: number;
  after: number;
}) {
  const groups = groupByCaseStudy(items);
  if (groups.every((group) => group.caseStudy === null)) return null;
  return (
    <tr>
      <td colSpan={before} />
      {groups.map((group) =>
        group.caseStudy === null ? (
          <td key={group.items[0]?.position} colSpan={group.items.length} />
        ) : (
          <th
            key={group.items[0]?.position}
            scope="col"
            colSpan={group.items.length}
            className={GROUP_HEAD}
          >
            {caseStudyHeading(group.caseStudy.title)}
          </th>
        ),
      )}
      {after > 0 ? <td colSpan={after} /> : null}
    </tr>
  );
}

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
    <>
      <TableCaption>
        Points each student earned on each question. A dash means they did not answer it.
      </TableCaption>
      <ScrollRegion label="Scores by student">
        <table className="tabular w-full border-collapse text-sm">
          <thead>
            <CaseStudyHeadRow items={items} before={1} after={2} />
            <tr>
              <th scope="col" className={`${HEAD} sticky left-0 bg-surface-1 text-left`}>
                Student
              </th>
              {items.map((item) => {
                // A column per question is narrow: "Q3" to see, the whole label to hear and hover.
                const label = questionLabel(item);
                return (
                  <th
                    key={item.position}
                    scope="col"
                    title={label}
                    aria-label={label}
                    className={`${HEAD} text-right`}
                  >
                    {questionNumber(item)}
                  </th>
                );
              })}
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
    </>
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
  // How many could have answered is the same for every row, so it is said once, in the header.
  const answered = `Answered (of ${participantCount})`;
  const counts = ["All right", "Some right", "None right"];
  const heads = correctColumn
    ? ["Step", answered, "Correct", "Average", "Average %", ...counts]
    : ["Step", answered, "Average", "Average %", ...counts];
  return (
    <>
      <TableCaption>
        How the class did on each question: how many answered, the average score, and how many got
        all, some or none of it right.
      </TableCaption>
      <ScrollRegion label="Results by question">
        <table className="tabular w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className={`${HEAD} sticky left-0 bg-surface-1 text-left`}>
                Question
              </th>
              {heads.map((head) => (
                <th
                  key={head}
                  scope="col"
                  className={`${HEAD} ${head === "Step" ? "text-left" : "text-right"}`}
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          {/* #469: each case study a quiz played in place heads a group of its own steps. */}
          {groupByCaseStudy(items).map((group) => (
            <tbody key={group.items[0]?.position}>
              {group.caseStudy === null ? null : (
                <tr>
                  <th scope="rowgroup" colSpan={heads.length + 1} className={GROUP_HEAD}>
                    {caseStudyHeading(group.caseStudy.title)}
                  </th>
                </tr>
              )}
              {group.items.map((item) => (
                <ItemTableRow key={item.position} item={item} correctColumn={correctColumn} />
              ))}
            </tbody>
          ))}
        </table>
      </ScrollRegion>
    </>
  );
}

function ItemTableRow({
  item,
  correctColumn,
}: {
  item: ItemRow & { percentCorrect?: number | null };
  correctColumn: boolean;
}) {
  return (
    <tr className={ROW}>
      {/* The question's own id is for the author who wrote it: a tooltip here, a column in the CSV. */}
      <th scope="row" title={`Question id: ${item.ref}`} className={ROW_HEAD}>
        {questionLabel(item, { withStep: false })}
      </th>
      <td className={STEP_CELL}>{stepLabel(item.cjmmStep)}</td>
      <td className={CELL}>{item.responded}</td>
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
  );
}

export function StepTable({ steps }: { steps: readonly StepRow[] }) {
  return (
    <>
      <TableCaption>
        The class&apos;s average on the questions tagged with each clinical judgment step.
      </TableCaption>
      <ScrollRegion label="Results by clinical judgment step">
        <table className="tabular w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className={`${HEAD} sticky left-0 bg-surface-1 text-left`}>
                Clinical judgment step
              </th>
              {["Questions", "Answers", "Average %"].map((head) => (
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
    </>
  );
}
