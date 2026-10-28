"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShowLiveRecord } from "@/components/live/LiveRecord";
import { createPresentCount, type PresentCount } from "@/components/live/RoomCount";
// Module by module rather than through `@/lib/live` and `@/lib/liveSupabase`: those barrels
// value-export the in-memory room and the host console, both of which hold items with their keys
// and import the scoring engine. This is what a student loads (ADR 0003).
import { isLiveSessionError } from "@/lib/live/errors";
import type { LiveSessionState } from "@/lib/live/state";
import type { ItemReveal, ParticipantItem } from "@/lib/live/transport";
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
import { createSupabaseChannelClient } from "@/lib/supabase/channelClient";
import { usePhoneHistory } from "./usePhoneHistory";

export interface StudentRoomOptions {
  sessionId: string;
  participantId: string;
  displayName: string;
  joinedAt: number;
  initial: LiveSessionState;
  channel: ChannelCredential;
  connect?: () => SupabaseParticipant;
}

export interface StudentRoomData {
  state: LiveSessionState;
  item: ParticipantItem | null;
  answered: AnsweredPayload | null;
  revealed: ItemReveal | null;
  present: PresentCount;
  connection: RoomConnection;
  /** What this phone has selected on the item on screen but not yet sent. */
  draft: AnyResponse | undefined;
  setDraft: (itemId: string, response: AnyResponse) => void;
  /** The server refused this phone's answer to the item on screen as late (#182). */
  late: boolean;
  send: SubmitHandler;
  serverNow: () => number;
  history: ReturnType<typeof usePhoneHistory>;
}

/** How far apart, at most, a class's phones read the room after their network comes back. */
export const REJOIN_REFRESH_SPREAD_MS = 2_000;

/**
 * A student's phone's one connection to the room (#132, #133), held apart from what it draws.
 *
 * **One connection.** The same channel carries presence and the room's moves, and the same object
 * fetches the item and posts the answer. Two connections on one topic would be two presence
 * entries for one phone.
 *
 * **Reconnecting.** Realtime replays nothing, so a phone that slept through a move comes back to
 * a room it thinks is still on item two. The transport re-tracks its presence and re-reads the
 * room over HTTP, and that view carries everything the screen draws: the state, the item, this
 * phone's answer, the reveal and the chart at the room's step. Who the phone is (name, title,
 * participant) is fixed for the life of the page, and the channel token source refreshes itself.
 *
 * So a rejoin does **not** ask for the page again (#481). A `router.refresh()` re-runs the server
 * render, which throws when the database is briefly unavailable (#407); the error screen that
 * follows unmounts a room that was working over HTTP and drops the answer in progress. Seventy
 * phones whose Wi-Fi blinked would also ask the server for the page in one burst.
 *
 * **Coming back to the page.** A phone that was locked, switched away from, restored from the
 * back-forward cache or offline has the transport read the room at once (`wake`): the socket
 * reconnects by itself, but the question should be on the screen before it does.
 *
 * **When the server is done with this phone (#149).** The transport reports `"refused"` — never
 * followed by a rejoin — and this does ask for the page again, with `router.refresh()`: the
 * server render is what decides where the phone goes from here. A participant who is gone is
 * redirected to the join form, and an ended session renders its own ended screen.
 */
export function useStudentRoom({
  sessionId,
  participantId,
  displayName,
  joinedAt,
  initial,
  channel,
  connect,
}: StudentRoomOptions): StudentRoomData {
  const router = useRouter();
  /** The latest router, so the connection is never torn down and reopened for a new one. */
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });
  const showRecord = useShowLiveRecord();
  const [state, setState] = useState<LiveSessionState>(initial);
  const [item, setItem] = useState<ParticipantItem | null>(null);
  const [answered, setAnswered] = useState<AnsweredPayload | null>(null);
  const [revealed, setRevealed] = useState<ItemReveal | null>(null);
  /** Not state: a join or a leave elsewhere in the room must not render this screen (#408). */
  const [present] = useState(createPresentCount);
  const [connection, setConnection] = useState<RoomConnection>("connecting");
  /**
   * Held here rather than only inside `ItemPlayer` because the player is remounted whenever the
   * room changes what this screen shows — a pause takes the item off, a resume puts it back — and
   * a student who had ticked three boxes when the host paused should find them still ticked. It
   * is dropped when the room moves to another item, which is a different question.
   */
  const [draft, setDraftState] = useState<{ itemId: string; response: AnyResponse } | null>(null);
  /**
   * The item this phone tried to answer after its time was up (#182), and the end time it was
   * refused against, so the next item opens fresh, and so does this one if the host adds time.
   */
  const [lateFor, setLateFor] = useState<{ itemId: string; endsAt: number | null } | null>(null);
  /** The room's end time as last drawn, for a late refusal that lands after the host added time. */
  const endsAtRef = useRef(state.timer.endsAt);
  useEffect(() => {
    endsAtRef.current = state.timer.endsAt;
  });
  /** Who this phone is, fixed for the life of the page: what the channel is keyed with. */
  const [me] = useState(() => ({ sessionId, participantId, displayName, joinedAt }));
  const history = usePhoneHistory(sessionId, participantId);

  /**
   * A new `initial` only ever arrives with a new server render (a refusal's `router.refresh()`
   * below), and React's "adjust state when a prop changes" pattern lets it land instead of being
   * shadowed by whatever the socket last said. The item, the answer and the reveal are not touched.
   */
  const [applied, setApplied] = useState(initial);
  if (applied !== initial) {
    setApplied(initial);
    setState(initial);
  }

  const room = useRef<SupabaseParticipant | null>(null);
  /** The session's clock, as the transport measured it (#182); never `Date.now()` directly. */
  const serverNow = useCallback(() => room.current?.serverNow() ?? Date.now(), []);
  /** The first token, held for the life of the page; the source refreshes its own. */
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

  const note = history.note;
  useEffect(() => {
    let watching = true;
    const joined = dial();
    room.current = joined;

    const offView = joined.onStudentView((view: StudentView) => {
      if (!watching) return;
      // #335: the chart at the room's step, as the server cut it, for the layout around this room.
      if (view.record !== undefined) showRecord?.(view.record);
      setState(view.state);
      setItem(view.item);
      setAnswered(view.answered);
      setRevealed(view.revealed);
      note(view);
      // A view arriving is proof the server is reachable, whatever the socket said a moment ago.
      setConnection("live");
    });
    // How many have joined, as a number (#426): a phone is no longer sent who.
    const offCount = joined.onCount((count) => {
      if (watching) present.set(count);
    });
    const offConnection = joined.onConnection((status) => {
      if (!watching) return;
      setConnection(status);
      if (status === "refused") routerRef.current.refresh();
    });

    /**
     * Back on the screen, or back on the network: read the room now. Coming back online is
     * spread like a rejoin, because a whole class's Wi-Fi comes back at once; the page being
     * shown again is one student's own doing.
     */
    const wake = () => {
      if (watching) joined.wake();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") wake();
    };
    let waking: ReturnType<typeof setTimeout> | null = null;
    const onOnline = () => {
      if (waking !== null) return;
      waking = setTimeout(() => {
        waking = null;
        wake();
      }, Math.random() * REJOIN_REFRESH_SPREAD_MS);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", wake);
    window.addEventListener("online", onOnline);

    /**
     * A failed open leaves the screen on the server's first paint and says so. Realtime retries
     * by itself, and the transport asks for the room again the moment the channel comes up.
     */
    void joined.resume(me).catch(() => {
      if (watching) setConnection("reconnecting");
    });

    return () => {
      watching = false;
      if (waking !== null) clearTimeout(waking);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("online", onOnline);
      offView();
      offCount();
      offConnection();
      room.current = null;
      // A cleanup cannot await, and a dropped socket must not become an unhandled rejection.
      void joined.leave().catch(() => {});
    };
  }, [dial, me, present, showRecord, note]);

  const answering = item !== null && state.status === "running" && !state.reveal;
  const sent = answered !== null && item !== null && answered.itemId === item.id;
  const late =
    answering &&
    !sent &&
    lateFor !== null &&
    lateFor.itemId === item.id &&
    lateFor.endsAt === state.timer.endsAt;

  /**
   * Sends one answer. It does **not** resolve with a score: ADR 0003 keeps the key and the marks
   * on the server, which answers `{ itemId, submittedAt }` and nothing else. The moment the
   * acknowledgement lands, the sent state replaces the player, so the promise is left unsettled.
   * `already_answered` means what the sent state means; `time_up` is the late screen; every
   * other refusal is rethrown, which unlocks the button and lets the room's state say why.
   */
  const send: SubmitHandler = async (response: AnyResponse) => {
    const joined = room.current;
    const current = item;
    if (joined === null || current === null)
      throw new Error("This phone is not in a live session.");
    try {
      const ack = await joined.submit(current.id, response);
      const mine = { itemId: current.id, submittedAt: ack.submittedAt, response };
      setAnswered(mine);
      note({ state, item: current, answered: mine, revealed: null });
    } catch (refused) {
      if (isLiveSessionError(refused) && refused.code === "time_up") {
        // Refused against the end this answer was sent under, and the host has added time since:
        // it is not late now. Not sent, so Submit comes back with the draft in it.
        if (endsAtRef.current !== state.timer.endsAt) throw new Error("Refused before more time.");
        setLateFor({ itemId: current.id, endsAt: state.timer.endsAt });
        return new Promise<ScoreReveal>(() => {});
      }
      if (!isLiveSessionError(refused) || refused.code !== "already_answered") throw refused;
      // A refusal carries no acknowledgement; the next view replaces this time with the server's.
      setAnswered({ itemId: current.id, submittedAt: Date.now(), response });
    }
    return new Promise<ScoreReveal>(() => {});
  };

  const setDraft = useCallback(
    (itemId: string, response: AnyResponse) => setDraftState({ itemId, response }),
    [],
  );

  return {
    state,
    item,
    answered,
    revealed,
    present,
    connection,
    draft: item !== null && draft?.itemId === item.id ? draft.response : undefined,
    setDraft,
    late,
    send,
    serverNow,
    history,
  };
}
