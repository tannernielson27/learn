import { startedElsewhere } from "@/lib/authoring/exportRoute";
import { isUuid } from "@/lib/authoring/ids";
import { authorForRoute } from "@/lib/authoring/session";
import { buildSessionReport } from "@/lib/live/report";
import { reportCsvFilename, sessionReportCsv } from "@/lib/live/reportCsv";
import { readSessionReport } from "@/lib/supabase/sessionReport";

const NOT_FOUND = "That session report was not found.";

/** UTF-8's byte order mark: without it a spreadsheet may read "Zoë" as "ZoÃ«". */
const BOM = "﻿";

const refuse = (status: number, error: string): Response =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Downloads an ended session's report as CSV (#186) for an author of the session's org.
 *
 * Row level security is the access check: `readSessionReport` runs as the author, and a session in
 * another org reads as absent, so it is answered exactly like an id that never existed. The file
 * carries students' display names and scores, so it is never cached and never started from another
 * site with the author's cookies riding along.
 */
export async function reportCsvDownload(request: Request, sessionId: string): Promise<Response> {
  if (!isUuid(sessionId)) return refuse(404, NOT_FOUND);
  if (startedElsewhere(request)) return refuse(403, "Download the report from LeaRN itself.");

  const author = await authorForRoute();
  if (author.status === "signed_out") return refuse(401, "Sign in to download the report.");
  if (author.status === "forbidden") return refuse(403, "Only instructors can download reports.");

  let read: Awaited<ReturnType<typeof readSessionReport>>;
  try {
    read = await readSessionReport(author.supabase, sessionId);
  } catch (error) {
    console.error("[report] could not read a session report", {
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return refuse(500, "The report could not be read. Try again.");
  }
  if (!read) return refuse(404, NOT_FOUND);
  if (read.session.status !== "ended") {
    return refuse(409, "The report is ready once the session has ended.");
  }

  const csv = sessionReportCsv(buildSessionReport(read.input));
  const filename = reportCsvFilename(read.session.title, read.session.closedAt);
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
