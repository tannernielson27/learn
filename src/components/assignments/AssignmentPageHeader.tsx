import { PageHeader } from "@/components/ui/PageHeader";
import { attemptsLabel } from "@/lib/assignments/assignments";
import type { AssignmentHeader } from "@/lib/assignments/attemptPage";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { ClassTime } from "./ClassTime";

export interface AssignmentPageHeaderProps {
  assignment: Pick<AssignmentHeader, "title" | "closesAt" | "maxAttempts">;
  /** The class's zone, which the close is said in (#242). */
  timeZone: string;
}

/**
 * The top of a student's assignment page (#563): the way home, then the assignment's title on
 * `PageHeader`. What kind of page this is ("Assignment") leads the line under the title in
 * sentence case, beside when it closes and how many attempts it allows, where the public site would
 * set an all-caps eyebrow (docs/04 §11, 2026-11-14). A Server Component: `ClassTime` is formatted
 * by the server.
 */
export function AssignmentPageHeader({ assignment, timeZone }: AssignmentPageHeaderProps) {
  return (
    <PageHeader
      back={{ href: STUDENT_HOME, label: "Back to your classes" }}
      title={assignment.title}
      lead={
        <p className="text-base">
          Assignment · Closes <ClassTime iso={assignment.closesAt} timeZone={timeZone} /> ·{" "}
          {attemptsLabel(assignment.maxAttempts)}
        </p>
      }
    />
  );
}
