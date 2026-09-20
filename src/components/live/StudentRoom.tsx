"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ItemPlayer } from "@/components/question/ItemPlayer";
// Module by module rather than through `@/lib/live` and `@/lib/liveSupabase`: those barrels
// value-export the in-memory room and the host console, both of which hold items with their keys
// and import the scoring engine. This is the one screen a student loads, so it takes only what it
// uses (ADR 0003, `src/components/question/noClientScoring.test.ts`).
import { isLiveSessionError } from "@/lib/live/errors";
import type { LiveSessionState } from "@/lib/live/state";
import { toScoreReveal, type ItemReveal, type ParticipantItem } from "@/lib/live/transport";
import { waitingCopy, type WaitingCopy } from "@/lib/live/waiting";
import {
  createSupabaseParticipant,
  type RoomConnection,
  type StudentView,
  type SupabaseParticipant,
} from "@/lib/liveSupabase/participantTransport";
import type { AnsweredPayload } from "@/lib/liveSupabase/wire";
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { ScoreReveal, SubmitHandler } from "@/lib/ngn/submit";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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
  /** Injectable so this can be driven without Supabase. The page passes nothing. */
  connect?: () => SupabaseParticipant;
}

const SENT = "Answer sent. Your instructor will show the answer at the front.";

/**
 * A student's phone during a live session (#132, #133).
 *
 * **One connection.** #132 gave this screen a presence-and-state connection because the token
 * seam was still open and it could not answer anything. #133 closed that seam, so the screen
 * holds the participant transport itself: the same channel carries presence and the room's moves,
 * and the same object fetches the item and posts the answer. Two connections on one topic would
 * have been two presence entries for one phone.
 *
 * **Three states per item, and the renderer is the same one every time.** Answering, sent, and —
 * once the host reveals — the key with this phone's own marks. All three are `ItemPlayer`, keyed
 * so that each is its own mount: the player reads `item`, `initialResponse` and `initialReveal`
 * once, which is exactly what makes a step reopen in a different state. Nothing here is a second
 * copy of any item type, and nothing here scores anything.
 *
 * **Where the key is.** Not on this phone until the host reveals it. The item comes from
 * `/api/live/view` with `answerKey`, `rationale` and `scoring` stripped on the server, and the
 * type `ParticipantItem` brands all three `never`, so an item that still had one could not be put
 * here at all. The answer goes to `/api/live/submit`, which scores it beside the key and answers
 * with an acknowledgement carrying no marks (ADR 0003).
 *
 * **Reconnecting.** Realtime replays nothing, so a phone that slept through a move comes back to
 * a room it thinks is still on item two. The transport re-tracks its presence and re-reads the
 * room; this screen also asks the server for the page again — `router.refresh()`, which re-runs
 * the server render and hands down a fresh `initial` without touching any state a client
 * component is holding. That last part is why it is a refresh and not a reload: **an answer in
 * progress survives it.** It is also the only thing that notices a participant who is no longer
 * one, and sends them back to the join form rather than leaving them on a screen that has quietly
 * stopped moving.
 *
 * Built at 375px: one column, nothing wider than the screen, and long names wrap rather than
 * pushing the layout sideways.
 */
export function StudentRoom({
  sessionId,
  title,
  displayName,
  participantId,
  joinedAt,
  initial,
  connect,
}: StudentRoomProps) {
  const router = useRouter();
  const [state, setState] = useState<LiveSessionState>(initial);
  const [item, setItem] = useState<ParticipantItem | null>(null);
  const [answered, setAnswered] = useState<AnsweredPayload | null>(null);
  const [revealed, setRevealed] = useState<ItemReveal | null>(null);
  const [present, setPresent] = useState(1);
  const [connection, setConnection] = useState<RoomConnection>("connecting");

  /**
   * Who this phone is, fixed for the life of the page.
   *
   * `router.refresh()` below renders the page again on every reconnect, and this is what the
   * channel is keyed and tracked with — so it is held rather than rebuilt, and a reconnect costs
   * a re-track rather than tearing the channel down and opening a fresh one.
   */
  const [me] = useState(() => ({ sessionId, participantId, displayName, joinedAt }));

  /**
   * The server is the authority on what the room is doing, and `router.refresh()` below is how
   * this screen asks it again after a reconnect. React's own "adjust state when a prop changes"
   * pattern, during render rather than in an effect: a new `initial` only ever arrives with a new
   * server render, and this is what lets it land instead of being shadowed by whatever the socket
   * last said before it dropped. The item, the answer and the reveal are not touched — the
   * transport re-reads those itself, and they are what an answer in progress is made of.
   */
  const [applied, setApplied] = useState(initial);
  if (applied !== initial) {
    setApplied(initial);
    setState(initial);
  }

  const room = useRef<SupabaseParticipant | null>(null);

  const dial = useMemo(
    () => connect ?? (() => createSupabaseParticipant({ client: createSupabaseBrowserClient() })),
    [connect],
  );

  useEffect(() => {
    let watching = true;
    const joined = dial();
    room.current = joined;

    const offView = joined.onStudentView((view: StudentView) => {
      if (!watching) return;
      setState(view.state);
      setItem(view.item);
      setAnswered(view.answered);
      setRevealed(view.revealed);
    });
    const offPresence = joined.onPresence((roster) => {
      if (watching) setPresent(roster.length);
    });
    const offConnection = joined.onConnection((status, rejoined) => {
      if (!watching) return;
      setConnection(status);
      if (rejoined) router.refresh();
    });

    // A socket that never opens leaves the screen on the server's first paint, which is the room
    // as it was a moment ago — better than a blank page, and the reconnect notice says so.
    void joined.resume(me).catch(() => {});

    return () => {
      watching = false;
      offView();
      offPresence();
      offConnection();
      room.current = null;
      // A cleanup cannot await, and a socket that has already dropped must not turn leaving the
      // page into an unhandled rejection in a student's browser.
      void joined.leave().catch(() => {});
    };
  }, [dial, router, me]);

  /**
   * Whether the item is on this phone at all.
   *
   * `running` only, so a paused room takes the waiting screen and its own sentence. That is not a
   * cosmetic choice: `canSubmit` refuses an answer while a room is paused, and a Submit button
   * that is certain to be refused is worse than a screen that says what is happening. Everything
   * a paused, ended or not-yet-started room says is `waitingCopy`'s, unchanged from #132.
   */
  const onAnItem = item !== null && state.status === "running";
  const showing = onAnItem && state.reveal && revealed !== null && revealed.itemId === item.id;
  /**
   * The key is up but the phone has not fetched it yet — the state message travels on its own and
   * the reveal behind it takes a request. `answering` excludes that moment on purpose: a Submit
   * button offered over an answer that is already on the board would be refused if it were
   * pressed, so the waiting screen says "The answer is showing" for the moment in between.
   */
  const answering = onAnItem && !state.reveal;
  const sent = answered !== null && item !== null && answered.itemId === item.id;
  const progress =
    state.position === null || state.itemCount === 0
      ? undefined
      : { index: state.position - 1, total: state.itemCount };

  /**
   * Sends one answer.
   *
   * What it does **not** do is resolve with a score. ADR 0003 puts the key and the marks in the
   * host's hands, so `/api/live/submit` answers with `{ itemId, submittedAt }` and nothing else —
   * there is nothing here to hand back. The moment the acknowledgement lands, this screen
   * replaces the player with the sent state, and `ItemPlayer` drops any result that arrives after
   * it has unmounted; so the promise is deliberately left unsettled rather than resolved with
   * marks the server did not send or rejected with a failure there was none of. The key, the
   * rationale and this phone's own marks arrive at the reveal, in a new player.
   *
   * A second tap that reaches the server anyway is answered `already_answered`, which is not an
   * error to show anyone: it means exactly what the sent state means. Every other refusal —
   * paused, moved on, revealed, ended — is rejected, which both unlocks the button and lets the
   * room's own state, already on its way over the channel, say what happened in its own words.
   */
  const send: SubmitHandler = async (response: AnyResponse) => {
    const joined = room.current;
    const current = item;
    if (joined === null || current === null) throw new Error("This phone is not in a room.");
    try {
      const ack = await joined.submit(current.id, response);
      setAnswered({ itemId: current.id, submittedAt: ack.submittedAt, response });
    } catch (refused) {
      if (!isLiveSessionError(refused) || refused.code !== "already_answered") throw refused;
      setAnswered({ itemId: current.id, submittedAt: Date.now(), response });
    }
    return new Promise<ScoreReveal>(() => {});
  };

  const copy = waitingCopy(state);

  return (
    <>
      <p className="eyebrow mb-2">Live session</p>
      <h1 className="font-read text-3xl break-words text-ink-1">{title}</h1>
      <p className="mt-4 text-sm text-ink-2">
        Joined as <span className="font-medium break-words text-ink-1">{displayName}</span>
      </p>

      {connection === "reconnecting" ? (
        <p role="status" className="mt-4 text-sm text-ink-2">
          Reconnecting. Stay on this page — your place is kept.
        </p>
      ) : null}

      {showing && revealed !== null ? (
        <RevealedItem
          item={item}
          answered={answered}
          revealed={revealed}
          progress={progress}
          copy={copy}
        />
      ) : answering && sent && answered !== null ? (
        <section aria-label="Your answer" className="mt-8">
          <p role="status" data-testid="answer-sent" className="measure mb-4 text-sm text-ink-2">
            {SENT}
          </p>
          <ItemPlayer
            key={`${item.id}:sent`}
            item={item}
            initialMode="feedback"
            initialResponse={answered.response}
            progress={progress}
            // Feedback mode offers no Submit, so this is never reached. It is here because the
            // player's one way to have an answer checked is a handler, and a sent answer has
            // already been checked — on the server, where the key is.
            submit={refuseSecondAnswer}
            label="Your answer"
          />
        </section>
      ) : answering ? (
        <div className="mt-8">
          <ItemPlayer
            key={`${item.id}:answer`}
            item={item}
            progress={progress}
            submit={send}
            label="Question"
          />
        </div>
      ) : (
        <>
          <section aria-labelledby="waiting-heading" className="mt-8">
            {copy.progress === null ? null : (
              <p className="eyebrow mb-2 tabular">{copy.progress}</p>
            )}
            <h2 id="waiting-heading" className="font-read text-2xl text-ink-1">
              {copy.headline}
            </h2>
            <p className="measure mt-2 text-ink-2">{copy.detail}</p>
          </section>

          <p data-testid="room-count" className="tabular mt-8 text-sm text-ink-2">
            {present} in the room
          </p>
        </>
      )}
    </>
  );
}

/**
 * The item once the host has revealed it, for a phone that answered: the same renderer again, in
 * feedback mode, with this phone's own answer marked against the key.
 *
 * A phone that did **not** answer sees the waiting copy instead — "The answer is showing" — and
 * not the key. `ItemPlayer` marks a key against an answer, and there is none to mark; showing the
 * key on its own is the per-item result view, which is Sprint 8. Saying so here rather than
 * discovering it in front of a class.
 */
function RevealedItem({
  item,
  answered,
  revealed,
  progress,
  copy,
}: {
  item: ParticipantItem;
  answered: AnsweredPayload | null;
  revealed: ItemReveal;
  progress?: { index: number; total: number };
  copy: WaitingCopy;
}) {
  const mine = toScoreReveal(revealed);

  if (mine === null || answered === null || answered.itemId !== item.id) {
    return (
      <section aria-labelledby="waiting-heading" className="mt-8">
        <h2 id="waiting-heading" className="font-read text-2xl text-ink-1">
          {copy.headline}
        </h2>
        <p className="measure mt-2 text-ink-2">{copy.detail}</p>
      </section>
    );
  }

  return (
    <div className="mt-8">
      <ItemPlayer
        key={`${item.id}:reveal`}
        item={item}
        initialResponse={answered.response}
        initialReveal={mine}
        progress={progress}
        submit={refuseSecondAnswer}
        label="Your answer"
      />
    </div>
  );
}

/** A player opened on an answer already given has nothing to send. */
const refuseSecondAnswer: SubmitHandler = async () => {
  throw new Error("This item has already been answered.");
};
