import { describe, expect, it } from "vitest";
import { itemSchema } from "../schemas";
import {
  fromMatrixMultipleChoiceDraft,
  fromMatrixMultipleResponseDraft,
  fromMultipleChoiceDraft,
  fromMultipleResponseDraft,
  fromMultipleResponseGroupingDraft,
  type MatrixMultipleChoiceDraft,
} from "./selection";

// Fictional content, shaped like the owner's samples (ADR 0008); none of it is copied from them.

const codes = (reasons: { code: string }[]) => reasons.map((reason) => reason.code);

describe("multiple_response from a select-N step with * keys (Ectopic step 1 shape)", () => {
  const draft = {
    type: "multiple_response" as const,
    stem: "The nurse reviews the client’s assessment. Which 4 findings require immediate follow-up?",
    statedScoring: "Scoring Rule: +/-",
    options: [
      { text: "Heart rate 124 beats/min*" },
      { text: "Temperature 37.0 °C (98.6 °F)" },
      { text: "Blood pressure 88/54 mm Hg *" },
      { text: "Last menstrual period 7 weeks ago" },
      { text: "*Right shoulder pain" },
      { text: "Mild nausea" },
      { text: "  Pale,   cool skin * " },
      { text: "Pain rated 2 of 10" },
    ],
  };

  it("becomes a select-N item with the four marked keys", () => {
    const { item, reasons } = fromMultipleResponseDraft(draft);
    expect(reasons).toEqual([]);
    expect(item.content).toMatchObject({ variant: "select_n", n: 4 });
    expect(item.answerKey.correctOptionIds).toEqual(["opt_a", "opt_c", "opt_e", "opt_g"]);
    expect(item.scoring).toEqual({ model: "plus_minus", maxPoints: 4 });
    expect(itemSchema.safeParse(item).success).toBe(true);
  });

  it("keeps the text word for word, apart from marks, quotes and spacing", () => {
    const { item } = fromMultipleResponseDraft(draft);
    expect(item.stem.value).toBe(
      "The nurse reviews the client's assessment. Which 4 findings require immediate follow-up?",
    );
    expect(item.content.options.map((option) => option.label)).toEqual([
      "Heart rate 124 beats/min",
      "Temperature 37.0 °C (98.6 °F)",
      "Blood pressure 88/54 mm Hg",
      "Last menstrual period 7 weeks ago",
      "Right shoulder pain",
      "Mild nausea",
      "Pale, cool skin",
      "Pain rated 2 of 10",
    ]);
  });

  it("flags a select-N question whose marks do not match its count", () => {
    const short = {
      ...draft,
      options: draft.options.map((o, i) => (i === 0 ? { text: "Heart rate 124" } : o)),
    };
    const { item, reasons } = fromMultipleResponseDraft(short);
    expect(codes(reasons)).toEqual(["needs_fix"]);
    expect(reasons[0].message).toMatch(/asks for 4 answers, but the source marks 3/);
    expect(itemSchema.safeParse(item).success).toBe(false);
  });

  it("is needs_answer with an empty key when nothing is marked", () => {
    const unmarked = {
      ...draft,
      options: draft.options.map((o) => ({ text: o.text.replace(/\*/g, "") })),
    };
    const { item, reasons } = fromMultipleResponseDraft(unmarked);
    expect(codes(reasons)).toEqual(["needs_answer"]);
    expect(item.answerKey.correctOptionIds).toEqual([]);
    expect(item.scoring.maxPoints).toBe(1);
  });

  it("is select all that apply when the question says so", () => {
    const { item } = fromMultipleResponseDraft({
      ...draft,
      stem: "Which findings require follow-up?",
      instructions: "Select all that apply.",
    });
    expect(item.content.variant).toBe("sata");
    expect(item.content).not.toHaveProperty("n");
    expect(item.instructions).toBe("Select all that apply.");
  });
});

describe("multiple_choice", () => {
  const options = [
    { text: "Elevate the legs" },
    { text: "Notify the provider", rationale: "Bleeding needs the provider now." },
    { text: "Offer fluids" },
    { text: "Recheck in an hour" },
  ];
  const base = { type: "multiple_choice" as const, stem: "Which action comes first?", options };

  it("reads an 'Answer: ✅ B.' line", () => {
    const { item, reasons } = fromMultipleChoiceDraft({ ...base, answer: "Answer: ✅ B." });
    expect(reasons).toEqual([]);
    expect(item.answerKey.correctOptionId).toBe("opt_b");
    expect(item.rationale?.perElement).toEqual({
      opt_b: { kind: "markdown", value: "Bleeding needs the provider now." },
    });
    expect(itemSchema.safeParse(item).success).toBe(true);
  });

  it("is needs_answer when there is no key", () => {
    const { item, reasons } = fromMultipleChoiceDraft(base);
    expect(codes(reasons)).toEqual(["needs_answer"]);
    expect(item.answerKey.correctOptionId).toBe("");
    expect(itemSchema.safeParse(item).success).toBe(false);
  });

  it("flags two marked options", () => {
    const marked = {
      ...base,
      options: options.map((o, i) => (i < 2 ? { text: `${o.text} *` } : o)),
    };
    const { item, reasons } = fromMultipleChoiceDraft(marked);
    expect(codes(reasons)).toEqual(["needs_fix"]);
    expect(item.answerKey.correctOptionId).toBe("");
  });

  it("flags a printed key that names no option, and does not also ask for one", () => {
    const { reasons } = fromMultipleChoiceDraft({ ...base, answer: "Answer: F" });
    expect(codes(reasons)).toEqual(["needs_fix"]);
    expect(reasons[0].path).toEqual(["answer"]);
  });

  it("flags marks and a printed key that disagree", () => {
    const marked = {
      ...base,
      options: options.map((o, i) => (i === 0 ? { text: `${o.text} *` } : o)),
    };
    const { reasons } = fromMultipleChoiceDraft({ ...marked, answer: "B" });
    expect(codes(reasons)).toEqual(["needs_fix"]);
  });

  it("accepts marks and a printed key that agree", () => {
    const marked = {
      ...base,
      options: options.map((o, i) => (i === 1 ? { text: `✅ ${o.text}` } : o)),
    };
    const { item, reasons } = fromMultipleChoiceDraft({ ...marked, answer: "B" });
    expect(reasons).toEqual([]);
    expect(item.answerKey.correctOptionId).toBe("opt_b");
  });

  it("keeps the type's rule and flags a stated rule the type cannot use", () => {
    const { item, reasons } = fromMultipleChoiceDraft({
      ...base,
      answer: "B",
      statedScoring: "Scoring Rule: +/-",
    });
    expect(item.scoring.model).toBe("zero_one");
    expect(codes(reasons)).toEqual(["scoring_conflict"]);
    expect(reasons[0].message).toMatch(/cannot use/);
  });

  it("flags a stated rule it does not know", () => {
    const { reasons } = fromMultipleChoiceDraft({
      ...base,
      answer: "B",
      statedScoring: "Partial credit",
    });
    expect(codes(reasons)).toEqual(["scoring_conflict"]);
    expect(reasons[0].message).toMatch(/does not know/);
  });

  it("ignores a blank stated rule, rationale and instructions", () => {
    const { item, reasons } = fromMultipleChoiceDraft({
      ...base,
      answer: "B",
      statedScoring: "  ",
      rationale: "   ",
      instructions: " ",
    });
    expect(reasons).toEqual([]);
    expect(item).not.toHaveProperty("instructions");
    expect(item.rationale).toEqual({ perElement: expect.any(Object) });
  });
});

describe("multiple_response_grouping", () => {
  const draft = {
    type: "multiple_response_grouping" as const,
    stem: "For each system, select the findings that support dehydration.",
    rows: [
      { label: "Cardiovascular", options: [{ text: "Heart rate 120 *" }, { text: "BP 130/80" }] },
      {
        label: "Skin",
        options: [{ text: "Dry mucosa *" }, { text: "Edema" }, { text: "Tenting *" }],
      },
    ],
  };

  it("keys each row from its marks", () => {
    const { item, reasons } = fromMultipleResponseGroupingDraft(draft);
    expect(reasons).toEqual([]);
    expect(item.answerKey.rows).toEqual([
      { rowId: "row_1", correctOptionIds: ["row_1_a"] },
      { rowId: "row_2", correctOptionIds: ["row_2_a", "row_2_c"] },
    ]);
    expect(item.scoring).toEqual({ model: "plus_minus", maxPoints: 3 });
    expect(itemSchema.safeParse(item).success).toBe(true);
  });

  it("is needs_answer when no row is marked", () => {
    const unmarked = {
      ...draft,
      rows: draft.rows.map((row) => ({
        ...row,
        options: row.options.map((o) => ({ text: o.text.replace(" *", "") })),
      })),
    };
    const { item, reasons } = fromMultipleResponseGroupingDraft(unmarked);
    expect(codes(reasons)).toEqual(["needs_answer"]);
    expect(item.answerKey.rows).toEqual([]);
  });

  it("flags a row with no mark when others have one", () => {
    const partial = {
      ...draft,
      rows: [draft.rows[0], { label: "Skin", options: [{ text: "Dry" }, { text: "Edema" }] }],
    };
    const { reasons } = fromMultipleResponseGroupingDraft(partial);
    expect(reasons).toEqual([
      { code: "needs_fix", message: "Row 2 has no marked answer.", path: ["rows", 1] },
    ]);
  });
});

describe("matrix_multiple_choice from * cells (Tuberculosis step 2 shape)", () => {
  const draft: MatrixMultipleChoiceDraft = {
    type: "matrix_multiple_choice",
    stem: "For each finding, indicate whether it is consistent with tuberculosis or with pneumonia.",
    statedScoring: "Scoring Rule: 0/1",
    columns: ["Tuberculosis", "Pneumonia"],
    rows: [
      { text: "Night sweats for 3 weeks", cells: ["*", ""] },
      { text: "Sudden fever with chills", cells: ["", "*"] },
      { text: "Weight loss of 4 kg", cells: ["✅", ""] },
      {
        text: "Lobar consolidation on x-ray",
        cells: ["", "X"],
        rationale: "Typical of pneumonia.",
      },
    ],
  };

  it("becomes a matrix with one keyed column per row", () => {
    const { item, reasons } = fromMatrixMultipleChoiceDraft(draft);
    expect(reasons).toEqual([]);
    expect(item.content.columns).toEqual([
      { id: "col_1", label: "Tuberculosis" },
      { id: "col_2", label: "Pneumonia" },
    ]);
    expect(item.answerKey.rows).toEqual([
      { rowId: "row_1", correctColumnId: "col_1" },
      { rowId: "row_2", correctColumnId: "col_2" },
      { rowId: "row_3", correctColumnId: "col_1" },
      { rowId: "row_4", correctColumnId: "col_2" },
    ]);
    expect(item.scoring).toEqual({ model: "zero_one", maxPoints: 4 });
    expect(item.rationale?.perElement).toHaveProperty("row_4");
    expect(itemSchema.safeParse(item).success).toBe(true);
  });

  it("an unmarked matrix (Malnutrition shape) is needs_answer, with no key invented", () => {
    const unmarked = { ...draft, rows: draft.rows.map((row) => ({ ...row, cells: ["", ""] })) };
    const { item, reasons } = fromMatrixMultipleChoiceDraft(unmarked);
    expect(codes(reasons)).toEqual(["needs_answer"]);
    expect(item.answerKey.rows).toEqual([]);
    expect(itemSchema.safeParse(item).success).toBe(false);
  });

  it("flags a row with two marks, and one with none", () => {
    const rows = [
      { text: "Night sweats", cells: ["*", "*"] },
      { text: "Fever", cells: ["", ""] },
      ...draft.rows.slice(2),
    ];
    const { item, reasons } = fromMatrixMultipleChoiceDraft({ ...draft, rows });
    expect(codes(reasons)).toEqual(["needs_fix", "needs_fix"]);
    expect(reasons.map((reason) => reason.path)).toEqual([
      ["rows", 0, "cells"],
      ["rows", 1, "cells"],
    ]);
    expect(item.answerKey.rows).toHaveLength(2);
  });

  it("flags a row whose cells do not line up with the columns", () => {
    const rows = [{ text: "Night sweats", cells: ["*"] }, ...draft.rows.slice(1)];
    const { reasons } = fromMatrixMultipleChoiceDraft({ ...draft, rows });
    expect(reasons[0]).toEqual({
      code: "needs_fix",
      message: "Row 1 has 1 cells for 2 columns.",
      path: ["rows", 0, "cells"],
    });
  });
});

describe("matrix_multiple_response", () => {
  const draft = {
    type: "matrix_multiple_response" as const,
    stem: "For each medication, select every parameter to monitor.",
    columns: ["INR", "Potassium", "Weight"],
    rows: [
      { text: "Warfarin", cells: ["*", "", ""] },
      { text: "Furosemide", cells: ["", "*", "*"] },
    ],
  };

  it("keys every marked column in each row", () => {
    const { item, reasons } = fromMatrixMultipleResponseDraft(draft);
    expect(reasons).toEqual([]);
    expect(item.answerKey.rows).toEqual([
      { rowId: "row_1", correctColumnIds: ["col_1"] },
      { rowId: "row_2", correctColumnIds: ["col_2", "col_3"] },
    ]);
    expect(item.scoring).toEqual({ model: "plus_minus", maxPoints: 3 });
    expect(itemSchema.safeParse(item).success).toBe(true);
  });

  it("is needs_answer when unmarked and flags a row left unmarked", () => {
    const none = fromMatrixMultipleResponseDraft({
      ...draft,
      rows: draft.rows.map((row) => ({ ...row, cells: ["", "", ""] })),
    });
    expect(codes(none.reasons)).toEqual(["needs_answer"]);
    expect(none.item.scoring.maxPoints).toBe(1);

    const one = fromMatrixMultipleResponseDraft({
      ...draft,
      rows: [draft.rows[0], { text: "Furosemide", cells: ["", "", ""] }],
    });
    expect(codes(one.reasons)).toEqual(["needs_fix"]);
  });
});
