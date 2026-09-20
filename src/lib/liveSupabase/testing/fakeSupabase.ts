/**
 * A stand-in for Postgres and Realtime, so the Supabase adapter can be driven by the same
 * conformance suite as the in-memory one (#131).
 *
 * **What is real here and what is not.** Real: the participant transport, the host transport, both
 * route handlers, the participant token, `parseSubmission`, `scoreSubmission`, `toKeylessItem`,
 * `fromItemRow`, `applyHostCommand`, the `Request` and `Response` objects and the JSON that goes
 * over them. Not real: the database and the Realtime server. Those are stood in for here, and the
 * SQL they stand in for — the aggregate trigger, the state machine, the row level security — is
 * covered where it actually lives, by `supabase/tests/database/*.test.sql` under pgTAP.
 *
 * So this file is a fake *database*, not a fake *adapter*. It is written to behave the way the
 * migration says Postgres behaves: the guard trigger refuses an ended row, the mirror trigger
 * writes nothing when nothing participant-visible changed, aggregates are recomputed by the
 * trigger on `sessions` and therefore once per item change, `session_responses` has one row per
 * person per position, and a Realtime message reaches a subscriber only if that subscriber's role
 * could have read the row.
 *
 * Deliveries are asynchronous, as they are in production: nothing a write causes has happened when
 * the write resolves. `settle()` is what the suite awaits instead of sprinkling timeouts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionMode, SessionStatus } from "@/lib/live";
import type { Database, Json } from "@/lib/supabase/database.types";

export interface FakeSessionRow {
  id: string;
  org_id: string;
  host_id: string;
  code: string;
  title: string;
  mode: SessionMode;
  status: SessionStatus;
  item_set: string[];
  current_position: number | null;
  reveal: boolean;
  item_ends_at: string | null;
  closed_at: string | null;
}

export interface FakeItemRow {
  id: string;
  org_id: string;
  status: string;
  type: string;
  cjmm_step: number | null;
  tags: string[];
  version: number;
  content: Json;
  answer_key: Json;
  rationale: Json;
  scoring: Json;
}

export interface FakeResponseRow {
  session_id: string;
  org_id: string;
  participant_id: string;
  item_id: string;
  item_position: number;
  response: Json;
  points: number;
  max_points: number;
  model: string;
  breakdown: Json;
  groups: Json | null;
  submitted_at: string;
}

export interface FakePublicStateRow {
  session_id: string;
  status: SessionStatus;
  item_position: number | null;
  item_count: number;
  reveal: boolean;
  item_ends_at: string | null;
  updated_at: string;
}

export interface FakeAggregateRow {
  session_id: string;
  item_position: number;
  org_id: string;
  item_id: string;
  item_ref: string;
  responded: number;
  full_marks: number;
  partial_marks: number;
  no_marks: number;
  mean_points: number;
  max_points: number;
  computed_at: string;
}

type TableName =
  "sessions" | "items" | "session_responses" | "session_public_state" | "session_item_aggregates";

type Row = Record<string, unknown>;

interface Binding {
  table: string;
  filterColumn: string | null;
  filterValue: string | null;
  listener: (message: { new: Row; old: Row }) => void;
}

/** What a client is allowed to be told. The two policies that matter to Realtime, said in code. */
export interface FakeIdentity {
  role: "anon" | "authenticated" | "service";
  orgId?: string;
}

/** Every payload one participant's process received, so a test can read the wire itself. */
export interface WireRecord {
  kind: "http" | "channel";
  label: string;
  body: string;
}

const REALTIME_TABLES = new Set(["session_public_state", "session_item_aggregates"]);

export class FakeSupabase {
  readonly sessions: FakeSessionRow[] = [];
  readonly items: FakeItemRow[] = [];
  readonly responses: FakeResponseRow[] = [];
  readonly publicState: FakePublicStateRow[] = [];
  readonly aggregates: FakeAggregateRow[] = [];
  readonly wire: WireRecord[] = [];
  /** Every Realtime message the server sent, whoever it reached. The ADR 0002 budget counts these. */
  messagesSent = 0;

  private readonly channels = new Set<FakeChannel>();
  private readonly presence = new Map<string, Map<string, Row[]>>();
  private clock = 1_700_000_000_000;
  private operations = 0;

  /** A monotonic clock, so nothing in a test depends on wall time or on two events sharing a ms. */
  now(): string {
    this.clock += 1;
    return new Date(this.clock).toISOString();
  }

  /**
   * Waits until every message this stack has in flight has been delivered and acted on.
   *
   * A delivery starts a fetch, which starts a query, which finishes and lets a listener run, and
   * each of those steps can land a tick later than the last — reading a `Response` body is real
   * stream work, not a microtask. So quiet is not enough: the stack has to be quiet for three
   * consecutive turns of the event loop before this says so.
   */
  async settle(): Promise<void> {
    let quiet = 0;
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const before = this.operations;
      await new Promise((resolve) => setTimeout(resolve, 0));
      quiet = this.operations === before ? quiet + 1 : 0;
      if (quiet >= 3) return;
    }
    throw new Error("the fake Supabase stack never settled");
  }

  touch(): void {
    this.operations += 1;
  }

  record(entry: WireRecord): void {
    this.operations += 1;
    this.wire.push(entry);
  }

  // -------------------------------------------------------------------------
  // Triggers
  // -------------------------------------------------------------------------

  /** `private.guard_session_change` plus `sessions_mirror_public_state` plus the aggregate push. */
  updateSession(
    sessionId: string,
    patch: Partial<FakeSessionRow>,
  ): { error: { message: string } | null } {
    const session = this.sessions.find((row) => row.id === sessionId);
    if (!session) return { error: { message: "no such session" } };
    if (session.status === "ended") return { error: { message: "that session has ended" } };

    const before: FakeSessionRow = { ...session };
    Object.assign(session, patch);
    // `end_session` settles the row itself, the way #128's guard trigger does: a reveal left
    // standing on an ended session would be a standing invitation to read the key.
    if ((session.status as string) === "ended") {
      session.closed_at = this.now();
      session.reveal = false;
      session.item_ends_at = null;
    }
    this.mirror(before, session);
    this.pushAggregates(before, session);
    return { error: null };
  }

  private mirror(before: FakeSessionRow, after: FakeSessionRow): void {
    if (
      before.status === after.status &&
      before.current_position === after.current_position &&
      before.reveal === after.reveal &&
      before.item_ends_at === after.item_ends_at
    ) {
      return;
    }
    const row: FakePublicStateRow = {
      session_id: after.id,
      status: after.status,
      item_position: after.current_position,
      item_count: after.item_set.length,
      reveal: after.reveal,
      item_ends_at: after.item_ends_at,
      updated_at: this.now(),
    };
    const index = this.publicState.findIndex((held) => held.session_id === after.id);
    if (index === -1) this.publicState.push(row);
    else this.publicState[index] = row;
    this.publish("session_public_state", row as unknown as Row, null);
  }

  /** `private.push_session_aggregates`: advance, reveal and end, in that order, and nothing else. */
  private pushAggregates(before: FakeSessionRow, after: FakeSessionRow): void {
    if (before.current_position !== after.current_position) {
      this.refreshAggregate(after.id, before.current_position);
    } else if (after.reveal && !before.reveal) {
      this.refreshAggregate(after.id, after.current_position);
    } else if (after.status === "ended" && before.status !== "ended") {
      this.refreshAggregate(after.id, before.current_position);
    }
  }

  /** `private.refresh_session_aggregate`, counts and all. */
  private refreshAggregate(sessionId: string, position: number | null): void {
    if (position === null || position < 1) return;
    const session = this.sessions.find((row) => row.id === sessionId);
    if (!session || position > session.item_set.length) return;
    const itemRowId = session.item_set[position - 1] as string;
    const item = this.items.find((row) => row.id === itemRowId);
    const itemRef = ((item?.content as { id?: string } | undefined)?.id ?? itemRowId) as string;

    const given = this.responses.filter(
      (row) => row.session_id === sessionId && row.item_position === position,
    );
    const responded = given.length;
    const full = given.filter((row) => row.points >= row.max_points).length;
    const partial = given.filter((row) => row.points < row.max_points && row.points > 0).length;
    const none = given.filter((row) => row.points < row.max_points && row.points <= 0).length;
    const total = given.reduce((sum, row) => sum + row.points, 0);

    const row: FakeAggregateRow = {
      session_id: sessionId,
      item_position: position,
      org_id: session.org_id,
      item_id: itemRowId,
      item_ref: itemRef,
      responded,
      full_marks: full,
      partial_marks: partial,
      no_marks: none,
      mean_points: responded === 0 ? 0 : Math.round((total / responded) * 100) / 100,
      max_points: given.reduce((most, given_) => Math.max(most, given_.max_points), 0),
      computed_at: this.now(),
    };
    const index = this.aggregates.findIndex(
      (held) => held.session_id === sessionId && held.item_position === position,
    );
    if (index === -1) this.aggregates.push(row);
    else this.aggregates[index] = row;
    this.publish("session_item_aggregates", row as unknown as Row, session.org_id);
  }

  // -------------------------------------------------------------------------
  // Realtime
  // -------------------------------------------------------------------------

  /** Sends a change to every subscriber whose role could have read the row, and to nobody else. */
  private publish(table: string, row: Row, orgId: string | null): void {
    if (!REALTIME_TABLES.has(table)) return;
    this.messagesSent += 1;
    // Everything a participant's channel carries, for the payload test to read. The aggregates are
    // not here because no anonymous subscriber may be sent one; `mayRead` below is that policy.
    if (table === "session_public_state") {
      this.record({ kind: "channel", label: "session_public_state", body: JSON.stringify(row) });
    }
    for (const channel of this.channels) {
      if (!channel.mayRead(table, orgId)) continue;
      for (const binding of channel.bindingsFor(table, row)) {
        this.operations += 1;
        queueMicrotask(() => {
          this.operations += 1;
          binding.listener({ new: row, old: {} });
        });
      }
    }
  }

  register(channel: FakeChannel): void {
    this.channels.add(channel);
  }

  unregister(channel: FakeChannel): void {
    this.channels.delete(channel);
    this.syncPresence(channel.topic);
  }

  presenceFor(topic: string): Map<string, Row[]> {
    let held = this.presence.get(topic);
    if (!held) {
      held = new Map();
      this.presence.set(topic, held);
    }
    return held;
  }

  syncPresence(topic: string): void {
    for (const channel of this.channels) {
      if (channel.topic !== topic) continue;
      for (const listener of channel.presenceListeners) {
        this.operations += 1;
        queueMicrotask(() => {
          this.operations += 1;
          listener();
        });
      }
    }
  }
}

/** The subset of `RealtimeChannel` the adapter uses, backed by the stack above. */
export class FakeChannel {
  readonly presenceListeners = new Set<() => void>();
  private readonly changeBindings: Binding[] = [];

  constructor(
    readonly topic: string,
    private readonly stack: FakeSupabase,
    private readonly identity: FakeIdentity,
    private readonly presenceKey: string,
  ) {
    stack.register(this);
  }

  mayRead(table: string, orgId: string | null): boolean {
    // `session_public_state` is readable by anyone holding a session id; the aggregates are the
    // host's, inside the host's org. Exactly the two policies in the migration.
    if (table === "session_public_state") return true;
    return this.identity.role === "authenticated" && this.identity.orgId === orgId;
  }

  bindingsFor(table: string, row: Row): Binding[] {
    return this.changeBindings.filter(
      (binding) =>
        binding.table === table &&
        (binding.filterColumn === null || row[binding.filterColumn] === binding.filterValue),
    );
  }

  on(
    type: string,
    options: Record<string, string | undefined>,
    listener: (message: { new: Row; old: Row }) => void,
  ): this {
    if (type === "presence") {
      this.presenceListeners.add(() => listener({ new: {}, old: {} }));
      return this;
    }
    const filter = options.filter ?? null;
    const parsed = filter === null ? null : /^([a-z_]+)=eq\.(.*)$/.exec(filter);
    this.changeBindings.push({
      table: options.table ?? "",
      filterColumn: parsed?.[1] ?? null,
      filterValue: parsed?.[2] ?? null,
      listener,
    });
    return this;
  }

  subscribe(callback?: (status: string) => void): this {
    this.stack.touch();
    queueMicrotask(() => {
      this.stack.touch();
      callback?.("SUBSCRIBED");
    });
    return this;
  }

  async track(entry: Row): Promise<"ok"> {
    this.stack.presenceFor(this.topic).set(this.presenceKey, [entry]);
    this.stack.syncPresence(this.topic);
    return "ok";
  }

  async untrack(): Promise<"ok"> {
    this.stack.presenceFor(this.topic).delete(this.presenceKey);
    this.stack.syncPresence(this.topic);
    return "ok";
  }

  presenceState<T>(): Record<string, T[]> {
    return Object.fromEntries(this.stack.presenceFor(this.topic)) as Record<string, T[]>;
  }

  unsubscribe(): void {
    this.stack.unregister(this);
  }
}

/** Picks the columns a `select` asked for, so nothing a route did not ask for can reach it. */
function project(row: Row, columns: string): Row {
  const wanted = columns.split(",").map((name) => name.trim());
  return Object.fromEntries(wanted.map((name) => [name, row[name]]));
}

class FakeFilter implements PromiseLike<{ data: Row | Row[] | null; error: null }> {
  private readonly equals: [string, unknown][] = [];

  constructor(
    private readonly stack: FakeSupabase,
    private readonly rows: Row[],
    private readonly columns: string,
    private readonly patch: Row | null,
  ) {}

  eq(column: string, value: unknown): this {
    this.equals.push([column, value]);
    return this;
  }

  private matching(): Row[] {
    return this.rows.filter((row) =>
      this.equals.every(([column, value]) => String(row[column]) === String(value)),
    );
  }

  private settleNow(): { data: Row | Row[] | null; error: null } {
    this.stack.touch();
    const found = this.matching();
    if (this.patch !== null) {
      for (const row of found) Object.assign(row, this.patch);
      return { data: null, error: null };
    }
    return { data: found.map((row) => project(row, this.columns)), error: null };
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const { data } = this.settleNow();
    const list = Array.isArray(data) ? data : [];
    return { data: (list[0] as Row | undefined) ?? null, error: null };
  }

  then<TResult1 = { data: Row | Row[] | null; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: Row | Row[] | null; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.settleNow()).then(onfulfilled, onrejected);
  }
}

/** The subset of `SupabaseClient` the adapter and the routes use. */
export function createFakeClient(
  stack: FakeSupabase,
  identity: FakeIdentity,
): SupabaseClient<Database> {
  const tableRows = (table: TableName): Row[] => {
    switch (table) {
      case "sessions":
        return stack.sessions as unknown as Row[];
      case "items":
        return stack.items as unknown as Row[];
      case "session_responses":
        return stack.responses as unknown as Row[];
      case "session_public_state":
        return stack.publicState as unknown as Row[];
      case "session_item_aggregates":
        return stack.aggregates as unknown as Row[];
    }
  };

  const client = {
    from(table: TableName) {
      return {
        select: (columns: string) => new FakeFilter(stack, tableRows(table), columns, null),
        update: (patch: Row) => new FakeUpdate(stack, table, patch),
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      stack.touch();
      return Promise.resolve(runRpc(stack, name, args));
    },
    channel(topic: string, options?: { config?: { presence?: { key?: string } } }) {
      return new FakeChannel(topic, stack, identity, options?.config?.presence?.key ?? "host");
    },
    async removeChannel(channel: FakeChannel) {
      channel.unsubscribe();
      return "ok";
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

/** An update to `public.sessions` goes through the guard and the two triggers, never straight in. */
class FakeUpdate implements PromiseLike<{ data: null; error: { message: string } | null }> {
  private id: string | null = null;

  constructor(
    private readonly stack: FakeSupabase,
    private readonly table: TableName,
    private readonly patch: Row,
  ) {}

  eq(column: string, value: unknown): this {
    if (column === "id") this.id = String(value);
    return this;
  }

  then<TResult1 = { data: null; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: null;
          error: { message: string } | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.stack.touch();
    if (this.table !== "sessions" || this.id === null) {
      return Promise.resolve({ data: null, error: { message: "unsupported" } }).then(
        onfulfilled as never,
        onrejected,
      );
    }
    const result = this.stack.updateSession(this.id, this.patch as Partial<FakeSessionRow>);
    return Promise.resolve({ data: null, ...result }).then(onfulfilled as never, onrejected);
  }
}

function runRpc(
  stack: FakeSupabase,
  name: string,
  args: Record<string, unknown>,
): { data: unknown; error: { message: string; code?: string } | null } {
  if (name === "end_session") {
    const target = String(args.target);
    const session = stack.sessions.find((row) => row.id === target);
    if (!session) return { data: null, error: { message: "gone", code: "P0002" } };
    if (session.status === "ended") return { data: session.closed_at, error: null };
    const { error } = stack.updateSession(target, { status: "ended" });
    return error ? { data: null, error } : { data: session.closed_at, error: null };
  }

  if (name === "begin_session_submission") {
    const session = stack.sessions.find((row) => row.id === String(args.target_session));
    if (!session || session.status === "ended") {
      return { data: [{ refusal: "not_open", item_position: null, item_id: null }], error: null };
    }
    if (session.status === "lobby" || session.current_position === null) {
      return {
        data: [{ refusal: "not_started", item_position: null, item_id: null }],
        error: null,
      };
    }
    if (session.status === "paused") {
      return { data: [{ refusal: "paused", item_position: null, item_id: null }], error: null };
    }
    if (session.reveal) {
      return {
        data: [{ refusal: "already_revealed", item_position: null, item_id: null }],
        error: null,
      };
    }
    return {
      data: [
        {
          refusal: null,
          item_position: session.current_position,
          item_id: session.item_set[session.current_position - 1] ?? null,
        },
      ],
      error: null,
    };
  }

  if (name === "record_session_response") {
    const session = stack.sessions.find((row) => row.id === String(args.target_session));
    const position = Number(args.at_position);
    if (!session || session.status === "ended") {
      return { data: [{ refusal: "not_open", submitted_at: null }], error: null };
    }
    if (session.status === "lobby" || session.current_position === null) {
      return { data: [{ refusal: "not_started", submitted_at: null }], error: null };
    }
    if (session.status === "paused") {
      return { data: [{ refusal: "paused", submitted_at: null }], error: null };
    }
    if (session.reveal) {
      return { data: [{ refusal: "already_revealed", submitted_at: null }], error: null };
    }
    if (
      session.current_position !== position ||
      session.item_set[position - 1] !== String(args.target_item)
    ) {
      return { data: [{ refusal: "wrong_item", submitted_at: null }], error: null };
    }
    const participantId = String(args.participant);
    const taken = stack.responses.some(
      (row) =>
        row.session_id === session.id &&
        row.participant_id === participantId &&
        row.item_position === position,
    );
    if (taken) return { data: [{ refusal: "already_answered", submitted_at: null }], error: null };

    const submittedAt = stack.now();
    stack.responses.push({
      session_id: session.id,
      org_id: session.org_id,
      participant_id: participantId,
      item_id: String(args.target_item),
      item_position: position,
      response: args.answer as Json,
      points: Number(args.earned),
      max_points: Number(args.possible),
      model: String(args.scoring_model),
      breakdown: (args.marks ?? []) as Json,
      groups: (args.row_groups ?? null) as Json | null,
      submitted_at: submittedAt,
    });
    return { data: [{ refusal: null, submitted_at: submittedAt }], error: null };
  }

  return { data: null, error: { message: `unknown function ${name}` } };
}
