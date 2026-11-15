import { groupByCaseStudy, type ItemRow, type StepRow, type StudentRow } from "@/lib/live/report";
import { questionLabel } from "@/lib/live/questionLabel";
import { formatPercent, formatPoints } from "@/lib/live/reportFormat";
import { ScrollRegion } from "./ScrollRegion";
import { STICKY_EDGE } from "./stickyEdge";

export { ScrollRegion } from "./ScrollRegion";

/** A column header's frame, without its wrapping: a question's header wraps, the rest do not. */
const HEAD_FRAME = "border-b border-line-strong px-3 py-2 align-bottom font-medium text-ink-2";
export const HEAD = `${HEAD_FRAME} whitespace-nowrap`;
/** Scores and counts: tabular figures (the table's `tabular`), right-aligned, on one line. */
export const CELL = "px-3 py-2 text-right whitespace-nowrap";
/** The first column stays put while the rest scroll under it, so a row keeps its name at 375px. */
const ROW_HEAD_FRAME = `${STICKY_EDGE} px-3 py-2 text-left font-medium text-ink-1`;
/** A student's or a step's name: room for a first and last name on one line. */
export const ROW_HEAD = `${ROW_HEAD_FRAME} min-w-32`;
/** The first column's header, which stays put over it. */
export const STICKY_HEAD = `${HEAD} ${STICKY_EDGE} text-left`;
export const ROW = "border-b border-line last:border-b-0";
/** A case study's name over its steps (#469), in a row or across columns of its own. */
export const GROUP_HEAD =
  "border-b border-line bg-surface-2 px-3 py-2 text-left font-medium break-words text-ink-1";
/**
 * A question's column: wide enough for its number and excerpt in at most three lines, set to the
 * right like the points under it.
 */
const QUESTION_HEAD = `${HEAD_FRAME} w-52 min-w-52 text-right break-words whitespace-normal`;
/** A question's row: the sticky first column, narrow enough at 375px to leave room for figures. */
const QUESTION_ROW_HEAD = `${ROW_HEAD_FRAME} w-48 min-w-48 break-words sm:w-auto sm:max-w-80`;

const caseStudyHeading = (title: string) => `Case study: ${title}`;

type NamedItem = Pick<ItemRow, "position" | "ref" | "stem">;

/**
 * What a question is called in a teacher's report (#563): its number and the start of its text,
 * the whole text in the tooltip and the accessible name. A question whose text was not read keeps
 * the name it had before, its number and `ref`.
 */
export function questionName(item: NamedItem): { number: string; excerpt: string; full: string } {
  const label = questionLabel(item.position, item.stem);
  return label.excerpt
    ? label
    : { ...label, excerpt: item.ref, full: `${label.number} ${item.ref}` };
}

/**
 * A question's name inside its header cell: the number over the excerpt for the eye, and the whole
 * text for a screen reader, so a cell's header reads as the question it is.
 */
function QuestionName({ item }: { item: NamedItem }) {
  const name = questionName(item);
  return (
    <>
      <span aria-hidden="true" className="block">
        <span className="font-semibold text-ink-1">{name.number}</span>{" "}
        <span className="font-normal">{name.excerpt}</span>
      </span>
      <span className="sr-only">{name.full}</span>
    </>
  );
}

/** A column header that is not a question: its words, which side it sits, and whether it sticks. */
export interface HeadSpec {
  label: string;
  align: "left" | "right";
  /** The first column, which stays put while the rest scroll under it. */
  sticky?: boolean;
}

/**
 * A table's column headers around its question columns. For a quiz that played a case study in
 * place (#469, #470), each case study is named in a row above its steps' columns; every other
 * header spans both rows, so nothing above it is left as an empty band (#563).
 */
export function QuestionHeadRows({
  before,
  items,
  after = [],
}: {
  before: readonly HeadSpec[];
  items: readonly (NamedItem & Pick<ItemRow, "caseStudy">)[];
  after?: readonly HeadSpec[];
}) {
  const groups = groupByCaseStudy(items);
  const grouped = groups.some((group) => group.caseStudy !== null);
  const rowSpan = grouped ? 2 : undefined;
  const plain = (head: HeadSpec) => (
    <th
      key={head.label}
      scope="col"
      rowSpan={rowSpan}
      className={
        head.sticky ? STICKY_HEAD : `${HEAD} ${head.align === "left" ? "text-left" : "text-right"}`
      }
    >
      {head.label}
    </th>
  );
  const question = (item: NamedItem, span?: number) => (
    <th
      key={item.position}
      scope="col"
      rowSpan={span}
      title={questionName(item).full}
      className={QUESTION_HEAD}
    >
      <QuestionName item={item} />
    </th>
  );
  if (!grouped) {
    return (
      <tr>
        {before.map(plain)}
        {items.map((item) => question(item))}
        {after.map(plain)}
      </tr>
    );
  }
  return (
    <>
      <tr>
        {before.map(plain)}
        {groups.map((group) =>
          group.caseStudy === null ? (
            group.items.map((item) => question(item, 2))
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
        {after.map(plain)}
      </tr>
      <tr>
        {groups.flatMap((group) =>
          group.caseStudy === null ? [] : group.items.map((item) => question(item)),
        )}
      </tr>
    </>
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
          <QuestionHeadRows
            before={[{ label: "Student", align: "left", sticky: true }]}
            items={items}
            after={[
              { label: "Total", align: "right" },
              { label: "Percent", align: "right" },
            ]}
          />
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
    <ScrollRegion label="Results by question">
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={STICKY_HEAD}>
              Question
            </th>
            {heads.map((head) => (
              <th key={head} scope="col" className={`${HEAD} text-right`}>
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
              <ItemTableRow
                key={item.position}
                item={item}
                participantCount={participantCount}
                correctColumn={correctColumn}
              />
            ))}
          </tbody>
        ))}
      </table>
    </ScrollRegion>
  );
}

function ItemTableRow({
  item,
  participantCount,
  correctColumn,
}: {
  item: ItemRow & { percentCorrect?: number | null };
  participantCount: number;
  correctColumn: boolean;
}) {
  return (
    <tr className={ROW}>
      <th scope="row" title={questionName(item).full} className={QUESTION_ROW_HEAD}>
        <QuestionName item={item} />
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
  );
}

export function StepTable({ steps }: { steps: readonly StepRow[] }) {
  return (
    <ScrollRegion label="Results by clinical judgment step">
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={STICKY_HEAD}>
              Clinical judgment step
            </th>
            {["Questions", "Answers", "Mean %"].map((head) => (
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
