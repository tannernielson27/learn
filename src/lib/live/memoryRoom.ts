/**
 * The in-memory `LiveSessionTransport` adapter (#130, ADR 0002).
 *
 * One object plays the part the server plays in production: it holds the items **with** their
 * answer keys, enforces the state machine, scores submissions through the submit seam, and hands
 * each participant a connection that can never see a key before the host reveals it. It is what
 * unit tests drive and what the gallery's fake room runs on, so live-session UI can be built and
 * demoed before the Supabase adapter (#131) exists.
 *
 * Pure TypeScript: no React, Next or Supabase. The room is a plain closure with no timers, no
 * network and no global state — an item timer (#182) is only ever a time compared with `now`, so
 * nothing here needs to wake up when one runs out — so a test can create a hundred of them and a component can hold one
 * in `useState`.
 */
import { maxPoints } from "@/lib/ngn/scoring";
import type { AnyResponse, Item } from "@/lib/ngn/schemas";
import { startingOrderSeed } from "@/lib/ngn/startingOrder";
import { parseSubmission, scoreSubmission, toKeylessItem, SUBMIT_ERRORS } from "@/lib/ngn/submit";
import type { ScoreResult } from "@/lib/ngn/types";
import { LiveSessionError } from "./errors";
import { distributionFor } from "./results";
import {
  applyHostCommand,
  canSubmit,
  chooseTimer,
  goToItem,
  initialSessionState,
  isStudentPaced,
  itemAt,
  pacedSet,
  type HostCommand,
  type TimerCommand,
  type LiveSessionState,
  type SessionMode,
} from "./state";
import type {
  ItemAggregate,
  ItemReveal,
  LiveHostTransport,
  LiveSessionTransport,
  Participant,
  ParticipantIdentity,
  ParticipantItem,
  ParticipantSnapshot,
  HostSnapshot,
  SessionProgress,
  SessionView,
  SubmitAck,
  Unsubscribe,
} from "./transport";

const DISPLAY_NAME_MAX = 60;
const DEFAULT_CODE = "LEARN7";

export interface InMemoryRoomOptions {
  /**
   * What the room works through, **with** keys: this object is the server. Nothing it hands a
   * participant carries one (ADR 0003), which `participant()` below enforces by construction.
   */
  items: readonly Item[];
  /** The code a participant types. Compared case-insensitively, spacing and hyphens forgiven. */
  code?: string;
  sessionId?: string;
  mode?: SessionMode;
  /** The session's clock. Injectable so tests never depend on wall time. */
  now?: () => number;
}

export interface InMemoryRoom {
  readonly sessionId: string;
  readonly code: string;
  readonly mode: SessionMode;
  /** The state as it stands, for assertions. Connections learn it through their subscriptions. */
  currentState(): LiveSessionState;
  /** A participant's connection. One per client; it holds no key at any point. */
  participant(): LiveSessionTransport;
  /** The host's console connection. More than one is fine: co-instructors share a room. */
  host(): LiveHostTransport;
}

interface StoredAnswer {
  response: AnyResponse;
  result: ScoreResult;
  at: number;
}

interface ParticipantConnection {
  participantId: string | null;
  views: Set<(view: SessionView<ParticipantItem>) => void>;
  presence: Set<(roster: Participant[]) => void>;
  reveals: Set<(revealed: ItemReveal) => void>;
}

interface HostConnection {
  views: Set<(view: SessionView<Item>) => void>;
  presence: Set<(roster: Participant[]) => void>;
  aggregates: Set<(aggregate: ItemAggregate) => void>;
}

/**
 * Codes are read out loud, so a typed one is compared with spacing, hyphens and case forgiven.
 * This is a comparison, not a second implementation of the alphabet — #128 owns generating codes
 * and validating their shape in Postgres.
 */
function sameCode(typed: string, expected: string): boolean {
  const strip = (value: string) => value.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return strip(typed) === strip(expected);
}

/** Adds a listener to a set and hands back the unsubscribe. Calling it twice is harmless. */
function subscribe<T>(listeners: Set<T>, listener: T): Unsubscribe {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function createInMemoryRoom(options: InMemoryRoomOptions): InMemoryRoom {
  const items: Item[] = [...options.items];
  /** Built once, so no request path ever reaches for `toKeylessItem` under time pressure. */
  const sessionId = options.sessionId ?? "in-memory-session";
  // One starting order per room for an ordered-response item (#219), as the Supabase adapter does.
  const keylessItems: ParticipantItem[] = items.map((item) =>
    toKeylessItem(item, startingOrderSeed(sessionId, item.id)),
  );
  const itemIds = items.map((item) => item.id);
  const code = options.code ?? DEFAULT_CODE;
  const mode: SessionMode = options.mode ?? "instructor_paced";
  const now = options.now ?? (() => Date.now());

  let state = initialSessionState(items.length, null, mode);
  let nextParticipant = 1;

  const roster = new Map<string, Participant>();
  /** Everyone who has ever joined, leavers too: the progress board keeps a row for each (#185). */
  const everyone = new Map<string, Participant>();
  /** One-based position -> participant id -> what they answered and what it scored. */
  const answers = new Map<number, Map<string, StoredAnswer>>();
  const connections = new Set<ParticipantConnection>();
  const hosts = new Set<HostConnection>();

  const rosterList = (): Participant[] =>
    [...roster.values()].sort(
      (a, b) => a.joinedAt - b.joinedAt || a.participantId.localeCompare(b.participantId),
    );

  const participantView = (): SessionView<ParticipantItem> => {
    // #185: a student-paced room hands its phones the whole set, keyless, and no single item.
    const set = pacedSet(keylessItems, state);
    return { state, item: itemAt(keylessItems, state), ...(set === null ? {} : { set }) };
  };
  const hostView = (): SessionView<Item> => ({ state, item: itemAt(items, state) });

  function emitState(): void {
    const forParticipants = participantView();
    for (const connection of connections) {
      for (const listener of connection.views) listener(forParticipants);
    }
    const forHosts = hostView();
    for (const host of hosts) {
      for (const listener of host.views) listener(forHosts);
    }
  }

  function emitPresence(): void {
    const list = rosterList();
    for (const connection of connections) {
      for (const listener of connection.presence) listener(list);
    }
    for (const host of hosts) {
      for (const listener of host.presence) listener(list);
    }
  }

  function aggregateAt(position: number | null): ItemAggregate | null {
    if (position === null) return null;
    const item = items[position - 1];
    if (item === undefined) return null;
    const given = answers.get(position);
    let fullMarks = 0;
    let partialMarks = 0;
    let noMarks = 0;
    let total = 0;
    for (const answer of given?.values() ?? []) {
      total += answer.result.points;
      if (answer.result.points >= answer.result.maxPoints) fullMarks += 1;
      else if (answer.result.points > 0) partialMarks += 1;
      else noMarks += 1;
    }
    const responded = given?.size ?? 0;
    // Everyone this tally is over: the room as it stands, or the number who answered it, whichever
    // is larger. Counting the roster alone would let `present` fall below `responded` — a phone
    // locking after its owner answered would read "1 of 0 answered".
    //
    // `max`, and not the union of the two sets, because a tally carries no participant ids and an
    // adapter with a network boundary has no union to take: #131's host is told how many answered,
    // never who. Saying it the same way in both adapters is what lets one conformance suite hold
    // them to the same number (ADR 0002).
    const present = Math.max(roster.size, responded);
    return {
      itemId: item.id,
      position,
      present,
      responded,
      fullMarks,
      partialMarks,
      noMarks,
      meanPoints: responded === 0 ? 0 : Math.round((total / responded) * 100) / 100,
      maxPoints: maxPoints(item),
    };
  }

  /**
   * ADR 0002: aggregates go out **once per item change**, never once per submission. The only
   * callers are `advance`, `goto`, `end` (the item being left) and `reveal` (the item now showing), so a
   * class of sixty answering twenty items costs at most forty messages instead of twelve hundred.
   */
  function emitAggregate(position: number | null): void {
    const aggregate = aggregateAt(position);
    if (aggregate === null) return;
    for (const host of hosts) {
      for (const listener of host.aggregates) listener(aggregate);
    }
  }

  /**
   * On reveal, each participant learns the key — and, if they answered, their own marks. For the
   * item the room is on, or, in a student-paced room (#185), for every item in the set at once.
   */
  function emitReveal(): void {
    const positions = isStudentPaced(state)
      ? items.map((_, index) => index + 1)
      : state.position === null
        ? []
        : [state.position];
    for (const position of positions) emitRevealAt(position);
  }

  function emitRevealAt(position: number): void {
    const item = items[position - 1];
    if (item === undefined) return;
    const reveal = { answerKey: item.answerKey, rationale: item.rationale, scoring: item.scoring };
    const given = answers.get(position);
    for (const connection of connections) {
      if (connection.participantId === null) continue;
      const mine = given?.get(connection.participantId);
      const payload: ItemReveal = {
        itemId: item.id,
        position,
        reveal,
        score: mine?.result ?? null,
      };
      for (const listener of connection.reveals) listener(payload);
    }
  }

  /** Who has answered which item, from the answers on record (#185). Never a mark. */
  function progressNow(): SessionProgress | null {
    if (state.status === "lobby") return null;
    const answered = items.map((_, index) => answers.get(index + 1)?.size ?? 0);
    const rows = [...everyone.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt || a.participantId.localeCompare(b.participantId))
      .map((person) => ({
        participantId: person.participantId,
        displayName: person.displayName,
        positions: items
          .map((_, index) => index + 1)
          .filter((position) => answers.get(position)?.has(person.participantId) ?? false),
      }));
    return { answered, rows };
  }

  function runCommand(
    command: HostCommand | TimerCommand | "goto",
    position = 0,
  ): LiveSessionState {
    const before = state;
    const result =
      command === "goto"
        ? goToItem(before, position, now())
        : applyHostCommand(before, command, now());
    if (!result.ok) throw new LiveSessionError(result.refusal);
    state = result.state;
    emitState();
    if (command === "reveal") {
      emitReveal();
      emitAggregate(state.position);
    } else if (command === "advance" || command === "goto" || command === "end") {
      // The tally for the item the room has just left, so leaving it does not lose the count.
      emitAggregate(before.position);
    }
    return state;
  }

  function readName(identity: ParticipantIdentity): string {
    const displayName = identity.displayName.trim();
    if (displayName === "") throw new LiveSessionError("no_name");
    if (displayName.length > DISPLAY_NAME_MAX) throw new LiveSessionError("name_too_long");
    return displayName;
  }

  function participant(): LiveSessionTransport {
    const connection: ParticipantConnection = {
      participantId: null,
      views: new Set(),
      presence: new Set(),
      reveals: new Set(),
    };
    connections.add(connection);

    const snapshot = (participantId: string): ParticipantSnapshot => ({
      sessionId,
      code,
      mode,
      participantId,
      roster: rosterList(),
      ...participantView(),
    });

    return {
      async join(typedCode, identity) {
        if (!sameCode(typedCode, code)) throw new LiveSessionError("unknown_code");
        if (state.status === "ended") throw new LiveSessionError("not_open");
        // Joining twice is the same join: an effect that re-runs must not put a second name in the
        // room. The name given the first time is the one the class sees.
        if (connection.participantId !== null) return snapshot(connection.participantId);

        const displayName = readName(identity);
        const participantId = `p${nextParticipant}`;
        nextParticipant += 1;
        connection.participantId = participantId;
        connections.add(connection);
        const person = { participantId, displayName, joinedAt: now() };
        roster.set(participantId, person);
        everyone.set(participantId, person);
        emitPresence();
        return snapshot(participantId);
      },

      async leave() {
        const participantId = connection.participantId;
        connection.participantId = null;
        connection.views.clear();
        connection.presence.clear();
        connection.reveals.clear();
        connections.delete(connection);
        if (participantId === null) return;
        // Answers stay: they were given. Only the person leaves.
        roster.delete(participantId);
        emitPresence();
      },

      onSessionState: (listener) => subscribe(connection.views, listener),
      onPresence: (listener) => subscribe(connection.presence, listener),
      onReveal: (listener) => subscribe(connection.reveals, listener),
      serverNow: () => now(),

      async submit(itemId, response): Promise<SubmitAck> {
        const participantId = connection.participantId;
        if (participantId === null) throw new LiveSessionError("not_joined");

        // The room's own clock decides whether the time is up (#182), never the participant's.
        const guard = canSubmit(state, itemId, itemIds, now());
        if (!guard.ok) throw new LiveSessionError(guard.refusal);

        // The accepted branch carries the position it checked, so there is nothing to assert here.
        const position = guard.position;
        const item = items[position - 1];

        const given = answers.get(position) ?? new Map<string, StoredAnswer>();
        if (given.has(participantId)) throw new LiveSessionError("already_answered");

        // The transport is a boundary, so the answer is read the way a route handler reads one
        // (#56) rather than trusted because TypeScript said so.
        const parsed = parseSubmission({ response }, item.type);
        if (!parsed.ok) {
          throw new LiveSessionError(
            parsed.error === SUBMIT_ERRORS.wrongType ? "wrong_type" : "malformed",
          );
        }

        // Only `score` is kept. The key, rationale and scoring that come back with it stay in this
        // closure and reach the participant at reveal, never before (ADR 0003). `scoreItem` throws
        // for one thing only — a response of the wrong type — which `parseSubmission` has just
        // ruled out, so there is nothing here to catch.
        const result = scoreSubmission(item, parsed.response).score;

        const at = now();
        given.set(participantId, { response: parsed.response, result, at });
        answers.set(position, given);
        return { itemId: item.id, submittedAt: at };
      },
    };
  }

  function host(): LiveHostTransport {
    const connection: HostConnection = {
      views: new Set(),
      presence: new Set(),
      aggregates: new Set(),
    };
    // Registered as soon as the console exists, not at `open()`: a component subscribes on mount
    // and awaits the snapshot after, and a subscription that quietly did nothing until the promise
    // settled would drop whatever happened in between.
    hosts.add(connection);

    return {
      async open(): Promise<HostSnapshot> {
        hosts.add(connection);
        return {
          sessionId,
          code,
          mode,
          roster: rosterList(),
          aggregate: aggregateAt(state.position),
          ...hostView(),
        };
      },

      async close() {
        hosts.delete(connection);
        connection.views.clear();
        connection.presence.clear();
        connection.aggregates.clear();
      },

      onSessionState: (listener) => subscribe(connection.views, listener),
      onPresence: (listener) => subscribe(connection.presence, listener),
      onAggregate: (listener) => subscribe(connection.aggregates, listener),

      /**
       * Counted from the answers on record, which is the same count `open()` reports.
       *
       * Null whenever the room is on no item — including an ended one, which keeps the position
       * it stopped at. `itemAt` is what decides that, here and in the Supabase adapter, so both
       * answer the same question rather than two similar ones.
       */
      async aggregate() {
        return itemAt(items, state) === null ? null : aggregateAt(state.position);
      },

      /** Read from the same answers on record the tally is counted from. */
      async results() {
        const item = itemAt(items, state);
        if (item === null || state.position === null) return null;
        const given = [...(answers.get(state.position)?.values() ?? [])];
        return distributionFor(
          item,
          given.map((answer) => answer.response),
        );
      },

      async progress() {
        return progressNow();
      },

      async start() {
        return runCommand("start");
      },
      async advance() {
        return runCommand("advance");
      },
      async reveal() {
        return runCommand("reveal");
      },
      async pause() {
        return runCommand("pause");
      },
      async resume() {
        return runCommand("resume");
      },
      async end() {
        return runCommand("end");
      },
      async goto(position) {
        return runCommand("goto", position);
      },
      async setTimer(seconds) {
        const result = chooseTimer(state, seconds);
        if (!result.ok) throw new LiveSessionError(result.refusal);
        state = result.state;
        emitState();
        return state;
      },
      async extendTimer() {
        return runCommand("extend_timer");
      },
      async stopTimer() {
        return runCommand("stop_timer");
      },
      serverNow: () => now(),
    };
  }

  return {
    sessionId,
    code,
    mode,
    currentState: () => state,
    participant,
    host,
  };
}
