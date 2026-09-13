import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleResponseGroupingItemSchema } from "@/lib/ngn/schemas";
import {
  emptyGroupingForm,
  groupingFormFromStored,
  toGroupingForm,
} from "./multipleResponseGrouping";
import { parseGroupingDraft } from "./multipleResponseGroupingDraft";

const ROW_ID = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const DRAFT_ERROR =
  "The draft could not be saved because part of it is not valid. Reload the page and try again.";
const complete = () =>
  toGroupingForm(
    multipleResponseGroupingItemSchema.parse(FIXTURES.multiple_response_grouping.canonical),
  );

describe("groupingFormFromStored", () => {
  it("opens a complete stored item exactly as the form mapping would", () => {
    const item = multipleResponseGroupingItemSchema.parse(FIXTURES.multiple_response_grouping.edge);
    expect(groupingFormFromStored(item, ROW_ID)).toEqual(toGroupingForm(item));
  });

  it("opens a brand-new draft as a blank form named by its row", () => {
    const fresh = {
      type: "multiple_response_grouping",
      stem: { kind: "markdown", value: "" },
      answerKey: {},
      scoring: {},
      tags: [],
      version: 1,
    };
    expect(groupingFormFromStored(fresh, ROW_ID)).toEqual(emptyGroupingForm(ROW_ID));
  });

  it("keeps a half-written draft's groups, options and marks", () => {
    const partial = {
      type: "multiple_response_grouping",
      stem: { kind: "markdown", value: "For each system, select the findings." },
      content: {
        rows: [
          {
            id: "row_1",
            label: "Respiratory",
            options: [
              { id: "row_1_a", label: "Deep, rapid respirations" },
              { id: "row_1_b", label: "" },
            ],
          },
        ],
      },
      answerKey: { rows: [{ rowId: "row_1", correctOptionIds: ["row_1_a"] }] },
      tags: [],
      version: 1,
    };
    const form = groupingFormFromStored(partial, ROW_ID);
    expect(form.stem).toBe("For each system, select the findings.");
    expect(form.rows).toEqual([
      {
        id: "row_1",
        label: "Respiratory",
        options: [
          { id: "row_1_a", label: "Deep, rapid respirations", correct: true },
          { id: "row_1_b", label: "", correct: false },
        ],
      },
    ]);
  });

  it("ignores malformed pieces instead of throwing", () => {
    const junk = { stem: [], content: { rows: [{ label: 3 }, "x"] }, answerKey: { rows: "no" } };
    expect(groupingFormFromStored(junk, ROW_ID)).toEqual(emptyGroupingForm(ROW_ID));
    expect(groupingFormFromStored(null, ROW_ID)).toEqual(emptyGroupingForm(ROW_ID));
  });
});

describe("parseGroupingDraft", () => {
  it("accepts a blank new form, because drafts may be incomplete", () => {
    expect(parseGroupingDraft(emptyGroupingForm(ROW_ID)).ok).toBe(true);
  });

  it("accepts a complete form unchanged", () => {
    const form = complete();
    expect(parseGroupingDraft(form)).toEqual({ ok: true, values: form });
  });

  const blankRow = (index: number, optionCount = 2) => ({
    id: `row_${index}`,
    label: "",
    options: Array.from({ length: optionCount }, (_, i) => ({
      id: `row_${index}_${i}`,
      label: "",
      correct: false,
    })),
  });

  it.each([
    ["not an object", "rows"],
    ["rows not a list", { ...emptyGroupingForm(ROW_ID), rows: {} }],
    [
      "too many groups",
      { ...emptyGroupingForm(ROW_ID), rows: Array.from({ length: 9 }, (_, i) => blankRow(i)) },
    ],
    ["a group with too many options", { ...emptyGroupingForm(ROW_ID), rows: [blankRow(0, 5)] }],
    [
      "a group name beyond the size limit",
      { ...emptyGroupingForm(ROW_ID), rows: [{ ...blankRow(0), label: "a".repeat(2_001) }] },
    ],
    ["an unknown extra field", { ...emptyGroupingForm(ROW_ID), answerKey: { rows: [] } }],
  ])("rejects %s", (_name, input) => {
    expect(parseGroupingDraft(input)).toEqual({ ok: false, error: DRAFT_ERROR });
  });
});
