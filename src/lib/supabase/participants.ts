import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { ParticipantToken } from "@/lib/live/participantToken";
import type { Database } from "./database.types";
import type { SessionMode, SessionStatus } from "./sessions";

type Client = SupabaseClient<Database>;

/**
 * The two calls a student's request makes, and nothing else.
 *
 * Both `client` arguments must be the service-role client: `join_session` and
 * `resume_participant` are granted to that role alone, because the person on the other end has no
 * account and so no row level security can speak for them. Neither function is a table read — the
 * warning on `createSupabaseServiceClient` about never handing that client a table read on a
 * student's behalf is the reason these are functions in the first place.
 *
 * Neither returns an item, an item set or an answer key (ADR 0003). What a student's browser is
 * given here is their own name and their own session's status, mode and title.
 */

export interface JoinedParticipant {
  participantId: string;
  /** The secret half of the participant token. Seen once, then only ever as a hash. */
  secret: string;
}

export type JoinSessionResult =
  | { ok: true; participant: JoinedParticipant }
  | { ok: false; reason: "gone" | "ended" | "full" | "failed" };

export interface ResumedParticipant {
  participantId: string;
  displayName: string;
  /**
   * Epoch milliseconds, from the database's clock. The roster at the front of the class orders by
   * it (#132), which is why it comes from the row rather than from the phone.
   */
  joinedAt: number;
  sessionStatus: SessionStatus;
  mode: SessionMode;
  title: string;
}

/**
 * Creates the participant for a session that `resolveSessionCode` has already found. The session
 * id is never taken from the browser: it is what resolving a typed code returned, which is what
 * keeps the per-address limit on wrong codes in front of this call.
 */
export async function joinSession(
  client: Client,
  sessionId: string,
  displayName: string,
): Promise<JoinSessionResult> {
  const { data, error } = await client.rpc("join_session", {
    target_session: sessionId,
    chosen_name: displayName,
  });
  if (error) return { ok: false, reason: joinReason(error) };

  const row = data?.[0];
  if (!row) return { ok: false, reason: "failed" };
  return {
    ok: true,
    participant: { participantId: row.participant_id, secret: row.rejoin_secret },
  };
}

function joinReason(error: PostgrestError): "gone" | "ended" | "full" | "failed" {
  if (error.code === "P0002") return "gone";
  // The only 22023 a validated name can reach: the session ended between resolving and joining.
  if (error.code === "22023") return "ended";
  if (error.code === "54000") return "full";
  return "failed";
}

/**
 * Turns a participant token back into the participant it names, and marks them seen. Null covers
 * every way a token can fail — unknown, tampered, belonging to another session, or naming a
 * participant that no longer exists — because the caller's answer is the same for all of them:
 * join again.
 *
 * Fails closed. A database that cannot answer is not a reason to let someone in.
 */
export async function resumeParticipant(
  client: Client,
  token: ParticipantToken,
): Promise<ResumedParticipant | null> {
  const { data, error } = await client.rpc("resume_participant", {
    target_participant: token.participantId,
    target_session: token.sessionId,
    presented_secret: token.secret,
  });
  if (error) return null;

  const row = data?.[0];
  if (!row) return null;
  // A timestamptz arrives as a string. An unparseable one would poison the roster's ordering with
  // a NaN, so it falls back to the epoch: the earliest possible seat, and never a crash.
  const joinedAt = Date.parse(row.participant_joined_at);
  return {
    participantId: row.participant_id,
    displayName: row.participant_name,
    joinedAt: Number.isNaN(joinedAt) ? 0 : joinedAt,
    sessionStatus: row.session_status,
    mode: row.session_mode,
    title: row.session_title,
  };
}
