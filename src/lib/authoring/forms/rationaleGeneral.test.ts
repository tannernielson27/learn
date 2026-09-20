import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { dropdownTableItemSchema, multipleResponseGroupingItemSchema } from "@/lib/ngn/schemas";
import {
  dropdownTableFormFromStored,
  emptyDropdownTableForm,
  fromDropdownTableForm,
  toDropdownTableForm,
} from "./dropdownTable";
import { parseDropdownTableDraft } from "./dropdownTableDraft";
import {
  emptyGroupingForm,
  fromGroupingForm,
  groupingFormFromStored,
  toGroupingForm,
} from "./multipleResponseGrouping";
import { parseGroupingDraft } from "./multipleResponseGroupingDraft";

// Grouping and drop-down table forms once carried their rationale through untouched, with no way
// to write one. Publishing now needs a general rationale, so both forms edit it like every other.
const perElement = { row_x: { kind: "markdown" as const, value: "Kept as it was." } };

describe("the general rationale on grouping and drop-down table forms", () => {
  it("reads it into the form and writes it back, keeping per-element rationale", () => {
    const table = dropdownTableItemSchema.parse({
      ...FIXTURES.dropdown_table.canonical,
      rationale: { ...FIXTURES.dropdown_table.canonical.rationale, perElement },
    });
    const tableForm = toDropdownTableForm(table);
    expect(tableForm.rationaleGeneral).toBe(table.rationale.general?.value);
    expect(
      fromDropdownTableForm({ ...tableForm, rationaleGeneral: "New words." }).rationale,
    ).toEqual({ general: { kind: "markdown", value: "New words." }, perElement });

    const grouping = multipleResponseGroupingItemSchema.parse(
      FIXTURES.multiple_response_grouping.canonical,
    );
    const groupingForm = toGroupingForm(grouping);
    expect(groupingForm.rationaleGeneral).toBe(grouping.rationale.general?.value);
    expect(fromGroupingForm(groupingForm).rationale).toEqual(grouping.rationale);
  });

  it("leaves a blank rationale out of the item", () => {
    expect(fromDropdownTableForm(emptyDropdownTableForm("t")).rationale).toEqual({});
    expect(
      fromGroupingForm({ ...emptyGroupingForm("g"), rationaleGeneral: "  " }).rationale,
    ).toEqual({});
  });

  it("opens a stored draft's rationale", () => {
    const stored = { id: "d", rationale: { general: { kind: "markdown", value: "Why." } } };
    expect(dropdownTableFormFromStored(stored, "d").rationaleGeneral).toBe("Why.");
    expect(groupingFormFromStored(stored, "d").rationaleGeneral).toBe("Why.");
    expect(dropdownTableFormFromStored({ id: "d" }, "d").rationaleGeneral).toBe("");
  });

  it("saves it in a draft", () => {
    const table = { ...emptyDropdownTableForm("t"), rationaleGeneral: "Why." };
    expect(parseDropdownTableDraft(table)).toEqual({ ok: true, values: table });
    const grouping = { ...emptyGroupingForm("g"), rationaleGeneral: "Why." };
    expect(parseGroupingDraft(grouping)).toEqual({ ok: true, values: grouping });
  });
});
