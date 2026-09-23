/**
 * `POST /api/live/submit` — a participant answers the item the room is on.
 *
 * ADR 0003: scoring runs on the server and the client never holds the key. So this route, and not
 * the browser, reads the item with its key, scores it through `scoreSubmission` — **the** scoring
 * entry point (#56); there is no second one — and writes the marks down. What comes back is the
 * acknowledgement and nothing else: `{ itemId, submittedAt }`. Not the score, not the key, not the
 * rationale. Those reach the participant through `/api/live/view` when the host reveals, which is
 * the only moment they are allowed to.
 *
 * The room's state is checked twice, by `begin_session_submission` before the scoring and by
 * `record_session_response` in the same statement as the insert. That is not belt and braces: a
 * host can reveal or advance while an answer is in flight, and only the second check is in the
 * same statement as the write, so only the second one can actually decide.
 */
import { MAX_ITEM_PAYLOAD_BYTES, withinItemSizeLimit } from "@/lib/authoring/payloadSize";
import { SUBMIT_ERRORS, parseSubmission, scoreSubmission } from "@/lib/ngn/submit";
import { fromItemRow } from "@/lib/supabase/itemRows";
import type { Json } from "@/lib/supabase/database.types";
import { LIVE_ROUTE_ERRORS, asRefusal, fail, refuse, type LiveRouteDeps } from "./routeDeps";
import { NO_STORE_HEADERS, type SubmitAckPayload } from "./wire";

const ITEM_COLUMNS = "type, cjmm_step, tags, version, content, answer_key, rationale, scoring";

export async function submitSessionResponse(
  request: Request,
  deps: LiveRouteDeps,
): Promise<Response> {
  // JSON only, so a cross-site form post (text/plain, urlencoded) cannot reach the scorer.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return refuse("malformed");
  }

  const participant = await deps.verify(request);
  if (participant === null) return refuse("not_joined");

  // A declared oversized body is refused before it is read; the parsed check below catches a
  // truthful content-length that still describes something enormous.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_ITEM_PAYLOAD_BYTES) {
    return fail(413, LIVE_ROUTE_ERRORS.tooLarge);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("malformed");
  }
  if (!withinItemSizeLimit(body)) return fail(413, LIVE_ROUTE_ERRORS.tooLarge);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return refuse("malformed");

  const { itemId, response, position } = body as {
    itemId?: unknown;
    response?: unknown;
    position?: unknown;
  };
  // The item's own id, not the row's: what a browser holds is the item `/api/live/view` gave it,
  // and `items.id` is a uuid the participant never sees. The two are compared below, once the row
  // has been read and reassembled.
  if (typeof itemId !== "string" || itemId === "" || itemId.length > 128) {
    return refuse("malformed");
  }
  // #185: which item of a student-paced set this answers, by its place. Optional, because an
  // instructor-paced room is on one item and the database ignores it there.
  if (position !== undefined && !isPosition(position)) return refuse("malformed");

  // Charges this participant's rate limit and answers what the room is on, in one round trip. A
  // flood of unreadable answers costs a counter update rather than a scoring pass.
  const { data: opened, error: openError } = await deps.service.rpc("begin_session_submission", {
    target_session: participant.sessionId,
    participant: participant.participantId,
    ...(position === undefined ? {} : { requested_position: position }),
  });
  if (openError) return fail(500, LIVE_ROUTE_ERRORS.failed);
  const opening = opened?.[0];
  if (!opening) return fail(500, LIVE_ROUTE_ERRORS.failed);
  const openingRefusal = asRefusal(opening.refusal);
  if (openingRefusal !== null) return refuse(openingRefusal);
  // A `returns table` function carries no nullability into the generated types, so these are
  // checked for emptiness rather than compared with null: a refused call really does answer with
  // nulls here, whatever the type says.
  if (!opening.item_id || !opening.item_position) return refuse("wrong_item");

  const { data: row, error: itemError } = await deps.service
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("id", opening.item_id)
    .maybeSingle();
  if (itemError) return fail(500, LIVE_ROUTE_ERRORS.failed);
  if (!row) return fail(409, LIVE_ROUTE_ERRORS.unplayable);
  const stored = fromItemRow(row);
  if (!stored.ok) return fail(409, LIVE_ROUTE_ERRORS.unplayable);

  // The room moved on between this page rendering the item and this answer arriving.
  if (stored.value.id !== itemId) return refuse("wrong_item");

  const parsed = parseSubmission({ response }, stored.value.type);
  if (!parsed.ok) {
    return refuse(parsed.error === SUBMIT_ERRORS.wrongType ? "wrong_type" : "malformed");
  }

  // The key, the rationale and the scoring come back with the score and stay in this function.
  const scored = scoreSubmission(stored.value, parsed.response);

  const { data: written, error: writeError } = await deps.service.rpc("record_session_response", {
    target_session: participant.sessionId,
    participant: participant.participantId,
    at_position: opening.item_position,
    target_item: opening.item_id,
    answer: parsed.response as unknown as Json,
    earned: scored.score.points,
    possible: scored.score.maxPoints,
    scoring_model: scored.score.model,
    marks: scored.score.breakdown as unknown as Json,
    row_groups: (scored.score.groups ?? null) as unknown as Json,
  });
  if (writeError) return fail(500, LIVE_ROUTE_ERRORS.failed);
  const record = written?.[0];
  if (!record) return fail(500, LIVE_ROUTE_ERRORS.failed);
  const writeRefusal = asRefusal(record.refusal);
  if (writeRefusal !== null) return refuse(writeRefusal);
  if (!record.submitted_at) return fail(500, LIVE_ROUTE_ERRORS.failed);

  const payload: SubmitAckPayload = {
    itemId: stored.value.id,
    // The session's clock, not the participant's: a phone with a wrong time still lands in order.
    submittedAt: Date.parse(record.submitted_at),
  };
  return Response.json(payload, { headers: NO_STORE_HEADERS });
}

/** A place in a set: a whole number `sessions.current_position`'s smallint could hold. */
function isPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 32_767;
}
