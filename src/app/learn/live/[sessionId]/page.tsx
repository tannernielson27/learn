import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClassTime } from "@/components/assignments/ClassTime";
import { LiveSessionResults } from "@/components/learn/LiveSessionResults";
import { Notice } from "@/components/ui/Notice";
import { PageWidth } from "@/components/ui/PageWidth";
import { isUuid } from "@/lib/authoring/ids";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { DEFAULT_CLASS_TIME_ZONE, zoneOfClass } from "@/lib/classes/timeZone";
import { requireStudent } from "@/lib/classes/viewer";
import { loadLiveResultPage } from "@/lib/learn/liveResultPage";
import { liveResultsStore } from "@/lib/learn/liveResultsStore";
import { myClasses } from "@/lib/supabase/classInvites";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Results" };

/**
 * A student's own results for one ended live session. Everything is decided on the server by
 * `loadLiveResultPage`: their own result through the database, which answers only for a session
 * that has ended and a participant linked to them; only then the questions with their keys and
 * rationales. A session still running, one they did not join signed in for their class, someone
 * else's and one that does not exist are all the same not-found. The page uses no Server Action:
 * it is a read. The phone a live session is played on never imports any of this.
 */
export default async function StudentLiveResultsPage({
  params,
}: PageProps<"/learn/live/[sessionId]">) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) notFound();

  const { supabase } = await requireStudent();
  const [view, classes] = await Promise.all([
    loadLiveResultPage(liveResultsStore(supabase, createSupabaseServiceClient), sessionId),
    myClasses(supabase),
  ]);

  if (view.kind === "missing") notFound();
  if (view.kind === "failed") {
    return <Notice role="alert">These results did not load. Reload the page.</Notice>;
  }

  const { header } = view;
  // The end is said in the class's zone; a student no longer in the class gets the default.
  const timeZone =
    header.classId === null ? DEFAULT_CLASS_TIME_ZONE : zoneOfClass(classes, header.classId);

  return (
    <PageWidth width="wide">
      <p className="mb-2 text-sm text-ink-2">
        <Link href={STUDENT_HOME} className="tap-target inline-flex items-center hover:text-ink-1">
          Your classes
        </Link>
      </p>
      <p className="eyebrow mb-2">Live session results</p>
      <h1 className="font-read text-display leading-tight break-words text-ink-1">
        {header.title}
      </h1>
      <p className="mt-2 text-sm text-ink-2">
        {header.className ? `${header.className} · ` : null}
        {header.closedAt ? (
          <>
            Ended <ClassTime iso={header.closedAt} timeZone={timeZone} />
          </>
        ) : (
          "Ended"
        )}
      </p>
      <LiveSessionResults entries={view.entries} />
    </PageWidth>
  );
}
