import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssignmentReportView } from "@/components/assignments/report/AssignmentReportView";
import { assignmentReportPath } from "@/lib/assignments/assignments";
import { assignmentReportStore } from "@/lib/assignments/attemptStore";
import { loadAssignmentReport } from "@/lib/assignments/reportLoader";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { parseReportView } from "@/lib/live/reportFormat";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Assignment report" };

/**
 * An assignment's report (#211), for any author in the assignment's org.
 *
 * The assignment is read as the author, so one in another org is a 404 exactly like an id that
 * never existed. Once it has closed, attempts left open are submitted before the scores are read;
 * while it is open the report is progress only (see `loadAssignmentReport`).
 */
export default async function AssignmentReportPage({
  params,
  searchParams,
}: PageProps<"/author/assignments/[assignmentId]/report">) {
  const { assignmentId } = await params;
  if (!isUuid(assignmentId)) notFound();
  const view = parseReportView((await searchParams).view);
  const { supabase } = await requireAuthor(assignmentReportPath(assignmentId, view));

  const loaded = await loadAssignmentReport(
    assignmentReportStore(supabase, createSupabaseServiceClient()),
    assignmentId,
    new Date(),
  );
  if (!loaded) notFound();

  return (
    <AssignmentReportView
      assignmentId={assignmentId}
      classId={loaded.assignment.classId}
      title={loaded.assignment.title}
      closesAt={loaded.assignment.closesAt}
      maxAttempts={loaded.assignment.maxAttempts}
      report={loaded.report}
      view={view}
    />
  );
}
