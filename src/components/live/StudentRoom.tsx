"use client";

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
import { useStudentRoom } from "@/components/live/phone/useStudentRoom";
import { RoomCount } from "@/components/live/RoomCount";
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

const SENT = "Answer sent.";
const LATE = "Your answer was not taken.";

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
 * **Reconnecting** keeps the question on screen with the draft in it and Submit held off, under
 * a dark banner (PLAN §5.7).
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
        <Body
          settled={settled}
          room={room}
          displayName={displayName}
          reconnecting={reconnecting}
          history={history.entries}
        />
      )}
    </div>
  );
}

function Body({
  settled,
  room,
  displayName,
  reconnecting,
  history,
}: {
  settled: PhoneSettledView;
  room: ReturnType<typeof useStudentRoom>;
  displayName: string;
  reconnecting: boolean;
  history: ReturnType<typeof useStudentRoom>["history"]["entries"];
}) {
  const { item, answered, state } = room;

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
          <AnswerSentLine text={SENT} announce />
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
    // is up, and the server's refusal is what puts up "Time is up" below.
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
            // Held off while the phone cannot reach the room; the draft stays in the player.
            showSubmit={!reconnecting}
          />
          {reconnecting ? <HeldSubmit /> : null}
        </div>
      );
  }
}

/** Submit while reconnecting (PhoneReconnecting mockup): there, greyed, and saying why. */
function HeldSubmit() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-1 border-t border-line bg-surface-1 px-5 py-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-lg items-center justify-end gap-3">
        <p id="held-submit" className="flex-1 text-sm text-ink-2">
          Submit comes back when you are connected.
        </p>
        <Button variant="primary" size="lg" disabled aria-describedby="held-submit">
          Submit
        </Button>
      </div>
    </div>
  );
}
