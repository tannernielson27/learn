import {
  CELL,
  HEAD,
  QuestionHeadRows,
  ROW,
  ROW_HEAD,
  ScrollRegion,
  STICKY_HEAD,
} from "@/components/live/report/ReportTables";
import {
  STUDENT_STATUS_LABEL,
  type AssignmentItemRow,
  type AssignmentStudentRow,
} from "@/lib/assignments/report";
import { formatPercent, formatPoints } from "@/lib/live/reportFormat";

interface ProgressTableProps {
  /** The scrolling region's accessible name. */
  label?: string;
  students: readonly AssignmentStudentRow[];
  maxAttempts: number;
}

/** While the assignment is open: who has started and who has submitted, and nothing else. */
export function ProgressTable({
  students,
  maxAttempts,
  label = "Progress by student",
}: ProgressTableProps) {
  return (
    <ScrollRegion label={label}>
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={STICKY_HEAD}>
              Student
            </th>
            <th scope="col" className={`${HEAD} text-left`}>
              Status
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Attempts used
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.studentId} className={ROW}>
              <th scope="row" className={ROW_HEAD}>
                {student.displayName}
              </th>
              <td className="px-3 py-2 text-left whitespace-nowrap">
                {STUDENT_STATUS_LABEL[student.status]}
              </td>
              <td className={CELL}>{`${student.attemptsUsed} of ${maxAttempts}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

interface ScoreTableProps extends ProgressTableProps {
  items: readonly AssignmentItemRow[];
}

/**
 * Once closed: each student's status, best attempt, attempts used, and the best attempt by
 * question. The best attempt is said once, as a percent (#563); its points are in the CSV.
 */
export function ScoreTable({
  items,
  students,
  maxAttempts,
  label = "Scores by student",
}: ScoreTableProps) {
  return (
    <ScrollRegion label={label}>
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          {/* #470: a whole quiz's case studies, each named over its steps' columns. */}
          <QuestionHeadRows
            before={[
              { label: "Student", align: "left", sticky: true },
              { label: "Status", align: "left" },
              { label: "Best score", align: "right" },
              { label: "Attempts used", align: "right" },
            ]}
            items={items}
          />
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.studentId} className={ROW}>
              <th scope="row" className={ROW_HEAD}>
                {student.displayName}
              </th>
              <td className="px-3 py-2 text-left whitespace-nowrap">
                {STUDENT_STATUS_LABEL[student.status]}
              </td>
              <td className={`${CELL} font-medium`}>
                {formatPercent(student.best?.percent ?? null)}
              </td>
              <td className={CELL}>{`${student.attemptsUsed} of ${maxAttempts}`}</td>
              {student.scores.map((score, index) => (
                <td key={index} className={`${CELL} ${score ? "text-ink-1" : "text-ink-2"}`}>
                  {formatPoints(score?.points ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
