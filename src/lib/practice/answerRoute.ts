/**
 * `POST /api/practice/answer` — check one practice answer and reveal that one item (#241).
 *
 * The order is the promise (owner decision 2026-09-24; kickoff decision 6; ADR 0003):
 *
 *   0. the body is read and shape-checked (JSON only, capped, two uuids), touching nothing;
 *   1. who is asking, from the verified session, never from the body;
 *   2. the per-student limit (failing open: see `limits.ts`);
 *   3. the run, through `practice_run_items`, which answers only when the run is this student's,
 *      is their newest for its bank, and the bank is still shared with a class they are a current
 *      member of. Anything else is a 404, the same 404 whether the run is someone else's, was
 *      started over, or its share was stopped a moment ago;
 *   4. the item must be one of the run's and not yet answered in it;
 *   5. the answer is scored through `scoreSubmission`, the one scoring entry point;
 *   6. the score is recorded, which re-checks step 3 in the same statement;
 *   7. and only then is that one item's key, rationale, scoring rule and score returned.
 *
 * There is no route that returns a key without an answer: this one needs a scored, recorded
 * answer first, and a second answer to the same item in the same run is refused (409).
 *
 * Server only: this module reaches the scoring engine, which a student's bundle must not.
 */
import type { SetItem } from "@/lib/assignments/attemptScoring";
import { readCapped } from "@/lib/assignments/saveRoute";
import { isUuid } from "@/lib/authoring/ids";
import { MAX_ITEM_PAYLOAD_BYTES, withinItemSizeLimit } from "@/lib/authoring/payloadSize";
import type { AnyResponse } from "@/lib/ngn/schemas";
import { parseSubmission, scoreSubmission, type ScoreReveal } from "@/lib/ngn/submit";
import type { ScoreResult } from "@/lib/ngn/types";
import type { RateLimitStore } from "@/lib/rateLimit/store";
import { PRACTICE_ANSWER_LIMIT, takePracticeLimit } from "./limits";
import { PRACTICE_REFUSALS, type PracticeRefusal } from "./refusals";
import type { PracticeSlot } from "./view";

/** A live run's items, and which of them it has answered. Empty when the run is not live. */
export interface RunSlots {
  slots: readonly PracticeSlot[];
  answered: ReadonlySet<string>;
}

export type RecordOutcome = "recorded" | "answered" | "not_found" | "failed";

export interface RecordInput {
  student: string;
  runId: string;
  itemId: string;
  response: AnyResponse;
  score: ScoreResult;
}

export interface PracticeAnswerStore {
  /** Null when the read failed. */
  slots(student: string, runId: string): Promise<RunSlots | null>;
  /** The items with their keys, by row id. Service role. */
  items(ids: readonly string[]): Promise<SetItem[] | null>;
  record(input: RecordInput): Promise<RecordOutcome>;
}

export interface PracticeAnswerDeps {
  /** The verified student id from the session, or null when signed out. */
  student: () => Promise<string | null>;
  store: PracticeAnswerStore;
  limiter: RateLimitStore;
}

export interface PracticeAnswerBody {
  runId: string;
  itemId: string;
  response: unknown;
}

export interface PracticeRefusalPayload {
  refusal: PracticeRefusal;
  error: string;
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

const STATUS: Record<PracticeRefusal, number> = {
  signed_out: 401,
  malformed: 400,
  too_large: 413,
  rate_limited: 429,
  not_found: 404,
  answered: 409,
  failed: 500,
};

export function refusePractice(refusal: PracticeRefusal): Response {
  const body: PracticeRefusalPayload = { refusal, error: PRACTICE_REFUSALS[refusal] };
  return Response.json(body, { status: STATUS[refusal], headers: NO_STORE });
}

async function readBody(request: Request): Promise<PracticeAnswerBody | PracticeRefusal> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return "malformed";
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_ITEM_PAYLOAD_BYTES) {
    return "too_large";
  }
  const text = await readCapped(request, MAX_ITEM_PAYLOAD_BYTES);
  if (text === "too_large") return "too_large";
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return "malformed";
  }
  if (!withinItemSizeLimit(body)) return "too_large";
  if (typeof body !== "object" || body === null || Array.isArray(body)) return "malformed";
  const { runId, itemId, response } = body as Record<string, unknown>;
  if (typeof runId !== "string" || !isUuid(runId)) return "malformed";
  if (typeof itemId !== "string" || !isUuid(itemId)) return "malformed";
  return { runId, itemId, response };
}

/** Scores the answer, or says why it cannot be. */
function check(
  entry: SetItem,
  response: unknown,
): { response: AnyResponse; reveal: ScoreReveal } | PracticeRefusal {
  const parsed = parseSubmission({ response }, entry.item.type);
  if (!parsed.ok) return "malformed";
  try {
    return { response: parsed.response, reveal: scoreSubmission(entry.item, parsed.response) };
  } catch {
    // An answer naming elements the item does not have.
    return "malformed";
  }
}

/** Steps 3 and 4: the item, with its key, when it is one of this live run's unanswered items. */
async function itemToAnswer(
  store: PracticeAnswerStore,
  student: string,
  body: PracticeAnswerBody,
): Promise<SetItem | PracticeRefusal> {
  const run = await store.slots(student, body.runId);
  if (run === null) return "failed";
  if (!run.slots.some((slot) => slot.itemId === body.itemId)) return "not_found";
  if (run.answered.has(body.itemId)) return "answered";
  const items = await store.items([body.itemId]);
  if (items === null) return "failed";
  return items.find((entry) => entry.rowId === body.itemId) ?? "not_found";
}

export async function answerPracticeItem(
  request: Request,
  deps: PracticeAnswerDeps,
): Promise<Response> {
  const body = await readBody(request);
  if (typeof body === "string") return refusePractice(body);

  const student = await deps.student();
  if (student === null) return refusePractice("signed_out");

  if (!(await takePracticeLimit(deps.limiter, "practice_answer", student, PRACTICE_ANSWER_LIMIT))) {
    return refusePractice("rate_limited");
  }

  const entry = await itemToAnswer(deps.store, student, body);
  if (typeof entry === "string") return refusePractice(entry);

  const checked = check(entry, body.response);
  if (typeof checked === "string") return refusePractice(checked);

  const outcome = await deps.store.record({
    student,
    runId: body.runId,
    itemId: body.itemId,
    response: checked.response,
    score: checked.reveal.score,
  });
  if (outcome !== "recorded") return refusePractice(outcome);

  // Exactly the reveal: this item's key, rationale and scoring rule, and its score.
  const reveal: ScoreReveal = {
    score: checked.reveal.score,
    answerKey: checked.reveal.answerKey,
    rationale: checked.reveal.rationale,
    scoring: checked.reveal.scoring,
  };
  return Response.json(reveal, { headers: NO_STORE });
}
