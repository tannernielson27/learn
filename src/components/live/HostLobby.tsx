"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Countdown } from "@/components/live/Countdown";
import { ItemStrip } from "@/components/live/ItemStrip";
import { SessionQrCode } from "@/components/live/SessionQrCode";
import { Roster } from "@/components/live/Roster";
import { TimerControls } from "@/components/live/TimerControls";
import { HostResults } from "@/components/live/results/HostResults";
import { Button } from "@/components/ui/Button";
import {
  canRunHostCommand,
  isLiveSessionError,
  mergeRoster,
  type HostCommand,
  type ItemAggregate,
  type LiveHostTransport,
  type LiveSessionState,
  type RosterEntry,
  type TimerCommand,
} from "@/lib/live";
import { createSupabaseHost } from "@/lib/liveSupabase";
import { positionLabel } from "@/lib/live/positionLabel";
import { reportPath } from "@/lib/live/reportFormat";
import { formatSessionCode } from "@/lib/live/sessionCode";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface HostLobbyProps {
  sessionId: string;
  title: string;
  code: string;
  /** The absolute address the QR code carries, built from the request the host made. */
  studentUrl: string;
  /** What the server read a moment ago. The console renders from this before it connects. */
  initial: LiveSessionState;
  /** Injectable so this can be driven without Supabase. The page passes nothing. */
  connect?: () => LiveHostTransport;
  /**
   * How often the console asks how many have answered, in milliseconds. Only a test passes it;
   * see `TALLY_INTERVAL_MS`.
   */
  tallyIntervalMs?: number;
  /** Whether the session runs a case study, so the position names the CJMM step (#184). */
  caseStudy?: boolean;
}

/**
 * How often the console asks for the tally while an item is open (#133).
 *
 * A pull, because ADR 0002 forbids a push per submission: nothing goes out over the channel while
 * a class answers, so the count a host watches has to be asked for. Three seconds is under the
 * time it takes to notice a number is stale and far above the cost — one indexed read on the
 * host's own connection, and no Realtime message at all. It runs only while the room is on an
 * item, so a lobby, a paused-and-forgotten room and an ended one ask for nothing.
 */
export const TALLY_INTERVAL_MS = 3_000;

/** The moves, in the order a host reaches for them, with the word each button says. */
const LABELS: Record<HostCommand, string> = {
  start: "Start session",
  reveal: "Show answer",
  advance: "Next item",
  pause: "Pause",
  resume: "Resume",
  end: "End session",
};

/** Which buttons are on the screen at all. The rest is `canRunHostCommand` greying them out. */
function offered(state: LiveSessionState): HostCommand[] {
  if (state.status === "ended") return [];
  if (state.status === "lobby") return ["start", "end"];
  return state.status === "paused"
    ? ["reveal", "advance", "resume", "end"]
    : ["reveal", "advance", "pause", "end"];
}

/** What is in flight: a move, a timer button, a new time per item, or a jump (#183). */
type Pending = HostCommand | TimerCommand | "set_timer" | "goto";

const OFFLINE =
  "Live updates are not running. The room still works, but this screen will not move by itself — " +
  "reload it to catch up.";
const FAILED = "That did not go through. Try again.";

/**
 * The instructor's console: who is in the room, and the moves that take the room through it.
 *
 * **Where each thing on this screen comes from.** The code, the title and the first state are the
 * server's, rendered before any script runs, so a projector shows the join code even if the socket
 * never opens. Everything that changes afterwards comes over `LiveHostTransport` (#131): the
 * roster from Realtime Presence, the state from the mirror of `public.sessions`, and every move
 * from the six methods the state machine allows. This component holds no Supabase call of its own
 * and no rule about what a room may do — `applyHostCommand` decides that, once, in `src/lib/live`.
 *
 * **Why the buttons are `canRunHostCommand` and not a chain of ifs.** The reducer already knows
 * that a room on its last item cannot advance and that an answer cannot be shown twice; asking it
 * is what keeps the greyed-out button and the refusal the adapter would raise from drifting apart.
 *
 * Keyboard: everything here is a `button` in reading order with the focus ring the base layer
 * gives it. Nothing is a click handler on a div, and nothing needs a pointer.
 */
export function HostLobby({
  sessionId,
  title,
  code,
  studentUrl,
  initial,
  connect,
  tallyIntervalMs = TALLY_INTERVAL_MS,
  caseStudy = false,
}: HostLobbyProps) {
  const [state, setState] = useState<LiveSessionState>(initial);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [tally, setTally] = useState<ItemAggregate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  /** The current item's CJMM step, which a case study's console names (#184). */
  const [cjmmStep, setCjmmStep] = useState<number | null>(null);

  const transport = useRef<LiveHostTransport | null>(null);
  /** Resolves when `open()` has read the room, so a move made in the first second still lands. */
  const opened = useRef<Promise<unknown> | null>(null);

  const dial = useMemo(
    () =>
      connect ?? (() => createSupabaseHost({ client: createSupabaseBrowserClient(), sessionId })),
    [connect, sessionId],
  );

  useEffect(() => {
    const console_ = dial();
    transport.current = console_;
    let watching = true;

    const offState = console_.onSessionState((view) => {
      if (!watching) return;
      setState(view.state);
      setCjmmStep(view.item?.cjmmStep ?? null);
    });
    const offPresence = console_.onPresence((people) => {
      if (watching) setRoster((held) => mergeRoster(held, people));
    });
    // Pushed once per item change, never once per submission (ADR 0002). The count that moves
    // while the class answers is the poll below.
    const offAggregate = console_.onAggregate((aggregate) => {
      if (watching) setTally(aggregate);
    });

    const open = console_.open().then(
      (snapshot) => {
        if (!watching) return;
        setState(snapshot.state);
        setCjmmStep(snapshot.item?.cjmmStep ?? null);
        setRoster((held) => mergeRoster(held, snapshot.roster));
        setTally(snapshot.aggregate);
      },
      () => {
        // The room itself is fine — it lives in Postgres. What has failed is this screen's
        // connection to it, and saying so is better than a console that silently stops moving.
        if (watching) setError(OFFLINE);
      },
    );
    opened.current = open;

    return () => {
      watching = false;
      offState();
      offPresence();
      offAggregate();
      // A cleanup cannot await, and a socket that has already dropped must not turn leaving the
      // console into an unhandled rejection.
      void console_.close().catch(() => {});
    };
  }, [dial]);

  /**
   * How many answers are in for the item the room is on.
   *
   * Asked for rather than waited for, because nothing is pushed while an item is being answered
   * (ADR 0002) and "three of three answered" is exactly what a host wants before they reveal. It
   * runs only while the room is on an item — a lobby and an ended session ask for nothing — and
   * an ask that fails is simply not repeated until the next tick: a count that stops moving for
   * three seconds is not worth an error on a projector.
   */
  const onAnItem = state.position !== null && state.status !== "lobby" && state.status !== "ended";
  useEffect(() => {
    if (!onAnItem) return;
    let watching = true;
    const ask = () => {
      const console_ = transport.current;
      if (console_ === null) return;
      void console_
        .aggregate()
        .then((aggregate) => {
          if (watching && aggregate !== null) setTally(aggregate);
        })
        .catch(() => {});
    };
    ask();
    const timer = setInterval(ask, tallyIntervalMs);
    return () => {
      watching = false;
      clearInterval(timer);
    };
  }, [onAnItem, state.position, state.reveal, tallyIntervalMs]);

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
  /**
   * The session's clock for the countdown (#182): the database's, as the console measured it on
   * opening, so this screen and every phone count down to the same zero. This laptop's own clock
   * only until the console has opened.
   */
  const serverNow = useCallback(() => transport.current?.serverNow() ?? Date.now(), []);
  /** How the room answered the item it is on (#180), asked for by the results panel. */
  const askResults = useCallback(() => transport.current?.results() ?? Promise.resolve(null), []);

  const ended = state.status === "ended";
  /**
   * The tally, but only while it is about the item on the screen. A tally for the item the room
   * has just left is still in hand when `advance` lands, and "5 of 5 answered" above a question
   * nobody has seen yet is worse than showing nothing for a beat.
   */
  const answersOn = tally !== null && tally.position === state.position ? tally : null;
  const position = positionLabel(state, { caseStudy, cjmmStep });

  return (
    <>
      <h1 className="font-read text-3xl break-words text-ink-1">{title}</h1>
      <p className="mt-1 text-sm text-ink-2">
        {STATUS_LABEL[state.status]} · {state.itemCount} {state.itemCount === 1 ? "item" : "items"}
        {position === null ? null : <> · {position}</>}
        {state.reveal ? <> · answer showing</> : null}
      </p>

      {onAnItem && answersOn !== null ? (
        <p
          data-testid="answer-count"
          aria-live="polite"
          className="tabular mt-3 text-sm text-ink-1"
        >
          {answersOn.responded} of {answersOn.present} answered
        </p>
      ) : null}

      {onAnItem ? <Countdown timer={state.timer} now={serverNow} /> : null}

      <section
        aria-labelledby="code-heading"
        className="mt-8 rounded-sm border border-line bg-surface-1 px-4 py-6 text-center"
      >
        <h2 id="code-heading" className="text-sm font-medium tracking-wide text-ink-2 uppercase">
          Join code
        </h2>
        {ended ? (
          <>
            <p data-testid="join-code" className="mt-3 font-mono text-3xl text-ink-2 line-through">
              {formatSessionCode(code)}
            </p>
            <p className="mt-3 text-sm text-ink-2">
              This session has ended. The code no longer works, and an ended session cannot be
              reopened. Start a new one from the bank.
            </p>
            <p className="mt-4">
              <Link
                href={reportPath(sessionId)}
                className="tap-target inline-flex items-center font-medium text-accent-ink hover:underline"
              >
                Open the report
              </Link>
            </p>
          </>
        ) : (
          <>
            <p
              data-testid="join-code"
              className="mt-3 font-mono text-5xl tracking-[0.2em] text-ink-1"
            >
              {formatSessionCode(code)}
            </p>
            <SessionQrCode
              url={studentUrl}
              label="QR code that opens the join page for this session"
              className="mx-auto mt-6 block h-auto w-40 rounded-sm border border-line sm:w-48"
            />
            <p data-testid="join-url" className="mt-3 font-mono text-sm break-all text-ink-2">
              {studentUrl}
            </p>
            <p className="mt-3 text-sm text-ink-2">
              Students join with this code. It stops working the moment the session ends.
            </p>
          </>
        )}
      </section>

      {error === null ? null : (
        <p role="alert" className="mt-6 text-sm text-incorrect">
          {error}
        </p>
      )}

      {ended ? null : (
        <div className="mt-6 flex flex-wrap gap-2">
          {offered(state).map((command) => (
            <Button
              key={command}
              variant={command === "start" || command === "advance" ? "primary" : "secondary"}
              disabled={pending !== null || !canRunHostCommand(state, command)}
              onClick={() => void run(command)}
            >
              {LABELS[command]}
            </Button>
          ))}
        </div>
      )}

      <ItemStrip
        state={state}
        tally={tally}
        busy={pending !== null}
        onGoto={(position) => void jump(position)}
      />

      {ended ? null : (
        <TimerControls
          state={state}
          busy={pending !== null}
          onChoose={(seconds) => void chooseTime(seconds)}
          onCommand={(command) => void run(command)}
        />
      )}

      <HostResults
        sessionId={sessionId}
        ask={askResults}
        position={state.position}
        revealed={state.reveal}
        active={onAnItem}
        intervalMs={tallyIntervalMs}
      />

      <Roster roster={roster} />
    </>
  );
}

const STATUS_LABEL: Record<LiveSessionState["status"], string> = {
  lobby: "Waiting to start",
  running: "Running",
  paused: "Paused",
  ended: "Ended",
};

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
