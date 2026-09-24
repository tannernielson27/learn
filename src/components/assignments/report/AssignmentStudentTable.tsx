import { CELL, HEAD, ROW, ROW_HEAD, ScrollRegion } from "@/components/live/report/ReportTables";
import {
  STUDENT_STATUS_LABEL,
  type AssignmentItemRow,
  type AssignmentStudentRow,
} from "@/lib/assignments/report";
import { formatPercent, formatPoints } from "@/lib/live/reportFormat";

const STICKY_HEAD = `${HEAD} sticky left-0 bg-surface-1 text-left`;

interface ProgressTableProps {
  students: readonly AssignmentStudentRow[];
  maxAttempts: number;
}

/** While the assignment is open: who has started and who has submitted, and nothing else. */
export function ProgressTable({ students, maxAttempts }: ProgressTableProps) {
  return (
    <ScrollRegion label="Progress by student">
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

/** Once closed: each student's status, best attempt, attempts used, and the best attempt by item. */
export function ScoreTable({ items, students, maxAttempts }: ScoreTableProps) {
  return (
    <ScrollRegion label="Scores by student">
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={STICKY_HEAD}>
              Student
            </th>
            <th scope="col" className={`${HEAD} text-left`}>
              Status
            </th>
            {["Best", "Percent", "Attempts used"].map((head) => (
              <th key={head} scope="col" className={`${HEAD} text-right`}>
                {head}
              </th>
            ))}
            {items.map((item) => (
              <th key={item.position} scope="col" className={`${HEAD} text-right`}>
                {`Q${item.position} ${item.ref}`}
              </th>
            ))}
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
              <td className={CELL}>
                {student.best
                  ? `${formatPoints(student.best.score)} / ${formatPoints(student.best.maxScore)}`
                  : formatPoints(null)}
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
