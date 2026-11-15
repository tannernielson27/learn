import Link from "next/link";
import {
  byScore,
  markOfScore,
  questionLabel,
  type ItemRow,
  type StudentRow,
} from "@/lib/live/report";
import {
  formatPercent,
  formatPoints,
  studentsPath,
  type StudentViewOptions,
} from "@/lib/live/reportFormat";
import {
  CELL,
  HEAD,
  ROW,
  ROW_HEAD,
  ScrollRegion,
  StudentTable,
  TableCaption,
} from "./ReportTables";

type Mark = ReturnType<typeof markOfScore>;

// The shared table classes, a little tighter on a phone so four columns fit 375px (#565).
const tight = (classes: string) => classes.replace("px-3", "px-2 sm:px-3");
const C_HEAD = tight(HEAD);
const C_CELL = tight(CELL);
const C_ROW_HEAD = tight(ROW_HEAD);

const MARK_WORDS: Record<NonNullable<Mark> | "unanswered", string> = {
  full: "all right",
  partial: "some right",
  none: "none right",
  unanswered: "not answered",
};

/**
 * The students view (#565). By default a row per student that fits a phone: their score, their
 * percent and one small mark per question, so a class of any size and a quiz of any length read
 * without scrolling sideways. "Show points for every question" swaps in the full table.
 *
 * The marks are in the results chart's neutral hue: full, half, empty, or a dash for no answer.
 * Never red and green, which the product keeps for a student's own answers (docs/04).
 */
export function StudentResults({
  sessionId,
  items,
  students,
  options,
}: {
  sessionId: string;
  items: readonly ItemRow[];
  students: readonly StudentRow[];
  options: StudentViewOptions;
}) {
  const sorted = options.sort === "score" ? byScore(students) : students;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <OptionLinks
          label="Sort students"
          options={[
            { label: "By name", href: studentsPath(sessionId, { ...options, sort: "name" }) },
            { label: "By score", href: studentsPath(sessionId, { ...options, sort: "score" }) },
          ]}
          current={options.sort === "name" ? 0 : 1}
        />
        <Link
          href={studentsPath(sessionId, {
            ...options,
            layout: options.layout === "compact" ? "grid" : "compact",
          })}
          className="tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline"
        >
          {options.layout === "compact"
            ? "Show points for every question"
            : "Show the summary instead"}
        </Link>
      </div>
      {options.layout === "grid" ? (
        <StudentTable items={items} students={sorted} />
      ) : (
        <StudentSummaryTable items={items} students={sorted} />
      )}
    </>
  );
}

export function StudentSummaryTable({
  items,
  students,
}: {
  items: readonly ItemRow[];
  students: readonly StudentRow[];
}) {
  return (
    <>
      <TableCaption>
        Each student&rsquo;s score, with a mark for every question in order: <MarkKey />
      </TableCaption>
      <ScrollRegion label="Scores by student">
        <table className="tabular w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className={`${C_HEAD} sticky left-0 bg-surface-1 text-left`}>
                Student
              </th>
              <th scope="col" className={`${C_HEAD} text-right`}>
                Score
              </th>
              <th scope="col" className={`${C_HEAD} text-right`}>
                Percent
              </th>
              <th scope="col" className={`${C_HEAD} w-full text-left`}>
                Each question
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.participantId} className={ROW}>
                <th scope="row" className={C_ROW_HEAD}>
                  {student.displayName}
                </th>
                <td className={C_CELL}>
                  {`${formatPoints(student.points)} / ${formatPoints(student.possible)}`}
                </td>
                <td className={`${C_CELL} font-medium`}>{formatPercent(student.percent)}</td>
                <td className="py-2 pr-2 pl-2 sm:px-3">
                  <MarkStrip items={items} student={student} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </>
  );
}

/** One mark per question, wrapping onto a second line for a long quiz rather than widening. */
function MarkStrip({ items, student }: { items: readonly ItemRow[]; student: StudentRow }) {
  const marks = student.scores.map(markOfScore);
  const count = (mark: Mark) => marks.filter((each) => each === mark).length;
  // Heard once as a sentence; each mark's own tooltip is for a pointer.
  const spoken = [
    `${count("full")} all right`,
    `${count("partial")} some right`,
    `${count("none")} none right`,
    `${count(null)} not answered`,
  ].join(", ");
  return (
    <>
      <span className="sr-only">{spoken}</span>
      <span aria-hidden="true" className="flex max-w-80 flex-wrap gap-1">
        {items.map((item, index) => {
          const score = student.scores[index] ?? null;
          const mark = marks[index] ?? null;
          const words =
            score === null
              ? MARK_WORDS.unanswered
              : `${formatPoints(score.points)} / ${formatPoints(score.maxPoints)}, ${MARK_WORDS[mark ?? "none"]}`;
          return (
            <span
              key={item.position}
              title={`${questionLabel(item)}: ${words}`}
              className="inline-flex size-4 items-center justify-center"
            >
              <MarkGlyph mark={mark} />
            </span>
          );
        })}
      </span>
    </>
  );
}

function MarkGlyph({ mark }: { mark: Mark }) {
  if (mark === null) return <span className="h-0.5 w-2.5 rounded-full bg-ink-2" />;
  const ring = "size-3 rounded-full border-2 border-chart-bar";
  if (mark === "full") return <span className={`${ring} bg-chart-bar`} />;
  if (mark === "partial") {
    return (
      <span
        className={ring}
        style={{ background: "linear-gradient(90deg, var(--chart-bar) 50%, transparent 50%)" }}
      />
    );
  }
  return <span className={ring} />;
}

/** The marks' meaning, inline in the caption above the table. */
function MarkKey() {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
      {(["full", "partial", "none", null] as const).map((mark) => (
        <span key={String(mark)} className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-flex size-4 items-center justify-center">
            <MarkGlyph mark={mark} />
          </span>
          {MARK_WORDS[mark ?? "unanswered"]}
        </span>
      ))}
    </span>
  );
}

/** Two or three choices as links, the current one marked; the report's filters look the same. */
function OptionLinks({
  label,
  options,
  current,
}: {
  label: string;
  options: readonly { label: string; href: string }[];
  current: number;
}) {
  return (
    <nav aria-label={label}>
      <ul className="inline-flex rounded-sm border border-line bg-surface-1 p-0.5">
        {options.map((option, index) => (
          <li key={option.href} className="flex">
            <Link
              href={option.href}
              aria-current={index === current ? "page" : undefined}
              className={`tap-target inline-flex items-center rounded-sm px-3 text-sm font-medium ${
                index === current
                  ? "bg-accent-soft text-accent-ink"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink-1"
              }`}
            >
              {option.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
