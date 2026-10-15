import type { ItemType } from "@/lib/ngn/labels";
import { fromBowtieForm } from "./bowtie";
import { parseBowtieDraft } from "./bowtieDraft";
import { fromDropdownClozeForm, fromDropdownRationaleForm } from "./cloze";
import { parseClozeDraft } from "./clozeDraft";
import type { DraftParseResult } from "./draft";
import { fromDragdropClozeForm, fromDragdropRationaleForm } from "./dragdrop";
import { parseDragDropDraft } from "./dragdropDraft";
import { fromDropdownTableForm } from "./dropdownTable";
import { parseDropdownTableDraft } from "./dropdownTableDraft";
import { fromHighlightTableForm, fromHighlightTextForm } from "./highlight";
import { parseHighlightTableDraft, parseHighlightTextDraft } from "./highlightDraft";
import { fromMatrixMultipleChoiceForm, fromMatrixMultipleResponseForm } from "./matrix";
import { parseMatrixDraft } from "./matrixDraft";
import { fromMultipleChoiceForm } from "./multipleChoice";
import { parseMultipleChoiceDraft } from "./multipleChoiceDraft";
import { fromMultipleResponseForm } from "./multipleResponse";
import { parseMultipleResponseDraft } from "./multipleResponseDraft";
import { fromGroupingForm } from "./multipleResponseGrouping";
import { parseGroupingDraft } from "./multipleResponseGroupingDraft";
import { fromOrderedResponseForm } from "./orderedResponse";
import { parseOrderedResponseDraft } from "./orderedResponseDraft";

/**
 * Each type's form, read back on the server (#347): its strict draft check, then the item input
 * the editor builds from it. The same pair the item page's Save draft uses
 * (`src/app/author/items/[itemId]/actions.ts`), so a form saved anywhere is read the same way.
 */
export interface FormCodec {
  parse: (values: unknown) => DraftParseResult<unknown>;
  toInput: (values: unknown) => unknown;
}

function codec<Values>(
  parse: (values: unknown) => DraftParseResult<Values>,
  toInput: (values: Values) => unknown,
): FormCodec {
  return { parse, toInput: (values) => toInput(values as Values) };
}

export const FORM_CODECS: Record<ItemType, FormCodec> = {
  multiple_choice: codec(parseMultipleChoiceDraft, fromMultipleChoiceForm),
  multiple_response: codec(parseMultipleResponseDraft, fromMultipleResponseForm),
  multiple_response_grouping: codec(parseGroupingDraft, fromGroupingForm),
  matrix_multiple_choice: codec(parseMatrixDraft, fromMatrixMultipleChoiceForm),
  matrix_multiple_response: codec(parseMatrixDraft, fromMatrixMultipleResponseForm),
  dropdown_cloze: codec(parseClozeDraft, fromDropdownClozeForm),
  dropdown_rationale: codec(parseClozeDraft, fromDropdownRationaleForm),
  dropdown_table: codec(parseDropdownTableDraft, fromDropdownTableForm),
  highlight_text: codec(parseHighlightTextDraft, fromHighlightTextForm),
  highlight_table: codec(parseHighlightTableDraft, fromHighlightTableForm),
  dragdrop_cloze: codec(parseDragDropDraft, fromDragdropClozeForm),
  dragdrop_rationale: codec(parseDragDropDraft, fromDragdropRationaleForm),
  ordered_response: codec(parseOrderedResponseDraft, fromOrderedResponseForm),
  bowtie: codec(parseBowtieDraft, fromBowtieForm),
};

/** The form as the item input it describes, or why it is not that type's form. */
export function inputFromForm(type: ItemType, values: unknown): DraftParseResult<unknown> {
  const { parse, toInput } = FORM_CODECS[type];
  const draft = parse(values);
  return draft.ok ? { ok: true, values: toInput(draft.values) } : draft;
}
