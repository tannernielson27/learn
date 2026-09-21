/**
 * `POST /api/live/channel` — a fresh Realtime channel token for the participant making the request
 * (#149).
 *
 * The play page's server render hands a phone its first token. It lasts thirty minutes, and a
 * class runs longer than that, so this is where the phone gets the next one: five minutes before
 * the one it holds expires, from inside the Realtime client's own `accessToken` callback (see
 * `channelTokenSource.ts`).
 *
 * **Who is asking is the cookie's answer, not the token's.** The token being replaced is not
 * presented and would not be believed if it were: `deps.verify` is `participantFromCookie`, the
 * one verifier #133 left, and it runs `resume_participant` against the stored hash exactly as the
 * view and submit routes do. So a participant whose row has been deleted — or whose session has —
 * stops getting tokens, and their socket drops when the last one expires. That is the revocation
 * story, and it is the cookie's.
 *
 * **Charged to the view limit, not given a third one.** `begin_session_view` is the per-participant
 * budget for reading the room (#152), and a token is a way of reading the room. At two refreshes an
 * hour it costs nothing against 600 calls per five minutes, and a third counter would be a third
 * place for "how often may you?" to be decided.
 *
 * **Ended rooms get no token.** There is nothing left to watch, and the phone is already on the
 * "this session has ended" screen.
 */
import type { ChannelSigningKey } from "@/lib/supabase/channelToken";
import { mintChannelToken } from "@/lib/supabase/channelToken";
import { LIVE_ROUTE_ERRORS, asRefusal, fail, refuse, type LiveRouteDeps } from "./routeDeps";
import { NO_STORE_HEADERS, type ChannelCredential } from "./wire";

export interface ChannelRouteDeps extends LiveRouteDeps {
  /** Read lazily, so a request that is refused never touches the key. Throws when it is unset. */
  signingKey: () => ChannelSigningKey;
  now?: () => number;
}

export async function issueChannelToken(
  request: Request,
  deps: ChannelRouteDeps,
): Promise<Response> {
  // JSON only, the rule the two other participant routes hold a request to.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return refuse("malformed");
  }

  const participant = await deps.verify(request);
  if (participant === null) return fail(401, LIVE_ROUTE_ERRORS.signedOut);

  const { data: opened, error } = await deps.service.rpc("begin_session_view", {
    target_session: participant.sessionId,
    participant: participant.participantId,
  });
  if (error) return fail(500, LIVE_ROUTE_ERRORS.failed);
  const session = opened?.[0];
  if (!session) return fail(401, LIVE_ROUTE_ERRORS.signedOut);
  const refusal = asRefusal(session.refusal);
  if (refusal !== null) return refuse(refusal);
  if (session.refusal) return fail(500, LIVE_ROUTE_ERRORS.failed);
  if (session.session_status === "ended") return refuse("not_open");

  // Not caught: an unset key is a deployment fault, and it should fail loudly in the logs rather
  // than read to a student as a room that quietly stopped moving.
  const minted = mintChannelToken(participant, deps.signingKey(), deps.now?.() ?? Date.now());
  const payload: ChannelCredential = { token: minted.token, expiresAt: minted.expiresAt };
  return Response.json(payload, { headers: NO_STORE_HEADERS });
}
