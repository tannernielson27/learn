/**
 * `POST /api/live/view` — everything a participant's page is allowed to know right now.
 *
 * This is the one place a key can reach a student, and it is why the route exists at all instead
 * of letting a browser read the tables. A participant has no Postgres identity: `anon` has no
 * privilege on `public.sessions` and none on `public.items`, so the item is read here, under the
 * service role, and `toKeylessItem` strips the key, the rationale and the scoring before anything
 * is serialized (ADR 0003, #56). The key travels exactly once — in `revealed` — and only when
 * `sessions.reveal` is true for the item the room is on, which the host sets and the browser
 * cannot.
 *
 * It also answers the one question a phone cannot answer for itself after a reload: **have I
 * already answered this?** `answered` is that, and it is this participant's own response read
 * back to them — not a mark. The distinction is the whole of ADR 0003 here: what they sent is
 * theirs, what it earned is the host's until the reveal.
 *
 * POST, not GET, for one reason: a GET route handler can be prerendered or cached, and nothing
 * that may carry an answer key is allowed anywhere near a cache. Every answer also carries
 * `Cache-Control: no-store`.
 */
import { itemAt, type LiveSessionState, type ParticipantItem } from "@/lib/live";
import type { Item } from "@/lib/ngn/schemas";
import { parseSubmission, toKeylessItem, type Reveal } from "@/lib/ngn/submit";
import type { ScoreResult } from "@/lib/ngn/types";
import { fromItemRow } from "@/lib/supabase/itemRows";
import { LIVE_ROUTE_ERRORS, fail, type LiveRouteDeps } from "./routeDeps";
import {
  NO_STORE_HEADERS,
  type AnsweredPayload,
  type ParticipantViewPayload,
  type RevealedPayload,
} from "./wire";

const ITEM_COLUMNS = "type, cjmm_step, tags, version, content, answer_key, rationale, scoring";

/** The session columns this route reads. No code, no host, no org: none of it is a student's. */
const SESSION_COLUMNS = "status, current_position, reveal, item_set";

export async function readParticipantView(
  request: Request,
  deps: LiveRouteDeps,
): Promise<Response> {
  const participant = await deps.verify(request);
  if (participant === null) return fail(401, LIVE_ROUTE_ERRORS.signedOut);

  const { data: session, error } = await deps.service
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("id", participant.sessionId)
    .maybeSingle();
  if (error) return fail(500, LIVE_ROUTE_ERRORS.failed);
  // A participant whose session has been deleted is not in a room any more. The token is the only
  // thing that said otherwise, and it says nothing about whether the row still exists.
  if (!session) return fail(401, LIVE_ROUTE_ERRORS.signedOut);

  const itemSet = Array.isArray(session.item_set) ? (session.item_set as unknown[]) : [];
  const state: LiveSessionState = {
    status: session.status,
    position: session.current_position,
    itemCount: itemSet.length,
    reveal: session.reveal,
  };

  const currentItemId = itemAt(itemSet, state);
  if (typeof currentItemId !== "string") {
    const payload: ParticipantViewPayload = { state, item: null, answered: null, revealed: null };
    return Response.json(payload, { headers: NO_STORE_HEADERS });
  }

  const { data: row, error: itemError } = await deps.service
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("id", currentItemId)
    .maybeSingle();
  if (itemError) return fail(500, LIVE_ROUTE_ERRORS.failed);
  if (!row) return fail(409, LIVE_ROUTE_ERRORS.unplayable);

  // Stored JSON is external input, exactly as it is in the authoring score route: validate the
  // whole item before anything is derived from it.
  const stored = fromItemRow(row);
  if (!stored.ok) return fail(409, LIVE_ROUTE_ERRORS.unplayable);

  const item: ParticipantItem = toKeylessItem(stored.value);
  // `itemAt` only answers with an id while the room is on an item, which is exactly when
  // `position` is not null. The cast is that fact, not an assumption about the row.
  const position = state.position as number;
  const answered = await answerFor(deps, participant, position, stored.value);
  const revealed = state.reveal
    ? await revealFor(deps, participant.sessionId, participant.participantId, {
        itemId: stored.value.id,
        position,
        reveal: {
          answerKey: stored.value.answerKey,
          rationale: stored.value.rationale,
          scoring: stored.value.scoring,
        },
      })
    : null;

  const payload: ParticipantViewPayload = { state, item, answered, revealed };
  return Response.json(payload, { headers: NO_STORE_HEADERS });
}

/**
 * Whether this participant has already answered the item the room is on, and what they said.
 *
 * Theirs and nobody else's: the read is keyed on the participant id the cookie was checked
 * against, so there is no query string to change. Two columns are selected and two are all that
 * could be: `points`, `max_points`, `model`, `breakdown` and `groups` are marks, and marks belong
 * to `revealFor` below, which runs only once the host has revealed (ADR 0003).
 *
 * The stored response is read back through `parseSubmission` rather than trusted. It was
 * validated on the way in, but stored JSON is external input every time it is read — the same
 * rule the item above it is held to — and an item edited under a running session could leave a
 * response that no longer matches its schema. An unreadable one reads as "not answered here":
 * the server still knows they answered and will still refuse a second answer, and the phone
 * simply opens the item fresh instead of being handed something a renderer cannot draw.
 */
async function answerFor(
  deps: LiveRouteDeps,
  participant: { sessionId: string; participantId: string },
  position: number,
  item: Item,
): Promise<AnsweredPayload | null> {
  const { data } = await deps.service
    .from("session_responses")
    .select("response, submitted_at")
    .eq("session_id", participant.sessionId)
    .eq("participant_id", participant.participantId)
    .eq("item_position", position)
    .maybeSingle();
  if (!data?.submitted_at) return null;

  const parsed = parseSubmission({ response: data.response }, item.type);
  if (!parsed.ok) return null;
  return {
    itemId: item.id,
    submittedAt: Date.parse(data.submitted_at),
    response: parsed.response,
  };
}

/**
 * The key, plus this participant's own marks if they answered. Their marks and nobody else's: the
 * read is keyed on the participant id the token carried, so there is no query string to change.
 */
async function revealFor(
  deps: LiveRouteDeps,
  sessionId: string,
  participantId: string,
  revealed: { itemId: string; position: number; reveal: Reveal },
): Promise<RevealedPayload> {
  const { data } = await deps.service
    .from("session_responses")
    .select("points, max_points, model, breakdown, groups")
    .eq("session_id", sessionId)
    .eq("participant_id", participantId)
    .eq("item_position", revealed.position)
    .maybeSingle();

  const score: ScoreResult | null = !data
    ? null
    : {
        points: Number(data.points),
        maxPoints: Number(data.max_points),
        model: data.model as ScoreResult["model"],
        breakdown: (data.breakdown ?? []) as unknown as ScoreResult["breakdown"],
        ...(data.groups == null ? {} : { groups: data.groups as unknown as ScoreResult["groups"] }),
      };

  return { ...revealed, score };
}
