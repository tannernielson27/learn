import { startedElsewhere } from "@/lib/authoring/exportRoute";
import { isUuid } from "@/lib/authoring/ids";
import { authorForRoute } from "@/lib/authoring/session";
import { podiumOfReport, type Podium } from "@/lib/live/podium";
import { buildSessionReport } from "@/lib/live/report";
import { readSessionReport } from "./sessionReport";

const NOT_FOUND = "That live session was not found.";

const answer = (status: number, body: { error: string } | { podium: Podium | null }): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * The top 5 for the projector when a live session ends, for the session's own teacher only.
 *
 * Every read runs as the signed-in teacher, so row level security is the first check: a session in
 * another workspace reads as absent. The second is narrower than the report's: the session must be
 * one this teacher started (`sessions.host_id`), so a colleague's session answers exactly like one
 * that does not exist. The totals are the report's own (`buildSessionReport`); the answer carries
 * display names, places and points, and nothing else of anyone's.
 *
 * Only the teacher's projector asks for it. A student's phone has no author session, so it is
 * refused before anything is read.
 */
export async function sessionPodiumResponse(
  request: Request,
  sessionId: string,
): Promise<Response> {
  if (!isUuid(sessionId)) return answer(404, { error: NOT_FOUND });
  if (startedElsewhere(request)) return answer(403, { error: "Open the live session in LeaRN." });

  const author = await authorForRoute();
  if (author.status === "signed_out") return answer(401, { error: "Sign in to see this." });
  if (author.status === "forbidden") return answer(403, { error: "Only teachers can see this." });

  try {
    const { data: host, error } = await author.supabase
      .from("sessions")
      .select("host_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new Error(`could not read session: ${error.message}`);
    if (host === null || host.host_id !== author.userId) return answer(404, { error: NOT_FOUND });

    const read = await readSessionReport(author.supabase, sessionId);
    if (!read) return answer(404, { error: NOT_FOUND });
    // A session that has not ended is read with no input.
    if (read.session.status !== "ended" || read.input === null) {
      return answer(409, { error: "The top 5 is ready once the live session has ended." });
    }
    return answer(200, { podium: podiumOfReport(buildSessionReport(read.input)) });
  } catch (error) {
    console.error("[podium] could not read a session's scores", {
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return answer(500, { error: "The top 5 could not be read." });
  }
}
