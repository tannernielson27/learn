import { assignmentReportCsvDownload } from "@/lib/assignments/reportCsvRoute";

/** Downloads a closed assignment's report as CSV (#211). See assignmentReportCsvDownload. */
export async function GET(
  request: Request,
  context: RouteContext<"/author/assignments/[assignmentId]/report/csv">,
): Promise<Response> {
  const { assignmentId } = await context.params;
  return assignmentReportCsvDownload(request, assignmentId);
}
