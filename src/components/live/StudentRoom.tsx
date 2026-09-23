"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Countdown } from "@/components/live/Countdown";
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
import { createChannelTokenSource } from "@/lib/liveSupabase/channelTokenSource";
import type { AnsweredPayload, ChannelCredential } from "@/lib/liveSupabase/wire";
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { ScoreReveal, SubmitHandler } from "@/lib/ngn/submit";
import { createSupabaseChannelClient } from "@/lib/supabase/browser";

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

const SENT = "Answer sent. Your instructor will show the answer at the front.";
const LATE =
  "Your answer was not taken: the time for this item ran out. Your instructor will move the room on.";

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
 * progress survives it.**
 *
 * **When the server is done with this phone (#149).** The channel token is refreshed every half
 * hour, and the server refuses a refresh for good when this participant no longer exists or the
 * session has ended. The transport then closes the channel and reports `"refused"` — never
 * followed by a rejoin — and this screen does the same `router.refresh()`. The server render is
 * what knows the answer: a participant who is gone is redirected to the join form, and an ended
 * session renders its own ended screen through `waitingCopy`, the same way it does on a reload.
 * "Reconnecting" is not shown for a refused phone, because nothing is coming back.
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
  channel,
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
   * What this phone has selected but not yet sent.
   *
   * Held here rather than only inside `ItemPlayer` because the player is remounted whenever the
   * room changes what this screen is showing — a pause takes the item off, a resume puts it back —
   * and a student who had ticked three boxes when the host paused to talk should find them still
   * ticked. `ItemPlayer` hands every change over for exactly this, and takes it back as
   * `initialResponse`. It is dropped when the room moves to another item, which is a different
   * question and a different answer.
   */
  const [draft, setDraft] = useState<{ itemId: string; response: AnyResponse } | null>(null);
  /**
   * The item this phone tried to answer after its time was up (#182), which the server refused
   * with `time_up`, and the end time it was refused against. Kept with both, so the next item — a
   * new clock — opens fresh, and so does this one if the host adds time or stops the clock.
   */
  const [lateFor, setLateFor] = useState<{ itemId: string; endsAt: number | null } | null>(null);

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
  /**
   * The session's clock, as the transport measured it against the server's own (#182). A phone's
   * clock can be minutes out; the countdown reads this and never `Date.now()` directly.
   */
  const serverNow = useCallback(() => room.current?.serverNow() ?? Date.now(), []);

  /**
   * The first token, held for the life of the page like `me` above. A `router.refresh()` renders
   * the page again and mints another, but the source below already refreshes its own before it
   * expires, and swapping it would mean rebuilding the client and the channel with it.
   */
  const [firstChannel] = useState(channel);

  const dial = useMemo(
    () =>
      connect ??
      (() => {
        const tokens = createChannelTokenSource({ initial: firstChannel });
        return createSupabaseParticipant({
          // A client of its own, authorized by the channel token rather than by any Supabase
          // session: a student has none (#149). See `createSupabaseChannelClient`.
          client: createSupabaseChannelClient(tokens.accessToken),
          tokens,
        });
      }),
    [connect, firstChannel],
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
      // A view arriving is proof the server is reachable, whatever the socket said a moment ago.
      // It is what takes the notice below down again after a failed open has put it up.
      setConnection("live");
    });
    const offPresence = joined.onPresence((roster) => {
      if (watching) setPresent(roster.length);
    });
    const offConnection = joined.onConnection((status, rejoined) => {
      if (!watching) return;
      setConnection(status);
      // A rejoin means the room may have moved while the socket was down; a refusal means the
      // server has finished with this phone. Either way the server render is what knows next.
      if (rejoined || status === "refused") router.refresh();
    });

    /**
     * A failed open leaves the screen on the server's first paint — the room as it was a moment
     * ago, which is better than a blank page — and says so, rather than swallowing it. It is not
     * an error message, because nothing is wrong that will not fix itself: Realtime retries by
     * itself, and the transport asks the server for the room again the moment the channel comes
     * up. The notice goes when the first view lands.
     */
    void joined.resume(me).catch(() => {
      if (watching) setConnection("reconnecting");
    });

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
  const late =
    answering &&
    !sent &&
    lateFor !== null &&
    lateFor.itemId === item.id &&
    lateFor.endsAt === state.timer.endsAt;
  /** Whether the item's clock belongs on this screen: on an item, with no key showing. */
  const clocked =
    item !== null && !state.reveal && (state.status === "running" || state.status === "paused");
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
      // Time was up when the answer reached the server (#182). Not a failure to show as one: the
      // screen says what happened in its own words, and the player it came from goes away.
      if (isLiveSessionError(refused) && refused.code === "time_up") {
        setLateFor({ itemId: current.id, endsAt: state.timer.endsAt });
        return new Promise<ScoreReveal>(() => {});
      }
      if (!isLiveSessionError(refused) || refused.code !== "already_answered") throw refused;
      // A refusal carries no acknowledgement, so there is no session clock to take this from.
      // Nothing renders it — it is here because the shape says an answer has a time — and the
      // next view this phone fetches replaces it with the server's own.
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

      {clocked ? <Countdown timer={state.timer} now={serverNow} /> : null}

      {showing && revealed !== null ? (
        <RevealedItem
          item={item}
          answered={answered}
          revealed={revealed}
          progress={progress}
          copy={copy}
        />
      ) : late ? (
        <section aria-labelledby="late-heading" className="mt-8">
          <h2 id="late-heading" className="font-read text-2xl text-ink-1">
            Time is up
          </h2>
          <p role="status" data-testid="answer-late" className="measure mt-2 text-ink-2">
            {LATE}
          </p>
        </section>
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
            initialResponse={draft?.itemId === item.id ? draft.response : undefined}
            onResponseChange={(response) => setDraft({ itemId: item.id, response })}
            progress={progress}
            submit={send}
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
