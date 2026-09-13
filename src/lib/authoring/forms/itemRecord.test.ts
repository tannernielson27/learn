import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { sampleTrendEhr, sampleTrendItem } from "@/lib/ngn/fixtures/trend";
import type { ItemType } from "@/lib/ngn/labels";
import { validateItem } from "@/lib/ngn/validate";
import { bowtieFormFromStored, fromBowtieForm, toBowtieForm } from "./bowtie";
import { parseBowtieDraft } from "./bowtieDraft";
import {
  clozeFormFromStored,
  fromDropdownClozeForm,
  fromDropdownRationaleForm,
  toClozeForm,
} from "./cloze";
import { parseClozeDraft } from "./clozeDraft";
import {
  dragDropFormFromStored,
  fromDragdropClozeForm,
  fromDragdropRationaleForm,
  toDragDropForm,
} from "./dragdrop";
import { parseDragDropDraft } from "./dragdropDraft";
import {
  dropdownTableFormFromStored,
  fromDropdownTableForm,
  toDropdownTableForm,
} from "./dropdownTable";
import { parseDropdownTableDraft } from "./dropdownTableDraft";
import { ehrFormFromStored, emptyEhrForm, toEhrForm, type EhrFormValues } from "./ehr";
import {
  fromHighlightTableForm,
  fromHighlightTextForm,
  highlightTableFormFromStored,
  highlightTextFormFromStored,
  toHighlightTableForm,
  toHighlightTextForm,
} from "./highlight";
import { parseHighlightTableDraft, parseHighlightTextDraft } from "./highlightDraft";
import {
  fromMatrixMultipleChoiceForm,
  fromMatrixMultipleResponseForm,
  matrixFormFromStored,
  toMatrixForm,
} from "./matrix";
import { parseMatrixDraft } from "./matrixDraft";
import {
  fromMultipleChoiceForm,
  multipleChoiceFormFromStored,
  toMultipleChoiceForm,
} from "./multipleChoice";
import { parseMultipleChoiceDraft } from "./multipleChoiceDraft";
import {
  fromMultipleResponseForm,
  multipleResponseFormFromStored,
  toMultipleResponseForm,
} from "./multipleResponse";
import { parseMultipleResponseDraft } from "./multipleResponseDraft";
import {
  fromGroupingForm,
  groupingFormFromStored,
  toGroupingForm,
} from "./multipleResponseGrouping";
import { parseGroupingDraft } from "./multipleResponseGroupingDraft";
import {
  fromOrderedResponseForm,
  orderedResponseFormFromStored,
  toOrderedResponseForm,
} from "./orderedResponse";
import { parseOrderedResponseDraft } from "./orderedResponseDraft";

type FormWithRecord = { ehr?: EhrFormValues };

/** Each type's form functions, loosely typed so one table can drive them all. */
interface FormKit {
  to: (item: never) => FormWithRecord;
  from: (values: never) => unknown;
  stored: (stored: unknown, rowId: string) => FormWithRecord;
  draft: (input: unknown) => { ok: boolean };
}

const KITS: Record<ItemType, FormKit> = {
  multiple_choice: {
    to: toMultipleChoiceForm,
    from: fromMultipleChoiceForm,
    stored: multipleChoiceFormFromStored,
    draft: parseMultipleChoiceDraft,
  },
  multiple_response: {
    to: toMultipleResponseForm,
    from: fromMultipleResponseForm,
    stored: multipleResponseFormFromStored,
    draft: parseMultipleResponseDraft,
  },
  multiple_response_grouping: {
    to: toGroupingForm,
    from: fromGroupingForm,
    stored: groupingFormFromStored,
    draft: parseGroupingDraft,
  },
  matrix_multiple_choice: {
    to: toMatrixForm,
    from: fromMatrixMultipleChoiceForm,
    stored: matrixFormFromStored,
    draft: parseMatrixDraft,
  },
  matrix_multiple_response: {
    to: toMatrixForm,
    from: fromMatrixMultipleResponseForm,
    stored: matrixFormFromStored,
    draft: parseMatrixDraft,
  },
  dropdown_table: {
    to: toDropdownTableForm,
    from: fromDropdownTableForm,
    stored: dropdownTableFormFromStored,
    draft: parseDropdownTableDraft,
  },
  dropdown_cloze: {
    to: toClozeForm,
    from: fromDropdownClozeForm,
    stored: clozeFormFromStored,
    draft: parseClozeDraft,
  },
  dropdown_rationale: {
    to: toClozeForm,
    from: fromDropdownRationaleForm,
    stored: clozeFormFromStored,
    draft: parseClozeDraft,
  },
  highlight_text: {
    to: toHighlightTextForm,
    from: fromHighlightTextForm,
    stored: highlightTextFormFromStored,
    draft: parseHighlightTextDraft,
  },
  highlight_table: {
    to: toHighlightTableForm,
    from: fromHighlightTableForm,
    stored: highlightTableFormFromStored,
    draft: parseHighlightTableDraft,
  },
  dragdrop_cloze: {
    to: toDragDropForm,
    from: fromDragdropClozeForm,
    stored: dragDropFormFromStored,
    draft: parseDragDropDraft,
  },
  dragdrop_rationale: {
    to: toDragDropForm,
    from: fromDragdropRationaleForm,
    stored: dragDropFormFromStored,
    draft: parseDragDropDraft,
  },
  ordered_response: {
    to: toOrderedResponseForm,
    from: fromOrderedResponseForm,
    stored: orderedResponseFormFromStored,
    draft: parseOrderedResponseDraft,
  },
  bowtie: {
    to: toBowtieForm,
    from: fromBowtieForm,
    stored: bowtieFormFromStored,
    draft: parseBowtieDraft,
  },
};

const TYPES = Object.keys(KITS) as ItemType[];

function valid(input: unknown) {
  const result = validateItem(input);
  if (!result.ok) throw new Error(`fixture should be valid: ${JSON.stringify(input).slice(0, 80)}`);
  return result.value;
}

/** A record an author has only started: no age, no sex, no sections. */
const unfinishedRecord = {
  patientHeader: { setting: "Medical unit" },
  timePoints: [{ id: "t1", label: "0800" }],
  tabs: [],
};

describe("a patient record on a standalone item", () => {
  it("round-trips the Trend item through the matrix form with its record", () => {
    const item = valid(sampleTrendItem);
    const form = toMatrixForm(item as never);
    expect(form.ehr).toStrictEqual(toEhrForm(sampleTrendEhr));
    expect(valid(fromMatrixMultipleChoiceForm(form))).toEqual(item);
  });

  it.each(TYPES)("%s: round-trips an item with a record, holding it in the record form", (type) => {
    const kit = KITS[type];
    const item = valid({ ...FIXTURES[type].canonical, ehr: sampleTrendEhr });
    const form = kit.to(item as never);
    expect(form.ehr).toStrictEqual(toEhrForm(sampleTrendEhr));
    expect(valid(kit.from(form as never))).toEqual(item);
  });

  it.each(TYPES)("%s: an item without a record gets no record", (type) => {
    const kit = KITS[type];
    const form = kit.to(valid(FIXTURES[type].canonical) as never);
    expect(form).not.toHaveProperty("ehr");
    expect(kit.from(form as never)).not.toHaveProperty("ehr");
  });

  it.each(TYPES)("%s: reopening a draft keeps its unfinished record", (type) => {
    const kit = KITS[type];
    const draft = {
      ...FIXTURES[type].canonical,
      stem: { kind: "markdown", value: "" },
      ehr: unfinishedRecord,
    };
    expect(validateItem(draft).ok).toBe(false);
    expect(kit.stored(draft, "row_id").ehr).toStrictEqual(ehrFormFromStored(unfinishedRecord));
  });

  it.each(TYPES)("%s: saves a draft with an unfinished record, and nothing extra", (type) => {
    const kit = KITS[type];
    const form = kit.to(valid(FIXTURES[type].canonical) as never);
    expect(kit.draft({ ...form, ehr: emptyEhrForm() }).ok).toBe(true);
    expect(kit.draft({ ...form, ehr: { ...emptyEhrForm(), script: "x" } }).ok).toBe(false);
  });

  it.each(TYPES)("%s: reopening a draft keeps its clinical judgment step", (type) => {
    const kit = KITS[type];
    const draft = { ...FIXTURES[type].canonical, stem: { kind: "markdown", value: "" } };
    expect(kit.stored({ ...draft, cjmmStep: 3 }, "row_id")).toMatchObject({ cjmmStep: 3 });
    expect(kit.stored({ ...draft, cjmmStep: 9 }, "row_id")).not.toHaveProperty("cjmmStep");
  });

  it("does not publish an item whose record is unfinished, and says it is the record", () => {
    const form = toMatrixForm(valid(sampleTrendItem) as never);
    const result = validateItem(fromMatrixMultipleChoiceForm({ ...form, ehr: emptyEhrForm() }));
    expect(result.ok).toBe(false);
  });
});
