import { startedElsewhere } from "@/lib/authoring/exportRoute";
import { isUuid } from "@/lib/authoring/ids";
import { authorForRoute } from "@/lib/authoring/session";
import { reportCsvFilename } from "@/lib/live/reportCsv";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { assignmentReportStore } from "./attemptStore";
import { assignmentReportCsv } from "./reportCsv";
import { loadAssignmentReport } from "./reportLoader";

const NOT_FOUND = "That assignment report was not found.";

/** UTF-8's byte order mark: without it a spreadsheet may read "Zoë" as "ZoÃ«". */
const BOM = "﻿";

const refuse = (status: number, error: string): Response =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Downloads a closed assignment's report as CSV (#211) for an author of the assignment's org.
 *
 * The author check comes first; the assignment is then read as that author (row level security),
 * so one in another org answers exactly like an id that never existed, and only after that does the
 * submit at close run. While the assignment is open there are no scores to download (409). The file
 * carries names and scores, so it is never cached and never started from another site.
 */
export async function assignmentReportCsvDownload(
  request: Request,
  assignmentId: string,
): Promise<Response> {
  if (!isUuid(assignmentId)) return refuse(404, NOT_FOUND);
  if (startedElsewhere(request)) return refuse(403, "Download the report from LeaRN itself.");

  const author = await authorForRoute();
  if (author.status === "signed_out") return refuse(401, "Sign in to download the report.");
  if (author.status === "forbidden") return refuse(403, "Only instructors can download reports.");

  let loaded: Awaited<ReturnType<typeof loadAssignmentReport>>;
  try {
    const store = assignmentReportStore(author.supabase, createSupabaseServiceClient());
    loaded = await loadAssignmentReport(store, assignmentId, new Date());
  } catch (error) {
    console.error("[assignment-report] could not read an assignment report", {
      assignmentId,
      message: error instanceof Error ? error.message : String(error),
    });
    return refuse(500, "The report could not be read. Try again.");
  }
  if (!loaded) return refuse(404, NOT_FOUND);
  if (!loaded.report.released) {
    return refuse(409, "Scores are ready once the assignment has closed.");
  }

  const filename = reportCsvFilename(loaded.assignment.title, loaded.assignment.closesAt);
  let csv: string;
  try {
    csv = assignmentReportCsv(loaded.report);
  } catch (error) {
    console.error("[assignment-report] could not write an assignment report", {
      assignmentId,
      message: error instanceof Error ? error.message : String(error),
    });
    return refuse(500, "The report could not be read. Try again.");
  }
  return new Response(BOM + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
