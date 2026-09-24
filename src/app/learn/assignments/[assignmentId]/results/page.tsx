import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClassTime } from "@/components/assignments/ClassTime";
import { AssignmentResults } from "@/components/assignments/results/AssignmentResults";
import { studentAssignmentPath } from "@/lib/assignments/assignments";
import { resultsStore } from "@/lib/assignments/attemptStore";
import { loadResultsPage, type ResultsHeader } from "@/lib/assignments/results";
import { isUuid } from "@/lib/authoring/ids";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { DEFAULT_CLASS_TIME_ZONE, zoneOfClass } from "@/lib/classes/timeZone";
import { requireStudent } from "@/lib/classes/viewer";
import { myClasses } from "@/lib/supabase/classInvites";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Results" };

function Header({
  assignment,
  closed,
  timeZone,
}: {
  assignment: ResultsHeader;
  closed: boolean;
  timeZone: string;
}) {
  return (
    <>
      <p className="mb-2 text-sm text-ink-2">
        <Link href={STUDENT_HOME} className="tap-target inline-flex items-center hover:text-ink-1">
          Your classes
        </Link>
      </p>
      <p className="eyebrow mb-2">Results</p>
      <h1 className="font-read text-3xl break-words text-ink-1">{assignment.title}</h1>
      <p className="mt-2 text-sm text-ink-2">
        {closed ? "Closed " : "Closes "}
        <ClassTime iso={assignment.closesAt} timeZone={timeZone} />
      </p>
    </>
  );
}

/**
 * A student's results for one assignment (#210). Everything is decided on the server by
 * `loadResultsPage`: the submit at close for this student, then their own result through the
 * database, which answers only after the close; only then the items with their keys and
 * rationales. Before the close the page says when results come and carries nothing else. The page
 * uses no Server Action: it is a read.
 */
export default async function StudentResultsPage({
  params,
}: PageProps<"/learn/assignments/[assignmentId]/results">) {
  const { assignmentId } = await params;
  if (!isUuid(assignmentId)) notFound();

  const { supabase, userId } = await requireStudent();
  const [view, classes] = await Promise.all([
    loadResultsPage(resultsStore(supabase, createSupabaseServiceClient()), assignmentId, userId),
    myClasses(supabase),
  ]);

  if (view.kind === "missing") notFound();
  if (view.kind === "failed") {
    return (
      <p role="alert" className="text-ink-2">
        These results could not be loaded. Reload the page to try again.
      </p>
    );
  }
  // #242: the close is said in the class's zone; a student no longer in the class gets the default.
  const classId = view.assignment.classId;
  const timeZone = classId === null ? DEFAULT_CLASS_TIME_ZONE : zoneOfClass(classes, classId);

  if (view.kind === "pending") {
    return (
      <>
        <Header assignment={view.assignment} closed={false} timeZone={timeZone} />
        <p role="status" data-testid="results-pending" className="measure mt-6 text-ink-1">
          Your results will be shown when the assignment closes.
        </p>
        <p className="mt-4 text-sm">
          <Link
            href={studentAssignmentPath(view.assignment.id)}
            className="tap-target inline-flex items-center text-ink-1 underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            Back to the assignment
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <Header assignment={view.assignment} closed timeZone={timeZone} />
      <AssignmentResults
        best={view.best}
        attemptsMade={view.attemptsMade}
        entries={view.entries}
        record={view.record}
      />
    </>
  );
}
