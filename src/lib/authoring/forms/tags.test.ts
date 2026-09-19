import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import type { ItemType } from "@/lib/ngn/labels";
import { itemSchema } from "@/lib/ngn/schemas";
import { TAG_LIMITS } from "@/lib/ngn/tags";
import { bowtieFormFromStored, fromBowtieForm } from "./bowtie";
import { parseBowtieDraft } from "./bowtieDraft";
import { clozeFormFromStored, fromDropdownClozeForm, fromDropdownRationaleForm } from "./cloze";
import { parseClozeDraft } from "./clozeDraft";
import {
  dragDropFormFromStored,
  fromDragdropClozeForm,
  fromDragdropRationaleForm,
} from "./dragdrop";
import { parseDragDropDraft } from "./dragdropDraft";
import type { DraftParseResult } from "./draft";
import { dropdownTableFormFromStored, fromDropdownTableForm } from "./dropdownTable";
import { parseDropdownTableDraft } from "./dropdownTableDraft";
import {
  fromHighlightTableForm,
  fromHighlightTextForm,
  highlightTableFormFromStored,
  highlightTextFormFromStored,
} from "./highlight";
import { parseHighlightTableDraft, parseHighlightTextDraft } from "./highlightDraft";
import {
  fromMatrixMultipleChoiceForm,
  fromMatrixMultipleResponseForm,
  matrixFormFromStored,
} from "./matrix";
import { parseMatrixDraft } from "./matrixDraft";
import { fromMultipleChoiceForm, multipleChoiceFormFromStored } from "./multipleChoice";
import { parseMultipleChoiceDraft } from "./multipleChoiceDraft";
import { fromMultipleResponseForm, multipleResponseFormFromStored } from "./multipleResponse";
import { parseMultipleResponseDraft } from "./multipleResponseDraft";
import { fromGroupingForm, groupingFormFromStored } from "./multipleResponseGrouping";
import { parseGroupingDraft } from "./multipleResponseGroupingDraft";
import { fromOrderedResponseForm, orderedResponseFormFromStored } from "./orderedResponse";
import { parseOrderedResponseDraft } from "./orderedResponseDraft";

interface FormKit {
  fromStored: (stored: unknown, rowId: string) => { tags: string[]; cjmmStep?: number };
  toInput: (values: never) => unknown;
  parseDraft: (input: unknown) => DraftParseResult<unknown>;
}

const KITS: Record<ItemType, FormKit> = {
  multiple_choice: {
    fromStored: multipleChoiceFormFromStored,
    toInput: fromMultipleChoiceForm,
    parseDraft: parseMultipleChoiceDraft,
  },
  multiple_response: {
    fromStored: multipleResponseFormFromStored,
    toInput: fromMultipleResponseForm,
    parseDraft: parseMultipleResponseDraft,
  },
  multiple_response_grouping: {
    fromStored: groupingFormFromStored,
    toInput: fromGroupingForm,
    parseDraft: parseGroupingDraft,
  },
  matrix_multiple_choice: {
    fromStored: matrixFormFromStored,
    toInput: fromMatrixMultipleChoiceForm,
    parseDraft: parseMatrixDraft,
  },
  matrix_multiple_response: {
    fromStored: matrixFormFromStored,
    toInput: fromMatrixMultipleResponseForm,
    parseDraft: parseMatrixDraft,
  },
  dropdown_table: {
    fromStored: dropdownTableFormFromStored,
    toInput: fromDropdownTableForm,
    parseDraft: parseDropdownTableDraft,
  },
  dropdown_cloze: {
    fromStored: clozeFormFromStored,
    toInput: fromDropdownClozeForm,
    parseDraft: parseClozeDraft,
  },
  dropdown_rationale: {
    fromStored: clozeFormFromStored,
    toInput: fromDropdownRationaleForm,
    parseDraft: parseClozeDraft,
  },
  highlight_text: {
    fromStored: highlightTextFormFromStored,
    toInput: fromHighlightTextForm,
    parseDraft: parseHighlightTextDraft,
  },
  highlight_table: {
    fromStored: highlightTableFormFromStored,
    toInput: fromHighlightTableForm,
    parseDraft: parseHighlightTableDraft,
  },
  dragdrop_cloze: {
    fromStored: dragDropFormFromStored,
    toInput: fromDragdropClozeForm,
    parseDraft: parseDragDropDraft,
  },
  dragdrop_rationale: {
    fromStored: dragDropFormFromStored,
    toInput: fromDragdropRationaleForm,
    parseDraft: parseDragDropDraft,
  },
  ordered_response: {
    fromStored: orderedResponseFormFromStored,
    toInput: fromOrderedResponseForm,
    parseDraft: parseOrderedResponseDraft,
  },
  bowtie: {
    fromStored: bowtieFormFromStored,
    toInput: fromBowtieForm,
    parseDraft: parseBowtieDraft,
  },
};

const ROW_ID = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const TAGS = ["Physiological Adaptation", "sepsis", "Management of Care"];
const types = Object.keys(KITS) as ItemType[];

describe("tags in every item form", () => {
  it.each(types)("round-trip with the CJMM step through the %s form", (type) => {
    const kit = KITS[type];
    const stored = { ...FIXTURES[type].canonical, tags: TAGS, cjmmStep: 4 };
    const values = kit.fromStored(stored, ROW_ID);
    expect(values.tags).toEqual(TAGS);
    expect(values.cjmmStep).toBe(4);

    const item = itemSchema.parse(kit.toInput(values as never));
    expect(item.tags).toEqual(TAGS);
    expect(item.cjmmStep).toBe(4);
  });

  it.each(types)("are bounded when a %s draft is saved", (type) => {
    const kit = KITS[type];
    const values = kit.fromStored(FIXTURES[type].canonical, ROW_ID);
    const atLimit = Array.from({ length: TAG_LIMITS.count }, (_, i) => `topic ${i}`);
    expect(kit.parseDraft({ ...values, tags: atLimit }).ok).toBe(true);
    expect(kit.parseDraft({ ...values, tags: [...atLimit, "one more"] }).ok).toBe(false);
    expect(kit.parseDraft({ ...values, tags: ["x".repeat(TAG_LIMITS.length + 1)] }).ok).toBe(false);
  });
});
