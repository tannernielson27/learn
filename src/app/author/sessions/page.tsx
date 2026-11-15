import type { Metadata } from "next";
import Link from "next/link";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { SessionFilterBar } from "@/components/live/report/SessionFilterBar";
import { ManagedSessionList } from "@/components/live/report/ManagedSessionList";
import { SessionList } from "@/components/live/report/SessionList";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAuthor } from "@/lib/authoring/session";
import { SESSIONS_PATH } from "@/lib/live/reportFormat";
import {
  groupSessionsByDate,
  isFiltered,
  parseSessionFilters,
  SESSION_PAGE,
  SESSION_SHOW_MAX,
  sessionsHref,
} from "@/lib/live/sessionFilters";
import { listRecentSessions } from "@/lib/supabase/sessionReport";

export const metadata: Metadata = { title: "Live sessions" };

/**
 * The org's live sessions, newest first (#186), searchable and filterable from the address
 * (#565). Row level security keeps it to the org; "Mine" narrows it to the signed-in host.
 */
export default async function SessionsPage({ searchParams }: PageProps<"/author/sessions">) {
  const filters = parseSessionFilters(await searchParams);
  const { supabase, userId } = await requireAuthor(sessionsHref(filters));
  // One row past what is shown says whether there is more, without a second count query.
  const rows = await listRecentSessions(supabase, {
    q: filters.q,
    status: filters.status,
    hostId: filters.who === "mine" ? userId : null,
    limit: filters.show + 1,
  });
  const filtered = isFiltered(filters);

  return (
    <ReadingWidth>
      <PageHeader title="Live sessions" className="mb-6" />
      {rows === null ? (
        <Notice role="alert">
          Live sessions could not be loaded. Reload the page to try again.
        </Notice>
      ) : rows.length === 0 && !filtered ? (
        // Nothing has ever run: the first-use state, with no search bar over an empty page.
        <SessionList sessions={[]} />
      ) : (
        <>
          <SessionFilterBar filters={filters} />
          {rows.length === 0 ? (
            <EmptyState
              variant="no-results"
              heading={
                filters.q !== ""
                  ? `No live sessions match “${filters.q}”.`
                  : filters.status === "archived"
                    ? "No archived live sessions."
                    : "No live sessions match these filters."
              }
              action={{ href: SESSIONS_PATH, label: "Clear filters" }}
            />
          ) : (
            <>
              <ManagedSessionList
                viewerId={userId}
                archivedView={filters.status === "archived"}
                groups={groupSessionsByDate(rows.slice(0, filters.show), new Date())}
              />
              {rows.length > filters.show && filters.show < SESSION_SHOW_MAX ? (
                <p className="mt-6">
                  <Link
                    href={sessionsHref({ ...filters, show: filters.show + SESSION_PAGE })}
                    scroll={false}
                    className={buttonClasses({ variant: "secondary" })}
                  >
                    Show more
                  </Link>
                </p>
              ) : null}
            </>
          )}
        </>
      )}
    </ReadingWidth>
  );
}
