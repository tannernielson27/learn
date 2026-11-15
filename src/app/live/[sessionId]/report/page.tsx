import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionReportView } from "@/components/live/report/SessionReportView";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { buildSessionReport } from "@/lib/live/report";
import { parseReportView, reportPath, SESSIONS_PATH } from "@/lib/live/reportFormat";
import { readSessionReport } from "@/lib/supabase/sessionReport";

export const metadata: Metadata = { title: "Live session report" };

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
    <main className="mx-auto w-full max-w-wide min-w-0 flex-1 px-4 py-8 md:px-8">
      {read.session.status === "ended" && read.input !== null ? (
        <SessionReportView
          sessionId={sessionId}
          title={read.session.title}
          closedAt={read.session.closedAt}
          report={buildSessionReport(read.input)}
          view={view}
        />
      ) : (
        <>
          <PageHeader
            title={read.session.title}
            back={{ href: SESSIONS_PATH, label: "Back to live sessions" }}
            lead={<p>This live session is still open. Its report is ready when it ends.</p>}
            action={
              <Link href={`/live/${sessionId}`} className={buttonClasses()}>
                Open the live session
              </Link>
            }
          />
        </>
      )}
    </main>
  );
}
