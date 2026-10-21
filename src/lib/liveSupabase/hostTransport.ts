/**
 * The host half of the Supabase adapter: a `LiveHostTransport` over Realtime and the Data API.
 *
 * A host *is* signed in, so this side needs no route handler of its own. Every read is the
 * instructor's own, under the row level security #128 and this story's migration set up: the
 * session row (their org), the item with its key (their org), and `session_item_aggregates`
 * (their org, and nobody else's role can read it at all).
 *
 * Moves are ordinary updates to `public.sessions`. They are checked twice on purpose: once here by
 * `applyHostCommand`, the pure reducer #130 wrote, so a console can grey out a button and a
 * refusal carries the code the UI branches on; and once by the `before insert or update` trigger
 * #128 put on the table, which is the one that actually holds, whatever any client believes. The
 * two are written to agree move for move.
 *
 * What this side does *not* do is write aggregates. They are a trigger's job, fired by the same
 * update that moved the room — one row written and one message sent per item change, never one per
 * submission (ADR 0002).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LiveSessionError,
  NO_TIMER,
  applyHostCommand,
  chooseTimer,
  clockOffset,
  distributionFor,
  goToItem,
  itemAt,
  pacedState,
  readTimer,
  type HostCommand,
  type TimerCommand,
  type HostSnapshot,
  type ItemAggregate,
  type LiveHostTransport,
  type LiveSessionState,
  type Participant,
  type SessionMode,
  type SessionProgress,
  type SessionView,
  type Distribution,
  type Unsubscribe,
} from "@/lib/live";
import { maxPoints } from "@/lib/ngn/scoring";
import type { Item } from "@/lib/ngn/schemas";
import type { Database } from "@/lib/supabase/database.types";
import { fromItemRow } from "@/lib/supabase/itemRows";
import { endSession } from "@/lib/supabase/sessions";
import { readProgress } from "./progress";
import { rosterFrom, type PresenceEntry } from "./presence";
import { LIVE_SCHEMA, liveTopic, presentRealtimeToken } from "./wire";

const ITEM_COLUMNS = "type, cjmm_step, tags, version, content, answer_key, rationale, scoring";

/** Everything the tally and the results panel are counted from, in one select (#197). */
const RESPONSE_COLUMNS = "response, points, max_points";

/**
 * How long one read of the answers may serve the *other* of the two asks (#197). The console asks
 * for the tally and for the results on the same three-second tick, a few milliseconds apart; a
 * second is ample slack for that and well short of the next tick, so one tick's read is never
 * passed off as the next one's.
 */
const SHARE_WINDOW_MS = 1_000;

type ResponseRow = { response: unknown; points: number; max_points: number };

/** The two asks that are counted from the same rows. */
type Ask = "aggregate" | "results";

/** One read of the answers to one item, and which of the two asks it has served. */
interface SharedRead {
  key: string;
  startedAt: number;
  rows: Promise<ResponseRow[] | null>;
  served: Set<Ask>;
}

type AggregateRow = {
  item_position: number;
  item_ref: string;
  responded: number;
  full_marks: number;
  partial_marks: number;
  no_marks: number;
  mean_points: number;
  max_points: number;
};

export interface HostTransportOptions {
  /** The instructor's own browser client. Every read below is theirs, under their org's RLS. */
  client: SupabaseClient<Database>;
  sessionId: string;
}

function subscribe<T>(listeners: Set<T>, listener: T): Unsubscribe {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function createSupabaseHost(options: HostTransportOptions): LiveHostTransport {
  const { client, sessionId } = options;

  const views = new Set<(view: SessionView<Item>) => void>();
  const presence = new Set<(roster: Participant[]) => void>();
  const aggregates = new Set<(aggregate: ItemAggregate) => void>();

  let state: LiveSessionState = {
    status: "lobby",
    position: null,
    itemCount: 0,
    reveal: false,
    timer: NO_TIMER,
  };
  /** How far the database's clock is ahead of this laptop's (#182). Measured on `open()`. */
  let offset = 0;
  let itemIds: string[] = [];
  let code = "";
  let mode: SessionMode = "instructor_paced";
  let current: Item | null = null;
  let closed = false;
  /** Whether the channel has been up before, so a rejoin can be told from the first subscribe. */
  let subscribed = false;
  /** The last read of the answers, for the other ask on the same tick to reuse (#197). */
  let lastRead: SharedRead | null = null;

  /**
   * Registered as soon as the console exists rather than at `open()`: a component subscribes on
   * mount and awaits the snapshot after, and a subscription that quietly did nothing until the
   * promise settled would drop whatever happened in between.
   */
  // A host watches the roster and is never in it, so it subscribes and never tracks.
  //
  // Private (#149), like every participant's: one topic is one kind of channel. The host needs no
  // minted token for it — their own Supabase session is already a JWT, and the `realtime.messages`
  // policy lets a signed-in author into a session their org can read.
  const channel = client.channel(liveTopic(sessionId), { config: { private: true } });

  channel.on(
    "postgres_changes",
    {
      event: "*",
      // The host reads the same four facts from the same mirror as everyone else; the session row
      // itself never travels over a channel. `live` is not an exposed schema — see the migration.
      schema: LIVE_SCHEMA,
      table: "session_public_state",
      filter: `session_id=eq.${sessionId}`,
    },
    () => {
      void onStateChanged();
    },
  );
  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "session_item_aggregates",
      filter: `session_id=eq.${sessionId}`,
    },
    (message) => {
      const row = message.new as Partial<AggregateRow>;
      if (typeof row.item_position !== "number") return;
      // Copied before dispatch: a listener may close the console, which clears these sets, and
      // mutating a Set mid-iteration silently drops whoever had not been reached yet.
      for (const listener of [...aggregates]) listener(toAggregate(row as AggregateRow));
    },
  );
  channel.on("presence", { event: "sync" }, () => {
    const roster = rosterNow();
    for (const listener of [...presence]) listener(roster);
  });

  /**
   * Settles when the channel has come up — **or when it has failed to**, which is the point.
   *
   * `open()` awaits this, and a console that hangs because a socket never opened is a console that
   * shows a host nothing and lets them move nothing, on a projector, in front of a class. A
   * refused or timed-out channel resolves it too: the snapshot is then read from the Data API,
   * which is a separate connection, and the roster starts empty and fills on the first sync
   * whenever the socket does come up. Rejecting would be worse — it would turn a lost socket into
   * a console that cannot open at all.
   */
  const ready = new Promise<void>((resolve) => {
    // The host's own session token first, or the private channel is joined with the publishable
    // key's and refused. See `presentRealtimeToken`.
    void presentRealtimeToken(client).then(() => {
      // Closed while the token was being fetched: the channel has already been removed, and
      // subscribing it now would open a socket nobody will ever close.
      if (closed) {
        resolve();
        return;
      }
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          resolve();
          // A rejoin has missed every change made while the socket was down, and Realtime replays
          // nothing. Re-reading is one indexed query and is what keeps a reconnected console from
          // showing a room that has moved on. Skipped on the first subscribe, where `open()` is
          // about to read anyway.
          if (subscribed) void onStateChanged();
          subscribed = true;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") resolve();
      });
    });
  });

  /** A host watches the roster and is never in it, so nothing of its own is folded in. */
  function rosterNow(): Participant[] {
    return rosterFrom(channel.presenceState<PresenceEntry>());
  }

  /**
   * How many people this tally is over. Presence knows who is in the room; the tally knows how
   * many answered. Neither alone is right — a phone that locks after its owner answered would
   * make the roster smaller than the count of answers — so it is the larger of the two.
   *
   * The in-memory adapter computes the same number the same way (`memoryRoom.ts`). It used to
   * take the union of the two sets, which differs from `max` as soon as one answerer leaves while
   * non-answerers stay; over a channel there is no such union to take, because a tally deliberately
   * carries no participant ids. Both now say `max`, the conformance suite pins it, and the
   * interface has one meaning rather than two.
   */
  function toAggregate(row: AggregateRow): ItemAggregate {
    const responded = Number(row.responded);
    // An item nobody has answered has no marks to take a maximum from, so the host supplies it
    // from the item it is holding whenever the tally is about the item the room is on.
    const onCurrentItem = row.item_position === state.position && current !== null;
    return {
      itemId: row.item_ref,
      position: row.item_position,
      present: Math.max(rosterNow().length, responded),
      responded,
      fullMarks: Number(row.full_marks),
      partialMarks: Number(row.partial_marks),
      noMarks: Number(row.no_marks),
      meanPoints: Number(row.mean_points),
      maxPoints: onCurrentItem ? maxPoints(current as Item) : Number(row.max_points),
    };
  }

  async function loadItem(): Promise<Item | null> {
    const id = itemAt(itemIds, state);
    if (id === null) return null;
    const { data, error } = await client
      .from("items")
      .select(ITEM_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const stored = fromItemRow(data);
    return stored.ok ? stored.value : null;
  }

  async function readSession(): Promise<void> {
    const { data, error } = await client
      .from("sessions")
      .select(
        "code, mode, status, current_position, reveal, item_set, timer_seconds, item_ends_at, timer_remaining_ms",
      )
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new Error("The session could not be read.");
    // A session the host cannot see reads as gone, exactly like the authoring functions.
    if (!data) throw new LiveSessionError("not_open");
    code = data.code;
    mode = data.mode;
    itemIds = Array.isArray(data.item_set) ? (data.item_set as string[]) : [];
    state = pacedState(
      {
        status: data.status,
        position: data.current_position,
        itemCount: itemIds.length,
        reveal: data.reveal,
        // Typed columns from the host's own read; `readTimer` only fails on a row this app did
        // not write, which reads as no clock rather than as a console that cannot open.
        timer:
          readTimer(data.timer_seconds, data.item_ends_at, data.timer_remaining_ms) ?? NO_TIMER,
      },
      // #185: a student-paced room says so, and the reducer refuses its per-item moves.
      data.mode,
    );
  }

  /**
   * Measures the database's clock against this laptop's, so the console counts down on the same
   * clock the phones do and the server refuses by (#182). One round trip on `open()`; a failure
   * leaves the offset where it was, which on a first open is this laptop's own clock.
   */
  async function measureClock(): Promise<void> {
    const sentAt = Date.now();
    const { data, error } = await client.rpc("server_clock");
    const receivedAt = Date.now();
    if (error || typeof data !== "string") return;
    const serverNow = Date.parse(data);
    if (!Number.isNaN(serverNow)) offset = clockOffset(serverNow, sentAt, receivedAt);
  }

  const serverNow = (): number => Date.now() + offset;

  /**
   * Reads the room back after a move, so the console holds the clock the trigger derived rather
   * than the one the reducer guessed with this laptop's time. If the read fails the reducer's
   * answer stands; the channel's echo corrects it either way.
   */
  async function settleFrom(guess: LiveSessionState): Promise<LiveSessionState> {
    try {
      await readSession();
    } catch {
      state = guess;
    }
    return state;
  }

  /** What a timer function's refusal means: the room ended under it, or its clock was gone. */
  async function timerRefusal(): Promise<LiveSessionError> {
    try {
      await readSession();
    } catch {
      return new LiveSessionError("not_open");
    }
    return new LiveSessionError(state.status === "ended" ? "not_open" : "no_timer");
  }

  async function onStateChanged(): Promise<void> {
    if (closed) return;
    try {
      await readSession();
    } catch {
      // The session was deleted out from under the console. There is nothing to report a move to.
      return;
    }
    current = await loadItem();
    if (closed) return;
    const view: SessionView<Item> = { state, item: current };
    for (const listener of [...views]) listener(view);
  }

  /**
   * The answers to the item the room is on: one read that serves both asks on a tick (#197).
   *
   * The console asks for the tally and for the results panel on the same cadence, and both are
   * counted from the same rows. Whichever asks first reads; the other reuses that read if it asks
   * about the same item within `SHARE_WINDOW_MS`, whether the read is still in flight or has just
   * landed. A read serves each ask at most once, so asking the same thing twice always reads again
   * and a count never stands still because the *other* ask read a moment ago. Null when it failed.
   */
  function responsesFor(ask: Ask, position: number, item: Item): Promise<ResponseRow[] | null> {
    const key = `${position}:${item.id}`;
    const now = Date.now();
    const shared = lastRead;
    if (
      shared !== null &&
      shared.key === key &&
      !shared.served.has(ask) &&
      now - shared.startedAt < SHARE_WINDOW_MS
    ) {
      lastRead = { ...shared, served: new Set([...shared.served, ask]) };
      return shared.rows;
    }
    const rows = readResponses(position);
    lastRead = { key, startedAt: now, rows, served: new Set([ask]) };
    return rows;
  }

  /**
   * Null when the read failed, whether it answered with an error or never answered at all. It is
   * shared by two asks, so a rejection here would otherwise fail the tally and the panel together.
   */
  async function readResponses(position: number): Promise<ResponseRow[] | null> {
    try {
      const { data, error } = await client
        .from("session_responses")
        .select(RESPONSE_COLUMNS)
        .eq("session_id", sessionId)
        .eq("item_position", position);
      if (error) return null;
      return (data ?? []) as unknown as ResponseRow[];
    } catch {
      return null;
    }
  }

  /**
   * The tally for the item the room is on, counted now.
   *
   * It is counted from `session_responses` rather than read from `session_item_aggregates`,
   * because that table is written once per item change (ADR 0002) and so holds nothing at all for
   * the item currently being answered: a console opened when forty of sixty had answered would
   * otherwise say nought. The in-memory adapter counts live for exactly the same reason, and the
   * conformance suite now pins it.
   *
   * This costs one indexed read — the host's, under their org's row level security, and shared
   * with the results panel on the same tick (#197) — and is not a push. What goes out over the
   * channel is still the trigger's row, once per item change.
   */
  async function readAggregate(): Promise<ItemAggregate | null> {
    if (state.position === null || current === null) return null;
    const position = state.position;
    const item = current;
    // A failed read counts as nobody yet, as it always has: a tally is not worth an error.
    const marks = (await responsesFor("aggregate", position, item)) ?? [];
    let fullMarks = 0;
    let partialMarks = 0;
    let noMarks = 0;
    let total = 0;
    for (const mark of marks) {
      const points = Number(mark.points);
      const possible = Number(mark.max_points);
      total += points;
      if (points >= possible) fullMarks += 1;
      else if (points > 0) partialMarks += 1;
      else noMarks += 1;
    }
    const responded = marks.length;
    return {
      itemId: item.id,
      position,
      present: Math.max(rosterNow().length, responded),
      responded,
      fullMarks,
      partialMarks,
      noMarks,
      meanPoints: responded === 0 ? 0 : Math.round((total / responded) * 100) / 100,
      maxPoints: maxPoints(item),
    };
  }

  /**
   * How the room answered the item it is on (#180): the stored answers for this position, read
   * under the host's own row level security (their org's authors only; a participant and anon
   * read none, which `live_aggregates.test.sql` pins), and counted here by `distributionFor`.
   *
   * Counted in the host's own process because the host already holds the item with its key; the
   * responses go nowhere but this console. The same read as the tally's on the same tick (#197),
   * and nothing on the channel.
   */
  async function readResults(): Promise<Distribution | null> {
    if (state.position === null || current === null) return null;
    const item = current;
    const rows = await responsesFor("results", state.position, item);
    if (rows === null) return null;
    return distributionFor(
      item,
      rows.map((row) => row.response),
    );
  }

  /**
   * The item the room is on, fetched when this console does not yet hold one — or holds another.
   * `current` is otherwise only set by `open()` and by a channel message, so a console that opened
   * on a lobby and then started the room itself has moved the room without yet being told about
   * it, and one that has just moved the room (`advance`, `goto` in #183) still holds the item it
   * left until the echo lands: a tally for item 1 must not be stamped with item 3's id and maximum
   * in the meantime. False when the room could not be read or the console has closed meanwhile.
   */
  async function ensureCurrent(): Promise<boolean> {
    if (state.position !== null && (current === null || current.id !== itemAt(itemIds, state))) {
      try {
        await readSession();
      } catch {
        return false;
      }
      current = await loadItem();
    }
    return !closed;
  }

  /**
   * Runs one host command. The reducer decides whether it is allowed and what the room becomes;
   * the database is then told, and the trigger is free to disagree — if it does, the update fails
   * and this rejects rather than pretending the move happened.
   */
  async function run(
    command: HostCommand | TimerCommand | "goto",
    position = 0,
  ): Promise<LiveSessionState> {
    if (closed) throw new Error("This console has been closed.");
    const result =
      command === "goto"
        ? goToItem(state, position, serverNow())
        : applyHostCommand(state, command, serverNow());
    if (!result.ok) throw new LiveSessionError(result.refusal);

    if (command === "extend_timer" || command === "stop_timer") {
      // The two timer buttons are functions, not updates: "fifteen more seconds" has to be read
      // off the row and written back in one place, under a lock, by the database's clock (#182).
      const { error } = await client.rpc(
        command === "extend_timer" ? "extend_item_timer" : "stop_item_timer",
        { target: sessionId },
      );
      if (error) throw await timerRefusal();
    } else if (command === "end") {
      // Idempotent in the database (#128), so a double-tapped button is not an error. Through the
      // same wrapper the rest of the app ends a session with, rather than a second call site for
      // the same function: #132 made this the only way a room is ended.
      const ended = await endSession(client, sessionId);
      if (!ended.ok) throw new LiveSessionError("not_open");
    } else {
      const { error } = await client
        .from("sessions")
        .update({
          // The clock is not sent: the guard trigger derives it from the move (#182).
          status: result.state.status,
          current_position: result.state.position,
          reveal: result.state.reveal,
        })
        .eq("id", sessionId);
      if (error) throw new LiveSessionError("not_open");
    }

    // Held locally so the next command is guarded against what the room now is rather than what it
    // was; listeners still hear about it only when the change comes back over the channel, so no
    // one is told twice.
    return settleFrom(result.state);
  }

  /** Chooses the per-item time (#182). A column the host owns, so a plain update. */
  async function setTimer(seconds: number | null): Promise<LiveSessionState> {
    if (closed) throw new Error("This console has been closed.");
    const result = chooseTimer(state, seconds);
    if (!result.ok) throw new LiveSessionError(result.refusal);
    const { error } = await client
      .from("sessions")
      .update({ timer_seconds: seconds })
      .eq("id", sessionId);
    if (error) throw new LiveSessionError("not_open");
    return settleFrom(result.state);
  }

  return {
    async open(): Promise<HostSnapshot> {
      await ready;
      await measureClock();
      await readSession();
      current = await loadItem();
      return {
        sessionId,
        code,
        mode,
        roster: rosterNow(),
        aggregate: await readAggregate(),
        state,
        item: current,
      };
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      views.clear();
      presence.clear();
      aggregates.clear();
      await client.removeChannel(channel);
    },

    onSessionState: (listener) => subscribe(views, listener),
    onPresence: (listener) => subscribe(presence, listener),
    onAggregate: (listener) => subscribe(aggregates, listener),

    /**
     * The same live count `open()` reports, asked for on its own. One indexed read on the host's
     * own connection, under their org's row level security, and no Realtime message at all —
     * which is what lets a console show answers arriving without breaking ADR 0002's budget.
     *
     * It fetches the item first when it does not have one. A tally names the item it is about and
     * takes its maximum from it, and `current` is otherwise only ever set by `open()` and by a
     * channel message — so a console that opened on a lobby and then started the room itself has
     * moved the room without yet being told about it. Waiting for the echo would mean the count a
     * host watches depends on `postgres_changes` reaching their own screen; this way it depends on
     * nothing but the read it was going to make anyway.
     */
    async aggregate(): Promise<ItemAggregate | null> {
      if (closed || !(await ensureCurrent())) return null;
      return readAggregate();
    },

    /**
     * Asked for alongside `aggregate()`, and fetches the item first on the same terms. Asked on
     * the same tick, the two share one read of the answers (#197).
     */
    async results(): Promise<Distribution | null> {
      if (closed || !(await ensureCurrent())) return null;
      return readResults();
    },

    /**
     * The student-paced board (#185). Two reads under the host's own row level security — who
     * joined, and which positions each has answered — and no Realtime message. See `progress.ts`.
     */
    async progress(): Promise<SessionProgress | null> {
      if (closed || state.status === "lobby") return null;
      return readProgress(client, sessionId, state.itemCount);
    },

    start: () => run("start"),
    advance: () => run("advance"),
    reveal: () => run("reveal"),
    pause: () => run("pause"),
    resume: () => run("resume"),
    end: () => run("end"),
    // #183. An ordinary update like `advance`, to a position the host chose; the guard trigger
    // holds the same rules as `goToItem` and clears the reveal and re-arms the clock itself.
    goto: (position) => run("goto", position),
    setTimer,
    extendTimer: () => run("extend_timer"),
    stopTimer: () => run("stop_timer"),
    serverNow,
  };
}
