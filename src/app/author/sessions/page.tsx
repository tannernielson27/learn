import type { Metadata } from "next";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { SessionList } from "@/components/live/report/SessionList";
import { Notice } from "@/components/ui/Notice";
import { requireAuthor } from "@/lib/authoring/session";
import { SESSIONS_PATH } from "@/lib/live/reportFormat";
import { listRecentSessions } from "@/lib/supabase/sessionReport";

export const metadata: Metadata = { title: "Live sessions" };

/** The org's recent live sessions, newest first (#186). Row level security keeps it to the org. */
export default async function SessionsPage() {
  const { supabase } = await requireAuthor(SESSIONS_PATH);
  const sessions = await listRecentSessions(supabase);

  return (
    <ReadingWidth>
      <h1 className="mb-6 font-read text-3xl text-ink-1">Live sessions</h1>
      {sessions === null ? (
        <Notice role="alert">
          Live sessions could not be loaded. Reload the page to try again.
        </Notice>
      ) : (
        <SessionList sessions={sessions} />
      )}
    </ReadingWidth>
  );
}
