"use client";

import { useState } from "react";
import { AnswerSentLine } from "@/components/live/AnswerSentLine";
import { LIVE_BUSY_LABEL, liveSubmitFailure } from "@/components/live/liveSubmit";
import { PhoneHeader } from "@/components/live/phone/PhoneHeader";
import {
  PhoneEnded,
  PhoneMessage,
  PhoneRefused,
  PhoneWaiting,
} from "@/components/live/phone/PhoneStates";
import { ReconnectingBanner } from "@/components/live/phone/ReconnectingBanner";
import { RevealedItem, refuseSecondAnswer } from "@/components/live/phone/RevealedItem";
import { useAnswersClosed } from "@/components/live/phone/useAnswersClosed";
import { useStudentRoom } from "@/components/live/phone/useStudentRoom";
import { RoomCount } from "@/components/live/RoomCount";
import { ActionBar } from "@/components/question/ActionBar";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { Button } from "@/components/ui/Button";
// Module by module rather than through `@/lib/live` and `@/lib/liveSupabase`: those barrels
// value-export the in-memory room and the host console, both of which hold items with their keys
// and import the scoring engine. This is the one screen a student loads, so it takes only what it
// uses (ADR 0003, `src/components/question/noClientScoring.test.ts`).
import type { LiveSessionState } from "@/lib/live/state";
import type { LiveConnection } from "@/lib/live/transport";
import { phoneView, type PhoneSettledView } from "@/lib/live/views";
import type { RoomConnection, SupabaseParticipant } from "@/lib/liveSupabase/participantTransport";
import type { ChannelCredential } from "@/lib/liveSupabase/wire";

export { RevealedItem, refuseSecondAnswer };

export interface StudentRoomProps {
  sessionId: string;
  title: string;
  /** The name the database holds, never the one in the cookie. */
  displayName: string;
  participantId: string;
  /** Epoch milliseconds from the server's clock, so the roster has an order. */
  joinedAt: number;
  /** What the server read a moment ago; the first paint, before any socket opens. */
  initial: LiveSessionState;
  /**
   * This phone's first Realtime channel token, minted by the page's server render after the
   * participant cookie was checked (#149). Later ones come from `POST /api/live/channel`.
   */
  channel: ChannelCredential;
  /** Injectable so this can be driven without Supabase. The page passes nothing. */
  connect?: () => SupabaseParticipant;
}

const SENT = "Answer sent";
const SENT_NEXT = "Wait for the answer to show.";
const LATE = "Your answer was not taken.";
const CLOSED = "Time is up. Wait for the answer.";

/**
 * The room's connection in the words the phone's states use. Still connecting is shown as
 * connected: the first paint is the server's own, and a banner over it would only flash.
 */
function liveConnection(connection: RoomConnection): LiveConnection {
  return connection === "reconnecting" ? "reconnecting" : "connected";
}

/**
 * A student's phone during a live session (#132, #133), in the named states of `phoneView`
 * (`src/lib/live/views.ts`, PLAN §5.6): waiting, answering, answer sent, answer showing, paused,
 * ended, reconnecting over any of them, and refused. One sentence each, at most one action.
 *
 * **The renderer is the same one every time.** Answering, sent, and — once the host reveals —
 * the key with this phone's own marks, or the key alone for a phone that did not answer (#181).
 * All are `ItemPlayer`, keyed so each is its own mount, in its NCLEX layout: this screen frames
 * the question (header, clock, states) and never restyles it.
 *
 * **Where the key is.** Not on this phone until the host reveals it. The item comes from
 * `/api/live/view` with `answerKey`, `rationale` and `scoring` stripped on the server, and
 * `ParticipantItem` brands all three `never`; `phoneView` strips them again. The answer goes to
 * `/api/live/submit`, which scores it beside the key and answers with no marks (ADR 0003).
 *
 * **Reconnecting** keeps the question on screen with the draft in it and Submit live, under a
 * dark banner (PLAN §5.7): the answer goes over plain HTTP, so a Wi-Fi blip on the socket is no
 * reason to lose it.
 *
 * **Time up.** Submit stays through the server's grace after zero; once the grace is over (the
 * same `timeIsUp` the server refuses on, on the session's clock) the draft stays on screen,
 * read-only, and the bar where Submit was says to wait for the answer.
 *
 * Built at 375px: one column, nothing wider than the screen, long names wrap.
 */
export function StudentRoom(props: StudentRoomProps) {
  const { title, displayName } = props;
  const room = useStudentRoom(props);
  const { state, item, answered, connection, history } = room;

  const refused = connection === "refused" && state.status !== "ended";
  const view = phoneView({
    state,
    item,
    answered,
    revealed: room.revealed,
    connection: liveConnection(connection),
    refused,
    joined: 1,
    now: room.serverNow(),
  });
  const settled: PhoneSettledView | null =
    view.phase === "refused" ? null : view.phase === "reconnecting" ? view.underneath : view;
  const reconnecting = view.phase === "reconnecting";

  const progressLabel =
    settled !== null && "place" in settled && settled.place.position !== null
      ? `Question ${settled.place.position} of ${settled.place.itemCount}`
      : null;
  // The clock belongs on a question with no key showing, a paused one included (it holds still).
  const clocked =
    settled !== null &&
    item !== null &&
    ["answering", "answerSent", "timeUp", "paused"].includes(settled.phase)
      ? state.timer
      : null;

  return (
    <div className="flex flex-1 flex-col">
      {reconnecting ? <ReconnectingBanner /> : null}
      <PhoneHeader
        progress={progressLabel}
        title={title}
        connection={liveConnection(connection)}
        timer={clocked}
        serverNow={room.serverNow}
        {...(settled?.phase === "answerShowing" ? { badge: "Answer showing" } : {})}
      />
      {settled === null ? (
        <PhoneRefused />
      ) : (
        <Body settled={settled} room={room} displayName={displayName} history={history.entries} />
      )}
    </div>
  );
}

function Body({
  settled,
  room,
  displayName,
  history,
}: {
  settled: PhoneSettledView;
  room: ReturnType<typeof useStudentRoom>;
  displayName: string;
  history: ReturnType<typeof useStudentRoom>["history"]["entries"];
}) {
  const { item, answered, state } = room;
  /**
   * Whether this phone has heard the room once: the transport measures the session's clock from
   * the view that sets it `"live"`, and until then `serverNow` is this phone's own (#482 review).
   */
  const [clockKnown, setClockKnown] = useState(false);
  if (!clockKnown && room.connection === "live") setClockKnown(true);
  const closed = useAnswersClosed(state.timer, room.serverNow, clockKnown);

  switch (settled.phase) {
    case "waiting":
      return (
        <PhoneWaiting
          headline={settled.headline}
          displayName={displayName}
          present={room.present}
        />
      );
    case "ended":
      return (
        <PhoneEnded headline={settled.headline} history={history} itemCount={state.itemCount} />
      );
    case "paused":
      return (
        <PhoneMessage heading={settled.headline}>
          <p className="text-ink-2">
            {settled.answered ? "Your answer is in." : "Your answer so far is kept."} Wait for your
            teacher to carry on.
          </p>
          <RoomCount present={room.present} />
        </PhoneMessage>
      );
    case "answerShowing":
      if (item === null || settled.revealed === null) {
        // The key is up but this phone has not fetched it yet: no Submit over an answer that is
        // already on the board.
        return <PhoneMessage heading="The answer is showing." />;
      }
      return (
        <>
          <RevealedItem item={item} answered={answered} revealed={settled.revealed} />
          <p className="pb-6 text-center text-sm text-ink-2">
            The next question appears when your teacher moves on.
          </p>
        </>
      );
    case "answerSent":
      if (item === null || answered === null) return null;
      return (
        // A plain wrapper, as in StudentPacedRoom: the player inside is already the "Your answer"
        // landmark, and a second region of that name fails axe's landmark-unique (#274).
        <div className="mt-5">
          <AnswerSentLine text={SENT} detail={SENT_NEXT} announce />
          <ItemPlayer
            key={`${item.id}:sent`}
            item={item}
            // Review, not feedback: the key stays on the server until the host reveals it.
            initialMode="review"
            initialResponse={answered.response}
            submit={refuseSecondAnswer}
            label="Your answer"
          />
        </div>
      );
    // Time up keeps Submit for the server's grace after zero: the header's clock says the time
    // is up. Past the grace the server would refuse it, so the draft is drawn read-only and the
    // bar says so before anyone presses; a refusal that lands anyway puts up "Time is up" below.
    case "timeUp":
    case "answering":
      if (item === null) {
        return <PhoneMessage heading="The live session is under way." />;
      }
      if (room.late) {
        return (
          <PhoneMessage heading="Time is up">
            <p role="status" data-testid="answer-late" className="text-ink-2">
              {LATE}
            </p>
          </PhoneMessage>
        );
      }
      if (closed) {
        return (
          <div className="mt-5">
            <ItemPlayer
              key={`${item.id}:closed`}
              item={item}
              // Review, not feedback: what was chosen stays, and nothing is marked.
              initialMode="review"
              initialResponse={room.draft}
              submit={refuseSecondAnswer}
              label="Your answer"
            />
            <HeldSubmit reason={CLOSED} />
          </div>
        );
      }
      return (
        <div className="mt-5">
          <ItemPlayer
            key={`${item.id}:answer`}
            item={item}
            initialResponse={room.draft}
            onResponseChange={(response) => room.setDraft(item.id, response)}
            submit={room.send}
            busyLabel={LIVE_BUSY_LABEL}
            failureMessage={liveSubmitFailure}
          />
        </div>
      );
  }
}

/**
 * Submit once the time is up (the PhoneReconnecting mockup's held bar): there, greyed, and saying
 * why, so the screen does not change shape under a thumb about to press it.
 */
function HeldSubmit({ reason }: { reason: string }) {
  // The players' own bar, so it sits where Submit sits on every size (fixed on a phone, at the
  // end of the column from 768px, a side column held sideways), with room left for it below the
  // last option (code review M3).
  return (
    <>
      <div aria-hidden="true" className="h-28 md:hidden" />
      <ActionBar>
        <p id="held-submit" role="status" className="flex-1 text-sm text-ink-2">
          {reason}
        </p>
        <Button variant="primary" size="lg" disabled aria-describedby="held-submit">
          Submit
        </Button>
      </ActionBar>
    </>
  );
}
