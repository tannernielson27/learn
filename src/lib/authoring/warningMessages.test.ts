import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { editorWarnings, RATIONALE_FIELD, rationaleProblem, warningField } from "./warningMessages";

const parse = (input: unknown): Item => itemSchema.parse(input);

describe("warningField", () => {
  it.each([
    [["rationale", "general"], "multiple_choice", RATIONALE_FIELD],
    [["content", "options", 3, "rationale"], "multiple_response", "options.3.rationale"],
    [["stem"], "bowtie", "stem"],
    [["answerKey", "correctOptionIds"], "multiple_response", "correctOptionIds"],
    [["answerKey", "correctSpanIds"], "highlight_text", "correctSpanIds"],
    [["content", "options", 2, "label"], "multiple_choice", "options.2.label"],
    [
      ["content", "rows", 0, "options", 1, "label"],
      "multiple_response_grouping",
      "rows.0.options.1.label",
    ],
    [["content", "columns", 1, "label"], "matrix_multiple_choice", "columns.1.label"],
    [["content", "rows", 0, "choices", 1, "label"], "dropdown_table", "rows.0.choices.1.label"],
    [
      ["content", "blanks", 0, "choices", 1, "label"],
      "dropdown_rationale",
      "blanks.0.choices.1.label",
    ],
    [["content", "bank", 1, "label"], "dragdrop_cloze", "bank.1.label"],
    [["content", "items", 1, "label"], "ordered_response", "steps.1.label"],
    [["content", "parameters", 1, "label"], "bowtie", "parameters.1.label"],
  ] as const)("%j on %s -> %s", (path, type, field) => {
    expect(warningField([...path], type)).toBe(field);
  });
});

describe("editorWarnings", () => {
  it("lists advisory warnings with the editor field each points at", () => {
    const base = FIXTURES.multiple_response.canonical;
    const item = parse({
      ...base,
      answerKey: { correctOptionIds: base.content.options.map((option) => option.id) },
    });
    expect(editorWarnings(item)).toEqual([
      {
        field: "correctOptionIds",
        message:
          "Every option is marked correct. Leave at least one wrong option to choose against.",
      },
    ]);
  });

  it("leaves a missing rationale out: it is a problem to fix, not advice", () => {
    const item = parse({ ...FIXTURES.multiple_choice.canonical, rationale: {} });
    expect(editorWarnings(item)).toEqual([]);
  });

  it("leaves out the highlight share, which the highlight editors show beside the phrases", () => {
    const item = parse({
      ...FIXTURES.highlight_text.canonical,
      answerKey: { correctSpanIds: ["sp_hr", "sp_bp", "sp_sat", "sp_urine"] },
    });
    expect(editorWarnings(item)).toEqual([]);
  });

  it("keeps one message per field", () => {
    const base = FIXTURES.bowtie.canonical;
    const same = base.content.actions[0].label;
    const item = parse({
      ...base,
      content: {
        ...base.content,
        actions: base.content.actions.map((a, i) => (i > 0 && i < 3 ? { ...a, label: same } : a)),
      },
    });
    expect(editorWarnings(item).map((w) => w.field)).toEqual([
      "actions.1.label",
      "actions.2.label",
    ]);
  });
});

describe("rationaleProblem", () => {
  it("names the rationale field when the form's rationale is blank", () => {
    expect(rationaleProblem(undefined)).toEqual({
      field: RATIONALE_FIELD,
      message: "Write the rationale. An item needs one before it can be published.",
    });
    expect(rationaleProblem({})).not.toBeNull();
    expect(rationaleProblem({ general: { value: "  " } })).not.toBeNull();
  });

  it("is null once a rationale is written", () => {
    expect(rationaleProblem({ general: { value: "Because." } })).toBeNull();
  });
});
