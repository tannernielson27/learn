"use client";

import {
  publishBowtie,
  publishDragdropCloze,
  publishDragdropRationale,
  publishDropdownCloze,
  publishDropdownRationale,
  publishDropdownTable,
  publishGrouping,
  publishHighlightTable,
  publishHighlightText,
  publishMatrixMultipleChoice,
  publishMatrixMultipleResponse,
  publishMultipleChoice,
  publishMultipleResponse,
  publishOrderedResponse,
  saveBowtieDraft,
  saveDragdropClozeDraft,
  saveDragdropRationaleDraft,
  saveDropdownClozeDraft,
  saveDropdownRationaleDraft,
  saveDropdownTableDraft,
  saveGroupingDraft,
  saveHighlightTableDraft,
  saveHighlightTextDraft,
  saveMatrixMultipleChoiceDraft,
  saveMatrixMultipleResponseDraft,
  saveMultipleChoiceDraft,
  saveMultipleResponseDraft,
  saveOrderedResponseDraft,
} from "@/app/author/items/[itemId]/actions";
import type { ItemType } from "@/lib/ngn/labels";
import type { SaveResult } from "./EditorShell";
import { ItemEditorSwitch, type ItemEditorLoaderProps } from "./ItemEditorSwitch";

export type { ItemEditorLoaderProps };

type Action = (itemId: string, payload: unknown) => Promise<SaveResult>;

/** Each type's Save draft and Publish, on the item's own row. */
const ACTIONS: Record<ItemType, { save: Action; publish: Action }> = {
  multiple_choice: { save: saveMultipleChoiceDraft, publish: publishMultipleChoice },
  multiple_response: { save: saveMultipleResponseDraft, publish: publishMultipleResponse },
  multiple_response_grouping: { save: saveGroupingDraft, publish: publishGrouping },
  matrix_multiple_choice: {
    save: saveMatrixMultipleChoiceDraft,
    publish: publishMatrixMultipleChoice,
  },
  matrix_multiple_response: {
    save: saveMatrixMultipleResponseDraft,
    publish: publishMatrixMultipleResponse,
  },
  dropdown_table: { save: saveDropdownTableDraft, publish: publishDropdownTable },
  dropdown_cloze: { save: saveDropdownClozeDraft, publish: publishDropdownCloze },
  dropdown_rationale: { save: saveDropdownRationaleDraft, publish: publishDropdownRationale },
  highlight_text: { save: saveHighlightTextDraft, publish: publishHighlightText },
  highlight_table: { save: saveHighlightTableDraft, publish: publishHighlightTable },
  dragdrop_cloze: { save: saveDragdropClozeDraft, publish: publishDragdropCloze },
  dragdrop_rationale: { save: saveDragdropRationaleDraft, publish: publishDragdropRationale },
  ordered_response: { save: saveOrderedResponseDraft, publish: publishOrderedResponse },
  bowtie: { save: saveBowtieDraft, publish: publishBowtie },
};

/** An item row's editor: its type's form, saving and publishing to that row. */
export function ItemEditorLoader(props: ItemEditorLoaderProps) {
  const { itemId } = props;
  const { save, publish } = ACTIONS[props.type];
  return (
    <ItemEditorSwitch
      editor={props}
      onSaveDraft={(values) => save(itemId, values)}
      onPublish={(input) => publish(itemId, input)}
    />
  );
}
