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
import {
  dragdropClozeDraftSchema,
  dragdropRationaleDraftSchema,
  dropdownClozeDraftSchema,
  dropdownRationaleDraftSchema,
  fromDragdropClozeDraft,
  fromDragdropRationaleDraft,
  fromDropdownClozeDraft,
  fromDropdownRationaleDraft,
  toDragdropClozeDraft,
  toDragdropRationaleDraft,
  toDropdownClozeDraft,
  toDropdownRationaleDraft,
} from "./cloze";
import {
  dropdownTableDraftSchema,
  fromDropdownTableDraft,
  toDropdownTableDraft,
} from "./dropdownTable";
import {
  fromHighlightTableDraft,
  fromHighlightTextDraft,
  highlightTableDraftSchema,
  highlightTextDraftSchema,
  toHighlightTableDraft,
  toHighlightTextDraft,
} from "./highlight";

/**
 * Draft shape and converters per item type: the selection, ordered and bowtie types (#337), then
 * the cloze, table, highlight and drag-and-drop types (#338). A cloze draft whose source states
 * the rationale rule converts to the rationale type of its family, so read a conversion's type
 * from its item, not from the draft.
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
  dropdown_cloze: {
    schema: dropdownClozeDraftSchema,
    fromDraft: fromDropdownClozeDraft,
    toDraft: toDropdownClozeDraft,
  },
  dropdown_rationale: {
    schema: dropdownRationaleDraftSchema,
    fromDraft: fromDropdownRationaleDraft,
    toDraft: toDropdownRationaleDraft,
  },
  dropdown_table: {
    schema: dropdownTableDraftSchema,
    fromDraft: fromDropdownTableDraft,
    toDraft: toDropdownTableDraft,
  },
  highlight_text: {
    schema: highlightTextDraftSchema,
    fromDraft: fromHighlightTextDraft,
    toDraft: toHighlightTextDraft,
  },
  highlight_table: {
    schema: highlightTableDraftSchema,
    fromDraft: fromHighlightTableDraft,
    toDraft: toHighlightTableDraft,
  },
  dragdrop_cloze: {
    schema: dragdropClozeDraftSchema,
    fromDraft: fromDragdropClozeDraft,
    toDraft: toDragdropClozeDraft,
  },
  dragdrop_rationale: {
    schema: dragdropRationaleDraftSchema,
    fromDraft: fromDragdropRationaleDraft,
    toDraft: toDragdropRationaleDraft,
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

export type JsonSchema = Record<string, unknown>;

/** Claude's structured outputs take `anyOf` but not `oneOf`, and need no `$schema` line. */
export function forStructuredOutput(node: unknown): unknown {
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
