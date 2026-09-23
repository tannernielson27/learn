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
 *
 * ## How often one person may ask (#152)
 *
 * A participant token is required, so this route is not anonymous — but a participant of a room
 * could spin it as fast as it liked, and every call costs a `last_seen_at` write in
 * `resume_participant` plus three reads. `public.begin_session_view` is the cap: it charges this
 * participant's counter and hands back the four columns of `public.sessions` a student may know,
 * so the limit replaces the read the route used to do rather than sitting in front of it. That is
 * `begin_session_submission`'s bargain on the submission route, and the two counters are the same
 * table, the same five-minute window and the same `rate_limited` refusal. Only the number differs,
 * and the migration says why.
 */
import { itemAt, type LiveSessionState, type ParticipantItem } from "@/lib/live";
import { readTimer } from "@/lib/live/timer";
import type { Item } from "@/lib/ngn/schemas";
import { parseSubmission, toKeylessItem, type Reveal } from "@/lib/ngn/submit";
import type { ScoreResult } from "@/lib/ngn/types";
import { fromItemRow } from "@/lib/supabase/itemRows";
import { LIVE_ROUTE_ERRORS, asRefusal, fail, refuse, type LiveRouteDeps } from "./routeDeps";
import {
  NO_STORE_HEADERS,
  type AnsweredPayload,
  type ParticipantViewPayload,
  type RevealedPayload,
} from "./wire";

const ITEM_COLUMNS = "type, cjmm_step, tags, version, content, answer_key, rationale, scoring";

export async function readParticipantView(
  request: Request,
  deps: LiveRouteDeps,
): Promise<Response> {
  // JSON only, the same rule the submission route holds a request to. Nothing here parses the
  // body and the participant cookie is SameSite=Lax, so this closes no hole on its own; it stops
  // the two routes having two different ideas of what a request to this app looks like.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return refuse("malformed");
  }

  const participant = await deps.verify(request);
  if (participant === null) return fail(401, LIVE_ROUTE_ERRORS.signedOut);

  // Charges this participant's rate limit and reads the room in one round trip (#152), which is
  // `begin_session_submission`'s bargain on the other route. The order is the submission route's
  // too: who is speaking is settled first and the limit charged second, so nobody can spend a
  // budget that is not theirs.
  const { data: opened, error } = await deps.service.rpc("begin_session_view", {
    target_session: participant.sessionId,
    participant: participant.participantId,
  });
  if (error) return fail(500, LIVE_ROUTE_ERRORS.failed);
  const session = opened?.[0];
  // A participant whose session has been deleted is not in a room any more. The token is the only
  // thing that said otherwise, and it says nothing about whether the row still exists.
  if (!session) return fail(401, LIVE_ROUTE_ERRORS.signedOut);
  const refusal = asRefusal(session.refusal);
  if (refusal !== null) return refuse(refusal);
  // A refused call answers with nulls in every other column, so a code this app does not know is
  // not something to carry on past: it would put a null status on a student's page. Never passed
  // through as itself either — an unknown code reaches a person as an empty sentence.
  if (session.refusal) return fail(500, LIVE_ROUTE_ERRORS.failed);

  const itemSet = Array.isArray(session.session_items) ? (session.session_items as unknown[]) : [];
  // The same nullability as the position below: a column the generator calls a number is null
  // whenever the timer is off or not running, so every one is coerced before it is read.
  const timer = readTimer(
    session.session_timer_seconds ?? null,
    session.session_ends_at ?? null,
    session.session_remaining_ms ?? null,
  );
  if (timer === null) return fail(500, LIVE_ROUTE_ERRORS.failed);
  // The database's clock as it read the room (#182), for the phone to measure its own against.
  const serverNow = Date.parse(session.server_now);
  if (Number.isNaN(serverNow)) return fail(500, LIVE_ROUTE_ERRORS.failed);
  const state: LiveSessionState = {
    status: session.session_status,
    // A `returns table` function carries no nullability into the generated types, so the position
    // is coerced rather than read straight through: before the room starts it really is null,
    // whatever the type says.
    position: session.session_position ?? null,
    itemCount: itemSet.length,
    reveal: session.session_reveal,
    timer,
  };

  const currentItemId = itemAt(itemSet, state);
  if (typeof currentItemId !== "string") {
    const payload: ParticipantViewPayload = {
      state,
      item: null,
      answered: null,
      revealed: null,
      serverNow,
    };
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

  const payload: ParticipantViewPayload = { state, item, answered, revealed, serverNow };
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
  // Stored text, checked rather than trusted, like the response beside it. An unparseable stamp
  // is `NaN`, which serializes to `null` and would have the phone show an answer whose
  // `submittedAt` is missing — an answer that claims never to have been sent. Unreadable reads as
  // "not answered here", the same way an unreadable response does above.
  const submittedAt = Date.parse(data.submitted_at);
  if (Number.isNaN(submittedAt)) return null;
  return { itemId: item.id, submittedAt, response: parsed.response };
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
