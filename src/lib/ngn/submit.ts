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
import { responseSchema, type AnyResponse, type CaseStudy, type Item } from "./schemas";
import { scoreItem } from "./scoring";
import { withStartingOrder } from "./startingOrder";
import { SUBMIT_ERRORS } from "./submitErrors";
import type { ScoreResult } from "./types";

/**
 * `Omit` over a union collapses it: `keyof` becomes the keys they share and each shared field
 * becomes the union of its types, so `type` no longer says which `content` this is. Distributing
 * first keeps the fourteen item types apart.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// ---------------------------------------------------------------------------
// Which item fields carry an answer (#144)
// ---------------------------------------------------------------------------

/**
 * Every field name of every member of a union. `keyof` over a union gives only the keys its
 * members share, and a conditional type distributes only over a naked type parameter — hence the
 * helper rather than `Item extends unknown ? keyof Item : never` written inline, which would
 * quietly collapse to the shared keys and classify a fifteenth type's own field as nonexistent.
 */
type KeysOfUnion<T> = T extends unknown ? keyof T : never;

/** Every top-level field name the item schemas define, computed from them rather than restated. */
type ItemFieldName = KeysOfUnion<Item>;

/** What a field may do: reach a student's browser before the reveal, or not. */
type Visibility = "student_safe" | "answer_bearing";

/**
 * **The one place that says which item fields carry an answer**, and the source of both halves of
 * ADR 0003: what `toKeylessItem` copies, and what a score reveals.
 *
 * The `satisfies` is the point of the whole file. `ItemFieldName` is computed from the schemas, so
 * a fifteenth item type that adds a top-level field — a fourth answer-bearing one, or an innocent
 * one — **fails to compile here** until someone classifies it. That happens when the schema is
 * written, before the field has anywhere to leak to, which is the difference between this and the
 * hand-written list it replaces: that list was merely correct, and nothing kept it correct. A key
 * here that no schema has is rejected the same way, so deleting a field cannot leave a stale entry.
 */
const ITEM_FIELD_VISIBILITY = {
  id: "student_safe",
  type: "student_safe",
  version: "student_safe",
  cjmmStep: "student_safe",
  tags: "student_safe",
  difficulty: "student_safe",
  stem: "student_safe",
  instructions: "student_safe",
  content: "student_safe",
  ehr: "student_safe",
  meta: "student_safe",
  answerKey: "answer_bearing",
  rationale: "answer_bearing",
  scoring: "answer_bearing",
} as const satisfies Record<ItemFieldName, Visibility>;

/** The field names the table gives one visibility to. */
type FieldsWith<V extends Visibility> = {
  [K in ItemFieldName]: (typeof ITEM_FIELD_VISIBILITY)[K] extends V ? K : never;
}[ItemFieldName];

/** Today: `answerKey`, `rationale` and `scoring` — but read off the table, not written down. */
export type AnswerBearingField = FieldsWith<"answer_bearing">;
type StudentSafeField = FieldsWith<"student_safe">;

const ITEM_FIELD_NAMES = Object.keys(ITEM_FIELD_VISIBILITY) as ItemFieldName[];

/**
 * The only fields `toKeylessItem` copies. An allow-list rather than a delete-list, so a field the
 * table has never heard of — an item read from a row an older deploy wrote, say, or one the type
 * system did not see — is dropped rather than passed through.
 */
const STUDENT_SAFE_FIELDS = ITEM_FIELD_NAMES.filter(
  (name): name is StudentSafeField => ITEM_FIELD_VISIBILITY[name] === "student_safe",
);

/** What a score reveals. Exported so a test can assert the negative against it, not against names. */
export const ANSWER_BEARING_FIELDS = ITEM_FIELD_NAMES.filter(
  (name): name is AnswerBearingField => ITEM_FIELD_VISIBILITY[name] === "answer_bearing",
);

/**
 * An item as a browser may receive it before its answer is checked: no answer key, no rationale,
 * and no scoring, whose +/- maxPoints is the number of correct answers (#94). Which fields those
 * are comes from the table above, so the type and the function below can never disagree.
 */
export type KeylessItem = DistributiveOmit<Item, AnswerBearingField>;

/**
 * The only item payload a student-facing page sends to the browser (ADR 0003). The key, rationale
 * and scoring stay on the server until the score comes back with them. Works on a deep copy, so
 * the item it is given is never changed.
 *
 * An ordered-response item's steps are the one thing it reorders (#219): the authored order is
 * usually the key, so the steps go out in their starting order (`withStartingOrder`, never the
 * key's order), seeded by `seed`. Pass `startingOrderSeed(sessionId | attemptId, itemId)` where
 * a room or an attempt should see one order; the item id is the default.
 */
export function toKeylessItem(item: Item, seed: string = item.id): KeylessItem {
  const copy = JSON.parse(JSON.stringify(withStartingOrder(item, seed))) as Record<string, unknown>;
  const keyless: Record<string, unknown> = {};
  // Optional envelope fields are absent more often than not, and an absent field stays absent:
  // copying it would turn `difficulty?: "easy"` into `difficulty: undefined` in the payload.
  for (const field of STUDENT_SAFE_FIELDS) {
    if (field in copy) keyless[field] = copy[field];
  }
  return keyless as KeylessItem;
}

/** An item as a player may hold it: with its key where there is no student, without where there is. */
export type PlayableItem = Item | KeylessItem;

/**
 * A case study as a browser may hold it. Generic in its items so one player serves both cases:
 * `PlayableCaseStudy<Item>` where the same process does the scoring, `KeylessCaseStudy` wherever a
 * student plays. Everything but the items — the title and the patient's record — is the same either
 * way, because none of it is an answer.
 */
export type PlayableCaseStudy<T extends PlayableItem = PlayableItem> = Omit<CaseStudy, "items"> & {
  items: T[];
};

/**
 * The only case-study payload a student-facing page sends to the browser (ADR 0003): six items
 * carrying `content` and no `answerKey`. A step's key arrives with that step's own score and no
 * sooner, so the keys for steps the student has not reached are never loaded at all.
 */
export type KeylessCaseStudy = PlayableCaseStudy<KeylessItem>;

/**
 * Strips every step's key, rationale and scoring. Each item is a deep copy, so the case study it
 * is given is never changed; the patient's record is shared by reference, since it holds no answer.
 *
 * Seeds each step's starting order (#219) by the step's own id, which a student can see. Fine for
 * the gallery and an author's preview; a path that hands a case study to a student must build it
 * with `toKeylessItem(step, secretStartingOrderSeed(scopeId, step.id))` per step instead.
 */
export function toKeylessCaseStudy(caseStudy: CaseStudy): KeylessCaseStudy {
  return { ...caseStudy, items: caseStudy.items.map((item) => toKeylessItem(item)) };
}

/**
 * What a score reveals beside itself, once and only once there is a score: the mirror image of
 * `KeylessItem`, from the same table. A fifteenth answer-bearing field has to be revealed as well
 * as stripped, and this is what makes that so — `scoreSubmission` below stops compiling until it
 * returns the new field, so a field cannot be hidden from students and then never shown to them.
 */
export type Reveal = Pick<Item, AnswerBearingField>;

/** What checking an answer produces: the score, and only now the key, rationale and scoring. */
export interface ScoreReveal extends Reveal {
  score: ScoreResult;
}

/**
 * What a player calls to have one answer checked. A student-facing caller passes a handler that
 * posts to a route or a session channel; the gallery and the authoring preview pass
 * `scoreInProcess`.
 */
export type SubmitHandler = (response: AnyResponse) => Promise<ScoreReveal>;

/**
 * Builds the handler for one item, so a case study can make one per step. Generic in the item it is
 * handed: a session's handler is given a `KeylessItem` and only the server ever sees the key, while
 * `scoreInProcess` needs the whole `Item` — which is why it cannot be passed a keyless case study.
 */
export type SubmitHandlerFor<T extends PlayableItem = Item> = (item: T) => SubmitHandler;

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

/** Re-exported, so every call site keeps importing it from the seam. See `submitErrors.ts`. */
export { SUBMIT_ERRORS };

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
