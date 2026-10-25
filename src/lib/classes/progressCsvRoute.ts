import { startedElsewhere } from "@/lib/authoring/exportRoute";
import { isUuid } from "@/lib/authoring/ids";
import { authorForRoute } from "@/lib/authoring/session";
import { readClassProgress } from "@/lib/supabase/classProgress";
import { readClass } from "@/lib/supabase/classes";
import { buildClassProgress } from "./progress";
import { classProgressCsv, classProgressCsvFilename } from "./progressCsv";

const NOT_FOUND = "That class was not found.";

/** UTF-8's byte order mark: without it a spreadsheet may read "Zoë" as "ZoÃ«". */
const BOM = "﻿";

const refuse = (status: number, error: string): Response =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Downloads a class's progress grid as CSV for a teacher of the class's workspace, as the session
 * and assignment reports download theirs.
 *
 * The class is read as the teacher first (row level security), so a class of another workspace is
 * answered exactly like an id that never existed; `class_progress` then answers only that same
 * teacher. The file carries students' names, addresses and scores, so it is never cached and
 * never started from another site with the teacher's cookies riding along.
 */
export async function classProgressCsvDownload(
  request: Request,
  classId: string,
  now: Date = new Date(),
): Promise<Response> {
  if (!isUuid(classId)) return refuse(404, NOT_FOUND);
  if (startedElsewhere(request)) return refuse(403, "Download the progress from LeaRN itself.");

  const author = await authorForRoute();
  if (author.status === "signed_out") return refuse(401, "Sign in to download the progress.");
  if (author.status === "forbidden") return refuse(403, "Only teachers can download progress.");

  let csv: string;
  let filename: string;
  try {
    const detail = await readClass(author.supabase, classId);
    if (!detail) return refuse(404, NOT_FOUND);
    const progress = buildClassProgress(await readClassProgress(author.supabase, classId));
    csv = classProgressCsv(progress);
    filename = classProgressCsvFilename(detail.name, now);
  } catch (error) {
    console.error("[class-progress] could not read a class's progress", {
      classId,
      message: error instanceof Error ? error.message : String(error),
    });
    return refuse(500, "The progress could not be read. Try again.");
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
