import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HostLobby } from "@/components/live/HostLobby";
import { SessionQrCode } from "@/components/live/SessionQrCode";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { joinUrl } from "@/lib/live/routes";
import { pacedState } from "@/lib/live/state";
import { siteOrigin } from "@/lib/http/siteOrigin";
import { readSessionRecord } from "@/lib/supabase/sessionRecord";
import { readHostSession } from "@/lib/supabase/sessions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Live session" };

/**
 * The instructor's console.
 *
 * Everything decided here is decided on the server: that the caller is signed in, that the session
 * is theirs (row level security, not a check in this file), and what the room was doing a moment
 * ago. That first state is handed to the client component so a projector has the join code and the
 * room's status on the screen before any script has run.
 *
 * The lobby itself is a Client Component because a lobby is a live thing — presence arrives over a
 * socket and the moves go out over one. See `HostLobby`.
 */
export default async function LiveSessionPage({ params }: PageProps<"/live/[sessionId]">) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) notFound();

  const { supabase } = await requireAuthor(`/live/${sessionId}`);
  const session = await readHostSession(supabase, sessionId);
  if (!session) notFound();
  // #335: the whole record, for the instructor, with a marker for the class's step. Read with the
  // service role only now that row level security has said the session is this host's.
  const record = session.caseStudy
    ? await readSessionRecord(createSupabaseServiceClient(), session.id)
    : null;

  // Built from the request the host made, so a preview deployment's own address ends up in the
  // picture without anything being configured.
  const studentUrl = joinUrl(siteOrigin(await headers()), session.code);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <p className="mb-2 flex flex-wrap justify-between gap-x-4 text-sm text-ink-2">
        <Link href="/author" className="tap-target inline-flex items-center hover:text-ink-1">
          Back to library
        </Link>
        {/* #414: what each control does is in the guide, not in a paragraph under the control. */}
        <Link
          href="/help/instructor#live"
          className="tap-target inline-flex items-center hover:text-ink-1"
        >
          Help
        </Link>
      </p>
      <HostLobby
        sessionId={session.id}
        title={session.title}
        code={session.code}
        studentUrl={studentUrl}
        // Drawn here, on the server, and handed over as markup, so the encoder stays out of the
        // console's bundle (#297).
        qrCode={
          <SessionQrCode
            url={studentUrl}
            label="QR code for joining this live session"
            className="mx-auto mt-6 block h-auto w-40 rounded-sm border border-line sm:w-48 lg:mt-8 lg:w-72"
          />
        }
        caseStudy={session.caseStudy}
        {...(record === null ? {} : { record })}
        initial={pacedState(
          {
            status: session.status,
            position: session.position,
            itemCount: session.itemCount,
            reveal: session.reveal,
            timer: session.timer,
          },
          session.mode,
        )}
      />
    </main>
  );
}
