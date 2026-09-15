import { z } from "zod";
import type { ItemType } from "@/lib/ngn/labels";
import { responseSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { scoreItem } from "@/lib/ngn/scoring";
import type { ScoreResult } from "@/lib/ngn/types";

export const SCORE_REQUEST_ERRORS = {
  malformed: "That answer could not be read. Reload the page and try again.",
  wrongType: "That answer does not match this item. Reload the page and try again.",
} as const;

export type ScoreRequestResult =
  { ok: true; response: AnyResponse } | { ok: false; status: 400; error: string };

/** What the score route returns: the score, and only now the key, rationale and scoring to explain it. */
export interface ScoreReveal {
  score: ScoreResult;
  answerKey: Item["answerKey"];
  rationale: Item["rationale"];
  scoring: Item["scoring"];
}

// The body is `{ response }` and nothing else.
const envelopeSchema = z.strictObject({ response: z.unknown() });

const MALFORMED = { ok: false, status: 400, error: SCORE_REQUEST_ERRORS.malformed } as const;
const WRONG_TYPE = { ok: false, status: 400, error: SCORE_REQUEST_ERRORS.wrongType } as const;

/**
 * Reads a score request for an item of `itemType`. The response must be an object, must declare
 * the item's own type, and must pass that type's response schema. Messages never carry schema
 * details.
 */
export function parseScoreRequest(body: unknown, itemType: ItemType): ScoreRequestResult {
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

/** Scores with the same engine as the gallery, then reveals the key, rationale and scoring beside it. */
export function scoreForReveal(item: Item, response: AnyResponse): ScoreReveal {
  return {
    score: scoreItem(item, response),
    answerKey: item.answerKey,
    rationale: item.rationale,
    scoring: item.scoring,
  };
}
