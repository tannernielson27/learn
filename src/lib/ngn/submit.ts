/**
 * The submit seam (#56, ADR 0003).
 *
 * One shape for "a candidate answered an item": what the browser may hold before the answer is
 * checked, how a request carrying that answer is read, what checking it produces, and the function
 * type a player calls to have it checked. The authoring play route, the gallery and — from #131 and
 * #133 — a live session's submit handler all meet here, so the players themselves hold no scoring
 * code and no answer key.
 *
 * Pure TypeScript: no React, Next or Supabase (ADR 0001). A transport lives on top of this, never
 * inside it.
 */
import { z } from "zod";
import type { ItemType } from "./labels";
import { responseSchema, type AnyResponse, type Item } from "./schemas";
import { scoreItem } from "./scoring";
import type { ScoreResult } from "./types";

/**
 * An item as a browser may receive it before its answer is checked: no answer key, no rationale,
 * and no scoring, whose +/- maxPoints is the number of correct answers (#94).
 */
export type KeylessItem = Omit<Item, "answerKey" | "rationale" | "scoring">;

/**
 * The only item payload a student-facing page sends to the browser (ADR 0003). The key, rationale
 * and scoring stay on the server until the score comes back with them. Works on a deep copy, so
 * the item it is given is never changed.
 */
export function toKeylessItem(item: Item): KeylessItem {
  const copy = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
  delete copy.answerKey;
  delete copy.rationale;
  delete copy.scoring;
  return copy as KeylessItem;
}

/** What checking an answer produces: the score, and only now the key, rationale and scoring. */
export interface ScoreReveal {
  score: ScoreResult;
  answerKey: Item["answerKey"];
  rationale: Item["rationale"];
  scoring: Item["scoring"];
}

/**
 * What a player calls to have one answer checked. A student-facing caller passes a handler that
 * posts to a route or a session channel; the gallery and the authoring preview pass
 * `scoreInProcess`.
 */
export type SubmitHandler = (response: AnyResponse) => Promise<ScoreReveal>;

/** Builds the handler for one item, so a case study can make one per step. */
export type SubmitHandlerFor = (item: Item) => SubmitHandler;

/**
 * Scores a response and reveals the key beside it. **The scoring entry point**: every server that
 * checks an answer calls this and nothing else, so one item is scored the same way whether it was
 * answered in a live session, an assignment, the authoring preview or the gallery.
 */
export function scoreSubmission(item: Item, response: AnyResponse): ScoreReveal {
  return {
    score: scoreItem(item, response),
    answerKey: item.answerKey,
    rationale: item.rationale,
    scoring: item.scoring,
  };
}

/**
 * A `SubmitHandler` that scores in the caller's own process against an item it already holds.
 *
 * ADR 0003 allows this **only** where there is no student: the gallery, fixture modes and the
 * authoring preview. Naming it at the call site is the point — a page that scores its own answers
 * says so, and the scoring engine reaches only that page's bundle.
 */
export const scoreInProcess: SubmitHandlerFor = (item) => async (response) =>
  scoreSubmission(item, response);

export const SUBMIT_ERRORS = {
  malformed: "That answer could not be read. Reload the page and try again.",
  wrongType: "That answer does not match this item. Reload the page and try again.",
} as const;

export type ParsedSubmission =
  { ok: true; response: AnyResponse } | { ok: false; status: 400; error: string };

// The body is `{ response }` and nothing else.
const envelopeSchema = z.strictObject({ response: z.unknown() });

const MALFORMED = { ok: false, status: 400, error: SUBMIT_ERRORS.malformed } as const;
const WRONG_TYPE = { ok: false, status: 400, error: SUBMIT_ERRORS.wrongType } as const;

/**
 * Reads a submission for an item of `itemType`. The response must be an object, must declare the
 * item's own type, and must pass that type's response schema. Messages never carry schema details.
 */
export function parseSubmission(body: unknown, itemType: ItemType): ParsedSubmission {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) return MALFORMED;
  const candidate = envelope.data.response;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return MALFORMED;
  }

  // A response written for another type is its own, clearer mistake.
  const declared = (candidate as { type?: unknown }).type;
  if (typeof declared === "string" && declared !== itemType) return WRONG_TYPE;

  const parsed = responseSchema.safeParse(candidate);
  if (!parsed.success) return MALFORMED;
  if (parsed.data.type !== itemType) return WRONG_TYPE;
  return { ok: true, response: parsed.data };
}
