import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { FIXTURES } from "@/lib/ngn/fixtures";
import type { ItemType } from "@/lib/ngn/labels";
import {
  dropdownClozeItemSchema,
  dropdownRationaleItemSchema,
  dropdownTableItemSchema,
  matrixMultipleChoiceItemSchema,
  matrixMultipleResponseItemSchema,
} from "@/lib/ngn/schemas";
import { describeIssues } from "./issueMessages";

function issuesFor(schema: z.ZodType, type: ItemType, input: unknown) {
  const parsed = schema.safeParse(input);
  if (parsed.success) throw new Error("expected the input to be invalid");
  return describeIssues(parsed.error.issues, type);
}

const FALLBACK = /^Something in this item/;

describe("describeIssues (matrix)", () => {
  const mc = FIXTURES.matrix_multiple_choice.canonical;
  const mr = FIXTURES.matrix_multiple_response.edge;

  it("asks for at least two rows and two columns", () => {
    const issues = issuesFor(matrixMultipleChoiceItemSchema, "matrix_multiple_choice", {
      ...mc,
      content: { rows: mc.content.rows.slice(0, 1), columns: mc.content.columns.slice(0, 1) },
      answerKey: { rows: mc.answerKey.rows.slice(0, 1) },
    });
    expect(issues).toContainEqual({ field: "rows", message: "Add at least 2 rows." });
    expect(issues).toContainEqual({ field: "columns", message: "Add at least 2 columns." });
  });

  it("names the row and column that have no text", () => {
    const issues = issuesFor(matrixMultipleChoiceItemSchema, "matrix_multiple_choice", {
      ...mc,
      content: {
        rows: mc.content.rows.map((row, i) => (i === 1 ? { ...row, label: "" } : row)),
        columns: mc.content.columns.map((column, i) =>
          i === 2 ? { ...column, label: "" } : column,
        ),
      },
    });
    expect(issues).toContainEqual({ field: "rows.1.label", message: "Row 2 needs text." });
    expect(issues).toContainEqual({
      field: "columns.2.label",
      message: "Column 3 needs a heading.",
    });
  });

  it("asks for the correct column in a matrix multiple choice row with none chosen", () => {
    const rows = mc.answerKey.rows.map((row, i) =>
      i === 0 ? { ...row, correctColumnId: "" } : row,
    );
    expect(
      issuesFor(matrixMultipleChoiceItemSchema, "matrix_multiple_choice", {
        ...mc,
        answerKey: { rows },
      }),
    ).toContainEqual({ field: "rows.0.correct", message: "Choose the correct column for row 1." });
  });

  it("asks for a correct column in a matrix multiple response row with none marked", () => {
    const rows = mr.answerKey.rows.map((row, i) =>
      i === 1 ? { ...row, correctColumnIds: [] } : row,
    );
    expect(
      issuesFor(matrixMultipleResponseItemSchema, "matrix_multiple_response", {
        ...mr,
        answerKey: { rows },
      }),
    ).toContainEqual({
      field: "rows.1.correct",
      message: "Mark at least one correct column for row 2.",
    });
  });
});

describe("describeIssues (dropdown table)", () => {
  const table = FIXTURES.dropdown_table.canonical;

  it("asks for both headings", () => {
    const issues = issuesFor(dropdownTableItemSchema, "dropdown_table", {
      ...table,
      content: { ...table.content, columns: { label: "", dropdown: "" } },
    });
    expect(issues).toContainEqual({ field: "columnLabel", message: "Name the row heading." });
    expect(issues).toContainEqual({
      field: "dropdownLabel",
      message: "Name the drop-down heading.",
    });
  });

  it("names the row and choice that have no text", () => {
    const rows = table.content.rows.map((row, i) =>
      i === 0
        ? {
            ...row,
            label: "",
            choices: row.choices.map((c, j) => (j === 1 ? { ...c, label: "" } : c)),
          }
        : row,
    );
    const issues = issuesFor(dropdownTableItemSchema, "dropdown_table", {
      ...table,
      content: { ...table.content, rows },
    });
    expect(issues).toContainEqual({ field: "rows.0.label", message: "Row 1 needs text." });
    expect(issues).toContainEqual({
      field: "rows.0.choices.1.label",
      message: "Row 1, choice B needs text.",
    });
  });

  it("asks for the correct choice in a row with none chosen", () => {
    const rows = table.answerKey.rows.map((row, i) =>
      i === 2 ? { ...row, correctChoiceId: "" } : row,
    );
    expect(
      issuesFor(dropdownTableItemSchema, "dropdown_table", { ...table, answerKey: { rows } }),
    ).toContainEqual({ field: "rows.2.correct", message: "Choose the correct choice for row 3." });
  });
});

describe("describeIssues (dropdown cloze and rationale)", () => {
  const cloze = FIXTURES.dropdown_cloze.canonical;
  const triad = FIXTURES.dropdown_rationale.canonical;

  it("asks for a sentence when there is none", () => {
    expect(
      issuesFor(dropdownClozeItemSchema, "dropdown_cloze", {
        ...cloze,
        content: { ...cloze.content, tokens: [] },
      }),
    ).toContainEqual({ field: "sentence", message: "Write the sentence." });
  });

  it("says when a blank is missing from the sentence", () => {
    const tokens = cloze.content.tokens.filter(
      (token) => !(token.kind === "blank" && token.blankId === "blank_2"),
    );
    const issues = issuesFor(dropdownClozeItemSchema, "dropdown_cloze", {
      ...cloze,
      content: { ...cloze.content, tokens },
    });
    expect(issues).toContainEqual({
      field: "sentence",
      message: "Each blank must appear in the sentence exactly once.",
    });
  });

  it("names the blank and choice that have no text", () => {
    const blanks = cloze.content.blanks.map((entry, i) =>
      i === 1
        ? { ...entry, choices: entry.choices.map((c, j) => (j === 0 ? { ...c, label: "" } : c)) }
        : entry,
    );
    expect(
      issuesFor(dropdownClozeItemSchema, "dropdown_cloze", {
        ...cloze,
        content: { ...cloze.content, blanks },
      }),
    ).toContainEqual({
      field: "blanks.1.choices.0.label",
      message: "Blank 2, choice A needs text.",
    });
  });

  it("asks for the correct choice in a blank with none chosen", () => {
    const blanks = cloze.answerKey.blanks.map((key, i) =>
      i === 0 ? { ...key, correctChoiceId: "" } : key,
    );
    expect(
      issuesFor(dropdownClozeItemSchema, "dropdown_cloze", { ...cloze, answerKey: { blanks } }),
    ).toContainEqual({
      field: "blanks.0.correct",
      message: "Choose the correct choice for blank 1.",
    });
  });

  it("asks which blank is the anchor of a triad", () => {
    // The triad's answer key without its anchor.
    const answerKey = { blanks: triad.answerKey.blanks };
    expect(
      issuesFor(dropdownRationaleItemSchema, "dropdown_rationale", { ...triad, answerKey }),
    ).toContainEqual({ field: "anchorBlankId", message: "Choose which blank is the anchor." });
  });

  it("never falls back to the generic message for these problems", () => {
    const blanks = cloze.answerKey.blanks.map((key) => ({ ...key, correctChoiceId: "" }));
    const messages = issuesFor(dropdownClozeItemSchema, "dropdown_cloze", {
      ...cloze,
      stem: { kind: "markdown", value: "" },
      answerKey: { blanks },
    }).map((issue) => issue.message);
    expect(messages.some((message) => FALLBACK.test(message))).toBe(false);
  });
});
