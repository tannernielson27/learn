import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { isSessionCode, normalizeSessionCode } from "@/lib/live/sessionCode";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

export type SessionStatus = Database["public"]["Enums"]["session_status"];
export type SessionMode = Database["public"]["Enums"]["session_mode"];

/** What a host's console needs. Deliberately not the whole row: no item set, no answer keys. */
export interface HostSession {
  id: string;
  title: string;
  code: string;
  status: SessionStatus;
  mode: SessionMode;
  itemCount: number;
  openedAt: string;
  closedAt: string | null;
}

export type SessionSource = { kind: "bank"; id: string } | { kind: "case_study"; id: string };

export type StartSessionResult =
  { ok: true; sessionId: string } | { ok: false; reason: "gone" | "empty" | "failed" };

export type EndSessionResult =
  { ok: true; closedAt: string } | { ok: false; reason: "gone" | "failed" };

/**
 * What a typed code turned out to be. "unknown" covers a code that never existed and a session
 * that has ended alike — the database answers both the same way, and so does this.
 */
export type ResolvedCode =
  | {
      status: "open";
      sessionId: string;
      sessionStatus: SessionStatus;
      mode: SessionMode;
      title: string;
    }
  | { status: "unknown" }
  | { status: "rate_limited" }
  | { status: "unavailable" };

/**
 * Starts a session from a bank or a case study. Every real decision — which org, which items, the
 * join code, the collision retry — is made inside `start_session`, under the caller's own row
 * level security. This only names the source and translates the refusals.
 */
export async function startSession(
  supabase: Client,
  source: SessionSource,
): Promise<StartSessionResult> {
  const args =
    source.kind === "bank" ? { source_bank: source.id } : { source_case_study: source.id };
  const { data, error } = await supabase.rpc("start_session", args);
  if (error) return { ok: false, reason: startReason(error) };
  if (!data) return { ok: false, reason: "failed" };
  return { ok: true, sessionId: data };
}

function startReason(error: PostgrestError): "gone" | "empty" | "failed" {
  // A source in another org, or one that has been deleted, reads the same way: gone.
  if (error.code === "P0002") return "gone";
  if (error.code === "22023") return "empty";
  return "failed";
}

/** Ends a session. Idempotent in the database, so a double-tapped button is not an error. */
export async function endSession(supabase: Client, sessionId: string): Promise<EndSessionResult> {
  const { data, error } = await supabase.rpc("end_session", { target: sessionId });
  if (error) return { ok: false, reason: error.code === "P0002" ? "gone" : "failed" };
  if (!data) return { ok: false, reason: "failed" };
  return { ok: true, closedAt: data };
}

/** The host's own view of a session. Row level security keeps it inside the host's org. */
export async function readHostSession(
  supabase: Client,
  sessionId: string,
): Promise<HostSession | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, title, code, status, mode, item_set, opened_at, closed_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    title: data.title,
    code: data.code,
    status: data.status,
    mode: data.mode,
    itemCount: Array.isArray(data.item_set) ? data.item_set.length : 0,
    openedAt: data.opened_at,
    closedAt: data.closed_at,
  };
}

/**
 * Turns a typed code into a session id, and nothing else.
 *
 * `client` must be the service-role client: `resolve_session_code` is granted to that role alone,
 * which is what makes `clientIp` a key nobody can forge. Pass the address from `clientIp()` in
 * `@/lib/auth/signInRateLimit` (#134) — the same derivation the sign-in limit uses, rather than a
 * second one. Off the platform it returns null and the database puts the call in one shared
 * bucket, which is what it already does for a deployed request that carries no address.
 *
 * Fails closed. A database that cannot answer is reported as unavailable rather than open,
 * because a session that cannot be read cannot be joined either way.
 */
export async function resolveSessionCode(
  client: Client,
  typed: string,
  clientIp: string | null,
): Promise<ResolvedCode> {
  const code = normalizeSessionCode(typed);
  // Something that could never be a code is answered here rather than in the database. It costs a
  // round trip and a slice of the caller's budget to be told what the alphabet already says, and
  // it weakens nothing: a malformed code cannot match a row.
  if (!isSessionCode(code)) return { status: "unknown" };

  const { data, error } = await client.rpc("resolve_session_code", {
    session_code: code,
    client_key: clientIp ?? undefined,
  });
  if (error) return { status: error.code === "PT429" ? "rate_limited" : "unavailable" };

  const row = data?.[0];
  if (!row) return { status: "unknown" };
  return {
    status: "open",
    sessionId: row.session_id,
    sessionStatus: row.session_status,
    mode: row.session_mode,
    title: row.session_title,
  };
}
