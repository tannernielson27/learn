import { ITEM_TYPES } from "@/lib/ngn/labels";
import { CASE_STUDY_STEP_COUNT, itemSchema, type ItemType } from "@/lib/ngn/schemas";

/**
 * A staged case study, step by step (#593). The review screen and the server both need to know
 * which of its six steps still need the teacher, so this is shared and imports nothing from
 * `src/lib/aiImport` (`noClientAiImport.test.ts`).
 *
 * A staged case study's `item` is the learn.v1 case study once every step converted, with an
 * empty key on each step the document does not mark; it is null when the patient record or a
 * step could not be built at all. Its reasons name a step as "Step 3: …" (and as "steps.2: …" in
 * batches staged before #593).
 */

const NAMED_STEP = /^Step ([1-6]): ([\s\S]*)$/;
const DRAFT_PATH = /^steps\.([0-5])(?:\.[\w.]*)?: ([\s\S]*)$/;

/** The step a reason is about, from 1, and its words without the step; null for the whole case. */
export function stepOfReason(message: string): { step: number | null; message: string } {
  const named = NAMED_STEP.exec(message);
  if (named) return { step: Number(named[1]), message: named[2]! };
  const path = DRAFT_PATH.exec(message);
  if (path) return { step: Number(path[1]) + 1, message: path[2]! };
  return { step: null, message };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The six step questions of a staged case study's item; null when it holds none. */
export function caseSteps(item: unknown): Record<string, unknown>[] | null {
  if (!isRecord(item) || !Array.isArray(item.items)) return null;
  const steps = item.items;
  return steps.length === CASE_STUDY_STEP_COUNT && steps.every(isRecord) ? steps : null;
}

/** A step question's type, when it is one the editors know. */
export const stepType = (step: Record<string, unknown>): ItemType | null =>
  typeof step.type === "string" && (ITEM_TYPES as readonly string[]).includes(step.type)
    ? (step.type as ItemType)
    : null;

/** Whether a step is a whole, valid question: its key included. */
export const stepIsKeyed = (step: unknown): boolean => itemSchema.safeParse(step).success;

/** Reasons that keep a step from being imported as it stands (`FIX_CODES` in `aiImportReview.ts`). */
const STEP_FIX_CODES = ["needs_fix", "unmarked_key", "not_in_source", "relies_on_image", "cut_off"];

export interface StepAttention {
  /** From 1. */
  step: number;
  /** "key": the document marks no answer for it. "check": it was flagged, and a save clears it. */
  why: "key" | "check";
}

/**
 * The steps a teacher can open to finish a case study: those with no key yet, and those flagged
 * with something a save answers (cut off, relies on a picture). Empty when the case study holds
 * no step questions, or a step is of a type no editor opens.
 */
export function stepsNeedingAttention(entry: {
  item: unknown;
  reasons: readonly { code: string; message: string }[];
}): StepAttention[] {
  const steps = caseSteps(entry.item);
  if (!steps || steps.some((step) => stepType(step) === null)) return [];
  const flagged = new Set(
    entry.reasons
      .filter((reason) => STEP_FIX_CODES.includes(reason.code))
      .map((reason) => stepOfReason(reason.message).step),
  );
  return steps.flatMap((step, index): StepAttention[] => {
    const number = index + 1;
    if (!stepIsKeyed(step)) return [{ step: number, why: "key" }];
    return flagged.has(number) ? [{ step: number, why: "check" }] : [];
  });
}
