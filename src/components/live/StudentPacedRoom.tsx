"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnswerSentLine } from "@/components/live/AnswerSentLine";
import { useShowLiveRecord } from "@/components/live/LiveRecord";
import { LIVE_BUSY_LABEL, liveSubmitFailure } from "@/components/live/liveSubmit";
import { createPresentCount, RoomCount } from "@/components/live/RoomCount";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { SetNav } from "@/components/question/SetNav";
import { Button } from "@/components/ui/Button";
import { PhoneHeader } from "@/components/live/phone/PhoneHeader";
import { PhoneEnded, PhoneMessage, PhoneWaiting } from "@/components/live/phone/PhoneStates";
import { ReconnectingBanner } from "@/components/live/phone/ReconnectingBanner";
import { RevealedItem, refuseSecondAnswer } from "@/components/live/phone/RevealedItem";
import { EMPTY_HISTORY } from "@/components/live/phone/history";
import type { StudentRoomProps } from "./StudentRoom";
// Module by module, for the reason `StudentRoom` gives: this is a screen a student loads, and the
// barrels value-export things that hold keys (ADR 0003, `noClientScoring.test.ts`).
import { isLiveSessionError } from "@/lib/live/errors";
import type { LiveSessionState } from "@/lib/live/state";
import { waitingCopy } from "@/lib/live/waiting";
import {
  createSupabaseParticipant,
  type RoomConnection,
  type StudentView,
  type SupabaseParticipant,
} from "@/lib/liveSupabase/participantTransport";
import { createChannelTokenSource } from "@/lib/liveSupabase/channelTokenSource";
import type { AnsweredPayload, PacedItemPayload } from "@/lib/liveSupabase/wire";
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { ScoreReveal } from "@/lib/ngn/submit";
import { createSupabaseChannelClient } from "@/lib/supabase/browser";

/** The same props `StudentRoom` takes: the play page picks one of the two by the session's mode. */
export type StudentPacedRoomProps = StudentRoomProps;

const SENT = "Answer sent.";
const SHOWING = "The answers are showing.";
const LOADING = "Loading the questions.";

/**
 * A student's phone in a student-paced room (#185): the whole set, worked through at this
 * phone's own pace, with a list of the items saying which are done and Previous and Next to move.
 *
 * It is `StudentRoom`'s sibling rather than a mode of it, because what is on the screen is a
 * different thing — a set and a place in it, rather than the one item the room is on — while the
 * connection, the reconnect and the renderer are the same. Each item is the same `ItemPlayer`, in
 * the same three states: answering, sent, and, once the host presses "Show answers", the key with
 * this phone's own marks (`initialReveal`) or the key alone for an item it did not answer
 * (`initialKey`, #181). `RevealedItem` is `StudentRoom`'s, shared rather than copied.
 *
 * **Where the keys are.** Not on this phone until "Show answers". The set comes from
 * `/api/live/view` with every item passed through `toKeylessItem` on the server, and the keys, the
 * rationales and this phone's own marks arrive in the same payload only once `reveal` is true.
 * Answers go to `/api/live/submit` naming the item's place in the set, and come back as an
 * acknowledgement with no marks (ADR 0003).
 *
 * A paused room takes no answers, so it gets the waiting screen and its sentence, as in
 * `StudentRoom`; the place in the set and any half-finished answer are kept for the resume.
 *
 * Built at 375px: one column, the list wraps, and nothing is wider than the screen.
 */
export function StudentPacedRoom({
  sessionId,
  title,
  displayName,
  participantId,
  joinedAt,
  initial,
  channel,
  connect,
}: StudentPacedRoomProps) {
  const router = useRouter();
  const [state, setState] = useState<LiveSessionState>(initial);
  const [set, setSet] = useState<PacedItemPayload[] | null>(null);
  /** Not state, so that a join or a leave does not render the set (#408); see `RoomCount`. */
  const [present] = useState(createPresentCount);
  const [connection, setConnection] = useState<RoomConnection>("connecting");
  /** Where this phone is in the set, counting from 0. Its own, never the room's. */
  const [index, setIndex] = useState(0);
  /** Half-finished answers, by item, so moving away and back does not lose one. */
  const [drafts, setDrafts] = useState<Record<string, AnyResponse>>({});
  /** Answers acknowledged since the last view was read, by item. The next read carries them too. */
  const [sent, setSent] = useState<Record<string, AnsweredPayload>>({});
  const [me] = useState(() => ({ sessionId, participantId, displayName, joinedAt }));
  const [firstChannel] = useState(channel);

  // A new server render (a reconnect's `router.refresh()`) is the authority; see `StudentRoom`.
  const [applied, setApplied] = useState(initial);
  if (applied !== initial) {
    setApplied(initial);
    setState(initial);
  }

  const room = useRef<SupabaseParticipant | null>(null);

  // #469: in a quiz that plays case studies in place, the chart beside the set is the one the
  // entry on the screen carries, cut on the server to its step; none on a loose question.
  const showRecord = useShowLiveRecord();
  const onScreen =
    set === null || set.length === 0 || state.status !== "running"
      ? null
      : (set[Math.min(index, set.length - 1)]?.record ?? null);
  useEffect(() => {
    showRecord?.(onScreen);
  }, [showRecord, onScreen]);

  const dial = useMemo(
    () =>
      connect ??
      (() => {
        const tokens = createChannelTokenSource({ initial: firstChannel });
        return createSupabaseParticipant({
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
      setSet(view.paced ?? null);
      setConnection("live");
    });
    // How many have joined, as a number (#426): a phone is no longer sent who.
    const offCount = joined.onCount((count) => {
      if (watching) present.set(count);
    });
    const offConnection = joined.onConnection((status, rejoined) => {
      if (!watching) return;
      setConnection(status);
      if (rejoined || status === "refused") router.refresh();
    });
    void joined.resume(me).catch(() => {
      if (watching) setConnection("reconnecting");
    });

    return () => {
      watching = false;
      offView();
      offCount();
      offConnection();
      room.current = null;
      void joined.leave().catch(() => {});
    };
  }, [dial, router, me, present]);

  /**
   * Sends one answer, to the item it was given for. As in `StudentRoom`, the promise is left
   * unsettled on purpose: the server sends no marks back, and the sent state replaces the player.
   * `already_answered` means what the sent state means; every other refusal is rethrown.
   */
  const send = async (target: PacedItemPayload, response: AnyResponse): Promise<ScoreReveal> => {
    const joined = room.current;
    if (joined === null) throw new Error("This phone is not in a live session.");
    const itemId = target.item.id;
    try {
      const ack = await joined.submit(itemId, response);
      setSent((held) => ({
        ...held,
        [itemId]: { itemId, submittedAt: ack.submittedAt, response },
      }));
    } catch (refused) {
      if (!isLiveSessionError(refused) || refused.code !== "already_answered") throw refused;
      setSent((held) => ({ ...held, [itemId]: { itemId, submittedAt: Date.now(), response } }));
    }
    return new Promise<ScoreReveal>(() => {});
  };

  const answeredFor = (entry: PacedItemPayload): AnsweredPayload | null =>
    entry.answered ?? sent[entry.item.id] ?? null;

  const onSet = set !== null && set.length > 0 && state.status === "running";
  const at = onSet ? Math.min(index, set.length - 1) : 0;
  const header = (
    <>
      {connection === "reconnecting" ? <ReconnectingBanner /> : null}
      <PhoneHeader
        progress={onSet ? `Question ${at + 1} of ${set.length}` : null}
        title={title}
        connection={connection === "reconnecting" ? "reconnecting" : "connected"}
        serverNow={Date.now}
        {...(onSet && state.reveal ? { badge: "Answers showing" } : {})}
      />
    </>
  );

  if (!onSet) {
    const copy = waitingCopy(state);
    return (
      <div className="flex flex-1 flex-col">
        {header}
        {state.status === "lobby" ? (
          <PhoneWaiting headline={copy.headline} displayName={displayName} present={present} />
        ) : state.status === "ended" ? (
          <PhoneEnded
            headline={copy.headline}
            history={EMPTY_HISTORY}
            itemCount={state.itemCount}
          />
        ) : (
          <PhoneMessage heading={state.status === "running" ? LOADING : copy.headline}>
            <RoomCount present={present} />
          </PhoneMessage>
        )}
      </div>
    );
  }

  const entry = set[at] as PacedItemPayload;
  const mine = answeredFor(entry);
  const done = set.filter((each) => answeredFor(each) !== null).length;
  const progress = { index: at, total: set.length };

  return (
    <div className="flex flex-1 flex-col">
      {header}

      <p role="status" data-testid="paced-count" className="tabular mt-6 text-sm text-ink-2">
        {state.reveal ? SHOWING : `${done} of ${set.length} answered`}
      </p>

      <SetNav
        entries={set.map((each) => ({ key: each.item.id, answered: answeredFor(each) !== null }))}
        current={at}
        onSelect={setIndex}
      />

      {state.reveal && entry.revealed !== null ? (
        <RevealedItem
          item={entry.item}
          answered={mine}
          revealed={entry.revealed}
          progress={progress}
        />
      ) : state.reveal ? (
        <p className="measure mt-8 text-ink-2">{SHOWING}</p>
      ) : mine !== null ? (
        // A plain wrapper: the player inside is already the "Your answer" landmark.
        <div className="mt-8">
          <AnswerSentLine text={SENT} />
          <ItemPlayer
            key={`${entry.item.id}:sent`}
            item={entry.item}
            // Review: no key on this phone until the reveal, so nothing to mark (StudentRoom).
            initialMode="review"
            initialResponse={mine.response}
            progress={progress}
            submit={refuseSecondAnswer}
            label="Your answer"
          />
        </div>
      ) : (
        <div className="mt-8">
          <ItemPlayer
            key={`${entry.item.id}:answer`}
            item={entry.item}
            initialResponse={drafts[entry.item.id]}
            onResponseChange={(response) =>
              setDrafts((held) => ({ ...held, [entry.item.id]: response }))
            }
            progress={progress}
            submit={(response) => send(entry, response)}
            busyLabel={LIVE_BUSY_LABEL}
            failureMessage={liveSubmitFailure}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <Button variant="secondary" disabled={at === 0} onClick={() => setIndex(at - 1)}>
          Previous question
        </Button>
        <Button
          variant="secondary"
          disabled={at === set.length - 1}
          onClick={() => setIndex(at + 1)}
        >
          Next question
        </Button>
      </div>
    </div>
  );
}
