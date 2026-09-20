"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import {
  HOST_COMMANDS,
  answerAll,
  applyHostCommand,
  canRunHostCommand,
  createInMemoryRoom,
  isLiveSessionError,
  itemAt,
  joinSimulated,
  type HostCommand,
  type ItemAggregate,
  type ItemReveal,
  type LiveSessionState,
  type Participant,
  type ParticipantItem,
  type SimulatedParticipant,
} from "@/lib/live";
import type { AnyResponse, Item } from "@/lib/ngn/schemas";

export interface RoomEntry {
  item: Item;
  responses: AnyResponse[];
}

/** Eight names, so the roster is a class rather than a list of one. */
const CLASS = ["Amara", "Bo", "Chidi", "Dara", "Eli", "Farrah", "Gus", "Hana"];

const COMMAND_LABELS: Record<HostCommand, string> = {
  start: "Start session",
  advance: "Next item",
  reveal: "Reveal answer",
  pause: "Pause",
  resume: "Resume",
  end: "End session",
};

const STATUS_LABELS = {
  lobby: "In the lobby",
  running: "Running",
  paused: "Paused",
  ended: "Ended",
} as const;

const noopSubscribe = () => () => {};
/** False during server render and hydration, true after; e2e waits for it before screenshots. */
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

/** Two groups of three, the way a host reads a code out. */
const spacedCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** The three ways an item's marks fall. A union, so a typo cannot render an unstyled bar. */
type BarTone = "bg-correct" | "bg-flag" | "bg-incorrect";

function Bar({
  label,
  count,
  of,
  tone,
}: {
  label: string;
  count: number;
  of: number;
  tone: BarTone;
}) {
  const fraction = of === 0 ? 0 : count / of;
  return (
    <div className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm">
      <span className="text-ink-2">{label}</span>
      {/* Decorative: the count beside it is the accessible value, and colour is never the only cue. */}
      <span aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-2">
        <span
          className={`block h-full origin-left rounded-full transition-transform duration-base ease-out-expo ${tone}`}
          style={{ transform: `scaleX(${fraction})` }}
        />
      </span>
      <span className="tabular text-right font-mono text-xs text-ink-2">{count}</span>
    </div>
  );
}

export function FakeRoom({ set }: { set: RoomEntry[] }) {
  const hydrated = useHydrated();
  const [room] = useState(() =>
    createInMemoryRoom({
      items: set.map((entry) => entry.item),
      code: "LEARN7",
      sessionId: "fake-room",
    }),
  );
  const [host] = useState(() => room.host());
  const [me] = useState(() => room.participant());

  const [state, setState] = useState<LiveSessionState>(() => room.currentState());
  const [roster, setRoster] = useState<Participant[]>([]);
  const [studentItem, setStudentItem] = useState<ParticipantItem | null>(null);
  const [aggregates, setAggregates] = useState<Record<string, ItemAggregate>>({});
  const [reveals, setReveals] = useState<Record<string, ItemReveal>>({});
  const [answeredBy, setAnsweredBy] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const [seedError, setSeedError] = useState<string | null>(null);

  const crowd = useRef<SimulatedParticipant[]>([]);
  /**
   * Never reset in the effect's cleanup. React 19 StrictMode mounts, cleans up and mounts again in
   * development; resetting it there would join "You" and the whole class a second time.
   */
  const seeded = useRef(false);

  useEffect(() => {
    const stop = [
      host.onSessionState((view) => setState(view.state)),
      host.onPresence(setRoster),
      host.onAggregate((aggregate) =>
        setAggregates((prev) => ({ ...prev, [aggregate.itemId]: aggregate })),
      ),
      me.onSessionState((view) => setStudentItem(view.item)),
      me.onReveal((revealed) => setReveals((prev) => ({ ...prev, [revealed.itemId]: revealed }))),
    ];

    if (!seeded.current) {
      seeded.current = true;
      void (async () => {
        try {
          await me.join(room.code, { displayName: "You" });
          crowd.current = await joinSimulated(room, CLASS);
        } catch (error) {
          // A page that quietly showed an empty room would be a worse demo than one that says why.
          setSeedError(
            isLiveSessionError(error) ? error.message : "The fake room could not be set up.",
          );
        }
      })();
    }

    return () => {
      for (const off of stop) off();
    };
  }, [host, me, room]);

  const entry = itemAt(set, state);
  const current = entry?.item ?? null;
  const aggregate = current === null ? null : (aggregates[current.id] ?? null);
  const myReveal = current === null ? null : (reveals[current.id] ?? null);
  const answered = current === null ? 0 : (answeredBy[current.id] ?? 0);
  const refused = HOST_COMMANDS.map((command) => ({
    command,
    result: applyHostCommand(state, command),
  })).flatMap(({ command, result }) => (result.ok ? [] : [{ command, message: result.message }]));

  const run = useCallback(
    async (command: HostCommand) => {
      setBusy(true);
      try {
        await host[command]();
      } finally {
        setBusy(false);
      }
    },
    [host],
  );

  const sendAnswers = useCallback(async () => {
    if (entry === null) return;
    setBusy(true);
    try {
      const round = await answerAll(
        crowd.current,
        entry.item.id,
        ({ index }) => entry.responses[index % entry.responses.length] ?? null,
      );
      // "You" answers too, so the student panel has marks of its own to show at reveal. A refusal
      // here is ordinary — pressing the button twice — and is counted, not thrown.
      const mine = entry.responses[0];
      let own = 0;
      if (mine !== undefined) {
        try {
          await me.submit(entry.item.id, mine);
          own = 1;
        } catch (error) {
          if (!isLiveSessionError(error)) throw error;
        }
      }
      setAnsweredBy((prev) => ({
        ...prev,
        [entry.item.id]: (prev[entry.item.id] ?? 0) + round.submitted + own,
      }));
    } finally {
      setBusy(false);
    }
  }, [entry, me]);

  const canAnswer = entry !== null && state.status === "running" && !state.reveal;

  return (
    <div data-hydrated={hydrated} className="mt-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
      <Surface padding="md">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div>
            <p className="eyebrow">Join code</p>
            <p className="font-mono text-2xl tracking-widest">{spacedCode(room.code)}</p>
          </div>
          <p aria-live="polite" className="text-sm text-ink-2">
            {STATUS_LABELS[state.status]}
            {state.position === null ? null : ` · item ${state.position} of ${state.itemCount}`}
            {state.reveal ? " · answer showing" : null}
          </p>
        </div>

        <div role="group" aria-label="Host controls" className="mt-5 flex flex-wrap gap-2">
          {HOST_COMMANDS.map((command) => (
            <Button
              key={command}
              size="sm"
              variant={command === "start" || command === "reveal" ? "primary" : "secondary"}
              disabled={busy || !canRunHostCommand(state, command)}
              onClick={() => void run(command)}
            >
              {COMMAND_LABELS[command]}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !canAnswer}
            onClick={() => void sendAnswers()}
          >
            Send the class&rsquo;s answers
          </Button>
        </div>

        <p className="mt-3 text-sm text-ink-2">
          {answered === 0
            ? "No answers in for this item yet."
            : `${answered} of ${roster.length} have answered this item.`}
        </p>

        <section aria-labelledby="refused-heading" className="mt-6">
          <h2 id="refused-heading" className="eyebrow">
            What the state machine refuses right now
          </h2>
          {refused.length === 0 ? (
            <p className="mt-2 text-sm text-ink-2">Every move is available.</p>
          ) : (
            <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[8rem_1fr]">
              {refused.map(({ command, message }) => (
                <div key={command} className="contents">
                  <dt className="font-mono text-xs text-ink-2">{command}</dt>
                  <dd className="text-ink-2">{message}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section aria-labelledby="results-heading" className="mt-6">
          <h2 id="results-heading" className="eyebrow">
            Results for this item
          </h2>
          {aggregate === null ? (
            <p className="mt-2 text-sm text-ink-2">
              Tallies arrive once per item change and at reveal, never once per answer (ADR 0002).
            </p>
          ) : (
            <div className="mt-3 grid gap-2">
              <Bar
                label="Full marks"
                count={aggregate.fullMarks}
                of={aggregate.present}
                tone="bg-correct"
              />
              <Bar
                label="Some marks"
                count={aggregate.partialMarks}
                of={aggregate.present}
                tone="bg-flag"
              />
              <Bar
                label="No marks"
                count={aggregate.noMarks}
                of={aggregate.present}
                tone="bg-incorrect"
              />
              <p className="mt-1 font-mono text-xs text-ink-2">
                {aggregate.responded} of {aggregate.present} answered · mean {aggregate.meanPoints}{" "}
                of {aggregate.maxPoints}
              </p>
            </div>
          )}
        </section>
      </Surface>

      <div className="grid content-start gap-4">
        <Surface padding="md">
          <h2 className="eyebrow">What a participant is sent</h2>
          {studentItem === null ? (
            <p className="mt-2 text-sm text-ink-2">
              Nothing yet: a participant is sent an item only while the session is on one.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm">{studentItem.stem.value}</p>
              <p className="mt-3 font-mono text-xs break-words text-ink-2">
                fields: {Object.keys(studentItem).sort().join(", ")}
              </p>
              <p className="mt-2 text-sm text-ink-2">
                No answerKey, no rationale, no scoring rule. They arrive only with the reveal.
              </p>
            </>
          )}
          {myReveal === null ? null : (
            <div className="mt-4 border-t border-line pt-4">
              <p className="eyebrow">Revealed to this participant</p>
              <p className="mt-2 font-mono text-xs break-words text-ink-2">
                {JSON.stringify(myReveal.reveal.answerKey)}
              </p>
              <p className="mt-2 text-sm">
                {myReveal.score === null
                  ? "This participant did not answer, so there are no marks to show."
                  : `Your marks: ${myReveal.score.points} of ${myReveal.score.maxPoints}.`}
              </p>
            </div>
          )}
        </Surface>

        <Surface padding="md">
          <h2 className="eyebrow">In the room ({roster.length})</h2>
          {seedError === null ? null : (
            <p role="alert" className="mt-2 text-sm text-ink-2">
              {seedError}
            </p>
          )}
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {roster.map((participant) => (
              <li
                key={participant.participantId}
                className="rounded-sm bg-surface-2 px-2 py-1 text-sm text-ink-2"
              >
                {participant.displayName}
              </li>
            ))}
          </ul>
        </Surface>
      </div>
    </div>
  );
}
