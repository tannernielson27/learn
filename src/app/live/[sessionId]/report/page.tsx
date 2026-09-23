import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionReportView } from "@/components/live/report/SessionReportView";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { buildSessionReport } from "@/lib/live/report";
import { parseReportView, reportPath, SESSIONS_PATH } from "@/lib/live/reportFormat";
import { readSessionReport } from "@/lib/supabase/sessionReport";

export const metadata: Metadata = { title: "Session report" };

/**
 * An ended session's report (#186), for any author in the session's org.
 *
 * Row level security is the access check: every read runs as the signed-in author, and a session
 * in another org reads as absent, so it is a 404 exactly like an id that never existed. A session
 * that is still open has no report yet; the page says so and points back at its console.
 */
export default async function SessionReportPage({
  params,
  searchParams,
}: PageProps<"/live/[sessionId]/report">) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) notFound();
  const view = parseReportView((await searchParams).view);

  const { supabase } = await requireAuthor(reportPath(sessionId, view));
  const read = await readSessionReport(supabase, sessionId);
  if (!read) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 py-8">
      {read.session.status === "ended" ? (
        <SessionReportView
          sessionId={sessionId}
          title={read.session.title}
          closedAt={read.session.closedAt}
          report={buildSessionReport(read.input)}
          view={view}
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-2">
            <Link
              href={SESSIONS_PATH}
              className="tap-target inline-flex items-center hover:text-ink-1"
            >
              Back to sessions
            </Link>
          </p>
          <h1 className="font-read text-3xl break-words text-ink-1">{read.session.title}</h1>
          <p className="mt-4 text-ink-2">
            This session is still open. Its report is ready once the session has ended.
          </p>
          <p className="mt-4">
            <Link
              href={`/live/${sessionId}`}
              className="tap-target inline-flex items-center font-medium text-accent-ink hover:underline"
            >
              Open the session console
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
