/**
 * What the two live-session route handlers need, and how they get it in production.
 *
 * Injected rather than imported so the conformance suite can drive the real handlers against a
 * stand-in database, and so how a request becomes a participant can be changed without touching
 * either handler.
 *
 * ## One identity, not two (#133)
 *
 * #129 and #131 were built in parallel and shipped two answers to "who is speaking?". #129's join
 * mints an opaque secret in an httpOnly cookie and checks it with `resume_participant`; #131's
 * default verifier expected an HMAC bearer token this server signed with a
 * `LIVE_PARTICIPANT_SECRET`. A student who joined therefore carried a credential the answering
 * routes would not accept, and nothing converted one into the other — so a session could be
 * joined, watched and ended, but never answered.
 *
 * There is now one scheme and it is #129's. The bearer token, its module and its environment
 * variable are **deleted** rather than left standing beside the cookie: two ways to be a
 * participant is two places for "may this person answer?" to be decided, and an attacker picks
 * the weaker. #129 wrote down why the cookie is the stronger of the two — the secret is drawn by
 * Postgres, only its SHA-256 is stored, deleting the row revokes it, it names one participant in
 * one session, and there is no signing key whose leak would mint any participant in any room. It
 * also needs nothing set in any environment, which is why `LIVE_PARTICIPANT_SECRET` is gone from
 * `.env.example` and no owner has to set it.
 *
 * The cost is one round trip per authenticated call where a signed token would have been free.
 * That is not a real cost here: both handlers read from the database anyway, and
 * `resume_participant` doubles as the `last_seen_at` touch the roster already wanted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveRefusal } from "@/lib/live";
import { LIVE_REFUSALS } from "@/lib/live";
import { parseParticipantToken, readParticipantCookie } from "@/lib/live/participantToken";
import type { Database } from "@/lib/supabase/database.types";
import { resumeParticipant } from "@/lib/supabase/participants";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { NO_STORE_HEADERS, type RefusalPayload } from "./wire";

/** Who a checked request says is speaking: one participant, in one session, and nothing else. */
export interface VerifiedParticipant {
  sessionId: string;
  participantId: string;
}

/** Turns a request into the participant making it, or null. */
export type ParticipantVerifier = (request: Request) => Promise<VerifiedParticipant | null>;

export interface LiveRouteDeps {
  verify: ParticipantVerifier;
  /**
   * The service-role client. It bypasses row level security, which is the point: a participant
   * has no Postgres identity at all. Every table it touches here is one no student role can read,
   * and every write goes through `record_session_response`, which does its own checking.
   */
  service: SupabaseClient<Database>;
}

/**
 * The verifier both routes run in production: the participant cookie, checked against the
 * database on every call.
 *
 * Nothing the request asserts is believed. The cookie's shape is checked here — which saves a
 * round trip for every piece of rubbish anyone posts, and decides nothing else — and then
 * `resume_participant` matches its secret against the stored hash. A tampered secret, a token for
 * a participant that no longer exists and a token for a deleted session all come back null,
 * because the answer to all three is the same: you are not in this room.
 *
 * The session id is the token's, not the resumed row's. They are the same id — the function
 * matches on it — and using the one that was checked keeps both handlers reading from the token
 * they verified rather than from anything derived after it.
 *
 * Fails closed: a database that cannot answer is not a reason to let someone answer a question.
 */
export function participantFromCookie(service: SupabaseClient<Database>): ParticipantVerifier {
  return async (request: Request): Promise<VerifiedParticipant | null> => {
    const token = parseParticipantToken(readParticipantCookie(request.headers.get("cookie")));
    if (token === null) return null;
    const resumed = await resumeParticipant(service, token);
    if (resumed === null) return null;
    return { sessionId: token.sessionId, participantId: resumed.participantId };
  };
}

export function liveRouteDeps(): LiveRouteDeps {
  // One client for both, so a request opens one connection rather than two.
  const service = createSupabaseServiceClient();
  return { verify: participantFromCookie(service), service };
}

export const LIVE_ROUTE_ERRORS = {
  signedOut: "You have not joined this session.",
  unplayable: "This item has a problem and cannot be shown.",
  tooLarge: "That answer is too large to check.",
  failed: "The session could not be reached. Try again.",
} as const;

/** How an ordinary classroom refusal is carried over HTTP. Codes, not prose, are what branch. */
const REFUSAL_STATUS: Partial<Record<LiveRefusal, number>> = {
  not_joined: 401,
  rate_limited: 429,
  malformed: 400,
  wrong_type: 400,
  no_name: 400,
  name_too_long: 400,
  unknown_code: 404,
};

export function refuse(refusal: LiveRefusal): Response {
  const body: RefusalPayload = { refusal, error: LIVE_REFUSALS[refusal] };
  return Response.json(body, {
    // 409 is the default because every other refusal here is "the room is not in a state where
    // that means anything": paused, revealed, moved on, over.
    status: REFUSAL_STATUS[refusal] ?? 409,
    headers: NO_STORE_HEADERS,
  });
}

export function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE_HEADERS });
}

/** Every refusal the database answers with, checked rather than trusted. */
const DATABASE_REFUSALS = new Set<string>([
  "not_open",
  "not_started",
  "paused",
  "already_revealed",
  "wrong_item",
  "already_answered",
  "rate_limited",
  // #182: the item's time, and its two seconds of grace, had run out when the answer arrived.
  "time_up",
]);

/**
 * Reads a refusal code out of a function's answer. An unrecognised string is not passed through as
 * a refusal — it would end up in a person's face as an empty message — it is a fault.
 */
export function asRefusal(value: unknown): LiveRefusal | null {
  return typeof value === "string" && DATABASE_REFUSALS.has(value) ? (value as LiveRefusal) : null;
}
