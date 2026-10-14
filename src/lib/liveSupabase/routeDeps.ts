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
 * On the submission and channel-token routes that is not a real cost: each is called once per
 * item or twice an hour. On the view route it was (#407): a whole class calls it in the same
 * instant, so there the check is folded into `open_session_view` with everything else the route
 * reads, and this verifier is only what it falls back to (`viewRoute.ts`).
 *
 * ## Not answering is not the same as saying no (#407)
 *
 * The verifier used to answer null for a token that names nobody **and** for a database that did
 * not answer, and every route turned null into 401. So a request that timed out on its way to
 * Supabase told a phone it was not in the room: the channel-token refresh treats 401 as final,
 * closes the socket and reloads the page, and the page sent the student to the join form. A
 * verification now says which of the two it was, and a database that did not answer is a 503 the
 * phone may try again, never a 401. It still fails closed: nobody is let in on a failure.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveRefusal } from "@/lib/live";
import { LIVE_REFUSALS } from "@/lib/live";
import {
  parseParticipantToken,
  readParticipantCookie,
  type ParticipantToken,
} from "@/lib/live/participantToken";
import type { Database } from "@/lib/supabase/database.types";
import { checkParticipant } from "@/lib/supabase/participants";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { NO_STORE_HEADERS, type RefusalPayload } from "./wire";

/** Who a checked request says is speaking: one participant, in one session, and nothing else. */
export interface VerifiedParticipant {
  sessionId: string;
  participantId: string;
}

/**
 * What checking a request came to: the participant making it, a request that is nobody's
 * (`signed_out`), or a database that did not answer (`unavailable`). See "Not answering is not the
 * same as saying no" above.
 */
export type Verification =
  | { ok: true; participant: VerifiedParticipant }
  | { ok: false; reason: "signed_out" | "unavailable" };

/** Turns a request into the participant making it, or into why it could not. */
export type ParticipantVerifier = (request: Request) => Promise<Verification>;

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
 * The participant token a request carries in its cookie, or null. Shape only: nothing is checked
 * against the database here, and nothing may be decided from it but "not worth a round trip".
 */
export function readParticipantToken(request: Request): ParticipantToken | null {
  return parseParticipantToken(readParticipantCookie(request.headers.get("cookie")));
}

/**
 * The verifier the routes run in production: the participant cookie, checked against the
 * database on every call.
 *
 * Nothing the request asserts is believed. The cookie's shape is checked here — which saves a
 * round trip for every piece of rubbish anyone posts, and decides nothing else — and then
 * `resume_participant` matches its secret against the stored hash. A tampered secret, a token for
 * a participant that no longer exists and a token for a deleted session are all `signed_out`,
 * because the answer to all three is the same: you are not in this room.
 *
 * The session id is the token's, not the resumed row's. They are the same id — the function
 * matches on it — and using the one that was checked keeps both handlers reading from the token
 * they verified rather than from anything derived after it.
 *
 * Fails closed: a database that cannot answer is not a reason to let someone answer a question.
 * It is not a reason to tell them they have left either, so that is `unavailable`, and it is
 * written to the log here, where the error still is.
 */
export function participantFromCookie(service: SupabaseClient<Database>): ParticipantVerifier {
  return async (request: Request): Promise<Verification> => {
    const token = readParticipantToken(request);
    if (token === null) return { ok: false, reason: "signed_out" };
    const checked = await checkParticipant(service, token);
    if (checked.ok) {
      return {
        ok: true,
        participant: {
          sessionId: token.sessionId,
          participantId: checked.participant.participantId,
        },
      };
    }
    if (checked.reason === "unknown") return { ok: false, reason: "signed_out" };
    reportLiveFault({
      route: routeOf(request),
      call: "resume_participant",
      sessionId: token.sessionId,
      error: checked.error,
      status: checked.status,
    });
    return { ok: false, reason: "unavailable" };
  };
}

export function liveRouteDeps(): LiveRouteDeps {
  // One client for both, so a request opens one connection rather than two.
  const service = createSupabaseServiceClient();
  return { verify: participantFromCookie(service), service };
}

export const LIVE_ROUTE_ERRORS = {
  signedOut: "You have not joined this live session.",
  unplayable: "This question has a problem and cannot be shown.",
  tooLarge: "That answer is too large to check.",
  failed: "The live session could not be reached. Try again.",
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

/**
 * A call to the database did not come back (#407): a timeout, a dropped connection, a 5xx from
 * the Data API. Nothing was decided about this request, so the answer is 503 — try again — and
 * never 401, which a phone reads as having left the room, nor 500, which says the app is broken.
 * `Retry-After` is there for any other client; the phone keeps its own short, jittered waits
 * (`participantTransport.ts`).
 */
export function unavailable(): Response {
  return Response.json(
    { error: LIVE_ROUTE_ERRORS.failed, retryable: true },
    { status: 503, headers: { ...NO_STORE_HEADERS, "Retry-After": "1" } },
  );
}

/**
 * The answer to a database call that came back as an error, by the HTTP status the Data API gave
 * it. No answer at all (0), a 5xx, or no status to read is `unavailable`: it may work next time.
 * A 4xx is the database refusing the call itself (PostgREST answers a bad cast, a missing grant
 * or a raised exception that way), which will fail the same way however often it is asked. That
 * is a 500, which the phone does not retry: a class must not hammer a call that cannot succeed.
 */
export function faultResponse(status: number | undefined): Response {
  const refusedByDatabase = typeof status === "number" && status >= 400 && status < 500;
  return refusedByDatabase ? fail(500, LIVE_ROUTE_ERRORS.failed) : unavailable();
}

/** One failed call, as the log is told about it. */
export interface LiveFault {
  /** The route's path, such as `/api/live/view`. */
  route: string;
  /** The function or table that was being called. */
  call: string;
  sessionId: string | null;
  error: unknown;
  /** The HTTP status the Data API answered with; 0 when the request never got an answer. */
  status?: number;
}

const LOGGED_TEXT_MAX = 300;

function clipped(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value.slice(0, LOGGED_TEXT_MAX) : null;
}

/**
 * What of an error is written down. Chosen field by field rather than passed through, because of
 * what a database error can carry: Postgres puts the failing row in `details` ("Failing row
 * contains ..."), and on these routes a row is a student's answer or a display name.
 *
 *   * `code` and `message` — Postgres's or PostgREST's own, which name the fault and no row.
 *   * `cause` — only for a request that never reached the Data API, where supabase-js writes
 *     `details` itself and its "Caused by:" line is the socket error (`ECONNRESET`,
 *     `UND_ERR_CONNECT_TIMEOUT`, ...). That line is the whole reason this log exists. A `details`
 *     that came from the database is never read.
 */
export function describeFault(error: unknown): {
  code: string | null;
  message: string | null;
  cause: string | null;
} {
  if (typeof error !== "object" || error === null) {
    return { code: null, message: clipped(String(error)), cause: null };
  }
  const { code, message, details } = error as Record<string, unknown>;
  const fromClient = typeof code !== "string" || code === "";
  const causedBy =
    fromClient && typeof details === "string"
      ? (details.split("\n").find((line) => line.startsWith("Caused by:")) ?? null)
      : null;
  return { code: clipped(code), message: clipped(message), cause: clipped(causedBy) };
}

/**
 * Writes a failed database call to the server's log (#407), so the next time a route answers 503
 * there is something to read: which route, which call, the error's code and message, and which
 * session. Never an answer key, an answer, a display name, a cookie or a token: none of them is
 * handed to this function, and `describeFault` reads no field that could hold one.
 */
export function reportLiveFault(fault: LiveFault): void {
  console.error("[live] a database call failed", {
    route: fault.route,
    call: fault.call,
    sessionId: fault.sessionId,
    status: fault.status ?? null,
    ...describeFault(fault.error),
  });
}

/** The path a request was made to, for the log. Never the query string. */
export function routeOf(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "unknown";
  }
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
