import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { HostLobby } from "@/components/live/HostLobby";
import { SessionQrCode } from "@/components/live/SessionQrCode";
import { liveViewOf, printedJoinUrl } from "@/components/live/stage/liveView";
import { JoinCode } from "@/components/ui/JoinCode";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { joinUrl } from "@/lib/live/routes";
import { pacedState } from "@/lib/live/state";
import { siteOrigin } from "@/lib/http/siteOrigin";
import { readSessionRecords } from "@/lib/supabase/sessionRecord";
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
 * socket and the moves go out over one. See `HostLobby`, which draws the teacher's control view,
 * or with `?view=projector` the projector view of the same live session.
 */
export default async function LiveSessionPage({
  params,
  searchParams,
}: PageProps<"/live/[sessionId]">) {
  const { sessionId } = await params;
  // One route, two views (owner decision 3): `?view=projector` opens the projector view.
  const view = liveViewOf((await searchParams).view);
  if (!isUuid(sessionId)) notFound();

  const { supabase } = await requireAuthor(`/live/${sessionId}`);
  const session = await readHostSession(supabase, sessionId);
  if (!session) notFound();
  // #335: the whole record, for the instructor, with a marker for the class's step. Read with the
  // service role only now that row level security has said the session is this host's. #469: a
  // whole quiz that plays case studies in place has one per case study instead.
  const { record, runs } = await readSessionRecords(createSupabaseServiceClient(), session.id);

  // Built from the request the host made, so a preview deployment's own address ends up in the
  // picture without anything being configured.
  const studentUrl = joinUrl(siteOrigin(await headers()), session.code);

  return (
    <div className="flex flex-1 flex-col">
      <HostLobby
        sessionId={session.id}
        title={session.title}
        code={session.code}
        studentUrl={studentUrl}
        view={view}
        // Drawn here, on the server, and handed over as markup, so the encoder stays out of the
        // console's bundle (#297).
        qrCode={<SessionQrCode url={studentUrl} label="QR code for joining this live session" />}
        stageJoin={
          <JoinCode
            code={session.code}
            url={printedJoinUrl(studentUrl)}
            qrUrl={studentUrl}
            size="stage"
            className="justify-between"
          />
        }
        caseStudy={session.caseStudy}
        {...(record === null ? {} : { record })}
        {...(runs.length === 0 ? {} : { runs })}
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
    </div>
  );
}
