import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/authoring/ids";
import { PARTICIPANT_COOKIE, parseParticipantToken } from "@/lib/live/participantToken";
import { JOIN_PATH } from "@/lib/live/routes";
import { resumeParticipant } from "@/lib/supabase/participants";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { SessionStatus } from "@/lib/supabase/sessions";

export const metadata: Metadata = { title: "Session" };

/**
 * Where a participant lands, and where a reload brings them back to.
 *
 * #132 replaces the body of this page with the lobby — the roster, the waiting state and the
 * transport subscription. What #129 owns is everything above that: the token is read from the
 * cookie, checked against the database, and turned back into the same participant, or the person
 * is sent to the join form. Nothing here is rendered from the cookie itself; the name shown is
 * the one the database holds.
 *
 * No answer key, no item and no item set reaches this page (ADR 0003): `resume_participant`
 * returns a name and a session's status, mode and title, and that is all there is to render.
 */
const WAITING: Record<SessionStatus, string> = {
  lobby: "You are in. Wait here — your instructor starts the session from the front.",
  running: "The session is under way. The first item will appear here.",
  paused: "The session is paused. It will pick up where it left off.",
  ended: "This session has ended.",
};

export default async function PlaySessionPage({ params }: PageProps<"/play/[sessionId]">) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) redirect(JOIN_PATH);

  const token = parseParticipantToken((await cookies()).get(PARTICIPANT_COOKIE)?.value);
  // A token for another session is not this page's token. Joining a new room replaces the old
  // one, so the honest answer is the join form rather than someone else's lobby.
  if (!token || token.sessionId !== sessionId) redirect(JOIN_PATH);

  const participant = await resumeParticipant(createSupabaseServiceClient(), token);
  if (!participant) redirect(JOIN_PATH);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
      <p className="eyebrow mb-2">Live session</p>
      <h1 className="font-read text-3xl break-words text-ink-1">{participant.title}</h1>
      <p className="mt-6 text-ink-2">
        Joined as{" "}
        <span className="font-medium break-words text-ink-1">{participant.displayName}</span>
      </p>
      <p className="mt-2 text-ink-2">{WAITING[participant.sessionStatus]}</p>
    </main>
  );
}
