import { reportCsvDownload } from "@/lib/liveSupabase/reportCsvRoute";

/** Downloads an ended session's report as CSV (#186). See reportCsvDownload. */
export async function GET(
  request: Request,
  context: RouteContext<"/live/[sessionId]/report/csv">,
): Promise<Response> {
  const { sessionId } = await context.params;
  return reportCsvDownload(request, sessionId);
}
