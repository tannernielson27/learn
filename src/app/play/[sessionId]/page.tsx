import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CaseStudyLayout } from "@/components/live/CaseStudyLayout";
import { StudentRoom } from "@/components/live/StudentRoom";
import { isUuid } from "@/lib/authoring/ids";
import { PARTICIPANT_COOKIE, parseParticipantToken } from "@/lib/live/participantToken";
import { JOIN_PATH } from "@/lib/live/routes";
import { mintChannelToken, readChannelSigningKey } from "@/lib/supabase/channelToken";
import { resumeParticipant } from "@/lib/supabase/participants";
import { readSessionRecord } from "@/lib/supabase/sessionRecord";
import { readPublicSessionState } from "@/lib/supabase/sessions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Session" };

/**
 * Where a participant lands, and where a reload — and every reconnect — brings them back to.
 *
 * #129 owns everything above the fold here: the token is read from the httpOnly cookie, checked
 * against the database, and turned back into the same participant, or the person is sent to the
 * join form. Nothing is rendered from the cookie itself; the name shown is the one the database
 * holds.
 *
 * #132 adds the room. The four facts the phone starts from are read here rather than waited for,
 * because Realtime delivers *changes* and replays nothing: a student who opens their phone into a
 * room already on item four would otherwise sit on a blank screen until the host happened to move.
 * Everything after that first paint arrives over the channel, and a reconnect re-runs this render
 * through `router.refresh()`.
 *
 * No answer key, no item and no item set reaches this page (ADR 0003). `resume_participant`
 * returns a name and a session's status, mode and title; `readPublicSessionState` returns four
 * numbers and a boolean. There is nothing else here to leak.
 *
 * #184 adds one thing, for a session run from a case study: the patient record it was started
 * with, which the phone shows beside every step. A record is not answer-bearing (the six steps'
 * keys live on their items and still arrive one step at a time, at the reveal), and
 * `readSessionRecord` reads that one column and parses it before it leaves the server.
 */
export default async function PlaySessionPage({ params }: PageProps<"/play/[sessionId]">) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) redirect(JOIN_PATH);

  const token = parseParticipantToken((await cookies()).get(PARTICIPANT_COOKIE)?.value);
  // A token for another session is not this page's token. Joining a new room replaces the old
  // one, so the honest answer is the join form rather than someone else's lobby.
  if (!token || token.sessionId !== sessionId) redirect(JOIN_PATH);

  const service = createSupabaseServiceClient();
  const participant = await resumeParticipant(service, token);
  if (!participant) redirect(JOIN_PATH);

  // Only ever after the token has been checked: this read does no checking of its own.
  const state = await readPublicSessionState(service, sessionId);
  if (!state) redirect(JOIN_PATH);
  // Also only after the token has been checked. Null for a session run from a bank.
  const record = await readSessionRecord(service, sessionId);

  // #149: the token this phone's socket opens the session's private channel with. Minted only
  // here, after `resume_participant` has matched the cookie, and only for the session and the
  // participant it matched — so it says nothing the cookie did not already prove. It is not a
  // credential any route accepts; Realtime is its only reader.
  const channel = mintChannelToken(
    { sessionId, participantId: participant.participantId },
    readChannelSigningKey(),
  );

  return (
    <CaseStudyLayout record={record}>
      <StudentRoom
        sessionId={sessionId}
        title={participant.title}
        displayName={participant.displayName}
        participantId={participant.participantId}
        // From `public.participants`, not from the phone: a browser that could choose its own
        // join time could choose its place at the front of the class.
        joinedAt={participant.joinedAt}
        initial={state}
        channel={channel}
      />
    </CaseStudyLayout>
  );
}
