import { bowtieFormFromStored } from "@/lib/authoring/forms/bowtie";
import { clozeFormFromStored } from "@/lib/authoring/forms/cloze";
import { dragDropFormFromStored } from "@/lib/authoring/forms/dragdrop";
import { dropdownTableFormFromStored } from "@/lib/authoring/forms/dropdownTable";
import {
  highlightTableFormFromStored,
  highlightTextFormFromStored,
} from "@/lib/authoring/forms/highlight";
import { matrixFormFromStored } from "@/lib/authoring/forms/matrix";
import { multipleChoiceFormFromStored } from "@/lib/authoring/forms/multipleChoice";
import { multipleResponseFormFromStored } from "@/lib/authoring/forms/multipleResponse";
import { groupingFormFromStored } from "@/lib/authoring/forms/multipleResponseGrouping";
import { orderedResponseFormFromStored } from "@/lib/authoring/forms/orderedResponse";
import { isRecord } from "@/lib/authoring/forms/storedValues";
import type { ItemEditorLoaderProps } from "./ItemEditorLoader";

/** The columns an item row is read with to open its editor. */
export interface EditableItemRow {
  type: string;
  cjmm_step: number | null;
  tags: string[];
  version: number;
  content: unknown;
  answer_key: unknown;
  rationale: unknown;
  scoring: unknown;
}

/** An item row put back together as the item JSON the form loaders read. */
export function storedItemOf(row: EditableItemRow): Record<string, unknown> {
  return {
    ...(isRecord(row.content) ? row.content : {}),
    type: row.type,
    cjmmStep: row.cjmm_step ?? undefined,
    tags: row.tags,
    version: row.version,
    answerKey: row.answer_key,
    rationale: row.rationale,
    scoring: row.scoring,
  };
}

/** Chooses the editor for a stored row, or null for a stored type outside the catalogue. */
export function editorFor(
  rowId: string,
  type: string,
  stored: unknown,
): ItemEditorLoaderProps | null {
  switch (type) {
    case "multiple_choice":
      return { itemId: rowId, type, initialValues: multipleChoiceFormFromStored(stored, rowId) };
    case "multiple_response":
      return { itemId: rowId, type, initialValues: multipleResponseFormFromStored(stored, rowId) };
    case "multiple_response_grouping":
      return { itemId: rowId, type, initialValues: groupingFormFromStored(stored, rowId) };
    case "matrix_multiple_choice":
    case "matrix_multiple_response":
      return { itemId: rowId, type, initialValues: matrixFormFromStored(stored, rowId) };
    case "dropdown_table":
      return { itemId: rowId, type, initialValues: dropdownTableFormFromStored(stored, rowId) };
    case "dropdown_cloze":
    case "dropdown_rationale":
      return { itemId: rowId, type, initialValues: clozeFormFromStored(stored, rowId) };
    case "highlight_text":
      return { itemId: rowId, type, initialValues: highlightTextFormFromStored(stored, rowId) };
    case "highlight_table":
      return { itemId: rowId, type, initialValues: highlightTableFormFromStored(stored, rowId) };
    case "dragdrop_cloze":
    case "dragdrop_rationale":
      return { itemId: rowId, type, initialValues: dragDropFormFromStored(stored, rowId) };
    case "ordered_response":
      return { itemId: rowId, type, initialValues: orderedResponseFormFromStored(stored, rowId) };
    case "bowtie":
      return { itemId: rowId, type, initialValues: bowtieFormFromStored(stored, rowId) };
    default:
      return null;
  }
}
