import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { ParticipantToken } from "@/lib/live/participantToken";
import type { Database } from "./database.types";
import type { SessionMode, SessionStatus } from "./sessions";
import type { VerifiedAccount } from "./verifiedAccount";

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
 *
 * `profileId` is the signed-in account the server has just verified (ADR 0013), never an id from
 * the request; null for a guest. `join_session` links it only when the session is for a class and
 * the account is a current member of that class, and joins anonymously otherwise. A member who is
 * already in the session gets their participant back, with a new secret.
 */
export async function joinSession(
  client: Client,
  sessionId: string,
  displayName: string,
  profileId: string | null = null,
): Promise<JoinSessionResult> {
  const { data, error } = await client.rpc("join_session", {
    target_session: sessionId,
    chosen_name: displayName,
    // Named only when there is an account, so a guest's call is the call it always was.
    ...(profileId ? { joining_profile: profileId } : {}),
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
 * What checking a participant token came to. Three answers, because there are three things to do
 * about it (#407):
 *
 *   * `ok` — this is that participant.
 *   * `unknown` — the database answered, and the token names nobody: unknown, tampered, belonging
 *     to another session, or naming a participant that no longer exists. The caller cannot tell
 *     those apart and the answer to all of them is the same: join again.
 *   * `unavailable` — the database did not answer. Nothing is known about this token at all, so
 *     the person is neither let in **nor told they are out**. Reading this as `unknown` is what
 *     sent a phone to the join form in the middle of a class because one request timed out.
 */
export type ParticipantCheck =
  | { ok: true; participant: ResumedParticipant }
  | { ok: false; reason: "unknown" }
  | { ok: false; reason: "unavailable"; error: PostgrestError; status: number };

/**
 * Turns a participant token back into the participant it names, and marks them seen.
 *
 * Fails closed either way: nothing but `ok` lets anyone in.
 */
export async function checkParticipant(
  client: Client,
  token: ParticipantToken,
): Promise<ParticipantCheck> {
  const { data, error, status } = await client.rpc("resume_participant", {
    target_participant: token.participantId,
    target_session: token.sessionId,
    presented_secret: token.secret,
  });
  if (error) return { ok: false, reason: "unavailable", error, status };

  const row = data?.[0];
  if (!row) return { ok: false, reason: "unknown" };
  // A timestamptz arrives as a string. An unparseable one would poison the roster's ordering with
  // a NaN, so it falls back to the epoch: the earliest possible seat, and never a crash.
  const joinedAt = Date.parse(row.participant_joined_at);
  return {
    ok: true,
    participant: {
      participantId: row.participant_id,
      displayName: row.participant_name,
      joinedAt: Number.isNaN(joinedAt) ? 0 : joinedAt,
      sessionStatus: row.session_status,
      mode: row.session_mode,
      title: row.session_title,
    },
  };
}

/**
 * Whose participant a token names, for the join action and `heldBySomeoneElse` (ADR 0013).
 *
 *   * `linkedProfile` — the account the participant is linked to, or null for an anonymous one.
 *   * `accountIsMember` — whether `account` is a current member of the session's class.
 *
 * `account` must be the id the server verified, never one from the request, or null for a browser
 * where nobody is signed in: then `accountIsMember` is false and only `linkedProfile` says
 * anything. Neither field is
 * ever sent to a browser: the join action reads them to decide whether a browser already in the
 * room comes back as that participant, so that a shared laptop does not hand one student's
 * participant to the next person who signs in on it. A token that names nobody is `unknown`, a
 * database that did not answer `unavailable`, as for `checkParticipant`.
 */
export type ParticipantLink =
  | { ok: true; linkedProfile: string | null; accountIsMember: boolean }
  | { ok: false; reason: "unknown" | "unavailable" };

export async function participantLink(
  client: Client,
  token: ParticipantToken,
  account: string | null,
): Promise<ParticipantLink> {
  const { data, error } = await client.rpc("participant_link", {
    target_participant: token.participantId,
    target_session: token.sessionId,
    presented_secret: token.secret,
    // The generated type says string; the function takes null, and `is_class_member` answers
    // false for it.
    account: account as string,
  });
  if (error) return { ok: false, reason: "unavailable" };

  const row = data?.[0];
  if (!row) return { ok: false, reason: "unknown" };
  return {
    ok: true,
    linkedProfile: row.linked_profile ?? null,
    accountIsMember: row.account_is_member === true,
  };
}

/**
 * Whether a browser holding this token holds someone else's participant: one linked to an account
 * (ADR 0013) that is not the one signed in here, including when nobody is. The phone's page asks
 * it before resuming, so a cookie left behind on a shared browser does not let the next person
 * carry on as that student.
 *
 * False whenever it cannot be sure. An account check that was `unavailable` is not asked about at
 * all, and a database that did not answer is not a reason either: a failed check must not take a
 * member out of the room mid-class (decision 3), and the page has just matched the token.
 */
export async function heldBySomeoneElse(
  client: Client,
  token: ParticipantToken,
  viewer: VerifiedAccount,
): Promise<boolean> {
  if (viewer.status === "unavailable") return false;
  const account = viewer.status === "signed_in" ? viewer.id : null;
  const link = await participantLink(client, token, account);
  return link.ok && link.linkedProfile !== null && link.linkedProfile !== account;
}

/**
 * `checkParticipant` for a caller with one thing to do about every failure. Null covers a token
 * that names nobody **and** a database that did not answer, so only use it where "not known to be
 * a participant" is all that is being asked — joining, where the answer to both is a fresh join.
 * Anything that would tell a person they have left the room must use `checkParticipant`.
 */
export async function resumeParticipant(
  client: Client,
  token: ParticipantToken,
): Promise<ResumedParticipant | null> {
  const checked = await checkParticipant(client, token);
  return checked.ok ? checked.participant : null;
}
