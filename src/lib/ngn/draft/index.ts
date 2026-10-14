import { z } from "zod";
import type { ItemOf } from "../schemas";
import type { DraftContext, DraftConversion } from "./common";
import {
  fromMatrixMultipleChoiceDraft,
  fromMatrixMultipleResponseDraft,
  fromMultipleChoiceDraft,
  fromMultipleResponseDraft,
  fromMultipleResponseGroupingDraft,
  matrixMultipleChoiceDraftSchema,
  matrixMultipleResponseDraftSchema,
  multipleChoiceDraftSchema,
  multipleResponseDraftSchema,
  multipleResponseGroupingDraftSchema,
  toMatrixMultipleChoiceDraft,
  toMatrixMultipleResponseDraft,
  toMultipleChoiceDraft,
  toMultipleResponseDraft,
  toMultipleResponseGroupingDraft,
} from "./selection";
import {
  bowtieDraftSchema,
  fromBowtieDraft,
  fromOrderedResponseDraft,
  orderedResponseDraftSchema,
  toBowtieDraft,
  toOrderedResponseDraft,
} from "./structured";

export * from "./common";
export * from "./selection";
export * from "./structured";
export {
  isMarkedCell,
  normalizeLine,
  normalizeMarkdown,
  parseAnswer,
  parseScoringRule,
  readMarked,
  statedSelectCount,
  type MarkedText,
  type StatedRule,
} from "./text";

/**
 * Draft shape and converters per item type (#337). #338 adds the cloze, highlight and
 * drag-and-drop types and the case study; until then a type missing here has no AI draft.
 */
export const DRAFTS = {
  multiple_choice: {
    schema: multipleChoiceDraftSchema,
    fromDraft: fromMultipleChoiceDraft,
    toDraft: toMultipleChoiceDraft,
  },
  multiple_response: {
    schema: multipleResponseDraftSchema,
    fromDraft: fromMultipleResponseDraft,
    toDraft: toMultipleResponseDraft,
  },
  multiple_response_grouping: {
    schema: multipleResponseGroupingDraftSchema,
    fromDraft: fromMultipleResponseGroupingDraft,
    toDraft: toMultipleResponseGroupingDraft,
  },
  matrix_multiple_choice: {
    schema: matrixMultipleChoiceDraftSchema,
    fromDraft: fromMatrixMultipleChoiceDraft,
    toDraft: toMatrixMultipleChoiceDraft,
  },
  matrix_multiple_response: {
    schema: matrixMultipleResponseDraftSchema,
    fromDraft: fromMatrixMultipleResponseDraft,
    toDraft: toMatrixMultipleResponseDraft,
  },
  ordered_response: {
    schema: orderedResponseDraftSchema,
    fromDraft: fromOrderedResponseDraft,
    toDraft: toOrderedResponseDraft,
  },
  bowtie: {
    schema: bowtieDraftSchema,
    fromDraft: fromBowtieDraft,
    toDraft: toBowtieDraft,
  },
} as const;

export type DraftType = keyof typeof DRAFTS;
export const DRAFT_TYPES = Object.keys(DRAFTS) as DraftType[];

export type DraftOf<T extends DraftType> = z.infer<(typeof DRAFTS)[T]["schema"]>;
export type ItemDraft = { [T in DraftType]: DraftOf<T> }[DraftType];

const DRAFT_SCHEMA_LIST = DRAFT_TYPES.map((type) => DRAFTS[type].schema) as unknown as [
  (typeof DRAFTS)[DraftType]["schema"],
  ...(typeof DRAFTS)[DraftType]["schema"][],
];

/** Any draft, told apart by `type`. Parse the model's output with this before converting it. */
export const itemDraftSchema = z.discriminatedUnion("type", DRAFT_SCHEMA_LIST);

export const isDraftType = (type: string): type is DraftType => Object.hasOwn(DRAFTS, type);

/** Converts a parsed draft of any type. See `DraftConversion` for what the result promises. */
export function fromDraft(
  draft: ItemDraft,
  context: DraftContext = {},
): DraftConversion<DraftType> {
  return convert(draft.type, draft, context);
}

function convert<T extends DraftType>(
  type: T,
  draft: ItemDraft,
  context: DraftContext,
): DraftConversion<T> {
  const entry = DRAFTS[type] as unknown as {
    fromDraft: (draft: DraftOf<T>, context: DraftContext) => DraftConversion<T>;
  };
  return entry.fromDraft(draft as DraftOf<T>, context);
}

/** The draft a valid item would come from. Used by round-trip tests and to show a repair prompt. */
export function toDraft<T extends DraftType>(item: ItemOf<T>): DraftOf<T> {
  const entry = DRAFTS[item.type as T] as unknown as { toDraft: (item: ItemOf<T>) => DraftOf<T> };
  return entry.toDraft(item);
}

type JsonSchema = Record<string, unknown>;

/** Claude's structured outputs take `anyOf` but not `oneOf`, and need no `$schema` line. */
function forStructuredOutput(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forStructuredOutput);
  if (node === null || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node as JsonSchema)
      .filter(([key]) => key !== "$schema")
      .map(([key, value]) => [key === "oneOf" ? "anyOf" : key, forStructuredOutput(value)]),
  );
}

/**
 * The JSON Schema Claude fills for one type, or for any draft type when none is named. Built
 * from the Zod schemas with `z.toJSONSchema`, so the two never drift apart.
 */
export function draftJsonSchema(type?: DraftType): JsonSchema {
  const schema = type === undefined ? itemDraftSchema : DRAFTS[type].schema;
  return forStructuredOutput(z.toJSONSchema(schema)) as JsonSchema;
}
