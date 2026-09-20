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
  applyHostCommand,
  itemAt,
  type HostCommand,
  type HostSnapshot,
  type ItemAggregate,
  type LiveHostTransport,
  type LiveSessionState,
  type Participant,
  type SessionMode,
  type SessionView,
  type Unsubscribe,
} from "@/lib/live";
import { maxPoints } from "@/lib/ngn/scoring";
import type { Item } from "@/lib/ngn/schemas";
import type { Database } from "@/lib/supabase/database.types";
import { fromItemRow } from "@/lib/supabase/itemRows";
import { endSession } from "@/lib/supabase/sessions";
import { rosterFrom, type PresenceEntry } from "./presence";
import { LIVE_SCHEMA, liveTopic } from "./wire";

const ITEM_COLUMNS = "type, cjmm_step, tags, version, content, answer_key, rationale, scoring";

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

  let state: LiveSessionState = { status: "lobby", position: null, itemCount: 0, reveal: false };
  let itemIds: string[] = [];
  let code = "";
  let mode: SessionMode = "instructor_paced";
  let current: Item | null = null;
  let closed = false;
  /** Whether the channel has been up before, so a rejoin can be told from the first subscribe. */
  let subscribed = false;

  /**
   * Registered as soon as the console exists rather than at `open()`: a component subscribes on
   * mount and awaits the snapshot after, and a subscription that quietly did nothing until the
   * promise settled would drop whatever happened in between.
   */
  // A host watches the roster and is never in it, so it subscribes and never tracks.
  const channel = client.channel(liveTopic(sessionId));

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
      .select("code, mode, status, current_position, reveal, item_set")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new Error("The session could not be read.");
    // A session the host cannot see reads as gone, exactly like the authoring functions.
    if (!data) throw new LiveSessionError("not_open");
    code = data.code;
    mode = data.mode;
    itemIds = Array.isArray(data.item_set) ? (data.item_set as string[]) : [];
    state = {
      status: data.status,
      position: data.current_position,
      itemCount: itemIds.length,
      reveal: data.reveal,
    };
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
   * The tally for the item the room is on, counted now.
   *
   * It is counted from `session_responses` rather than read from `session_item_aggregates`,
   * because that table is written once per item change (ADR 0002) and so holds nothing at all for
   * the item currently being answered: a console opened when forty of sixty had answered would
   * otherwise say nought. The in-memory adapter counts live for exactly the same reason, and the
   * conformance suite now pins it.
   *
   * This costs one indexed read on `open()` — the host's, under their org's row level security —
   * and is not a push. What goes out over the channel is still the trigger's row, once per item
   * change.
   */
  async function readAggregate(): Promise<ItemAggregate | null> {
    if (state.position === null || current === null) return null;
    const { data } = await client
      .from("session_responses")
      .select("points, max_points")
      .eq("session_id", sessionId)
      .eq("item_position", state.position);

    const marks = (data ?? []) as unknown as { points: number; max_points: number }[];
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
      itemId: current.id,
      position: state.position,
      present: Math.max(rosterNow().length, responded),
      responded,
      fullMarks,
      partialMarks,
      noMarks,
      meanPoints: responded === 0 ? 0 : Math.round((total / responded) * 100) / 100,
      maxPoints: maxPoints(current),
    };
  }

  /**
   * Runs one host command. The reducer decides whether it is allowed and what the room becomes;
   * the database is then told, and the trigger is free to disagree — if it does, the update fails
   * and this rejects rather than pretending the move happened.
   */
  async function run(command: HostCommand): Promise<LiveSessionState> {
    if (closed) throw new Error("This console has been closed.");
    const result = applyHostCommand(state, command);
    if (!result.ok) throw new LiveSessionError(result.refusal);

    if (command === "end") {
      // Idempotent in the database (#128), so a double-tapped button is not an error. Through the
      // same wrapper the rest of the app ends a session with, rather than a second call site for
      // the same function: #132 made this the only way a room is ended.
      const ended = await endSession(client, sessionId);
      if (!ended.ok) throw new LiveSessionError("not_open");
    } else {
      const { error } = await client
        .from("sessions")
        .update({
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
    state = result.state;
    return state;
  }

  return {
    async open(): Promise<HostSnapshot> {
      await ready;
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
     */
    async aggregate(): Promise<ItemAggregate | null> {
      if (closed) return null;
      return readAggregate();
    },

    start: () => run("start"),
    advance: () => run("advance"),
    reveal: () => run("reveal"),
    pause: () => run("pause"),
    resume: () => run("resume"),
    end: () => run("end"),
  };
}
