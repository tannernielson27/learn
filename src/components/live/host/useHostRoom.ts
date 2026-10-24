"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pollWhileVisible } from "@/components/live/pollWhileVisible";
import { keepTally } from "@/components/live/sameTally";
import {
  isLiveSessionError,
  isStudentPaced,
  mergeRoster,
  type HostCommand,
  type ItemAggregate,
  type LiveConnection,
  type LiveHostTransport,
  type LiveSessionState,
  type RosterEntry,
  type TimerCommand,
} from "@/lib/live";
import { createSupabaseHost } from "@/lib/liveSupabase";
import type { Item } from "@/lib/ngn/schemas";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * How often the console asks for the tally while an item is open (#133).
 *
 * A pull, because ADR 0002 forbids a push per submission: nothing goes out over the channel while
 * a class answers, so the count a host watches has to be asked for. Three seconds is under the
 * time it takes to notice a number is stale and far above the cost — one indexed read of
 * `session_responses` per tick on the host's own connection, and no Realtime message at all. The
 * results panel (#180) asks on the same tick and the transport serves both from that one read
 * (#197), so the panel does not double it. It runs only while the room is on an item, so a
 * lobby, a paused-and-forgotten room and an ended one ask for nothing.
 */
export const TALLY_INTERVAL_MS = 3_000;

/** What is in flight: a move, a timer button, a new time per item, or a jump (#183). */
export type Pending = HostCommand | TimerCommand | "set_timer" | "goto";

export const OFFLINE = "Live updates stopped. The live session is still open. Reload to catch up.";
const FAILED = "That did not go through. Try again.";

const COMMANDS: Record<
  HostCommand | TimerCommand,
  (to: LiveHostTransport) => Promise<LiveSessionState>
> = {
  start: (to) => to.start(),
  advance: (to) => to.advance(),
  reveal: (to) => to.reveal(),
  pause: (to) => to.pause(),
  resume: (to) => to.resume(),
  end: (to) => to.end(),
  extend_timer: (to) => to.extendTimer(),
  stop_timer: (to) => to.stopTimer(),
};

export interface HostRoomOptions {
  sessionId: string;
  initial: LiveSessionState;
  connect?: () => LiveHostTransport;
  tallyIntervalMs: number;
}

const NO_ITEM = { item: null, position: null };

/** Answers heard per position, from every tally this screen has seen. */
export type HeardCounts = Readonly<Record<number, number>>;

export interface HostRoom {
  state: LiveSessionState;
  roster: RosterEntry[];
  /** The newest tally, about whichever item it says. */
  tally: ItemAggregate | null;
  /** The tally, but only while it is about the item on the screen. */
  answersOn: ItemAggregate | null;
  heard: HeardCounts;
  /** The full item the room is on, key and all: the host's own (ADR 0002). Null until it arrives. */
  item: Item | null;
  /** The current item's CJMM step, which a case study's console names (#184). */
  cjmmStep: number | null;
  connection: LiveConnection;
  error: string | null;
  pending: Pending | null;
  /** On one item at a time, outside the lobby and the end: what the tally and results poll for. */
  onAnItem: boolean;
  run: (command: HostCommand | TimerCommand) => Promise<void>;
  jump: (position: number) => Promise<void>;
  chooseTime: (seconds: number | null) => Promise<void>;
  /**
   * `stop_timer` sent by the console itself, not by a button: no pending state and no error
   * toast. True when the timer is stopped, including when it already was (`no_timer`: another
   * window stopped it first). False when it did not go through; the clock then runs out as usual.
   */
  stopQuietly: () => Promise<boolean>;
  serverNow: () => number;
  askResults: LiveHostTransport["results"];
  askProgress: LiveHostTransport["progress"];
}

/**
 * The console's one connection to the room, for both of the teacher's views.
 *
 * **Where each thing comes from.** The first state is the server's, rendered before any script
 * runs. Everything after arrives over `LiveHostTransport` (#131): the roster from Realtime
 * Presence, the state and the item from the mirror of `public.sessions`, whether the channel is
 * up from `onConnection`, and every move from the methods the state machine allows. This holds no
 * Supabase call of its own and no rule about what a room may do: `applyHostCommand` decides
 * that, once, in `src/lib/live`.
 *
 * The control view and the projector view read the same hook, so the stage cannot show a count
 * or a phase the control view does not.
 */
export function useHostRoom({
  sessionId,
  initial,
  connect,
  tallyIntervalMs,
}: HostRoomOptions): HostRoom {
  const [state, setState] = useState<LiveSessionState>(initial);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [tally, setTally] = useState<ItemAggregate | null>(null);
  /** The item with the position it was sent for, so a move does not show the last one's text. */
  const [item, setItem] = useState<{ item: Item | null; position: number | null }>(NO_ITEM);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [connection, setConnection] = useState<LiveConnection>("connected");
  const [cjmmStep, setCjmmStep] = useState<number | null>(null);
  const [heard, setHeard] = useState<HeardCounts>({});

  const transport = useRef<LiveHostTransport | null>(null);
  /** Resolves when `open()` has read the room, so a move made in the first second still lands. */
  const opened = useRef<Promise<unknown> | null>(null);

  const dial = useMemo(
    () =>
      connect ?? (() => createSupabaseHost({ client: createSupabaseBrowserClient(), sessionId })),
    [connect, sessionId],
  );

  /** Every tally is kept by position as well, for the end screen's answer rate. */
  const hearTally = useCallback((next: ItemAggregate | null) => {
    if (next === null) return;
    setTally(keepTally(next));
    setHeard((held) =>
      held[next.position] === next.responded ? held : { ...held, [next.position]: next.responded },
    );
  }, []);

  useEffect(() => {
    const console_ = dial();
    transport.current = console_;
    let watching = true;

    const offState = console_.onSessionState((view) => {
      if (!watching) return;
      setState(view.state);
      setItem({ item: view.item, position: view.state.position });
      setCjmmStep(view.item?.cjmmStep ?? null);
    });
    const offPresence = console_.onPresence((people) => {
      if (watching) setRoster((held) => mergeRoster(held, people));
    });
    // Pushed once per item change, never once per submission (ADR 0002). The count that moves
    // while the class answers is the poll below.
    const offAggregate = console_.onAggregate((aggregate) => {
      if (watching) hearTally(aggregate);
    });
    const offConnection = console_.onConnection((status) => {
      if (!watching) return;
      setConnection(status);
      // A channel that came back is proof the room is reachable again.
      if (status === "connected") setError((held) => (held === OFFLINE ? null : held));
    });

    const open = console_.open().then(
      (snapshot) => {
        if (!watching) return;
        setState(snapshot.state);
        setItem({ item: snapshot.item, position: snapshot.state.position });
        setCjmmStep(snapshot.item?.cjmmStep ?? null);
        setRoster((held) => mergeRoster(held, snapshot.roster));
        hearTally(snapshot.aggregate);
      },
      () => {
        // The room itself is fine — it lives in Postgres. What has failed is this screen's
        // connection to it, and saying so is better than a console that silently stops moving.
        if (!watching) return;
        setError(OFFLINE);
        setConnection("offline");
      },
    );
    opened.current = open;

    return () => {
      watching = false;
      offState();
      offPresence();
      offAggregate();
      offConnection();
      // A cleanup cannot await, and a socket that has already dropped must not turn leaving the
      // console into an unhandled rejection.
      void console_.close().catch(() => {});
    };
  }, [dial, hearTally]);

  const paced = isStudentPaced(state);
  const onAnItem =
    !paced && state.position !== null && state.status !== "lobby" && state.status !== "ended";

  /**
   * How many answers are in for the item the room is on. Asked for rather than waited for,
   * because nothing is pushed while an item is being answered (ADR 0002). An ask that fails is
   * simply not repeated until the next tick: a count that stops moving for three seconds is not
   * worth an error on a projector. A hidden tab asks nothing, and asks at once when it comes
   * back (#323).
   */
  useEffect(() => {
    if (!onAnItem) return;
    let watching = true;
    const ask = () => {
      const console_ = transport.current;
      if (console_ === null) return;
      void console_
        .aggregate()
        .then((aggregate) => {
          if (watching) hearTally(aggregate);
        })
        .catch(() => {});
    };
    const stop = pollWhileVisible(ask, tallyIntervalMs);
    return () => {
      watching = false;
      stop();
    };
  }, [onAnItem, state.position, state.reveal, tallyIntervalMs, hearTally]);

  const perform = useCallback(
    async (label: Pending, move: (to: LiveHostTransport) => Promise<LiveSessionState>) => {
      const console_ = transport.current;
      if (console_ === null) return;
      setPending(label);
      setError(null);
      try {
        // The adapter guards against the room it has read, so a button pressed before the first
        // read came back waits for it rather than being refused for a room that looks empty.
        await opened.current;
        setState(await move(console_));
      } catch (refused) {
        setError(isLiveSessionError(refused) ? refused.message : FAILED);
      } finally {
        setPending(null);
      }
    },
    [],
  );

  const run = useCallback(
    (command: HostCommand | TimerCommand) => perform(command, COMMANDS[command]),
    [perform],
  );
  const jump = useCallback(
    (position: number) => perform("goto", (to) => to.goto(position)),
    [perform],
  );
  const chooseTime = useCallback(
    (seconds: number | null) => perform("set_timer", (to) => to.setTimer(seconds)),
    [perform],
  );
  const stopQuietly = useCallback(async () => {
    const console_ = transport.current;
    if (console_ === null) return false;
    try {
      await opened.current;
      setState(await console_.stopTimer());
      return true;
    } catch (refused) {
      return isLiveSessionError(refused) && refused.code === "no_timer";
    }
  }, []);
  /**
   * The session's clock for the countdown (#182): the database's, as the console measured it on
   * opening, so this screen and every phone count down to the same zero.
   */
  const serverNow = useCallback(() => transport.current?.serverNow() ?? Date.now(), []);
  const askResults = useCallback(() => transport.current?.results() ?? Promise.resolve(null), []);
  const askProgress = useCallback(() => transport.current?.progress() ?? Promise.resolve(null), []);

  /**
   * A tally for the item the room has just left is still in hand when `advance` lands, and
   * "5 of 5 answered" above a question nobody has seen yet is worse than showing nothing.
   */
  const answersOn = tally !== null && tally.position === state.position ? tally : null;
  // An item from before a move is not the item the room is on.
  const current = state.position !== null && item.position === state.position ? item.item : null;

  return {
    state,
    roster,
    tally,
    answersOn,
    heard,
    item: current,
    cjmmStep,
    connection,
    error,
    pending,
    onAnItem,
    run,
    jump,
    chooseTime,
    stopQuietly,
    serverNow,
    askResults,
    askProgress,
  };
}
