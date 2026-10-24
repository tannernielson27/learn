import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CaseStudyLayout } from "@/components/live/CaseStudyLayout";
import { StudentPacedRoom } from "@/components/live/StudentPacedRoom";
import { StudentRoom } from "@/components/live/StudentRoom";
import { isUuid } from "@/lib/authoring/ids";
import { PARTICIPANT_COOKIE, parseParticipantToken } from "@/lib/live/participantToken";
import { JOIN_PATH } from "@/lib/live/routes";
import { pacedState } from "@/lib/live/state";
import { mintChannelToken, readChannelSigningKey } from "@/lib/supabase/channelToken";
import { roomRecord } from "@/lib/liveSupabase/viewEntries";
import { checkParticipant } from "@/lib/supabase/participants";
import { readSessionRecords } from "@/lib/supabase/sessionRecord";
import { readPublicSessionState } from "@/lib/supabase/sessions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Live session" };

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
 * Everything after that first paint arrives over the channel or the phone's own reads of the view;
 * a reconnect re-reads the view and does not re-run this render (#481). A refusal does, through
 * `router.refresh()`, and so does the error screen's Try again.
 *
 * No answer key, no item and no item set reaches this page (ADR 0003). `resume_participant`
 * returns a name and a session's status, mode and title; `readPublicSessionState` returns four
 * numbers and a boolean. There is nothing else here to leak.
 *
 * #184 adds one thing, for a session run from a case study: the patient record it was started
 * with, which the phone shows beside every step (and, since #469, beside each step of a case
 * study a whole quiz plays in place). A record is not answer-bearing (the six steps'
 * keys live on their items and still arrive one step at a time, at the reveal), and
 * `readSessionRecord` reads that one column and parses it before it leaves the server. Since #335
 * the page is handed only the chart at the room's step; each later step's arrives in the view the
 * phone fetches when the host moves.
 */
export default async function PlaySessionPage({ params }: PageProps<"/play/[sessionId]">) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) redirect(JOIN_PATH);

  const token = parseParticipantToken((await cookies()).get(PARTICIPANT_COOKIE)?.value);
  // A token for another session is not this page's token. Joining a new room replaces the old
  // one, so the honest answer is the join form rather than someone else's lobby.
  if (!token || token.sessionId !== sessionId) redirect(JOIN_PATH);

  const service = createSupabaseServiceClient();
  const checked = await checkParticipant(service, token);
  // #407: a database that did not answer has not said this person left the room. Sending them to
  // the join form for it took a student out of a class over one timed-out request; thrown, it
  // lands on this route's error screen, whose "Try again" runs this render once more.
  if (!checked.ok && checked.reason === "unavailable") {
    throw new Error("The session could not be reached to check a participant.");
  }
  if (!checked.ok) redirect(JOIN_PATH);
  const { participant } = checked;

  // Only ever after the token has been checked: this read does no checking of its own. A read that
  // failed throws, onto the error screen as above; only a session that is not there is null.
  const read = await readPublicSessionState(service, sessionId);
  if (!read) redirect(JOIN_PATH);
  // #185: how the room is paced is `resume_participant`'s answer, and it picks the screen. A case
  // study on its own always runs instructor-paced (`sessions_student_paced_bank_only`).
  const state = pacedState(read, participant.mode);
  const Room = participant.mode === "student_paced" ? StudentPacedRoom : StudentRoom;
  // Also only after the token has been checked. Null for a session run from a bank. #335: cut to
  // the step the room is on by `roomRecord`, the same function the view route uses, so what an
  // author holds back for a later step is not in this page's HTML or its Flight payload. #469: a
  // quiz that plays case studies in place has a chart only on their steps, so the layout is the
  // record's from the start and the chart comes and goes with the room; a student-paced room's
  // charts arrive with its set.
  const { record: whole, runs } = await readSessionRecords(service, sessionId);
  const changing = runs.length > 0;
  const record =
    participant.mode === "student_paced" && changing
      ? null
      : (roomRecord(whole, read.position, runs) ?? null);

  // #149: the token this phone's socket opens the session's private channel with. Minted only
  // here, after `resume_participant` has matched the cookie, and only for the session and the
  // participant it matched — so it says nothing the cookie did not already prove. It is not a
  // credential any route accepts; Realtime is its only reader.
  const channel = mintChannelToken(
    { sessionId, participantId: participant.participantId },
    readChannelSigningKey(),
  );

  return (
    <CaseStudyLayout record={record} changing={changing}>
      <Room
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
