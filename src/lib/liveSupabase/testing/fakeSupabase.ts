/**
 * A stand-in for Postgres and Realtime, so the Supabase adapter can be driven by the same
 * conformance suite as the in-memory one (#131).
 *
 * **What is real here and what is not.** Real: the participant transport, the host transport, both
 * route handlers, the cookie verifier `liveRouteDeps()` itself builds (#133), `parseSubmission`,
 * `scoreSubmission`, `toKeylessItem`, `fromItemRow`, `applyHostCommand`, the `Request` and
 * `Response` objects and the JSON that goes
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
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionMode, SessionStatus } from "@/lib/live";
import { SUBMIT_GRACE_MS, extendTimer, settleTimer, type TimedState } from "@/lib/live/timer";
import { CHANNEL_SESSION_CLAIM } from "@/lib/supabase/channelToken";
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
  timer_seconds: number | null;
  item_ends_at: string | null;
  timer_remaining_ms: number | null;
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

/**
 * `public.participants` (#129), as far as this stack needs it: enough for `join_session` and
 * `resume_participant`, which since #133 are what every authenticated live-session request is
 * checked against.
 *
 * The secret is held in the clear here where Postgres holds only its SHA-256. The fake is not
 * where that property is tested — `supabase/tests/database/*.test.sql` is — and hashing in
 * process would only make this file harder to read.
 */
export interface FakeParticipantRow {
  id: string;
  session_id: string;
  org_id: string;
  display_name: string;
  rejoin_secret: string;
  joined_at: string;
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
  timer_seconds: number | null;
  timer_remaining_ms: number | null;
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
  | "sessions"
  | "items"
  | "participants"
  | "session_responses"
  | "session_public_state"
  | "session_item_aggregates";

type Row = Record<string, unknown>;

interface Binding {
  schema: string;
  table: string;
  filterColumn: string | null;
  filterValue: string | null;
  listener: (message: { new: Row; old: Row }) => void;
}

/** Where each published table actually lives, as the migration puts it. */
const TABLE_SCHEMA: Record<string, string> = {
  session_public_state: "live",
  session_item_aggregates: "public",
};

/** What a client is allowed to be told. The two policies that matter to Realtime, said in code. */
export interface FakeIdentity {
  role: "anon" | "authenticated" | "service";
  orgId?: string;
  /**
   * The `accessToken` callback a student's real client is built with (#149). Read when a private
   * channel subscribes, verified against `FAKE_JWT_SECRET`, and its claims are what the
   * `realtime.messages` policy below is evaluated against, the way Realtime does it.
   */
  accessToken?: () => Promise<string>;
}

/**
 * The secret this stack's Realtime trusts, standing in for the project's JWT signing key. It is
 * the local Supabase stack's well-known value, and it is not a secret.
 */
export const FAKE_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

/** Verifies an HS256 token the way Realtime would, and hands back its claims, or null. */
function verifiedClaims(token: string): Record<string, unknown> | null {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const expected = createHmac("sha256", FAKE_JWT_SECRET).update(`${header}.${payload}`).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
  return claims;
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
  readonly participants: FakeParticipantRow[] = [];
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

  /** The database's `now()` as it stands, without moving it. */
  peek(): number {
    return this.clock;
  }

  /** Time passing, as far as the database can tell (#182). Nothing else is told. */
  advance(ms: number): void {
    this.clock += ms;
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
    const refused = refusedMove(session, { ...session, ...patch });
    if (refused !== null) return { error: { message: refused } };

    const before: FakeSessionRow = { ...session };
    Object.assign(session, patch);
    // #183: a move to another item clears the reveal, whatever the write said about it.
    if (before.current_position !== session.current_position) session.reveal = false;
    // `end_session` settles the row itself, the way #128's guard trigger does: a reveal left
    // standing on an ended session would be a standing invitation to read the key.
    if ((session.status as string) === "ended") {
      session.closed_at = this.now();
      session.reveal = false;
    }
    // #182: the trigger derives the clock on every move, from its own `now()`, by the rule
    // `settleTimer` states. A write to the clock alone (the two timer functions) is kept as sent.
    const moved =
      before.status !== session.status ||
      before.current_position !== session.current_position ||
      before.reveal !== session.reveal;
    if (moved) {
      const timer = settleTimer(
        timedState(before),
        timedState(session),
        this.clock,
        session.timer_seconds,
      );
      session.item_ends_at = timer.endsAt === null ? null : new Date(timer.endsAt).toISOString();
      session.timer_remaining_ms = timer.remainingMs;
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
      before.item_ends_at === after.item_ends_at &&
      before.timer_seconds === after.timer_seconds &&
      before.timer_remaining_ms === after.timer_remaining_ms
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
      timer_seconds: after.timer_seconds,
      timer_remaining_ms: after.timer_remaining_ms,
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
    readonly isPrivate: boolean = false,
  ) {
    stack.register(this);
  }

  /** Set when Realtime refused this channel at join. Nothing it asks for afterwards is honoured. */
  denied = false;

  /**
   * `20260921210000_private_live_channel.sql`'s `realtime.messages` policies, said in code: an
   * anonymous socket may join `live:<id>` only when its verified token names that session, and a
   * signed-in one only when the session is in its own org. Realtime evaluates this at join.
   */
  private async mayJoin(): Promise<boolean> {
    const match = /^live:(.+)$/.exec(this.topic);
    if (match === null) return false;
    const sessionId = match[1];
    if (this.identity.role === "authenticated") {
      return this.stack.sessions.some(
        (row) => row.id === sessionId && row.org_id === this.identity.orgId,
      );
    }
    if (this.identity.role !== "anon" || this.identity.accessToken === undefined) return false;
    const claims = verifiedClaims(await this.identity.accessToken());
    return claims !== null && claims.role === "anon" && claims[CHANNEL_SESSION_CLAIM] === sessionId;
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
        // A subscription that named the wrong schema hears nothing, exactly as it would not in
        // production: `session_public_state` is in `live`, not in `public`.
        binding.schema === TABLE_SCHEMA[table] &&
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
    // Realtime's own status messages (#193). This stack delivers a change the moment a channel
    // has subscribed, so there is no late `postgres_changes` confirmation for it to send.
    if (type === "system") return this;
    const filter = options.filter ?? null;
    const parsed = filter === null ? null : /^([a-z_]+)=eq\.(.*)$/.exec(filter);
    this.changeBindings.push({
      schema: options.schema ?? "public",
      table: options.table ?? "",
      filterColumn: parsed?.[1] ?? null,
      filterValue: parsed?.[2] ?? null,
      listener,
    });
    return this;
  }

  subscribe(callback?: (status: string) => void): this {
    this.stack.touch();
    if (!this.isPrivate) {
      queueMicrotask(() => {
        this.stack.touch();
        callback?.("SUBSCRIBED");
      });
      return this;
    }
    void this.mayJoin().then((allowed) => {
      this.stack.touch();
      if (allowed) {
        callback?.("SUBSCRIBED");
        return;
      }
      // A refused private join hears nothing at all: not the roster, and not the state changes.
      this.denied = true;
      this.stack.unregister(this);
      callback?.("CHANNEL_ERROR");
    });
    return this;
  }

  async track(entry: Row): Promise<"ok"> {
    if (this.denied) throw new Error("this channel was refused at join");
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

/** A session row as the pure timer rules see it. */
function timedState(row: FakeSessionRow): TimedState {
  return {
    status: row.status,
    position: row.current_position,
    reveal: row.reveal,
    timer: {
      seconds: row.timer_seconds,
      endsAt: row.item_ends_at === null ? null : Date.parse(row.item_ends_at),
      remainingMs: row.timer_remaining_ms,
    },
  };
}

/** Whether an answer now is past the item's end and its grace, by the database's clock. */
function lateFor(stack: FakeSupabase, session: FakeSessionRow): boolean {
  if (session.item_ends_at === null) return false;
  return stack.peek() > Date.parse(session.item_ends_at) + SUBMIT_GRACE_MS;
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

  private readonly within: [string, Set<string>][] = [];

  eq(column: string, value: unknown): this {
    this.equals.push([column, value]);
    return this;
  }

  /** `.in(column, values)`, which the student-paced view reads the whole set with (#185). */
  in(column: string, values: readonly unknown[]): this {
    this.within.push([column, new Set(values.map(String))]);
    return this;
  }

  private matching(): Row[] {
    return this.rows.filter(
      (row) =>
        this.equals.every(([column, value]) => String(row[column]) === String(value)) &&
        this.within.every(([column, values]) => values.has(String(row[column]))),
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
      case "participants":
        return stack.participants as unknown as Row[];
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
    channel(
      topic: string,
      options?: { config?: { presence?: { key?: string }; private?: boolean } },
    ) {
      return new FakeChannel(
        topic,
        stack,
        identity,
        options?.config?.presence?.key ?? "host",
        options?.config?.private === true,
      );
    },
    // Realtime's own copy of the token. The fake reads `identity.accessToken` at join instead.
    realtime: { setAuth: async () => {} },
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

/** A participant uuid, and a 24-byte secret hex-encoded, exactly as `join_session` returns them. */
function participantId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "9")}`;
}

function participantSecret(index: number): string {
  return `${String(index).padStart(6, "0")}${"ab".repeat(21)}`;
}

function runRpc(
  stack: FakeSupabase,
  name: string,
  args: Record<string, unknown>,
): { data: unknown; error: { message: string; code?: string } | null } {
  // #129's two functions. They are here rather than stood in for by the room harness because
  // since #133 `resume_participant` is what every request to the two route handlers is checked
  // against: the production verifier itself is what the conformance suite drives.
  if (name === "join_session") {
    const session = stack.sessions.find((row) => row.id === String(args.target_session));
    if (!session) return { data: null, error: { message: "gone", code: "P0002" } };
    if (session.status === "ended")
      return { data: null, error: { message: "ended", code: "22023" } };
    const cleaned = String(args.chosen_name ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 32);
    if (cleaned === "") return { data: null, error: { message: "no name", code: "22023" } };

    const index = stack.participants.length + 1;
    stack.participants.push({
      id: participantId(index),
      session_id: session.id,
      org_id: session.org_id,
      display_name: cleaned,
      rejoin_secret: participantSecret(index),
      joined_at: stack.now(),
    });
    return {
      data: [{ participant_id: participantId(index), rejoin_secret: participantSecret(index) }],
      error: null,
    };
  }

  if (name === "resume_participant") {
    const held = stack.participants.find(
      (row) =>
        row.id === String(args.target_participant) &&
        row.session_id === String(args.target_session) &&
        // A wrong secret takes the same path as a missing one: no rows, and a caller that cannot
        // tell the two apart.
        row.rejoin_secret === String(args.presented_secret ?? ""),
    );
    if (!held) return { data: [], error: null };
    const session = stack.sessions.find((row) => row.id === held.session_id);
    if (!session) return { data: [], error: null };
    return {
      data: [
        {
          participant_id: held.id,
          participant_name: held.display_name,
          participant_joined_at: held.joined_at,
          session_status: session.status,
          session_mode: session.mode,
          session_title: session.title,
        },
      ],
      error: null,
    };
  }

  if (name === "end_session") {
    const target = String(args.target);
    const session = stack.sessions.find((row) => row.id === target);
    if (!session) return { data: null, error: { message: "gone", code: "P0002" } };
    if (session.status === "ended") return { data: session.closed_at, error: null };
    const { error } = stack.updateSession(target, { status: "ended" });
    return error ? { data: null, error } : { data: session.closed_at, error: null };
  }

  // #152. The counter itself is not stood in for: `private.take_session_view` is covered where it
  // lives, by supabase/tests/database/live_view_limit.test.sql under pgTAP, and a conformance run
  // is nowhere near six hundred calls. What this has to be faithful about is the rest of the
  // function — the four columns a student may know, and no rows at all for a session that is gone.
  if (name === "begin_session_view") {
    const session = stack.sessions.find((row) => row.id === String(args.target_session));
    if (!session) return { data: [], error: null };
    return {
      data: [
        {
          refusal: null,
          session_status: session.status,
          session_mode: session.mode,
          session_position: session.current_position,
          session_reveal: session.reveal,
          session_items: session.item_set,
          session_timer_seconds: session.timer_seconds,
          session_ends_at: session.item_ends_at,
          session_remaining_ms: session.timer_remaining_ms,
          server_now: new Date(stack.peek()).toISOString(),
        },
      ],
      error: null,
    };
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
    if (lateFor(stack, session)) {
      return { data: [{ refusal: "time_up", item_position: null, item_id: null }], error: null };
    }
    // #185: a student-paced phone names the item it is answering, by its place in the set.
    if (session.mode === "student_paced") {
      const asked = Number(args.requested_position);
      const itemId = session.item_set[asked - 1];
      if (!Number.isInteger(asked) || itemId === undefined) {
        return {
          data: [{ refusal: "wrong_item", item_position: null, item_id: null }],
          error: null,
        };
      }
      return { data: [{ refusal: null, item_position: asked, item_id: itemId }], error: null };
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
    if (lateFor(stack, session)) {
      return { data: [{ refusal: "time_up", submitted_at: null }], error: null };
    }
    if (
      (session.mode !== "student_paced" && session.current_position !== position) ||
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

  // #182's three, said the way the migration says them.
  if (name === "server_clock") return { data: new Date(stack.peek()).toISOString(), error: null };

  if (name === "extend_item_timer" || name === "stop_item_timer") {
    const target = String(args.target);
    const session = stack.sessions.find((row) => row.id === target);
    if (!session) return { data: null, error: { message: "gone", code: "P0002" } };
    const current = timedState(session);
    if (name === "stop_item_timer") {
      if (current.timer.endsAt === null && current.timer.remainingMs === null) {
        return { data: null, error: null };
      }
      const { error } = stack.updateSession(target, {
        item_ends_at: null,
        timer_remaining_ms: null,
      });
      return { data: null, error };
    }
    const next = extendTimer(current, stack.peek());
    if (next === null) return { data: null, error: { message: "no timer", code: "22023" } };
    const { error } = stack.updateSession(target, {
      item_ends_at: next.endsAt === null ? null : new Date(next.endsAt).toISOString(),
      timer_remaining_ms: next.remainingMs,
    });
    return { data: null, error };
  }

  return { data: null, error: { message: `unknown function ${name}` } };
}

/**
 * The position rules `private.guard_session_change` holds since #183 (migration
 * 20260923060000_session_goto.sql), with the range check `sessions_position_within_set` beside
 * it. Null when the write may go ahead, else the sentence Postgres would raise.
 *
 *   * Leaving the lobby puts the room on item 1 and nowhere else.
 *   * Otherwise the room moves only while running or paused, stays running or paused, and moves
 *     to an item the set has — any of them, forwards or back.
 */
function refusedMove(before: FakeSessionRow, after: FakeSessionRow): string | null {
  const paced = refusedPacing(before, after);
  if (paced !== null) return paced;
  if (before.current_position === after.current_position) return null;
  if (before.status === "lobby") {
    return after.status === "running" && after.current_position === 1
      ? null
      : "a session starts on its first item";
  }
  const open = (status: SessionStatus) => status === "running" || status === "paused";
  if (!open(before.status) || !open(after.status)) {
    return "a session moves between items only while it is running or paused";
  }
  if (after.current_position === null) return "a session's position cannot be cleared";
  if (after.current_position < 1 || after.current_position > after.item_set.length) {
    return 'new row for relation "sessions" violates check constraint "sessions_position_within_set"';
  }
  return null;
}

/**
 * The pacing rules `private.guard_session_change` holds since #185 (migration
 * 20260923080000_student_paced.sql), with `sessions_student_paced_untimed` beside them.
 *
 *   * The pacing is fixed once the room has left the lobby.
 *   * A student-paced room has no item to move once it has started, and no clock.
 *   * Answers once shown stay shown until the room ends.
 */
function refusedPacing(before: FakeSessionRow, after: FakeSessionRow): string | null {
  if (after.mode !== before.mode && before.status !== "lobby") {
    return "a session's pacing cannot change once it has started";
  }
  if (after.mode !== "student_paced") return null;
  if (after.timer_seconds !== null) {
    return 'new row for relation "sessions" violates check constraint "sessions_student_paced_untimed"';
  }
  if (before.status !== "lobby" && after.current_position !== before.current_position) {
    return "a student-paced session has no current item to move";
  }
  if (before.reveal && !after.reveal && after.status !== "ended") {
    return "a student-paced session's answers stay shown";
  }
  return null;
}
